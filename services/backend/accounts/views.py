from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterSerializer, CustomTokenObtainPairSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tasks = user.agent_tasks.all()
        total_tasks = tasks.count()
        completed_tasks = tasks.filter(status="completed").count()
        awaiting_approval = tasks.filter(status="awaiting_approval").count()
        total_latency_ms = sum(t.execution_time_ms for t in tasks)

        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name or user.email.split("@")[0],
                "role": "Admin" if (user.is_staff or user.is_superuser) else "Member",
                "is_staff": user.is_staff,
                "date_joined": (
                    user.date_joined.isoformat()
                    if hasattr(user, "date_joined") and user.date_joined
                    else None
                ),
                "stats": {
                    "total_tasks": total_tasks,
                    "completed_tasks": completed_tasks,
                    "awaiting_approval": awaiting_approval,
                    "total_execution_time_s": round(total_latency_ms / 1000.0, 2),
                },
            }
        )

    def patch(self, request):
        user = request.user
        full_name = request.data.get("full_name")
        current_password = request.data.get("current_password")
        new_password = request.data.get("new_password")

        if full_name is not None:
            user.full_name = full_name.strip()

        if current_password and new_password:
            if not user.check_password(current_password):
                return Response(
                    {"detail": "Current password does not match."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(new_password) < 8:
                return Response(
                    {"detail": "New password must be at least 8 characters long."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)

        user.save()
        return self.get(request)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Generate JWT tokens immediately upon registration
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name or user.email.split("@")[0],
                    "role": "Admin" if (user.is_staff or user.is_superuser) else "Member",
                    "is_staff": user.is_staff,
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                },
                "access": str(refresh.access_token),
                "message": "User registered successfully.",
            },
            status=status.HTTP_201_CREATED,
        )
