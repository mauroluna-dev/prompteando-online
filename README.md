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

App en `http://localhost:3000`. `GET /health` → `{"ok":true}`. SPA en `/`.

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
| app      | 3000        | (host con `bun dev`)|
| postgres | 5432        | postgres:16-alpine  |
| redis    | 6379        | redis:7-alpine      |

### Comandos

```bash
# Workflow diario (modo hybrid)
docker compose up -d postgres redis      # data services en background
bun dev                                  # app con HMR

# Validación end-to-end (los 3 servicios containerizados)
docker compose --profile full up --build
curl http://localhost:3000/health        # esperado: {"ok":true}

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

Bun · Elysia · React 19 · Tailwind 4 · shadcn/ui · Postgres + Drizzle ·
Redis (Bun.redis) · Auth.js (en P3) · Octokit (en P10).

Detalle completo y razonamiento en
[`specs/tech-stack.md`](specs/tech-stack.md).
