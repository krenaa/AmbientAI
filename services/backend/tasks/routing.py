from django.urls import path
from strawberry.channels import GraphQLWSConsumer
from core.schema import schema
from .consumers import TaskProgressConsumer

websocket_urlpatterns = [
    path("ws/tasks/<str:task_id>/", TaskProgressConsumer.as_asgi()),
    path("graphql/ws/", GraphQLWSConsumer.as_asgi(schema=schema)),
]