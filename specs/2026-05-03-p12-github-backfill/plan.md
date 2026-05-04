# P12 — Backfill GitHub history on late connect · Plan

Numbered task groups. Cada grupo deja la app en estado compilable
(`bun run lint && bun run typecheck && bun test` verde) salvo donde
se indique lo contrario.

## 1. Schema + migration

1.1. Editar `src/infrastructure/persistence/schema/user-github-connection.ts`:
agregar 6 columns nuevas:
```ts
backfillStatus: text("backfill_status"),               // 'pending'|'running'|'completed'|'failed'|null
backfillTotal: integer("backfill_total"),
backfillProcessed: integer("backfill_processed"),
backfillStartedAt: timestamp("backfill_started_at", { mode: "date" }),
backfillFinishedAt: timestamp("backfill_finished_at", { mode: "date" }),
backfillFailureReason: text("backfill_failure_reason"),
```
(Importar `integer` desde `drizzle-orm/pg-core` si no está.)

1.2. `bun run db:generate` → revisar `0007_*.sql`. Debe ser un
único `ALTER TABLE user_github_connection ADD COLUMN ...` por
cada uno de los 6 columns (todos nullable, sin default).

1.3. `bun run db:migrate` contra el Postgres del compose.

1.4. Verificar con `\d user_github_connection` que las 6 columns
existen y son nullable. (`bun run db:psql` si está en `package.json`,
sino `docker compose exec postgres psql -U promptstash -d promptstash`.)

## 2. Domain extension

2.1. Editar `src/domain/github-connection/constants.ts`: agregar
las 3 constants nuevas listadas en requirements §Domain. **Mantener
las existentes intactas** (`REQUIRED_SCOPES`, `REPO_DESCRIPTION`,
etc.).

2.2. Editar `src/domain/github-connection/github-connection.errors.ts`:
agregar
```ts
export class BackfillStateTransitionError extends Error {
  constructor(public readonly from: string | null, public readonly to: string) {
    super(`Cannot transition backfill state from ${from ?? "null"} to ${to}`);
    this.name = "BackfillStateTransitionError";
  }
}
```

2.3. Editar `src/domain/github-connection/github-connection.entity.ts`:
- Definir y exportar `type BackfillStatus = 'pending' | 'running' | 'completed' | 'failed'`.
- Extender `GitHubConnectionRow` y `GitHubConnectionView` con los
  6 fields nuevos (todos nullable).
- Agregar 6 fields privados (`_backfillStatus`, `_backfillTotal`,
  `_backfillProcessed`, `_backfillStartedAt`, `_backfillFinishedAt`,
  `_backfillFailureReason`) al constructor privado al final de la
  param list.
- Ajustar `static create(...)` para inicializar los 6 a null /
  default y pasarlos al constructor.
- Ajustar `static fromRow(row)` para mapear los 6 columns nuevos.
- Agregar getters readonly: `backfillStatus`, `backfillTotal`,
  `backfillProcessed`, `backfillStartedAt`, `backfillFinishedAt`,
  `backfillFailureReason`.
- Agregar 5 métodos de comportamiento con state guards:
  - `markBackfillPending(total: number, now: Date)` — guard:
    current status ∈ {null, 'completed', 'failed'} (permitido
    re-trigger después de un terminal). Throws
    `BackfillStateTransitionError` en caso contrario.
  - `markBackfillRunning(now: Date)` — guard: current === 'pending'.
  - `incrementBackfillProcessed()` — guard: current === 'running'.
  - `markBackfillCompleted(now: Date)` — guard: current === 'running'.
  - `markBackfillFailed(reason: string, now: Date)` — guard:
    current ∈ {'pending', 'running'}.
- Extender `toView()` para incluir los 6 fields. `toJSON()` ya delega
  a `toView()`.

2.4. Tests unitarios en
`src/domain/github-connection/__test__/github-connection.entity.test.ts`
(crear si no existe):
- `create(...)` deja los 6 backfill fields en null.
- `markBackfillPending(15, now)` → status='pending', total=15,
  processed=0, started/finished null.
- `markBackfillPending` desde 'running' throws.
- `markBackfillRunning(now)` → status='running', startedAt=now.
- `incrementBackfillProcessed()` × 3 → processed=3.
- `markBackfillCompleted(now)` → status='completed', finishedAt=now,
  failureReason=null.
- `markBackfillFailed("token_invalid", now)` → status='failed',
  finishedAt=now, failureReason='token_invalid'.
- `markBackfillFailed` desde 'completed' throws.
- `fromRow({...con todos los backfill_* columns...})` reconstituye
  correctamente.
- `toJSON()` incluye los 6 campos.

## 3. Application: ports

3.1. Editar `src/application/ports/github-gateway.port.ts`:
- Agregar el type `GitHubCommitVersionBackdatedInput`:
  ```ts
  export type GitHubCommitVersionBackdatedInput = {
    accessToken: string;
    repoFullName: string;
    branch: string;
    path: string;
    content: string;
    commitMessage: string;
    committedAt: Date;
    authorName: string;
    authorEmail: string;
  };
  ```
- Agregar el método `commitVersionBackdated` a la interface
  `GitHubGateway`. Documentar el contrato (mismo `GitHubCommitGatewayError`
  mapping que `commitVersion`).

3.2. Editar `src/application/ports/github-connection-repository.port.ts`:
- Agregar `updateBackfillState(connection: GitHubConnection): Promise<void>`.
- Agregar `findUnfinishedBackfills(): Promise<GitHubConnection[]>`.

3.3. Editar `src/application/ports/version-repository.port.ts`:
- Agregar:
  ```ts
  findOldestPendingForUser(userId: string): Promise<{
    version: PromptVersion;
    promptName: string;
    promptSlug: string;
  } | null>;
  countPendingForUser(userId: string): Promise<number>;
  ```
- Documentar que "pending" significa
  `github_commit_sha IS NULL AND github_sync_error IS NULL` (excluye
  las que ya fallaron, para evitar loops infinitos).

## 4. Application: render helper refactor

4.1. Editar `src/application/jobs/render-version-content.ts`:
- Agregar `renderVersionContentRaw(name: string, slug: string, version: PromptVersion): string`
  con el cuerpo actual (frontmatter usa los strings).
- Reescribir `renderVersionContent(prompt, version)` como
  `renderVersionContentRaw(prompt.name.value, prompt.slug.value, version)`.
- Exportar ambas.

4.2. Tests existentes en
`src/application/jobs/__test__/render-version-content.test.ts`
deben seguir pasando sin cambios (la firma de `renderVersionContent`
no cambió).

4.3. Agregar 1-2 tests para `renderVersionContentRaw` (sanity de
que produce el mismo output con strings raw).

## 5. Application: BackfillGitHubHistoryJob

5.1. Crear `src/application/jobs/backfill-github-history.job.ts`:
estructura como en requirements §Application. Constructor recibe
los 5 ports + options object opcional ({ backoffsMs, clock, sleep }).

Usar el sleep + acquireWithPoll pattern del job de P11
(`commit-version-to-github.job.ts`) — copiar tal cual o extraer a
un util compartido. **Decisión inicial**: copiar (más simple, evita
abstracción prematura). Marcar TODO si aparece duplicación más
fea en otro job futuro.

Estructura del cuerpo de `run({ userId, force = false })`:

```
1. conn = await connRepo.findByUserId(userId)
   if (!conn) return.
2. status = conn.backfillStatus
   if (status === 'completed' || status === 'failed') return  // ya terminó
   if (status === 'running' && !force) return                  // otro proceso lo lleva
3. total = await versionRepo.countPendingForUser(userId)
4. if (total === 0) {
     conn.markBackfillCompleted(clock.now())
     await connRepo.updateBackfillState(conn)
     return
   }
5. if (status === null) {
     conn.markBackfillPending(total, clock.now())
     await connRepo.updateBackfillState(conn)
     conn.markBackfillRunning(clock.now())
     await connRepo.updateBackfillState(conn)
   }
   // si force && status==='running', ya está running — no transition.
6. accessToken = crypto.decrypt(conn.encryptedAccessToken)
   authorName = conn.githubLogin
   authorEmail = `${conn.githubLogin}@${CONSTANTS.BACKFILL_AUTHOR_EMAIL_DOMAIN}`
7. while (true) {
     next = await versionRepo.findOldestPendingForUser(userId)
     if (!next) break
     ok = await processOne(conn, next, accessToken, authorName, authorEmail)
     if (!ok) return  // fatal error: salimos del job entero
   }
8. conn.markBackfillCompleted(clock.now())
   await connRepo.updateBackfillState(conn)
```

`processOne(conn, next, ...)`:
- lockKey = `gh:commit:${conn.userId}:${next.promptSlug}`.
- token = await acquireWithPoll(lockKey).
- if (!token) → `versionRepo.markGithubSyncFailed(next.version.id, 'lock_timeout')`,
  return true (skipea esta version, sigue el loop).
- try block:
  - path = `prompts/${next.promptSlug}.md`.
  - content = renderVersionContentRaw(next.promptName, next.promptSlug, next.version).
  - commitMessage = `${next.promptName} v${next.version.versionNumber.value}: ${next.version.commitMessage ?? "Save"}`.
  - for (attempt = 0; attempt < backoffsMs.length; attempt++) {
      try {
        { sha } = await gateway.commitVersionBackdated({
          accessToken, repoFullName: conn.repoFullName.value,
          branch: conn.defaultBranch, path, content, commitMessage,
          committedAt: next.version.createdAt, authorName, authorEmail,
        })
        await versionRepo.markGithubCommit(next.version.id, sha)
        conn.incrementBackfillProcessed()
        await connRepo.updateBackfillState(conn)
        return true
      } catch (err) {
        code = err instanceof GitHubCommitGatewayError ? err.code : 'unknown'
        isFatal = (CONSTANTS.BACKFILL_FATAL_ERRORS as readonly string[]).includes(code)
        if (isFatal) {
          await versionRepo.markGithubSyncFailed(next.version.id, code)
          conn.markBackfillFailed(code, clock.now())
          await connRepo.updateBackfillState(conn)
          return false
        }
        isLast = attempt === backoffsMs.length - 1
        if (isLast) {
          await versionRepo.markGithubSyncFailed(next.version.id, code)
          return true  // skipea, sigue el loop
        }
        await sleep(backoffsMs[attempt])
      }
    }
- finally: await lock.release(lockKey, token).

(`CONSTANTS` import desde `@/domain/github-connection/constants`
para `BACKFILL_AUTHOR_EMAIL_DOMAIN` y `BACKFILL_FATAL_ERRORS`.
Backoffs reusan `CONSTANTS.GITHUB_RETRY_BACKOFFS_MS` desde
`@/domain/prompt-version/constants` — son la misma escalera de P11.)

5.2. Tests unitarios
`src/application/jobs/__test__/backfill-github-history.job.test.ts`
con fakes de los 5 ports:

- **No connection** → return inmediato, no toca nada.
- **Status 'completed', no force** → return inmediato sin tocar
  versions ni gateway.
- **Status 'failed', no force** → idem.
- **Status 'running', no force** → return (otro server lo lleva).
- **Status 'running', force=true** → procesa.
- **Empty (0 pending versions)** → marca status='completed', no
  llama gateway nunca.
- **Happy path con 3 versions**:
  - findOldestPendingForUser devuelve v1, v2, v3 en orden, luego null.
  - Cada `gateway.commitVersionBackdated` resuelve con sha distinta.
  - Verificar:
    - 3 calls a `commitVersionBackdated` con `committedAt` correcto
      por version.
    - 3 calls a `markGithubCommit` con shas correctas.
    - `incrementBackfillProcessed` llamado 3 veces.
    - `markBackfillCompleted` llamado al final.
    - Estado final del entity: status='completed', processed=3.
    - `acquireWithPoll` y `release` llamados 3 veces (por commit).
- **Fatal error en el medio**:
  - v1 OK, v2 falla con `token_invalid`.
  - Verificar: `markGithubSyncFailed(v2, 'token_invalid')` +
    `markBackfillFailed('token_invalid', now)` + el job retorna sin
    procesar v3.
- **Transient retry success**:
  - v1: gateway rechaza con 'transient' 2 veces, succeeds en el 3er.
  - Verificar: 1 call a `markGithubCommit` con la sha del 3er attempt.
  - Backoffs inyectados como `[0, 0, 0]`.
- **Transient retry exhausted (3 fails)**:
  - v1: gateway falla 3 veces con 'transient'.
  - Verificar: `markGithubSyncFailed(v1, 'transient')` + el loop
    avanza a v2 (NO marca el backfill como failed, solo este commit).
- **Lock timeout**: `tryAcquire` siempre null para v1.
  - Verificar: `markGithubSyncFailed(v1, 'lock_timeout')` + sigue
    al next.
- **Reconciler force=true**: connection ya en 'running', un total
  preset de 10 con processed=4. El job NO resetea total/processed
  (no llama markBackfillPending/Running) y simplemente procesa
  pendientes desde el current state.
- **Email format correcto**: assertear que la primera call a
  `commitVersionBackdated` recibió
  `authorEmail === '<githubLogin>@users.noreply.github.com'`.

## 6. Infrastructure: gateway commitVersionBackdated

6.1. Editar `src/infrastructure/github/octokit-github.adapter.ts`:
agregar `commitVersionBackdated` con la cadena Git Data API listada
en requirements §Infrastructure.

6.2. Tests unitarios
`src/infrastructure/github/__test__/octokit-github.adapter.test.ts`
(crear si no existe; o extender el de map-commit-error). Mockear
`Octokit` con `mock.module`. Cubrir:
- Happy path: 6 calls en orden correcto, con los args correctos
  (especialmente `author.date` y `committer.date` ISO).
- `git.createBlob` 401 → throws `GitHubCommitGatewayError("token_invalid")`.
- `git.updateRef` 422 → throws `GitHubCommitGatewayError("transient")`.
- (Mismas branches que el test de `commitVersion` de P11, pero
  para cada call de la cadena. Cubrir al menos: error en createBlob,
  error en updateRef.)

## 7. Infrastructure: PostgresGitHubConnectionRepository

7.1. Editar
`src/infrastructure/persistence/repositories/postgres-github-connection.repository.ts`:

- Extender `save(connection)` para incluir los 6 fields nuevos
  tanto en el `values` como en el `set` del `onConflictDoUpdate`.
  En el set, **resetear explícitamente** los 6 a `null` / 0
  (status=null, total=null, processed=null, started_at=null,
  finished_at=null, failure_reason=null). Razón: re-connect debe
  re-arrancar el backfill, no preservar el estado del ciclo
  anterior.

  Para el INSERT inicial (caso "primera connection ever") los
  fields ya quedan null por default del schema; pero pasarlos
  explícitos para claridad y consistencia con el `set`.

- Implementar `updateBackfillState(connection)`:
  ```ts
  await this.db.update(userGithubConnection)
    .set({
      backfillStatus: connection.backfillStatus,
      backfillTotal: connection.backfillTotal,
      backfillProcessed: connection.backfillProcessed,
      backfillStartedAt: connection.backfillStartedAt,
      backfillFinishedAt: connection.backfillFinishedAt,
      backfillFailureReason: connection.backfillFailureReason,
    })
    .where(eq(userGithubConnection.userId, connection.userId));
  ```

- Implementar `findUnfinishedBackfills()`:
  ```ts
  const rows = await this.db.select().from(userGithubConnection)
    .where(inArray(userGithubConnection.backfillStatus, ['pending', 'running']));
  return rows.map(GitHubConnection.fromRow);
  ```

7.2. Tests integración (si el repo de connection ya tiene tests):
- Después de `save()` con una connection con backfill_status='running',
  un nuevo `save()` con otra connection del mismo userId resetea
  los 6 fields a null/defaults.
- `updateBackfillState` solo toca los 6 fields, no `connectedAt` ni
  `encryptedAccessToken`.
- `findUnfinishedBackfills` devuelve solo connections en pending o
  running.

## 8. Infrastructure: PostgresVersionRepository

8.1. Editar
`src/infrastructure/persistence/repositories/postgres-version.repository.ts`:

- Implementar `findOldestPendingForUser(userId)`:
  ```ts
  const rows = await this.db
    .select({ pv: promptVersions, name: prompts.name, slug: prompts.slug })
    .from(promptVersions)
    .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
    .where(and(
      eq(prompts.userId, userId),
      isNull(promptVersions.githubCommitSha),
      isNull(promptVersions.githubSyncError),
    ))
    .orderBy(asc(promptVersions.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    version: PromptVersion.fromRow(row.pv),
    promptName: row.name,
    promptSlug: row.slug,
  };
  ```

- Implementar `countPendingForUser(userId)`:
  ```ts
  const rows = await this.db
    .select({ c: count() })
    .from(promptVersions)
    .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
    .where(and(
      eq(prompts.userId, userId),
      isNull(promptVersions.githubCommitSha),
      isNull(promptVersions.githubSyncError),
    ));
  return Number(rows[0]?.c ?? 0);
  ```
  (Importar `count` desde `drizzle-orm`.)

8.2. Tests integración:
- Setup: 2 prompts del user A con 2 versions cada uno (4 versions
  total), todas con sha=null y syncError=null.
- `countPendingForUser('A')` === 4.
- `findOldestPendingForUser('A')` devuelve la version más vieja
  con su prompt name/slug correctos.
- Marcar la primera con `markGithubCommit` → next call devuelve la
  segunda más vieja.
- Marcar otra con `markGithubSyncFailed` → queda excluida del query
  (count baja, find la skipea).

## 9. HTTP: composition root + dispatch

9.1. Editar `src/interfaces/http/server.ts`:

- Importar `BackfillGitHubHistoryJob`.

- Instanciar después del `commitJob` existente:
  ```ts
  const backfillJob = new BackfillGitHubHistoryJob(
    githubConnectionRepo, versionRepo, githubGateway,
    cryptoAdapter, lock,
  );
  ```

- En el handler del callback OAuth de GitHub
  (`POST /api/integrations/github/callback` o donde se invoca
  `connectGitHubCommand.execute(...)`): después del `await
  connectGitHub.execute(userId, code)`, agregar:
  ```ts
  void backfillJob.run({ userId: user.id, force: false })
    .catch(err => console.error("[backfill-job]", err));
  ```

- En el handler del save (`POST /api/prompts/:slug/versions`) y
  del restore (`POST /api/prompts/:slug/versions/:n/restore`):
  envolver el dispatch del `commitJob` actual con un check de
  backfill busy:
  ```ts
  const conn = await githubConnectionRepo.findByUserId(user.id);
  const backfillBusy = conn?.backfillStatus === "pending"
    || conn?.backfillStatus === "running";
  if (!result.isNoOp && conn && !backfillBusy) {
    void commitJob.run({ ... }).catch(err => console.error(...));
  }
  ```
  Optimización potencial: el handler ya tiene la connection si la
  fetcheó antes para otro propósito; reusar. (Si no, esta query
  agrega una más por save — aceptable, es indexed por PK.)

- **Reconciler on boot**: antes de `Bun.serve(...)`, agregar:
  ```ts
  void (async () => {
    try {
      const unfinished = await githubConnectionRepo.findUnfinishedBackfills();
      for (const conn of unfinished) {
        console.log(`[backfill-reconciler] resuming for user ${conn.userId}`);
        void backfillJob.run({ userId: conn.userId, force: true })
          .catch(err => console.error("[backfill-reconciler]", err));
      }
    } catch (err) {
      console.error("[backfill-reconciler] init failed", err);
    }
  })();
  ```
  (Wrap en `void` async IIFE para que no bloquee el server start.)

## 10. Frontend: settings page con progress

10.1. Editar el type del `GitHubConnectionView` en
`src/frontend/lib/api/integrations.ts` (o donde viva la definición
del cliente; probablemente `src/frontend/hooks/use-github-connection.ts`
inline). Agregar los 6 fields nuevos como nullable.

10.2. Editar `src/frontend/hooks/use-github-connection.ts`:
- En el `useSWR(...)`, derivar `isPolling = data?.backfillStatus
  === 'pending' || data?.backfillStatus === 'running'`.
- Pasar `refreshInterval: isPolling ? 2000 : 0` al SWR config.

10.3. Editar `src/frontend/pages/SettingsIntegrationsPage.tsx`:

- Donde hoy se renderiza el card de "GitHub conectado" agregar
  un sub-componente `<BackfillStatusSection connection={...} />` que:
  - Si `status === null` o (`status === 'completed'` y
    `finishedAt` más viejo que 30s): no renderiza nada.
  - Si `status === 'pending'`: card con spinner + texto
    "Preparing to sync your existing prompts to GitHub…".
  - Si `status === 'running'`: card con
    `<Progress value={Math.round(processed/total*100)} />`
    (componente shadcn/ui Progress) y texto
    "Syncing your history: {processed} of {total} commits".
  - Si `status === 'completed'` y `finishedAt` < 30s: banner verde
    "Sync complete: {total} commits replicated to GitHub".
    Persistir un flag en sessionStorage para no mostrar dos veces
    en la misma sesión:
    ```ts
    const ackKey = `backfill-ack-${connection.userId}-${connection.backfillFinishedAt}`;
    const acked = sessionStorage.getItem(ackKey);
    if (acked) return null;
    // render banner + button "Got it" que setea ackKey.
    ```
  - Si `status === 'failed'`: card de error con copy mapeada
    según `failureReason` (ver requirements §Frontend).

10.4. Si el design system no tiene `Progress` instalado:
`bunx shadcn@latest add progress` (o equivalente). Si ya está,
solo importar.

10.5. Smoke manual del UI:
- Connect GitHub con un user que tenga 0 prompts → no se ve
  ningún backfill UI (sale completed inmediato; banner aparece
  brevemente).
- Connect GitHub con un user que tenga 5 prompts × 2 versions:
  ver el progress card, contador subiendo cada ~2s, y al final
  el banner "Sync complete: 10 commits".

## 11. Validation pass

11.1. Correr la sequence completa de `validation.md`. Fix issues.

11.2. Pre-push hook (`bun run lint && bun run typecheck && bun run
build && bun test`) verde.

## 12. Commits + PR

12.1. Commits granulares siguiendo `specs/conventions.md` §2:
- `feat(p12): add backfill_* columns to user_github_connection + migration 0007`
- `feat(p12): extend GitHubConnection entity with backfill state machine`
- `feat(p12): extend GitHubGateway with commitVersionBackdated`
- `feat(p12): extend repositories with updateBackfillState + findUnfinishedBackfills`
- `feat(p12): extend VersionRepository with findOldestPendingForUser + countPendingForUser`
- `refactor(p12): extract renderVersionContentRaw from renderVersionContent`
- `feat(p12): add BackfillGitHubHistoryJob with idempotent loop`
- `feat(p12): implement OctokitGitHubAdapter.commitVersionBackdated via Git Data API`
- `feat(p12): wire backfill dispatch on connect + suppress P11 dispatch during backfill`
- `feat(p12): add boot reconciler for unfinished backfills`
- `feat(p12): add BackfillStatusSection to /settings/integrations with progress polling`
- `docs(p12): add P12 spec docs (requirements, plan, validation)`

12.2. Abrir PR desde `feat/p12-github-backfill` → `master`. Incluir
en la descripción:
- Resumen del flujo (connect → progress UI → commits backdated en GitHub).
- Screenshot del progress bar in action.
- Confirmación de la verificación manual: 5 prompts × 3 versions
  → 15 commits cronológicos en GitHub con timestamps fieles.
