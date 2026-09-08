import json
import asyncio
from typing import AsyncGenerator, List, Optional
import strawberry
from strawberry.types import Info
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.models import CustomUser
from django.conf import settings
from tasks.models import AgentTask, TaskExecutionLog, TaskStatus
from tasks.tasks import run_ai_agent_task, broadcast_task_event


def get_authenticated_user(info: Info) -> Optional[CustomUser]:
    """Resolves authenticated user from JWT Bearer token, session request, or debug dev fallback."""
    request = getattr(info.context, "request", None)
    if not request:
        if settings.DEBUG:
            return CustomUser.objects.order_by("id").first()
        return None

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        try:
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token_str)
            return jwt_auth.get_user(validated_token)
        except Exception:
            return None

    if getattr(request, "user", None) and request.user.is_authenticated:
        return request.user

    # In development mode, auto-resolve to primary user for seamless GraphiQL playground testing
    if settings.DEBUG:
        return CustomUser.objects.order_by("id").first()

    return None


@strawberry.type
class UserStatsType:
    total_tasks: int
    completed_tasks: int
    awaiting_approval: int
    total_execution_time_s: float


@strawberry.type
class UserType:
    id: str
    email: str
    full_name: str
    role: str
    is_staff: bool
    date_joined: Optional[str] = None
    stats: Optional[UserStatsType] = None


@strawberry.type
class TaskExecutionLogType:
    id: str
    node_name: str
    message: str
    metadata: Optional[str] = None
    timestamp: str


@strawberry.type
class AgentTaskType:
    id: str
    title: Optional[str] = None
    prompt: str
    status: str
    triage_category: Optional[str] = None
    output: Optional[str] = None
    approval_prompt: Optional[str] = None
    error_message: Optional[str] = None
    execution_time_ms: float = 0.0
    created_at: str
    logs: List[TaskExecutionLogType]


@strawberry.type
class AuthPayloadType:
    access: str
    refresh: str
    user: UserType


@strawberry.type
class TaskUpdatePayload:
    task_id: str
    status: str
    triage_category: Optional[str] = None
    output: Optional[str] = None
    approval_prompt: Optional[str] = None
    error_message: Optional[str] = None
    execution_time_ms: Optional[float] = None


def build_user_type(user: CustomUser) -> UserType:
    tasks = user.agent_tasks.all()
    total = tasks.count()
    completed = tasks.filter(status=TaskStatus.COMPLETED).count()
    pending = tasks.filter(status=TaskStatus.AWAITING_APPROVAL).count()
    total_time = sum(t.execution_time_ms for t in tasks)

    stats = UserStatsType(
        total_tasks=total,
        completed_tasks=completed,
        awaiting_approval=pending,
        total_execution_time_s=round(total_time / 1000.0, 2),
    )

    return UserType(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name or user.email.split("@")[0],
        role="Admin" if (user.is_staff or user.is_superuser) else "Member",
        is_staff=user.is_staff,
        date_joined=(
            user.date_joined.isoformat()
            if hasattr(user, "date_joined") and user.date_joined
            else None
        ),
        stats=stats,
    )


def build_task_type(task: AgentTask) -> AgentTaskType:
    logs = [
        TaskExecutionLogType(
            id=str(log.id),
            node_name=log.node_name,
            message=log.message,
            metadata=json.dumps(log.metadata) if log.metadata else None,
            timestamp=log.timestamp.isoformat(),
        )
        for log in task.logs.all()
    ]

    return AgentTaskType(
        id=str(task.id),
        title=task.title,
        prompt=task.prompt,
        status=task.status,
        triage_category=task.triage_category,
        output=task.output,
        approval_prompt=task.approval_prompt,
        error_message=task.error_message,
        execution_time_ms=task.execution_time_ms,
        created_at=task.created_at.isoformat(),
        logs=logs,
    )


@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: Info) -> Optional[UserType]:
        """Returns the currently authenticated user profile and statistics."""
        user = get_authenticated_user(info)
        if not user:
            return None
        return build_user_type(user)

    @strawberry.field
    def tasks(
        self,
        info: Info,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[AgentTaskType]:
        """Queries the authenticated user's task history with optional filters."""
        user = get_authenticated_user(info)
        if not user:
            return []

        qs = (
            AgentTask.objects.filter(user=user)
            .prefetch_related("logs")
            .order_by("-created_at")
        )

        if status and status != "all":
            qs = qs.filter(status=status)

        if search:
            qs = qs.filter(prompt__icontains=search.strip())

        return [build_task_type(t) for t in qs]

    @strawberry.field
    def task(self, info: Info, id: str) -> Optional[AgentTaskType]:
        """Retrieves details and execution logs for a single task."""
        user = get_authenticated_user(info)
        if not user:
            return None
        try:
            task = AgentTask.objects.prefetch_related("logs").get(id=id, user=user)
            return build_task_type(task)
        except AgentTask.DoesNotExist:
            return None


@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_task(self, info: Info, prompt: str) -> Optional[AgentTaskType]:
        """Dispatches an autonomous multi-agent task thread via Celery."""
        user = get_authenticated_user(info)
        if not user:
            raise Exception("Authentication required to dispatch agent tasks.")

        task = AgentTask.objects.create(
            user=user,
            prompt=prompt.strip(),
            status=TaskStatus.PENDING,
        )

        run_ai_agent_task.delay(str(task.id))
        return build_task_type(task)

    @strawberry.mutation
    def approve_task(
        self, info: Info, task_id: str, approved: bool
    ) -> Optional[AgentTaskType]:
        """Human-in-the-Loop decision to approve or reject a paused agent task."""
        user = get_authenticated_user(info)
        if not user:
            raise Exception("Authentication required to approve agent actions.")

        try:
            task = AgentTask.objects.get(id=task_id, user=user)
        except AgentTask.DoesNotExist:
            raise Exception("Task not found.")

        if task.status != TaskStatus.AWAITING_APPROVAL:
            raise Exception(f"Task is not awaiting approval (status: {task.status})")

        if approved:
            task.status = TaskStatus.PROCESSING
            task.save(update_fields=["status", "updated_at"])
            run_ai_agent_task.delay(str(task.id), human_approved=True)
        else:
            task.status = TaskStatus.COMPLETED
            task.output = "Action was rejected by user."
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

        return build_task_type(task)

    @strawberry.mutation
    def rename_task(
        self, info: Info, task_id: str, title: str
    ) -> Optional[AgentTaskType]:
        """Rename a chat task session."""
        user = get_authenticated_user(info)
        if not user:
            raise Exception("Authentication required.")
        try:
            task = AgentTask.objects.get(id=task_id, user=user)
            task.title = title.strip()[:255]
            task.save(update_fields=["title", "updated_at"])
            return build_task_type(task)
        except AgentTask.DoesNotExist:
            raise Exception("Task not found.")

    @strawberry.mutation
    def delete_task(self, info: Info, task_id: str) -> bool:
        """Permanently delete a chat task session."""
        user = get_authenticated_user(info)
        if not user:
            raise Exception("Authentication required.")
        try:
            task = AgentTask.objects.get(id=task_id, user=user)
            task.delete()
            return True
        except AgentTask.DoesNotExist:
            return False

    @strawberry.mutation
    def update_profile(
        self,
        info: Info,
        full_name: Optional[str] = None,
        current_password: Optional[str] = None,
        new_password: Optional[str] = None,
    ) -> UserType:
        """Updates user profile information and password."""
        user = get_authenticated_user(info)
        if not user:
            raise Exception("Authentication required.")

        if full_name is not None:
            user.full_name = full_name.strip()

        if current_password and new_password:
            if not user.check_password(current_password):
                raise Exception("Current password does not match.")
            if len(new_password) < 8:
                raise Exception("New password must be at least 8 characters long.")
            user.set_password(new_password)

        user.save()
        return build_user_type(user)

    @strawberry.mutation
    def login(self, info: Info, email: str, password: str) -> AuthPayloadType:
        """Authenticates a user and returns JWT credentials."""
        from django.contrib.auth import authenticate

        normalized_email = email.lower().strip()
        user = CustomUser.objects.filter(email=normalized_email).first()

        if not user or not user.check_password(password):
            raise Exception("Invalid email or password.")

        refresh = RefreshToken.for_user(user)
        return AuthPayloadType(
            access=str(refresh.access_token),
            refresh=str(refresh),
            user=build_user_type(user),
        )

    @strawberry.mutation
    def register(
        self,
        info: Info,
        email: str,
        password: str,
        full_name: Optional[str] = "",
    ) -> AuthPayloadType:
        """Registers a new user and returns JWT credentials."""
        normalized_email = email.lower().strip()
        if CustomUser.objects.filter(email=normalized_email).exists():
            raise Exception("A user with this email address already exists.")

        if len(password) < 8:
            raise Exception("Password must be at least 8 characters long.")

        username = normalized_email.split("@")[0]
        base_username = username
        counter = 1
        while CustomUser.objects.filter(username=username).exists():
            username = f"{base_username}_{counter}"
            counter += 1

        user = CustomUser.objects.create_user(
            username=username,
            email=normalized_email,
            password=password,
            full_name=full_name or "",
        )

        refresh = RefreshToken.for_user(user)
        return AuthPayloadType(
            access=str(refresh.access_token),
            refresh=str(refresh),
            user=build_user_type(user),
        )


@strawberry.type
class Subscription:
    @strawberry.subscription
    async def task_progress(
        self, info: Info, task_id: str
    ) -> AsyncGenerator[TaskUpdatePayload, None]:
        """Subscribes to live task progress and completion events."""
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        # Poll/stream channel events
        last_status = None
        for _ in range(60):  # Stream up to 60 check cycles
            await asyncio.sleep(1.0)
            try:
                task = await AgentTask.objects.aget(id=task_id)
                if task.status != last_status:
                    last_status = task.status
                    yield TaskUpdatePayload(
                        task_id=str(task.id),
                        status=task.status,
                        triage_category=task.triage_category,
                        output=task.output,
                        approval_prompt=task.approval_prompt,
                        error_message=task.error_message,
                        execution_time_ms=task.execution_time_ms,
                    )
                if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
                    break
            except Exception:
                break


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription,
)
