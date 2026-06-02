# P3 — Auth.js + GitHub provider · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una.

## 1. Instalar deps de Auth.js
1.1. `bun add @auth/core @auth/drizzle-adapter`

1.2. Verificar versions compatibles entre sí (los dos paquetes deben
estar en la misma "major" v5+).

1.3. Commitear `package.json` + `bun.lock`.

## 2. Schema: tablas Auth.js en `auth.ts`
2.1. Crear `src/infrastructure/persistence/schema/auth.ts` con las 4
tablas según especificación de `@auth/drizzle-adapter`:
- `users` (id text PK, name, email unique, emailVerified timestamp,
  image text)
- `accounts` (composite PK provider+providerAccountId, userId FK
  users.id cascade, type, provider, providerAccountId, refresh_token,
  access_token, expires_at int, token_type, scope, id_token,
  session_state)
- `sessions` (sessionToken text PK, userId FK users.id cascade,
  expires timestamp)
- `verificationTokens` (composite PK identifier+token, identifier,
  token, expires)

Tipos exactos según docs oficiales del adapter.

2.2. Actualizar
`src/infrastructure/persistence/schema/index.ts`:
reemplazar `export {}` por `export * from "./auth";`.

## 3. Generar y aplicar la primera migration
3.1. `bun run db:generate`
- Drizzle Kit detecta las 4 tablas nuevas.
- Genera `migrations/0000_<sufix>.sql` y actualiza `meta/_journal.json`.

3.2. Inspeccionar el SQL generado: revisar que los `CREATE TABLE` y
las FK con `ON DELETE CASCADE` coincidan con el adapter spec.

3.3. `docker compose up -d postgres` (si no está arriba).

3.4. `bun run db:migrate` aplica la migration.

3.5. `bun run db:psql -- -c "\dt"` muestra las 4 tablas + el schema
`drizzle.__drizzle_migrations` actualizado con la entry nueva.

## 4. Auth config + bridge handler
4.1. Crear `src/infrastructure/auth/auth-config.ts`:
- Importa `db` y `* as schema` de la persistence layer.
- `DrizzleAdapter(db, { usersTable, accountsTable, sessionsTable,
  verificationTokensTable })`.
- Provider GitHub con scopes `read:user user:email`.
- `basePath: "/auth"`, `trustHost: true`,
  `session: { strategy: "database" }`.

4.2. Crear `src/infrastructure/auth/handler.ts`:
```ts
import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";
export const handleAuth = (request: Request) => Auth(request, authConfig);
```

4.3. Eliminar `src/infrastructure/auth/.gitkeep`.

4.4. `bunx tsc --noEmit` clean.

## 5. Wirear `/auth/*` y `/health` en Elysia + Bun.serve
5.1. Actualizar `src/interfaces/http/server.ts`:
- Importar `handleAuth` de `@/infrastructure/auth/handler`.
- Elysia: `.get("/health", ...).all("/auth/*", ({ request }) => handleAuth(request))`.
- Bun.serve: `routes: { "/health": app.handle, "/auth/*": app.handle, "/*": index }`.
- Mantener `fetch: app.fetch` por seguridad.

5.2. Verificar manualmente:
- `bun dev` levanta sin errors.
- `curl /health` → 200.
- `curl -i /auth/signin/github` → 302 a `https://github.com/login/oauth/authorize?...`
  (con `client_id`, `scope=read:user+user:email`, `redirect_uri=...callback/github`).

## 6. Frontend: routing setup
6.1. Crear `src/frontend/pages/LoginPage.tsx`:
- Pantalla centrada con shadcn `<Card>` + `<Button>`.
- Click → `window.location.href = "/auth/signin/github"`.
- Texto: "Continuar con GitHub". Logo si querés (lucide `Github`).

6.2. Crear `src/frontend/RequireAuth.tsx`:
- `useSWR("/auth/session", fetcher)`.
- Mientras carga: renderizar nada (o un skeleton mínimo).
- Si `data?.user` no existe: `<Navigate to="/login" replace />`.
- Si existe: render `children`.

6.3. Crear `src/frontend/lib/fetcher.ts` (o inlinear): fetcher SWR
estándar (`url => fetch(url).then(r => r.ok ? r.json() : null)`).

6.4. Actualizar `src/frontend/frontend.tsx`:
- Importar `BrowserRouter`, `Routes`, `Route` de `react-router`.
- Wrap `<App />` con `<RequireAuth>`.
- Routes: `/login` → LoginPage; `/*` → `RequireAuth → App`.

## 7. README: Auth setup
7.1. Agregar sección "Auth setup" al `README.md`. Dos sub-bloques:

**A. Local-only (sin tunnel)**:
- Registrar GitHub OAuth App
  (`https://github.com/settings/applications/new`):
  - Application name: `prompteando (local)`
  - Homepage URL: `http://localhost:3010`
  - Authorization callback URL: `http://localhost:3010/auth/callback/github`
- Copiar Client ID, generar Client Secret.
- En `.env`:
  ```
  AUTH_URL=http://localhost:3010
  AUTH_SECRET=$(openssl rand -base64 32)
  GITHUB_CLIENT_ID=<...>
  GITHUB_CLIENT_SECRET=<...>
  ```
- Reiniciar `bun dev`.

**B. Detrás de un tunnel HTTPS público** (ej. Cloudflare Tunnel,
`cloudflared`, ngrok, tailscale funnel, etc. que mapeen
`https://<sub>.<domain>` → `localhost:3010`):
- Registrar **otra** GitHub OAuth App con la URL pública
  (GitHub no permite múltiples callbacks por app):
  - Homepage URL: `https://<sub>.<domain>`
  - Authorization callback URL: `https://<sub>.<domain>/auth/callback/github`
- En `.env`:
  ```
  AUTH_URL=https://<sub>.<domain>
  AUTH_SECRET=...
  GITHUB_CLIENT_ID=<...>
  GITHUB_CLIENT_SECRET=<...>
  ```
- `trustHost: true` ya está en el config; Auth.js infiere el host
  del request, así que `AUTH_URL` es opcional pero recomendado para
  redirects coherentes.

## 8. Validación end-to-end
8.1. Pre-condiciones:
- `docker compose up -d postgres redis`.
- Migration aplicada.
- `.env` con `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- `bun dev` corriendo.

8.2. Browser smoke:
- `http://localhost:3010/` → redirect a `/login` (sin sesión).
- `/login` muestra el botón "Continuar con GitHub".
- Click → GitHub consent screen con scopes "read your profile and
  email".
- Authorize → redirect a `http://localhost:3010/` con cookie de
  sesión seteada.
- `RequireAuth` ve la sesión y deja pasar a `<App />`.

8.3. Confirmar persistencia:
```bash
bun run db:psql -- -c "SELECT id, email, name FROM users;"
# Expected: una fila con tu email y name de GitHub.
bun run db:psql -- -c "SELECT \"userId\", provider, \"providerAccountId\" FROM accounts;"
# Expected: una fila con provider=github.
bun run db:psql -- -c "SELECT \"userId\", expires FROM sessions;"
# Expected: una fila no expirada.
```

8.4. Confirmar `/auth/session`:
```bash
curl -s http://localhost:3010/auth/session
# Sin cookie: 200 + null o {}
curl -s -b "authjs.session-token=<copy from browser>" \
  http://localhost:3010/auth/session
# Con cookie: { user: { name, email, image, ... }, expires }
```

8.5. Logout:
- Click manual o `POST /auth/signout` con CSRF.
- Sesión eliminada de la tabla, cookie limpia, `/` redirige a `/login`.

## 9. Cierre
9.1. Non-regression:
- `bun test` pasa.
- `bunx tsc --noEmit` clean.
- `bun run build` ok (frontend con BrowserRouter compila).
- Compose hybrid sigue funcionando.

9.2. `git status` limpio.

9.3. Commitear specs de P3.

9.4. Abrir PR `feat/p3-auth-github` → `master` con link a
`specs/2026-05-01-p3-auth-github/validation.md`.
