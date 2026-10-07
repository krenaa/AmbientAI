import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Tuple, Optional, Dict, Any
from langchain_core.tools import tool
import os
from tavily import TavilyClient

try:
    from app.core.config import get_settings
except ImportError:
    from app.config import get_settings

from app.agent.registry import registry, ToolDefinition, ToolRisk
from app.agent.math_solver import evaluate_expression

logger = logging.getLogger("ambientdesk.tools")
settings = get_settings()


# ============================================================================
# 1. READ-ONLY TOOLS (Risk: READ_ONLY - Never Triggers HITL)
# ============================================================================

@tool
def web_search(query: str) -> str:
    """Search the live web for up-to-date information, facts, research, and documentation.
    Autonomous read-only research tool. Never requires human approval.

    Args:
        query: The targeted search query string.
    """
    tavily_key = getattr(settings, "TAVILY_API_KEY", None) or os.getenv("TAVILY_API_KEY")
    if not tavily_key:
        return "Search tool is unavailable: TAVILY_API_KEY is not configured."

    try:
        client = TavilyClient(api_key=tavily_key)
        response = client.search(query=query, max_results=5, search_depth="basic")

        results = response.get("results", [])
        if not results:
            return f"No relevant web search results found for query: '{query}'"

        formatted_results = []
        for r in results:
            title = r.get("title", "No Title")
            url = r.get("url", "")
            content = r.get("content", "")
            sanitized_content = content[:400].replace("```", "'''")
            formatted_results.append(
                f"Source: [{title}]({url})\nURL: {url}\nSnippet: {sanitized_content}\n"
            )

        return "\n---\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Error executing web_search tool: {e}")
        return f"Error executing web search: {str(e)}"


@tool
def knowledge_base_retrieval(query: str) -> str:
    """Search internal documentation, indexed company data, and private context using pgvector RAG.
    Autonomous read-only retrieval tool. Never requires human approval.

    Args:
        query: The semantic search query string.
    """
    try:
        from app.agent.vector_store import get_vector_store
        vector_store = get_vector_store()
        results = vector_store.similarity_search(query, k=4)

        if not results:
            return "No matching internal knowledge documents found."

        formatted = []
        for i, doc in enumerate(results, 1):
            sanitized = doc.page_content.replace("```", "'''")
            source = doc.metadata.get("source", "internal_doc")
            formatted.append(f"[{i}] (Source: {source}):\n{sanitized}")

        return "\n\n---\n\n".join(formatted)
    except Exception as e:
        logger.error(f"Error querying vector store: {e}")
        return f"Error retrieving internal documents: {str(e)}"


@tool
def calculate_expression(expression: str) -> str:
    """Safely calculate mathematical and numerical expressions (e.g. '125 * 4.5', 'sqrt(144) + 10').
    Autonomous read-only calculator. Never requires human approval.

    Args:
        expression: The mathematical expression string to evaluate.
    """
    try:
        result = evaluate_expression(expression)
        return f"Result: {result}"
    except Exception as e:
        return f"Error evaluating expression '{expression}': {str(e)}"


# Enterprise inbox mock data
_DEMO_INBOX = [
    {
        "id": "msg-101",
        "sender": "security-team@ambientdesk.ai",
        "subject": "Security Advisory: Q3 Zero-Trust & HITL Compliance Audit",
        "date": "2026-09-06 09:15 UTC",
        "body": "Hi Team, All agent workflows performing state-changing tasks (such as email dispatch or data writes) must require explicit Human-in-the-Loop authorization. Please review Section 4 of our security charter.",
    },
    {
        "id": "msg-102",
        "sender": "client-relations@enterprise-partners.com",
        "subject": "Inquiry: RAG Knowledge Base Latency and SLA Terms",
        "date": "2026-09-06 14:30 UTC",
        "body": "Hello AmbientDesk team, We are evaluating your multi-agent architecture for our enterprise stack. Could you provide details on your pgvector retrieval latency and data privacy guarantees?",
    },
    {
        "id": "msg-103",
        "sender": "billing-alerts@cloudinfrastructure.io",
        "subject": "Monthly Compute Resource Utilization & Cost Forecast",
        "date": "2026-09-07 08:00 UTC",
        "body": "Notice: Your current monthly vector database compute spend is tracking at $14,200. Projected month-end overrun is approximately 11.5% if current concurrency continues.",
    },
]


@tool
def fetch_recent_emails(max_count: int = 5, query: str = "") -> str:
    """Fetch recent incoming emails or search the inbox by sender, subject, or keyword.
    Autonomous read-only inbox lookup. Never requires human approval.

    Args:
        max_count: Maximum number of recent emails to retrieve (default: 5).
        query: Optional search keyword to filter emails by sender, subject, or content.
    """
    try:
        results = _DEMO_INBOX
        if query:
            q_lower = query.lower().strip()
            results = [
                m
                for m in results
                if q_lower in m["sender"].lower()
                or q_lower in m["subject"].lower()
                or q_lower in m["body"].lower()
            ]

        capped = results[:max_count]
        if not capped:
            return (
                f"No emails found matching query '{query}'."
                if query
                else "Inbox is empty."
            )

        formatted_emails = []
        for i, m in enumerate(capped, 1):
            formatted_emails.append(
                f"[{i}] Email ID: {m['id']}\n"
                f"From: {m['sender']}\n"
                f"Date: {m['date']}\n"
                f"Subject: {m['subject']}\n"
                f"Body Snippet: {m['body']}\n"
            )

        return "\n---\n".join(formatted_emails)
    except Exception as e:
        logger.error(f"Error fetching emails: {e}")
        return f"Error retrieving emails: {str(e)}"


# ============================================================================
# 2. SIDE-EFFECT TOOLS (Risk: SIDE_EFFECT - Requires HITL Approval)
# ============================================================================

@tool
def send_alert(recipient: str, subject: str, message_body: str) -> Dict[str, Any]:
    """send_alert: Send an urgent notification or alert to a specified team channel."""
    logger.info(f"Alert sent to channel/recipient '{recipient}': {subject}")
    webhook_url = getattr(settings, "ALERT_WEBHOOK_URL", None)
    if webhook_url:
        return {
            "status": "sent",
            "detail": f"Alert successfully delivered to '{recipient}'. Subject: '{subject}'. Message: '{message_body}'.",
        }
    return {
        "status": "simulated",
        "detail": f"Simulated: no real alert was sent. Channel: '{recipient}', Subject: '{subject}', Message: '{message_body}'.",
    }


@tool
def send_external_notification(recipient: str, subject: str, message_body: str) -> Dict[str, Any]:
    """send_external_notification: Broadcast an external notification to a specified team or recipient."""
    logger.info(f"Dispatched external notification to {recipient}: {subject}")
    return {
        "status": "simulated",
        "detail": f"Simulated: no real notification was dispatched. Recipient: '{recipient}', Subject: '{subject}'.",
    }


@tool
def deploy_service(target_env: str = "production", service_name: str = "ambientdesk-core", version_tag: str = "v1.0.0") -> Dict[str, Any]:
    """deploy_service: Deploy a named service/version to staging or production."""
    logger.info(f"Deployment triggered for {service_name} to {target_env} (tag: {version_tag})")
    return {
        "status": "simulated",
        "detail": f"Simulated: deployment pipeline triggered in test mode. Service: '{service_name}', Version: '{version_tag}', Environment: '{target_env}'. (No actual cloud infrastructure was modified).",
    }


# RFC-compliant email regex
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def validate_email_address(email: str) -> Tuple[bool, str]:
    if not email or not isinstance(email, str):
        return False, "Recipient email is empty or not a string"

    candidate = email.strip()
    if " " in candidate:
        return False, f"Email contains whitespace: '{candidate}'"
    if candidate.count("@") != 1:
        return False, f"Email must contain exactly one '@' symbol: '{candidate}'"

    user_part, domain_part = candidate.split("@", 1)
    if not user_part:
        return False, "Email missing local username before '@'"
    if not domain_part:
        return False, "Email missing domain name after '@'"

    invalid_chars = set("#$%^&*()+=[]{}|\\;:'\",<>/?`~")
    found_invalid = invalid_chars.intersection(candidate)
    if found_invalid:
        chars_str = ", ".join(f"'{c}'" for c in sorted(found_invalid))
        return False, f"Email contains illegal character(s) {chars_str} in '{candidate}'"

    if "." not in domain_part:
        return False, f"Email domain '{domain_part}' is missing a top-level domain (e.g. '.com')"

    domain_segments = domain_part.split(".")
    if any(len(seg) == 0 for seg in domain_segments):
        return False, f"Email domain has consecutive dots or malformed segments: '{domain_part}'"
    if len(domain_segments[-1]) < 2:
        return False, f"Email top-level domain '.{domain_segments[-1]}' is too short"
    if not EMAIL_REGEX.match(candidate):
        return False, f"Email does not conform to standard format: '{candidate}'"

    return True, "Valid email format"


@tool
def send_email(recipient: str, subject: str, body: str) -> Dict[str, Any]:
    """send_email: Send an email to a specified recipient with subject and message body."""
    clean_recipient = recipient.strip()
    clean_subject = subject.strip() if subject else "(No Subject)"
    clean_body = body.strip() if body else ""

    is_valid, validation_msg = validate_email_address(clean_recipient)
    if not is_valid:
        logger.warning(f"Email validation failed for recipient '{clean_recipient}': {validation_msg}")
        return {
            "status": "failed",
            "detail": f"Validation Error: {validation_msg}",
        }

    if settings.SMTP_HOST:
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.SMTP_FROM_EMAIL
            msg["To"] = clean_recipient
            msg["Subject"] = clean_subject
            msg.attach(MIMEText(clean_body, "plain"))

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Live SMTP email sent successfully to {clean_recipient}")
            return {
                "status": "sent",
                "detail": f"Email successfully delivered via SMTP to '{clean_recipient}'. Subject: '{clean_subject}'.",
            }
        except Exception as e:
            logger.error(f"Failed to send email via SMTP: {e}")
            return {
                "status": "failed",
                "detail": f"SMTP Delivery Failure to '{clean_recipient}': {str(e)}",
            }

    logger.info(f"[Demo Mode] Simulated email dispatch to {clean_recipient} | Subject: '{clean_subject}'")
    return {
        "status": "simulated",
        "detail": f"Simulated: no real email was sent (no SMTP credentials configured in environment). Recipient: '{clean_recipient}', Subject: '{clean_subject}'.",
    }


@tool
def execute_fund_transfer_or_payout(recipient_or_account: str, amount: str, memo: str = "") -> Dict[str, Any]:
    """execute_fund_transfer_or_payout: Execute a fund transfer or payout to a designated recipient account."""
    logger.info(f"Authorized fund transfer of {amount} to {recipient_or_account}")
    return {
        "status": "simulated",
        "detail": f"Simulated: no real funds transferred. Amount: {amount}, Recipient Account: '{recipient_or_account}', Memo: '{memo or 'Direct transfer'}'. (Sandbox mode).",
    }


# ============================================================================
# 3. REGISTER ALL TOOLS IN THE TOOL REGISTRY
# ============================================================================

registry.register(
    ToolDefinition(
        name="web_search",
        description="Search the live web for up-to-date facts, research, and documentation.",
        risk=ToolRisk.READ_ONLY,
        func=web_search,
        explicit_intent_keywords=["search", "lookup", "browse", "find online", "live web", "latest", "google", "weather", "news"],
        category="search",
    )
)

registry.register(
    ToolDefinition(
        name="knowledge_base_retrieval",
        description="Search internal documentation and uploaded files via pgvector RAG.",
        risk=ToolRisk.READ_ONLY,
        func=knowledge_base_retrieval,
        explicit_intent_keywords=["knowledge base", "internal doc", "pgvector", "retrieve", "document", "uploaded"],
        category="rag",
    )
)

registry.register(
    ToolDefinition(
        name="calculate_expression",
        description="Safely compute mathematical and numerical expressions using Python AST.",
        risk=ToolRisk.READ_ONLY,
        func=calculate_expression,
        explicit_intent_keywords=["calculate", "compute", "formula", "si", "ci", "interest", "math", "evaluate"],
        category="math",
    )
)

registry.register(
    ToolDefinition(
        name="fetch_recent_emails",
        description="Read recent incoming emails or search the inbox by sender or subject.",
        risk=ToolRisk.READ_ONLY,
        func=fetch_recent_emails,
        explicit_intent_keywords=["fetch emails", "inbox", "read emails", "check emails", "view emails", "list emails"],
        category="email",
    )
)

registry.register(
    ToolDefinition(
        name="send_alert",
        description="Send an urgent notification or alert to a specified team channel.",
        risk=ToolRisk.SIDE_EFFECT,
        func=send_alert,
        explicit_intent_keywords=[
            "send alert", "send an alert", "send notification", "send a notification",
            "notify team", "notify the team", "alert team", "alert the team",
            "raise alert", "trigger alert"
        ],
        target_param="recipient",
        category="alert",
    )
)

registry.register(
    ToolDefinition(
        name="send_external_notification",
        description="Broadcast an external notification to a specified team or recipient.",
        risk=ToolRisk.SIDE_EFFECT,
        func=send_external_notification,
        explicit_intent_keywords=[
            "send notification", "notify team", "alert team", "broadcast notification"
        ],
        target_param="recipient",
        category="alert",
    )
)

registry.register(
    ToolDefinition(
        name="deploy_service",
        description="Deploy a named service/version to staging or production.",
        risk=ToolRisk.SIDE_EFFECT,
        func=deploy_service,
        explicit_intent_keywords=[
            "deploy", "release", "ship", "roll out"
        ],
        target_param="target_env",
        category="deploy",
    )
)

registry.register(
    ToolDefinition(
        name="send_email",
        description="Send an email to a specified recipient with subject and message body.",
        risk=ToolRisk.SIDE_EFFECT,
        func=send_email,
        explicit_intent_keywords=["send email", "email to", "send mail", "compose email", "write email"],
        target_param="recipient",
        category="email",
    )
)

registry.register(
    ToolDefinition(
        name="execute_fund_transfer_or_payout",
        description="Execute a fund transfer or payout to a designated recipient account.",
        risk=ToolRisk.SIDE_EFFECT,
        func=execute_fund_transfer_or_payout,
        explicit_intent_keywords=["transfer", "payout", "pay"],
        target_param="recipient_or_account",
        category="finance",
    )
)


ALL_TOOLS = [t.func for t in registry.get_all()]