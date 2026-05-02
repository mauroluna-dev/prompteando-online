# Tech Stack — promptstash

## Filosofía
- 100% Bun (runtime, package manager, bundler, test runner).
- Preferir APIs nativas de Bun antes que libs externas (per CLAUDE.md).
- TypeScript strict en todo el stack.
- Source of truth: Postgres. GitHub es mirror opcional cuando el
  usuario lo conecta.
- **Arquitectura hexagonal con CQS** (Command/Query Separation, sin
  event sourcing) para dominio testeable y futureproof.

## Runtime & Server
- **Bun** (latest)
- **Elysia** — framework HTTP sobre `Bun.serve`. Type-safe end-to-end,
  decoradores ergonómicos, ecosistema de plugins. Reemplaza el uso
  directo de `Bun.serve` para tener routing/middlewares ergonómicos.

## Architecture — Hexagonal + CQS

Estructura de carpetas:
```
src/
├── domain/                 # Entidades, VOs, errores. Cero deps externas.
│   ├── prompt/
│   ├── version/
│   ├── user/
│   └── api-key/
├── application/            # Use cases. Commands y Queries separados.
│   ├── commands/           # CreatePromptCommand, SaveNewVersionCommand, RotateApiKeyCommand, ConnectGitHubCommand.
│   ├── queries/            # GetPromptBySlugQuery, ListPromptsQuery, GetLatestVersionQuery.
│   └── ports/              # Interfaces (PromptRepository, GitHubGateway, etc).
├── infrastructure/         # Adapters concretos. Único lugar que importa libs externas.
│   ├── persistence/        # Drizzle repositories.
│   ├── github/             # OctokitGitHubGateway.
│   ├── cache/              # BunRedisCache + RateLimiter.
│   └── auth/               # Auth.js wiring + session store.
├── interfaces/             # HTTP (Elysia routes), CLI si hace falta.
│   └── http/
│       ├── routes/
│       ├── middlewares/
│       └── server.ts       # Composition root.
└── frontend/               # React app. Habla con interfaces/http vía SWR.
```

Reglas duras:
- `domain/` no importa NADA de fuera (ni Drizzle, ni Octokit, ni Elysia).
- `application/` solo importa de `domain/` y de sus propios `ports/`.
- `infrastructure/` implementa los `ports/`. Único lugar con libs externas.
- `interfaces/http/` es composition root: instancia adapters y los
  inyecta en commands/queries antes de dispatchar.

CQS:
- **Una clase por use case**. Naming canónico:
  - Commands: `<Verb><Noun>Command` (ej. `CreatePromptCommand`,
    `SaveNewVersionCommand`).
  - Queries: `<Verb><Noun>Query` (ej. `GetPromptBySlugQuery`,
    `ListPromptsForUserQuery`).
- **API pública uniforme**: cada clase expone un único método público
  `execute(...params)`. El constructor recibe los ports (deps) que
  el composition root inyecta.
- **Commands** mutan estado y devuelven `void` o la entidad creada;
  lanzan errores de dominio.
- **Queries** devuelven DTOs read-optimizados; nunca mutan.
- Forma esperada:
  ```ts
  export class CreatePromptCommand {
    constructor(private readonly repo: PromptRepository) {}
    async execute(input: CreatePromptInput): Promise<Prompt> { ... }
  }

  export class GetPromptBySlugQuery {
    constructor(private readonly repo: PromptRepository) {}
    async execute(userId: string, slug: Slug): Promise<Prompt> { ... }
  }
  ```
- Composition root (en `interfaces/http/server.ts`) instancia cada
  command/query con sus deps:
  ```ts
  const createPrompt = new CreatePromptCommand(promptRepo);
  ```
- V1 sin event sourcing ni event bus. Camino abierto a CQRS completo
  si el roadmap lo justifica.

## Database
- **Postgres 16+** — source of truth.
- **Bun.sql** — driver nativo (per CLAUDE.md: no `pg`, no `postgres.js`).
- **Drizzle ORM** + adapter `drizzle-orm/bun-sql` — schema + queries
  type-safe en `infrastructure/persistence/`.
- **Drizzle Kit** — generación y aplicación de migrations.

Schemas core (V1):
- `users` (id, email, name, avatar, created_at)
- `accounts` y `sessions` — managed by Auth.js Drizzle adapter.
  Aquí vive el `access_token` de GitHub (encrypted at rest).
- `prompts` (id, user_id, name, slug, description,
  current_version_id, created_at, updated_at)
- `prompt_versions` (id, prompt_id, version_number, content,
  commit_message, github_commit_sha (nullable), created_at)
- `api_keys` (id, user_id, name, key_hash, last_used_at,
  created_at, revoked_at (nullable))
- `user_github_connection` (user_id, repo_full_name, default_branch,
  connected_at) — solo si conectó GitHub.

## Cache & Rate Limiting
- **Redis** vía **Bun.redis** (per CLAUDE.md: no `ioredis`).
- Adapter en `infrastructure/cache/`.
- Usos V1:
  - Rate limiting de la API pública por API key (sliding window).
  - Cache de "última versión publicada" por prompt.

## Auth
- **Auth.js** (`@auth/core`) — framework-agnostic.
  Adapter `@auth/drizzle-adapter` para Postgres.
- Bridge a Elysia: handler que pasa el `Request` a `Auth()` de
  `@auth/core` y devuelve la `Response` resultante. (Si aparece
  fricción, fallback a `elysia-authjs` comunitario.)
- **Providers V1**: GitHub OAuth (flagship) + Google OAuth (fallback
  no-coder). Sin email/password.
- **Sesión**: database strategy con Drizzle adapter. Cookie
  HttpOnly + Secure firmada por Auth.js.
- El `access_token` de GitHub vive en `accounts` (encrypted at rest).
  Solo `infrastructure/github/` lo desencripta para llamar a Octokit.

## API Keys (consumo público)
- Generadas en dashboard. Formato: `ps_live_<32 chars>`.
- Plaintext mostrado UNA sola vez. En BD solo `key_hash`
  (Bun.password con argon2id).
- Header de consumo: `Authorization: Bearer <key>`.
- Middleware Elysia (`infrastructure/auth/api-key-middleware.ts`)
  verifica key + rate limit (Redis) antes de despachar al query.

## GitHub Integration
- **Octokit** (`@octokit/rest` + `@octokit/auth-oauth-user`).
- Adapter `infrastructure/github/OctokitGitHubGateway.ts` implementa
  el port `GitHubGateway` (definido en `application/ports/`).
- Flujo:
  1. Usuario conecta GitHub (OAuth, scope `repo`) — Auth.js ya capturó
     el token en `accounts`.
  2. Backend crea repo `promptstash-<username>` (privado por default).
  3. Cada `SaveNewVersion` command, después de persistir en Postgres,
     llama a `GitHubGateway.commitVersion()`.
- Errors: retry con backoff. Si falla 3 veces, `github_commit_sha = null`
  y warning en UI. Postgres nunca se bloquea por GitHub.
- Backfill al conectar GitHub tarde: dump cronológico del historial
  existente como commits.

## Frontend
- **React 19** + **TypeScript** + **Tailwind v4** + **shadcn/ui**
  (ya scaffolded).
- **React Router v7** (data mode) — routing client-side.
- **SWR** — fetching con stale-while-revalidate cache. Mutations
  via `useSWRMutation`.
- **react-hook-form** + **zod** — forms y validación.
- Bundling vía Bun HTML imports (sin Vite, per CLAUDE.md).

## Validation
- **Zod** — schemas compartidos entre client y server (en `domain/`
  o package `shared/` según convenga).

## Testing
- `bun test` para unit (domain + application puros, con fakes para
  los ports) + integration (Postgres dedicado).
- **Playwright** para E2E del flujo crítico: signup → crear prompt
  → consumirlo por API desde curl.

## Observability (mínimo V1)
- Logs estructurados (`console.log` con JSON) en middleware Elysia.
- Error tracking: Sentry (opt-in, no bloqueante).
- Sin metrics / tracing en V1.

## Deploy — Docker Compose
`docker-compose.yml` con servicios:
- **app**: imagen `oven/bun:latest`, multi-stage build, expone 3000.
- **postgres**: `postgres:16-alpine`, volumen persistente.
- **redis**: `redis:7-alpine`.

Dev: `docker compose up` levanta los 3.
Prod: el mismo compose deployable a Railway / Fly / Hetzner / VPS.
Secrets (OAuth client IDs, encryption key, etc.) vía `.env`.

## Dependencias a instalar (V1)
```
elysia
@elysiajs/cors
@elysiajs/swagger        # opcional, doc auto de la API
drizzle-orm
drizzle-kit
@auth/core
@auth/drizzle-adapter
@octokit/rest
@octokit/auth-oauth-user
react-router
swr
react-hook-form
@hookform/resolvers
zod
```
(React, Tailwind y shadcn ya están en `package.json`.)
