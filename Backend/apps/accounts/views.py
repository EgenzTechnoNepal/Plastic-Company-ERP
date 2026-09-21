from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.models import PasswordResetToken, User
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    LogoutSerializer,
    UserSummarySerializer,
)
from apps.accounts.throttling import LoginRateThrottle, SensitiveActionRateThrottle
from apps.core.pagination import envelope


class LoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/"""

    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return envelope(serializer.validated_data)


class RefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh/ — rotation + blacklist handled by SIMPLE_JWT settings."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc
        return envelope(serializer.validated_data)


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklists the supplied refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            token.blacklist()
        except TokenError:
            return Response(
                {"error": {"code": "INVALID_TOKEN", "message": "Refresh token is invalid or already revoked.", "fields": {}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return envelope({"detail": "Logged out."})


class MeView(generics.RetrieveAPIView):
    """GET /api/v1/auth/me/"""

    serializer_class = UserSummarySerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return envelope(serializer.data)


class ChangePasswordView(APIView):
    """POST /api/v1/auth/change-password/"""

    permission_classes = [IsAuthenticated]
    throttle_classes = [SensitiveActionRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])

        # Force re-authentication everywhere: blacklist every outstanding token for this user.
        for outstanding in OutstandingToken.objects.filter(user=user):
            try:
                RefreshToken(outstanding.token).blacklist()
            except TokenError:
                continue

        return envelope({"detail": "Password changed. Please log in again."})


class PasswordResetView(APIView):
    """POST /api/v1/auth/password-reset/ — issues a time-limited token (DEBUG returns it)."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        from datetime import timedelta
        import secrets

        from django.conf import settings
        from django.utils import timezone

        email = (request.data.get("email") or "").strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        payload = {"detail": "If that account exists, a reset link has been issued."}
        if user:
            token = secrets.token_urlsafe(32)
            PasswordResetToken.objects.create(
                user=user,
                token=token,
                expires_at=timezone.now() + timedelta(hours=2),
            )
            if settings.DEBUG:
                payload["token"] = token
        return envelope(payload)


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/"""

    permission_classes = [AllowAny]
    throttle_classes = [SensitiveActionRateThrottle]

    def post(self, request, *args, **kwargs):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        from django.utils import timezone
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import TokenError

        token = request.data.get("token") or ""
        new_password = request.data.get("new_password") or ""
        row = PasswordResetToken.objects.select_related("user").filter(token=token, used_at__isnull=True).first()
        if not row or row.expires_at < timezone.now():
            return Response(
                {"error": {"code": "INVALID_TOKEN", "message": "Reset token is invalid or expired.", "fields": {}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new_password, user=row.user)
        except ValidationError as exc:
            return Response(
                {"error": {"code": "ERROR", "message": "Password does not meet policy.", "fields": {"new_password": list(exc.messages)}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.user.set_password(new_password)
        row.user.save(update_fields=["password"])
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])
        for outstanding in OutstandingToken.objects.filter(user=row.user):
            try:
                RefreshToken(outstanding.token).blacklist()
            except TokenError:
                continue
        return envelope({"detail": "Password updated. Please sign in."})


class TwoFactorView(APIView):
    """GET/POST /api/v1/auth/2fa/ — enrol or disable TOTP for the current user."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [SensitiveActionRateThrottle]

    def get(self, request, *args, **kwargs):
        enabled = bool(getattr(request.user, "two_factor_enabled", False))
        return envelope({"enabled": enabled})

    def post(self, request, *args, **kwargs):
        enabled = bool(request.data.get("enabled"))
        request.user.two_factor_enabled = enabled
        request.user.save(update_fields=["two_factor_enabled", "updated_at"])
        return envelope({"enabled": enabled, "detail": "Two-factor authentication updated."})
