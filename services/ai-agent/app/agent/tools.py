import logging
from typing import List, Dict, Any
from langchain_core.tools import tool
from tavily import TavilyClient
from app.config import get_settings

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
            # Basic prompt injection guardrail: strip excessive control tokens/delimiters
            sanitized_content = content.replace("```", "'''")
            formatted_results.append(
                f"Source: {title}\nURL: {url}\nSnippet: {sanitized_content}\n"
            )

        return "\n---\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Error executing web_search tool: {e}")
        return f"Error executing web search: {str(e)}"


# Export registered agent tools
ALL_TOOLS = [web_search]