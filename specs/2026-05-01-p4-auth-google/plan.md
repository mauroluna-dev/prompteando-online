# P4 — Auth.js + Google provider · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una.

## 1. Agregar provider Google + linking flag en auth-config
1.1. En `src/infrastructure/auth/auth-config.ts`:
- `import Google from "@auth/core/providers/google";`
- Agregar guards de env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Agregar `Google({...})` al array `providers`.
- Agregar `allowDangerousEmailAccountLinking: true` al provider GitHub
  y al nuevo provider Google.

1.2. `bunx tsc --noEmit` clean.

1.3. Server reinicia sin error con las env vars seteadas.

## 2. Refactor de LoginPage
2.1. En `src/frontend/pages/LoginPage.tsx`:
- Extraer helper `signInWith(provider: "github" | "google")` que arma
  el form POST con CSRF (lógica actual generalizada).
- Agregar `useState<"github" | "google" | null>` para `pending`.
- Renderizar dos `<Button>` apilados (full-width, gap-2):
  - GitHub primero (icono `Github` de lucide).
  - Google segundo (icono `Mail` de lucide o el SVG oficial — más
    abajo).
- Ambos botones `disabled={pending !== null}`.
- Botón clickeado muestra `Loader2` (lucide) animate-spin en lugar
  del icono del provider.

2.2. Para el icono Google, usar el SVG oficial de marca (Google
recomienda no usar un genérico). Opciones:
- Inline SVG dentro del componente (no requiere asset adicional).
- Componente local `src/frontend/components/icons/GoogleIcon.tsx`
  con el SVG (más reutilizable si luego aparece en otros lugares).

Decisión: SVG inline en `LoginPage.tsx`. Si después se reusa, se
extrae.

2.3. `bunx tsc --noEmit` clean.

2.4. Build OK: `bun run build`.

## 3. Update README — sub-bloque Google
3.1. En la sección "Auth setup" del `README.md`, agregar después del
sub-bloque GitHub uno paralelo para Google:

**A. Local-only**:
- https://console.cloud.google.com/ → New Project (o reusar).
- APIs & Services → OAuth consent screen → External, fill required.
- Credentials → Create Credentials → OAuth client ID → Web application.
  - Authorized JavaScript origins: `http://localhost:3010`
  - Authorized redirect URIs: `http://localhost:3010/auth/callback/google`
- Copiar Client ID + Client Secret.
- En `.env`:
  ```
  GOOGLE_CLIENT_ID=<...>
  GOOGLE_CLIENT_SECRET=<...>
  ```
- Reiniciar `bun dev`.

**B. Detrás de tunnel HTTPS**:
- Mismo OAuth client puede tener múltiples authorized redirect URIs
  (a diferencia de GitHub). Agregar:
  - Authorized JavaScript origins: `https://<sub>.<domain>`
  - Authorized redirect URIs:
    `https://<sub>.<domain>/auth/callback/google`
- En `.env`: `AUTH_URL=https://<sub>.<domain>` (ya seteado para
  GitHub tunnel; el rewrite del handler aplica para todos los
  providers).

3.2. Mencionar que la verificación del email viene en el profile
de Google por default — no requiere claims extras.

## 4. Validación end-to-end (manual + db)
4.1. Pre-condiciones:
- `docker compose up -d postgres redis` (healthy).
- `.env` con todos los GitHub + Google credentials.
- `bun dev` corriendo.

4.2. Flow GitHub (regression):
- Logout actual via `/auth/signout`.
- `/login` → click GitHub → autorizar → vuelve a `/`.
- `bun run db:psql -- -c "SELECT count(*) FROM users;"` → 1.

4.3. Flow Google **mismo email**:
- Logout.
- `/login` → click Google → autorizar (con la cuenta Gmail
  registrada como email primary en GitHub).
- Vuelve a `/`.
- Verificar:
  ```
  bun run db:psql -- -c "SELECT count(*) FROM users;"
  # Expected: 1 (mismo user, NO se duplicó).
  bun run db:psql -- -c "SELECT provider FROM accounts ORDER BY provider;"
  # Expected:
  #  github
  #  google
  ```

4.4. Flow Google **email distinto** (opcional, requiere otra cuenta):
- Logout.
- Login con otra cuenta Google.
- Verificar que se crea un nuevo user row.

4.5. Loading states:
- Click "Continuar con GitHub" → ambos botones disabled, spinner en
  GitHub button. Esperar redirect.
- Mismo con Google.

4.6. Smoke server-side:
```bash
curl -s https://<host>/auth/csrf  # devuelve token
# POST /auth/signin/google con csrfToken → 302 a accounts.google.com
```

## 5. Cierre
5.1. Non-regression:
- `bun test` pasa.
- `bunx tsc --noEmit` clean.
- `bun run build` ok.

5.2. `git status` limpio.

5.3. Commitear specs de P4.

5.4. Abrir PR `feat/p4-auth-google` → `master` con link a
`specs/2026-05-01-p4-auth-google/validation.md`.
