import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("ambientdesk.websocket_manager")


class ConnectionManager:
    def __init__(self):
        # task_id -> Set of active WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, task_id: str, websocket: WebSocket):
        await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = set()
        self.active_connections[task_id].add(websocket)
        logger.info(f"WebSocket client connected to task '{task_id}'. Active for task: {len(self.active_connections[task_id])}")

    def disconnect(self, task_id: str, websocket: WebSocket):
        if task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
        logger.info(f"WebSocket client disconnected from task '{task_id}'")

    async def broadcast_task_event(self, task_id: str, payload: dict):
        """Broadcasts a payload event matching the frontend's expected {type: 'task_update', data: ...} format."""
        if task_id not in self.active_connections:
            return

        message = json.dumps({"type": "task_update", "data": payload})
        dead_sockets = set()

        for connection in list(self.active_connections[task_id]):
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Error sending to WebSocket client on task {task_id}: {e}")
                dead_sockets.add(connection)

        for dead in dead_sockets:
            self.disconnect(task_id, dead)


manager = ConnectionManager()
