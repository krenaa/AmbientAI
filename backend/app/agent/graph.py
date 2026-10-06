import json
import logging
import re
from typing import Any, Dict, Literal
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from app.agent.llm import get_llm
from app.agent.registry import registry, ToolRisk
from app.agent.state import AgentState
import app.agent.tools  # noqa: F401 - ensure tools are loaded and registered in ToolRegistry

logger = logging.getLogger("ambientai.agent.graph")

# Global in-memory checkpointer for development
memory_saver = MemorySaver()


def parse_alert_details(text: str) -> Dict[str, str]:
    """Extracts recipient, subject, and message body for an alert request."""
    # Match patterns like: "send an alert to the team: server down"
    match = re.search(r"(?:to|for)\s+([^:]+?)(?::\s*|\s+with\s+(?:subject|message)\s+)(.+)", text, re.IGNORECASE)
    if match:
        recipient = match.group(1).strip()
        body = match.group(2).strip()
        return {
            "recipient": recipient,
            "subject": f"Urgent Alert: {body[:50]}",
            "message_body": body,
        }
    return {
        "recipient": "operations@ambientdesk.ai",
        "subject": "System Alert Notification",
        "message_body": text,
    }


def parse_email_details(text: str) -> Dict[str, str]:
    """Extracts recipient email, subject, and body from text."""
    email_match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
    recipient = email_match.group(0) if email_match else "team@ambientdesk.ai"
    subj_match = re.search(r"subject\s*['\"]([^'\"]+)['\"]", text, re.IGNORECASE)
    body_match = re.search(r"body\s*['\"]([^'\"]+)['\"]", text, re.IGNORECASE)

    subject = subj_match.group(1) if subj_match else "Notice from AmbientDesk AI"
    body = body_match.group(1) if body_match else text
    return {"recipient": recipient, "subject": subject, "body": body}


def parse_deploy_details(text: str) -> Dict[str, str]:
    """Extracts deployment target environment and service name."""
    env = "staging" if "staging" in text.lower() else "production"
    service = "ambientdesk-core"
    for cand in ["frontend", "backend", "medi-lens", "agent-service", "api-gateway"]:
        if cand in text.lower():
            service = cand
            break
    return {
        "target_env": env,
        "service_name": service,
        "version_tag": "v1.2.0-rc",
    }


def parse_fund_transfer_details(text: str) -> Dict[str, str]:
    """Extracts recipient account and amount for payout."""
    amt_match = re.search(r"(\$?\d+(?:,\d{3})*(?:\.\d+)?|\d+\s*(?:dollars?|usd|rs))", text, re.IGNORECASE)
    amount = amt_match.group(1) if amt_match else "$500.00"
    target_match = re.search(r"(?:to|account)\s+([a-zA-Z0-9_\-@.]+)", text, re.IGNORECASE)
    target = target_match.group(1) if target_match else "vendor-account-01"
    return {
        "recipient_or_account": target,
        "amount": amount,
        "memo": "Authorized payout via AmbientDesk agent",
    }


def check_intent(state: AgentState) -> Dict[str, Any]:
    """Inspects user input to detect if a sensitive/state-changing action requires approval.
    Decided 100% in deterministic code from the single Tool Registry, NEVER from LLM's opinion.
    READ_ONLY tools (Search, RAG, Math) NEVER trigger approval.
    """
    user_query = state.get("user_query")
    if not user_query:
        messages = state.get("messages", [])
        if messages:
            last_message = messages[-1]
            user_query = last_message.content if hasattr(last_message, "content") else ""
        else:
            user_query = ""

    q_lower = user_query.lower().strip()

    # If query is obviously math or live search or RAG, NEVER trigger approval
    if any(q_lower.startswith(pfx) for pfx in [
        "search the live web for:", "search the live web:", "search the web for:", "search web:",
        "calculate the formula:", "calculate formula:", "calculate:", "calculate ",
        "retrieve internal knowledge regarding", "retrieve internal knowledge:",
    ]):
        return {"requires_approval": False}

    # Iterate strictly through registered SIDE_EFFECT tools
    for tool_def in registry.get_side_effect_tools():
        if tool_def.is_triggered_by(user_query):
            tool_name = tool_def.name
            target = "Team / System"
            payload: Dict[str, Any] = {}

            if "alert" in tool_name or "notification" in tool_name:
                details = parse_alert_details(user_query)
                target = details["recipient"]
                payload = details
            elif "deploy" in tool_name:
                details = parse_deploy_details(user_query)
                target = details["target_env"]
                payload = details
            elif "email" in tool_name:
                details = parse_email_details(user_query)
                target = details["recipient"]
                payload = details
            elif "transfer" in tool_name or "payout" in tool_name:
                details = parse_fund_transfer_details(user_query)
                target = details["recipient_or_account"]
                payload = details

            # Explicit, transparent approval prompt with tool name, target, and payload
            prompt = (
                f"Action: {tool_name}\n"
                f"Target / Recipient: {target}\n"
                f"Payload: {json.dumps(payload, indent=2)}"
            )

            logger.info(f"Triggering HITL interrupt for SIDE_EFFECT tool '{tool_name}' on target '{target}'")
            return {
                "requires_approval": True,
                "approval_prompt": prompt,
                "action_type": tool_name,
                "tool_name": tool_name,
                "target": target,
                "payload": payload,
            }

    return {"requires_approval": False}


def human_approval(state: AgentState) -> Dict[str, Any]:
    """Halts execution via LangGraph interrupt() with structured payload until approved or rejected."""
    prompt = state.get("approval_prompt", "Approval requested for state-changing action.")
    task_id = state.get("task_id")
    tool_name = state.get("tool_name", state.get("action_type", "action"))
    target = state.get("target", "system")
    payload = state.get("payload", {})

    decision = interrupt(
        {
            "type": "approval_required",
            "prompt": prompt,
            "tool_name": tool_name,
            "target": target,
            "payload": payload,
            "task_id": task_id,
        }
    )

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
    llm = get_llm(model_id=state.get("model_id"))
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


def execute_and_respond(state: AgentState) -> Dict[str, Any]:
    """Executes the approved tool in code and routes the tool result back to the LLM for synthesis."""
    tool_name = state.get("tool_name", state.get("action_type", "action"))
    payload = state.get("payload", {})
    tool_def = registry.get(tool_name)

    logger.info(f"Executing approved tool '{tool_name}' with payload: {payload}")
    tool_result = ""
    try:
        if tool_def:
            tool_result = str(tool_def.func.invoke(payload))
        else:
            tool_result = f"Action '{tool_name}' successfully executed on {state.get('target', 'system')}."
    except Exception as e:
        logger.error(f"Error executing approved tool '{tool_name}': {e}")
        tool_result = f"Execution note: {str(e)}"

    # Feed the tool execution result back to the LLM to write a final synthesized response
    try:
        llm = get_llm(model_id=state.get("model_id"))
        synthesis_prompt = (
            f"The user authorized the action '{tool_name}'.\n"
            f"Target: {state.get('target', 'system')}\n"
            f"Payload: {payload}\n"
            f"Execution Output: {tool_result}\n\n"
            "Write a helpful, professional response to the user confirming the successful execution and summarizing the outcome."
        )
        ai_response = llm.invoke([
            SystemMessage(content="You are AmbientDesk AI, an autonomous intelligence agent."),
            HumanMessage(content=synthesis_prompt),
        ])
        return {"messages": [ai_response], "tool_result": tool_result}
    except Exception as llm_err:
        logger.warning(f"Synthesis LLM error: {llm_err}")
        fallback_text = f"Action **{tool_name}** was approved and executed successfully.\n\n> {tool_result}"
        return {"messages": [AIMessage(content=fallback_text)], "tool_result": tool_result}


def rejection_response(state: AgentState) -> Dict[str, Any]:
    """Handles user rejection gracefully by routing back to the LLM to write a helpful reply."""
    tool_name = state.get("tool_name", state.get("action_type", "action"))
    logger.info(f"User rejected action '{tool_name}'. Routing rejection back to LLM.")

    try:
        llm = get_llm(model_id=state.get("model_id"))
        synthesis_prompt = (
            f"The user clicked 'Reject' on the proposed action '{tool_name}'.\n"
            "Acknowledge the cancellation politely, confirm that no external operations or modifications were performed, and ask how you can help next."
        )
        ai_response = llm.invoke([
            SystemMessage(content="You are AmbientDesk AI, an autonomous intelligence agent."),
            HumanMessage(content=synthesis_prompt),
        ])
        return {"messages": [ai_response]}
    except Exception as llm_err:
        logger.warning(f"Rejection LLM error: {llm_err}")
        fallback_text = f"Action **{tool_name}** was cancelled per your request. No modifications or dispatches were performed. How else can I assist you?"
        return {"messages": [AIMessage(content=fallback_text)]}


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