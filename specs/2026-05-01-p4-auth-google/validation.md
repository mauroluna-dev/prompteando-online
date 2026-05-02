# P4 — Auth.js + Google provider · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` (ambos healthy).
- `.env` con todas las creds: AUTH_SECRET, AUTH_URL,
  GITHUB_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET.
- Para tunnel: ambos OAuth clients deben tener configurada la
  callback URL pública.
- `bun dev` corriendo (o tunnel activo).

## Functional checks

### 1. `/health` sigue respondiendo
```bash
curl -s http://localhost:3010/health
# Expected: {"ok":true}
```

### 2. CSRF endpoint funciona para Google
```bash
curl -s http://localhost:3010/auth/csrf
# Expected: {"csrfToken":"<64-char hex>"}
```

### 3. `POST /auth/signin/google` redirige a Google OAuth
```bash
TOKEN=$(curl -s -c /tmp/c.txt http://localhost:3010/auth/csrf | \
  grep -oE '"csrfToken":"[^"]+"' | cut -d'"' -f4)

curl -s -i -b /tmp/c.txt -X POST \
  http://localhost:3010/auth/signin/google \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$TOKEN" \
  --data-urlencode "callbackUrl=/" \
  -o /tmp/h.txt > /dev/null

grep -i location /tmp/h.txt
# Expected: Location: https://accounts.google.com/o/oauth2/v2/auth?...
```
Verificar en la URL:
- `client_id=` matchea `GOOGLE_CLIENT_ID` de `.env`.
- `scope=openid+email+profile` (defaults de Auth.js).
- `redirect_uri=...auth/callback/google` (con tu host correcto).

### 4. Login con GitHub sigue funcionando (regression)
- Si tenés sesión previa, `/auth/signout` (POST con CSRF).
- Browser: `/login` → click "Continuar con GitHub" → autorizar →
  vuelve a `/`.

### 5. Login con Google con email **igual** al de GitHub: no duplica `users`
```bash
# Antes: hacer logout y limpiar sesión.
bun run db:psql -- -c "SELECT count(*) FROM users;"
# Snapshot del count.

# Login con Google (browser, mismo email que el user GitHub existente).
# Vuelve a /. UI muestra el contenido protegido.

bun run db:psql -- -c "SELECT count(*) FROM users;"
# Expected: el mismo número que el snapshot. NO se duplicó.

bun run db:psql -- -c "SELECT provider FROM accounts ORDER BY provider;"
# Expected: dos filas:
#  github
#  google
# Ambas con userId apuntando al mismo user row.
```

### 6. Loading state visible al click
- En el browser, abrir DevTools → Network throttling: Slow 3G.
- `/login` → click "Continuar con GitHub":
  - Ambos botones quedan disabled.
  - El botón GitHub muestra spinner (Loader2 animate-spin) en
    lugar del icono.
  - Tras ~1-2s, redirect a github.com.
- Repetir con Google.

### 7. Sesión Google funciona como la de GitHub
Tras login con Google:
```bash
curl -s -b "<copy session cookie from browser>" \
  http://localhost:3010/auth/session
# Expected: { user: { id, name, email, image }, expires }
# El image es el avatar de Google.
```

## Structural checks

### 8. auth-config.ts modificado correctamente
```bash
grep -nE "(GoogleProvider|allowDangerousEmailAccountLinking|Google\(|GitHub\()" \
  src/infrastructure/auth/auth-config.ts
```
Expected:
- import Google de `@auth/core/providers/google`.
- Both `GitHub({...})` and `Google({...})` con
  `allowDangerousEmailAccountLinking: true`.
- Guards para `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el
  bloque que valida env vars.

### 9. LoginPage refactor presente
`src/frontend/pages/LoginPage.tsx` contiene:
- Helper `signInWith(provider: "github" | "google")`.
- `useState` para tracking del pending provider.
- Dos `<Button>` con `disabled={pending !== null}`.
- Spinner condicional (`Loader2`) en el botón clickeado.
- SVG inline o componente para el icono de Google.

### 10. README actualizado
`README.md` sección "Auth setup" tiene:
- Sub-bloque GitHub (heredado de P3).
- Sub-bloque Google: pasos para Google Cloud Console, callback URL
  para local-only y para tunnel, env vars correspondientes.

### 11. .env.example sin cambios
`.env.example` ya declaraba `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET` desde P1. No requiere edición.

## Non-regression checks

### 12. P0/P1/P2/P3 siguen funcionando
```bash
bun test                  # 1 pass
bunx tsc --noEmit         # clean
bun run build             # genera dist/
```

### 13. Migration no cambió
P3 fue la última fase con cambios de schema. P4 no agrega tablas.
```bash
ls src/infrastructure/persistence/migrations/*.sql
# Expected: solo 0000_*.sql (P3).
```
Si aparece un nuevo `.sql` es un error — significa que cambiamos
el schema sin querer.

### 14. Git limpio
```bash
git status
# Expected: "nothing to commit, working tree clean".
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (especial
atención al uso de `allowDangerousEmailAccountLinking` y al
ordenamiento visual de los botones). Validación de OAuth flow es
manual; CI completo llega en P14.
