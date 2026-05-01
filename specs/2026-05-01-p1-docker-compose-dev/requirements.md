# P1 — Docker Compose Dev Environment · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P1. P0 dejó el repo estructurado y un
server Elysia mínimo corriendo en host. P1 agrega la infra de servicios
externos (Postgres + Redis) que las próximas fases consumen, y deja
una imagen Docker de producción lista para que P15 solo tenga que
agregar `docker-compose.prod.yml` y un script de deploy.

## In scope
- `docker-compose.yml` con servicios `postgres:16-alpine` y
  `redis:7-alpine`.
- Service `app` declarado bajo profile `full` para validar el goal
  literal del roadmap (`docker compose up` levanta los 3).
- `Dockerfile` multi-stage (`deps` + `build` + `prod`) listo para
  producción.
- `.env.example` con todas las variables que V1 va a consumir
  (DATABASE_URL, REDIS_URL, AUTH_SECRET, AUTH_URL, GITHUB_*,
  GOOGLE_*, ENCRYPTION_KEY, SENTRY_DSN).
- `.dockerignore` mínimo (node_modules, dist, .git, .env, specs).
- Healthchecks reales (no TCP-only) para los 3 servicios.
- Volumes nombrados para persistencia de Postgres y Redis.
- Network nombrada `promptstash` (futureproof para Traefik en P15).
- Sección "Dev environment" en `README.md`.

## Out of scope
- Migrations / schema de Drizzle (P2).
- `docker-compose.prod.yml` y labels Traefik (P15).
- Backups, replicación, tuning de Postgres.
- CI / GitHub Actions corriendo compose (P14).
- Autenticación Redis (default sin password en dev local;
  prod gestionará vía env).
- Cualquier feature de dominio.

## Decisiones acordadas (este turno)

### Dev workflow
**Decisión**: hybrid. En el día a día, `docker compose up postgres
redis` y `bun dev` corre en el host (HMR limpio, sin volúmenes ni
file-watching dentro del container). El service `app` queda
declarado bajo profile `full` para que `docker compose --profile full
up` permita validar el flujo end-to-end del roadmap.

### Dockerfile stages
**Decisión**: 3 stages — `deps` + `build` + `prod`.
- `deps`: `bun install --frozen-lockfile`.
- `build`: copia el resto del repo y corre `bun run build` (genera
  `dist/`).
- `prod`: imagen final basada en `oven/bun:1-slim`, copia
  `node_modules`, `dist`, `src`, `package.json`. Comando: `bun start`.
- No hay stage `dev` (la app dev corre en host).

### .env.example
**Decisión**: declarar TODAS las V1 vars con placeholders, agrupadas
por la fase que las introduce. `.env.example` es el mapa explícito de
lo que el sistema necesita. Cada fase llena su valor cuando llega.

## Decisiones técnicas derivadas

### Postgres
- Imagen: `postgres:16-alpine`.
- Credenciales dev: usuario `promptstash`, password `promptstash`,
  db `promptstash`.
- Puerto 5432 expuesto al host (para `psql`, Drizzle Studio, etc.).
- Volume nombrado `postgres_data`.
- Healthcheck: `pg_isready -U promptstash`.

### Redis
- Imagen: `redis:7-alpine`.
- Sin password en dev.
- Puerto 6379 expuesto al host.
- Volume nombrado `redis_data`.
- Healthcheck: `redis-cli ping`.

### App (profile `full`)
- Build: `Dockerfile` target `prod`.
- `env_file: .env`.
- Puerto 3000 expuesto.
- `depends_on` con `condition: service_healthy` para postgres y redis.
- Healthcheck: `bun --eval` con `fetch('http://localhost:3000/health')`
  (Bun ya está en la imagen, sin necesidad de instalar curl/wget).

### Network
- Named bridge `promptstash`. Los 3 servicios la usan. P15 podrá
  declararla externa para integrarse con Traefik.

### .dockerignore
- `node_modules`, `dist`, `.git`, `.env`, `.env.*`, `specs`,
  `*.md` (docs), `coverage`, `.idea`, `.DS_Store`.

## Critical files
- `docker-compose.yml` → **crear**.
- `Dockerfile` → **crear** (multi-stage).
- `.dockerignore` → **crear**.
- `.env.example` → **crear**.
- `README.md` → agregar sección "Dev environment".
- `.gitignore` → verificar que ya excluye `.env` (ya está; no
  requiere cambio).

## References
- `specs/mission.md` — contexto del producto.
- `specs/tech-stack.md` → secciones "Database", "Cache & Rate
  Limiting", "Deploy — Docker Compose".
- `specs/roadmap.md` → P1 (definición canónica), P2 (uso de Postgres),
  P15 (deploy con Traefik externo).
- `CLAUDE.md` — mandatos Bun-native (Bun.sql en P2, Bun.redis en P9).
- Memoria persistida: deploy con Traefik externo en VPS (relevante para
  P15, no para P1, pero orienta el shape de la network y compose).
