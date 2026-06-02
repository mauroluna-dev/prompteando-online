# Roadmap — prompteando

> **Convenciones canónicas: ver [`conventions.md`](./conventions.md)**.
> Toda fase desde P10 sigue esas convenciones. P0–P9 fueron alineadas
> retroactivamente en Pα/Pβ (2026-05-03).

## Principios
- **Fases atómicas**: cada fase es un PR mergeable, demoable o
  testeable de forma independiente.
- **Slicing vertical**: cada fase entrega valor end-to-end (BD →
  application → HTTP → UI) cuando aplica, no capas horizontales.
- **No skipping**: las dependencias declaradas son duras. Si una
  fase necesita la anterior, no se arranca antes.
- **Cada fase actualiza CLAUDE.md / README.md** si introduce
  convenciones nuevas.
- **Toda fase respeta `conventions.md`**: env via `env.ts`, commits
  conventional, hooks husky, ESLint+sonarjs, constants per-feature,
  use cases con `execute(...)` (≤4 posicional / ≥5 object), entities
  como clases con invariantes, VOs como clases con `static parse`,
  `CryptoPort` para todo lo no-determinístico, file suffixes por rol.

---

## P0 — Hexagonal scaffolding
**Goal**: dejar el repo estructurado para que cualquier feature
posterior caiga en su lugar.
**Deliverables**:
- Crear carpetas vacías: `src/domain/`, `src/application/{commands,queries,ports}/`, `src/infrastructure/{persistence,github,cache,auth}/`, `src/interfaces/http/{routes,middlewares}/`, `src/frontend/`.
- Mover `src/App.tsx`, `src/APITester.tsx`, `src/frontend.tsx`, `src/index.html`, `src/index.css`, `src/lib/`, `src/components/` a `src/frontend/`.
- Reescribir `src/index.ts` → `src/interfaces/http/server.ts` con Elysia (un solo route GET `/health` por ahora).
- Instalar deps base del stack (elysia, drizzle-orm, drizzle-kit, zod, swr, react-router).
- `tsconfig.json` con path aliases (`@/domain`, `@/application`, `@/infrastructure`, `@/interfaces`, `@/frontend`).
- Test dummy en `src/domain/__test__/sanity.test.ts` con `bun test`.

**Verification**: `bun dev` levanta y `curl localhost:3000/health` devuelve 200. `bun test` pasa.
**Depends on**: —

---

## P1 — Docker Compose dev environment
**Goal**: levantar app + Postgres + Redis con un solo comando.
**Deliverables**:
- `docker-compose.yml`: app (oven/bun), postgres:16-alpine, redis:7-alpine.
- `Dockerfile` multi-stage para la app.
- `.env.example` con placeholders (DB_URL, REDIS_URL, AUTH_SECRET, GITHUB_CLIENT_ID, etc.).
- `.dockerignore`.
- Healthchecks en compose.

**Verification**: `docker compose up` levanta los 3 servicios, `curl localhost:3000/health` responde, `psql` y `redis-cli` conectan.
**Depends on**: P0.

---

## P2 — Postgres + Drizzle wiring
**Goal**: BD lista para que cualquier feature posterior solo agregue tablas y queries.
**Deliverables**:
- `drizzle.config.ts` apuntando a `Bun.sql`.
- `src/infrastructure/persistence/db.ts` (instancia Drizzle compartida).
- `src/infrastructure/persistence/schema.ts` (vacío + export pattern).
- Scripts en `package.json`: `db:generate`, `db:migrate`, `db:studio`.
- Una migration vacía aplicada para validar el pipeline.

**Verification**: `bun run db:migrate` corre sin error contra el Postgres del compose. Tabla `__drizzle_migrations` existe.
**Depends on**: P1.

---

## P3 — Auth.js + GitHub provider
**Goal**: login con GitHub funcional end-to-end.
**Deliverables**:
- Schemas Auth.js (`users`, `accounts`, `sessions`, `verificationTokens`) en `schema.ts` vía `@auth/drizzle-adapter`.
- `src/infrastructure/auth/auth-config.ts` con provider GitHub (scopes: `repo`, `read:user`, `user:email`).
- Handler Elysia que bridge Request → `Auth(request, config)` → Response.
- Routes: `/auth/signin`, `/auth/callback/github`, `/auth/signout`, `/auth/session`.
- Pantalla `/login` en frontend con botón "Continuar con GitHub".

**Verification**: click GitHub → consent → callback → cookie sesión seteada → `GET /auth/session` devuelve user. Verificar fila en `users` y `accounts` tras login.
**Depends on**: P2.

---

## P4 — Auth.js + Google provider
**Goal**: signup sin GitHub para no-coders.
**Deliverables**:
- Provider Google añadido a `auth-config.ts`.
- Botón "Continuar con Google" en `/login`.

**Verification**: login con Google funciona idempotente. Mismo `email` no crea segundo `users` row.
**Depends on**: P3.

---

## P5 — Session UX (current user, logout, layout)
**Goal**: UI consciente de la sesión.
**Deliverables**:
- `GetCurrentUserQuery` (application) → endpoint `GET /api/me`.
- SWR hook `useCurrentUser()`.
- Layout con avatar + email + dropdown con "Sign out".
- Redirect: usuarios no autenticados → `/login`; autenticados en `/login` → `/`.

**Verification**: refresh mantiene sesión, sign out limpia cookie y vuelve a `/login`.
**Depends on**: P4.

---

## P6 — Prompts CRUD (sin versionado)
**Goal**: crear/listar/borrar prompts. El "save" todavía no genera versiones.
**Deliverables**:
- **Domain** (`src/domain/prompt/`): entity `Prompt`, VOs `Slug`, `PromptName`, errores.
- **Application**: `CreatePromptCommand`, `DeletePromptCommand`, `GetPromptBySlugQuery`, `ListPromptsForUserQuery`; port `PromptRepository`.
- **Infrastructure**: `PostgresPromptRepository` (Drizzle), schema `prompts`.
- **HTTP**: `POST /api/prompts`, `GET /api/prompts`, `GET /api/prompts/:slug`, `DELETE /api/prompts/:slug`.
- **Frontend**: lista (dashboard), form crear, detalle (read-only), borrar.

**Verification**: crear 3 prompts → verlos listados → ver detalle → borrar uno → desaparece. Slug auto-generado desde name, único por usuario.
**Depends on**: P5.

---

## P7 — Versionado de prompts
**Goal**: cada save crea una versión inmutable. Historial completo.
**Deliverables**:
- **Domain**: entity `PromptVersion`, VO `VersionNumber`.
- **Application**: `SaveNewVersionCommand`, `RestoreVersionCommand` (crea nueva versión copiando contenido de una histórica), `GetVersionQuery`, `ListVersionsQuery`; port `VersionRepository`.
- **Infrastructure**: `PostgresVersionRepository`, schema `prompt_versions`, FK `prompts.current_version_id → prompt_versions.id`.
- **HTTP**: `POST /api/prompts/:slug/versions`, `GET /api/prompts/:slug/versions`, `GET /api/prompts/:slug/versions/:n`, `POST /api/prompts/:slug/versions/:n/restore`.
- **Frontend**: editor (textarea + commit message), botón Save, panel lateral con historial (numero, mensaje, fecha, autor), click en versión → vista readonly, botón "Restaurar".

**Verification**: editar 3 veces → 3 versiones listadas, current = v3. Restaurar v1 → crea v4 con content de v1, current = v4.
**Depends on**: P6.

---

## P8 — API Keys management (UI)
**Goal**: el usuario puede crear/revocar keys desde el dashboard.
**Deliverables**:
- **Domain**: entity `ApiKey` (id, name, prefix, hash, last_used_at, revoked_at).
- **Application**: `CreateApiKeyCommand` (returns plaintext una sola vez), `RevokeApiKeyCommand`, `ListApiKeysForUserQuery`; port `ApiKeyRepository`, port `ApiKeyHasher`.
- **Infrastructure**: `PostgresApiKeyRepository`, `BunPasswordApiKeyHasher` (argon2id).
- **HTTP**: `POST /api/keys`, `GET /api/keys`, `DELETE /api/keys/:id`.
- **Frontend**: pantalla `/settings/api-keys`, botón "Generate", modal mostrando plaintext con copy + warning, lista con name/prefix/last_used/revoke.

**Verification**: generar key → verla solo una vez → en lista solo aparece prefix + name. Revocar la oculta del listado de activas.
**Depends on**: P7.

---

## P9 — API pública de consumo + rate limiting
**Goal**: leer un prompt desde n8n / curl con `Authorization: Bearer po_live_xxx`.
**Deliverables**:
- **Application**: `GetLatestPublishedVersionQuery` (by user_id + slug); port `RateLimiter`, port `Cache`.
- **Infrastructure**: `BunRedisRateLimiter` (sliding window 100 req/min default), `BunRedisCache` (TTL 5min, invalidate on save), `ApiKeyAuthMiddleware` (Elysia).
- **HTTP**: `GET /v1/prompts/:slug` → `{ content, version, updated_at, commit_message }`.
- Cache invalidation hook en `SaveNewVersion`.

**Verification**: `curl -H "Authorization: Bearer <key>" /v1/prompts/<slug>` devuelve 200 + content. Key revocada → 401. Exceder rate limit → 429 con `Retry-After`. Save invalida cache (siguiente fetch trae versión nueva).
**Depends on**: P8.

---

## Pα — Constitution alignment & tooling
**Goal**: codificar 10 decisiones arquitectónicas como conventions y
agregar lint/hooks que las refuercen automáticamente. Sin refactor de
código.
**Deliverables**:
- `specs/conventions.md` (NEW, single SoT).
- `specs/tech-stack.md` actualizado (CQS, entities, VOs, env, crypto,
  tooling, naming).
- Memory updates: `project_constitution.md`,
  `feedback_cqs_class_convention.md`, `MEMORY.md`.
- DevDeps: `eslint`, `typescript-eslint`, `eslint-plugin-sonarjs`,
  `husky`, `@commitlint/cli`, `@commitlint/config-conventional`.
- `eslint.config.js`, `commitlint.config.js`,
  `.husky/commit-msg`, `.husky/pre-push`.
- npm scripts: `lint`, `lint:fix`, `test`, `typecheck`, `prepare`.

**Verification**: `bun install` ok. `git commit -m "bad"` rechazado.
`git commit -m "chore: ok"` aceptado. `git push` corre los 4 checks.
**Depends on**: P9.

---

## Pβ — Retroactive refactor
**Goal**: aplicar las 10 conventions al código existente (P0–P9).
Después de Pβ, el baseline matchea la constitución antes de empezar
P10.
**Deliverables**:
- `src/infrastructure/config/env.ts` con Zod schema; reemplazar
  `process.env.X` en 7 callsites.
- `constants.ts` per-feature (`src/domain/api-key/`,
  `src/domain/prompt/`).
- VOs como clases (`Slug`, `PromptName`, `ApiKeyName`,
  `VersionNumber`, `ApiKeyPlaintext`).
- Entidades como clases (`Prompt`, `ApiKey`, `PromptVersion`,
  `User`) con `static create/fromRow` y métodos de comportamiento.
- Unified `CryptoPort` + `BunCryptoAdapter`; eliminar
  `ApiKeyHasher` y `BunPasswordApiKeyHasher`.
- `execute()` con args posicionales (≤4) o object input (≥5).
- File renames con suffix por rol.

**Verification**: `bun run lint` 0 warnings, `bun run typecheck` 0
errors, `bun test` pasa, `bun run build` ok, smoke manual end-to-end
(login → create prompt → save version → restore → revoke API key →
curl con Bearer ok).
**Depends on**: Pα.

---

## P10 — GitHub repo creation on connect
**Goal**: usuario conecta GitHub → se crea repo `prompteando-<username>` privado.
**Deliverables**:
- **Domain**: entity `GitHubConnection`.
- **Application**: `ConnectGitHubCommand`, `DisconnectGitHubCommand`, `GetGitHubConnectionQuery`; port `GitHubGateway`.
- **Infrastructure**: `OctokitGitHubGateway` (`createRepo`, `commitFile`, `getRepo`); `TokenEncryption` helper (envelope encryption con `AUTH_SECRET`-derived key).
- Schema: `user_github_connection`.
- **HTTP**: `POST /api/integrations/github/connect`, `DELETE /api/integrations/github/disconnect`, `GET /api/integrations/github`.
- **Frontend**: card en `/settings/integrations` con botón "Conectar GitHub". Si user signed up con Google, dispara OAuth de GitHub adicional.
- README en repo creado: `README.md` con explicación + link a la app.

**Verification**: usuario nuevo signed up con Google → conecta GitHub → repo `prompteando-<username>` aparece en su GitHub privado con README.
**Depends on**: P9.

---

## P11 — Auto-commit on SaveNewVersion
**Goal**: cada save commitea en el repo del usuario (cuando está conectado).
**Deliverables**:
- `SaveNewVersionCommand` extendido: si hay `GitHubConnection`, dispara `gateway.commitVersion()` después de persistir en Postgres.
- Retry con backoff (3 intentos, ~1s/3s/9s). Final fail → `github_commit_sha = null` + log warning.
- Path en repo: `prompts/<slug>.md`. Commit message: `<prompt_name> v<N>: <commit_message>`.
- **Frontend**: lista de versiones muestra ícono GitHub linkeando al commit cuando `github_commit_sha != null`. Warning visible si falló sync.

**Verification**: editar prompt → save → en GitHub aparece commit con file `prompts/<slug>.md` con el contenido nuevo. Cortar internet hacia GitHub → save igual persiste, UI muestra warning de sync fallido.
**Depends on**: P10.

---

## P12 — Backfill al conectar GitHub tarde
**Goal**: usuario que tenía prompts antes de conectar GitHub no pierde su historial — se replica cronológicamente.
**Deliverables**:
- **Application**: `BackfillGitHubHistoryCommand` (itera prompts del user, ordena versiones por created_at, commitea una a una con timestamps de commit alineados).
- Disparo: tras `ConnectGitHub` exitoso, en background.
- Estado de progreso persistido (campo en `user_github_connection`).
- **Frontend**: indicador "Syncing X of Y commits..." en `/settings/integrations`. Toast al terminar.

**Verification**: usuario sin GitHub crea 5 prompts con 3 versiones c/u → conecta GitHub → repo termina con 15 commits ordenados cronológicamente.
**Depends on**: P11.

---

## P13 — Export ZIP/JSON
**Goal**: anti-vendor-lock-in incluso sin GitHub. Bajarte todo en un click.
**Deliverables**:
- **Application**: `ExportAllPromptsQuery` → ZIP stream con estructura `prompts/<slug>/v<N>.md` + `index.json` con metadata.
- **HTTP**: `GET /api/export.zip` (auth con sesión).
- **Frontend**: botón "Download my data" en `/settings`.

**Verification**: descargar ZIP → abrir → contiene `index.json` + carpetas con todas las versiones en markdown.
**Depends on**: P9 (no requiere GitHub).

---

## P14 — CI con GitHub Actions
**Goal**: cada push/PR corre lint + test + build.
**Deliverables**:
- `.github/workflows/ci.yml`:
  - Trigger: `push` y `pull_request`.
  - Jobs:
    - **typecheck**: `bun install` + `bunx tsc --noEmit`.
    - **test**: `bun test` con services Postgres + Redis.
    - **build**: `bun run build`.
- Branch protection en `main` requiriendo los 3 checks.

**Verification**: abrir PR → 3 checks corren y pasan en verde.
**Depends on**: P13 (CI cubre todas las features ya escritas).

---

## P15 — Deploy a VPS (Traefik externo)
**Goal**: app accesible en dominio público con HTTPS.
**Asunción**: la VPS ya tiene Traefik corriendo como reverse proxy global. prompteando solo aporta su `docker-compose.prod.yml` con labels Traefik para auto-discovery.
**Deliverables**:
- `Dockerfile` de producción (multi-stage, mínimo).
- `docker-compose.prod.yml` con app + postgres + redis. La app expone su puerto interno (no `ports:` mappeado al host) y declara labels Traefik (`traefik.enable=true`, `traefik.http.routers.prompteando.rule=Host(...)`, `...tls.certresolver=...`). Conectado a la network externa de Traefik.
- Script `scripts/deploy.sh`: SSH al VPS, `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`.
- `.env.production.example` documentado.
- Sección "Deploy" en `README.md`: prerequisitos (Traefik ya corriendo, network compartida, dominio apuntando), pasos de primer deploy, rotación de secrets.
- **Cron de cleanup de sesiones expiradas**: Auth.js (db strategy)
  no borra filas de `sessions` cuando expiran — solo deja de
  considerarlas válidas. Agregar cron diario que ejecute
  `DELETE FROM sessions WHERE expires < NOW()`. Implementable como
  servicio extra en `docker-compose.prod.yml` (imagen `postgres:16-alpine`
  con cron interno) o como systemd timer en el VPS. Sin esto la tabla
  crece monotónicamente con cada login.

**Verification**: dominio público resuelve, HTTPS válido (cert emitido por Traefik), signup + crear prompt + consumir API funciona en prod. Cron de sesiones corre y deja la tabla `sessions` solo con filas no expiradas.
**Depends on**: P14.

---

## P16 — E2E + polish
**Goal**: producto sentido como producto.
**Deliverables**:
- Playwright E2E: signup con GitHub → crear prompt → editar 2x → consumir desde curl con key generada → ver ambos commits en repo.
- Empty states (sin prompts, sin keys, sin GitHub conectado).
- Loading skeletons en lista de prompts y versiones.
- Toasts de error/éxito (con `sonner` o equivalente).
- Onboarding: si user nuevo, sugerir crear "Mi primer prompt" con template.
- README con demo GIF + badge de CI.
- Sentry opt-in (si `SENTRY_DSN` está seteado, se inicializa).

**Verification**: Playwright suite pasa en CI. Demo en video de < 2 min cubriendo end-to-end.
**Depends on**: P15.

---

## Pγ — UI redesign sprint
**Goal**: pasar del wireframe utilitario actual a un design system
profesional cohesivo. Sin features nuevas — re-skin completo.
Decidido en sesión 2026-05-04: rediseño desde cero usando Pencil
con un style fuerte (referencia visual a definir; baseline
candidato: dev-tool aesthetic tipo Linear / Resend / Cursor).
**Deliverables**:
- `pencil-redesign.pen` (NEW) con frames cohesivos para: Landing,
  Login, Prompt List, Prompt Editor (con diff view de P17),
  API Keys (con dashboard de P18), Settings/Integrations
  (incluye backfill UI de P12).
- Design tokens en `src/frontend/styles/tokens.css`: paleta,
  tipografía, spacing, radius, shadows. Wired al Tailwind v4 config
  via `@theme`.
- Refactor de los componentes existentes (Card, Button, Input,
  Badge) para alinearse a los tokens.
- Componentes shared nuevos según necesite el redesign:
  `EmptyState`, `Skeleton`, `Stat`, `MiniSparkline`.
- README en `src/frontend/components/` documentando cuándo usar qué.

**Verification**: cada pantalla del .pen tiene contraparte React
implementada con el design system nuevo. Sin regresiones
funcionales (todos los flujos E2E siguen pasando). Smoke visual
manual sobre las 6 pantallas principales.
**Depends on**: P16 (no bloquea pero da más superficie a redesign).
**Paralelizable con**: P17, P18 (se pueden integrar progresivamente
si la lib de diseño y los tokens ya están listos).

---

## P17 — Markdown editor + version diff
**Goal**: reemplazar el `<textarea>` plano por un editor markdown
con syntax highlighting + comparación side-by-side entre dos
versiones cualesquiera.
**Decisiones (sesión 2026-05-04)**:
- **Editor**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`,
  `@codemirror/lang-markdown`, `@codemirror/theme-one-dark` o tema
  custom). Headless, ~70KB gzipped, soporta diff via `MergeView`.
- **Diff**: side-by-side con version picker (A | B) en el sidebar
  de historial. Cambios resaltados con `@codemirror/merge`. Default
  apertura: vN-1 vs vN actual.

**Deliverables**:
- **Frontend**:
  - Componente `<MarkdownEditor />` envolviendo CodeMirror 6 con
    el theme alineado al design system (Pγ).
  - Componente `<VersionDiff />` con `MergeView` configurado
    side-by-side, soporta selección dinámica de versiones A/B.
  - En `PromptEditorPage`: toggle "Edit / Diff vs…", picker de
    versión a comparar, scroll sincronizado.
  - Hook `useVersionDiff(slug, vA, vB)` que reusa `useVersions` y
    devuelve los contenidos sincronizados.
- **Backend**: ningún cambio. El diff se computa client-side a
  partir de los contenidos ya disponibles en `GET /api/prompts/:slug/versions`.

**Verification**: editar un prompt en el editor nuevo persiste
sin regresión vs textarea. Abrir `Diff vs v2` muestra un
side-by-side con highlights. Cambiar el picker re-renderea el
diff sin re-fetch (los versions ya están en SWR cache).
**Depends on**: P9 (P10-P16 no son requisito duro).
**Paralelizable con**: P18.

---

## P18 — API Key usage metrics
**Goal**: que el usuario vea cuánto se está usando cada API key,
desde qué prompts, con qué latencia y errores. Sale del
"out-of-scope V1" de observabilidad porque es de producto, no
de infra.
**Decisiones (sesión 2026-05-04)**:
- **Granularidad**: aggregate counters en Redis + snapshot diario
  en Postgres. Cada request a `/v1/prompts/:slug` hace
  `INCR ratelimit:apikey:<id>:counts:<YYYY-MM-DD>`,
  `LPUSH ratelimit:apikey:<id>:lat:<YYYY-MM-DD> <ms>` (capped a
  10K samples para p50/p95). Cron diario a 00:05 UTC consolida
  en `api_key_metrics_daily` (`api_key_id, day, total_requests,
  total_errors, p50_ms, p95_ms, top_prompts: jsonb`).
- **Retención**: 90 días en `api_key_metrics_daily`. Después
  borrado por cron mensual.

**Deliverables**:
- **Domain** (`src/domain/api-key/`): VO `MetricsSnapshot`,
  entity `ApiKeyMetricsDaily`.
- **Application**:
  - `RecordApiKeyHitCommand` (input: keyId, slug, statusCode,
    latencyMs) — escribe a Redis. Llamado desde el middleware de
    `/v1/prompts/:slug`.
  - `ConsolidateApiKeyMetricsJob` (job diario): scaneía las keys
    de Redis, calcula p50/p95, escribe la fila diaria, borra los
    contadores del día.
  - `GetApiKeyMetricsQuery` (input: keyId, range: 7d|30d|90d):
    devuelve serie diaria + agregados.
- **Ports**: `MetricsCounter` (port nuevo, Redis-backed),
  `ApiKeyMetricsRepository`.
- **Infrastructure**:
  - `BunRedisMetricsCounter`.
  - `PostgresApiKeyMetricsRepository`.
  - Schema: `api_key_metrics_daily`. Migration nueva.
- **HTTP**:
  - Middleware extendido en `/v1/prompts/:slug` que captura
    `latencyMs = end - start` y status, llama
    `recordApiKeyHit.execute()` fire-and-forget.
  - `GET /api/keys/:id/metrics?range=30d` → 200 con
    `{daily: [...], total, errorRate, p50, p95, topPrompts}`.
- **Frontend**:
  - En `/settings/api-keys`, expandir cada key a un detail panel
    con: chart de requests/día (últimos 30d, sparkline + bar
    chart), p50/p95 actuales, error rate, top 5 prompts
    consumidos. Lib: `recharts` (mismo runtime que React 19, ~40KB).
  - Vista `/settings/api-keys/:id` para deep-dive con range
    picker (7d / 30d / 90d).
- **Cron**: agregado al `docker-compose.prod.yml` como servicio
  o systemd timer (alineado al cleanup de sesiones de P15).

**Verification**: hacer 50 requests a `/v1/prompts/foo` con 3 keys
distintas → ver counters subir en Redis en vivo, ver el dashboard
mostrar la actividad. Esperar al consolidate job (o forzarlo) →
fila aparece en `api_key_metrics_daily`.
**Depends on**: P9 (necesita la API pública existente).
**Paralelizable con**: P17.

---

## V2 — Templates con substitución de variables (deferred)
**Goal (V2 only, no V1)**: prompts con `{{variable}}` que se
sustituyen al consumirlos por la API. Permite reutilizar un mismo
template con datos distintos sin duplicar contenido ni hacer
substitución del lado cliente.
**Decisión (sesión 2026-05-04)**: queda OUT del roadmap V1 por
volumen de drawbacks pendientes de discusión:
- Breaking change con prompts que contengan `{{` literal
  (mitigación: opt-in `is_template` per-prompt).
- Escape semantics (Mustache HTML-escapa por default; para
  prompts crudos hay que forzar raw).
- Versionado: rename de `{{var}}` entre versiones rompe callers
  existentes; necesita pinning por `?version=N` en el render.
- Schema management (declarado vs inferido auto-parseando `{{}}`).
- Prompt injection desde vars (responsabilidad del consumer,
  pero documentar warning).
- Endpoints (`POST /v1/prompts/:slug/render` separado vs extender
  el `GET` actual con `?var.x=Y`).

**Pre-decisión tentativa**:
- Sintaxis: Mustache logic-less con `{{var}}` raw (sin escape).
- Engine: `mustache` (npm) o el parser propio (regex `/\{\{(\w+)\}\}/g`
  + replace, ~30 líneas) si no se necesitan loops.
- Activación: opt-in via `is_template: bool` en `prompts`.
- Detección de vars: inferida parseando el content al guardar
  versión, persistida en `prompt_versions.template_vars: jsonb`.
- Endpoint: `POST /v1/prompts/:slug/render` con body
  `{vars: {...}, version?: N}` → `{content: <rendered>, version,
  vars_used, missing_vars}`. El `GET` raw existente sigue funcionando.

A retomar después de cerrar V1 (P0–P18 + Pγ).

---

## Resumen de cadena de dependencias
```
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → Pα → Pβ → P10 → P11 → P12 → P13 → P14 → P15 → P16
                                                                                              ├── Pγ (UI redesign)
                                                                                              ├── P17 (markdown editor + diff)
                                                                                              └── P18 (API key metrics)
                                                                                                       ↓
                                                                                                      V2 (templates)
```
Lineal por diseño hasta P16: cada fase extiende capacidades sobre
la anterior. Pγ/P17/P18 son post-MVP y paralelizables — comparten
solo el design system (Pγ debería arrancar primero o en paralelo
con tokens publicados antes de que P17/P18 lleguen al frontend).
Templates (V2) deliberadamente fuera de la cadena V1.
Pα/Pβ son fases de alineación — no entregan features de producto
pero blindan la base para todas las fases siguientes.
