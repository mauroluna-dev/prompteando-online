# P3 — Auth.js + GitHub provider · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P3. P2 dejó la BD lista. P3 trae las
primeras tablas reales (las del Auth.js Drizzle adapter), conecta el
flujo de login con GitHub OAuth y deja la app autenticable
end-to-end. Es la primera fase con feature visible para el usuario.

Después de P3 cualquier fase puede asumir `getCurrentUser(request)` y
construir features autenticadas. P4 sumará Google como segundo
provider sin tocar nada de la wiring base.

## In scope
- `@auth/core` (framework-agnostic) + `@auth/drizzle-adapter`
  instalados.
- Schema `src/infrastructure/persistence/schema/auth.ts` con las 4
  tablas que pide el adapter (users, accounts, sessions,
  verificationTokens). Barrel actualizado.
- Migration generada y aplicada (deja las 4 tablas en Postgres).
- `src/infrastructure/auth/auth-config.ts` con el provider GitHub
  configurado (scopes mínimos), Drizzle adapter, session strategy
  database.
- `src/infrastructure/auth/handler.ts` con el bridge
  Request → `Auth(request, config)` → Response.
- Routes Elysia que delegan al handler: `/auth/signin`,
  `/auth/signin/github`, `/auth/callback/github`, `/auth/signout`,
  `/auth/session`, y los demás endpoints internos de Auth.js bajo
  `/auth/*`.
- `src/interfaces/http/server.ts` actualizado: `Bun.serve` enruta
  `/health` y `/auth/*` a Elysia, sirve el HTML de la SPA para
  cualquier otra ruta (necesario para que React Router funcione
  con refresh).
- Frontend: `react-router` cableado con `/login` (público) y `/`
  (protegido por `RequireAuth`). La pantalla actual del scaffold
  pasa a renderizarse bajo el guard.
- `LoginPage.tsx` con botón "Continuar con GitHub" que dispara
  `window.location = "/auth/signin/github"`.
- `RequireAuth.tsx` que hace `useSWR("/auth/session")` y redirige
  a `/login` si no hay user.
- Sección "Auth setup" en `README.md`: cómo registrar la GitHub OAuth
  app (callback URL `http://localhost:3010/auth/callback/github`),
  qué llenar en `.env`, cómo generar `AUTH_SECRET`.

## Out of scope
- Provider Google (P4).
- UI de logout / dropdown con avatar / `/me` endpoint (P5).
- Email/password, magic link, ningún otro provider.
- Tokens de GitHub con scope `repo` (entran en P10 como flow
  separado de "Conectar GitHub para versionar").
- Encriptación at-rest del access_token (entra en P10 cuando ese
  token tenga uso real; en P3 vive en `accounts.access_token` plain
  por ahora — Auth.js Drizzle adapter no lo encripta por default).
- Cualquier feature de dominio (prompts, versions, api keys).
- Routes con guard fino (RBAC); por ahora solo "logged in vs not".

## Decisiones acordadas (este turno)

### 1. OAuth scopes: mínimos al login
**Decisión**: el provider GitHub en P3 pide solo
`read:user user:email`. Suficiente para crear el user en BD y
mostrar nombre/email/avatar. Si en el futuro el user clickea
"Conectar GitHub para versionar" (P10), disparamos un OAuth flow
adicional con scope `repo` — Auth.js tiene `linkAccount` /
re-authorize para esto.

**Razón**: persona 1 (no-coder orquestador, driver del MVP) se
podría loguear con GitHub solo por preferencia y nunca usar
versionado en repo. Pedirle `repo` upfront es un escare-factor
("¿por qué esta app necesita crear repos en mi cuenta?"). El flow
incremental es estándar y respeta menos privilegios.

### 2. Schema layout: single `auth.ts`
**Decisión**: las 4 tablas conviven en
`src/infrastructure/persistence/schema/auth.ts`.

**Razón**: `users + accounts + sessions + verificationTokens` son un
único aggregate (identidad). Vienen del mismo paquete
(`@auth/drizzle-adapter`), tienen FKs cruzadas y mutan al unísono
cuando Auth.js bumpea su esquema. Splitearlas en 4 archivos crearía
imports cruzados sin beneficio. Aggregates futuros (prompts,
versions, api-keys, github-connection) sí van en archivos propios.

### 3. Frontend: React Router ahora
**Decisión**: setup React Router en `frontend.tsx`. Dos rutas:
`/login` (pública) y `/*` (protegida por `RequireAuth`).

**Razón**: P5+ va a sumar `/settings`, `/prompts/:slug`, etc. Hacer
el setup ahora ahorra reescribir App.tsx después. React Router ya
está en deps desde P0; el setup es ~20 LOC. Y la pantalla de login
queda como una ruta real, no un toggle condicional.

## Decisiones técnicas derivadas

### Server routing en `Bun.serve`
```ts
Bun.serve({
  port: 3010,
  routes: {
    "/health":  (req) => app.handle(req),
    "/auth/*":  (req) => app.handle(req),
    "/*":       index,            // SPA fallback (BrowserRouter friendly)
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});
```
- `/health` y `/auth/*` van a Elysia (rutas más específicas ganan
  sobre `/*`).
- `/*` sirve el HTML del frontend para que React Router maneje
  rutas client-side (incluyendo refresh sobre `/login`).

### Auth.js config (esquemático)
```ts
// src/infrastructure/auth/auth-config.ts
import GitHub from "@auth/core/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/infrastructure/persistence/db";
import * as schema from "@/infrastructure/persistence/schema";

export const authConfig = {
  basePath: "/auth",
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user user:email" } },
    }),
  ],
  session: { strategy: "database" as const },
};
```

### Bridge handler
```ts
// src/infrastructure/auth/handler.ts
import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";

export const handleAuth = (request: Request) => Auth(request, authConfig);
```

### Elysia wiring
```ts
// src/interfaces/http/server.ts (excerpt)
const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .all("/auth/*", ({ request }) => handleAuth(request));
```

### Frontend (esquemático)
```tsx
// src/frontend/frontend.tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/*" element={<RequireAuth><App /></RequireAuth>} />
  </Routes>
</BrowserRouter>

// RequireAuth: useSWR("/auth/session"); si null → redirect a /login.
// LoginPage: button → window.location.href = "/auth/signin/github".
```

### Env vars consumidas
- `AUTH_SECRET` (auto-detectado por `@auth/core`).
- `AUTH_URL` (opcional; si no está, Auth.js infiere del Host
  header con `trustHost: true`).
- `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET`.

Las 4 ya viven en `.env.example` desde P1. README documenta cómo
generar `AUTH_SECRET` (`openssl rand -base64 32`) y cómo registrar
la GitHub OAuth app.

### Token at-rest
Auth.js Drizzle adapter guarda `access_token` en `accounts`
**plaintext**. Para P3 está OK porque el scope es solo
`read:user user:email` (riesgo bajo). P10 introducirá
`ENCRYPTION_KEY` y un wrapper para el caso `repo`.

## Critical files
- `package.json` — agregar `@auth/core` y `@auth/drizzle-adapter`.
- `src/infrastructure/persistence/schema/auth.ts` — **crear**.
- `src/infrastructure/persistence/schema/index.ts` — actualizar
  (`export * from "./auth"`).
- `src/infrastructure/persistence/migrations/0000_*.sql` —
  **generada** por `bun run db:generate`.
- `src/infrastructure/auth/auth-config.ts` — **crear**.
- `src/infrastructure/auth/handler.ts` — **crear**.
- `src/infrastructure/auth/.gitkeep` — eliminar (auth-config y
  handler ya mantienen la carpeta trackeada).
- `src/interfaces/http/server.ts` — actualizar routing.
- `src/frontend/pages/LoginPage.tsx` — **crear**.
- `src/frontend/RequireAuth.tsx` — **crear**.
- `src/frontend/frontend.tsx` — agregar BrowserRouter + Routes.
- `src/frontend/App.tsx` — sin cambios estructurales (sigue siendo
  el contenido del root); Eventualmente cambia en P5.
- `README.md` — agregar sección "Auth setup".

## References
- `specs/mission.md` — GitHub opcional pero flagship; auth OAuth-only.
- `specs/tech-stack.md` → secciones "Auth" y "Architecture".
- `specs/roadmap.md` → P3 (definición canónica), P4 (Google), P5
  (UX session), P10 (upgrade scope a `repo`).
- `CLAUDE.md` — Bun-native (Auth.js framework-agnostic encaja).
- Memoria: `project_constitution.md`,
  `feedback_drizzle_studio.md` (no afecta P3, pero relevante si
  necesitamos inspeccionar las tablas auth).
- Auth.js v5 docs: framework-agnostic core, Drizzle adapter,
  basePath custom.
