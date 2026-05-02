# P5 — Session UX · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` (healthy).
- `.env` con todas las creds (GitHub, Google, AUTH_*).
- `bun dev` corriendo (host) o tunnel activo.
- Sesión activa para los checks autenticados (login GitHub o Google).

## Functional checks

### 1. `/api/me` sin cookie devuelve 401
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/api/me
# Expected: 401
```

### 2. `/api/me` con cookie devuelve el user
```bash
# Copiar cookie authjs.session-token del browser tras login.
curl -s -b "authjs.session-token=<token>" \
  http://localhost:3010/api/me
# Expected: 200 + JSON shape:
# { "id": "<uuid>", "name": "<...>", "email": "<...>", "image": "<...>" }
```

### 3. `/api/me` shape coincide con CurrentUserDTO
El JSON devuelto contiene exactamente las keys: `id`, `name`,
`email`, `image`. Sin `expires`, sin nesting `user.*`.

### 4. Browser: refresh mantiene la sesión
- Login (GitHub o Google) en el browser.
- Refresh sobre `/` (Cmd-R).
- La página vuelve a renderizar Header + scaffold sin redirect a
  `/login`. Sin parpadeo.

### 5. Browser: `/login` con sesión activa redirige a `/`
- Logueado, navegar manualmente a `/login` (URL bar).
- Redirect inmediato a `/`. No se llega a ver el botón "Continuar
  con GitHub".

### 6. Avatar + dropdown
- Header arriba a la derecha muestra avatar (imagen del provider).
- Click sobre el avatar abre dropdown.
- Dropdown muestra:
  - Email del user (label).
  - Separator.
  - Botón "Sign out".
- Keyboard nav funciona: tab al avatar, enter abre dropdown,
  flechas mueven foco entre items, enter en "Sign out" lo dispara.

### 7. Sign out limpia sesión
- Logueado, click "Sign out" en dropdown.
- Browser redirige a `/login`.
- DevTools → Application → Cookies: `authjs.session-token` ya no
  existe (o expiró).
- Visitar `/` directamente → redirect a `/login`.
- Verificar en BD:
  ```bash
  bun run db:psql -- -c "SELECT count(*) FROM sessions WHERE expires > NOW();"
  # Expected: count menor al previo (la sesión cerrada se borró del DB).
  ```

### 8. Avatar fallback funciona
- Si el user no tiene imagen (raro con OAuth, pero forzable
  borrando `users.image` en DB), el `<AvatarFallback>` debe mostrar
  iniciales (ej. primera letra del email).

## Structural checks

### 9. Hexagonal layout respeta layers
- `src/domain/user/types.ts` no importa nada de `application/`,
  `infrastructure/`, ni `interfaces/`.
- `src/application/queries/get-current-user.ts` solo importa de
  `@/domain/` y `@/application/ports/`.
- `src/infrastructure/auth/auth-js-session-resolver.ts` implementa
  el port y es el único lugar que importa de `@auth/core`.
- `src/interfaces/http/server.ts` (composition root) instancia
  `makeGetCurrentUser(authJsSessionResolver)` y la usa.

```bash
# Sanity grep: domain no toca infra/auth.
grep -rn "from \"@auth\|drizzle\|elysia" src/domain
# Expected: empty (no matches).
```

### 10. shadcn components instalados
- `src/frontend/components/ui/dropdown-menu.tsx` existe.
- `src/frontend/components/ui/avatar.tsx` existe.
- `package.json` incluye `@radix-ui/react-dropdown-menu` y
  `@radix-ui/react-avatar`.

### 11. Auth actions consolidadas
- `src/frontend/lib/auth-actions.ts` exporta `signInWith` y
  `signOut`.
- `LoginPage.tsx` importa `signInWith` de ese módulo (sin
  duplicación inline).

### 12. RequireAuth usa el hook
- `src/frontend/RequireAuth.tsx` importa `useCurrentUser` y NO
  usa `useSWR("/auth/session", fetcher)` directo.

### 13. Hook tipado
- `src/frontend/hooks/use-current-user.ts` exporta `useCurrentUser`
  con generic `CurrentUserDTO | null` en `useSWR`.

### 14. Composition root explícito
- `src/interfaces/http/server.ts` tiene una línea que arma la query:
  `const getCurrentUser = makeGetCurrentUser(authJsSessionResolver);`

### 15. Gitkeep redundantes eliminados
- `src/application/commands/.gitkeep` (no aún), `queries/.gitkeep`
  y `ports/.gitkeep` removidos. Los archivos reales de P5 mantienen
  las carpetas trackeadas (`commands/` queda vacío hasta P6, ahí
  se decide si conservar `.gitkeep` o eliminarlo cuando lleguen los
  archivos reales).

## Non-regression checks

### 16. P0..P4 siguen funcionando
- `bun test` → 1 pass.
- `bunx tsc --noEmit` clean.
- `bun run build` produce `dist/`.
- OAuth flow GitHub: login completa, user existe en `users`.
- OAuth flow Google: login completa, linking funciona si email
  igual.
- Health endpoint sigue respondiendo 200.

### 17. No hay nuevas migrations
P5 no toca BD schema. `ls src/infrastructure/persistence/migrations/*.sql`
debe seguir mostrando solo `0000_*.sql`.

### 18. Git limpio post-trabajo
```bash
git status
# Expected: "nothing to commit, working tree clean".
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (especial
atención al respeto de la dirección de dependencias entre layers
hexagonales). CI todavía no aplica (P14).
