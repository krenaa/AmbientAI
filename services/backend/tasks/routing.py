from django.urls import path
from .consumers import TaskProgressConsumer

websocket_urlpatterns = [
    path("ws/tasks/<str:task_id>/", TaskProgressConsumer.as_asgi()),
]