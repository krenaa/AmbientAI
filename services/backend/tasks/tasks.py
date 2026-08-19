import logging
import time
import requests
from celery import shared_task
from django.conf import settings
from .models import AgentTask, TaskExecutionLog, TaskStatus

logger = logging.getLogger("ambientdesk.celery_tasks")


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(requests.RequestException,),
)
def run_ai_agent_task(self, task_id: str, human_approved: bool = False):
    """Dispatches user prompt to FastAPI AI Agent Service and records execution states."""
    try:
        task = AgentTask.objects.get(id=task_id)
    except AgentTask.DoesNotExist:
        logger.error(f"Task with ID {task_id} not found.")
        return

    task.status = TaskStatus.PROCESSING
    task.save(update_fields=["status", "updated_at"])

    TaskExecutionLog.objects.create(
        task=task,
        node_name="celery_dispatcher",
        message="Task picked up from Redis queue and dispatched to AI agent.",
        metadata={"retry_count": self.request.retries},
    )

    url = f"{settings.AI_AGENT_SERVICE_URL}/tasks/run"
    headers = {
        "x-internal-token": settings.AI_AGENT_INTERNAL_TOKEN,
        "Content-Type": "application/json",
    }
    payload = {
        "task_id": str(task.id),
        "user_id": str(task.user.id),
        "prompt": task.prompt,
        "human_approved": human_approved,
    }

    start_time = time.perf_counter()
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=120)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        if response.status_code == 200:
            data = response.json()
            task.status = data.get("status", TaskStatus.COMPLETED)
            task.triage_category = data.get("triage_category")
            task.output = data.get("output")
            task.approval_prompt = data.get("approval_prompt")
            task.execution_time_ms = elapsed_ms
            task.save()

            TaskExecutionLog.objects.create(
                task=task,
                node_name="ai_agent_response",
                message=f"AI Agent returned status: {task.status}",
                metadata={"triage_category": task.triage_category, "latency_ms": elapsed_ms},
            )
        else:
            task.status = TaskStatus.FAILED
            task.error_message = (
                f"Agent service HTTP {response.status_code}: {response.text}"
            )
            task.execution_time_ms = elapsed_ms
            task.save()

            TaskExecutionLog.objects.create(
                task=task,
                node_name="ai_agent_error",
                message="Non-200 response from AI Agent service",
                metadata={"status_code": response.status_code, "body": response.text[:500]},
            )

    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        task.status = TaskStatus.FAILED
        task.error_message = str(exc)
        task.execution_time_ms = elapsed_ms
        task.save()

        TaskExecutionLog.objects.create(
            task=task,
            node_name="celery_dispatcher_exception",
            message=f"Execution error: {str(exc)}",
        )
        raise self.retry(exc=exc)