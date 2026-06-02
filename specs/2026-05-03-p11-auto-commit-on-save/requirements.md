# P11 — Auto-commit on SaveNewVersion · Requirements

## Why this phase

Refer: `specs/roadmap.md` → P11. P10 dejó conectado el repo
`prompteando-<login>` en GitHub. P11 cierra el loop del flagship
differentiator: cada `Save` en la app deja **un commit en TU repo**
sin que el usuario tenga que hacer nada.

Después de P11:
- Versionar un prompt en prompteando ⇒ commit en GitHub.
- El historial del repo es leíble como markdown: cada archivo
  `prompts/<slug>.md` es la última versión + frontmatter, y el
  `git log` cuenta el versionado.
- Si GitHub falla, **Postgres nunca se bloquea** — el save siempre
  responde 201, y el commit se reintenta en background.

P12 (backfill) y P13 (export) quedan fuera de scope acá.

## Decisiones tomadas (sesión 2026-05-03)

1. **Async fire-and-forget.** `POST /api/prompts/:slug/versions`
   persiste a Postgres, devuelve 201 inmediato con
   `githubCommitSha: null`, y dispara un job en background. La UI
   detecta el estado "syncing" por `(connection conectada) ∧
   (githubCommitSha == null) ∧ (githubSyncError == null)` y hace
   polling vía SWR (`refreshInterval: 5000`) hasta que sha está
   set o el error aparece. Razón: HTTP nunca debe bloquearse por
   GitHub. Latencia humana del save = latencia de PG.

2. **YAML frontmatter + content.** El archivo commiteado se ve así:
   ```markdown
   ---
   prompt_name: My Prompt
   slug: my-prompt
   version: 4
   commit_message: Tweaked the system message
   updated_at: 2026-05-03T21:30:00Z
   ---

   <content del prompt acá>
   ```
   Razón: el repo es self-documenting. Sin abrir la app, el usuario
   ve qué versión es, qué cambió, cuándo. GitHub renderiza el
   frontmatter en colapsado por default (no afea el preview).

3. **Lock en Redis por `(userId, slug)`.** Los commits del mismo
   prompt se serializan con un lock distribuido en Redis
   (`SET key token NX PX <ttl>`, release con Lua CAS). Razón: la
   API de GitHub `createOrUpdateFileContents` requiere la SHA
   actual del archivo; dos commits concurrentes al mismo path
   pelean por la SHA. Serializar evita el conflicto. Bonus:
   funciona multi-instance del server (futureproof).

4. **Retries 1s/3s/9s con backoff.** Si el call a GitHub falla
   (network, 5xx, secondary rate limit), reintentar 3 veces total
   con backoff exponencial. Después del tercero: persist
   `github_sync_error = <razón breve>` y log warning. No throw
   (estamos en background).

5. **Errores no-retriables se registran y abortan.**
   - `401 Unauthorized` (token inválido) → `github_sync_error =
     "token_invalid"`. No retry. Futuro P11.5: gatillar UI para
     reconectar.
   - `403 Forbidden` con scope insuficiente → `github_sync_error =
     "insufficient_scope"`. No retry.
   - `404 Not Found` del repo → `github_sync_error = "repo_missing"`.
     No retry. (Usuario borró el repo manualmente.)

6. **Restore reusa el path.** `POST /versions/:n/restore` ya
   funciona como "save de una versión vieja como vN+1". El commit
   de la versión nueva sobreescribe `prompts/<slug>.md` con el
   content viejo. Commit message:
   `<prompt_name> v<N+1>: Restore from v<n>`.

7. **Sin connection ⇒ no-op.** Si el usuario nunca conectó GitHub
   (o desconectó), el job sale temprano — `github_commit_sha` y
   `github_sync_error` quedan ambos null para esa versión. La UI
   no muestra ningún ícono GitHub para esas versiones.

## In scope

### Domain

- **Sin entity nueva.** `PromptVersion` ya tiene
  `attachGithubCommit(sha)` (P7). Agregar:
  - Field `_githubSyncError: string | null` en el constructor
    privado + getter `githubSyncError`.
  - Método `markGithubSyncFailed(error: string)`.
  - `static fromRow` y `static create` aceptan / inicializan el
    nuevo campo.
  - `toJSON()` incluye `githubSyncError`.

- **`src/domain/prompt-version/constants.ts`** (nuevo o extendido):
  ```ts
  export const CONSTANTS = {
    GITHUB_COMMIT_PATH_PREFIX: "prompts",
    GITHUB_COMMIT_PATH_EXT: ".md",
    GITHUB_LOCK_TTL_MS: 30_000,
    GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS: 30_000,
    GITHUB_LOCK_ACQUIRE_POLL_MS: 500,
    GITHUB_RETRY_BACKOFFS_MS: [1_000, 3_000, 9_000],
    NON_RETRYABLE_ERRORS: ["token_invalid", "insufficient_scope", "repo_missing"],
  } as const;
  ```

- **Errores nuevos** en `prompt-version.errors.ts`:
  - `GitHubCommitFailedError(reason)` — para tests / observabilidad.
  - No se throwea en producción (job es fire-and-forget); solo
    cuando un test lo necesite asertar.

### Application

- **Ports nuevos**:
  - `src/application/ports/lock.port.ts`:
    ```ts
    export interface Lock {
      // returns release token if acquired, null if NOT acquired
      tryAcquire(key: string, ttlMs: number): Promise<string | null>;
      release(key: string, token: string): Promise<void>;
    }
    ```

- **Port extendido**: `GitHubGateway` (`github-gateway.port.ts`)
  agrega:
  ```ts
  commitVersion(input: {
    accessToken: string;
    repoFullName: string;
    branch: string;
    path: string;            // "prompts/<slug>.md"
    content: string;         // ya con frontmatter
    commitMessage: string;
  }): Promise<{ sha: string }>;
  ```
  Implementación interna: `getContent` para fetch SHA actual del
  archivo (404 → undefined), después `createOrUpdateFileContents`
  con `sha?` opcional.

  Errores: el adapter mapea HTTP a una excepción tipada
  `GitHubCommitGatewayError` con `code:
  "token_invalid" | "insufficient_scope" | "repo_missing" |
  "rate_limited" | "transient" | "unknown"`. Solo `transient` y
  `rate_limited` son retriables.

- **Port extendido**: `VersionRepository`:
  ```ts
  markGithubCommit(versionId: string, sha: string): Promise<void>;
  markGithubSyncFailed(versionId: string, error: string): Promise<void>;
  ```

- **Nuevo job** (no es Command/Query — es un application service
  background). File:
  `src/application/jobs/commit-version-to-github.job.ts`:
  ```ts
  export class CommitVersionToGitHubJob {
    constructor(
      private readonly connRepo: GitHubConnectionRepository,
      private readonly promptRepo: PromptRepository,
      private readonly versionRepo: VersionRepository,
      private readonly gateway: GitHubGateway,
      private readonly crypto: CryptoPort,
      private readonly lock: Lock,
      private readonly clock: { now(): Date },
    ) {}

    async run(input: {
      userId: string;
      promptId: string;
      versionId: string;
    }): Promise<void> { ... }
  }
  ```
  Único método público: `run(input)`. Naming `*.job.ts` se
  documenta como nuevo file suffix en `conventions.md` (ver
  task 11.0).

  Lógica:
  1. `conn = await connRepo.findByUserId(userId)`. Si null →
     return (no hay conexión).
  2. `prompt = await promptRepo.findById(promptId)`. Si null →
     return (race con delete).
  3. `version = await versionRepo.findById(versionId)`. Si null
     → return.
  4. `lockKey = "gh:commit:" + userId + ":" + prompt.slug.value`.
     Acquire con poll-loop hasta `GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS`.
     Si no se obtiene: `markGithubSyncFailed(versionId,
     "lock_timeout")`.
  5. Try block:
     a. `accessToken = crypto.decrypt(conn.encryptedAccessToken)`.
     b. Render `content = renderFrontmatter(prompt, version)`.
     c. `path = "prompts/" + prompt.slug.value + ".md"`.
     d. `commitMessage = prompt.name.value + " v" +
        version.versionNumber.value + ": " + (version.commitMessage
        ?? "Save")`.
     e. Loop con backoffs:
        - call `gateway.commitVersion({...})` →
          `markGithubCommit(versionId, sha)`. Return.
        - catch `GitHubCommitGatewayError`:
          - si `code` ∈ `NON_RETRYABLE_ERRORS` →
            `markGithubSyncFailed(versionId, code)`. Return.
          - si último intento → `markGithubSyncFailed(versionId,
            code ?? "unknown")`. Return.
          - sino: `await sleep(backoff)`.
  6. Finally: `lock.release(lockKey, token)`.

- **`SaveNewVersionCommand` no cambia su signature ni su contrato.**
  El handler HTTP es quien dispara el job (separación
  application↔interfaces). Razón: el use case no debería conocer
  ni a `Lock` ni al `Job`. La política "después de save, dispará
  commit" es de la capa interfaces (composición). Los tests
  unitarios del Command no se rompen.

- **`RestoreVersionCommand`**: idem. El handler dispara el mismo
  job después de que el command devuelva la nueva versión.

### Infrastructure

- **`BunRedisLock`** en
  `src/infrastructure/cache/bun-redis-lock.adapter.ts`:
  ```ts
  export class BunRedisLock implements Lock {
    constructor(private readonly redis: ReturnType<typeof getRedis>) {}

    async tryAcquire(key: string, ttlMs: number): Promise<string | null> {
      const token = crypto.randomUUID();
      const ok = await this.redis.send("SET", [key, token, "NX", "PX", String(ttlMs)]);
      return ok === "OK" ? token : null;
    }

    async release(key: string, token: string): Promise<void> {
      // CAS via Lua: solo borra si el value matchea token
      const lua = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
      await this.redis.send("EVAL", [lua, "1", key, token]);
    }
  }
  ```

- **`OctokitGitHubAdapter.commitVersion`**:
  ```ts
  async commitVersion(input): Promise<{ sha: string }> {
    const [owner, repo] = input.repoFullName.split("/");
    const octokit = new Octokit({ auth: input.accessToken });
    let existingSha: string | undefined;
    try {
      const cur = await octokit.repos.getContent({
        owner, repo, path: input.path, ref: input.branch,
      });
      if (!Array.isArray(cur.data) && "sha" in cur.data) {
        existingSha = cur.data.sha;
      }
    } catch (err) {
      if (this.statusOf(err) !== 404) {
        throw this.mapError(err);
      }
      // 404 = file doesn't exist yet → first commit, sha undefined.
    }
    try {
      const res = await octokit.repos.createOrUpdateFileContents({
        owner, repo, path: input.path,
        message: input.commitMessage,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: existingSha,
      });
      return { sha: res.data.commit.sha! };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): GitHubCommitGatewayError {
    const status = this.statusOf(err);
    if (status === 401) return new GitHubCommitGatewayError("token_invalid");
    if (status === 403) {
      // Distinguir secondary rate limit de scope/forbidden por header.
      const msg = String((err as Error).message ?? "");
      if (/secondary rate limit/i.test(msg)) {
        return new GitHubCommitGatewayError("rate_limited");
      }
      return new GitHubCommitGatewayError("insufficient_scope");
    }
    if (status === 404) return new GitHubCommitGatewayError("repo_missing");
    if (status === 409 || status === 422) return new GitHubCommitGatewayError("transient");
    if (status && status >= 500) return new GitHubCommitGatewayError("transient");
    return new GitHubCommitGatewayError("unknown");
  }
  ```

- **`PostgresVersionRepository`** extiende:
  ```ts
  async markGithubCommit(versionId, sha) {
    await db.update(promptVersions)
      .set({ githubCommitSha: sha, githubSyncError: null })
      .where(eq(promptVersions.id, versionId));
  }
  async markGithubSyncFailed(versionId, error) {
    await db.update(promptVersions)
      .set({ githubSyncError: error })
      .where(eq(promptVersions.id, versionId));
  }
  ```
  Y `findById`. `fromRow` mapea el nuevo column.

- **Schema migration**:
  ```sql
  ALTER TABLE prompt_versions
    ADD COLUMN github_sync_error text;
  ```
  (`github_commit_sha` ya existe desde P7.)

### HTTP

- **Cambios en handlers existentes**, no rutas nuevas:
  - `POST /api/prompts/:slug/versions` (Save):
    - Después de `await saveNewVersion.execute(...)`:
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
  - `POST /api/prompts/:slug/versions/:n/restore`:
    - Idem: dispatch del job después de que `restoreVersion`
      devuelva la nueva versión.

- **`GET /api/prompts/:slug/versions`** (ListVersions): incluir
  en el DTO los campos `githubCommitSha` y `githubSyncError` (ya
  vienen en la entity). El DTO `VersionView` se extiende.

### Frontend

- **Nuevo componente** `GitHubSyncBadge.tsx` que recibe
  `{ githubCommitSha, githubSyncError, hasConnection, repoFullName }`:
  - `!hasConnection` → null (no muestra nada).
  - `githubCommitSha` set → ícono GitHub linkeando a
    `https://github.com/<repoFullName>/commit/<sha>` con tooltip
    "Synced".
  - `!githubCommitSha && !githubSyncError` → ícono spinner /
    pulsing dot con tooltip "Syncing to GitHub…".
  - `!githubCommitSha && githubSyncError` → ícono warning con
    tooltip mostrando el error mapeado a copy human-readable.

- **`PromptVersionsPage`** (existente): integrar el badge en cada
  fila de versión. SWR del listado de versiones agrega
  `refreshInterval: 5000` **solo si** hay al menos una versión
  con `(githubCommitSha == null && githubSyncError == null)` —
  cuando ninguna está pendiente, deja de polear.

- **Hook `useGitHubConnection`** (P10) ya existe. Reusarlo en la
  página para tener `repoFullName` y `hasConnection` y pasarlos
  al badge.

### Conventions update

- Documentar nuevo file suffix `.job.ts` en `conventions.md` §9 y
  en `tech-stack.md` (sección Architecture). Job =
  application-layer service no-CQS (no es Command ni Query, no
  tiene resultado pedido por un caller — es disparado por
  composición).

## Out of scope (deferred)

- **P12 — Backfill cronológico** de prompts existentes al
  conectar GitHub tarde. Lo único que P11 deja preparado: el job
  funciona idempotente y es invocable por el comando de backfill.
- **Retry manual desde la UI** (botón "Re-sync" en una versión
  failed). En V1 el usuario hace un nuevo save (cambio mínimo,
  e.g. agregar/sacar un espacio) o desconecta+reconecta. Si se
  pide post-V1, agregar `POST /api/prompts/:slug/versions/:id/sync-github`.
- **Detección automática de token revocado** + UI de reconexión.
  Parcialmente cubierto: `github_sync_error = "token_invalid"`
  queda persistido y visible en la UI; el flujo activo de
  reconexión es P11.5.
- **Webhooks de GitHub** para detectar cambios externos al repo.
- **Compresión/diff** de commits (commits siempre full content).
- **Branching / PRs** (siempre commit directo a default branch).
- **Rate limit propio** del job ante un usuario que spammea
  saves. GitHub ya rate-limita; en V1 confiamos.
- **Worker dedicado** o queue persistente. V1 usa Promise
  background. Si el server crashea entre `save persist` y `job
  dispatch`, esa versión queda con sha=null y error=null
  permanente. Aceptable en V1 — P12 podría incluir un
  "reconciliation pass" al boot que escanee versiones huérfanas.

## Risks / open items

- **Crash entre persist y dispatch**: si el server muere
  exactamente entre `INSERT prompt_versions` y `void
  commitJob.run(...)`, la versión queda en estado "pending"
  permanente (sha null, error null). La UI mostrará "Syncing…"
  para siempre. Mitigación V1: copy en la UI sugiere "si pasa
  más de 1min en Syncing, hacé un nuevo save". Mitigación
  futura: outbox + reconciler.
- **Lock holder muere durante backoff**: cubierto por TTL del
  lock (30s). Otro job acquire-poll lo agarra después.
- **GitHub secondary rate limit**: agresivo (puede bannear por
  ~1h). Mitigación: backoffs largos (1/3/9s) + serialización por
  prompt evita ráfagas. Si sucede, `github_sync_error =
  "rate_limited"` y el usuario re-saves manual.
- **Tamaño del archivo**: GitHub tiene límite de 100MB por blob.
  Prompts realistas son <100KB, no es un problema en V1.
- **Race con disconnect**: usuario hace save, dispara job, antes
  que termine el job hace disconnect. El job ya tiene en memoria
  el `accessToken` desencriptado, va a commitear igual. Aceptable
  — el commit se efectúa pero la connection está borrada.
  Próximos saves no commitean. No se vuelve a usar el token.
