import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.registry import registry, is_question_or_explanation, ToolRisk
from app.agent.prompts import (
    is_what_can_you_do_query,
    format_what_can_you_do_summary,
)
from app.agent.graph import (
    check_intent,
    validate_and_parse_deploy,
    validate_and_parse_alert,
    execute_and_respond,
)
from app.agent.tools import deploy_service, send_alert


def test_question_no_tool_call_continuous_deployment():
    """Prompt: 'What is continuous deployment and how does a blue-green deploy work?'
    Expected: answered from knowledge or web search, with NO tool call.
    """
    query = "What is continuous deployment and how does a blue-green deploy work?"
    assert is_question_or_explanation(query) is True

    filtered_tools = registry.filter_tools_for_query(query)
    # Governed tools must NEVER be bound for questions
    for tool_def in filtered_tools:
        assert tool_def.risk != ToolRisk.SIDE_EFFECT

    state = {"user_query": query, "messages": []}
    res = check_intent(state)
    assert res.get("requires_approval") is False
    assert res.get("clarification_needed", False) is False


def test_explain_alerts_no_tool_call():
    """Prompt: 'Explain how alerts work'
    Expected: no tool call.
    """
    query = "Explain how alerts work"
    assert is_question_or_explanation(query) is True

    filtered_tools = registry.filter_tools_for_query(query)
    for tool_def in filtered_tools:
        assert tool_def.risk != ToolRisk.SIDE_EFFECT

    state = {"user_query": query, "messages": []}
    res = check_intent(state)
    assert res.get("requires_approval") is False
    assert res.get("clarification_needed", False) is False


def test_deploy_no_details_asks_clarification():
    """Prompt: 'Deploy' (no details)
    Expected: asks which service/version/environment without showing HITL card.
    """
    query = "Deploy"
    assert is_question_or_explanation(query) is False

    valid, clarify_msg, payload = validate_and_parse_deploy(query)
    assert valid is False
    assert "Which service, version and environment should I deploy?" in clarify_msg

    state = {"user_query": query, "messages": []}
    res = check_intent(state)
    assert res.get("requires_approval") is False
    assert res.get("clarification_needed") is True
    assert "Which service, version and environment should I deploy?" in res.get("clarification_message", "")


def test_deploy_valid_args_triggers_hitl_card():
    """Prompt: 'Deploy payments-api v2.1 to staging'
    Expected: HITL card with exactly those args.
    """
    query = "Deploy payments-api v2.1 to staging"
    assert is_question_or_explanation(query) is False

    valid, clarify_msg, payload = validate_and_parse_deploy(query)
    assert valid is True
    assert payload == {
        "service_name": "payments-api",
        "version_tag": "v2.1",
        "target_env": "staging",
    }

    state = {"user_query": query, "messages": []}
    res = check_intent(state)
    assert res.get("requires_approval") is True
    assert res.get("tool_name") == "deploy_service"
    assert res.get("target") == "staging"
    assert res.get("payload") == {
        "service_name": "payments-api",
        "version_tag": "v2.1",
        "target_env": "staging",
    }


def test_send_alert_hitl_and_simulated_result():
    """Prompt: 'Send an alert to the team: PostgreSQL storage is above 90%'
    Expected: HITL card, and the final message reflects the real tool result status.
    """
    query = "Send an alert to the team: PostgreSQL storage is above 90%"
    assert is_question_or_explanation(query) is False

    valid, clarify_msg, payload = validate_and_parse_alert(query)
    assert valid is True
    assert "the team" in payload.get("recipient", "").lower()
    assert "postgresql storage is above 90%" in payload.get("message_body", "").lower()

    state = {"user_query": query, "messages": []}
    res = check_intent(state)
    assert res.get("requires_approval") is True
    assert res.get("tool_name") == "send_alert"

    # Simulate approved execution
    tool_exec_res = send_alert.invoke(payload)
    assert isinstance(tool_exec_res, dict)
    assert tool_exec_res.get("status") == "simulated"

    state_approved = {
        "tool_name": "send_alert",
        "payload": payload,
        "target": payload["recipient"],
    }
    exec_res = execute_and_respond(state_approved)
    output_text = exec_res["messages"][0].content
    assert "Simulated: no real send alert was sent" in output_text
    assert "Dispatched successfully to production" not in output_text


def test_what_can_you_do_summary():
    """Prompt: 'What can you do?'
    Expected: plain-language summary with no 'DO NOT call' text.
    """
    query = "What can you do?"
    assert is_what_can_you_do_query(query) is True

    summary = format_what_can_you_do_summary()
    assert "Things I do automatically" in summary
    assert "Things I do after your approval" in summary
    assert "Things I can't do" in summary
    assert "DO NOT call" not in summary


if __name__ == "__main__":
    print("Running test_question_no_tool_call_continuous_deployment...")
    test_question_no_tool_call_continuous_deployment()
    print("PASS: test_question_no_tool_call_continuous_deployment")

    print("Running test_explain_alerts_no_tool_call...")
    test_explain_alerts_no_tool_call()
    print("PASS: test_explain_alerts_no_tool_call")

    print("Running test_deploy_no_details_asks_clarification...")
    test_deploy_no_details_asks_clarification()
    print("PASS: test_deploy_no_details_asks_clarification")

    print("Running test_deploy_valid_args_triggers_hitl_card...")
    test_deploy_valid_args_triggers_hitl_card()
    print("PASS: test_deploy_valid_args_triggers_hitl_card")

    print("Running test_send_alert_hitl_and_simulated_result...")
    test_send_alert_hitl_and_simulated_result()
    print("PASS: test_send_alert_hitl_and_simulated_result")

    print("Running test_what_can_you_do_summary...")
    test_what_can_you_do_summary()
    print("PASS: test_what_can_you_do_summary")

    print("\nALL 6 TEST CASES PASSED SUCCESSFULLY!")
