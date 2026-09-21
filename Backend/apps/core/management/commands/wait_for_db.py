import time

from django.core.management.base import BaseCommand
from django.db import connections
from django.db.utils import OperationalError


class Command(BaseCommand):
    help = "Waits until the database is available before continuing (used by docker-compose)."

    def add_arguments(self, parser):
        parser.add_argument("--timeout", type=int, default=30)

    def handle(self, *args, **options):
        self.stdout.write("Waiting for database...")
        deadline = time.monotonic() + options["timeout"]
        conn = None
        while conn is None:
            try:
                connections["default"].cursor()
                conn = True
            except OperationalError:
                if time.monotonic() > deadline:
                    self.stderr.write(self.style.ERROR("Database unavailable, giving up."))
                    raise
                self.stdout.write("Database unavailable, waiting 1 second...")
                time.sleep(1)
        self.stdout.write(self.style.SUCCESS("Database available."))
