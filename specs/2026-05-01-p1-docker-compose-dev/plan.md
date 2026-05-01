# P1 — Docker Compose Dev Environment · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una.

## 1. Crear .env.example
1.1. Crear `.env.example` en la raíz con TODAS las V1 vars agrupadas
por fase. Sirve como mapa explícito del sistema.

```env
# ───────────────────── P1 (this phase) ─────────────────────
DATABASE_URL=postgres://promptstash:promptstash@localhost:5432/promptstash
REDIS_URL=redis://localhost:6379

# ───────────────────── P3 (Auth.js) ─────────────────────
AUTH_SECRET=
AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ───────────────────── P4 (Auth.js Google) ─────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ───────────────────── P10 (GitHub token at-rest encryption) ─
ENCRYPTION_KEY=

# ───────────────────── P16 (optional) ─────────────────────
SENTRY_DSN=
```

1.2. Confirmar que `.gitignore` ya excluye `.env` y `.env.*` (sí —
heredado del scaffold). `.env.example` queda trackeado.

## 2. Crear .dockerignore
2.1. Crear `.dockerignore` con:
```
node_modules
dist
.git
.gitignore
.env
.env.*
!.env.example
specs
README.md
CLAUDE.md
coverage
*.log
.idea
.DS_Store
```

## 3. Crear Dockerfile multi-stage
3.1. Crear `Dockerfile` en raíz con 3 stages:

```dockerfile
# syntax=docker/dockerfile:1

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src ./src
COPY styles ./styles
COPY package.json ./
EXPOSE 3000
CMD ["bun", "start"]
```

3.2. Verificar build local:
```bash
docker build --target prod -t promptstash:dev-test .
```
Debe terminar sin error.

## 4. Crear docker-compose.yml
4.1. Crear `docker-compose.yml`:

```yaml
networks:
  promptstash:
    name: promptstash

volumes:
  postgres_data:
  redis_data:

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: promptstash
      POSTGRES_PASSWORD: promptstash
      POSTGRES_DB: promptstash
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - promptstash
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U promptstash"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - promptstash
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    profiles: [full]
    build:
      context: .
      target: prod
    env_file: .env
    environment:
      DATABASE_URL: postgres://promptstash:promptstash@postgres:5432/promptstash
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - promptstash
    healthcheck:
      test: ["CMD", "bun", "--eval", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 10
```

Notas:
- `app` overridea `DATABASE_URL`/`REDIS_URL` para usar los DNS internos
  del compose (`postgres`, `redis`) en lugar de los del host.
- `env_file: .env` carga el resto de variables (AUTH_SECRET, OAuth
  IDs, etc.). El usuario debe crear `.env` desde `.env.example`.

## 5. Levantar y validar el modo hybrid (db+redis)
5.1. Crear `.env` localmente desde `.env.example` para los tests.
5.2. `docker compose up -d postgres redis` levanta ambos.
5.3. `docker compose ps` muestra ambos `healthy` tras unos segundos.
5.4. Conexiones funcionan:
- `psql postgres://promptstash:promptstash@localhost:5432/promptstash -c '\l'` lista DBs.
- `redis-cli -h localhost -p 6379 ping` → `PONG`.
5.5. `bun dev` en host arranca y `curl localhost:3000/health` responde.
5.6. `docker compose down` deja todo limpio (volumes persistentes).

## 6. Validar el profile `full`
6.1. `docker compose --profile full up -d --build` levanta los 3.
6.2. `docker compose ps` los 3 quedan `healthy`.
6.3. `curl localhost:3000/health` → 200 + `{"ok":true}`.
6.4. `docker compose --profile full down` limpia.

## 7. Update README
7.1. Agregar sección "Dev environment" al `README.md` con:
- Pre-requisitos (Docker Desktop / colima / podman compose).
- `cp .env.example .env` y dejar las vars de P1 con sus defaults.
- Comandos clave:
  - `docker compose up -d postgres redis` (modo hybrid, daily).
  - `bun dev` en host.
  - `docker compose --profile full up --build` (validation E2E).
  - `docker compose down` (parar) / `docker compose down -v` (parar +
    borrar volumes).
- Tabla de servicios y puertos: postgres 5432, redis 6379, app 3000.

7.2. Revisar referencia al stack en el resto del README (no debería
romperse nada del P0).

## 8. Cierre
8.1. `git status` limpio salvo los cambios esperados.
8.2. Abrir PR `feat/p1-docker-compose-dev` → `master` con link a
`specs/2026-05-01-p1-docker-compose-dev/validation.md`.
