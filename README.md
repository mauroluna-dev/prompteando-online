# promptstash

Versionador de prompts gratis y sin vendor lock-in para no-coders y
vibe-coders. Mirá la "Constitution" en `specs/`:

- [`specs/mission.md`](specs/mission.md) — visión, personas, scope V1.
- [`specs/tech-stack.md`](specs/tech-stack.md) — stack y arquitectura.
- [`specs/roadmap.md`](specs/roadmap.md) — fases atómicas P0–P16.

## Quickstart

```bash
bun install                              # deps
cp .env.example .env                     # config local
docker compose up -d postgres redis      # data services
bun dev                                  # app en host con HMR
```

App en `http://localhost:3010`. `GET /health` → `{"ok":true}`. SPA en `/`.

```bash
bun test         # tests
bun run build    # build de producción a dist/
```

## Dev environment

**Pre-requisitos**: Bun (>= 1.3), Docker (Docker Desktop, colima o
podman compose). El daily workflow es **híbrido**: Postgres y Redis
corren en Docker, la app corre con `bun dev` en el host (HMR limpio,
sin volúmenes ni file-watching dentro de un container).

| Servicio | Puerto host | Imagen              |
| -------- | ----------- | ------------------- |
| app      | 3010        | (host con `bun dev`)|
| postgres | 5432        | postgres:16-alpine  |
| redis    | 6379        | redis:7-alpine      |

### Comandos

```bash
# Workflow diario (modo hybrid)
docker compose up -d postgres redis      # data services en background
bun dev                                  # app con HMR

# Validación end-to-end (los 3 servicios containerizados)
docker compose --profile full up --build
curl http://localhost:3010/health        # esperado: {"ok":true}

# Parar
docker compose down                      # mantiene volumes
docker compose down -v                   # borra volumes (DB limpia)
```

Credenciales dev de Postgres: usuario `promptstash`, password
`promptstash`, db `promptstash`. La connection string ya viene en
`.env.example` como `DATABASE_URL`.

## DB ops

Drizzle ORM sobre `Bun.sql` (driver nativo). Schema en
`src/infrastructure/persistence/schema/` (split per aggregate),
migrations en `src/infrastructure/persistence/migrations/`.

```bash
# Editar schema/<aggregate>.ts y luego:
bun run db:generate    # produce el SQL diff bajo migrations/
bun run db:migrate     # aplica migrations contra Postgres (idempotente)
bun run db:psql        # abre psql en el container (con DB ya seleccionada)
```

`db:migrate` usa `drizzle-orm/bun-sql/migrator` directamente —
sin `pg` ni `postgres.js`. La primera corrida crea la tabla
`drizzle.__drizzle_migrations` que registra qué archivos ya se
aplicaron.

> **Inspección visual de la DB**: `drizzle-kit studio` requiere un
> driver Postgres directo (`pg` / `postgres.js`) y no es compatible
> con Bun.sql, por lo que no se incluye. Para un cliente visual,
> conectá TablePlus / DBeaver / pgAdmin a `localhost:5432` con las
> credenciales de `.env.example`.

## Auth setup

promptstash usa [Auth.js](https://authjs.dev) (`@auth/core`) con el
Drizzle adapter. Login con **GitHub** o **Google** (OAuth-only,
sin email/password). El mismo email vía distintos providers se
unifica al mismo `users` row (`allowDangerousEmailAccountLinking`
habilitado en ambos providers — ambos verifican email server-side).

> Tip: generá `AUTH_SECRET` con `openssl rand -base64 32` y guardá
> el valor; rotarlo invalida todas las sesiones activas.

### GitHub OAuth App

**A. Local-only (sin tunnel)**

1. https://github.com/settings/applications/new
2. **Application name**: `promptstash (local)`
3. **Homepage URL**: `http://localhost:3010`
4. **Authorization callback URL**: `http://localhost:3010/auth/callback/github`
5. Copiar Client ID y generar Client Secret.

**B. Detrás de un tunnel HTTPS** (Cloudflare Tunnel, ngrok, etc.)

GitHub no permite múltiples callbacks por app, así que registrá
**otra** OAuth App apuntando al hostname público:

- **Homepage URL**: `https://<sub>.<domain>`
- **Authorization callback URL**: `https://<sub>.<domain>/auth/callback/github`

### Google OAuth Client

**A. Local-only**

1. https://console.cloud.google.com/ → crear o reusar un proyecto.
2. **APIs & Services** → **OAuth consent screen** → tipo *External*,
   completar los campos requeridos (app name, support email, scopes:
   `email`, `profile`, `openid`).
3. **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID** → tipo *Web application*.
4. **Authorized JavaScript origins**: `http://localhost:3010`
5. **Authorized redirect URIs**: `http://localhost:3010/auth/callback/google`
6. Copiar Client ID y Client Secret.

**B. Detrás de un tunnel HTTPS**

A diferencia de GitHub, Google permite múltiples authorized redirect
URIs en el mismo OAuth client. Agregá:

- **Authorized JavaScript origins**: `https://<sub>.<domain>`
- **Authorized redirect URIs**: `https://<sub>.<domain>/auth/callback/google`

### `.env`

```env
# Local
AUTH_URL=http://localhost:3010
# o detrás de tunnel:
# AUTH_URL=https://<sub>.<domain>

AUTH_SECRET=<openssl rand -base64 32>

GITHUB_CLIENT_ID=<...>
GITHUB_CLIENT_SECRET=<...>

GOOGLE_CLIENT_ID=<...>
GOOGLE_CLIENT_SECRET=<...>
```

`trustHost: true` está activado, así que Auth.js infiere el host del
request. Cuando `AUTH_URL` está seteada, el handler en
`src/infrastructure/auth/handler.ts` reescribe protocol/host/port
del request para que las callback URLs siempre apunten al origen
público — esto evita que un tunnel sin `X-Forwarded-Proto: https`
genere `redirect_uri` con `http://`.

## Estructura del repo

```
src/
├── domain/                       # Entidades, VOs, errores. Sin deps externas.
│   └── __test__/                 # Unit tests por módulo.
├── application/
│   ├── commands/                 # Mutaciones (CQS).
│   ├── queries/                  # Lecturas (CQS).
│   └── ports/                    # Interfaces para infrastructure.
├── infrastructure/
│   ├── persistence/              # Drizzle / Postgres.
│   ├── github/                   # Octokit.
│   ├── cache/                    # Bun.redis (rate limiting, cache).
│   └── auth/                     # Auth.js wiring.
├── interfaces/
│   └── http/
│       ├── server.ts             # Elysia + Bun.serve composition root.
│       ├── routes/
│       └── middlewares/
└── frontend/                     # React 19 + shadcn/ui + Tailwind.
    ├── App.tsx
    ├── frontend.tsx
    ├── index.html
    ├── components/ui/
    └── lib/
```

## Path aliases (tsconfig)

| Alias              | Resuelve a                  |
| ------------------ | --------------------------- |
| `@/domain/*`         | `src/domain/*`                |
| `@/application/*`    | `src/application/*`           |
| `@/infrastructure/*` | `src/infrastructure/*`        |
| `@/interfaces/*`     | `src/interfaces/*`            |
| `@/frontend/*`       | `src/frontend/*`              |
| `@/components/*`     | `src/frontend/components/*`   |
| `@/lib/*`            | `src/frontend/lib/*`          |

## Stack

Bun · Elysia · React 19 · React Router · SWR · Tailwind 4 · shadcn/ui ·
Postgres + Drizzle · Redis (Bun.redis) · Auth.js · Octokit (en P10).

Detalle completo y razonamiento en
[`specs/tech-stack.md`](specs/tech-stack.md).
