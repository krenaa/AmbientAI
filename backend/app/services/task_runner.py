import asyncio
import logging
import time
from typing import Any, Dict, Optional
import uuid
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from sqlalchemy import select

from app.agent.graph import agent_graph
from app.core.database import AsyncSessionLocal
from app.models.task import AgentTask, TaskExecutionLog
from app.websocket_manager import manager

logger = logging.getLogger("ambientdesk.task_runner")


def extract_text_content(content: Any) -> str:
    """Safely extracts plain string from LangChain message content, which can be a str or list of dicts/blocks."""
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
            elif isinstance(block, dict):
                if "text" in block:
                    text_parts.append(str(block["text"]))
                elif "content" in block:
                    text_parts.append(str(block["content"]))
                else:
                    text_parts.append(str(block))
            else:
                text_parts.append(str(block))
        return "\n".join(text_parts).strip()
    return str(content)


async def execute_task_workflow(
    task_id: str,
    prompt: Optional[str] = None,
    human_approved: Optional[bool] = None,
    model: Optional[str] = None,
):
    """Asynchronous background worker executing LangGraph directly in-process.
    Replaces Celery and eliminates HTTP proxy hops."""
    start_time = time.perf_counter()
    task_uuid = uuid.UUID(task_id) if isinstance(task_id, str) else task_id

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AgentTask).where(AgentTask.id == task_uuid))
        task = result.scalar_one_or_none()
        if not task:
            logger.error(f"Task {task_id} not found in database.")
            return

        task.status = "processing"
        task.error_message = None
        task.approval_prompt = None
        await session.commit()

        # 1. Broadcast processing state to WebSocket
        await manager.broadcast_task_event(
            str(task.id),
            {
                "task_id": str(task.id),
                "status": "processing",
                "message": "Task running in LangGraph engine...",
            },
        )

        config = {"configurable": {"thread_id": str(task.id)}}

        try:
            if human_approved is not None:
                # Resuming from a human approval decision (Approve or Reject)
                if not human_approved:
                    # Explicit rejection
                    task.status = "completed"
                    task.output = "Action was rejected by user."
                    task.approval_prompt = None
                    task.execution_time_ms = (time.perf_counter() - start_time) * 1000.0
                    await session.commit()

                    await manager.broadcast_task_event(
                        str(task.id),
                        {
                            "task_id": str(task.id),
                            "status": "completed",
                            "output": task.output,
                            "approval_prompt": None,
                        },
                    )
                    return

                # Human approved: resume execution
                graph_result = await agent_graph.ainvoke(
                    Command(resume={"approved": True}),
                    config=config,
                )
            else:
                # Initial execution or follow-up prompt
                effective_prompt = prompt if prompt else task.prompt
                initial_state = {
                    "messages": [HumanMessage(content=effective_prompt)],
                    "task_id": str(task.id),
                    "user_id": str(task.user_id),
                    "triage": None,
                    "requires_approval": False,
                    "approval_status": None,
                    "approval_payload": None,
                    "selected_model": model,
                    "final_output": None,
                    "error": None,
                }
                graph_result = await agent_graph.ainvoke(initial_state, config=config)

            state_snapshot = agent_graph.get_state(config)
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            # 2. Check if execution paused at an interrupt (HITL)
            if state_snapshot.next:
                interrupt_value = None
                if state_snapshot.tasks and state_snapshot.tasks[0].interrupts:
                    interrupt_value = state_snapshot.tasks[0].interrupts[0].value

                action_desc = "Action requires human approval before executing."
                if isinstance(interrupt_value, dict):
                    action_desc = (
                        interrupt_value.get("action_summary")
                        or interrupt_value.get("question")
                        or str(interrupt_value)
                    )
                elif interrupt_value:
                    action_desc = str(interrupt_value)

                task.status = "awaiting_approval"
                task.approval_prompt = action_desc
                task.triage_category = "sensitive_action"
                task.execution_time_ms = elapsed_ms
                await session.commit()

                # Log HITL interruption
                log_entry = TaskExecutionLog(
                    task_id=task.id,
                    node_name="approval_interrupted",
                    message=f"Awaiting human approval: {action_desc}",
                    metadata_={"interrupt": interrupt_value} if isinstance(interrupt_value, dict) else {},
                )
                session.add(log_entry)
                await session.commit()

                await manager.broadcast_task_event(
                    str(task.id),
                    {
                        "task_id": str(task.id),
                        "status": "awaiting_approval",
                        "approval_prompt": action_desc,
                        "triage_category": "sensitive_action",
                    },
                )
                return

            # 3. Task completed successfully
            output_text = ""
            for m in reversed(graph_result.get("messages", [])):
                text = extract_text_content(getattr(m, "content", m))
                if text:
                    output_text = text
                    break

            triage_cat = graph_result["triage"].category if graph_result.get("triage") else task.triage_category

            # Multi-turn output alignment
            prompt_turns = task.prompt.split("\n\n[Follow-up]: ") if task.prompt else [""]
            num_prompt_turns = len(prompt_turns)

            if human_approved:
                if task.output and "\n\n[Follow-up]: " in task.output:
                    parts = task.output.split("\n\n[Follow-up]: ")
                    parts[-1] = output_text or ""
                    task.output = "\n\n[Follow-up]: ".join(parts)
                else:
                    task.output = output_text
            elif num_prompt_turns > 1:
                # Multi-turn conversation: ensure 1:1 mapping with prompt turns
                existing_outputs = task.output.split("\n\n[Follow-up]: ") if task.output else []
                missing = (num_prompt_turns - 1) - len(existing_outputs)
                if missing > 0:
                    prev_msg = task.error_message if task.error_message else "Execution error on this step."
                    existing_outputs.extend([f"⚠️ *{prev_msg}*"] * missing)
                
                existing_outputs.append(output_text or "")
                task.output = "\n\n[Follow-up]: ".join(existing_outputs)
            else:
                task.output = output_text

            task.status = "completed"
            task.triage_category = triage_cat
            task.approval_prompt = None
            task.execution_time_ms = elapsed_ms
            await session.commit()

            # Record final execution log
            completion_log = TaskExecutionLog(
                task_id=task.id,
                node_name="agent_completed",
                message="Workflow execution completed successfully.",
                metadata_={"category": triage_cat, "elapsed_ms": round(elapsed_ms, 2)},
            )
            session.add(completion_log)
            await session.commit()

            # Broadcast final completion state over WebSocket
            await manager.broadcast_task_event(
                str(task.id),
                {
                    "task_id": str(task.id),
                    "status": "completed",
                    "triage_category": triage_cat,
                    "output": task.output,
                    "approval_prompt": None,
                    "execution_time_ms": elapsed_ms,
                },
            )

        except Exception as e:
            logger.error(f"Error executing task {task_id}: {e}", exc_info=True)
            task.status = "failed"
            task.error_message = str(e)
            task.execution_time_ms = (time.perf_counter() - start_time) * 1000.0
            await session.commit()

            err_log = TaskExecutionLog(
                task_id=task.id,
                node_name="agent_error",
                message=f"Execution error: {str(e)}",
                metadata_={"error": str(e)},
            )
            session.add(err_log)
            await session.commit()

            await manager.broadcast_task_event(
                str(task.id),
                {
                    "task_id": str(task.id),
                    "status": "failed",
                    "error_message": str(e),
                },
            )
