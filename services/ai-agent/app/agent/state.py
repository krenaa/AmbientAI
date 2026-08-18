from typing import Annotated, List, Literal, Optional, Dict, Any
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class TriageOutput(BaseModel):
    category: Literal[
        "direct_answer", "research", "code_generation", "summarization", "sensitive_action"
    ] = Field(
        description="The primary classification of the user's requested task."
    )
    requires_tools: bool = Field(
        description="Whether the task requires external tools."
    )
    is_sensitive: bool = Field(
        default=False,
        description="True if the task involves sending emails, deleting data, external writes, or sensitive actions needing approval."
    )
    summary: str = Field(
        description="A concise 1-sentence synopsis of what the user wants to accomplish."
    )


class AgentState(TypedDict):
    """The working memory state for a single task thread in LangGraph."""
    messages: Annotated[List[BaseMessage], add_messages]
    task_id: str
    user_id: str
    triage: Optional[TriageOutput]
    requires_approval: bool
    approval_status: Optional[Literal["pending", "approved", "rejected"]]
    approval_payload: Optional[Dict[str, Any]]
    final_output: Optional[str]
    error: Optional[str]