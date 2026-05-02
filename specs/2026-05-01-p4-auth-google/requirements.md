# P4 — Auth.js + Google provider · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P4. P3 dejó el flujo de auth con GitHub
funcionando. Persona 1 (no-coder orquestador) puede no tener / no
querer usar GitHub para loguearse — Google es el fallback natural y
prácticamente universal. Sumar Google como segundo provider es la
diferencia entre "GitHub-only auth" y "OAuth real para no-coders".

P4 también introduce el primer caso de "el mismo email se usa con
distintos providers" — el roadmap exige que **no** cree un segundo
user row.

## In scope
- Provider Google añadido a `src/infrastructure/auth/auth-config.ts`
  con sus scopes default (`openid email profile`).
- `allowDangerousEmailAccountLinking: true` en ambos providers
  (GitHub y Google) para que un email igual unifique users y solo
  agregue un row a `accounts`.
- Refactor de `src/frontend/pages/LoginPage.tsx`:
  - Helper genérico `signInWith(provider: "github" | "google")`.
  - Botón "Continuar con Google" debajo del de GitHub (stack vertical,
    GitHub primero).
  - Estado de loading: `useState<Provider | null>` deshabilita ambos
    botones tras click y muestra spinner en el clickeado.
- README "Auth setup" expandido con sub-bloque Google
  (Google Cloud Console, OAuth consent screen, callback URL para
  local-only y para tunnel).
- `.env.example` ya tiene `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  desde P1; sin cambios.

## Out of scope
- Logout / dropdown con avatar / `/me` endpoint (P5).
- UI para gestionar accounts linkeados (ver / desvincular) — fuera de V1.
- Email/password, magic link, otros providers.
- Polish global de loading states / skeletons (P16).
- Pruebas automatizadas del flow OAuth (Playwright en P16).

## Decisiones acordadas (este turno)

### 1. Linking: `allowDangerousEmailAccountLinking: true` en cada provider
**Decisión**: ambos providers llevan el flag. Es el modo idiomático
de Auth.js para unificar identidad por email.

**Razón**:
- Cumple el goal del roadmap ("Mismo email no crea segundo users row")
  con ~3 LOC.
- GitHub y Google verifican email server-side (Google siempre, GitHub
  cuando la primary email está marcada como verificada). El flag se
  llama "dangerous" por el riesgo de spoofing en providers que **no**
  verifican email — no aplica a estos dos.
- Custom `signIn` callback queda disponible si en el futuro
  necesitamos política más fina (ej.: aceptar solo emails con
  `email_verified: true` explícito en el profile claim).

### 2. Layout: stack vertical, GitHub primero
**Decisión**: dos botones full-width apilados, sin separador. GitHub
arriba (flagship por la mission), Google abajo.

**Razón**: standard de la industria (Stripe, Vercel, Linear). Con
solo dos opciones el separador "o" agrega ruido visual sin
beneficio. Mobile-first: full-width siempre legible.

### 3. Loading feedback: disable both + spinner en el clickeado
**Decisión**: `useState<"github" | "google" | null>` controla el
estado. Tras click, ambos botones se deshabilitan; el botón clickeado
muestra `Loader2` de lucide en lugar del icono del provider.

**Razón**: el redirect del POST a GitHub/Google toma 1–2s en redes
lentas. Sin feedback visual el botón queda "frozen", invitando al
doble-click. ~10 LOC, cero deps nuevas (`Loader2` ya está disponible
en lucide-react instalado en P0).

## Decisiones técnicas derivadas

### auth-config.ts (esquemático)
```ts
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";

// guards de env vars: AUTH_SECRET, GITHUB_*, GOOGLE_*

providers: [
  GitHub({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    authorization: { params: { scope: "read:user user:email" } },
    allowDangerousEmailAccountLinking: true,
  }),
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    allowDangerousEmailAccountLinking: true,
  }),
],
```

Auth.js genera automáticamente los endpoints
`/auth/signin/google` y `/auth/callback/google` espejando el patrón
de GitHub. Sin cambios en `server.ts` ni en el handler.

### LoginPage refactor (esquemático)
```tsx
type Provider = "github" | "google";

async function signInWith(provider: Provider) {
  const { csrfToken } = await fetch("/auth/csrf").then(r => r.json());
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/auth/signin/${provider}`;
  // hidden inputs csrfToken + callbackUrl="/"
  document.body.appendChild(form);
  form.submit();
}

export function LoginPage() {
  const [pending, setPending] = useState<Provider | null>(null);
  const handle = (p: Provider) => {
    setPending(p);
    void signInWith(p);
  };
  // dos <Button> con disabled={pending !== null} y spinner condicional
}
```

### Env vars
`.env.example` ya declara `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`
desde P1 (sección P4). El user los llena con valores del proyecto
de Google Cloud Console.

### Tunnel + Google OAuth
El handler reescribe la URL con `AUTH_URL` (fix de P3); aplica igual
para Google. Si el user usa el tunnel, registra **otro** OAuth client
en Google con la callback `https://3010.mauroluna.dev/auth/callback/google`
(Google sí permite múltiples authorized redirect URIs por client,
pero conviene separar dev local y prod de todos modos).

## Critical files
- `src/infrastructure/auth/auth-config.ts` — agregar provider Google
  + flag de linking en ambos.
- `src/frontend/pages/LoginPage.tsx` — refactor con helper genérico,
  segundo botón, loading state.
- `README.md` — sub-bloque "Google" en sección Auth setup.

## References
- `specs/mission.md` → persona 1 (no-coder), GitHub opcional.
- `specs/tech-stack.md` → providers V1 (GitHub + Google).
- `specs/roadmap.md` → P4 (verificación canónica), P5 (UX session).
- `feedback_authjs_core.md` → POST+CSRF, AUTH_URL rewrite (aplican
  igual a Google).
- Auth.js docs → Google provider, `allowDangerousEmailAccountLinking`.
