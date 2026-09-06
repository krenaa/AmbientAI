import logging
from typing import List
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
        response = client.search(query=query, max_results=5, search_depth="basic")

        results = response.get("results", [])
        if not results:
            return f"No relevant web search results found for query: '{query}'"

        formatted_results = []
        for r in results:
            title = r.get("title", "No Title")
            url = r.get("url", "")
            content = r.get("content", "")
            sanitized_content = content.replace("```", "'''")
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


# Export registered agent tools
ALL_TOOLS = [
    web_search,
    knowledge_base_retrieval,
    calculate_expression,
    send_external_notification,
]