from typing import Annotated, Any, Dict, List, Optional, Sequence
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    task_id: Optional[str]
    user_query: Optional[str]
    requires_approval: bool
    approval_prompt: Optional[str]
    approval_status: Optional[str]  # "pending", "approved", "rejected"
    action_type: Optional[str]
    tool_name: Optional[str]
    target: Optional[str]
    payload: Optional[Dict[str, Any]]
    tool_result: Optional[str]
    model_id: Optional[str]
    stream_handled: Optional[bool]
    clarification_needed: Optional[bool]
    clarification_message: Optional[str]