import re

from django.core.exceptions import ValidationError


class ComplexityPasswordValidator:
    """Requires at least one uppercase, one lowercase, one digit and one symbol."""

    def validate(self, password, user=None):
        errors = []
        if not re.search(r"[A-Z]", password):
            errors.append("at least one uppercase letter")
        if not re.search(r"[a-z]", password):
            errors.append("at least one lowercase letter")
        if not re.search(r"\d", password):
            errors.append("at least one digit")
        if not re.search(r"[^A-Za-z0-9]", password):
            errors.append("at least one symbol")
        if errors:
            raise ValidationError(
                "Password must contain " + ", ".join(errors) + ".",
                code="password_too_simple",
            )

    def get_help_text(self):
        return "Your password must contain uppercase, lowercase, a digit and a symbol."
