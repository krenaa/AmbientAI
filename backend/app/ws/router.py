import asyncio
from datetime import datetime, timezone
import json
import logging
import re
import time
import uuid
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy import select

from app.agent.doc_matcher import (
    find_matching_document,
    fetch_document_content,
    get_all_indexed_documents,
)
from app.agent.graph import create_agent_graph, memory_saver
from app.agent.llm import get_llm
from app.agent.math_solver import handle_math_calculation
from app.agent.prompts import (
    build_system_instruction,
    check_graceful_refusal,
    is_what_can_you_do_query,
    format_what_can_you_do_summary,
)
from app.agent.registry import registry, ToolRisk
from app.agent.tools import calculate_expression, web_search
from app.core.config import get_settings
from app.core.security import decode_access_token, verify_clerk_token
from app.db.session import AsyncSessionLocal
from app.models.conversation import Conversation, Message
from app.models.execution import Execution
from app.models.task import Task
from app.retrieval.service import similarity_search

logger = logging.getLogger("ambientai.ws")
router = APIRouter()
settings = get_settings()


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


async def save_message_to_db(
    conversation_id_str: str,
    role: str,
    content: str,
    user_id: Optional[str] = None,
    default_title: Optional[str] = None,
):
    """Safely ensures the conversation exists and persists a message to the database."""
    try:
        try:
            conv_uuid = uuid.UUID(conversation_id_str)
        except ValueError:
            conv_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, conversation_id_str)

        async with AsyncSessionLocal() as db:
            conv = await db.get(Conversation, conv_uuid)
            clean_title = (default_title or content[:40] or "New Chat").strip()
            effective_user_id = user_id or "anonymous"

            if not conv:
                conv = Conversation(
                    id=conv_uuid,
                    user_id=effective_user_id,
                    title=clean_title[:80],
                )
                db.add(conv)
                await db.commit()
                logger.info(f"Auto-created conversation {conv_uuid} for user '{effective_user_id}' titled '{conv.title}'")
            elif role == "user" and (
                conv.title in ["New Conversation", "General Workspace", "New Chat", "Untitled Conversation"]
                or conv.title.startswith("Chat ")
            ):
                conv.title = clean_title[:80]
                await db.commit()
                logger.info(f"Updated conversation {conv_uuid} title to '{conv.title}'")

            msg = Message(
                conversation_id=conv_uuid,
                role=role,
                content=content,
            )
            db.add(msg)
            await db.commit()
            logger.info(f"Successfully saved {role} message to DB for conversation {conv_uuid}")
    except Exception as e:
        logger.error(f"Failed to persist {role} message to DB: {e}", exc_info=True)


async def get_conversation_history(
    conversation_id_str: str,
    user_id: Optional[str] = None,
    limit: int = 10,
) -> list:
    """Retrieves recent conversation messages to provide multi-turn context scoped by user."""
    try:
        try:
            conv_uuid = uuid.UUID(conversation_id_str)
        except ValueError:
            conv_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, conversation_id_str)

        async with AsyncSessionLocal() as db:
            if user_id:
                conv = await db.get(Conversation, conv_uuid)
                if conv and conv.user_id != user_id:
                    logger.warning(f"User {user_id} unauthorized to access history of conversation {conv_uuid}")
                    return []

            stmt = (
                select(Message)
                .where(Message.conversation_id == conv_uuid)
                .order_by(Message.created_at.desc())
                .limit(limit + 1)
            )
            res = await db.execute(stmt)
            raw_msgs = list(reversed(res.scalars().all()))

            # Exclude the current message if it was just saved
            prior_msgs = raw_msgs[:-1] if len(raw_msgs) > 1 else []

            history_langchain = []
            for msg in prior_msgs:
                if msg.role == "user":
                    history_langchain.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    history_langchain.append(AIMessage(content=msg.content))
            return history_langchain
    except Exception as e:
        logger.error(f"Error retrieving conversation history: {e}")
        return []


@router.websocket("/ws/chat/{conversation_id}")
async def chat_websocket_endpoint(websocket: WebSocket, conversation_id: str):
    token = websocket.query_params.get("token")
    user_id: Optional[str] = None

    if token:
        try:
            if settings.CLERK_JWKS_URL:
                try:
                    user_id = verify_clerk_token(token)
                except Exception:
                    payload = decode_access_token(token)
                    if payload and payload.get("sub"):
                        user_id = str(payload["sub"])
            else:
                payload = decode_access_token(token)
                if payload and payload.get("sub"):
                    user_id = str(payload["sub"])
        except Exception as auth_err:
            logger.warning(f"WebSocket auth failed: {auth_err}")
            user_id = None

    if not user_id:
        logger.warning(f"Closing unauthorized WebSocket for conversation: {conversation_id}")
        await websocket.close(code=4401, reason="Unauthorized: Invalid or missing Clerk session token")
        return

    await manager.connect(conversation_id, websocket)
    graph = create_agent_graph(checkpointer=memory_saver)
    thread_config = {"configurable": {"thread_id": f"{user_id}:{conversation_id}"}}

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

            # 2. Stop / Abort Request
            elif event_type == "stop":
                logger.info(f"Received stop request for conversation {conversation_id}")
                await manager.send_json(
                    websocket,
                    {
                        "type": "complete",
                        "status": "stopped",
                    },
                )
                continue

            # 4. New User Message
            elif event_type == "message":
                user_text = payload.get("content", "").strip()
                task_id = payload.get("task_id", str(uuid.uuid4()))
                selected_model = payload.get("model")
                if selected_model:
                    lowered = selected_model.lower()
                    if "llama" in lowered or "mixtral" in lowered or "gemma" in lowered:
                        selected_model = "openai/gpt-oss-20b"
                    elif "gemini" in lowered and "lite" not in lowered:
                        selected_model = "gemini-2.5-flash-lite"
                else:
                    selected_model = "openai/gpt-oss-20b"

                if not user_text:
                    continue

                start_perf = time.perf_counter()
                execution_uuid = uuid.uuid4()

                # Persist execution start in DB immediately (Requirement 7)
                try:
                    async with AsyncSessionLocal() as db:
                        new_exec = Execution(
                            id=execution_uuid,
                            user_id=user_id,
                            session_id=conversation_id,
                            status="running",
                            started_at=datetime.now(timezone.utc),
                        )
                        db.add(new_exec)
                        await db.commit()
                except Exception as exec_init_err:
                    logger.debug(f"Execution start persist note: {exec_init_err}")

                async def finalize_execution(status: str, tool_used: Optional[str] = None):
                    dur_ms = int((time.perf_counter() - start_perf) * 1000)
                    try:
                        async with AsyncSessionLocal() as db:
                            rec = await db.get(Execution, execution_uuid)
                            if rec:
                                rec.status = status
                                rec.finished_at = datetime.now(timezone.utc)
                                rec.duration_ms = dur_ms
                                if tool_used:
                                    rec.tool_used = tool_used
                                await db.commit()
                    except Exception as fin_err:
                        logger.debug(f"Execution finalize note: {fin_err}")

                await manager.send_json(
                    websocket,
                    {
                        "type": "status",
                        "status": "processing",
                        "content": "Analyzing request...",
                        "task_id": task_id,
                    },
                )

                # Persist user message to DB immediately
                await save_message_to_db(
                    conversation_id,
                    "user",
                    user_text,
                    user_id=user_id,
                    default_title=user_text[:30],
                )

                # Retrieve conversation history
                conversation_history = await get_conversation_history(conversation_id, user_id=user_id, limit=10)

                # Retrieve currently indexed documents across knowledge base
                available_docs = get_all_indexed_documents()
                system_instruction = build_system_instruction(available_docs)

                # -------------------------------------------------------------
                # DETERMINISTIC CHECK A: Capability Refusal (Requirement 3)
                # -------------------------------------------------------------
                refusal_msg = check_graceful_refusal(user_text)
                if refusal_msg:
                    await manager.send_json(websocket, {"type": "token", "content": refusal_msg, "task_id": task_id})
                    await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                    await save_message_to_db(conversation_id, "assistant", refusal_msg, user_id=user_id)
                    await finalize_execution(status="completed", tool_used="capability_refusal")
                    continue

                # -------------------------------------------------------------
                # DETERMINISTIC CHECK B: "What Can You Do?" (Requirement 3)
                # -------------------------------------------------------------
                if is_what_can_you_do_query(user_text):
                    cap_msg = format_what_can_you_do_summary()
                    await manager.send_json(websocket, {"type": "token", "content": cap_msg, "task_id": task_id})
                    await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                    await save_message_to_db(conversation_id, "assistant", cap_msg, user_id=user_id)
                    await finalize_execution(status="completed", tool_used="capability_overview")
                    continue

                # -------------------------------------------------------------
                # DETERMINISTIC CHECK C: Math / Calculator / Interest (Requirement 4)
                # -------------------------------------------------------------
                math_result = handle_math_calculation(user_text)
                if math_result:
                    await manager.send_json(websocket, {"type": "token", "content": math_result, "task_id": task_id})
                    await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                    await save_message_to_db(conversation_id, "assistant", math_result, user_id=user_id)
                    await finalize_execution(status="completed", tool_used="ast_math")
                    continue

                # -------------------------------------------------------------
                # DETERMINISTIC CHECK D: Document-Aware Q&A (Requirement 5)
                # -------------------------------------------------------------
                matched_doc, detected_ref = find_matching_document(user_text, available_docs)
                if detected_ref:
                    if matched_doc:
                        doc_filename = matched_doc["filename"]
                        doc_content, chunk_count = fetch_document_content(doc_filename)

                        if chunk_count == 0:
                            zero_chunk_msg = (
                                f"Document **{doc_filename}** exists in your history, but indexing failed and contains 0 chunks. "
                                "Please delete and re-upload it via the Knowledge Base panel."
                            )
                            await manager.send_json(websocket, {"type": "token", "content": zero_chunk_msg, "task_id": task_id})
                            await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                            await save_message_to_db(conversation_id, "assistant", zero_chunk_msg, user_id=user_id)
                            await finalize_execution(status="completed", tool_used="doc_rag_failed")
                            continue

                        await manager.send_json(
                            websocket,
                            {
                                "type": "status",
                                "status": "processing",
                                "content": f"Analyzing document '{doc_filename}'...",
                                "task_id": task_id,
                            },
                        )

                        messages_to_llm = (
                            [SystemMessage(content=system_instruction)]
                            + conversation_history
                            + [
                                HumanMessage(
                                    content=(
                                        f"The user is asking about the document '{doc_filename}'.\n\n"
                                        f"--- DOCUMENT CONTENT: '{doc_filename}' ---\n"
                                        f"{doc_content}\n"
                                        f"--- END DOCUMENT CONTENT ---\n\n"
                                        f"User Question:\n{user_text}\n\n"
                                        "Answer the user's question accurately based on the document content above."
                                    )
                                )
                            ]
                        )

                        # Stream tokens with chosen model
                        llm = get_llm(model_id=selected_model)
                        doc_answer = ""
                        try:
                            async for chunk in llm.astream(messages_to_llm):
                                t_text = chunk.content if hasattr(chunk, "content") else str(chunk)
                                if t_text:
                                    doc_answer += t_text
                                    await manager.send_json(
                                        websocket,
                                        {"type": "token", "content": t_text, "task_id": task_id},
                                    )
                        except Exception as doc_stream_err:
                            logger.warning(f"Error streaming document Q&A: {doc_stream_err}")
                            if not doc_answer:
                                doc_answer = "Encountered an inference error analyzing the document. Please retry with an alternative model."
                                await manager.send_json(
                                    websocket,
                                    {"type": "token", "content": doc_answer, "task_id": task_id},
                                )

                        await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                        await save_message_to_db(conversation_id, "assistant", doc_answer, user_id=user_id)
                        await finalize_execution(status="completed", tool_used="doc_rag")
                        continue

                    else:
                        # Document was explicitly named, but NOT found in indexed documents
                        doc_list_md = (
                            "\n".join(f"- `{d['filename']}` ({d.get('chunks_count', 0)} chunks)" for d in available_docs)
                            if available_docs
                            else "No documents currently indexed."
                        )
                        missing_doc_msg = (
                            f"Document **{detected_ref}** was not found in your indexed documents.\n\n"
                            f"**Currently Available Documents:**\n{doc_list_md}\n\n"
                            f"> 📁 **To analyze '{detected_ref}'**: Please upload it via the **Knowledge Base** panel in the sidebar."
                        )
                        await manager.send_json(websocket, {"type": "token", "content": missing_doc_msg, "task_id": task_id})
                        await manager.send_json(websocket, {"type": "complete", "status": "completed", "task_id": task_id})
                        await save_message_to_db(conversation_id, "assistant", missing_doc_msg, user_id=user_id)
                        await finalize_execution(status="completed", tool_used="doc_not_found")
                        continue

                # -------------------------------------------------------------
                # DETERMINISTIC CHECK E: Live Web Search or General Inquiry
                # -------------------------------------------------------------
                lowered_text = user_text.lower().strip()
                is_web_search = False
                search_query = ""

                explicit_prefixes = [
                    "search the live web for:", "search the live web for", "search the live web:", "search the live web",
                    "search the web for:", "search the web for", "search the web:", "search the web",
                    "search live web:", "search live web", "search web for:", "search web for", "search web:", "search web",
                    "web search:", "web search for:", "web search",
                ]
                for pfx in explicit_prefixes:
                    if lowered_text.startswith(pfx):
                        is_web_search = True
                        search_query = user_text[len(pfx):].strip(" :")
                        break

                if not is_web_search:
                    search_verbs = ["search", "serch", "lookup", "look up", "browse", "google", "find online", "fetch online"]
                    has_search_verb = any(v in lowered_text for v in search_verbs)
                    live_keywords = [
                        "latest", "recent", "current", "today", "breaking",
                        "real-time", "realtime", "headlines", "weather", "stock price", "scores"
                    ]
                    has_live_keyword = any(k in lowered_text for k in live_keywords)

                    if has_search_verb:
                        match = re.search(
                            r"(?:please\s+)?(?:search|serch)\s+(?:the\s+)?(?:live\s+)?(?:web|internet|online)?\s*(?:for\s+)?(.+)",
                            user_text,
                            re.IGNORECASE,
                        )
                        if match and match.group(1).strip():
                            is_web_search = True
                            search_query = match.group(1).strip(" :")
                    elif has_live_keyword and any(term in lowered_text for term in ["news", "weather", "today", "latest", "breaking", "update", "updates"]):
                        cleaned = re.sub(r"^(?:can\s+you\s+)?(?:please\s+)?(?:give|tell|show|fetch|get|find)\s+(?:me\s+)?", "", user_text, flags=re.IGNORECASE).strip(" :")
                        is_web_search = True
                        search_query = cleaned or user_text

                tool_executed_name = "general_inference"

                if is_web_search:
                    effective_query = search_query if search_query else user_text
                    tool_executed_name = "web_search"
                    await manager.send_json(
                        websocket,
                        {
                            "type": "status",
                            "status": "processing",
                            "content": f"Searching live web for: '{effective_query[:40]}'...",
                            "task_id": task_id,
                        },
                    )

                    try:
                        search_results = await asyncio.to_thread(web_search.invoke, effective_query)
                    except Exception as search_err:
                        logger.error(f"Error during live web search: {search_err}")
                        search_results = f"Search temporarily unavailable: {search_err}"

                    await manager.send_json(
                        websocket,
                        {
                            "type": "status",
                            "status": "processing",
                            "content": "Synthesizing live web insights...",
                            "task_id": task_id,
                        },
                    )

                    messages_to_llm = (
                        [SystemMessage(content=system_instruction)]
                        + conversation_history
                        + [
                            HumanMessage(
                                content=(
                                    f"Live Web Search Results for query '{effective_query}':\n"
                                    f"{search_results}\n\n"
                                    f"Original User Request:\n{user_text}\n\n"
                                    "Synthesize these live search findings and present a comprehensive answer. "
                                    "Include clickable markdown links with sources in format `[Source Title](URL)`."
                                )
                            )
                        ]
                    )

                else:
                    # General inquiry or standard conversational turn
                    context_chunks = []
                    is_followup = bool(conversation_history) and len(user_text.split()) <= 6
                    if not is_followup:
                        try:
                            async with AsyncSessionLocal() as db:
                                chunks = await similarity_search(user_text, db=db, limit=2)
                                context_chunks = [c.content for c in chunks]
                        except Exception as rag_err:
                            logger.debug(f"Similarity search note: {rag_err}")

                    augmented_prompt = user_text
                    if context_chunks:
                        rag_text = "\n".join(context_chunks)
                        augmented_prompt = f"Context from indexed knowledge base:\n{rag_text}\n\nUser Question:\n{user_text}"
                        tool_executed_name = "pgvector_rag"

                    messages_to_llm = (
                        [SystemMessage(content=system_instruction)]
                        + conversation_history
                        + [HumanMessage(content=augmented_prompt)]
                    )

                # Standard completion: stream tokens using chosen model
                llm = get_llm(model_id=selected_model)
                full_response = ""
                try:
                    async for chunk in llm.astream(messages_to_llm):
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
                    logger.warning(f"Streaming error with model '{selected_model}': {stream_err}. Suggesting fallback.")
                    fallback_id = "gemini-2.5-flash-lite" if selected_model == "openai/gpt-oss-20b" else "openai/gpt-oss-20b"
                    fallback_name = "Google Gemini 2.5 Flash Lite" if fallback_id == "gemini-2.5-flash-lite" else "Groq: GPT-OSS 20B"

                    await manager.send_json(
                        websocket,
                        {
                            "type": "model_fallback",
                            "failed_model": selected_model or "default",
                            "suggested_model": fallback_id,
                            "suggested_name": fallback_name,
                            "message": f"Model error encountered. Switched to suggested model: {fallback_name}.",
                            "task_id": task_id,
                        },
                    )

                    try:
                        fallback_llm = get_llm(model_id=fallback_id)
                        async for chunk in fallback_llm.astream(messages_to_llm):
                            token_text = chunk.content if hasattr(chunk, "content") else str(chunk)
                            if token_text:
                                full_response += token_text
                                await manager.send_json(
                                    websocket,
                                    {"type": "token", "content": token_text, "task_id": task_id},
                                )
                    except Exception as fb_err:
                        logger.error(f"Fallback model execution error: {fb_err}")
                        if not full_response:
                            full_response = (
                                "> ⚠️ **Notice**: AI inference is temporarily rate-limited. "
                                "Please wait a moment and try again."
                            )
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
                if full_response:
                    await save_message_to_db(
                        conversation_id,
                        "assistant",
                        full_response,
                        user_id=user_id,
                    )

                # Finalize execution in DB (Requirement 7)
                await finalize_execution(status="completed", tool_used=tool_executed_name)

    except WebSocketDisconnect:
        manager.disconnect(conversation_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(conversation_id)
