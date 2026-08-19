from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AgentTaskViewSet

router = DefaultRouter()
router.register(r"tasks", AgentTaskViewSet, basename="agent-task")

urlpatterns = [
    path("", include(router.urls)),
]