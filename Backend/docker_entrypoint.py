"""Docker entrypoint: wait for DB, migrate, optional seed, then exec CMD."""
from __future__ import annotations

import os
import subprocess
import sys


def run(args: list[str]) -> None:
    subprocess.check_call(args)


def main() -> None:
    timeout = os.environ.get("WAIT_FOR_DB_TIMEOUT", "60")
    run([sys.executable, "manage.py", "wait_for_db", "--timeout", timeout])
    run([sys.executable, "manage.py", "migrate", "--noinput"])

    if os.environ.get("SEED_DEMO", "0") == "1":
        # Full demo seed only when DEBUG=True (management command enforces this).
        try:
            run([sys.executable, "manage.py", "seed_demo"])
        except subprocess.CalledProcessError:
            # Production: still bootstrap Django admin / API admin user.
            run([sys.executable, "manage.py", "ensure_admin"])

    if os.environ.get("ENSURE_ADMIN", "0") == "1":
        run([sys.executable, "manage.py", "ensure_admin"])

    if len(sys.argv) < 2:
        raise SystemExit("No command provided to docker entrypoint")
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
