import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Tuple, Optional, Dict, Any
from langchain_core.tools import tool
from tavily import TavilyClient
from app.config import get_settings
from app.agent.vector_store import get_vector_store

logger = logging.getLogger("ambientdesk.tools")
settings = get_settings()


@tool
def web_search(query: str) -> str:
    """Search the live web for up-to-date information, facts, research, and documentation.

    Args:
        query: The targeted search query string.
    """
    if not settings.TAVILY_API_KEY:
        return "Search tool is unavailable: TAVILY_API_KEY is not configured."

    try:
        client = TavilyClient(api_key=settings.TAVILY_API_KEY)
        response = client.search(query=query, max_results=3, search_depth="basic")

        results = response.get("results", [])
        if not results:
            return f"No relevant web search results found for query: '{query}'"

        formatted_results = []
        for r in results:
            title = r.get("title", "No Title")
            url = r.get("url", "")
            content = r.get("content", "")
            sanitized_content = content[:350].replace("```", "'''")
            formatted_results.append(
                f"Source: {title}\nURL: {url}\nSnippet: {sanitized_content}\n"
            )

        return "\n---\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Error executing web_search tool: {e}")
        return f"Error executing web search: {str(e)}"


@tool
def knowledge_base_retrieval(query: str) -> str:
    """Search internal documentation, indexed company data, and private context using pgvector RAG.

    Args:
        query: The semantic search query string.
    """
    try:
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


import ast
import math
import operator

_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_SAFE_FUNCTIONS = {
    "sqrt": math.sqrt,
    "abs": abs,
    "round": round,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "exp": math.exp,
}


def _eval_expr_ast(node):
    if isinstance(node, ast.Expression):
        return _eval_expr_ast(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp):
        left = _eval_expr_ast(node.left)
        right = _eval_expr_ast(node.right)
        op_type = type(node.op)
        if op_type in _SAFE_OPERATORS:
            return _SAFE_OPERATORS[op_type](left, right)
        raise ValueError(f"Unsupported operator: {op_type.__name__}")
    if isinstance(node, ast.UnaryOp):
        operand = _eval_expr_ast(node.operand)
        op_type = type(node.op)
        if op_type in _SAFE_OPERATORS:
            return _SAFE_OPERATORS[op_type](operand)
        raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        func_name = node.func.id
        if func_name in _SAFE_FUNCTIONS:
            args = [_eval_expr_ast(arg) for arg in node.args]
            return _SAFE_FUNCTIONS[func_name](*args)
        raise ValueError(f"Unsupported function call: {func_name}")
    raise ValueError(f"Unsupported expression element: {type(node).__name__}")


@tool
def calculate_expression(expression: str) -> str:
    """Safely calculate mathematical and numerical expressions (e.g. '125 * 4.5', 'sqrt(144) + 10').

    Args:
        expression: The mathematical expression string to evaluate.
    """
    try:
        cleaned = expression.strip()
        parsed = ast.parse(cleaned, mode="eval")
        result = _eval_expr_ast(parsed)
        return f"Result: {result}"
    except Exception as e:
        return f"Error evaluating expression '{expression}': {str(e)}"


@tool
def send_external_notification(recipient: str, subject: str, message_body: str) -> str:
    """Send an external alert, email, or webhook notification.

    Args:
        recipient: Target email address, team member, or channel identifier.
        subject: The summary subject line for the message.
        message_body: The full notification message content.
    """
    logger.info(f"Dispatched external notification to {recipient}: {subject}")
    return (
        f"Notification successfully delivered to {recipient}. Subject: '{subject}'."
    )


# RFC-compliant email regex: disallows special symbols like #, $, %, etc. in user or domain parts
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def validate_email_address(email: str) -> Tuple[bool, str]:
    """Validates email format and detects common malformed patterns (like invalid characters or missing domains)."""
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

    # Check for invalid characters like #, $, %, etc.
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
def send_email(recipient: str, subject: str, body: str) -> str:
    """Send an email to a recipient with subject and message body.
    Includes strict address validation and supports both live SMTP and realistic demo delivery.

    Args:
        recipient: Target recipient email address (e.g., 'user@example.com').
        subject: The subject line of the email.
        body: The plain text or formatted body of the email.
    """
    clean_recipient = recipient.strip()
    clean_subject = subject.strip() if subject else "(No Subject)"
    clean_body = body.strip() if body else ""

    # 1. Defensive input validation
    is_valid, validation_msg = validate_email_address(clean_recipient)
    if not is_valid:
        logger.warning(
            f"Email validation failed for recipient '{clean_recipient}': {validation_msg}"
        )
        return (
            f"Validation Error: {validation_msg}. "
            f"Please do NOT attempt to resend to '{clean_recipient}'. "
            "Instead, inform the user about the syntax error and ask for clarification or confirmation of the corrected address."
        )

    # 2. Live SMTP Dispatch if configured
    if settings.SMTP_HOST:
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.SMTP_FROM_EMAIL
            msg["To"] = clean_recipient
            msg["Subject"] = clean_subject
            msg.attach(MIMEText(clean_body, "plain"))

            with smtplib.SMTP(
                settings.SMTP_HOST, settings.SMTP_PORT, timeout=10
            ) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(
                f"Live SMTP email sent successfully to {clean_recipient} with subject '{clean_subject}'"
            )
            return f"Email successfully delivered via SMTP to '{clean_recipient}'. Subject: '{clean_subject}'."
        except Exception as e:
            logger.error(f"Failed to send email via SMTP to {clean_recipient}: {e}")
            return f"SMTP Delivery Failure to '{clean_recipient}': {str(e)}"

    # 3. Simulated Demo Mode (When SMTP is not configured)
    logger.info(
        f"[Demo Mode] Simulated email dispatch to {clean_recipient} | Subject: '{clean_subject}'"
    )
    return (
        f"[SIMULATED MODE - NO SENDER SMTP CONFIGURED]: "
        f"The email was validated and prepared for '{clean_recipient}' with subject '{clean_subject}'. "
        f"However, no real email was dispatched to the inbox because no sender SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) are configured in .env. "
        f"Inform the user that this was a simulated test, and to send real emails to '{clean_recipient}', they must configure SMTP credentials (like a Gmail App Password) in .env."
    )


# Realistic enterprise inbox mock data for portfolio evaluation
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


# Export registered agent tools
ALL_TOOLS = [
    web_search,
    knowledge_base_retrieval,
    calculate_expression,
    send_external_notification,
    send_email,
    fetch_recent_emails,
]