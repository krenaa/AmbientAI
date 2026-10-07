import logging
from typing import Any, Dict
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.agent.llm import get_llm
from app.agent.state import AgentState
import app.agent.tools  # noqa: F401 - ensure tools are loaded and registered

logger = logging.getLogger("ambientai.agent.graph")

# Global in-memory checkpointer for conversation memory
memory_saver = MemorySaver()


def generate_response(state: AgentState) -> Dict[str, Any]:
    """Standard node calling LLM directly when invoked through graph."""
    if state.get("stream_handled"):
        return {}
    llm = get_llm(model_id=state.get("model_id"))
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


def create_agent_graph(checkpointer=None):
    """Compiles and returns the LangGraph StateGraph with MemorySaver checkpointer.
    HITL interrupt() has been completely removed in favor of advisor-only guidance.
    """
    workflow = StateGraph(AgentState)

    workflow.add_node("generate_response", generate_response)
    workflow.set_entry_point("generate_response")
    workflow.add_edge("generate_response", END)

    cp = checkpointer or memory_saver
    return workflow.compile(checkpointer=cp)


agent_graph = create_agent_graph()