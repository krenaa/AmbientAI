import logging
from typing import Dict, Any, Literal
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt

from app.agent.state import AgentState, TriageOutput
from app.agent.llm import get_resilient_llm
from app.agent.tools import ALL_TOOLS

logger = logging.getLogger("ambientdesk.graph")

TRIAGE_SYSTEM_PROMPT = """You are the ambientdesk Task Triage Specialist.
Analyze the user's input and classify the intent into one of:
- direct_answer: General reasoning, conceptual explanations, or simple chit-chat.
- research: Involves web searches, facts, or live lookups.
- code_generation: Involves writing, debugging, or analyzing software code.
- summarization: Condensing documents or text.
- sensitive_action: Tasks like sending emails, making financial transactions, database writes, or destructive operations.

If the task asks to send an email, perform an external transaction, or delete resources, set `is_sensitive=True`."""


async def triage_node(state: AgentState) -> Dict[str, Any]:
    """Classifies user request and checks for sensitive actions."""
    structured_llm = get_resilient_llm(temperature=0.0, structured_schema=TriageOutput)

    user_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    latest_query = user_messages[-1].content if user_messages else "No input"

    messages = [
        SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
        HumanMessage(content=f"Task input: {latest_query}"),
    ]

    try:
        triage_result: TriageOutput = await structured_llm.ainvoke(messages)
        is_sensitive = triage_result.is_sensitive or (triage_result.category == "sensitive_action")
        return {
            "triage": triage_result,
            "requires_approval": is_sensitive,
        }
    except Exception as e:
        logger.warning(f"Structured triage failed, using fallback: {e}")
        return {
            "triage": TriageOutput(
                category="direct_answer",
                requires_tools=False,
                is_sensitive=False,
                summary=str(latest_query)[:100],
            ),
            "requires_approval": False,
        }


async def approval_node(state: AgentState) -> Dict[str, Any]:
    """Pauses graph execution using interrupt() when human approval is required."""
    if state.get("requires_approval") and state.get("approval_status") is None:
        user_approval_data = interrupt({
            "question": "This action involves sensitive execution. Do you approve?",
            "task_id": state.get("task_id"),
            "action_summary": state["triage"].summary if state.get("triage") else "Sensitive Operation",
        })
        
        # When resumed, interrupt() returns the value passed during resumption
        approved = user_approval_data.get("approved", False) if isinstance(user_approval_data, dict) else bool(user_approval_data)
        status = "approved" if approved else "rejected"
        return {"approval_status": status}
    
    return {}


async def agent_node(state: AgentState) -> Dict[str, Any]:
    """Executes the task logic or handles rejected approvals."""
    if state.get("approval_status") == "rejected":
        return {
            "messages": [AIMessage(content="Operation cancelled by user: Human approval was rejected.")]
        }

    llm_with_tools = get_resilient_llm(temperature=0.2, tools=ALL_TOOLS)
    system_instruction = (
        "You are ambientdesk AI, a capable, precise multi-agent assistant.\n"
        "Execute the user's task clearly and concisely. Use tools when factual lookup is needed."
    )

    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    response = await llm_with_tools.ainvoke(messages)

    return {"messages": [response]}


def route_after_triage(state: AgentState) -> Literal["approval", "agent"]:
    """Routes to approval node if sensitive, else directly to agent node."""
    if state.get("requires_approval") and state.get("approval_status") is None:
        return "approval"
    return "agent"


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


def init_checkpointer():
    """Initializes persistent PostgresSaver or falls back to MemorySaver if unavailable."""
    try:
        from psycopg_pool import ConnectionPool
        from langgraph.checkpoint.postgres import PostgresSaver
        from app.config import get_settings

        settings = get_settings()
        conn_string = (
            f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        )
        pool = ConnectionPool(
            conninfo=conn_string, max_size=10, kwargs={"autocommit": True}
        )
        pool.open()
        saver = PostgresSaver(pool)
        saver.setup()
        logger.info("LangGraph initialized with persistent PostgresSaver.")
        return saver
    except Exception as e:
        logger.warning(
            f"Could not connect PostgresSaver ({e}), falling back to MemorySaver."
        )
        return MemorySaver()


# Checkpointer for state snapshot persistence across pauses/resumes
checkpointer = init_checkpointer()


def build_graph():
    """Compiles the LangGraph state machine workflow with checkpointing and HITL."""
    workflow = StateGraph(AgentState)

    workflow.add_node("triage", triage_node)
    workflow.add_node("approval", approval_node)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(ALL_TOOLS))

    workflow.add_edge(START, "triage")

    workflow.add_conditional_edges(
        "triage",
        route_after_triage,
        {
            "approval": "approval",
            "agent": "agent",
        },
    )

    workflow.add_edge("approval", "agent")

    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            END: END,
        },
    )

    workflow.add_edge("tools", "agent")

    return workflow.compile(checkpointer=checkpointer)


agent_graph = build_graph()