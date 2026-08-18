from typing import Annotated, List, Literal, Optional
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class TriageOutput(BaseModel):
    category: Literal[
        "direct_answer", "research", "code_generation", "summarization"
    ] = Field(
        description="The primary classification of the user's requested task."
    )
    requires_tools: bool = Field(
        description="Whether the task requires external tools (like web search or vector retrieval)."
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
    final_output: Optional[str]
    error: Optional[str]