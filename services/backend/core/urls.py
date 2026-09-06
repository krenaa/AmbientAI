from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)
from accounts.views import RegisterView, CustomTokenObtainPairView, CurrentUserView
from rest_framework_simplejwt.views import (
    TokenRefreshView,
)

from strawberry.django.views import AsyncGraphQLView
from core.schema import schema

urlpatterns = [
    path("admin/", admin.site.urls),
    # GraphQL Endpoint & GraphiQL IDE
    path("graphql/", AsyncGraphQLView.as_view(schema=schema), name="graphql"),
    # JWT Auth Endpoints
    path("api/auth/register/", RegisterView.as_view(), name="auth_register"),
    path("api/auth/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="auth_me"),
    # Tasks API
    path("api/", include("tasks.urls")),
    # OpenAPI Schema & Docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]