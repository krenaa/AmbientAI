import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token


def test_ws_end_to_end_advisor():
    client = TestClient(app)
    token = create_access_token({"sub": "test-devops-user"})

    queries = [
        ("Send an alert to the team: PostgreSQL storage is above 90%", True),
        ("Deploy payments-api v2.1 to staging", True),
        ("What is continuous deployment", False),
    ]

    for query, is_action in queries:
        conv_id = f"test-conv-{abs(hash(query))}"
        with client.websocket_connect(f"/ws/chat/{conv_id}?token={token}") as websocket:
            websocket.send_text(
                json.dumps({
                    "type": "message",
                    "content": query,
                    "task_id": "task-test-1",
                    "model": "openai/gpt-oss-20b",
                })
            )

            received_types = []
            tokens = []

            while True:
                msg = websocket.receive_text()
                data = json.loads(msg)
                msg_type = data.get("type")
                received_types.append(msg_type)

                if msg_type == "token":
                    tokens.append(data.get("content", ""))
                elif msg_type == "complete":
                    break
                elif msg_type == "interrupt":
                    raise AssertionError("FAIL: Received 'interrupt' event! HITL approval must not appear.")

            full_reply = "".join(tokens)
            print(f"\n==========================================")
            print(f"QUERY: {query}")
            print(f"==========================================")
            print(full_reply[:400] + ("..." if len(full_reply) > 400 else ""))

            # Confirm no approval step appeared
            assert "interrupt" not in received_types, "No approval step must appear"
            assert "complete" in received_types, "Must complete successfully"

            # Check that action requests do NOT claim simulated or executed
            if is_action:
                assert "Simulated: no real" not in full_reply
                assert "Action executed" not in full_reply
                # Verify that advisor guidance intro or steps are present
                assert ("I can't execute this myself" in full_reply or "how to do it" in full_reply or "1." in full_reply)
            else:
                # Normal explanation query
                assert "continuous deployment" in full_reply.lower() or "cd" in full_reply.lower()

    print("\nAll 3 WebSocket advisor tests PASSED successfully!")


if __name__ == "__main__":
    test_ws_end_to_end_advisor()
