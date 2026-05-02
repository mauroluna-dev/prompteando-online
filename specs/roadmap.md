# Roadmap — promptstash

## Principios
- **Fases atómicas**: cada fase es un PR mergeable, demoable o
  testeable de forma independiente.
- **Slicing vertical**: cada fase entrega valor end-to-end (BD →
  application → HTTP → UI) cuando aplica, no capas horizontales.
- **No skipping**: las dependencias declaradas son duras. Si una
  fase necesita la anterior, no se arranca antes.
- **Cada fase actualiza CLAUDE.md / README.md** si introduce
  convenciones nuevas.

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
**Goal**: leer un prompt desde n8n / curl con `Authorization: Bearer ps_live_xxx`.
**Deliverables**:
- **Application**: `GetLatestPublishedVersionQuery` (by user_id + slug); port `RateLimiter`, port `Cache`.
- **Infrastructure**: `BunRedisRateLimiter` (sliding window 100 req/min default), `BunRedisCache` (TTL 5min, invalidate on save), `ApiKeyAuthMiddleware` (Elysia).
- **HTTP**: `GET /v1/prompts/:slug` → `{ content, version, updated_at, commit_message }`.
- Cache invalidation hook en `SaveNewVersion`.

**Verification**: `curl -H "Authorization: Bearer <key>" /v1/prompts/<slug>` devuelve 200 + content. Key revocada → 401. Exceder rate limit → 429 con `Retry-After`. Save invalida cache (siguiente fetch trae versión nueva).
**Depends on**: P8.

---

## P10 — GitHub repo creation on connect
**Goal**: usuario conecta GitHub → se crea repo `promptstash-<username>` privado.
**Deliverables**:
- **Domain**: entity `GitHubConnection`.
- **Application**: `ConnectGitHubCommand`, `DisconnectGitHubCommand`, `GetGitHubConnectionQuery`; port `GitHubGateway`.
- **Infrastructure**: `OctokitGitHubGateway` (`createRepo`, `commitFile`, `getRepo`); `TokenEncryption` helper (envelope encryption con `AUTH_SECRET`-derived key).
- Schema: `user_github_connection`.
- **HTTP**: `POST /api/integrations/github/connect`, `DELETE /api/integrations/github/disconnect`, `GET /api/integrations/github`.
- **Frontend**: card en `/settings/integrations` con botón "Conectar GitHub". Si user signed up con Google, dispara OAuth de GitHub adicional.
- README en repo creado: `README.md` con explicación + link a la app.

**Verification**: usuario nuevo signed up con Google → conecta GitHub → repo `promptstash-<username>` aparece en su GitHub privado con README.
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
**Asunción**: la VPS ya tiene Traefik corriendo como reverse proxy global. promptstash solo aporta su `docker-compose.prod.yml` con labels Traefik para auto-discovery.
**Deliverables**:
- `Dockerfile` de producción (multi-stage, mínimo).
- `docker-compose.prod.yml` con app + postgres + redis. La app expone su puerto interno (no `ports:` mappeado al host) y declara labels Traefik (`traefik.enable=true`, `traefik.http.routers.promptstash.rule=Host(...)`, `...tls.certresolver=...`). Conectado a la network externa de Traefik.
- Script `scripts/deploy.sh`: SSH al VPS, `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`.
- `.env.production.example` documentado.
- Sección "Deploy" en `README.md`: prerequisitos (Traefik ya corriendo, network compartida, dominio apuntando), pasos de primer deploy, rotación de secrets.

**Verification**: dominio público resuelve, HTTPS válido (cert emitido por Traefik), signup + crear prompt + consumir API funciona en prod.
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

## Resumen de cadena de dependencias
```
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16
```
Lineal por diseño: cada fase extiende capacidades sobre la anterior. Paralelizable solo si hay 2 devs (ej. P13 export + P11 commit pueden hacerse en paralelo después de P10, pero la cadena oficial es lineal).
