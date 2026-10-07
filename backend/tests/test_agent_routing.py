import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.registry import registry, is_question_or_explanation, ToolRisk
import app.agent.tools  # registers tools in registry
from app.agent.prompts import (
    is_what_can_you_do_query,
    format_what_can_you_do_summary,
    build_system_instruction,
)
from app.agent.llm import get_llm
from langchain_core.messages import SystemMessage, HumanMessage


def test_no_side_effect_tools_in_registry():
    """Verify that simulated execution tools (deploy, send_alert, send_email, etc.)
    have been completely removed from the Tool Registry.
    """
    assert len(registry.get_side_effect_tools()) == 0
    all_names = [t.name for t in registry.get_all()]
    assert "deploy_service" not in all_names
    assert "send_alert" not in all_names
    assert "send_email" not in all_names
    assert "execute_fund_transfer_or_payout" not in all_names

    # Read-only tools must remain
    assert "web_search" in all_names
    assert "knowledge_base_retrieval" in all_names
    assert "calculate_expression" in all_names
    assert "fetch_recent_emails" in all_names


def test_question_what_is_continuous_deployment():
    """Prompt 3: 'What is continuous deployment'
    Expected: answered normally without any approval step.
    """
    query = "What is continuous deployment"
    assert is_question_or_explanation(query) is True

    filtered_tools = registry.filter_tools_for_query(query)
    for tool_def in filtered_tools:
        assert tool_def.risk == ToolRisk.READ_ONLY

    system_instruction = build_system_instruction()
    assert "You are Ambient Agent, an AI assistant for DevOps, engineering and general knowledge questions." in system_instruction
    assert "IMPORTANT: You have NO ability to execute actions." in system_instruction


def test_deploy_action_advisor_guidance():
    """Prompt 2: 'Deploy payments-api v2.1 to staging'
    Expected: advisor step-by-step guidance, no approval step.
    """
    query = "Deploy payments-api v2.1 to staging"
    filtered_tools = registry.filter_tools_for_query(query)
    # Only read-only tools exist
    for tool_def in filtered_tools:
        assert tool_def.risk == ToolRisk.READ_ONLY


def test_send_alert_advisor_guidance():
    """Prompt 1: 'Send an alert to the team: PostgreSQL storage is above 90%'
    Expected: advisor step-by-step guidance, no approval step.
    """
    query = "Send an alert to the team: PostgreSQL storage is above 90%"
    filtered_tools = registry.filter_tools_for_query(query)
    for tool_def in filtered_tools:
        assert tool_def.risk == ToolRisk.READ_ONLY


def test_what_can_you_do_summary_no_hitl():
    """Prompt: 'What can you do?'
    Expected: summary highlights advisor role, with zero HITL or approval mentions.
    """
    query = "What can you do?"
    assert is_what_can_you_do_query(query) is True

    summary = format_what_can_you_do_summary()
    assert "DevOps & Engineering Advisory" in summary
    assert "Live Web Search" in summary
    assert "pgvector RAG" in summary
    assert "AST Math" in summary
    assert "Human-in-the-Loop" not in summary
    assert "after your approval" not in summary


if __name__ == "__main__":
    print("Running test_no_side_effect_tools_in_registry...")
    test_no_side_effect_tools_in_registry()
    print("PASS: test_no_side_effect_tools_in_registry")

    print("Running test_question_what_is_continuous_deployment...")
    test_question_what_is_continuous_deployment()
    print("PASS: test_question_what_is_continuous_deployment")

    print("Running test_deploy_action_advisor_guidance...")
    test_deploy_action_advisor_guidance()
    print("PASS: test_deploy_action_advisor_guidance")

    print("Running test_send_alert_advisor_guidance...")
    test_send_alert_advisor_guidance()
    print("PASS: test_send_alert_advisor_guidance")

    print("Running test_what_can_you_do_summary_no_hitl...")
    test_what_can_you_do_summary_no_hitl()
    print("PASS: test_what_can_you_do_summary_no_hitl")
