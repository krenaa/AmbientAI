from datetime import datetime, timezone
import uuid
from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    """Maps directly to existing Django 'accounts_customuser' table."""
    __tablename__ = "accounts_customuser"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(150), unique=True, index=True, nullable=True)
    email = Column(String(254), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    first_name = Column(String(150), nullable=True, default="")
    last_name = Column(String(150), nullable=True, default="")
    full_name = Column(String(255), nullable=True, default="")
    is_staff = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    date_joined = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def role(self) -> str:
        return "Admin" if (self.is_staff or self.is_superuser) else "Member"

    # Relationships
    agent_tasks = relationship(
        "AgentTask",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(AgentTask.created_at)",
    )
