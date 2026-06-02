# P12 — Backfill GitHub history on late connect · Requirements

## Why this phase

Refer: `specs/roadmap.md` → P12. P10 conectó GitHub. P11 commitea
cada nuevo `Save` automáticamente. Pero los usuarios que crearon
prompts ANTES de conectar GitHub no tienen su historial replicado:
sus versiones quedan en Postgres con `github_commit_sha = null` para
siempre.

P12 resuelve eso: cuando un usuario conecta GitHub por primera vez,
se replica todo su historial existente al repo `prompteando-<login>`,
en orden cronológico, con timestamps fieles al `created_at` original.

Después de P12:
- El repo refleja el historial real del usuario en `git log`, no
  "todo committeado el día que conectó".
- Si el usuario tiene 5 prompts × 3 versiones, el repo tiene 15
  commits chronologically ordered.
- La UI en `/settings/integrations` muestra progreso "Syncing X of
  Y commits…" durante el backfill.
- Saves nuevos durante el backfill no compiten con él — quedan
  encolados y los procesa el mismo loop.

P11.5 (token revocado UI), retry manual desde UI, y backfill
incremental selectivo quedan fuera de scope.

## Decisiones tomadas (sesión 2026-05-03)

1. **Auto-trigger en el primer connect.** Tras un
   `ConnectGitHubCommand` exitoso (cuando se persiste una connection
   nueva con `backfillStatus = null`), el handler HTTP dispara
   `BackfillGitHubHistoryJob.run({ userId })` en background. Si el
   usuario reconecta después de un disconnect, **se vuelve a
   correr** — disconnect borra la connection (P10), por lo tanto la
   próxima connection es "primera" desde el punto de vista del
   schema. Razón: match al roadmap, mínima fricción para el usuario,
   y disconnect+reconnect funciona como "reset" natural sin botón
   nuevo.

2. **Timestamps fieles via Git Data API.** Cada commit del backfill
   se construye con la secuencia: `git.createBlob` → `git.getRef`
   → `git.getCommit` → `git.createTree` → `git.createCommit` (con
   `author.date` y `committer.date` = `prompt_version.created_at`)
   → `git.updateRef`. GitHub muestra estos commits con la fecha
   original tanto en "authored on" como en el orden de `git log`
   (committer date). Razón: el diferenciador del producto es "TU
   historial REAL en TU repo". Un git log con todos los commits
   del mismo segundo no cumple esa promesa.

3. **Idempotencia per-version vía `github_commit_sha`.** El backfill
   itera `prompt_versions WHERE user_id = $1 AND github_commit_sha
   IS NULL ORDER BY created_at ASC`. Si crashea a mitad, al
   re-disparar el job sigue desde la primera version sin sha.
   `user_github_connection` solo guarda contadores agregados
   (`backfill_status`, `backfill_total`, `backfill_processed`,
   `backfill_started_at`, `backfill_finished_at`) — no una tabla
   de jobs. Razón: la fuente de verdad del "qué falta" ya existe
   en `prompt_versions.github_commit_sha`. Tabla nueva sería duplicar
   estado.

4. **P11 dispatch suspendido durante backfill.** Mientras
   `connection.backfillStatus IN ('pending', 'running')`, el handler
   de save NO dispara `CommitVersionToGitHubJob`. La nueva versión
   se persiste con `sha = null`; el backfill loop la levanta en su
   próxima iteración. Razón: P11 commits the file as "latest content"
   (overwrite). Si P11 commitea v5 mientras backfill está en v3, el
   posterior commit de v3/v4 por backfill **sobreescribe** v5 en el
   archivo (aunque git log conserve los 5 commits, el HEAD del
   archivo quedaría en v3). Suspender P11 durante backfill evita la
   carrera. El loop del job re-fetchea pendientes después de cada
   commit, así que nuevas versiones creadas durante el backfill
   también se procesan en orden.

5. **Re-fetch loop, no snapshot.** El job no toma una lista al
   principio y la itera. Itera con `fetchNextPending(userId)` →
   `null` cuando no quedan. Esto:
   - Permite procesar versions creadas DURANTE el backfill (por
     saves del usuario en otra pestaña).
   - Garantiza orden cronológico estricto incluso con concurrencia.
   - El loop termina cuando ya no hay pendientes.

6. **Author/committer identity = el GitHub login del usuario.**
   `name = githubLogin`, `email = "<githubLogin>@users.noreply.github.com"`
   (formato privacy de GitHub que GitHub atribuye al avatar correcto
   sin filtrar email real). Razón: zero config, no necesitamos
   pedirle al usuario su email, y GitHub renderiza el avatar.

7. **Lock per-prompt reusado de P11.** El backfill toma el mismo
   lock `gh:commit:<userId>:<slug>` que P11 antes de cada commit.
   Como P11 está suspendido durante backfill, no hay contención real
   con P11. Pero el lock es necesario igual para serializar commits
   del mismo prompt entre instancias múltiples del server (multi-
   instance future-proofing) y entre el reconciler-on-boot y el
   trigger normal.

8. **Reconciler al boot.** En `server.ts`, después de instanciar el
   job, escanear `user_github_connection WHERE backfill_status IN
   ('pending', 'running')` y re-disparar el job para cada uno
   (fire-and-forget). Si el server crashea durante un backfill, el
   próximo boot lo retoma. Razón: el job es idempotente
   (per-version sha skip), entonces re-disparar es seguro.

9. **Backoff y retries por commit, igual que P11.** Cada commit
   individual usa la misma escalera `[1s, 3s, 9s]` ante errores
   `transient` o `rate_limited`. Errores no-retriables del commit
   (`token_invalid`, `insufficient_scope`, `repo_missing`)
   **abortan el backfill entero** (no solo ese commit) y marcan
   `backfill_status = 'failed'` + `backfill_failure_reason = code`
   en la connection. Razón: los 3 errores no-retriables son del
   nivel de la conexión, no de un commit puntual — sin token /
   scope / repo, ningún commit subsiguiente va a funcionar.

10. **Status agregado en la connection.** Estados:
    - `null` (default): nunca corrió backfill (connection recién
      creada por P10 antes de que P12 esté deployado, o connection
      pre-P12).
    - `'pending'`: scheduled, todavía no arrancó.
    - `'running'`: en progreso.
    - `'completed'`: terminado OK.
    - `'failed'`: abortó por error fatal de la conexión. La razón
      vive en `backfill_failure_reason` (string).

## In scope

### Domain

- **`GitHubConnection` entity extendida** (`src/domain/github-connection/github-connection.entity.ts`):
  - 5 fields nuevos al constructor privado:
    - `_backfillStatus: BackfillStatus | null`
    - `_backfillTotal: number | null`
    - `_backfillProcessed: number | null`
    - `_backfillStartedAt: Date | null`
    - `_backfillFinishedAt: Date | null`
    - `_backfillFailureReason: string | null`
  - Type `BackfillStatus = 'pending' | 'running' | 'completed' | 'failed'`.
  - Getters readonly para los 6 fields.
  - Métodos de comportamiento:
    - `markBackfillPending(total: number, now: Date): void`
      → status `'pending'`, total set, processed `0`, started/finished
      null. Solo permitido si status actual es `null` (no re-trigger
      sobre completed/running sin reset previo).
    - `markBackfillRunning(now: Date): void` → status `'running'`,
      `started_at = now`. Solo desde `'pending'`.
    - `incrementBackfillProcessed(): void` → `processed += 1`. Solo
      desde `'running'`.
    - `markBackfillCompleted(now: Date): void` → status `'completed'`,
      `finished_at = now`, `failure_reason = null`. Solo desde
      `'running'`.
    - `markBackfillFailed(reason: string, now: Date): void` → status
      `'failed'`, `finished_at = now`, `failure_reason = reason`.
      Permitido desde `'pending'` o `'running'`.
  - `static create(...)` inicializa los 6 nuevos fields a null.
  - `static fromRow(row)` mapea los 6 nuevos columns.
  - `toView()` y `toJSON()` exponen los nuevos fields como
    `backfillStatus`, `backfillTotal`, `backfillProcessed`,
    `backfillStartedAt`, `backfillFinishedAt`, `backfillFailureReason`.
  - `GitHubConnectionRow` type extendido con los 6 columns nuevos.
  - `GitHubConnectionView` type extendido con los 6 fields nuevos.

- **Errores nuevos** en `src/domain/github-connection/github-connection.errors.ts`:
  - `BackfillStateTransitionError(from, to)` — para los guards de
    los métodos de comportamiento. Throws en tests; en producción
    el job ya garantiza el orden, así que no se debería ver.

- **Constants extendidos** en `src/domain/github-connection/constants.ts`:
  ```ts
  // ya existentes...
  BACKFILL_PROGRESS_POLL_MS: 2_000,         // UI polling rate
  BACKFILL_AUTHOR_EMAIL_DOMAIN: "users.noreply.github.com",
  BACKFILL_FATAL_ERRORS: ["token_invalid", "insufficient_scope", "repo_missing"] as const,
  ```

### Application

- **Port extendido**: `GitHubGateway` (`github-gateway.port.ts`)
  agrega un método nuevo:
  ```ts
  /**
   * Backdated commit using Git Data API. The commit's author_date
   * and committer_date are both set to `committedAt`. The file is
   * created/updated atomically as a new commit on top of the
   * branch's current HEAD. Throws GitHubCommitGatewayError on
   * failure (same code mapping as commitVersion).
   */
  commitVersionBackdated(input: {
    accessToken: string;
    repoFullName: string;
    branch: string;
    path: string;
    content: string;
    commitMessage: string;
    committedAt: Date;
    authorName: string;
    authorEmail: string;
  }): Promise<{ sha: string }>;
  ```

- **Port extendido**: `GitHubConnectionRepository`
  (`github-connection-repository.port.ts`):
  ```ts
  /** Atomic update of just the backfill_* fields. */
  updateBackfillState(connection: GitHubConnection): Promise<void>;
  /** Find connections currently in pending/running state, for boot reconciler. */
  findUnfinishedBackfills(): Promise<GitHubConnection[]>;
  ```
  Razón: `save()` (P10) reescribe TODOS los fields incluyendo
  `connectedAt`, lo cual no queremos durante updates de progreso.
  `updateBackfillState` solo toca los 6 fields nuevos.

- **Port extendido**: `VersionRepository`:
  ```ts
  /**
   * Returns the oldest pending version for the user, plus the parent
   * prompt's name+slug, or null when none remain. Pending = the row
   * has no github_commit_sha. Used by the backfill loop.
   */
  findOldestPendingForUser(userId: string): Promise<{
    version: PromptVersion;
    promptName: string;
    promptSlug: string;
  } | null>;
  ```
  Razón: el backfill necesita prompt name/slug junto a la version
  para construir el commit. Hacerlo en una sola query (JOIN) es más
  eficiente que `findById(promptId)` por cada uno.

- **Nuevo job**: `src/application/jobs/backfill-github-history.job.ts`
  ```ts
  export class BackfillGitHubHistoryJob {
    constructor(
      private readonly connRepo: GitHubConnectionRepository,
      private readonly versionRepo: VersionRepository,
      private readonly gateway: GitHubGateway,
      private readonly crypto: CryptoPort,
      private readonly lock: Lock,
      options?: { backoffsMs?, clock?, sleep? },
    ) {}

    async run(input: { userId: string }): Promise<void>;
  }
  ```
  Lógica:
  1. `conn = connRepo.findByUserId(userId)`. Si null → return.
  2. Si `conn.backfillStatus IN ('completed', 'failed', 'running')` → return
     (otro proceso o ya terminó). Excepción: `'running'` ES un
     re-trigger desde el reconciler-on-boot; en ese caso continuamos.
     **Decisión**: distinguir con un flag `force: boolean = false` en
     el input. Reconciler pasa `force: true`. Trigger normal pasa
     `false`. Si está `running` y `!force` → return (otro server lo
     está procesando). Si está `running` y `force` → continuar.
  3. `total = SELECT COUNT(*) FROM prompt_versions WHERE user_id = $1
     AND github_commit_sha IS NULL`. (Nueva query en
     `VersionRepository.countPendingForUser(userId): Promise<number>`.)
  4. Si `total === 0` → mark `completed` y return (caso: usuario que
     conecta sin haber creado nada).
  5. `conn.markBackfillPending(total, now)` →
     `connRepo.updateBackfillState(conn)`.
  6. `conn.markBackfillRunning(now)` →
     `connRepo.updateBackfillState(conn)`.
  7. `accessToken = crypto.decrypt(conn.encryptedAccessToken)`.
  8. Loop:
     - `next = versionRepo.findOldestPendingForUser(userId)`. Si null
       → break.
     - `lockKey = "gh:commit:" + userId + ":" + next.promptSlug`.
     - `token = await acquireWithPoll(lockKey)`. Si null → marcar
       `failed("lock_timeout")` y return.
     - try:
       - `path = "prompts/" + next.promptSlug + ".md"`.
       - `content = renderVersionContent({ name: next.promptName,
         slug: next.promptSlug, version: next.version })`.
         (Refactor: `renderVersionContent` actual recibe `Prompt`
         entity; necesitamos overload o nueva firma que reciba
         `{ name, slug }` para evitar fetchear el Prompt entity
         entero.)
       - `commitMessage = next.promptName + " v" +
         next.version.versionNumber.value + ": " +
         (next.version.commitMessage ?? "Save")`.
       - Loop con backoffs (1s/3s/9s):
         - `gateway.commitVersionBackdated({ ..., committedAt:
           next.version.createdAt, authorName: conn.githubLogin,
           authorEmail: conn.githubLogin + "@users.noreply.github.com" })`
           → on success: `versionRepo.markGithubCommit(next.version.id,
           sha)`. break loop.
         - on `GitHubCommitGatewayError`:
           - si `code IN BACKFILL_FATAL_ERRORS` → `conn.markBackfillFailed(code, now)`,
             `connRepo.updateBackfillState(conn)`,
             `versionRepo.markGithubSyncFailed(next.version.id, code)`,
             release lock, return (sale del job entero).
           - si último intento → `versionRepo.markGithubSyncFailed(...)`,
             continuar al next pending (no abortamos por un commit
             transient en el medio; simplemente lo skipeamos y queda
             marcado como failed individual; backfill sigue).
           - sino: `await sleep(backoff)`.
     - finally: `lock.release(lockKey, token)`.
     - `conn.incrementBackfillProcessed()` →
       `connRepo.updateBackfillState(conn)`. (Update por iteración —
       UI poll lo refleja casi en tiempo real.)
  9. `conn.markBackfillCompleted(now)` → `connRepo.updateBackfillState(conn)`.

- **`SaveNewVersionCommand` handler en `interfaces/http`**: agregar
  guard antes del dispatch del `CommitVersionToGitHubJob`:
  ```ts
  const conn = await connRepo.findByUserId(user.id);
  const backfillBusy = conn?.backfillStatus === "pending"
    || conn?.backfillStatus === "running";
  if (!result.isNoOp && conn && !backfillBusy) {
    void commitJob.run({ ... });
  }
  // Si backfillBusy: la version queda con sha=null + syncError=null;
  // el backfill loop la procesará en su próximo fetch.
  ```
  Aplicar el mismo guard al handler de restore.

- **`renderVersionContent` refactor**: extender para aceptar también
  un input `{ name: string, slug: string, version: PromptVersion }`
  o crear una segunda función `renderVersionContentRaw(name, slug,
  version)`. La función actual queda intacta para no romper P11.
  **Decisión**: nueva función `renderVersionContentRaw` en el mismo
  archivo; `renderVersionContent` (P11) se reescribe como
  `renderVersionContentRaw(prompt.name.value, prompt.slug.value, version)`.

### Infrastructure

- **`OctokitGitHubAdapter.commitVersionBackdated`** en
  `src/infrastructure/github/octokit-github.adapter.ts`. Implementación
  con la cadena Git Data API:
  ```ts
  async commitVersionBackdated(input): Promise<{ sha: string }> {
    const [owner, repo] = input.repoFullName.split("/") as [string, string];
    const octokit = new Octokit({ auth: input.accessToken });
    try {
      // 1) Create blob with file content.
      const { data: blob } = await octokit.git.createBlob({
        owner, repo,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      // 2) Get current ref → current commit sha.
      const { data: ref } = await octokit.git.getRef({
        owner, repo, ref: `heads/${input.branch}`,
      });
      const parentSha = ref.object.sha;
      // 3) Get current commit → its tree sha.
      const { data: parentCommit } = await octokit.git.getCommit({
        owner, repo, commit_sha: parentSha,
      });
      // 4) Create new tree based on parent tree, with file replaced.
      const { data: tree } = await octokit.git.createTree({
        owner, repo,
        base_tree: parentCommit.tree.sha,
        tree: [{
          path: input.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        }],
      });
      // 5) Create commit with backdated author + committer.
      const isoDate = input.committedAt.toISOString();
      const { data: commit } = await octokit.git.createCommit({
        owner, repo,
        message: input.commitMessage,
        tree: tree.sha,
        parents: [parentSha],
        author: { name: input.authorName, email: input.authorEmail, date: isoDate },
        committer: { name: input.authorName, email: input.authorEmail, date: isoDate },
      });
      // 6) Move ref to new commit.
      await octokit.git.updateRef({
        owner, repo, ref: `heads/${input.branch}`, sha: commit.sha,
      });
      return { sha: commit.sha };
    } catch (err) {
      throw mapCommitError(err);
    }
  }
  ```
  Reusa `mapCommitError` existente del P11.

- **`PostgresGitHubConnectionRepository`** extendido:
  - `updateBackfillState(connection)`: UPDATE solo de los 6 columns
    nuevos WHERE user_id = connection.userId.
  - `findUnfinishedBackfills()`: `SELECT * WHERE backfill_status
    IN ('pending', 'running')` → map a entities.
  - `save(connection)`: extender para incluir los 6 fields nuevos
    en el INSERT (con sus defaults `null` / `0`) y en el
    `onConflictDoUpdate` set. **Cuidado**: el upsert de connect ya
    pisa `connectedAt` con `now`; si reconectamos, los backfill
    fields deben volver a null para que el job arranque de nuevo.
    Solución: incluir explícitamente `backfillStatus: null,
    backfillTotal: null, ...` en el `set` del upsert (reset on
    reconnect).

- **`PostgresVersionRepository`** extendido:
  - `findOldestPendingForUser(userId)`:
    ```sql
    SELECT pv.*, p.name as prompt_name, p.slug as prompt_slug
    FROM prompt_versions pv
    JOIN prompts p ON p.id = pv.prompt_id
    WHERE p.user_id = $1 AND pv.github_commit_sha IS NULL
    ORDER BY pv.created_at ASC
    LIMIT 1;
    ```
    Map a `{ version, promptName, promptSlug }` con
    `PromptVersion.fromRow(...)`.
  - `countPendingForUser(userId)`:
    ```sql
    SELECT COUNT(*) FROM prompt_versions pv
    JOIN prompts p ON p.id = pv.prompt_id
    WHERE p.user_id = $1 AND pv.github_commit_sha IS NULL;
    ```

- **Schema migration** (0007):
  ```sql
  ALTER TABLE user_github_connection
    ADD COLUMN backfill_status text,
    ADD COLUMN backfill_total integer,
    ADD COLUMN backfill_processed integer,
    ADD COLUMN backfill_started_at timestamp,
    ADD COLUMN backfill_finished_at timestamp,
    ADD COLUMN backfill_failure_reason text;
  ```
  Sin enum custom — usar `text` con CHECK constraint opcional, pero
  para V1 el chequeo de valores válidos vive en el entity.

### HTTP

- **`POST /api/integrations/github/callback`** (handler existente del
  ConnectGitHubCommand): después de `connectGitHub.execute(...)`,
  disparar `void backfillJob.run({ userId: user.id, force: false })
  .catch(err => console.error("[backfill]", err))`.
  Solo si la connection es nueva — pero como el comando hace upsert
  con reset de backfill fields, siempre disparar es OK (job es
  guard-protected: si `status === 'completed'` y no es force, sale
  temprano; pero acá viene de un upsert que reseteó a null, así que
  arranca).

- **`GET /api/integrations/github`** (handler existente): el
  `connection.toView()` ya incluye los 6 fields nuevos por el
  cambio en `GitHubConnection.toJSON()`. No requiere cambios extra
  en el handler. La response shape pasa de:
  ```json
  { "userId": "...", "githubLogin": "...", "repoFullName": "...", "defaultBranch": "...", "connectedAt": "..." }
  ```
  a:
  ```json
  { ...todos los anteriores...,
    "backfillStatus": "running",
    "backfillTotal": 15,
    "backfillProcessed": 7,
    "backfillStartedAt": "2026-05-03T22:01:00Z",
    "backfillFinishedAt": null,
    "backfillFailureReason": null }
  ```

- **Composition root** (`src/interfaces/http/server.ts`):
  - Instanciar `BackfillGitHubHistoryJob`.
  - Inyectarlo donde corresponda en el handler del callback.
  - **Reconciler on boot**: después de instanciar, antes de
    `Bun.serve(...)`:
    ```ts
    void (async () => {
      const unfinished = await githubConnectionRepo.findUnfinishedBackfills();
      for (const conn of unfinished) {
        console.log(`[backfill-reconciler] resuming for user ${conn.userId} (status=${conn.backfillStatus})`);
        void backfillJob.run({ userId: conn.userId, force: true })
          .catch(err => console.error("[backfill-reconciler]", err));
      }
    })();
    ```

### Frontend

- **Hook `useGitHubConnection`** (existente): el response type
  `GitHubConnectionView` se extiende con los 6 fields nuevos. Type
  declarations en `src/frontend/lib/api/integrations.ts` (o donde
  vivan) actualizados. Sin cambios de runtime al hook salvo
  `refreshInterval`:
  ```ts
  const isPolling = data?.backfillStatus === "pending"
    || data?.backfillStatus === "running";
  return useSWR("/api/integrations/github", fetcher, {
    refreshInterval: isPolling ? 2000 : 0,
  });
  ```

- **`SettingsIntegrationsPage`** (`src/frontend/pages/SettingsIntegrationsPage.tsx`):
  - Cuando `connection.backfillStatus === 'pending'`: tarjeta
    "Preparing to sync your existing prompts to GitHub…" + spinner.
  - Cuando `connection.backfillStatus === 'running'`: tarjeta
    "Syncing your history: X of Y commits" + ProgressBar
    (`processed / total * 100`).
  - Cuando `connection.backfillStatus === 'completed'` y
    `connection.backfillFinishedAt` está dentro de los últimos 30s:
    toast/banner "Sync complete: N commits replicated to GitHub"
    (mostrarse 1 sola vez — usar sessionStorage o flag local que
    matchee con el `finished_at` timestamp).
  - Cuando `connection.backfillStatus === 'failed'`: tarjeta de
    error con copy según `backfillFailureReason`:
    - `token_invalid` → "We lost permission to commit to your repo.
      Disconnect and reconnect to retry."
    - `insufficient_scope` → "Insufficient permissions. Disconnect
      and reconnect granting the `repo` scope."
    - `repo_missing` → "We can't find the `<repoFullName>` repo on
      GitHub. Did you delete it? Disconnect and reconnect to recreate."
    - `lock_timeout` / otros → "Sync failed: <reason>. Disconnect
      and reconnect to retry."
  - Cuando `connection.backfillStatus === null` o `'completed'`
    (fuera de la ventana de "recién terminó"): no mostrar nada
    relacionado a backfill (la página queda como hoy con sus otros
    elementos).

- **Sin cambios en `PromptVersionsPage`**. El badge de P11 ya
  funciona correctamente: mientras backfill corre, las versions
  viejas tienen `sha = null, syncError = null`, lo que el badge
  muestra como "syncing". Cuando backfill las commitea, el badge
  pasa a "synced". Bonus emergente sin código nuevo.

## Out of scope (deferred)

- **Botón "Re-sync" manual** desde `/settings/integrations`. En V1
  el usuario hace disconnect + reconnect para re-disparar. Si se
  pide post-V1: agregar `POST /api/integrations/github/backfill`
  que valide `backfillStatus IN ('failed', 'completed')` antes de
  resetear y re-disparar.
- **Per-prompt detail de progreso** (mostrar qué prompt está
  siendo committeado ahora). V1 solo muestra el agregado.
- **Backfill en modo "incremental selectivo"** (sólo prompts X e
  Y). V1 es all-or-nothing.
- **Throttling** del loop para evitar pegarle a GitHub demasiado
  rápido. GitHub primary rate limit es 5000 req/h por user, y cada
  commit son 6 calls. Para 100 versions = 600 calls = bien dentro
  del límite. Si aparece secondary rate limit, los retries de
  cada commit ya lo manejan (`rate_limited` es retryable).
- **Reordenamiento del repo si el orden está roto** (caso edge:
  user que ya tenía P11-commits y ahora corre backfill por re-
  trigger). V1 no se mete en ese caso porque backfill solo se
  dispara post-disconnect+reconnect, lo cual deja el repo intacto
  pero la connection desde cero, sin commits previos en el ciclo
  actual del job. (El repo en GitHub sí tiene commits viejos del
  ciclo anterior, pero eso es estado del usuario, no nuestro.)
- **Notificación por email/push** al terminar el backfill. V1 es
  in-app only.
- **Pausar el backfill desde la UI**. No.
- **Logging estructurado / progreso en /metrics**. No en V1.

## Risks / open items

- **Repos pre-existentes con commits viejos**: si un usuario ya
  tenía un repo `prompteando-<login>` por una connection vieja
  (pre-P12), reconectarse va a backfillear sobre commits previos.
  Resultado: el git log queda con commits viejos (no-backdated)
  ANTES de los nuevos backdated. Aceptable para V1 — es exactamente
  lo que el usuario tenía + lo nuevo.
- **Versions con `created_at` futuro o cero**: poco probable, pero
  si una version tiene timestamp absurdo, GitHub lo acepta igual y
  el commit aparece "in the future" o "in 1970". No vale la pena
  validar — el problema sería upstream en P6/P7.
- **`secondary rate limit` durante backfill**: agresivo. Mitigación:
  retries con backoff hasta 9s. Si pasan los 3 intentos →
  `markGithubSyncFailed(versionId, "rate_limited")` y seguimos al
  next. El usuario ve el progreso continuar; las versions skipeadas
  quedan visibles con badge "warning" en `PromptVersionsPage`. Para
  recovery del rate limit: el reconciler-on-boot las re-procesará si
  status sigue en 'running', PERO `findOldestPendingForUser` retorna
  ASCending por `created_at`, así que ya pasamos por ellas. **Edge
  case real**: una version con sync error individual queda con
  `sha=null` y `syncError=rate_limited`. La query
  `findOldestPendingForUser` la sigue devolviendo (filtro es solo
  por `sha IS NULL`), entonces el loop la reintenta automáticamente
  en la siguiente vuelta. **Bug potencial**: loop infinito si el
  error es persistente. Mitigación: dentro del loop, si una version
  falla, marcar `syncError` Y avanzar (NO volver a procesarla en
  esta corrida). Implementación: cambiar `findOldestPendingForUser`
  para excluir `WHERE github_sync_error IS NULL` también (solo
  procesa "nunca tocadas"). Las que tienen `syncError` quedan para
  un próximo trigger (otro disconnect+reconnect).
  **Decisión**: incluir `AND github_sync_error IS NULL` en
  `findOldestPendingForUser`. Documentar en plan.
- **Reconciler vs trigger normal race**: si el server bootea mientras
  un trigger normal ya está corriendo en otra instancia, ambos
  intentan correr. Mitigación: `force: true` del reconciler permite
  que entre aunque status sea 'running'; el lock per-prompt de Redis
  serializa los commits individuales. El contador `processed` puede
  duplicarse (dos increments por commit) — bug menor que afecta
  solo la UI. Aceptable para V1; documentado.
- **Encryption key rotation**: si la `ENCRYPTION_KEY` cambia entre
  el connect y el backfill, `crypto.decrypt` falla. Mismo problema
  que P11; no es nuevo. Out of scope.
- **Branch protection en el repo del usuario**: si el usuario activó
  branch protection en `main`, el `git.updateRef` falla. Resultado:
  `mapCommitError` lo mapea a `transient` o `unknown` y el commit
  falla. Skipeamos esa version y seguimos. UI muestra error en cada
  badge. Out of V1 — el usuario que pone branch protection sabe lo
  que hace.
