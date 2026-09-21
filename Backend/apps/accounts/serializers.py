from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import LoginHistory, User
from apps.core.middleware import get_current_request_context
from django.conf import settings


class UserSummarySerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "is_superuser",
            "is_staff",
            "must_change_password",
            "two_factor_enabled",
            "roles",
        ]

    def get_roles(self, user):
        return list(
            user.user_roles.filter(is_active=True).values_list("role__code", flat=True).distinct()
        )


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Adds account-lockout enforcement and login-history recording around the
    standard SimpleJWT credential check.
    """

    username_field = User.USERNAME_FIELD

    def validate(self, attrs):
        email = attrs.get(self.username_field, "").strip().lower()
        ctx = get_current_request_context()
        ip_address = ctx.ip_address if ctx else None
        user_agent = ctx.user_agent if ctx else ""

        user = User.objects.filter(email__iexact=email).first()

        if user and user.locked_until and user.locked_until > timezone.now():
            LoginHistory.objects.create(
                user=user,
                email_attempted=email,
                was_successful=False,
                ip_address=ip_address,
                user_agent=user_agent,
                failure_reason="account_locked",
            )
            raise serializers.ValidationError(
                {"detail": "Account is temporarily locked due to repeated failed login attempts."},
                code="account_locked",
            )

        try:
            data = super().validate(attrs)
        except Exception:
            if user:
                user.failed_login_attempts += 1
                max_attempts = getattr(settings, "ERP_ACCOUNT_LOCKOUT_ATTEMPTS", 5)
                if user.failed_login_attempts >= max_attempts:
                    lockout_minutes = getattr(settings, "ERP_ACCOUNT_LOCKOUT_MINUTES", 15)
                    user.locked_until = timezone.now() + timezone.timedelta(minutes=lockout_minutes)
                user.save(update_fields=["failed_login_attempts", "locked_until"])
            LoginHistory.objects.create(
                user=user,
                email_attempted=email,
                was_successful=False,
                ip_address=ip_address,
                user_agent=user_agent,
                failure_reason="invalid_credentials",
            )
            raise

        self.user.failed_login_attempts = 0
        self.user.locked_until = None
        self.user.save(update_fields=["failed_login_attempts", "locked_until"])
        LoginHistory.objects.create(
            user=self.user,
            email_attempted=email,
            was_successful=True,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        data["user"] = UserSummarySerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value
