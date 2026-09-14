import asyncio
import json
import logging
import re
import uuid
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import Command
from sqlalchemy import select

from app.agent.graph import create_agent_graph, memory_saver
from app.agent.llm import get_llm
from app.agent.tools import calculate_expression, web_search
from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.conversation import Conversation, Message
from app.models.task import Task
from app.models.user import User
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


async def save_message_to_db(
    conversation_id_str: str,
    role: str,
    content: str,
    token_str: Optional[str] = None,
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
            if not conv:
                user_id = None
                if token_str:
                    payload = decode_access_token(token_str)
                    if payload and payload.get("sub"):
                        try:
                            user_id = uuid.UUID(str(payload["sub"]))
                        except Exception:
                            pass
                if not user_id:
                    user_stmt = select(User.id).limit(1)
                    user_res = await db.execute(user_stmt)
                    user_id = user_res.scalar_one_or_none()

                clean_title = (default_title or content[:40] or "New Chat").strip()
                if user_id:
                    conv = Conversation(
                        id=conv_uuid,
                        user_id=user_id,
                        title=clean_title[:80],
                    )
                    db.add(conv)
                    await db.commit()
                    logger.info(f"Auto-created conversation {conv_uuid} titled '{conv.title}'")
            elif role == "user" and (
                conv.title in ["New Conversation", "General Workspace", "New Chat", "Untitled Conversation"]
                or conv.title.startswith("Chat ")
            ):
                # Update placeholder title to the prompt reference
                clean_title = (default_title or content[:40] or conv.title).strip()
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
    limit: int = 10,
) -> list:
    """Retrieves recent conversation messages (excluding the in-flight message) to provide multi-turn context."""
    try:
        try:
            conv_uuid = uuid.UUID(conversation_id_str)
        except ValueError:
            conv_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, conversation_id_str)

        async with AsyncSessionLocal() as db:
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
    await manager.connect(conversation_id, websocket)
    token = websocket.query_params.get("token")
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

                # Persist to database
                try:
                    conv_uuid = uuid.UUID(conversation_id)
                except ValueError:
                    conv_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, conversation_id)
                try:
                    async with AsyncSessionLocal() as db:
                        task = Task(
                            conversation_id=conv_uuid,
                            status="approved" if decision == "approved" else "rejected",
                        )
                        db.add(task)
                        await db.commit()
                except Exception as db_err:
                    logger.debug(f"DB task record note: {db_err}")

                await save_message_to_db(
                    conversation_id,
                    "assistant",
                    output_msg,
                    token_str=token,
                )

            # 3. Stop / Abort Request
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

                # Persist user message to DB immediately
                await save_message_to_db(
                    conversation_id,
                    "user",
                    user_text,
                    token_str=token,
                    default_title=user_text[:30],
                )

                # Retrieve multi-turn conversation memory (prior turns)
                conversation_history = await get_conversation_history(conversation_id, limit=10)

                lowered_text = user_text.lower().strip()
                is_explicit_rag = any(
                    kw in lowered_text
                    for kw in [
                        "retrieve internal knowledge",
                        "knowledge base",
                        "internal doc",
                        "pgvector",
                        "ingested doc",
                    ]
                )

                # Only run RAG if explicit RAG or if there's no ongoing history, avoiding hijacking short conversational follow-ups
                context_chunks = []
                is_followup = bool(conversation_history) and len(user_text.split()) <= 6 and not is_explicit_rag
                if not is_followup:
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

                # Run the LangGraph StateGraph with fast intent check
                state = {
                    "messages": [HumanMessage(content=augmented_text)],
                    "task_id": task_id,
                    "requires_approval": False,
                    "approval_prompt": None,
                    "approval_status": None,
                    "action_type": None,
                    "stream_handled": True,
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
                    # Check for tool invocations (Live Web Search, AST Math, or pgvector RAG / Follow-up)
                    # 1. Comprehensive Live Web Search detection
                    is_web_search = False
                    search_query = ""

                    explicit_prefixes = [
                        "search the live web for:",
                        "search the live web for",
                        "search the live web:",
                        "search the live web",
                        "search the web for:",
                        "search the web for",
                        "search the web:",
                        "search the web",
                        "search live web:",
                        "search live web",
                        "search web for:",
                        "search web for",
                        "search web:",
                        "search web",
                        "web search:",
                        "web search for:",
                        "web search",
                    ]
                    for pfx in explicit_prefixes:
                        if lowered_text.startswith(pfx):
                            is_web_search = True
                            search_query = user_text[len(pfx):].strip(" :")
                            break

                    if not is_web_search:
                        # Match natural verbs (including common typos like 'serch')
                        search_verbs = ["search", "serch", "lookup", "look up", "browse", "google", "find online", "fetch online"]
                        has_search_verb = any(v in lowered_text for v in search_verbs)

                        live_keywords = [
                            "latest", "recent", "current", "today", "breaking",
                            "real-time", "realtime", "timing", "timings", "headlines",
                            "news", "weather", "stock price", "scores"
                        ]
                        has_live_keyword = any(k in lowered_text for k in live_keywords)

                        # Contextual follow-up: e.g. "okay serch for it now", "search it", "look it up"
                        is_search_followup = has_search_verb and any(pron in lowered_text for pron in ["it", "this", "them", "that", "now"])

                        if is_search_followup and conversation_history:
                            prior_context = ""
                            for prev_msg in reversed(conversation_history):
                                if hasattr(prev_msg, "content") and prev_msg.content:
                                    prior_context = prev_msg.content[:80]
                                    break
                            clean_prior = re.sub(r"^(?:search\s+(?:the\s+)?(?:live\s+)?web\s+(?:for\s+)?)+", "", prior_context, flags=re.IGNORECASE).strip(" :")
                            clean_followup = re.sub(r"\b(okay|ok|please|serch|search|for|it|now|find|look|up)\b", "", user_text, flags=re.IGNORECASE).strip()
                            effective = f"{clean_prior} {clean_followup}".strip() if clean_followup else f"{clean_prior} latest updates"
                            is_web_search = True
                            search_query = effective
                        elif has_live_keyword and any(term in lowered_text for term in ["news", "weather", "today", "latest", "breaking", "update", "updates", "timing", "timings", "gujarat"]):
                            cleaned = re.sub(r"^(?:can\s+you\s+)?(?:please\s+)?(?:give|tell|show|fetch|get|find)\s+(?:me\s+)?", "", user_text, flags=re.IGNORECASE).strip(" :")
                            if conversation_history and any(w in lowered_text for w in ["timing", "timings", "it", "them", "those", "update", "updates"]):
                                prior_context = ""
                                for prev_msg in reversed(conversation_history):
                                    if hasattr(prev_msg, "content") and prev_msg.content:
                                        prior_context = prev_msg.content[:60]
                                        break
                                clean_prior = re.sub(r"^(?:search\s+(?:the\s+)?(?:live\s+)?web\s+(?:for\s+)?)+", "", prior_context, flags=re.IGNORECASE).strip(" :")
                                cleaned = f"{clean_prior} {cleaned}".strip()
                            is_web_search = True
                            search_query = cleaned or user_text
                        else:
                            # General regex search pattern
                            match = re.search(
                                r"(?:please\s+)?(?:search|serch)\s+(?:the\s+)?(?:live\s+)?(?:web|internet|online)?\s*(?:for\s+)?(.+)",
                                user_text,
                                re.IGNORECASE,
                            )
                            if match and match.group(1).strip():
                                is_web_search = True
                                search_query = match.group(1).strip(" :")

                    messages_to_llm = []

                    system_instruction = (
                        "You are AmbientDesk AI, an elite autonomous multimodal desktop intelligence agent equipped with live internet web search tools, pgvector RAG, and execution capabilities.\n"
                        "You possess full multi-turn conversational memory. When the user asks follow-up questions, refers to previous answers, or asks for refinements (such as timings, specifics, or summaries), seamlessly use the prior conversation history to respond accurately and coherently.\n\n"
                        "MANDATORY OUTPUT FORMATTING & VISUAL PRESENTATION RULES:\n"
                        "1. STRUCTURE WITH TABLES:\n"
                        "   - Whenever explaining concepts, architectures, components, comparisons, chronologies, or analyzing documents, ALWAYS include at least one clean GitHub-flavored Markdown Table (e.g. | Concept / Parameter | Description / Meaning | Key Details / Equation / Metric |).\n"
                        "   - Never dump walls of plain bullet points. Summarize core dimensions, formulas, or features in structured tables.\n"
                        "2. HIGHLIGHT KEY TERMS & VARIABLES:\n"
                        "   - Highlight technical terms, layer names, metrics, parameters, equations, and important keywords using inline code tags (e.g. `Perceptron`, `ReLU`, `O(n)`, `loss_fn`, `pgvector`) or **bold emphasis** throughout your explanations.\n"
                        "3. CALLOUTS & TAKEAWAYS:\n"
                        "   - Include highlighted callout blockquotes for important takeaways, tips, or caveats:\n"
                        "     > **Tip**: Actionable optimization or best practice.\n"
                        "     > **Key Insight**: Deep technical takeaway or architectural highlight.\n"
                        "     > **Note**: Vital clarification or scope definition.\n"
                        "4. CODE BLOCKS & EQUATIONS:\n"
                        "   - Use fenced code blocks with explicit language tags (```python, ```bash, ```sql, ```json, etc.) for code, commands, or formulas.\n"
                        "5. CLEAN TABLE CELLS (NO RAW HTML):\n"
                        "   - In Markdown tables, never write raw HTML tags like `<br>`. Use semicolons or concise phrases inside table cells.\n"
                        "6. SECTION HEADINGS:\n"
                        "   - Organize explanations with clear numbered sections and emoji markers (e.g. `### 1. Foundational Architecture 🧠`, `### 2. Comparative Analysis 📊`, `### 3. Implementation Workflow ⚙️`).\n"
                        "7. FACTUAL SYNTHESIS:\n"
                        "   - When live web search or document knowledge is available, synthesize findings authoritatively with specific numbers, dates, timings, and citations."
                    )

                    if is_web_search:
                        effective_query = search_query if search_query else user_text
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
                                        "Synthesize these live search findings and present a comprehensive answer."
                                    )
                                )
                            ]
                        )

                    # 2. AST Math Calculation detection
                    elif lowered_text.startswith("calculate the formula") or lowered_text.startswith("calculate "):
                        expr = (
                            user_text[len("calculate the formula"):].strip(" :")
                            if lowered_text.startswith("calculate the formula")
                            else user_text[len("calculate"):].strip(" :")
                        )
                        await manager.send_json(
                            websocket,
                            {
                                "type": "status",
                                "status": "processing",
                                "content": "Computing expression with AST Math engine...",
                                "task_id": task_id,
                            },
                        )
                        math_result = calculate_expression.invoke(expr)
                        messages_to_llm = (
                            [SystemMessage(content=system_instruction)]
                            + conversation_history
                            + [HumanMessage(content=f"Expression: {expr}\nEvaluated Result: {math_result}\nUser Query: {user_text}")]
                        )

                    # 3. Default: multi-turn follow-up, pgvector RAG context, or general inquiry
                    else:
                        messages_to_llm = (
                            [SystemMessage(content=system_instruction)]
                            + conversation_history
                            + [HumanMessage(content=augmented_text)]
                        )

                    # Standard completion: stream tokens using chosen model from dropdown
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
                        logger.warning(
                            f"Streaming error with model '{selected_model}': {stream_err}. Suggesting alternative model."
                        )
                        # Determine alternative model from available models
                        if selected_model == "llama-3.1-8b-instant":
                            fallback_id = "gemini-2.5-flash-lite"
                            fallback_name = "Google Gemini 2.5 Flash Lite"
                        else:
                            fallback_id = "llama-3.1-8b-instant"
                            fallback_name = "LLaMA 3.1 8B (Instant)"

                        await manager.send_json(
                            websocket,
                            {
                                "type": "model_fallback",
                                "failed_model": selected_model or "default",
                                "suggested_model": fallback_id,
                                "suggested_name": fallback_name,
                                "message": f"Model '{selected_model or 'Selected'}' encountered an error. Switched to suggested model: {fallback_name}.",
                                "task_id": task_id,
                            },
                        )

                        # Continue answering with the suggested fallback model
                        try:
                            fallback_llm = get_llm(model_id=fallback_id)
                            async for chunk in fallback_llm.astream(messages_to_llm):
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
                        except Exception:
                            res = llm.invoke(messages_to_llm)
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
                    await save_message_to_db(
                        conversation_id,
                        "assistant",
                        full_response,
                        token_str=token,
                    )

    except WebSocketDisconnect:
        manager.disconnect(conversation_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(conversation_id)
