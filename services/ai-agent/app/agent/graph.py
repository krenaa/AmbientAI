import logging
from typing import Dict, Any, Literal
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from app.agent.state import AgentState, TriageOutput
from app.agent.llm import get_resilient_llm
from app.agent.tools import ALL_TOOLS

logger = logging.getLogger("ambientdesk.graph")

TRIAGE_SYSTEM_PROMPT = """You are the ambientdesk Task Triage Specialist.
Analyze the user's input and classify the intent into one of:
- direct_answer: General reasoning, conceptual explanations, or simple chit-chat not requiring tools.
- research: Involves current facts, external lookups, URLs, news, or deep queries requiring web search.
- code_generation: Involves writing, debugging, or analyzing software code.
- summarization: Condensing documents, text, or multi-paragraph inputs.

Determine if external tools are strictly necessary."""


async def triage_node(state: AgentState) -> Dict[str, Any]:
    """Classifies user request using structured LLM output with fallback."""
    structured_llm = get_resilient_llm(
        temperature=0.0, structured_schema=TriageOutput
    )

    user_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    latest_query = user_messages[-1].content if user_messages else "No input"

    messages = [
        SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
        HumanMessage(content=f"Task input: {latest_query}"),
    ]

    try:
        triage_result: TriageOutput = await structured_llm.ainvoke(messages)
        return {"triage": triage_result}
    except Exception as e:
        logger.warning(
            f"Structured triage failed, falling back to default direct_answer: {e}"
        )
        return {
            "triage": TriageOutput(
                category="direct_answer",
                requires_tools=False,
                summary=str(latest_query)[:100],
            )
        }


async def agent_node(state: AgentState) -> Dict[str, Any]:
    """Core reasoning node: calls tools or generates final response."""
    llm_with_tools = get_resilient_llm(temperature=0.2, tools=ALL_TOOLS)

    system_instruction = (
        "You are ambientdesk AI, a capable, precise multi-agent assistant.\n"
        "Execute the user's task clearly and concisely. Use tools when factual lookup is needed."
    )

    messages = [SystemMessage(content=system_instruction)] + state["messages"]
    response = await llm_with_tools.ainvoke(messages)

    return {"messages": [response]}


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """Determines whether agent requested tool execution or is ready to finish."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


def build_graph():
    """Compiles the LangGraph state machine workflow."""
    workflow = StateGraph(AgentState)

    workflow.add_node("triage", triage_node)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(ALL_TOOLS))

    workflow.add_edge(START, "triage")
    workflow.add_edge("triage", "agent")

    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            END: END,
        },
    )

    workflow.add_edge("tools", "agent")
    return workflow.compile()


agent_graph = build_graph()   