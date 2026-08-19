import json
from channels.generic.websocket import AsyncWebsocketConsumer


class TaskProgressConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.task_id = self.scope["url_route"]["kwargs"]["task_id"]
        self.room_group_name = f"task_{self.task_id}"

        # Join task room
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave task room
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name,
        )

    async def receive(self, text_data):
        # Optional: handle incoming client messages/pings
        pass

    async def task_update(self, event):
        """Handler for 'task_update' events broadcast from Celery."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "task_update",
                    "data": event["data"],
                }
            )
        )