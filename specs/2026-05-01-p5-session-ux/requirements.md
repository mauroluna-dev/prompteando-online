# P5 — Session UX (current user, logout, layout) · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P5. P3 y P4 dejaron el flujo de login
funcionando; pero la app autenticada no tiene UI consciente de la
sesión: no se ve quién está logueado, no hay forma de salir, y refresh
sobre `/login` con sesión activa muestra otra vez el screen de login.

P5 cierra esa experiencia base: endpoint propio del dominio
(`/api/me`) que cualquier feature posterior consume, hook tipado
en el frontend (`useCurrentUser`), header con avatar + dropdown +
sign-out, y redirect coherente entre `/login` y `/`.

Este es el primer feature que **usa** la arquitectura hexagonal
(domain → application port → infrastructure adapter →
interface http). Los siguientes (P6 prompts CRUD) reusan el patrón.

## In scope
- **Domain**: tipo `CurrentUserDTO` en `src/domain/user/`.
- **Application**: port `SessionResolver` y `GetCurrentUserQuery`
  (clase) que lo consume.
- **Infrastructure**: `AuthJsSessionResolver` (adapter del port)
  que delega a `Auth(request, config)` con action `session`.
- **HTTP**: route `GET /api/me` que llama a la query, devuelve
  401 si no hay sesión y 200 + DTO si la hay.
- **Frontend**:
  - shadcn `DropdownMenu` y `Avatar` agregados via shadcn CLI.
  - Hook `useCurrentUser()` (SWR sobre `/api/me`) con tipos.
  - Helper `signOut()` (POST + CSRF a `/auth/signout`, paralelo
    al `signInWith` de P3/P4).
  - `RequireAuth` refactoreado para usar `useCurrentUser` en lugar
    de `useSWR("/auth/session")` directo.
  - `LoginPage` con `useEffect` que redirige a `/` si hay sesión.
  - Header en `App.tsx` con avatar + dropdown que muestra email +
    "Sign out".

## Out of scope
- UI para gestionar accounts linkeados (ver / desvincular providers).
  Es un Settings page futuro; no entra en V1.
- Avatar fallback custom (iniciales generadas) — usamos el `<AvatarFallback>` default de shadcn.
- Refresh tokens de sesión / sliding expiration custom — Auth.js
  maneja con su default.
- Tests automatizados del flow (Playwright en P16).
- Cambios en el schema de BD — P3 dejó `users` y `sessions` listos.

## Decisiones acordadas (este turno)

### 1. `/api/me` con `GetCurrentUserQuery` hexagonal
**Decisión**: GET `/api/me` consume `GetCurrentUserQuery` (clase
en `application/queries/get-current-user.ts`) que depende de un
port `SessionResolver`. El adapter en infrastructure usa Auth.js
para resolver la sesión.

**Razón**:
- Hexagonal coherente: dominio define DTO, application orquesta,
  infrastructure ejecuta.
- Punto de extensión: cuando lleguen prompts/keys, agregamos campos
  al DTO sin tocar Auth.js ni la frontera HTTP de Auth.js.
- Frontend depende de NUESTRO endpoint, no de la shape de
  `/auth/session` (que es de Auth.js y puede cambiar entre versiones).

**Shape V1**:
```ts
type CurrentUserDTO = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};
```

### 2. shadcn DropdownMenu + Avatar
**Decisión**: instalar via `bunx shadcn@latest add dropdown-menu avatar`
(trae `@radix-ui/react-dropdown-menu` y `@radix-ui/react-avatar` como
deps). UI top-right con avatar; click → dropdown muestra email +
botón "Sign out".

**Razón**: estándar de la industria (Linear, Notion, Vercel), accesible
por default (keyboard nav, screen readers via Radix), no requiere
re-pensar el layout en P16.

### 3. Redirect de logueado en `/login` → `/` via useEffect
**Decisión**: `LoginPage` lee `useCurrentUser()`. Si hay user, dispara
`navigate("/", { replace: true })` desde un `useEffect`.

**Razón**: localiza la lógica donde corresponde semánticamente
(la pantalla que detecta su propio caso). Sin abstracción extra
(`<RequireGuest>`) porque hoy hay una sola ruta guest. Si en el
futuro hay más, refactorizamos a un component helper.

## Decisiones técnicas derivadas

### Helper `getSession(request)` en infrastructure
Auth.js core ya sabe resolver sesiones desde una Request. Lo que hacemos
es reusar `Auth(request, config)` apuntando a la action `session`:

```ts
// src/infrastructure/auth/get-session.ts
import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";

export async function getSession(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/auth/session";
  const sessionReq = new Request(url, { headers: request.headers });
  const res = await Auth(sessionReq, authConfig);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.user ? (json as { user: { id: string; name: string|null; email: string; image: string|null } }) : null;
}
```

Reutiliza el AUTH_URL rewrite del handler P3 indirectamente vía la
config (no necesitamos volverlo a aplicar — el helper trabaja en
el server con cookies en headers, no genera URLs públicas).

### Port + adapter
```ts
// application/ports/session-resolver.ts
export type SessionResolver = (request: Request) => Promise<{
  user: CurrentUserDTO;
} | null>;

// infrastructure/auth/auth-js-session-resolver.ts
import { getSession } from "./get-session";
export const authJsSessionResolver: SessionResolver = (req) =>
  getSession(req);
```

### Query (clase con `execute`)
```ts
// application/queries/get-current-user.ts
import type { CurrentUserDTO } from "@/domain/user";
import type { SessionResolver } from "@/application/ports/session-resolver";

export class GetCurrentUserQuery {
  constructor(private readonly resolveSession: SessionResolver) {}

  async execute(request: Request): Promise<CurrentUserDTO | null> {
    const session = await this.resolveSession(request);
    return session?.user ?? null;
  }
}
```

### Composition root
```ts
// src/interfaces/http/server.ts (excerpt)
import { GetCurrentUserQuery } from "@/application/queries/get-current-user";
import { authJsSessionResolver } from "@/infrastructure/auth/auth-js-session-resolver";

const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);

const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .all("/auth/*", ({ request }) => handleAuth(request))
  .get("/api/me", async ({ request }) => {
    const user = await getCurrentUser.execute(request);
    if (!user) return new Response(null, { status: 401 });
    return user;
  });
```

### Frontend hook
```ts
// src/frontend/hooks/use-current-user.ts
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { CurrentUserDTO } from "@/domain/user";

export function useCurrentUser() {
  return useSWR<CurrentUserDTO | null>("/api/me", fetcher);
}
```

`fetcher` ya devuelve null si la response es no-OK (P3), así que un
401 se traduce en `data: null`.

### signOut helper
```ts
// src/frontend/lib/auth-actions.ts
export async function signOut() {
  const { csrfToken } = await fetch("/auth/csrf").then(r => r.json());
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/auth/signout";
  // hidden input csrfToken + callbackUrl="/login"
  form.submit();
}
```

Mismo patrón que el `signInWith` de P3/P4. Ambos pueden coexistir
en `lib/auth-actions.ts`.

### Frontend layout
- `App.tsx` ahora tiene un header full-width:
  - Izquierda: logo "prompteando" (texto, no SVG por ahora).
  - Derecha: `<DropdownMenu>` con trigger `<Avatar>` (image del user
    si existe, fallback a iniciales).
- El contenido del scaffold queda debajo dentro de un `<main>`.
- `RequireAuth` refactoreado: en lugar de `useSWR("/auth/session")`,
  usa `useCurrentUser()`. Mismo comportamiento (loading null,
  redirect si no user), pero pegado al endpoint propio.

## Critical files

### Nuevos
- `src/domain/user/types.ts` — `CurrentUserDTO`.
- `src/domain/user/index.ts` — barrel.
- `src/application/ports/session-resolver.ts`.
- `src/application/queries/get-current-user.ts`.
- `src/infrastructure/auth/get-session.ts`.
- `src/infrastructure/auth/auth-js-session-resolver.ts`.
- `src/frontend/hooks/use-current-user.ts`.
- `src/frontend/lib/auth-actions.ts`.
- `src/frontend/components/UserMenu.tsx` (DropdownMenu + Avatar).
- `src/frontend/components/Header.tsx`.
- `src/frontend/components/ui/dropdown-menu.tsx` (de shadcn CLI).
- `src/frontend/components/ui/avatar.tsx` (de shadcn CLI).

### Modificados
- `src/interfaces/http/server.ts` — agregar `/api/me`.
- `src/frontend/RequireAuth.tsx` — usar `useCurrentUser`.
- `src/frontend/pages/LoginPage.tsx` — useEffect redirect, mover
  `signInWith` a `lib/auth-actions.ts`.
- `src/frontend/App.tsx` — header con UserMenu.
- `package.json` — agregar deps de Radix que trae shadcn.

### Eliminados
- `src/application/{commands,queries,ports}/.gitkeep` — ya no hacen
  falta porque agregamos archivos reales.

## References
- `specs/mission.md` → persona 1 (no-coder), avatar/email visible
  refuerza confianza.
- `specs/tech-stack.md` → CQS (queries no mutan), shadcn/Radix UI.
- `specs/roadmap.md` → P5 (verificación canónica), P6 (consume el
  patrón hexagonal recién estrenado).
- `feedback_authjs_core.md` → POST+CSRF para signout (mismo patrón
  que signin), AUTH_URL rewrite ya cubre /api/me indirectamente.
