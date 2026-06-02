# P10 — GitHub repo creation on connect · Plan

Numbered task groups. Cada grupo deja la app en estado compilable
(`bun run lint && bun run typecheck && bun test` verde) salvo que se
indique lo contrario.

## 1. Pre-requisito operacional

1.1. Verificar que la OAuth App de GitHub existente (la que ya
configura `GITHUB_CLIENT_ID` para Auth.js login) tenga la
**Authorization callback URL** que cubra:
- `<AUTH_URL>/auth/callback/github` (login, ya configurado)
- `<AUTH_URL>/api/integrations/github/oauth-callback` (nuevo, P10)

GitHub permite múltiples callback URLs separadas por coma o newline en
la config de la OAuth App. Si hay solo una, agregar la segunda.

1.2. En `.env` local agregar (si no está):
```
ENCRYPTION_KEY=<openssl rand -base64 32>
```

1.3. Actualizar `.env.example` documentando que `ENCRYPTION_KEY`
ahora es required.

## 2. Schema + migration

2.1. Nueva tabla en
`src/infrastructure/persistence/schema/github-connection.ts`:
```ts
export const userGithubConnection = pgTable("user_github_connection", {
  userId: text("user_id").primaryKey().notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubLogin: text("github_login").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  scopes: text("scopes").array().notNull(),
  repoFullName: text("repo_full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
});
```

2.2. Re-export desde `schema/index.ts`.

2.3. `bun run db:generate` → revisar `0005_*.sql` → `bun run db:migrate`.

## 3. Domain (entity + VO + errors + constants)

3.1. `src/domain/github-connection/constants.ts`:
```ts
export const CONSTANTS = {
  REQUIRED_SCOPES: ["repo"],
  OAUTH_STATE_TTL_SECONDS: 600,
  REPO_DESCRIPTION: "Versioned prompts managed by prompteando",
  DEFAULT_BRANCH: "main",
  README_TEMPLATE: `# prompteando

Versioned prompts managed by [prompteando](https://prompteando.app).

This repo mirrors the prompts you create in your prompteando dashboard.
Each save commits a new version of the affected prompt under
\`prompts/<slug>.md\`.

Disconnect at any time from your prompteando settings — your data lives
here either way.
`,
} as const;
```

3.2. `src/domain/github-connection/github-connection.errors.ts`:
- `GitHubConnectionNotFoundError(userId)`
- `GitHubOAuthFailedError(reason)`
- `GitHubInsufficientScopeError(missing: string[])`
- `GitHubRepoCreationFailedError(cause)`
- `InvalidOAuthStateError(reason)`

3.3. `src/domain/github-connection/repo-full-name.vo.ts`:
class `RepoFullName` con `static parse(input: string)`. Regex
`^[a-z0-9._-]+\/[a-z0-9._-]+$` case-insensitive (GitHub permite
mayúsculas en owner y repo, pero la URL canónica es lowercase).

3.4. `src/domain/github-connection/github-connection.entity.ts`:
class `GitHubConnection` con private constructor +
`static create(userId, githubLogin, encryptedAccessToken, scopes,
repoFullName, defaultBranch, now)` +
`static fromRow(row)` + getters readonly + `toView()` (excluye
`encryptedAccessToken` y `scopes`) + `toJSON()` delega en `toView()`.

3.5. `src/domain/github-connection/index.ts` barrel exports.

## 4. Application: extender CryptoPort + GatewayPort + RepoPort

4.1. Extender `src/application/ports/crypto.port.ts` con
`encrypt(plain: string): string` y
`decrypt(ciphertext: string): string` (synchronous OK).

4.2. Extender `src/infrastructure/crypto/bun-crypto.adapter.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

private get encryptionKey(): Buffer {
  const buf = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  }
  return buf;
}

encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

decrypt(ciphertext: string): string {
  const [ivB64, ctB64, tagB64] = ciphertext.split(":");
  const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey,
    Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
```

4.3. Test unitario en
`src/infrastructure/crypto/__test__/bun-crypto.adapter.test.ts`:
- roundtrip para varios largos
- mismo plaintext → distintos ciphertexts (IV random)
- tampering del authTag → throws
- tampering del ciphertext → throws

4.4. Nuevo port
`src/application/ports/github-gateway.port.ts` con la interface
descripta en requirements §Application.

4.5. Nuevo port
`src/application/ports/github-connection-repository.port.ts`:
```ts
export interface GitHubConnectionRepository {
  save(connection: GitHubConnection): Promise<void>;
  findByUserId(userId: string): Promise<GitHubConnection | null>;
  deleteByUserId(userId: string): Promise<boolean>;
}
```

## 5. Application: commands + query

5.1. `src/application/commands/connect-github.command.ts`:
class `ConnectGitHubCommand` con
`constructor(repo, gateway, crypto)` y
`execute(userId: string, code: string): Promise<GitHubConnection>`:
1. `const { accessToken, scopes } = await gateway.exchangeCodeForToken(code)`
2. `const missing = CONSTANTS.REQUIRED_SCOPES.filter(s => !scopes.includes(s))`
   → si non-empty, throw `GitHubInsufficientScopeError(missing)`.
3. `const { login } = await gateway.getAuthenticatedUser(accessToken)`
4. `const repoName = "prompteando-" + login`
5. `const { fullName, defaultBranch } = await gateway.ensureRepo(accessToken, repoName)`
6. `await gateway.ensureReadme(accessToken, fullName, defaultBranch)`
7. Construir `GitHubConnection.create(userId, login,
   crypto.encrypt(accessToken), scopes, fullName, defaultBranch, new Date())`
8. `await repo.save(connection)` (overwrite si ya existe).
9. Return `connection`.

5.2. `src/application/commands/disconnect-github.command.ts`:
class `DisconnectGitHubCommand` con `execute(userId: string)` →
`repo.deleteByUserId(userId)`. Idempotent.

5.3. `src/application/queries/get-github-connection.query.ts`:
class `GetGitHubConnectionQuery` con
`execute(userId: string): Promise<GitHubConnection | null>`.

## 6. Infrastructure: gateway + repository + state HMAC

6.1. `bun add @octokit/rest`.

6.2. `src/infrastructure/github/octokit-github.adapter.ts`:
class `OctokitGitHubAdapter` implements `GitHubGateway`:
- Constructor `(env: { clientId, clientSecret })`.
- `exchangeCodeForToken(code)`:
  ```ts
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ client_id, client_secret, code }),
  });
  const json = await res.json();
  if (json.error) throw new GitHubOAuthFailedError(json.error_description ?? json.error);
  return { accessToken: json.access_token, scopes: json.scope.split(",").filter(Boolean) };
  ```
- `getAuthenticatedUser(accessToken)`: `new Octokit({ auth: accessToken
  }).users.getAuthenticated()` → `{ login: data.login }`.
- `ensureRepo`: ver requirements §Infrastructure.
- `ensureReadme`: ver requirements §Infrastructure.

6.3. `src/infrastructure/persistence/repositories/postgres-github-connection.repository.ts`:
class `PostgresGitHubConnectionRepository` implements el port. `save`
usa `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ...` (upsert por
PK).

6.4. `src/infrastructure/auth/oauth-state.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/infrastructure/config/env";
import { CONSTANTS } from "@/domain/github-connection";
import { InvalidOAuthStateError } from "@/domain/github-connection";

function hmac(input: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(input).digest("base64url");
}

export function signOAuthState(userId: string): string {
  const expiresAt = Date.now() + CONSTANTS.OAUTH_STATE_TTL_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyOAuthState(state: string): string {
  const parts = state.split(".");
  if (parts.length !== 3) throw new InvalidOAuthStateError("malformed");
  const [userId, expiresStr, sig] = parts;
  const expected = hmac(`${userId}.${expiresStr}`);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidOAuthStateError("bad signature");
  }
  if (Date.now() > Number(expiresStr)) {
    throw new InvalidOAuthStateError("expired");
  }
  return userId;
}
```

## 7. Env validation

7.1. Extender `src/infrastructure/config/env.ts`:
```ts
ENCRYPTION_KEY: z.string().min(40, "ENCRYPTION_KEY must be base64 of 32 bytes"),
```
(Sacarle el `.optional()`.)

## 8. HTTP routes + composition root

8.1. En `src/interfaces/http/server.ts` instanciar:
- `const githubConnectionRepo = new PostgresGitHubConnectionRepository(db)`
- `const githubGateway = new OctokitGitHubAdapter({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET })`
- `const connectGithub = new ConnectGitHubCommand(githubConnectionRepo, githubGateway, cryptoAdapter)`
- `const disconnectGithub = new DisconnectGitHubCommand(githubConnectionRepo)`
- `const getGithubConnection = new GetGitHubConnectionQuery(githubConnectionRepo)`

8.2. Routes:
```ts
.get("/api/integrations/github/oauth-start", async ({ request }) => {
  const userOr401 = await requireUser(request, getCurrentUser);
  if (userOr401 instanceof Response) return userOr401;
  const state = signOAuthState(userOr401.id);
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.AUTH_URL}/api/integrations/github/oauth-callback`,
    scope: "repo",
    state,
    allow_signup: "false",
  });
  return Response.json({
    url: `https://github.com/login/oauth/authorize?${params}`,
  });
})

.get("/api/integrations/github/oauth-callback", async ({ query }) => {
  const back = (msg: string) =>
    Response.redirect(`${env.AUTH_URL}/settings/integrations?${msg}`, 302);

  if (query.error) return back(`error=${encodeURIComponent(String(query.error))}`);
  if (typeof query.code !== "string" || typeof query.state !== "string") {
    return back("error=invalid-callback");
  }

  let userId: string;
  try {
    userId = verifyOAuthState(query.state);
  } catch {
    return back("error=invalid-state");
  }

  try {
    await connectGithub.execute(userId, query.code);
    return back("connected=1");
  } catch (err) {
    if (err instanceof GitHubInsufficientScopeError) return back("error=insufficient-scope");
    if (err instanceof GitHubOAuthFailedError) return back("error=oauth-failed");
    if (err instanceof GitHubRepoCreationFailedError) return back("error=repo-failed");
    throw err;
  }
})

.get("/api/integrations/github", async ({ request }) => {
  const userOr401 = await requireUser(request, getCurrentUser);
  if (userOr401 instanceof Response) return userOr401;
  const c = await getGithubConnection.execute(userOr401.id);
  if (!c) return new Response(null, { status: 404 });
  return Response.json(c.toView());
})

.delete("/api/integrations/github", async ({ request }) => {
  const userOr401 = await requireUser(request, getCurrentUser);
  if (userOr401 instanceof Response) return userOr401;
  await disconnectGithub.execute(userOr401.id);
  return new Response(null, { status: 204 });
})
```

8.3. Bun.serve `routes` block: agregar
`"/api/integrations/*": (req) => app.handle(req)`.

## 9. Frontend

9.1. `src/frontend/lib/api/integrations.ts`:
- `getGithubConnection()` (404 → null)
- `getGithubOAuthUrl()` (returns the start URL)
- `disconnectGithub()` (DELETE)

9.2. `src/frontend/hooks/use-github-connection.ts`: SWR wrap de
`/api/integrations/github`.

9.3. `src/frontend/pages/SettingsIntegrationsPage.tsx`:
- Loading skeleton.
- Estado no-conectado: card con copy + warning del scope + botón
  "Conectar GitHub" → fetch de `/oauth-start` →
  `window.location.href = url`.
- Estado conectado: muestra `githubLogin`, `repoFullName`, link "Ver
  repo" → `https://github.com/<repoFullName>`, botón "Desconectar"
  con confirm dialog.
- Detectar `?connected=1` y `?error=<code>` en query params para
  mostrar banner.

9.4. Routing en `src/frontend/frontend.tsx`:
```tsx
<Route path="settings/integrations" element={<SettingsIntegrationsPage />} />
```

9.5. Header dropdown (`UserMenu.tsx`): agregar item "Integrations" →
`/settings/integrations`.

## 10. Validation pass

10.1. Correr la sequence completa de `validation.md`. Fix issues.

10.2. Pre-push hook (`bun run lint && bun run typecheck && bun run
build && bun test`) verde.

## 11. Commit + PR

11.1. Commits granulares siguiendo `specs/conventions.md` §2:
- `feat(p10): make ENCRYPTION_KEY required + add to env schema`
- `feat(p10): add user_github_connection schema + migration 0005`
- `feat(p10): add GitHubConnection entity + RepoFullName VO + errors`
- `feat(p10): extend CryptoPort with encrypt/decrypt (AES-256-GCM)`
- `feat(p10): add GitHubGateway port + ConnectionRepository port`
- `feat(p10): add Connect/Disconnect commands + Get query`
- `feat(p10): add OctokitGitHubAdapter + oauth-state HMAC helper`
- `feat(p10): add PostgresGitHubConnectionRepository`
- `feat(p10): wire 4 /api/integrations/github routes`
- `feat(p10): add SettingsIntegrationsPage + Integrations menu item`
- `docs(p10): add P10 spec docs (requirements, plan, validation)`

11.2. Abrir PR desde `feat/p10-github-connect` → `master`.
