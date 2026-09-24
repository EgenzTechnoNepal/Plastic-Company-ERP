"""
python manage.py ensure_admin

Creates / updates the Django admin + SPA bootstrap admin user.
Safe for production first boot (get_or_create / update password only when ENSURE_ADMIN_RESET=1).
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Role, User, UserRole


class Command(BaseCommand):
    help = "Ensure bootstrap admin exists for Django admin + API login."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=None)
        parser.add_argument("--password", default=None)

    def handle(self, *args, **options):
        import os

        email = options["email"] or os.environ.get("ADMIN_EMAIL", "admin@ecowrap.com")
        password = options["password"] or os.environ.get("ADMIN_PASSWORD", "admin123")
        reset = os.environ.get("ENSURE_ADMIN_RESET", "0") == "1"

        with transaction.atomic():
            role, _ = Role.objects.get_or_create(
                code="administrator",
                defaults={"name": "Administrator", "is_system": True},
            )
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": "Admin",
                    "last_name": "User",
                    "is_staff": True,
                    "is_superuser": True,
                    "is_active": True,
                },
            )
            if created or reset:
                user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.save()
            UserRole.objects.get_or_create(user=user, role=role)

        action = "created" if created else ("reset" if reset else "ensured")
        self.stdout.write(self.style.SUCCESS(f"Admin user {action}: {email}"))
