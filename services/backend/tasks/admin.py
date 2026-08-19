from django.contrib import admin
from .models import AgentTask, TaskExecutionLog


class TaskExecutionLogInline(admin.TabularInline):
    model = TaskExecutionLog
    extra = 0
    readonly_fields = ("node_name", "message", "metadata", "timestamp")


@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "status",
        "triage_category",
        "execution_time_ms",
        "created_at",
    )
    list_filter = ("status", "triage_category", "created_at")
    search_fields = ("id", "user__email", "prompt", "output")
    inlines = [TaskExecutionLogInline]