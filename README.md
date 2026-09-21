# Plastic-Company-ERP

Full-stack ERP for plastic / compostable packaging manufacturing (EcoWrap Nepal).

## Structure

| Path | Description |
|------|-------------|
| `eco-craft-flow/` | Frontend (TanStack Start / Vite) |
| `Backend/` | Django REST API |
| `docker-compose.yml` | Local full-stack (Postgres, Redis, API, UI) |

## Quick start (Docker)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8082 |
| Backend health | http://localhost:8000/health/ |

Demo login (when `SEED_DEMO=1`): `admin@ecowrap.com` / `admin123`

Copy `.env.example` to `.env` for local overrides. See `DOCKER.md` for details.

## Dev workflow

- Feature work can continue in the separate frontend / backend repositories.
- This monorepo is the integration branch: review merges from frontend + backend, then push here.

## License

Proprietary — Egenz Techno Nepal.
