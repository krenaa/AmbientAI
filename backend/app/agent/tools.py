import logging
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
# 2. REGISTER READ-ONLY TOOLS IN THE TOOL REGISTRY
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


ALL_TOOLS = [t.func for t in registry.get_all()]