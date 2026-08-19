from rest_framework import serializers
from .models import AgentTask, TaskExecutionLog


class TaskExecutionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskExecutionLog
        fields = ["id", "node_name", "message", "metadata", "timestamp"]


class AgentTaskSerializer(serializers.ModelSerializer):
    logs = TaskExecutionLogSerializer(many=True, read_only=True)
    user_email = serializers.ReadOnlyField(source="user.email")

    class Meta:
        model = AgentTask
        fields = [
            "id",
            "user",
            "user_email",
            "prompt",
            "status",
            "triage_category",
            "output",
            "approval_prompt",
            "error_message",
            "execution_time_ms",
            "total_tokens",
            "created_at",
            "updated_at",
            "logs",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_email",
            "status",
            "triage_category",
            "output",
            "approval_prompt",
            "error_message",
            "execution_time_ms",
            "total_tokens",
            "created_at",
            "updated_at",
            "logs",
        ]


class CreateTaskSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=5000,
        help_text="User prompt or instruction for AmbientDesk AI",
    )


class TaskApprovalSerializer(serializers.Serializer):
    approved = serializers.BooleanField(
        required=True,
        help_text="True to confirm and execute the pending sensitive tool call, False to reject",
    )