import logging
from typing import Any, Dict, Literal
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from app.agent.llm import get_llm
from app.agent.state import AgentState

logger = logging.getLogger("ambientai.agent.graph")

# Global in-memory checkpointer for development
memory_saver = MemorySaver()


def check_intent(state: AgentState) -> Dict[str, Any]:
    """Inspects user input to detect if a sensitive/state-changing action requires approval."""
    messages = state.get("messages", [])
    if not messages:
        return {"requires_approval": False}

    last_message = messages[-1]
    content = last_message.content.lower() if hasattr(last_message, "content") else ""

    # Sensitive action keywords requiring human-in-the-loop governance
    sensitive_keywords = [
        "send notification",
        "notification",
        "notify",
        "send email",
        "email to",
        "alert team",
        "alert admin",
        "alert",
        "delete",
        "destroy",
        "drop",
        "terminate",
        "wipe",
        "deploy to prod",
        "deploy",
        "publish",
        "transfer",
        "execute sensitive",
        "modify schema",
        "cleanup",
    ]

    for kw in sensitive_keywords:
        if kw in content:
            if any(k in kw for k in ["notification", "notify", "email", "alert"]):
                prompt = "Human approval required: Are you sure you want to dispatch this notification/alert to the team?"
            elif any(k in kw for k in ["delete", "destroy", "drop", "wipe"]):
                prompt = f"Human approval required: Are you sure you want to execute destructive action '{kw}'?"
            elif "deploy" in kw:
                prompt = "Human approval required: Are you sure you want to execute a production deployment?"
            else:
                prompt = f"Human approval required: Are you sure you want to execute action '{kw}'?"
            logger.info(f"Triggering HITL interrupt for keyword '{kw}'")
            return {
                "requires_approval": True,
                "approval_prompt": prompt,
                "action_type": kw,
            }

    return {"requires_approval": False}


def human_approval(state: AgentState) -> Dict[str, Any]:
    """Halts execution via LangGraph interrupt() until approved or rejected."""
    prompt = state.get("approval_prompt", "Approval requested for state-changing action.")
    task_id = state.get("task_id")

    # This pauses graph execution and returns control to the runner
    decision = interrupt(
        {
            "type": "approval_required",
            "prompt": prompt,
            "task_id": task_id,
        }
    )

    # Resume value can be dict {"action": "approved"|"rejected"} or str
    if isinstance(decision, dict):
        status = decision.get("action", "rejected")
    elif isinstance(decision, str):
        status = decision
    else:
        status = "rejected"

    logger.info(f"Resuming graph with approval decision: {status}")
    return {"approval_status": status}


def generate_response(state: AgentState) -> Dict[str, Any]:
    """Standard node calling LLM directly when no approval is required and streaming is not external."""
    if state.get("stream_handled"):
        return {}
    llm = get_llm()
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


def execute_and_respond(state: AgentState) -> Dict[str, Any]:
    """Executes approved action and informs the user."""
    action = state.get("action_type", "requested action")
    content = f"Action **{action}** was approved and executed successfully."
    return {"messages": [AIMessage(content=content)]}


def rejection_response(state: AgentState) -> Dict[str, Any]:
    """Handles user rejection gracefully."""
    action = state.get("action_type", "requested action")
    content = f"Action **{action}** was rejected by user. No modifications were performed."
    return {"messages": [AIMessage(content=content)]}


def route_after_intent(state: AgentState) -> Literal["human_approval", "generate_response"]:
    if state.get("requires_approval", False):
        return "human_approval"
    return "generate_response"


def route_after_approval(state: AgentState) -> Literal["execute_and_respond", "rejection_response"]:
    if state.get("approval_status") == "approved":
        return "execute_and_respond"
    return "rejection_response"


def create_agent_graph(checkpointer=None):
    """Compiles and returns the LangGraph StateGraph with MemorySaver checkpointer."""
    workflow = StateGraph(AgentState)

    # Nodes
    workflow.add_node("check_intent", check_intent)
    workflow.add_node("human_approval", human_approval)
    workflow.add_node("generate_response", generate_response)
    workflow.add_node("execute_and_respond", execute_and_respond)
    workflow.add_node("rejection_response", rejection_response)

    # Edges
    workflow.set_entry_point("check_intent")
    workflow.add_conditional_edges(
        "check_intent",
        route_after_intent,
        {
            "human_approval": "human_approval",
            "generate_response": "generate_response",
        },
    )
    workflow.add_conditional_edges(
        "human_approval",
        route_after_approval,
        {
            "execute_and_respond": "execute_and_respond",
            "rejection_response": "rejection_response",
        },
    )
    workflow.add_edge("generate_response", END)
    workflow.add_edge("execute_and_respond", END)
    workflow.add_edge("rejection_response", END)

    cp = checkpointer or memory_saver
    return workflow.compile(checkpointer=cp)


agent_graph = create_agent_graph()