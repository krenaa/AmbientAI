import logging
from typing import Dict, Any, Literal
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt

from app.agent.state import AgentState, TriageOutput
from app.agent.llm import invoke_resiliently, get_resilient_llm
from app.agent.tools import ALL_TOOLS

logger = logging.getLogger("ambientdesk.graph")

TRIAGE_SYSTEM_PROMPT = """You are the ambientdesk Task Triage Specialist.
Analyze the user's input and classify the intent into one of:
- direct_answer: General reasoning, conceptual explanations, or simple chit-chat.
- research: Involves web searches, facts, documentation lookups, or policy queries.
- code_generation: Involves writing, debugging, or analyzing software code.
- summarization: Condensing documents or text.
- sensitive_action: Tasks that execute real state-changing operations like sending live emails, transferring funds, modifying databases, or deleting resources.

CRITICAL RULES:
1. READ-ONLY QUERIES ARE NEVER SENSITIVE: Looking up, checking, reading, or researching bank policies, internal documents, compliance guidelines, terms of service, or checking/reading incoming inbox emails via fetch_recent_emails is purely read-only `research` or `direct_answer`. Always set `is_sensitive=False`.
2. ONLY real state-changing actions (e.g., actually transferring funds, executing financial payouts, sending emails via send_email or send_external_notification, or deleting records) should be classified as `sensitive_action` with `is_sensitive=True`."""


SENSITIVE_KEYWORD_TRIGGERS = [
    "sensitive",
    "transfer",
    "payout",
    "disbursement",
    "disburse",
    "wire fund",
    "send payment",
    "send money",
    "delete database",
    "delete record",
    "drop table",
    "wipe data",
]


async def triage_node(state: AgentState) -> Dict[str, Any]:
    """Classifies user request and checks for sensitive actions with deterministic guardrails and LLM failover."""
    selected_model = state.get("selected_model")

    user_messages = [m for m in state.get("messages", []) if isinstance(m, HumanMessage)]
    raw_content = user_messages[-1].content if user_messages else "No input"
    if isinstance(raw_content, list):
        latest_query = " ".join(
            item.get("text", str(item)) if isinstance(item, dict) else str(item)
            for item in raw_content
        )
    else:
        latest_query = str(raw_content)

    q_lower = latest_query.lower()
    is_read_only = any(term in q_lower for term in ["policy", "guideline", "how to", "what is", "explain", "rules"])
    is_explicitly_sensitive = any(kw in q_lower for kw in SENSITIVE_KEYWORD_TRIGGERS) and not is_read_only

    # 1. Deterministic Fast-Path Guardrail
    if is_explicitly_sensitive:
        logger.info(f"Deterministic HITL guardrail triggered for query: '{latest_query}'")
        triage_result = TriageOutput(
            category="sensitive_action",
            requires_tools=True,
            is_sensitive=True,
            summary=f"Sensitive Action: {latest_query[:140]}",
        )
        return {
            "triage": triage_result,
            "requires_approval": True,
        }

    # 2. LLM-Assisted Triage
    messages = [
        SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
        HumanMessage(content=f"Task input: {latest_query}"),
    ]

    try:
        triage_result: TriageOutput = await invoke_resiliently(
            messages,
            temperature=0.0,
            structured_schema=TriageOutput,
            preferred_model=selected_model,
        )
        is_sensitive = triage_result.is_sensitive or (triage_result.category == "sensitive_action")
        return {
            "triage": triage_result,
            "requires_approval": is_sensitive,
        }
    except Exception as e:
        logger.warning(f"Structured triage fallback: {e}")
        category = "research" if any(k in q_lower for k in ["search", "web", "find", "who", "when", "latest"]) else "direct_answer"
        return {
            "triage": TriageOutput(
                category=category,
                requires_tools=category == "research",
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
    """Executes the task logic or handles rejected approvals with multi-model failover."""
    if state.get("approval_status") == "rejected":
        return {
            "messages": [AIMessage(content="Operation cancelled by user: Human approval was rejected.")]
        }

    selected_model = state.get("selected_model")
    system_instruction = (
        "You are ambientdesk AI, an advanced, highly capable multi-agent autonomous assistant.\n"
        "CRITICAL TOOL INVOCATION RULE:\n"
        "1. When the user asks to search the web, calculate math, retrieve documents, or perform an action:\n"
        "   - You MUST call the appropriate registered tool immediately (`web_search`, `calculate_expression`, `knowledge_base_retrieval`, `execute_fund_transfer_or_payout`, `send_email`, `fetch_recent_emails`).\n"
        "   - Do NOT output text describing future steps (e.g. 'I will call web_search...'). Execute the tool function call directly now!\n"
        "   - Once the tool returns data, synthesize a comprehensive, clean, beautifully structured final response with bold headers, numbered points, and actionable summaries.\n\n"
        "CRITICAL MULTI-STEP WORKFLOW DIRECTIVE:\n"
        "1. When the user requests gathering information AND sending an email/notification:\n"
        "   - Step 1: Call `web_search` or `knowledge_base_retrieval` to get the necessary facts.\n"
        "   - Step 2: Once the facts return, call `send_email` with the recipient, a clear subject, and the synthesized summary body.\n"
        "   - Step 3: Deliver the final confirmation and summary to the user.\n\n"
        "CONVERSATIONAL CONTINUITY:\n"
        "1. You maintain full conversational continuity. All previous messages, research results, summaries, and email addresses in this thread are in your context.\n"
        "2. If the user follows up with 'send this to mail', look up the recipient email from earlier turns and invoke `send_email`."
    )

    if state.get("approval_status") == "approved":
        system_instruction += (
            "\n\nCRITICAL DIRECTIVE: The human supervisor has reviewed and explicitly approved this action. "
            "You MUST proceed to execute the requested action now using your registered tools (`execute_fund_transfer_or_payout`, `send_email`, etc.). "
            "Execute the operation immediately without refusal. The action has been authorized by the user."
        )

    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    try:
        response = await invoke_resiliently(
            messages,
            temperature=0.2,
            tools=ALL_TOOLS,
            preferred_model=selected_model,
        )
        return {"messages": [response]}
    except Exception as e:
        logger.warning(f"Resilient LLM with tools failed: {e}. Attempting direct response fallback...")
        try:
            response = await invoke_resiliently(
                messages,
                temperature=0.2,
                preferred_model=selected_model,
            )
            return {"messages": [response]}
        except Exception as inner_e:
            logger.error(f"All LLM model candidates exhausted: {inner_e}")
            raise e


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
    """Initializes in-memory checkpointer supporting sync and async ainvoke operations."""
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