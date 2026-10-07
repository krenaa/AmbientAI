import re
from enum import Enum
from typing import Callable, List, Optional, Dict, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger("ambientai.agent.registry")


class ToolRisk(str, Enum):
    READ_ONLY = "READ_ONLY"      # Autonomous read-only intelligence tool
    SIDE_EFFECT = "SIDE_EFFECT"  # Kept for backwards compatibility; no side-effect execution tools exist


QUESTION_EXPLANATION_PREFIXES = (
    "what", "how", "why", "when", "which", "where", "who", "whom", "whose",
    "explain", "describe", "compare", "difference", "clarify", "summarize",
    "can you explain", "could you explain", "tell me about", "tell me what", "tell me how",
)


def is_question_or_explanation(query: str) -> bool:
    """Detects whether a user prompt is asking a question or seeking an explanation."""
    clean = re.sub(r"^[\s\"'`]+", "", query).lower().strip()
    if not clean:
        return False

    for pfx in QUESTION_EXPLANATION_PREFIXES:
        if clean.startswith(pfx):
            return True

    if clean.endswith("?") or re.search(r"\?\s*$", clean):
        return True

    return False


@dataclass
class ToolDefinition:
    name: str
    description: str
    risk: ToolRisk
    func: Callable
    explicit_intent_keywords: List[str] = field(default_factory=list)
    target_param: Optional[str] = None
    category: str = "general"

    def is_triggered_by(self, user_query: str) -> bool:
        """Determines if the user's explicit query contains intent for this tool."""
        if not self.explicit_intent_keywords:
            return False

        q_lower = user_query.lower()
        return any(re.search(rf"\b{re.escape(kw.lower())}\b", q_lower) for kw in self.explicit_intent_keywords)


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def register(self, tool_def: ToolDefinition):
        self._tools[tool_def.name] = tool_def
        logger.debug(f"Registered tool '{tool_def.name}' [{tool_def.risk.value}]")

    def get(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def get_all(self) -> List[ToolDefinition]:
        return list(self._tools.values())

    def get_read_only_tools(self) -> List[ToolDefinition]:
        return [t for t in self._tools.values() if t.risk == ToolRisk.READ_ONLY]

    def get_side_effect_tools(self) -> List[ToolDefinition]:
        return []

    def filter_tools_for_query(self, query: str, mode: Optional[str] = None) -> List[ToolDefinition]:
        """Strict deterministic tool gating for read-only tools:
        1. If mode chip is set, strictly restrict to that category.
        2. Otherwise returns registered read-only tools.
        """
        q_lower = query.lower().strip()

        # Strict Mode Chip or Explicit Prefix Gating
        if mode == "web_search" or any(q_lower.startswith(pfx) for pfx in [
            "search the live web for:", "search the live web for", "search the live web:", "search the web for:",
            "search the web", "web search:", "web search for:", "web search"
        ]):
            return [t for t in self._tools.values() if t.name == "web_search"]

        if mode == "rag" or any(q_lower.startswith(pfx) for pfx in [
            "retrieve internal knowledge regarding", "retrieve internal knowledge", "knowledge base:", "internal doc:"
        ]):
            return [t for t in self._tools.values() if t.name == "knowledge_base_retrieval"]

        if mode == "math" or any(q_lower.startswith(pfx) for pfx in [
            "calculate the formula", "calculate formula", "calculate:", "calculate "
        ]):
            return [t for t in self._tools.values() if t.name == "calculate_expression"]

        return self.get_read_only_tools()

    def format_capabilities_summary(self) -> str:
        """Dynamically generates capabilities documentation for the LLM system prompt and 'what can you do' queries."""
        read_only = self.get_read_only_tools()

        lines = [
            "### Ambient Agent Capabilities & Tool Registry",
            "",
            "#### 1. Read-Only Intelligence Tools (Autonomous Execution):",
        ]
        for t in read_only:
            lines.append(f"- **`{t.name}`**: {t.description.splitlines()[0]}")

        lines.extend([
            "",
            "#### 2. DevOps & Engineering Advisory Role (Advisor Only):",
            "- For any action request (deployments, alerts, restarts, database changes, infrastructure):",
            "  - Ambient Agent has NO ability to execute actions, modify infrastructure, run commands, or contact anyone.",
            "  - Always replies with: 'I can't execute this myself, but here's how to do it:', followed by numbered steps, a 'Before you do this' checklist for risky tasks, and copyable drafts.",
            "",
            "#### 3. Strict Limitations & What I CANNOT Do:",
            "- Cannot execute terminal commands, modify cloud infrastructure, or deploy code.",
            "- Cannot send live notifications, SMS, emails, or trigger alert webhooks directly.",
            "- Cannot browse authenticated/logged-in private web accounts.",
            "- Cannot access local files that have not been uploaded to the Knowledge Base.",
            "- Cannot make airline bookings, reserve hotels, order products, or make purchases.",
        ])

        return "\n".join(lines)


# Global Singleton Registry
registry = ToolRegistry()
