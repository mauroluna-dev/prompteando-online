# P10 — GitHub repo creation on connect · Requirements

## Why this phase

Refer: `specs/roadmap.md` → P10. Hasta P9 el producto está
completamente utilizable sin GitHub. Esta fase activa el
**flagship differentiator**: "tu historial vive en TU repo". Es la
primera mitad de la integración (la otra es P11 auto-commit on save
y P12 backfill cronológico).

P10 entrega: el usuario clickea **"Conectar GitHub"** en
`/settings/integrations`, autoriza permisos `repo` vía OAuth, y el
backend asegura que exista un repo privado `prompteando-<username>`
con un README inicial. El repo queda listo para que P11 le commitee
versiones.

Después de P10 todavía no hay commits automáticos — solo conexión +
repo provisionado.

## Decisiones tomadas (sesión 2026-05-03)

1. **OAuth con scope `repo`, no GitHub App.** El persona driver
   (founders/PMs/marketers no-coders) requiere el flow más simple
   posible — un consent screen familiar, un click. La granularidad
   de una App es valiosa para B2B/marketplace pero excesiva para
   este product fit. `repo` da read+write a todos los repos del
   usuario; lo comunicamos honestamente en la UI ("solo tocamos
   `prompteando-<username>`, código fuente en X.com/prompteando").

2. **OAuth manual desacoplado de Auth.js**, no scope-bump del
   provider de login. Razón: el provider GitHub de Auth.js sirve
   para sign-in con scope mínimo (`read:user user:email`); subirlo
   a `repo` mostraría un consent screen aterrador a usuarios que
   solo quieren registrarse y nunca van a usar GitHub. La
   integración va por su propio flow con el mismo `GITHUB_CLIENT_ID`/
   `GITHUB_CLIENT_SECRET` (misma OAuth app, scope distinto por
   request).

3. **Reuse on collision.** Si `prompteando-<username>` ya existe en
   la cuenta GitHub del usuario, lo adoptamos como destination
   repo. Solo escribimos `README.md` si falta. No fallar, no
   sufijar.

4. **Encryption.** Sumar `encrypt(plain) / decrypt(ciphertext)` al
   `CryptoPort` con AES-256-GCM y clave dedicada `ENCRYPTION_KEY`
   (32 bytes base64, ya declarada en `.env.example`). Se usa para
   guardar el `access_token` de GitHub at-rest en
   `user_github_connection`. ENCRYPTION_KEY pasa a **required**.

5. **Repo siempre privado.** `private: true` hardcoded en
   `OctokitGitHubGateway.createRepo`. Si un user lo quiere público,
   lo cambia manualmente en GitHub. Toggle en UI queda fuera de
   scope.

6. **Repo name = `prompteando-<github_login>`.** `github_login` es el
   `login` que devuelve `GET /user` en GitHub (puede ser el username
   personal). Si el usuario quiere conectar con una organización,
   no lo soportamos en V1 (solo cuenta personal).

## In scope

### Domain
- Nueva entity `GitHubConnection` (clase) en
  `src/domain/github-connection/`:
  ```
  userId: string                   // PK + FK a users
  githubLogin: string              // ej "mauroluna"
  encryptedAccessToken: string     // ciphertext AES-256-GCM
  scopes: string[]                 // ej ["repo"]
  repoFullName: string             // ej "mauroluna/prompteando-mauroluna"
  defaultBranch: string            // típicamente "main"
  connectedAt: Date
  ```
  con `static create(...)`, `static fromRow(...)`, getters,
  `toJSON()`/`toView()` (excluye `encryptedAccessToken` y `scopes`
  internos).
- VO `RepoFullName` (`<owner>/<repo>` con regex case-insensitive).
- Errors:
  - `GitHubConnectionNotFoundError`
  - `GitHubOAuthFailedError(reason)`
  - `GitHubInsufficientScopeError(missing: string[])`
  - `GitHubRepoCreationFailedError(cause)`
  - `InvalidOAuthStateError`
- `constants.ts`:
  - `REQUIRED_SCOPES = ["repo"] as const`
  - `OAUTH_STATE_TTL_SECONDS = 600` (10 min)
  - `REPO_DESCRIPTION = "Versioned prompts managed by prompteando"`
  - `README_TEMPLATE` (string con explicación + link a la app)
  - `DEFAULT_BRANCH = "main"`

### Application
- **Ports**:
  - `src/application/ports/github-gateway.port.ts`:
    ```ts
    export interface GitHubGateway {
      exchangeCodeForToken(code: string): Promise<{
        accessToken: string;
        scopes: string[];
      }>;
      getAuthenticatedUser(accessToken: string): Promise<{
        login: string;
      }>;
      ensureRepo(accessToken: string, repoName: string): Promise<{
        fullName: string;
        defaultBranch: string;
        wasCreated: boolean;
      }>;
      ensureReadme(
        accessToken: string,
        repoFullName: string,
        defaultBranch: string,
      ): Promise<{ committed: boolean; sha?: string }>;
    }
    ```
  - `src/application/ports/github-connection-repository.port.ts`
    (CRUD: save, findByUserId, deleteByUserId).
- **Extender `CryptoPort`**: `encrypt(plain) / decrypt(ciphertext)`
  con AES-256-GCM. Output formato
  `<ivB64>:<ciphertextB64>:<authTagB64>`.
- **Commands**:
  - `ConnectGitHubCommand.execute(userId, code)`:
    1. `gateway.exchangeCodeForToken(code)` → `{ accessToken, scopes }`.
    2. Verificar `REQUIRED_SCOPES ⊆ scopes` o throw
       `GitHubInsufficientScopeError`.
    3. `gateway.getAuthenticatedUser(accessToken)` → `{ login }`.
    4. `gateway.ensureRepo(accessToken, "prompteando-<login>")`.
    5. `gateway.ensureReadme(accessToken, fullName, defaultBranch)`.
    6. `crypto.encrypt(accessToken)`, construir `GitHubConnection.create(...)`,
       persistir vía `repo.save` (overwrite si ya hay connection del
       mismo user — idempotent).
  - `DisconnectGitHubCommand.execute(userId)`:
    - `repo.deleteByUserId(userId)`. Idempotent.
- **Queries**:
  - `GetGitHubConnectionQuery.execute(userId)`:
    - Devuelve la connection o null. Para
      `/api/integrations/github`.

### Infrastructure
- **Schema** (Drizzle migration `0005_*`):
  ```sql
  CREATE TABLE user_github_connection (
    user_id                  text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    github_login             text NOT NULL,
    encrypted_access_token   text NOT NULL,
    scopes                   text[] NOT NULL,
    repo_full_name           text NOT NULL,
    default_branch           text NOT NULL DEFAULT 'main',
    connected_at             timestamp NOT NULL DEFAULT NOW()
  );
  ```
  PK = userId (1:1, una sola conexión por usuario en V1).
- **Adapter** `OctokitGitHubGateway` en
  `src/infrastructure/github/octokit-github.adapter.ts`:
  - `exchangeCodeForToken`: POST a `https://github.com/login/oauth/access_token`
    con `client_id`, `client_secret`, `code`. Headers `Accept: application/json`.
    Parsear `{ access_token, scope }` (scope es CSV) → split por `,`.
  - `getAuthenticatedUser`: `octokit.users.getAuthenticated()` con
    el token.
  - `ensureRepo`:
    - `octokit.repos.get({ owner: login, repo: name })` → si 200,
      `{ wasCreated: false, fullName, defaultBranch }`.
    - Si 404: `octokit.repos.createForAuthenticatedUser({
      name, private: true, description: REPO_DESCRIPTION,
      auto_init: false })`. Retornar
      `{ wasCreated: true, fullName, defaultBranch: "main" }`.
    - Otros errores: throw `GitHubRepoCreationFailedError(err.message)`.
  - `ensureReadme`:
    - `octokit.repos.getContent({ owner, repo, path: "README.md" })`
      → 200 → `{ committed: false }`.
    - 404 → `octokit.repos.createOrUpdateFileContents({
      owner, repo, path: "README.md",
      message: "chore: initial prompteando README",
      content: btoa(README_TEMPLATE),
      branch: defaultBranch })` → `{ committed: true, sha }`.
- **Adapter** `BunCryptoAdapter` extendido con `encrypt/decrypt`
  usando `node:crypto` (`createCipheriv("aes-256-gcm", ...)`).
  IV random 12 bytes, authTag 16 bytes.
- **Repository** `PostgresGitHubConnectionRepository`.
- **State helper** `src/infrastructure/auth/oauth-state.ts`:
  `signOAuthState(userId)` y `verifyOAuthState(state)` con
  HMAC-SHA256 + expiración (`<userId>.<expiresAtMs>.<hmacB64url>`)
  usando `env.AUTH_SECRET`. TTL = `OAUTH_STATE_TTL_SECONDS`.
- **Env nuevas** (validar en `env.ts`):
  - `ENCRYPTION_KEY`: pasa de optional a **required**, mínimo 40
    chars (base64 de 32 bytes ≈ 44 chars).
  - **No** se agregan envs nuevas para GitHub — se reusan
    `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` que ya están
    configurados para Auth.js.

### HTTP
- `GET /api/integrations/github/oauth-start` (auth con cookie de sesión):
  Devuelve `{ url: <github authorize URL> }`. Construye:
  ```
  https://github.com/login/oauth/authorize
    ?client_id=<env.GITHUB_CLIENT_ID>
    &redirect_uri=<env.AUTH_URL>/api/integrations/github/oauth-callback
    &scope=repo
    &state=<signOAuthState(userId)>
    &allow_signup=false
  ```
  El frontend hace `window.location.href = url`.
- `GET /api/integrations/github/oauth-callback?code=...&state=...`
  (NO requireUser — la sesión se recupera del state HMAC):
  - `verifyOAuthState(state)` → `userId` o redirect a
    `/settings/integrations?error=invalid-state`.
  - Si query trae `error=...` (usuario canceló en GitHub) →
    redirect `/settings/integrations?error=cancelled`.
  - `await connectGithub.execute(userId, code)`.
  - Catch errores específicos → redirect con `?error=<code>`.
  - Success → redirect `/settings/integrations?connected=1`.
- `GET /api/integrations/github` (auth con sesión):
  - Devuelve `200` con `GitHubConnectionView` o `404` si no
    conectado. View excluye `encryptedAccessToken` y `scopes`.
- `DELETE /api/integrations/github` (auth con sesión):
  - 204. Idempotent (no throw si no existe).

### Frontend
- Nueva página `/settings/integrations` (`SettingsIntegrationsPage.tsx`).
  Card "GitHub":
  - Estado **no conectado**: copy explicando el beneficio + warning
    discreto sobre el scope ("requiere acceso a tus repos para crear
    `prompteando-<usuario>` privado") + botón "Conectar GitHub" →
    fetch `/api/integrations/github/oauth-start` →
    `window.location.href = url`.
  - Estado **conectado**: muestra `repoFullName` + `githubLogin`,
    link a `https://github.com/<repoFullName>` ("Ver repo"), botón
    "Desconectar" (DELETE → confirm dialog → refresh).
  - Estado **error**: si `?error=...` en query params, banner con
    mensaje legible (mapeo error code → texto en español).
  - Estado **éxito**: si `?connected=1`, banner verde "GitHub
    conectado" que se auto-disipa.
- Hook SWR `useGitHubConnection()` envuelve `/api/integrations/github`.
  Trata 404 como `data: null`.
- Routing en `frontend.tsx`: agregar
  `<Route path="settings/integrations" element={<SettingsIntegrationsPage />} />`.
- Header dropdown (`UserMenu.tsx` o equivalente): agregar item
  "Integrations" → `/settings/integrations`.

## Out of scope (deferred)

- **Auto-commit on save** → P11.
- **Backfill cronológico de prompts existentes** → P12.
- **Conexión a organizaciones GitHub** (solo cuentas personales en
  V1).
- **Revocación del token en el lado de GitHub al desconectar**
  (DELETE `/applications/<client_id>/grant`). En V1 el disconnect
  solo borra la fila local; el token queda válido hasta que el
  usuario lo revoque manualmente desde
  https://github.com/settings/applications.
- **Refresh de token** (GitHub OAuth tokens son long-lived; no hay
  refresh token; si revocado, el usuario re-conecta).
- **Re-auth flow automático** si el token deja de funcionar →
  detectado en P11 cuando el commit falle.
- **Toggle de visibilidad public/private** del repo.
- **Migración de usuarios pre-P10** (no hay; ningún usuario tiene
  GitHub conectado todavía).

## Risks / open items

- **Scope `repo` es amplio**. UX risk: usuarios técnicos pueden
  desconfiar. Mitigación: copy honesto + link al código fuente.
- **El access_token se encripta con `ENCRYPTION_KEY`**. Si la rotás
  sin migrar, las connections existentes se vuelven inutilizables
  (decrypt falla). Documentar en operational README.
- **Rate limit de GitHub OAuth `/user`**: 5000/h por token, fine.
- **GitHub puede deprecar OAuth en favor de Apps**. Si pasa, P10 se
  re-implementa. Hoy OAuth está fully supported y es el estándar
  para integraciones consumer.
