# P3 — Auth.js + GitHub provider · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` (ambos `healthy`).
- `.env` creado desde `.env.example` y con valores reales para:
  - `AUTH_SECRET` (generar con `openssl rand -base64 32`)
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (de la GitHub OAuth
    App registrada con callback `http://localhost:3010/auth/callback/github`)
- `bun run db:migrate` aplicado tras P3 (deja las 4 tablas).

## Functional checks

### 1. Migration crea las 4 tablas Auth.js
```bash
bun run db:psql -- -c "\dt public.*" | grep -E "(users|accounts|sessions|verificationTokens)" | wc -l
# Expected: 4
```

### 2. Migration registrada en el journal
`src/infrastructure/persistence/migrations/meta/_journal.json` tiene
exactamente una entry (la generada en P3) y
`drizzle.__drizzle_migrations` tiene una fila:
```bash
bun run db:psql -- -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"
# Expected: 1
```

### 3. `/health` sigue respondiendo
```bash
bun dev &
SP=$!; sleep 3
curl -s http://localhost:3010/health
# Expected: {"ok":true}
kill $SP; wait $SP 2>/dev/null
```

### 4. `/auth/signin/github` redirige al consent de GitHub
```bash
bun dev &
SP=$!; sleep 3
curl -s -i http://localhost:3010/auth/signin/github | head -10
# Expected: HTTP/1.1 302 (o 307) Found
# Location: https://github.com/login/oauth/authorize?client_id=...&scope=read%3Auser+user%3Aemail&redirect_uri=...callback%2Fgithub
kill $SP; wait $SP 2>/dev/null
```

Puntos a verificar en la URL:
- `client_id=` matchea `GITHUB_CLIENT_ID` de `.env`.
- `scope=read:user user:email` (URL-encoded). **No** debe incluir `repo`.
- `redirect_uri` apunta a `http://localhost:3010/auth/callback/github`.

### 5. Login flow end-to-end (manual)
- `bun dev` corriendo.
- Browser: `http://localhost:3010/` → redirect automático a `/login`.
- `/login` renderiza el botón "Continuar con GitHub".
- Click → GitHub consent screen pidiendo "read your profile and
  email".
- Authorize → redirect a `http://localhost:3010/` y la SPA muestra
  el contenido protegido (scaffold actual).
- DevTools muestra cookie `authjs.session-token` HttpOnly + Secure
  (Secure puede no aparecer en localhost; ok).

### 6. Tablas pobladas tras login
```bash
bun run db:psql -- -c "SELECT count(*) FROM users;"
# Expected: 1 (tu user de GitHub).
bun run db:psql -- -c "SELECT \"userId\", provider, \"providerAccountId\" FROM accounts;"
# Expected: una fila con provider='github'.
bun run db:psql -- -c "SELECT count(*) FROM sessions WHERE expires > NOW();"
# Expected: >= 1 (sesión activa).
```

### 7. `/auth/session` devuelve el user
Con cookie de sesión (copiada del browser):
```bash
curl -s -b "authjs.session-token=<token>" http://localhost:3010/auth/session
# Expected: JSON con shape { user: { id, name, email, image }, expires }
```
Sin cookie:
```bash
curl -s http://localhost:3010/auth/session
# Expected: null o {} (sin error 500).
```

### 8. SPA refresh sobre rutas client-side funciona
- Browser, sesión activa, ir a `/login` (refresh manual).
- Bun.serve sirve el HTML; React Router renderiza LoginPage (o
  redirige a `/` si ya hay sesión, según el código).
- No hay 404.

### 9. Logout limpia la sesión
- Browser: trigger `/auth/signout` (botón si existe; si no,
  manual GET con CSRF token via `/auth/csrf`).
- Tras signout: cookie eliminada, `/` redirige a `/login`,
  fila correspondiente desaparece de `sessions`.

## Structural checks

### 10. Archivos creados presentes
- `src/infrastructure/persistence/schema/auth.ts`
- `src/infrastructure/auth/auth-config.ts`
- `src/infrastructure/auth/handler.ts`
- `src/frontend/pages/LoginPage.tsx`
- `src/frontend/RequireAuth.tsx`
- `src/frontend/lib/fetcher.ts` (o inline donde corresponda)
- `src/infrastructure/persistence/migrations/0000_<...>.sql`

### 11. Schema barrel actualizado
`src/infrastructure/persistence/schema/index.ts` re-exporta `./auth`.

### 12. `.gitkeep` redundante eliminado
`src/infrastructure/auth/.gitkeep` ya no existe.

### 13. Server routing correcto
`src/interfaces/http/server.ts` tiene en `Bun.serve.routes`:
- `/health`
- `/auth/*`
- `/*` → HTML import

Y Elysia tiene `.all("/auth/*", ...)`.

### 14. `package.json` deps
`dependencies` incluye:
- `@auth/core`
- `@auth/drizzle-adapter`

Sin `pg`, `postgres.js`, `next-auth`.

### 15. OAuth scope mínimo en el config
Grep dentro del repo:
```bash
grep -nE 'scope:.*"' src/infrastructure/auth/auth-config.ts
# Expected: una sola entrada con "read:user user:email" — sin "repo".
```

## Non-regression checks

### 16. P0/P1/P2 siguen funcionando
```bash
bun test                  # 1 pass
bunx tsc --noEmit         # clean
bun run build             # genera dist/
```

### 17. Compose full sigue levantando los 3 servicios
```bash
docker compose --profile full up -d --build
sleep 15
docker compose ps --format "table {{.Service}}\t{{.Status}}"
# Expected: app, postgres, redis — todos "healthy".
```
La app del container también arranca (no rompe por env vars
faltantes en compose; recordar pasar GitHub creds en `.env` o el
flow OAuth fallará dentro del container, pero el server levanta).

### 18. Git limpio
```bash
git status
# Expected: "nothing to commit, working tree clean".
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (especial
atención al config de Auth.js y al schema). CI todavía no aplica
(P14); la verificación es local y manual para el flow OAuth.
