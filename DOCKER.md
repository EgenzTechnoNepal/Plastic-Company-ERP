# Docker — EcoWrap Nepal ERP

Run the full stack (Postgres, Redis, Django API, Vite frontend) with one command.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine + Compose v2

## Quick start

From the repo root (`ERP PLASTIC`):

```bash
docker compose up --build
```

Then open:

| Service   | URL |
|-----------|-----|
| Frontend  | http://localhost:8082 (default host port; override with `FRONTEND_PORT`) |
| Backend health | http://localhost:8000/health/ |
| API docs (if DEBUG) | http://localhost:8000/api/docs/ |

> If ports `8080` / `5432` / `6379` are already used by another project, the compose file defaults to **8082**, **5433**, and **6380** on the host.

Demo login (seeded automatically when `SEED_DEMO=1`):

- `admin@ecowrap.com` / `admin123`
- other roles: `*@ecowrap.com` / `demo123`

Stop:

```bash
docker compose down
```

Wipe DB volumes too:

```bash
docker compose down -v
```

## Useful commands

```bash
# Rebuild after Dockerfile / dependency changes
docker compose up --build

# Backend shell
docker compose exec backend python manage.py shell

# Re-seed demo users / org data
docker compose exec backend python manage.py seed_demo

# Logs
docker compose logs -f frontend backend

# Optional Celery worker
docker compose --profile workers up --build
```

## How the pieces talk

- Browser → **frontend** `:8080`
- Vite proxies `/api` and `/health` → **backend** service (`http://backend:8000`) inside the Docker network
- Backend → **db** (Postgres) + **redis**

Local non-Docker `npm run dev` still proxies to `http://127.0.0.1:8000` by default.

## Backend only

```bash
cd Backend
docker compose up --build
```

## Frontend production image

```bash
cd eco-craft-flow
docker build --target production -t ecowrap-web:prod \
  --build-arg VITE_API_BASE_URL=/api/v1 .
docker run --rm -p 8080:8080 ecowrap-web:prod
```

For production API URL set `--build-arg VITE_API_BASE_URL=https://your-api.example.com/api/v1`.

## Notes

- First start can take a few minutes (image build + `npm install` + migrations).
- On Windows, keep the project on a path Docker Desktop can mount (this folder is fine).
- Do not commit real secrets; use `.env` from `.env.example` for overrides.
