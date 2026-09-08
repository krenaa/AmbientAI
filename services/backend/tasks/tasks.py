import logging
import time
from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
import requests
from django.conf import settings
from .models import AgentTask, TaskExecutionLog, TaskStatus

logger = logging.getLogger("ambientdesk.celery_tasks")


def broadcast_task_event(task_id: str, payload: dict):
    """Utility to broadcast an update to the task's WebSocket group."""
    channel_layer = get_channel_layer()
    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            f"task_{task_id}",
            {
                "type": "task_update",
                "data": payload,
            },
        )


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(requests.RequestException,),
)
def run_ai_agent_task(self, task_id: str, human_approved: bool = False, prompt: str = None):
    try:
        task = AgentTask.objects.get(id=task_id)
    except AgentTask.DoesNotExist:
        logger.error(f"Task with ID {task_id} not found.")
        return

    task.status = TaskStatus.PROCESSING
    task.save(update_fields=["status", "updated_at"])

    # Broadcast processing status over WebSocket
    broadcast_task_event(
        str(task.id),
        {
            "task_id": str(task.id),
            "status": task.status,
            "message": "Task running in background queue...",
        },
    )

    headers = {
        "x-internal-token": settings.AI_AGENT_INTERNAL_TOKEN,
        "Content-Type": "application/json",
    }

    if human_approved:
        url = f"{settings.AI_AGENT_SERVICE_URL}/tasks/resume"
        payload = {
            "task_id": str(task.id),
            "approved": True,
        }
    else:
        url = f"{settings.AI_AGENT_SERVICE_URL}/tasks/run"
        effective_prompt = prompt if prompt else task.prompt
        payload = {
            "task_id": str(task.id),
            "user_id": str(task.user.id),
            "prompt": effective_prompt,
        }

    start_time = time.perf_counter()
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=120)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        if response.status_code == 200:
            data = response.json()
            raw_status = data.get("status", TaskStatus.COMPLETED)
            if raw_status in ("waiting_for_approval", "awaiting_approval"):
                task.status = TaskStatus.AWAITING_APPROVAL
            else:
                task.status = raw_status

            task.triage_category = data.get("triage_category")
            new_output = data.get("output")

            if human_approved:
                # When resuming from human approval, replace the paused placeholder on the current turn
                if task.output and "\n\n[Follow-up]: " in task.output:
                    parts = task.output.split("\n\n[Follow-up]: ")
                    parts[-1] = new_output or ""
                    task.output = "\n\n[Follow-up]: ".join(parts)
                else:
                    task.output = new_output
            else:
                # If this execution is a follow-up and previous output exists, append it
                is_followup = bool(prompt) and bool(task.output) and ("[Follow-up]: " in task.prompt)
                if is_followup:
                    task.output = f"{task.output}\n\n[Follow-up]: {new_output or ''}"
                else:
                    task.output = new_output

            raw_prompt = data.get("approval_prompt")
            if isinstance(raw_prompt, dict):
                task.approval_prompt = (
                    raw_prompt.get("action_summary")
                    or raw_prompt.get("question")
                    or raw_prompt.get("message")
                    or str(raw_prompt)
                )
            else:
                task.approval_prompt = raw_prompt

            task.error_message = None
            task.execution_time_ms = elapsed_ms
            task.save()

            TaskExecutionLog.objects.create(
                task=task,
                node_name="ai_agent_response",
                message=new_output or f"AI Agent finished with status: {task.status}",
                metadata={"triage_category": task.triage_category, "latency_ms": elapsed_ms},
            )

            # Broadcast final completion/HITL approval state
            broadcast_task_event(
                str(task.id),
                {
                    "task_id": str(task.id),
                    "status": task.status,
                    "triage_category": task.triage_category,
                    "output": task.output,
                    "approval_prompt": task.approval_prompt,
                    "execution_time_ms": elapsed_ms,
                    "error_message": None,
                },
            )
        else:
            task.status = TaskStatus.FAILED
            task.error_message = f"Agent service error {response.status_code}: {response.text}"
            task.execution_time_ms = elapsed_ms
            task.save()

            broadcast_task_event(
                str(task.id),
                {
                    "task_id": str(task.id),
                    "status": task.status,
                    "error_message": task.error_message,
                },
            )

    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        task.status = TaskStatus.FAILED
        task.error_message = str(exc)
        task.execution_time_ms = elapsed_ms
        task.save()

        broadcast_task_event(
            str(task.id),
            {
                "task_id": str(task.id),
                "status": task.status,
                "error_message": str(exc),
            },
        )
        raise self.retry(exc=exc)