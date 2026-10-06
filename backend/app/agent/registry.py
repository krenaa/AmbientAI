from enum import Enum
from typing import Callable, List, Optional, Dict, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger("ambientai.agent.registry")


class ToolRisk(str, Enum):
    READ_ONLY = "READ_ONLY"      # Never requires human approval
    SIDE_EFFECT = "SIDE_EFFECT"  # Modifies state, contacts people, spends funds, or deploys -> requires HITL approval


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
        """Determines if the user's explicit query contains intent keywords for this tool."""
        if not self.explicit_intent_keywords:
            return False
        q_lower = user_query.lower()
        return any(kw.lower() in q_lower for kw in self.explicit_intent_keywords)


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
        2. Always provide READ_ONLY tools matching standard inquiry.
        3. Expose SIDE_EFFECT tools ONLY if the user's explicit text contains target intent keywords.
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

        # Default multi-tool gating:
        # Include READ_ONLY tools
        available: List[ToolDefinition] = [t for t in self._tools.values() if t.risk == ToolRisk.READ_ONLY]

        # Gate SIDE_EFFECT tools: ONLY include if query explicitly matches intent keywords
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
