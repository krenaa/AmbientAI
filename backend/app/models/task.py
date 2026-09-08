from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class AgentTask(Base):
    """Maps directly to existing Django 'tasks_agenttask' table."""
    __tablename__ = "tasks_agenttask"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("accounts_customuser.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    prompt = Column(Text, nullable=False)
    status = Column(String(32), default="pending", nullable=False, index=True)
    triage_category = Column(String(64), nullable=True)
    output = Column(Text, nullable=True)
    approval_prompt = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    execution_time_ms = Column(Float, default=0.0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="agent_tasks")
    logs = relationship("TaskExecutionLog", back_populates="task", cascade="all, delete-orphan", order_by="TaskExecutionLog.timestamp")


class TaskExecutionLog(Base):
    """Maps directly to existing Django 'tasks_taskexecutionlog' table."""
    __tablename__ = "tasks_taskexecutionlog"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks_agenttask.id", ondelete="CASCADE"), nullable=False, index=True)
    node_name = Column(String(128), nullable=False)
    message = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSON, default=dict, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    # Relationships
    task = relationship("AgentTask", back_populates="logs")
