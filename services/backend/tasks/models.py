import uuid
from django.conf import settings
from django.db import models


class TaskStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PROCESSING = "processing", "Processing"
    AWAITING_APPROVAL = "awaiting_approval", "Awaiting Approval"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class TriageCategory(models.TextChoices):
    DIRECT_ANSWER = "direct_answer", "Direct Answer"
    WEB_SEARCH = "web_search", "Web Search"
    RAG_RETRIEVAL = "rag_retrieval", "RAG Retrieval"
    CALCULATION = "calculation", "Calculation"
    SENSITIVE_ACTION = "sensitive_action", "Sensitive Action (HITL)"


class AgentTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_tasks",
    )
    title = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Custom title or topic for this chat session",
    )
    prompt = models.TextField(help_text="User's initial instruction or request")
    status = models.CharField(
        max_length=32,
        choices=TaskStatus.choices,
        default=TaskStatus.PENDING,
        db_index=True,
    )
    triage_category = models.CharField(
        max_length=64,
        choices=TriageCategory.choices,
        blank=True,
        null=True,
    )
    output = models.TextField(blank=True, null=True, help_text="Final synthesized answer")
    approval_prompt = models.TextField(
        blank=True,
        null=True,
        help_text="Description of action requiring user confirmation",
    )
    error_message = models.TextField(blank=True, null=True)
    execution_time_ms = models.FloatField(default=0.0)
    total_tokens = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.title and self.prompt:
            first_line = self.prompt.strip().split("\n")[0]
            clean_line = first_line.replace("[Follow-up]:", "").strip()
            self.title = clean_line[:80].strip() or "Untitled Chat"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Task {self.id} [{self.status}] - {self.user.email}"


class TaskExecutionLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(
        AgentTask,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    node_name = models.CharField(max_length=128)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"[{self.task_id}][{self.node_name}] {self.message[:40]}"