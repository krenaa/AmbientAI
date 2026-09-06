from django.urls import path, re_path
from strawberry.channels import GraphQLWSConsumer
from core.schema import schema
from .consumers import TaskProgressConsumer

websocket_urlpatterns = [
    path("ws/tasks/<str:task_id>/", TaskProgressConsumer.as_asgi()),
    re_path(r"^graphql/?$", GraphQLWSConsumer.as_asgi(schema=schema)),
    re_path(r"^graphql/ws/?$", GraphQLWSConsumer.as_asgi(schema=schema)),
    re_path(r"^ws/graphql/?$", GraphQLWSConsumer.as_asgi(schema=schema)),
]