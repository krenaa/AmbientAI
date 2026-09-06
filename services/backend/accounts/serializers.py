from rest_framework import serializers
from .models import CustomUser


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        style={"input_type": "password"},
    )
    full_name = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = CustomUser
        fields = ["id", "email", "full_name", "password"]

    def validate_email(self, value):
        normalized = value.lower().strip()
        if CustomUser.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return normalized

    def create(self, validated_data):
        email = validated_data["email"]
        password = validated_data["password"]
        full_name = validated_data.get("full_name", "")

        # Use email prefix or email as username for AbstractUser compatibility
        username = email.split("@")[0]
        base_username = username
        counter = 1
        while CustomUser.objects.filter(username=username).exists():
            username = f"{base_username}_{counter}"
            counter += 1

        user = CustomUser.objects.create_user(
            username=username,
            email=email,
            password=password,
            full_name=full_name,
        )
        return user


from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        data["user"] = {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name or user.email.split("@")[0],
            "role": "Admin" if (user.is_staff or user.is_superuser) else "Member",
            "is_staff": user.is_staff,
        }
        return data
