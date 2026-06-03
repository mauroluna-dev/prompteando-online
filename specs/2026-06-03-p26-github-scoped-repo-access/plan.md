# P26 — Conexión GitHub con acceso acotado a un repo · Plan

Grupos de tareas numerados. Cada grupo deja la app compilable
(`bun run lint && bunx tsc --noEmit && bun test` verde) salvo que se
indique lo contrario. No se requieren env nuevas.

## 1. Schema + migración

1.1. En `src/infrastructure/persistence/schema/user-github-connection.ts`
agregar columna:
```ts
connectionMethod: text("connection_method").notNull().default("oauth"),
```
Default `"oauth"` ⇒ las filas existentes quedan correctas sin backfill
de datos.

1.2. `bun run db:generate` → revisar el SQL generado (debe ser un
`ALTER TABLE ... ADD COLUMN connection_method text NOT NULL DEFAULT 'oauth'`)
→ `bun run db:migrate`.

## 2. Dominio

2.1. `src/domain/github-connection/constants.ts`: agregar
```ts
CONNECTION_METHODS: ["oauth", "pat"] as const,
```
y un tipo `GitHubConnectionMethod = "oauth" | "pat"`.

2.2. `github-connection.entity.ts`:
- Sumar `connectionMethod: GitHubConnectionMethod` a `GitHubConnectionRow`,
  `GitHubConnectionView`, al constructor y a `toView()`.
- `create(...)` (OAuth) setea `connectionMethod: "oauth"` (mantener firma
  o sumar al final con default).
- Nueva factory `createWithToken(userId, githubLogin, encryptedToken,
  repoFullName, defaultBranch, now)` → `connectionMethod: "pat"`,
  `scopes: []`.
- `fromRow` lee `row.connectionMethod` (normalizar: si no es uno de los
  válidos, tratar como `"oauth"`).

2.3. Errores nuevos en `github-connection.errors.ts`:
`GitHubTokenInvalidError`, `GitHubRepoAccessDeniedError`,
`GitHubRepoWriteDeniedError` (mismo patrón que los existentes). Export
desde `index.ts`.

2.4. Tests del entity: `createWithToken` produce method `"pat"` y
`scopes` vacío; `fromRow` con `connection_method` desconocido cae a
`"oauth"`.

## 3. Gateway port + adapter

3.1. `github-gateway.port.ts`: nuevo método
```ts
verifyRepoAccess(
  accessToken: string,
  repoFullName: string,
): Promise<{ defaultBranch: string; canWrite: boolean }>;
```

3.2. `octokit-github.adapter.ts`: implementar `verifyRepoAccess`:
- `const [owner, repo] = repoFullName.split("/")`.
- `octokit.repos.get({ owner, repo })` → `defaultBranch =
  data.default_branch`, `canWrite = data.permissions?.push === true`.
- Mapear errores: 404/403 → `GitHubRepoAccessDeniedError`; 401 →
  `GitHubTokenInvalidError`. (`getAuthenticatedUser` ya tira en 401;
  reusar `map-commit-error` donde aplique o agregar mapeo local.)

3.3. Test del adapter con `fetch`/octokit mockeado: repo con push=true
ⓥ ok; push=false ⇒ `canWrite=false`; 404 ⇒ `GitHubRepoAccessDeniedError`.

## 4. Application command

4.1. Nuevo `src/application/commands/connect-github-with-token.command.ts`:
```
execute(userId, rawToken, repoFullName):
  login = gateway.getAuthenticatedUser(rawToken).login   // valida token (401→GitHubTokenInvalidError)
  { defaultBranch, canWrite } = gateway.verifyRepoAccess(rawToken, repoFullName)
  if (!canWrite) throw GitHubRepoWriteDeniedError(repoFullName)
  conn = GitHubConnection.createWithToken(
           userId, login, crypto.encrypt(rawToken),
           RepoFullName.parse(repoFullName), defaultBranch, new Date())
  repo.save(conn)
  return conn
```
NB: en modo PAT **no** se llama `ensureRepo` ni `ensureReadme` (decisión
#4 del requirements).

4.2. Tests del command (mirror de `connect-github.command.test.ts`):
- happy path ⇒ guarda connection method `"pat"`, token cifrado, branch
  del repo.
- token inválido ⇒ propaga `GitHubTokenInvalidError`, no guarda.
- sin push ⇒ `GitHubRepoWriteDeniedError`, no guarda.
- `RepoFullName.parse` inválido ⇒ error de VO.

## 5. HTTP route

5.1. En `server.ts`, instanciar `ConnectGitHubWithTokenCommand` con los
mismos `githubConnectionRepo`, `githubGateway`, `crypto`.

5.2. Nueva ruta (junto a las de `/api/integrations/github/*`):
```
POST /api/integrations/github/token
  - requireUser
  - body Zod: { token: string (trim, no vacío), repoFullName: "owner/repo" }
  - try: await connectWithToken.execute(user.id, token, repoFullName)
          dispatchBackfill(user.id, false)   // mismo backfill que OAuth
          return 200 { connected: true }
  - catch mapea a 422 con código:
      GitHubTokenInvalidError      → { error: "token-invalid" }
      GitHubRepoAccessDeniedError  → { error: "repo-access-denied" }
      GitHubRepoWriteDeniedError   → { error: "repo-write-denied" }
```
Validación de `repoFullName` con un Zod regex `^[\w.-]+\/[\w.-]+$`.

5.3. Las rutas OAuth existentes (`oauth-start`, `oauth-callback`,
`GET`, `DELETE`) quedan sin cambios.

## 6. Frontend — selección de método

6.1. `SettingsIntegrationsPage.tsx`, estado **no conectado**
(`NotConnectedState`): reemplazar el botón único por un selector de dos
caminos (tabs o dos cards):

- **"Acceso completo (recomendado)"** → flujo OAuth actual
  (`handleConnect`). Copy: "Un click. Te creamos una carpeta privada
  `prompteando-<usuario>`. GitHub nos pide acceso a tus repos, pero solo
  tocamos esa carpeta."
- **"Elegir un solo repo (para los más cuidadosos)"** → formulario PAT.

6.2. Formulario PAT (`ConnectWithTokenForm`, nuevo subcomponente):
- Input `owner/repo` (con placeholder `tu-usuario/mis-prompts`).
- Input token (type=password, placeholder `github_pat_...`).
- Guía paso a paso (lista numerada) + link directo a
  `https://github.com/settings/personal-access-tokens/new`:
  1. Repository access → **Only select repositories** → elegí tu repo.
  2. Repository permissions → **Contents: Read and write**.
  3. Generá el token y pegalo acá.
- Submit → `POST /api/integrations/github/token` vía
  `src/frontend/lib/api/integrations.ts` (nueva fn `connectGithubWithToken`).
- Manejo de errores con copy claro por código (token-invalid /
  repo-access-denied / repo-write-denied) + toast de éxito y
  `mutate("/api/integrations/github")`.

6.3. `integrations.ts` (lib API): agregar
`connectGithubWithToken(token, repoFullName)`.

## 7. Frontend — estado conectado

7.1. `ConnectedState`: usar `connection.connectionMethod` para el copy:
- `"oauth"`: chip/legend "Acceso a todos tus repos · carpeta
  `prompteando-<user>`" (como hoy).
- `"pat"`: chip "Acceso solo a este repo" + mostrar el `repoFullName`
  exacto. Detail "Método: token acotado".
- El `GitHubConnectionView` ya expone `repoFullName`; sumar
  `connectionMethod` a `getGithubConnection`/view (viene del entity).

7.2. Mensaje de desconexión (`handleDisconnect`): si method `"pat"`,
recordá al usuario que además puede **revocar el token** desde GitHub
(link), porque desconectar acá solo borra nuestra copia cifrada.

## 8. Backfill / auto-commit (verificación, sin cambios esperados)

8.1. Confirmar que `CommitVersionToGitHubJob` y
`BackfillGitHubHistoryJob` funcionan sin tocar nada: ambos
`crypto.decrypt(conn.encryptedAccessToken)` y commitean a
`conn.repoFullName` / `conn.defaultBranch`. Un PAT con Contents:write es
suficiente para la Contents API y la Git Data API (backdated commits).

8.2. Caso borde a verificar manualmente: backfill sobre un repo del
usuario que **ya tiene** archivos en `prompts/` — el flujo de "fetch SHA
si existe" ya está implementado en el adapter; confirmar que no rompe.

## 9. Docs

9.1. `.env.example`: nota aclaratoria de que el modo PAT **no requiere
env nuevas** (reusa `ENCRYPTION_KEY`).

9.2. README: en la sección de GitHub, agregar un párrafo "¿No querés dar
acceso a todos tus repos? Conectá con un token acotado a un solo repo."
(Opcional, confirmar con el owner.)

9.3. `specs/roadmap.md`: entrada P26 (done al cerrar) + P27 (GitHub App)
como follow-up.

## Orden sugerido de PRs

Un solo PR es viable (cambio acotado). Si se prefiere granular:
- PR1: schema + dominio + gateway + command + ruta + tests (backend).
- PR2: frontend (selector + form + estado conectado) + copy.
