from typing import Annotated, Any, Dict, List, Optional, Sequence
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    task_id: Optional[str]
    requires_approval: bool
    approval_prompt: Optional[str]
    approval_status: Optional[str]  # "pending", "approved", "rejected"
    action_type: Optional[str]
    stream_handled: Optional[bool]