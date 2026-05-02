# promptstash

Versionador de prompts gratis y sin vendor lock-in para no-coders y
vibe-coders. Mirá la "Constitution" en `specs/`:

- [`specs/mission.md`](specs/mission.md) — visión, personas, scope V1.
- [`specs/tech-stack.md`](specs/tech-stack.md) — stack y arquitectura.
- [`specs/roadmap.md`](specs/roadmap.md) — fases atómicas P0–P16.

## Quickstart

```bash
bun install      # deps
bun dev          # dev server con HMR (http://localhost:3000)
bun test         # tests
bun run build    # build de producción a dist/
```

`GET /health` → `{"ok":true}`. La SPA se sirve en `/`.

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

Bun · Elysia · React 19 · Tailwind 4 · shadcn/ui · Postgres (Drizzle,
en P2) · Redis (Bun.redis) · Auth.js (en P3) · Octokit (en P10).

Detalle completo y razonamiento en
[`specs/tech-stack.md`](specs/tech-stack.md).
