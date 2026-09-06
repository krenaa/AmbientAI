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
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name or user.email.split("@")[0],
                "role": "Admin" if (user.is_staff or user.is_superuser) else "Member",
                "is_staff": user.is_staff,
            }
        )


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
