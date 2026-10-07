import re
from enum import Enum
from typing import Callable, List, Optional, Dict, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger("ambientai.agent.registry")


class ToolRisk(str, Enum):
    READ_ONLY = "READ_ONLY"      # Never requires human approval
    SIDE_EFFECT = "SIDE_EFFECT"  # Modifies state, contacts people, spends funds, or deploys -> requires HITL approval


QUESTION_EXPLANATION_PREFIXES = (
    "what", "how", "why", "when", "which", "where", "who", "whom", "whose",
    "explain", "describe", "compare", "difference", "clarify", "summarize",
    "can you explain", "could you explain", "tell me about", "tell me what", "tell me how",
)

IMPERATIVE_VERBS = (
    "deploy", "release", "ship", "roll out", "send", "raise", "trigger",
    "notify", "write", "transfer", "payout", "pay", "execute",
)

GOVERNED_INTENT_PATTERNS = {
    "deploy_service": re.compile(r"\b(?:deploy|release|ship|roll\s*out)\b", re.IGNORECASE),
    "send_alert": re.compile(
        r"(?:\b(?:send|raise|trigger)\b[\w\s]{0,25}\b(?:alert|notify|notification)\b|\bnotify\b)",
        re.IGNORECASE,
    ),
    "send_external_notification": re.compile(
        r"(?:\b(?:send|raise|trigger)\b[\w\s]{0,25}\b(?:alert|notify|notification)\b|\bnotify\b)",
        re.IGNORECASE,
    ),
    "send_email": re.compile(r"\b(?:send|write)\b[\w\s]{0,20}\bemail\b", re.IGNORECASE),
    "execute_fund_transfer_or_payout": re.compile(r"\b(?:transfer|payout|pay)\b", re.IGNORECASE),
}


def is_question_or_explanation(query: str) -> bool:
    """Detects whether a user prompt is asking a question or seeking an explanation.
    If True, governed (state-changing) tools must NEVER be bound or triggered.
    Rule 1: Starts with what/how/why/when/which/where/explain/describe/compare/difference.
    Rule 2: Ends with '?' and does NOT contain an imperative verb at the root command.
    """
    clean = re.sub(r"^[\s\"'`]+", "", query).lower().strip()
    if not clean:
        return False

    # Check question / explanation prefixes
    for pfx in QUESTION_EXPLANATION_PREFIXES:
        if clean.startswith(pfx):
            return True

    # Check trailing '?'
    if clean.endswith("?") or re.search(r"\?\s*$", clean):
        has_imperative = any(re.search(rf"\b{re.escape(verb)}\b", clean) for verb in IMPERATIVE_VERBS)
        if not has_imperative:
            return True

    return False


@dataclass
class ToolDefinition:
    name: str
    description: str
    risk: ToolRisk
    func: Callable
    explicit_intent_keywords: List[str] = field(default_factory=list)
    target_param: Optional[str] = None  # Argument identifying target/recipient
    category: str = "general"

    def is_triggered_by(self, user_query: str) -> bool:
        """Determines if the user's explicit query contains intent for this tool."""
        # Governed side-effect tools must NEVER be triggered by questions or explanations
        if self.risk == ToolRisk.SIDE_EFFECT:
            if is_question_or_explanation(user_query):
                return False

            if self.name in GOVERNED_INTENT_PATTERNS:
                return bool(GOVERNED_INTENT_PATTERNS[self.name].search(user_query))

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
        return [t for t in self._tools.values() if t.risk == ToolRisk.SIDE_EFFECT]

    def filter_tools_for_query(self, query: str, mode: Optional[str] = None) -> List[ToolDefinition]:
        """Strict deterministic tool gating:
        1. If mode chip is set, strictly restrict to that category.
        2. If message is a question or explanation, bind ONLY read-only tools.
        3. For imperative messages, bind governed tools only if their intent regex matches.
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

        read_only = self.get_read_only_tools()

        # Bug 1 Gate 1: If question or explanation, bind ONLY read-only tools
        if is_question_or_explanation(query):
            return read_only

        # Bug 1 Gate 2: For imperative messages, bind governed tool only if regex matches
        available: List[ToolDefinition] = list(read_only)
        for tool_def in self.get_side_effect_tools():
            if tool_def.is_triggered_by(query):
                available.append(tool_def)

        return available

    def format_capabilities_summary(self) -> str:
        """Dynamically generates capabilities documentation for the LLM system prompt and 'what can you do' queries."""
        read_only = self.get_read_only_tools()
        side_effect = self.get_side_effect_tools()

        lines = [
            "### AmbientDesk AI Agent Capabilities & Tool Registry",
            "",
            "#### 1. Read-Only Intelligence Tools (Autonomous Execution - No Approval Needed):",
        ]
        for t in read_only:
            lines.append(f"- **`{t.name}`**: {t.description.splitlines()[0]}")

        lines.extend([
            "",
            "#### 2. Governed Action Tools (Human-in-the-Loop Approval Required Before Execution):",
        ])
        for t in side_effect:
            lines.append(f"- **`{t.name}`**: {t.description.splitlines()[0]}")

        lines.extend([
            "",
            "#### 3. Strict Limitations & What I CANNOT Do:",
            "- Cannot browse authenticated/logged-in private web accounts.",
            "- Cannot execute arbitrary bash/powershell terminal commands or malicious scripts.",
            "- Cannot access local files that have not been uploaded to the Knowledge Base.",
            "- Cannot make airline bookings, reserve hotels, order products, or make purchases without an authorized API.",
            "- Cannot fabricate real-time data if live web search returns no results.",
        ])

        return "\n".join(lines)


# Global Singleton Registry
registry = ToolRegistry()
