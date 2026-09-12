import json
import logging
import uuid
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command

from app.agent.graph import create_agent_graph, memory_saver
from app.agent.llm import get_llm
from app.db.session import AsyncSessionLocal
from app.models.conversation import Conversation, Message
from app.models.task import Task
from app.retrieval.service import similarity_search

logger = logging.getLogger("ambientai.ws")
router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, conversation_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[conversation_id] = websocket
        logger.info(f"WebSocket connected for conversation: {conversation_id}")

    def disconnect(self, conversation_id: str):
        if conversation_id in self.active_connections:
            del self.active_connections[conversation_id]
            logger.info(f"WebSocket disconnected for conversation: {conversation_id}")

    async def send_json(self, websocket: WebSocket, data: Dict[str, Any]):
        await websocket.send_text(json.dumps(data))


manager = ConnectionManager()


@router.websocket("/ws/chat/{conversation_id}")
async def chat_websocket_endpoint(websocket: WebSocket, conversation_id: str):
    await manager.connect(conversation_id, websocket)
    graph = create_agent_graph(checkpointer=memory_saver)
    thread_config = {"configurable": {"thread_id": conversation_id}}

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                await manager.send_json(
                    websocket,
                    {"type": "error", "error": "Invalid JSON format"},
                )
                continue

            event_type = payload.get("type", "message")

            # 1. Ping / Pong
            if event_type == "ping":
                await manager.send_json(websocket, {"type": "pong"})
                continue

            # 2. Resuming HITL Approval
            elif event_type == "approval_response":
                decision = payload.get("decision", "rejected")  # "approved" or "rejected"
                task_id = payload.get("task_id", str(uuid.uuid4()))

                await manager.send_json(
                    websocket,
                    {
                        "type": "status",
                        "status": "processing",
                        "content": f"Resuming execution with decision: {decision}...",
                    },
                )

                # Resume the interrupted graph
                resume_cmd = Command(resume={"action": decision})
                res = graph.invoke(resume_cmd, config=thread_config)

                output_msg = res["messages"][-1].content
                # Stream the final response
                await manager.send_json(
                    websocket,
                    {"type": "token", "content": output_msg},
                )
                await manager.send_json(
                    websocket,
                    {
                        "type": "complete",
                        "status": "completed" if decision == "approved" else "rejected",
                        "task_id": task_id,
                    },
                )

                # Update database task status if conversation is in DB
                try:
                    async with AsyncSessionLocal() as db:
                        conv_uuid = uuid.UUID(conversation_id)
                        task = Task(
                            conversation_id=conv_uuid,
                            status="approved" if decision == "approved" else "rejected",
                        )
                        db.add(task)
                        assistant_msg = Message(
                            conversation_id=conv_uuid,
                            role="assistant",
                            content=output_msg,
                        )
                        db.add(assistant_msg)
                        await db.commit()
                except Exception as db_err:
                    logger.debug(f"DB task record note: {db_err}")

            # 3. New User Message
            elif event_type == "message":
                user_text = payload.get("content", "").strip()
                task_id = payload.get("task_id", str(uuid.uuid4()))

                if not user_text:
                    continue

                await manager.send_json(
                    websocket,
                    {
                        "type": "status",
                        "status": "processing",
                        "content": "Analyzing request...",
                        "task_id": task_id,
                    },
                )

                # Check for RAG context in pgvector
                context_chunks = []
                try:
                    async with AsyncSessionLocal() as db:
                        chunks = await similarity_search(user_text, db=db, limit=2)
                        context_chunks = [c.content for c in chunks]
                except Exception as e:
                    logger.debug(f"RAG search note: {e}")

                augmented_text = user_text
                if context_chunks:
                    rag_context = "\n".join(context_chunks)
                    augmented_text = f"Context from knowledge base:\n{rag_context}\n\nUser Question:\n{user_text}"

                # Persist user message to DB
                try:
                    async with AsyncSessionLocal() as db:
                        conv_uuid = uuid.UUID(conversation_id)
                        msg_record = Message(
                            conversation_id=conv_uuid,
                            role="user",
                            content=user_text,
                        )
                        db.add(msg_record)
                        await db.commit()
                except Exception as db_err:
                    logger.debug(f"DB message record note: {db_err}")

                # Run the LangGraph StateGraph
                state = {
                    "messages": [HumanMessage(content=augmented_text)],
                    "task_id": task_id,
                    "requires_approval": False,
                    "approval_prompt": None,
                    "approval_status": None,
                    "action_type": None,
                }

                # Invoke graph up to interrupt or END
                graph.invoke(state, config=thread_config)
                snapshot = graph.get_state(thread_config)

                # Check if graph paused on interrupt
                if snapshot.tasks and len(snapshot.tasks) > 0 and snapshot.tasks[0].interrupts:
                    interrupt_val = snapshot.tasks[0].interrupts[0].value
                    prompt = interrupt_val.get("prompt", "Approval required")
                    await manager.send_json(
                        websocket,
                        {
                            "type": "interrupt",
                            "status": "awaiting_approval",
                            "prompt": prompt,
                            "task_id": task_id,
                        },
                    )
                else:
                    # Standard completion: stream tokens using LLM
                    llm = get_llm()
                    full_response = ""
                    try:
                        async for chunk in llm.astream([HumanMessage(content=augmented_text)]):
                            token_text = chunk.content if hasattr(chunk, "content") else str(chunk)
                            if token_text:
                                full_response += token_text
                                await manager.send_json(
                                    websocket,
                                    {
                                        "type": "token",
                                        "content": token_text,
                                        "task_id": task_id,
                                    },
                                )
                    except Exception as stream_err:
                        logger.warning(f"Streaming token error: {stream_err}. Falling back to invoke.")
                        res = llm.invoke([HumanMessage(content=augmented_text)])
                        full_response = res.content
                        await manager.send_json(
                            websocket,
                            {"type": "token", "content": full_response, "task_id": task_id},
                        )

                    # Mark completed
                    await manager.send_json(
                        websocket,
                        {
                            "type": "complete",
                            "status": "completed",
                            "task_id": task_id,
                        },
                    )

                    # Persist assistant response to DB
                    try:
                        async with AsyncSessionLocal() as db:
                            conv_uuid = uuid.UUID(conversation_id)
                            msg_record = Message(
                                conversation_id=conv_uuid,
                                role="assistant",
                                content=full_response,
                            )
                            db.add(msg_record)
                            await db.commit()
                    except Exception as db_err:
                        logger.debug(f"DB assistant record note: {db_err}")

    except WebSocketDisconnect:
        manager.disconnect(conversation_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(conversation_id)
