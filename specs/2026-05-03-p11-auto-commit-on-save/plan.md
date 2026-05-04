# P11 — Auto-commit on SaveNewVersion · Plan

Numbered task groups. Cada grupo deja la app en estado compilable
(`bun run lint && bun run typecheck && bun test` verde) salvo donde
se indique lo contrario.

## 0. Conventions update (pre-flight)

0.1. Editar `specs/conventions.md` §9 (file suffixes): agregar
`.job.ts` para application-layer background services no-CQS.
Documentar la regla:
> Un job es un servicio de application que se invoca por
> composición (no por un caller que espere su resultado). Expone
> un único método público `run(input)`. No es Command (no es
> disparado por una intención del usuario) ni Query (no devuelve
> data); es un side-effect orquestado.

0.2. Editar `specs/tech-stack.md` sección Architecture / CQS:
mencionar jobs como tercer ciudadano junto a commands/queries.

0.3. (No code yet.) Verificar que `eslint` no rechaza el suffix
nuevo (no debería — la regla actual es solo informacional, no
está enforced en lint).

## 1. Schema + migration

1.1. Editar `src/infrastructure/persistence/schema/prompt-versions.ts`:
agregar
```ts
githubSyncError: text("github_sync_error"),
```
después de `githubCommitSha`.

1.2. `bun run db:generate` → revisar `0006_*.sql` (debe ser un
`ALTER TABLE prompt_versions ADD COLUMN github_sync_error text`).

1.3. `bun run db:migrate` contra la BD del compose.

1.4. Verificar con `\d prompt_versions` que la columna existe y es
nullable.

## 2. Domain extension

2.1. Editar `src/domain/prompt-version/prompt-version.entity.ts`:
- Agregar `_githubSyncError: string | null` al constructor privado.
- `static create(...)` inicializa `null`.
- `static fromRow(...)` mapea `row.githubSyncError`.
- Getter `githubSyncError` readonly.
- Método `markGithubSyncFailed(error: string): void` que setea
  `_githubSyncError = error` y deja `_githubCommitSha = null`.
- `attachGithubCommit(sha)`: además de setear sha, limpiar
  `_githubSyncError = null` (recuperación de un fail anterior).
- `toJSON()` incluye `githubSyncError`.
- `PromptVersionRow` agrega `githubSyncError: string | null`.
- `PromptVersionDTO` agrega `githubSyncError: string | null`.

2.2. Editar `src/domain/prompt-version/constants.ts` (crear si no
existe; si ya existe agregar las nuevas keys):
```ts
export const CONSTANTS = {
  // existing keys (si las hay)...
  GITHUB_COMMIT_PATH_PREFIX: "prompts",
  GITHUB_COMMIT_PATH_EXT: ".md",
  GITHUB_LOCK_TTL_MS: 30_000,
  GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS: 30_000,
  GITHUB_LOCK_ACQUIRE_POLL_MS: 500,
  GITHUB_RETRY_BACKOFFS_MS: [1_000, 3_000, 9_000],
  NON_RETRYABLE_ERRORS: ["token_invalid", "insufficient_scope", "repo_missing"] as const,
} as const;
```

2.3. Editar `src/domain/prompt-version/prompt-version.errors.ts`:
agregar
```ts
export class GitHubCommitFailedError extends Error {
  constructor(public readonly reason: string) {
    super(`GitHub commit failed: ${reason}`);
    this.name = "GitHubCommitFailedError";
  }
}
```
(Este error existe principalmente para tests; el job en runtime
persiste el error como string en BD, no throw.)

2.4. Tests unitarios en
`src/domain/prompt-version/__test__/prompt-version.test.ts`:
- `PromptVersion.create(...)` deja `githubCommitSha === null` y
  `githubSyncError === null`.
- `attachGithubCommit("abc")` setea sha y limpia syncError previo.
- `markGithubSyncFailed("token_invalid")` setea error, deja sha
  null.
- `fromRow({...githubSyncError: "x"})` reconstituye correctamente.

## 3. Application: ports

3.1. Crear `src/application/ports/lock.port.ts`:
```ts
export interface Lock {
  /** SET key token NX PX ttlMs. Returns release token, or null if not acquired. */
  tryAcquire(key: string, ttlMs: number): Promise<string | null>;
  /** CAS-delete: only deletes if current value === token. */
  release(key: string, token: string): Promise<void>;
}
```

3.2. Editar `src/application/ports/github-gateway.port.ts`:
agregar el método `commitVersion`:
```ts
commitVersion(input: {
  accessToken: string;
  repoFullName: string;
  branch: string;
  path: string;
  content: string;
  commitMessage: string;
}): Promise<{ sha: string }>;
```

3.3. Crear nuevo error tipado en
`src/application/ports/github-gateway.port.ts` (mismo file, junto
a la interface):
```ts
export type GitHubCommitErrorCode =
  | "token_invalid"
  | "insufficient_scope"
  | "repo_missing"
  | "rate_limited"
  | "transient"
  | "unknown";

export class GitHubCommitGatewayError extends Error {
  constructor(public readonly code: GitHubCommitErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GitHubCommitGatewayError";
  }
}
```
Razón: vive en application/ports porque es contrato del port. No
en domain (no hay regla de negocio detrás).

3.4. Editar `src/application/ports/version-repository.port.ts`:
agregar
```ts
findById(versionId: string): Promise<PromptVersion | null>;
markGithubCommit(versionId: string, sha: string): Promise<void>;
markGithubSyncFailed(versionId: string, error: string): Promise<void>;
```
(`findById` puede ya existir; verificar y solo agregar lo nuevo.)

## 4. Application: render frontmatter helper

4.1. Crear
`src/application/jobs/render-version-content.ts`:
```ts
import type { Prompt } from "@/domain/prompt";
import type { PromptVersion } from "@/domain/prompt-version";

export function renderVersionContent(
  prompt: Prompt,
  version: PromptVersion,
): string {
  const fm = [
    `prompt_name: ${yamlEscape(prompt.name.value)}`,
    `slug: ${prompt.slug.value}`,
    `version: ${version.versionNumber.value}`,
    version.commitMessage
      ? `commit_message: ${yamlEscape(version.commitMessage)}`
      : null,
    `updated_at: ${version.createdAt.toISOString()}`,
  ].filter(Boolean).join("\n");
  return `---\n${fm}\n---\n\n${version.content}\n`;
}

function yamlEscape(s: string): string {
  // Quote si contiene caracteres ambiguos en YAML flow scalar.
  if (/[:#&*!|>'"%@`,\[\]\{\}]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
```

4.2. Test unitario
`src/application/jobs/__test__/render-version-content.test.ts`:
- prompt name "Hello: World" → quoted en frontmatter.
- version.commitMessage null → la línea se omite.
- multi-línea content → preservado tal cual debajo del frontmatter.
- snapshot del output completo para un caso típico.

## 5. Application: CommitVersionToGitHubJob

5.1. Crear
`src/application/jobs/commit-version-to-github.job.ts`:
```ts
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import type { GitHubGateway } from "@/application/ports/github-gateway.port";
import { GitHubCommitGatewayError } from "@/application/ports/github-gateway.port";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { Lock } from "@/application/ports/lock.port";
import { CONSTANTS } from "@/domain/prompt-version/constants";
import { renderVersionContent } from "./render-version-content";

type Clock = { now(): Date };

export class CommitVersionToGitHubJob {
  constructor(
    private readonly connRepo: GitHubConnectionRepository,
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly gateway: GitHubGateway,
    private readonly crypto: CryptoPort,
    private readonly lock: Lock,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async run(input: {
    userId: string;
    promptId: string;
    versionId: string;
  }): Promise<void> {
    const conn = await this.connRepo.findByUserId(input.userId);
    if (!conn) return;

    const [prompt, version] = await Promise.all([
      this.promptRepo.findById(input.promptId),
      this.versionRepo.findById(input.versionId),
    ]);
    if (!prompt || !version) return;

    const lockKey = `gh:commit:${input.userId}:${prompt.slug.value}`;
    const token = await this.acquireWithPoll(lockKey);
    if (!token) {
      await this.versionRepo.markGithubSyncFailed(input.versionId, "lock_timeout");
      return;
    }

    try {
      const accessToken = this.crypto.decrypt(conn.encryptedAccessToken);
      const path = `${CONSTANTS.GITHUB_COMMIT_PATH_PREFIX}/${prompt.slug.value}${CONSTANTS.GITHUB_COMMIT_PATH_EXT}`;
      const content = renderVersionContent(prompt, version);
      const commitMessage = `${prompt.name.value} v${version.versionNumber.value}: ${version.commitMessage ?? "Save"}`;

      const backoffs = CONSTANTS.GITHUB_RETRY_BACKOFFS_MS;
      for (let attempt = 0; attempt < backoffs.length; attempt++) {
        try {
          const { sha } = await this.gateway.commitVersion({
            accessToken,
            repoFullName: conn.repoFullName,
            branch: conn.defaultBranch,
            path, content, commitMessage,
          });
          await this.versionRepo.markGithubCommit(input.versionId, sha);
          return;
        } catch (err) {
          const code = err instanceof GitHubCommitGatewayError ? err.code : "unknown";
          if ((CONSTANTS.NON_RETRYABLE_ERRORS as readonly string[]).includes(code)) {
            await this.versionRepo.markGithubSyncFailed(input.versionId, code);
            return;
          }
          const isLast = attempt === backoffs.length - 1;
          if (isLast) {
            await this.versionRepo.markGithubSyncFailed(input.versionId, code);
            return;
          }
          await sleep(backoffs[attempt]!);
        }
      }
    } finally {
      await this.lock.release(lockKey, token);
    }
  }

  private async acquireWithPoll(key: string): Promise<string | null> {
    const deadline = this.clock.now().getTime() + CONSTANTS.GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS;
    while (this.clock.now().getTime() < deadline) {
      const t = await this.lock.tryAcquire(key, CONSTANTS.GITHUB_LOCK_TTL_MS);
      if (t) return t;
      await sleep(CONSTANTS.GITHUB_LOCK_ACQUIRE_POLL_MS);
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
```

5.2. Tests unitarios
`src/application/jobs/__test__/commit-version-to-github.job.test.ts`
con fakes de todos los ports:

- **No connection** → `gateway.commitVersion` nunca se llama,
  `markGithubCommit/markGithubSyncFailed` nunca se llaman.
- **Happy path** → `commitVersion` se llama una vez, devuelve
  `{sha:"abc"}`, `markGithubCommit("v1","abc")` se invoca,
  `release` se llama.
- **Transient retry y eventual éxito** → `commitVersion`
  rechaza con `transient` 2 veces, succeeds en el 3er. Verificar
  que `markGithubCommit` se llama una vez con la sha del 3er
  intento. Stub `sleep` (inyectar clock que avance — alternativamente
  usar Bun's fake timers).
- **3 fallos transitorios** → `markGithubSyncFailed("transient")`
  se llama una vez. `markGithubCommit` nunca.
- **Non-retryable error (`token_invalid`)** → un solo intento,
  `markGithubSyncFailed("token_invalid")` se llama, no hay retry.
- **Lock no obtenido** → simular `tryAcquire` que siempre devuelve
  null. El job marca `lock_timeout` y nunca llama gateway.
- **Lock release siempre se invoca** (incluso en path de error
  retryable y non-retryable).

Nota: para los tests con sleep largos, parametrizar
`GITHUB_RETRY_BACKOFFS_MS` por inyección no es trivial porque las
constantes son del domain. Workaround: en los tests usar un fake
gateway que succeed/fail en orden, y monkeypatch `sleep` —
extraer `sleep` a un module-level export sustituible o aceptar
que los tests del retry path tarden ~13s. **Decisión**: testear
los caminos sin retry (1 attempt) en unit tests, y el camino con
retry queda cubierto por integration test o se vuelve un test
slow marcado.

Alternativa más limpia: aceptar `backoffsMs?: number[]` como
parámetro opcional en el constructor del job (default
`CONSTANTS.GITHUB_RETRY_BACKOFFS_MS`). Tests pasan `[0, 0, 0]`.
**Aplicar esta alternativa.** Actualizar también la firma del
constructor en plan 5.1.

## 6. Infrastructure: Redis lock adapter

6.1. Crear
`src/infrastructure/cache/bun-redis-lock.adapter.ts`:
- Implementa `Lock`.
- `tryAcquire`: `redis.send("SET", [key, token, "NX", "PX", String(ttlMs)])`.
  Bun.redis devuelve `"OK"` o `null`.
- `release`: usa Lua CAS:
  ```ts
  const lua = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  await this.redis.send("EVAL", [lua, "1", key, token]);
  ```

6.2. Test integración
`src/infrastructure/cache/__test__/bun-redis-lock.adapter.test.ts`
(skipping si REDIS_URL no está):
- `tryAcquire(k, 1000)` la primera vez → token no-null.
- Segundo `tryAcquire(k, 1000)` mientras el primero vive → null.
- `release(k, token)` → tercer `tryAcquire(k, 1000)` → no-null.
- TTL: después de sleep(1100), `tryAcquire(k, 1000)` → no-null
  (lock expiró).
- Release con token incorrecto → no-op (lock sigue activo).

## 7. Infrastructure: gateway commitVersion

7.1. Editar
`src/infrastructure/github/octokit-github.adapter.ts`: agregar
`commitVersion` y helpers `statusOf` + `mapError`. Usar el mismo
`Octokit` import ya presente desde P10. Cuerpo según
requirements §Infrastructure.

7.2. Tests unitarios
`src/infrastructure/github/__test__/octokit-github.adapter.test.ts`
(si no existe, crearlo): mockear `Octokit` con `mock.module` o
inyectar fetch. Cubrir:
- `commitVersion` cuando `getContent` devuelve 200 → llama
  `createOrUpdateFileContents` con `sha`.
- `getContent` 404 → llama `createOrUpdateFileContents` sin
  `sha`.
- `createOrUpdateFileContents` 401 → throw
  `GitHubCommitGatewayError("token_invalid")`.
- 403 con "secondary rate limit" en el message →
  `"rate_limited"`.
- 403 sin esa frase → `"insufficient_scope"`.
- 404 (repo borrado) → `"repo_missing"`.
- 422 → `"transient"`.
- 500 → `"transient"`.

## 8. Infrastructure: PostgresVersionRepository

8.1. Editar
`src/infrastructure/persistence/repositories/postgres-version.repository.ts`:
- `findById(id)`: SELECT por PK; map a entity; null si no existe.
- `markGithubCommit(id, sha)`: UPDATE set
  `github_commit_sha=sha, github_sync_error=null` WHERE id=id.
- `markGithubSyncFailed(id, error)`: UPDATE set
  `github_sync_error=error` WHERE id=id (no toca sha).
- `fromRow` map ya incluye `githubSyncError`.

8.2. Tests integración (si el repo de versions ya tiene tests):
- `markGithubCommit` setea sha y limpia syncError.
- `markGithubSyncFailed` setea error y NO toca sha.

## 9. HTTP: composition root + dispatch

9.1. En `src/interfaces/http/server.ts`:
- Importar `BunRedisLock`, `CommitVersionToGitHubJob`.
- Instanciar después de los repos/gateway/crypto existentes:
  ```ts
  const lock = new BunRedisLock(getRedis());
  const commitJob = new CommitVersionToGitHubJob(
    githubConnectionRepo, promptRepo, versionRepo,
    githubGateway, cryptoAdapter, lock,
  );
  ```
- En el handler de `POST /api/prompts/:slug/versions`:
  ```ts
  const result = await saveNewVersion.execute(...);
  if (!result.isNoOp) {
    void commitJob.run({
      userId: user.id,
      promptId: result.version.promptId,
      versionId: result.version.id,
    }).catch(err => console.error("[github-commit-job]", err));
  }
  return Response.json(toVersionView(result.version), { status: 201 });
  ```
- En el handler de `POST /api/prompts/:slug/versions/:n/restore`:
  idem (después de que `restoreVersion.execute(...)` devuelva la
  nueva versión).

9.2. Extender el DTO de version (si está aislado del entity)
para incluir `githubCommitSha` y `githubSyncError`. Si se serializa
directamente desde `entity.toJSON()`, ya viene; verificar.

## 10. Frontend: GitHubSyncBadge + integración en VersionsPage

10.1. Crear
`src/frontend/components/GitHubSyncBadge.tsx`:
- Props: `{ githubCommitSha: string|null, githubSyncError:
  string|null, hasConnection: boolean, repoFullName: string|null }`.
- Render según matriz de requirements §Frontend.
- Iconos: usar lucide-react (`Github`, `Loader2`, `AlertTriangle`).
- Tooltip: usar shadcn/ui Tooltip ya disponible.
- Mapeo `githubSyncError` → copy:
  - `token_invalid` → "Token inválido. Reconectá GitHub."
  - `insufficient_scope` → "Permisos insuficientes."
  - `repo_missing` → "No encuentro el repo en GitHub."
  - `rate_limited` → "GitHub rate limit. Probá de nuevo en unos minutos."
  - `lock_timeout` → "Sync demorado. Hacé un nuevo save para reintentar."
  - `transient` / `unknown` / default → "Error sincronizando."

10.2. Editar `src/frontend/pages/PromptVersionsPage.tsx` (o el
archivo que liste versiones de un prompt):
- En el `useSWR` de `/api/prompts/:slug/versions`, agregar
  `refreshInterval: pendingExists ? 5000 : 0` donde
  `pendingExists = versions.some(v => v.githubCommitSha === null
  && v.githubSyncError === null)`.
- Pasar `useGitHubConnection()` a la página y derivar
  `hasConnection` y `repoFullName`.
- En cada fila de versión, renderizar `<GitHubSyncBadge ... />`.

10.3. Update del client API DTO type
(`src/frontend/lib/api/prompts.ts` o equivalente) para incluir
los 2 nuevos campos en el type `VersionDTO`.

## 11. Validation pass

11.1. Correr la sequence completa de `validation.md`. Fix issues.

11.2. Pre-push hook (`bun run lint && bun run typecheck && bun run
build && bun test`) verde.

## 12. Commits + PR

12.1. Commits granulares siguiendo `specs/conventions.md` §2:
- `docs(conventions): document .job.ts file suffix for application background services`
- `feat(p11): add github_sync_error column + migration 0006`
- `feat(p11): extend PromptVersion entity with sync error tracking`
- `feat(p11): add Lock port + extend GitHubGateway with commitVersion`
- `feat(p11): extend VersionRepository port with findById + sync state mutators`
- `feat(p11): add renderVersionContent helper (YAML frontmatter)`
- `feat(p11): add CommitVersionToGitHubJob with retries + lock`
- `feat(p11): add BunRedisLock adapter`
- `feat(p11): implement OctokitGitHubAdapter.commitVersion + error mapping`
- `feat(p11): wire job dispatch on save + restore handlers`
- `feat(p11): add GitHubSyncBadge + version list polling`
- `docs(p11): add P11 spec docs (requirements, plan, validation)`

12.2. Abrir PR desde `feat/p11-auto-commit-on-save` →
`feat/p10-github-connect` (o `master` si P10 ya está mergeado al
momento del PR). Incluir en la descripción los puntos clave de la
verificación manual (commit visible en GitHub, badge correcto en
UI).
