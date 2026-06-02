# P5 — Session UX · Plan

Numbered task groups. Cada grupo es una unidad coherente.

## 1. Add shadcn DropdownMenu + Avatar
1.1. `bunx shadcn@latest add dropdown-menu avatar`

1.2. Verificar que aparecen:
- `src/frontend/components/ui/dropdown-menu.tsx`
- `src/frontend/components/ui/avatar.tsx`

1.3. Bun debería instalar `@radix-ui/react-dropdown-menu` y
`@radix-ui/react-avatar` automáticamente (shadcn lo dispara).

1.4. `bunx tsc --noEmit` clean.

## 2. Domain: CurrentUserDTO
2.1. Crear `src/domain/user/types.ts`:
```ts
export type CurrentUserDTO = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};
```

2.2. Crear `src/domain/user/index.ts` barrel re-exportando types.

## 3. Application: port + query
3.1. Crear `src/application/ports/session-resolver.ts`:
```ts
import type { CurrentUserDTO } from "@/domain/user";

export type SessionResolver = (
  request: Request,
) => Promise<{ user: CurrentUserDTO } | null>;
```

3.2. Crear `src/application/queries/get-current-user.ts` —
clase con method `execute` (convención CQS de tech-stack.md):
```ts
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

3.3. Eliminar
`src/application/{commands,queries,ports}/.gitkeep`
(ya hay archivos reales).

## 4. Infrastructure: AuthJsSessionResolver
4.1. Crear `src/infrastructure/auth/get-session.ts` que arma una
Request a `/auth/session` y llama `Auth(request, authConfig)`.
Parsea la response JSON; devuelve null si 401 o sin user.

4.2. Crear `src/infrastructure/auth/auth-js-session-resolver.ts`:
```ts
import type { SessionResolver } from "@/application/ports/session-resolver";
import { getSession } from "./get-session";

export const authJsSessionResolver: SessionResolver = (req) =>
  getSession(req);
```

4.3. `bunx tsc --noEmit` clean.

## 5. HTTP route /api/me + composition root
5.1. En `src/interfaces/http/server.ts`:
- Importar `GetCurrentUserQuery` y `authJsSessionResolver`.
- Instanciar `const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);`
- Agregar a Elysia:
  ```ts
  .get("/api/me", async ({ request }) => {
    const user = await getCurrentUser.execute(request);
    if (!user) return new Response(null, { status: 401 });
    return user;
  });
  ```
- Agregar `/api/me` a `Bun.serve.routes`:
  `"/api/me": (req) => app.handle(req)`.

5.2. Smoke test:
- Sin cookie: `curl -i /api/me` → 401.
- Con cookie de sesión válida: 200 + JSON con shape DTO.

## 6. Frontend: hook + auth actions
6.1. Crear `src/frontend/hooks/use-current-user.ts`:
```ts
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { CurrentUserDTO } from "@/domain/user";

export function useCurrentUser() {
  return useSWR<CurrentUserDTO | null>("/api/me", fetcher);
}
```

6.2. Crear `src/frontend/lib/auth-actions.ts`:
- Mover el `signInWith` de `LoginPage.tsx` a este archivo
  (export named).
- Agregar `signOut()`:
  ```ts
  export async function signOut(callbackUrl = "/login") {
    const { csrfToken } = await fetch("/auth/csrf").then(r => r.json());
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/signout";
    // hidden inputs csrfToken + callbackUrl
    document.body.appendChild(form);
    form.submit();
  }
  ```

6.3. `LoginPage.tsx` ahora importa `signInWith` de
`@/lib/auth-actions` en vez de tenerlo inline.

## 7. RequireAuth refactor
7.1. En `src/frontend/RequireAuth.tsx`:
- Reemplazar `useSWR("/auth/session", fetcher)` por
  `useCurrentUser()`.
- El check pasa de `!data?.user` a `!data` (porque ahora el
  endpoint devuelve el user directamente, sin el wrap `{ user, expires }`).

## 8. LoginPage redirect cuando logueado
8.1. En `LoginPage.tsx`:
- `import { useEffect } from "react"; import { useNavigate } from "react-router";`
- `const { data: me } = useCurrentUser();`
- `const navigate = useNavigate();`
- `useEffect(() => { if (me) navigate("/", { replace: true }); }, [me, navigate]);`

## 9. Header layout con UserMenu
9.1. Crear `src/frontend/components/UserMenu.tsx`:
- Trigger: `<Avatar>` con `<AvatarImage src={user.image ?? undefined} />` y
  `<AvatarFallback>` con iniciales (primer letra de name o email).
- DropdownMenu content:
  - `<DropdownMenuLabel>{user.email}</DropdownMenuLabel>`
  - `<DropdownMenuSeparator />`
  - `<DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>`

9.2. Crear `src/frontend/components/Header.tsx`:
- Top-level `<header>` con flex justify-between, padding.
- Izquierda: texto "prompteando" (logo).
- Derecha: `<UserMenu />` (recibe user via props o lee `useCurrentUser`
  internamente — preferir que lo lea internamente para no pasar props
  redundantes).

9.3. Actualizar `src/frontend/App.tsx`:
- Agregar `<Header />` al top.
- El contenido actual del scaffold queda debajo en un `<main>`.

9.4. Validar visualmente:
- `bun dev` + browser.
- Avatar aparece arriba a la derecha.
- Click → dropdown muestra email + Sign out.
- Click "Sign out" → redirect a `/login`, cookie limpia.

## 10. Validación end-to-end
10.1. Pre-condiciones:
- `docker compose up -d postgres redis`.
- `.env` con creds.
- `bun dev` corriendo.

10.2. Server-side:
```bash
# Sin sesión
curl -s -i http://localhost:3010/api/me | head -3
# Expected: HTTP/1.1 401

# Con cookie de sesión activa
curl -s -b "<session-cookie>" http://localhost:3010/api/me
# Expected: 200 + { id, name, email, image }
```

10.3. Browser:
- Sesión activa → `/` muestra Header con avatar + scaffold.
- Refresh sobre `/` → mantiene sesión, no parpadea a `/login`.
- Visitar `/login` con sesión activa → redirect inmediato a `/`.
- Click avatar → dropdown abre, muestra email correcto.
- Click "Sign out" → cookie limpia, redirect a `/login`,
  refresh sobre `/` ahora redirige a `/login`.

## 11. Cierre
11.1. Non-regression:
- `bun test` pasa.
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow GitHub + Google funcionan (regresión de P3/P4).

11.2. `git status` limpio.

11.3. Commitear specs.

11.4. Abrir PR `feat/p5-session-ux` → `master` con link a
`specs/2026-05-01-p5-session-ux/validation.md`.
