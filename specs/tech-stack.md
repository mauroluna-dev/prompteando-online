# Tech Stack — prompteando

> **Convenciones canónicas: ver [`conventions.md`](./conventions.md)**.
> Si algo de este doc entra en conflicto con `conventions.md`, gana
> `conventions.md`.

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
├── application/            # Use cases. Commands, Queries y Jobs separados.
│   ├── commands/           # CreatePromptCommand, SaveNewVersionCommand, RotateApiKeyCommand, ConnectGitHubCommand.
│   ├── queries/            # GetPromptBySlugQuery, ListPromptsQuery, GetLatestVersionQuery.
│   ├── jobs/               # CommitVersionToGitHubJob (background side-effects, fire-and-forget).
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

CQS + Jobs (ver `conventions.md` §6 y §9 para reglas exactas):
- **Una clase por use case**. Naming canónico:
  - Commands: `<Verb><Noun>Command` en `*.command.ts`.
  - Queries: `<Verb><Noun>Query` en `*.query.ts`.
  - Jobs (background, fire-and-forget): `<Verb><Noun>Job` en
    `*.job.ts`. Single `run(input)` method. Persisten su error
    como estado en vez de throw — no hay caller esperando.
- **API pública uniforme**: cada clase expone un único método público
  `execute(...)`. El constructor recibe los ports (deps).
- **Param shape**:
  - 1–4 inputs → posicionales (opcionales al final).
  - 5+ inputs → un único `input: { ... }` object.
- **Commands** mutan estado y devuelven `void` o la entidad creada;
  lanzan errores de dominio.
- **Queries** devuelven DTOs read-optimizados; nunca mutan.
- Forma esperada:
  ```ts
  export class CreatePromptCommand {
    constructor(
      private readonly repo: PromptRepository,
      private readonly crypto: CryptoPort,
    ) {}
    async execute(
      userId: string,
      name: string,
      description?: string,
    ): Promise<Prompt> { ... }
  }
  ```
- Composition root (`interfaces/http/server.ts`) instancia cada
  command/query con sus deps inyectadas.

### Domain entities & value objects
Ver `conventions.md` §7 y §10 para detalle. Resumen:
- **Entidades** son clases con invariantes en constructor + factories
  `static create(...)` (input usuario) y `static fromRow(...)`
  (reconstitución desde DB). Mutadores son métodos de instancia.
  No hay `type Entity = { ... }` ni object literals.
- **VOs** son clases con `static parse(...)` y, cuando aplica,
  `static generate(...)`. Reemplaza el patrón anterior de
  `unique symbol` brand + función `parseFoo`/`generateFoo`.

V1 sin event sourcing ni event bus. Camino abierto a CQRS completo
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
  - Lock distribuido por `(userId, slug)` para serializar commits
    a GitHub (P11 + P12).
  - **Metrics counters** (P18): `INCR` para counts diarios y
    `LPUSH` con `LTRIM` para muestras de latencia (cap 10K por
    día por key). Consolidados a Postgres por cron diario.

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

### GitHub OAuth — dos OAuth Apps requeridas
GitHub OAuth Apps permiten **una sola** Authorization callback URL
por app. Tenemos dos flujos OAuth con callbacks distintos, así que
el setup de producción requiere registrar **dos OAuth Apps separadas**
en GitHub, cada una con sus propios client_id + secret:

| OAuth App | Callback URL | Envs | Consumer |
|---|---|---|---|
| App #1 — Login | `<AUTH_URL>/auth/callback/github` | `GITHUB_AUTH_CLIENT_ID/SECRET` | `auth-config.ts` (Auth.js GitHub provider) |
| App #2 — Integrations | `<AUTH_URL>/api/integrations/github/oauth-callback` | `GITHUB_INTEGRATIONS_CLIENT_ID/SECRET` | `OctokitGitHubAdapter` + `/api/integrations/github/oauth-start` |

Ambos pares de envs son **required at boot** (Zod schema en `env.ts`).
Sin las 4, el server falla fast. Documentado en `.env.example`.

Migración a GitHub Apps (que sí soportan múltiples callbacks) queda
out-of-scope V1 — refactor mucho mayor (installation tokens, JWT
signing con private key, no compatible con Auth.js GitHub provider
de oficio).

## API Keys (consumo público)
- Generadas en dashboard. Formato: `po_live_<32 chars>`.
- Plaintext mostrado UNA sola vez. En BD solo `key_hash`
  (argon2id vía `BunCryptoAdapter.hashPassword`).
- Header de consumo: `Authorization: Bearer <key>`.
- Middleware Elysia (`infrastructure/auth/api-key.middleware.ts`)
  verifica key + rate limit (Redis) antes de despachar al query.

## Crypto
Todo lo no-determinístico (UUIDs, random bytes, password hashing) vive
detrás del `CryptoPort` (ver `conventions.md` §8). Único adapter:
`BunCryptoAdapter` (`infrastructure/crypto/bun-crypto.adapter.ts`).
Application/domain code nunca importa `crypto`, `node:crypto` ni
`Bun.password` directamente.

## GitHub Integration
- **Octokit** (`@octokit/rest` + `@octokit/auth-oauth-user`).
- Adapter `infrastructure/github/OctokitGitHubGateway.ts` implementa
  el port `GitHubGateway` (definido en `application/ports/`).
- Flujo:
  1. Usuario conecta GitHub (OAuth, scope `repo`) — Auth.js ya capturó
     el token en `accounts`.
  2. Backend crea repo `prompteando-<username>` (privado por default).
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

### Design system (Pγ)
Reglas duras en `conventions.md` §11. Resumen del stack:

- **Tailwind v4 `@theme`** en `styles/globals.css` define los
  CSS vars que mapean a clases utility (`bg-primary`,
  `text-success-fg`, `font-display`, etc.).
- **Tokens semánticos prompteando**: `--ps-success-{fg,bg}`,
  `--ps-warning-{fg,bg}`, `--ps-info-{fg,bg}`,
  `--ps-diff-add-{fg,bg}`, `--ps-diff-del-{fg,bg}`. Expuestos
  como `bg-success-bg`, `text-diff-add-fg`, etc. via el
  `@theme inline` block.
- **Tokens shadcn** preservados (`--background`, `--foreground`,
  `--primary`, `--card`, `--border`, etc.) — Pγ ajustó solo
  `--background` a `oklch(0.985 0 0)` (#FAFAFA) para que las
  cards (`#FFF`) tengan separación visual sin shadow heavy.

**Tipografías** self-hosted via `@fontsource/*`:
- `@fontsource/cal-sans` — `font-display`, headings.
- `@fontsource/numans` — `font-sans`, body.
- `@fontsource/geist-mono` — `font-mono`, code.

Approx CSS bundle delta: +290 KB por las 3 fonts. Acceptable
porque cachean cross-page.

### Frontend layout patterns
- **Public pages** (Landing, Login) renderean su propio chrome
  (header sin tabs, footer si aplica). No usan `<AppShell>`.
- **`<AppShell>`** (`src/frontend/components/AppShell.tsx`) envuelve
  todas las rutas autenticadas con sticky header (brand + tabs +
  bell + user menu) + `<Outlet>`. Tabs: `Prompts | API Keys |
  Settings`. Active state usa `bg-muted` pill.
- **`<SettingsLayout>`** (`src/frontend/components/SettingsLayout.tsx`)
  agrega un sidebar de sub-navegación dentro de `/settings/*`
  (Profile / API Keys / Integrations / Billing soon). Renderea
  via `<Outlet>` también.
- **`<RequireAuth>`** redirect a `/login` si no hay sesión.
  **`<RedirectIfAuthed>`** mirror invertido — bumpa a `/prompts`
  si SÍ hay sesión (usado en `/` para que el landing no se vea
  a usuarios logueados).

### Routing map
| Path | Auth | Component |
|---|---|---|
| `/` | public (auto-redirect to `/prompts` if logged in) | `<LandingPage>` |
| `/login` | public | `<LoginPage>` |
| `/prompts` | required | `<PromptsListPage>` |
| `/prompts/new` | required | `<PromptCreatePage>` |
| `/prompts/:slug` | required | `<PromptDetailPage>` |
| `/settings` | required | redirect → `/settings/profile` |
| `/settings/profile` | required | `<SettingsProfilePage>` (en `<SettingsLayout>`) |
| `/settings/api-keys` | required | `<ApiKeysPage>` (en `<SettingsLayout>`) |
| `/settings/integrations` | required | `<SettingsIntegrationsPage>` (en `<SettingsLayout>`) |

### Editor markdown + diff (P17)
- **CodeMirror 6** (`@codemirror/state`, `@codemirror/view`,
  `@codemirror/lang-markdown`, `@codemirror/merge`). Headless,
  ~70KB gzipped, soporta diff side-by-side via `MergeView`.
  Razón: lightweight vs Monaco (~700KB), control total del theme
  para alinearlo a los design tokens de Pγ.
- Tema custom mapeado a los tokens del design system (no usar
  el theme `one-dark` por default).
- El diff se computa client-side; los contenidos vienen del SWR
  cache de `useVersions`. Cero load extra al backend.

### Charting (P18)
- **recharts** (~40KB) — line + bar + sparkline para el dashboard
  de API key metrics. React-native, SVG-based, customizable con
  el design system. Alternativa descartada: `chart.js` (canvas,
  más pesado, menos integrado a React).

## Validation
- **Zod** — schemas compartidos entre client y server.
- Caso canónico: `src/infrastructure/config/env.ts` parsea
  `process.env` con un schema Zod y **falla al startup** si algo
  falta o es inválido (ver `conventions.md` §1).
- Otros usos: HTTP request schemas en `interfaces/http/schemas/`.

## Configuración (env)
Una sola fuente de verdad para envs:
`src/infrastructure/config/env.ts`. Toda lectura de envs hace
`import { env } from "@/infrastructure/config/env"`. Nunca
`process.env.X` fuera de ese archivo.

## Testing
- `bun test` para unit (domain + application puros, con fakes para
  los ports) + integration (Postgres dedicado).
- **Playwright** para E2E del flujo crítico: signup → crear prompt
  → consumirlo por API desde curl.

## Tooling — lint, hooks, commits
Ver `conventions.md` §2–§4 y §9.

- **ESLint flat config** + `eslint-plugin-sonarjs` (`recommended`)
  + reglas TS strict. `bun run lint` con `--max-warnings=0`.
- **commitlint** (`@commitlint/config-conventional`) enforced
  por hook `commit-msg` (husky).
- **Pre-push hook** (husky) corre
  `bun run lint && bun run typecheck && bun run build && bun test`.
- **Naming de archivos** con suffix por rol (`.command.ts`,
  `.query.ts`, `.port.ts`, `.entity.ts`, `.vo.ts`, `.errors.ts`,
  `.repository.ts`, `.adapter.ts`, `.handler.ts`, `.middleware.ts`).
- **Constants per-feature**: cada módulo expone
  `export const CONSTANTS = { ... } as const` desde su
  `constants.ts`. No hay archivo global de constants.

## Observability (mínimo V1)
- Logs estructurados (`console.log` con JSON) en middleware Elysia.
- Error tracking: Sentry (opt-in, no bloqueante).
- **Métricas de producto** (P18): agregados Redis →
  consolidación diaria a Postgres → dashboard del usuario.
  Storage barato (counters + sample arrays), retention 90d.
  Esto es métrica de uso para el usuario final, no
  observability de infra (no replace para Prometheus/Grafana
  futuro).
- Sin tracing distribuido en V1.

## Templates engine (V2 only)
- Decisión post-V1. Tentativa: **Mustache** logic-less
  (`{{var}}` raw, sin escape) — npm `mustache` o parser propio
  (~30 LOC con regex `/\{\{(\w+)\}\}/g` + replace).
- Motivo de diferir: drawbacks pendientes (escape semantics,
  prompt injection from vars, versioning de breaking changes,
  schema declarado vs inferido). Ver `roadmap.md` → sección V2.

## Deploy — Docker Compose
`docker-compose.yml` con servicios:
- **app**: imagen `oven/bun:latest`, multi-stage build, expone 3000.
- **postgres**: `postgres:16-alpine`, volumen persistente.
- **redis**: `redis:7-alpine`.

Dev: `docker compose up` levanta los 3.
Prod: el mismo compose deployable a Railway / Fly / Hetzner / VPS.
Secrets (OAuth client IDs, encryption key, etc.) vía `.env`.

## Dependencias a instalar (V1)
Runtime:
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
fflate                   # P13 — streaming ZIP writer for data export
```
Frontend post-MVP (P17 + P18):
```
@codemirror/state
@codemirror/view
@codemirror/lang-markdown
@codemirror/merge
recharts
```
Dev/tooling (Pα):
```
eslint
typescript-eslint
eslint-plugin-sonarjs
husky
@commitlint/cli
@commitlint/config-conventional
```
(React, Tailwind y shadcn ya están en `package.json`.)
