import json
import logging
import re
from typing import Any, Dict, Literal, Tuple, Optional
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from app.agent.llm import get_llm
from app.agent.registry import registry, ToolRisk, is_question_or_explanation
from app.agent.state import AgentState
import app.agent.tools  # noqa: F401 - ensure tools are loaded and registered in ToolRegistry

logger = logging.getLogger("ambientai.agent.graph")

# Global in-memory checkpointer for development
memory_saver = MemorySaver()

# Allowlist for deployment services (Bug 2)
ALLOWED_DEPLOY_SERVICES = [
    "payments-api",
    "ambientdesk-core",
    "frontend",
    "backend",
    "medi-lens",
    "agent-service",
    "api-gateway",
]


def validate_and_parse_deploy(text: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates that service_name (in allowlist), version_tag, and target_env appear in the message.
    If any is missing, returns clarifying prompt instead of hallucinating.
    """
    t_lower = text.lower()

    # 1. Service name validation against allowlist
    found_service = None
    for s in ALLOWED_DEPLOY_SERVICES:
        if re.search(rf"\b{re.escape(s.lower())}\b", t_lower):
            found_service = s
            break

    # 2. Version tag validation (e.g. v2.1, 1.0.0, v1.2.0-rc)
    ver_match = re.search(r"\bv?\d+(?:\.\d+)+(?:-[a-zA-Z0-9.]+)?\b", text, re.IGNORECASE)
    found_version = ver_match.group(0) if ver_match else None

    # 3. Environment validation
    found_env = None
    if re.search(r"\bstaging\b", t_lower):
        found_env = "staging"
    elif re.search(r"\b(?:production|prod)\b", t_lower):
        found_env = "production"
    elif re.search(r"\b(?:development|dev)\b", t_lower):
        found_env = "development"
    elif re.search(r"\b(?:test|qa)\b", t_lower):
        found_env = "test"

    missing = []
    if not found_service:
        missing.append("service")
    if not found_version:
        missing.append("version")
    if not found_env:
        missing.append("environment")

    if missing:
        services_str = ", ".join(ALLOWED_DEPLOY_SERVICES)
        return (
            False,
            (
                "Which service, version and environment should I deploy?\n\n"
                f"- **Allowed Services:** {services_str}\n"
                "- **Environments:** staging, production\n"
                "- **Example:** `Deploy payments-api v2.1 to staging`"
            ),
            None,
        )

    payload = {
        "service_name": found_service,
        "version_tag": found_version,
        "target_env": found_env,
    }
    return True, None, payload


def validate_and_parse_alert(text: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Requires and resolves an alert channel or recipient from the message instead of defaulting."""
    t_lower = text.lower()

    channel = None
    body = None

    # Pattern: "send an alert to the team: postgresql storage is above 90%"
    match = re.search(
        r"(?:to|channel|for)\s+([#@a-zA-Z0-9_\-\s]+?)(?::\s*|\s+with\s+(?:subject|message)\s+|\s+that\s+|\s+saying\s+)(.+)",
        text,
        re.IGNORECASE,
    )
    if match:
        channel = match.group(1).strip()
        body = match.group(2).strip()
    else:
        # Check if user mentioned "the team" or specific channel without colon
        for cand in ["the team", "team", "dev-team", "engineering", "devops", "operations", "#general", "#alerts"]:
            if re.search(rf"\b{re.escape(cand)}\b", t_lower):
                channel = cand
                # Extract message body
                sub_match = re.search(rf"\b{re.escape(cand)}\b\s*[:,-]?\s*(.*)", text, re.IGNORECASE)
                if sub_match and sub_match.group(1).strip():
                    body = sub_match.group(1).strip()
                break

    if not channel:
        return (
            False,
            "Which team channel or recipient should I send the alert to? (e.g. 'the team', '#engineering', 'devops')",
            None,
        )

    if not body:
        # Check if remainder of text has content
        body = text.strip()

    payload = {
        "recipient": channel,
        "subject": f"Urgent Alert: {body[:50]}",
        "message_body": body,
    }
    return True, None, payload


def validate_and_parse_email(text: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates that a recipient email address appears in the message."""
    email_match = re.search(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b", text)
    if not email_match:
        return False, "Which recipient email address should I send the email to?", None

    recipient = email_match.group(0)
    subj_match = re.search(r"subject\s*['\"]([^'\"]+)['\"]", text, re.IGNORECASE)
    body_match = re.search(r"body\s*['\"]([^'\"]+)['\"]", text, re.IGNORECASE)

    subject = subj_match.group(1) if subj_match else "Notice from AmbientDesk AI"
    body = body_match.group(1) if body_match else text

    return True, None, {"recipient": recipient, "subject": subject, "body": body}


def validate_and_parse_fund_transfer(text: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates that both amount and recipient appear in the message."""
    amt_match = re.search(r"(\$?\d+(?:,\d{3})*(?:\.\d+)?|\d+\s*(?:dollars?|usd|rs|inr|eur))\b", text, re.IGNORECASE)
    recipient_match = re.search(r"(?:to|account|recipient)\s+([a-zA-Z0-9_\-@.]+)", text, re.IGNORECASE)

    if not amt_match or not recipient_match:
        return False, "Please specify both the transfer amount and the recipient account for the payout.", None

    amount = amt_match.group(1)
    recipient = recipient_match.group(1)

    return True, None, {
        "recipient_or_account": recipient,
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

    # Backstop 1: If query is obviously math or live search or RAG, NEVER trigger approval
    if any(q_lower.startswith(pfx) for pfx in [
        "search the live web for:", "search the live web:", "search the web for:", "search web:",
        "calculate the formula:", "calculate formula:", "calculate:", "calculate ",
        "retrieve internal knowledge regarding", "retrieve internal knowledge:",
    ]):
        return {"requires_approval": False}

    # Backstop 2: If query is a question or explanation, NEVER trigger approval
    if is_question_or_explanation(user_query):
        return {"requires_approval": False}

    # Iterate strictly through registered SIDE_EFFECT tools
    for tool_def in registry.get_side_effect_tools():
        if tool_def.is_triggered_by(user_query):
            tool_name = tool_def.name
            target = "Team / System"

            # Argument validation before showing HITL card (Bug 2)
            if "deploy" in tool_name:
                valid, clarify_msg, payload = validate_and_parse_deploy(user_query)
                if not valid:
                    return {
                        "requires_approval": False,
                        "clarification_needed": True,
                        "clarification_message": clarify_msg,
                    }
                target = payload.get("target_env", "staging")

            elif "alert" in tool_name or "notification" in tool_name:
                valid, clarify_msg, payload = validate_and_parse_alert(user_query)
                if not valid:
                    return {
                        "requires_approval": False,
                        "clarification_needed": True,
                        "clarification_message": clarify_msg,
                    }
                target = payload.get("recipient", "the team")

            elif "email" in tool_name:
                valid, clarify_msg, payload = validate_and_parse_email(user_query)
                if not valid:
                    return {
                        "requires_approval": False,
                        "clarification_needed": True,
                        "clarification_message": clarify_msg,
                    }
                target = payload.get("recipient", "recipient")

            elif "transfer" in tool_name or "payout" in tool_name:
                valid, clarify_msg, payload = validate_and_parse_fund_transfer(user_query)
                if not valid:
                    return {
                        "requires_approval": False,
                        "clarification_needed": True,
                        "clarification_message": clarify_msg,
                    }
                target = payload.get("recipient_or_account", "account")

            else:
                payload = {}

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


def clarification_node(state: AgentState) -> Dict[str, Any]:
    """Returns the clarifying question when argument validation detects missing parameters."""
    msg = state.get("clarification_message", "Could you please clarify your request?")
    return {"messages": [AIMessage(content=msg)]}


def execute_and_respond(state: AgentState) -> Dict[str, Any]:
    """Executes the approved tool in code and builds the final reply from the tool's actual return status."""
    tool_name = state.get("tool_name", state.get("action_type", "action"))
    payload = state.get("payload", {})
    tool_def = registry.get(tool_name)

    logger.info(f"Executing approved tool '{tool_name}' with payload: {payload}")
    raw_res = None
    try:
        if tool_def:
            raw_res = tool_def.func.invoke(payload)
        else:
            raw_res = {
                "status": "simulated",
                "detail": f"Action '{tool_name}' executed in sandbox environment on {state.get('target', 'system')}.",
            }
    except Exception as e:
        logger.error(f"Error executing approved tool '{tool_name}': {e}")
        raw_res = {"status": "failed", "detail": f"Execution error: {str(e)}"}

    if isinstance(raw_res, dict):
        status = raw_res.get("status", "simulated")
        detail = raw_res.get("detail", str(raw_res))
    else:
        status = "simulated"
        detail = str(raw_res)

    # Bug 3: Build final message strictly based on the real tool return status
    if status == "simulated":
        final_text = (
            f"⚠️ **Simulated: no real {tool_name.replace('_', ' ')} was sent.**\n\n"
            f"> {detail}"
        )
    elif status in ["sent", "queued"]:
        final_text = (
            f"✅ **Action Executed ({status}):**\n\n"
            f"> {detail}"
        )
    elif status == "failed":
        final_text = (
            f"❌ **Action Failed:**\n\n"
            f"> {detail}"
        )
    else:
        final_text = f"Action **{tool_name}** executed per your approval:\n\n> {detail}"

    return {"messages": [AIMessage(content=final_text)], "tool_result": detail}


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


def route_after_intent(state: AgentState) -> Literal["human_approval", "clarification_node", "generate_response"]:
    if state.get("requires_approval", False):
        return "human_approval"
    if state.get("clarification_needed", False):
        return "clarification_node"
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
    workflow.add_node("clarification_node", clarification_node)
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
            "clarification_node": "clarification_node",
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
    workflow.add_edge("clarification_node", END)
    workflow.add_edge("generate_response", END)
    workflow.add_edge("execute_and_respond", END)
    workflow.add_edge("rejection_response", END)

    cp = checkpointer or memory_saver
    return workflow.compile(checkpointer=cp)


agent_graph = create_agent_graph()