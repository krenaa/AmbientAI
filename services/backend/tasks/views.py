from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import AgentTask, TaskStatus, TaskExecutionLog
from .serializers import (
    AgentTaskSerializer,
    CreateTaskSerializer,
    TaskApprovalSerializer,
)
from .tasks import run_ai_agent_task, broadcast_task_event


class AgentTaskViewSet(viewsets.ModelViewSet):
    serializer_class = AgentTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Users only access their own tasks (IDOR prevention)
        return (
            AgentTask.objects.filter(user=self.request.user)
            .prefetch_related("logs")
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = CreateTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_id = serializer.validated_data.get("task_id")
        user_prompt = serializer.validated_data["prompt"]

        if task_id:
            try:
                task = AgentTask.objects.get(id=task_id, user=request.user)
                # Append user prompt to ongoing task history
                task.prompt = f"{task.prompt}\n\n[Follow-up]: {user_prompt}"
                task.status = TaskStatus.PROCESSING
                task.error_message = None
                task.approval_prompt = None
                task.save(update_fields=["prompt", "status", "error_message", "approval_prompt", "updated_at"])

                TaskExecutionLog.objects.create(
                    task=task,
                    node_name="user_message",
                    message=user_prompt,
                )

                broadcast_task_event(
                    str(task.id),
                    {
                        "task_id": str(task.id),
                        "prompt": task.prompt,
                        "status": task.status,
                        "message": "Processing follow-up in active conversation...",
                    },
                )

                # Trigger async Celery job with this follow-up prompt
                run_ai_agent_task.delay(str(task.id), prompt=user_prompt)

                response_serializer = AgentTaskSerializer(task)
                return Response(response_serializer.data, status=status.HTTP_200_OK)
            except AgentTask.DoesNotExist:
                pass

        task = AgentTask.objects.create(
            user=request.user,
            prompt=user_prompt,
            status=TaskStatus.PENDING,
        )

        TaskExecutionLog.objects.create(
            task=task,
            node_name="user_message",
            message=user_prompt,
        )

        # Trigger async Celery job
        run_ai_agent_task.delay(str(task.id), prompt=user_prompt)

        response_serializer = AgentTaskSerializer(task)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve_task(self, request, pk=None):
        """Human-in-the-loop endpoint to confirm/reject sensitive agent actions."""
        task = self.get_object()

        if task.status != TaskStatus.AWAITING_APPROVAL:
            return Response(
                {"detail": f"Task is not awaiting approval (current status: {task.status})"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TaskApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approved = serializer.validated_data["approved"]

        if approved:
            task.status = TaskStatus.PROCESSING
            task.save(update_fields=["status", "updated_at"])
            run_ai_agent_task.delay(str(task.id), human_approved=True)
            msg = "Action approved. Execution resumed."
        else:
            task.status = TaskStatus.COMPLETED
            task.output = "Action was rejected by the user."
            task.approval_prompt = None
            task.save(update_fields=["status", "output", "approval_prompt", "updated_at"])
            broadcast_task_event(
                str(task.id),
                {
                    "task_id": str(task.id),
                    "status": task.status,
                    "output": task.output,
                    "approval_prompt": None,
                },
            )
            msg = "Action rejected by user."

        return Response({"detail": msg, "task": AgentTaskSerializer(task).data})