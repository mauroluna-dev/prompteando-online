# P12 — Backfill GitHub history on late connect · Validation

Pre-condiciones:
- P11 mergeado y funcional. `bun run db:migrate` aplicó hasta
  migration 0006.
- `docker compose up -d postgres redis` healthy.
- Migration 0007 aplicada (`bun run db:migrate` después de
  generarla). Verificar `\d user_github_connection` muestra los 6
  columns nuevos:
  - `backfill_status text`
  - `backfill_total integer`
  - `backfill_processed integer`
  - `backfill_started_at timestamp`
  - `backfill_finished_at timestamp`
  - `backfill_failure_reason text`
- 1 user de prueba en la app, sin GitHub conectado actualmente
  (si ya conectó, hacer disconnect desde `/settings/integrations`).
- Ese user tiene **5 prompts**, cada uno con **3 versions**
  (creadas con saves espaciados). Si no tiene, crear con script o
  manualmente.
- El repo `prompteando-<login>` en GitHub: si ya existía de un
  ciclo anterior, **borrarlo** desde la UI de GitHub para tener un
  estado limpio (commits fresh-start).

## Static checks (pre-flight)

```bash
bun run lint        # 0 warnings
bun run typecheck   # 0 errors
bun test            # all pass (incluye backfill job tests + entity tests)
bun run build       # ok
```

## Functional checks

### 1. Boot del server con migration 0007 aplicada

```bash
bun --hot src/interfaces/http/server.ts
# Expected: arranca sin throw. No nuevas envs requeridas en P12.
# Logs deben incluir el reconciler init (vacío en este boot, por
# ahora no hay backfills unfinished):
#   [backfill-reconciler] resuming for user ... (si hay)
#   o silencio (si no hay).
```

### 2. Connect GitHub con historial pre-existente → backfill arranca

Setup: el user tiene 5 prompts × 3 versions = 15 versions con
`github_commit_sha = NULL` y `github_sync_error = NULL` en BD.

Verificar pre-state:
```bash
docker compose exec -T postgres psql -U prompteando -d prompteando -c "
  SELECT COUNT(*) AS pending
  FROM prompt_versions pv
  JOIN prompts p ON p.id = pv.prompt_id
  WHERE p.user_id = '<user-id>'
    AND pv.github_commit_sha IS NULL
    AND pv.github_sync_error IS NULL;
"
# Expected: 15
```

Acción:
1. Ir a `/settings/integrations` en el browser.
2. Click "Conectar GitHub" → consent → callback.
3. Inmediatamente después del redirect, la página muestra el card
   de connection + un section nuevo:
   "Syncing your history: X of 15 commits" con barra de progreso.
4. La barra avanza sola sin refrescar (X sube de 0 a 15 en
   ~30-60s, dependiendo de la latencia con GitHub).

Verificar en BD durante el progreso:
```bash
docker compose exec -T postgres psql -U prompteando -d prompteando -c "
  SELECT backfill_status, backfill_total, backfill_processed,
         backfill_started_at, backfill_finished_at, backfill_failure_reason
  FROM user_github_connection
  WHERE user_id = '<user-id>';
"
# Expected mid-flight:
# backfill_status = 'running'
# backfill_total = 15
# backfill_processed sube monotónicamente: 0, 1, 2, ..., 15
# backfill_started_at = timestamp de connect
# backfill_finished_at = NULL
# backfill_failure_reason = NULL
```

### 3. Backfill termina y banner de éxito aparece

Cuando `backfill_processed === backfill_total === 15`:
1. La UI cambia el card a banner verde:
   "Sync complete: 15 commits replicated to GitHub" + botón "Got it".
2. El SWR polling se detiene (DevTools → Network: ya no hay
   requests a `/api/integrations/github` cada 2s).
3. En BD:
   ```sql
   backfill_status = 'completed'
   backfill_total = 15
   backfill_processed = 15
   backfill_finished_at = <timestamp ~ahora>
   backfill_failure_reason = NULL
   ```
4. Click "Got it" → banner desaparece. Refresh de la página → no
   reaparece (sessionStorage flag).

### 4. Repo en GitHub tiene 15 commits cronológicos backdated

```bash
gh api "repos/<repoFullName>/commits?per_page=100" --jq '
  [.[] | { sha: .sha[0:7], message: .commit.message,
           author_date: .commit.author.date,
           committer_date: .commit.committer.date,
           author_name: .commit.author.name }]
  | reverse
'
```

Verificaciones:
- **15 commits + el commit de README inicial** (P10) = 16 totales,
  o 15 si el README fue inline al ensure (chequear cuál fue el caso
  en P10).
- Los 15 backfill commits tienen:
  - `author_date` y `committer_date` matching los `created_at`
    originales de cada `prompt_version` (en orden cronológico
    ascendente).
  - `author_name` = github login del usuario.
  - `message` = `<prompt_name> v<N>: <commit_message ?? "Save">`.
- En la UI de GitHub (`https://github.com/<repoFullName>/commits/main`),
  los commits están ordenados temporalmente correctos (no todos
  apretujados en el mismo timestamp del backfill).

### 5. Estructura de archivos en el repo es correcta

```bash
gh api "repos/<repoFullName>/contents/prompts" --jq '[.[] | .name]'
# Expected: ["<slug-1>.md", "<slug-2>.md", ..., "<slug-5>.md"]

# Para uno cualquiera:
gh api "repos/<repoFullName>/contents/prompts/<slug-1>.md" \
  --jq '.content' | base64 -d
# Expected: frontmatter YAML + content de la VERSIÓN MÁS RECIENTE
# (v3) del prompt 1, no v1 ni v2 (porque cada commit reescribe el
# archivo completo; el último commit del prompt 1 es v3).
```

### 6. Idempotencia: re-trigger no crea commits duplicados

(Solo si querés validar la idempotencia per-version sin pasar por
disconnect+reconnect, ejecutar manualmente desde la consola del
server o un script bun. Saltar este check si es engorroso de
producir.)

```bash
# Forzar re-run del job desde un script (con force=false):
# Esperado: el job sale temprano porque status='completed'.
bun run scripts/run-backfill.ts <user-id> false  # si el script existe
# Expected: log "[backfill] skipped, status=completed" o equivalente.
```

Resultado: el conteo de commits en GitHub no cambia.

### 7. Disconnect + reconnect resetea el backfill

1. Borrar el repo `prompteando-<login>` en GitHub manualmente
   (para que la prueba sea limpia).
2. En `/settings/integrations`, click "Disconnect".
   - BD: `user_github_connection` row eliminada.
3. Verificar en BD que las 15 versions vuelven a quedar como
   "pending":
   ```sql
   UPDATE prompt_versions SET github_commit_sha = NULL, github_sync_error = NULL
   WHERE id IN (SELECT id FROM prompt_versions pv
                JOIN prompts p ON p.id=pv.prompt_id
                WHERE p.user_id='<user-id>');
   ```
   (Esto simula manualmente el "reset" — en la práctica del usuario
   real, el disconnect del repo ya destruyó los commits, pero
   las shas en BD no se borran solas. Documentar como gotcha
   secundario.)
4. Click "Conectar GitHub" → repite todo el flujo §2-§5.
5. Resultado esperado: nuevo repo, 15 commits backdated, todo OK.

### 8. Save durante backfill: la nueva version NO se commitea por P11

Este es el test de la suspensión de P11 durante el backfill.

Setup: empezar un backfill grande (15+ versions). Mientras está
running:

1. En otra pestaña, abrir un prompt y hacer un save (creando v4
   de un prompt que tenía 3).
2. En la UI de versions de ese prompt, la nueva version aparece
   con badge "syncing" (loader).
3. Verificar en BD inmediatamente:
   ```sql
   SELECT id, version_number, github_commit_sha, github_sync_error
   FROM prompt_versions
   WHERE prompt_id = '<prompt-id>' ORDER BY version_number DESC LIMIT 1;
   ```
   - `version_number = 4`
   - `github_commit_sha = NULL`
   - `github_sync_error = NULL`
4. **No debe haber un commit individual en GitHub para v4 todavía**
   (el dispatch de P11 fue suprimido).
5. Esperar a que el backfill llegue a v4 (es la más reciente, será
   la última procesada). Cuando lo procesa: badge cambia a "synced",
   commit aparece en GitHub con timestamp del save (no del backfill,
   porque `committedAt = version.createdAt` que es el timestamp del
   save).
6. Total final de commits en GitHub = `total inicial al connect + 1`
   (el v4 nuevo).

Verificar en BD final:
```sql
SELECT backfill_total, backfill_processed FROM user_github_connection
WHERE user_id = '<user-id>';
-- Expected: total y processed pueden diferir
-- (total snapshot del COUNT al inicio, processed cuenta cada commit
-- real). El v4 nuevo sumó +1 a processed pero NO a total. UI puede
-- mostrar "16 of 15" momentáneamente — aceptable bug menor para V1.
```

(Si esto molesta visualmente, se puede recapear el total dentro del
loop antes de mostrarlo. Out of scope V1.)

### 9. Failure path: token revocado durante el backfill

1. Empezar un backfill (≥10 versions pending).
2. Cuando processed ~ 3-5, ir a GitHub → Settings → Applications
   → Authorized OAuth Apps → revocar prompteando.
3. En el siguiente commit del backfill, el gateway responde 401.
4. UI eventualmente muestra:
   - El card de progreso desaparece.
   - Aparece card de error: "We lost permission to commit to your
     repo. Disconnect and reconnect to retry."
5. En BD:
   ```sql
   backfill_status = 'failed'
   backfill_failure_reason = 'token_invalid'
   backfill_finished_at = <timestamp>
   ```
6. La version en la que se falló tiene
   `github_sync_error = 'token_invalid'`.
7. Las versions posteriores quedan con sha=null y syncError=null
   (no se procesaron).

Limpieza: disconnect + reconnect → nuevo backfill arranca.

### 10. Failure path: repo borrado durante el backfill

1. Empezar backfill con 10 versions.
2. Cuando processed ~ 3, borrar el repo desde GitHub.
3. Próximo commit responde 404.
4. BD: `backfill_status = 'failed'`, `backfill_failure_reason = 'repo_missing'`.
5. UI: card de error con copy "We can't find the repo on GitHub.
   Did you delete it? Disconnect and reconnect to recreate."

Limpieza: disconnect + reconnect → P10 recrea el repo, P12 hace el
backfill desde cero.

### 11. Reconciler on boot retoma backfill interrumpido

1. Empezar un backfill (≥20 versions). En el medio (processed ~ 5),
   matar el server (`Ctrl+C`).
2. En BD:
   ```sql
   SELECT backfill_status, backfill_processed FROM user_github_connection
   WHERE user_id = '<user-id>';
   -- backfill_status = 'running'
   -- backfill_processed = 5 (o donde haya quedado)
   ```
3. Verificar que en GitHub hay solo los 5 commits.
4. Re-arrancar el server: `bun --hot src/interfaces/http/server.ts`.
5. En los logs:
   ```
   [backfill-reconciler] resuming for user <user-id>
   ```
6. Volver al browser, refrescar `/settings/integrations`. La UI
   muestra el card de progreso reactivado, contador retomando
   desde 5.
7. Esperar al final → status='completed', total commits en GitHub = 20.

### 12. Caso vacío: connect con 0 prompts

1. User nuevo, sin prompts. Conecta GitHub.
2. Backfill se dispara, evalúa `countPendingForUser = 0`, marca
   `status='completed'` inmediatamente.
3. UI no debe mostrar el banner "Sync complete: 0 commits"
   (decidir: si lo mostramos, es ruido; si no, código condicional
   `if total > 0`).
   **Decisión durante implementación**: NO mostrar banner si
   `total === 0`. Documentar.
4. BD final: `status='completed', total=0, processed=0`.

### 13. Concurrencia: backfill + save tras backfill completed

1. Connect → backfill 15 versions → completed.
2. UI: banner "Sync complete" → click "Got it".
3. Edit prompt → Save → nueva version v4.
4. P11 dispatch funciona normal: badge "syncing" → "synced".
5. En GitHub: commit nuevo con `committedAt = ahora`, NO backdated
   (P11 path).
6. Total commits en GitHub = 16.

### 14. Frontmatter de commits backdated es válido

Mismo check que P11 §11:
```bash
gh api /repos/<repoFullName>/contents/prompts/<slug>.md \
  --jq '.content' | base64 -d | head -10
# Expected: las primeras líneas son YAML válido entre ---.
```

Verificar que el `version_number` en frontmatter coincide con la
versión cuyo content fue committeado al final (la más reciente del
prompt).

### 15. Author/committer identity correctos

```bash
gh api "repos/<repoFullName>/commits?per_page=5" --jq '
  [.[] | { author: .commit.author, committer: .commit.committer }]
'
# Expected: cada commit tiene
#   author.name = <github_login>
#   author.email = "<github_login>@users.noreply.github.com"
#   committer.{name,email} = same
```

En la UI de GitHub: el avatar del usuario aparece junto a cada
commit (gracias al formato `users.noreply.github.com`).

### 16. View incluye los nuevos campos

```bash
curl -s -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/integrations/github | jq
# Expected JSON keys incluye:
#   backfillStatus, backfillTotal, backfillProcessed,
#   backfillStartedAt, backfillFinishedAt, backfillFailureReason.
```

### 17. SWR polling se prende y apaga correctamente

1. Mientras `backfillStatus='running'`: DevTools Network muestra
   un request a `/api/integrations/github` cada ~2s.
2. Cuando `status='completed'`: el polling para (no más requests
   recurrentes).
3. Refresh de la página después de completed: 1 request inicial,
   no polling.

### 18. Lock release: no leak

Mismo check que P11 §13:
```bash
docker compose exec -T redis redis-cli KEYS "gh:commit:*"
# Expected: vacío después de un backfill completed.
```

### 19. Tests unitarios cubren branches críticas

```bash
bun test src/application/jobs/backfill-github-history
bun test src/domain/github-connection
bun test src/infrastructure/github
# Expected: todos passing.
```

Cobertura mínima a inspeccionar:
- Empty case (0 pending) → completed inmediato.
- Happy path 3 versions.
- Fatal error (token_invalid).
- Transient retry success.
- Transient retry exhausted (skipea, sigue).
- Lock timeout (skipea).
- Force=true vs force=false en estado 'running'.
- State machine transitions del entity (todos los guards).

## Acceptance / merge gate

- [ ] Static checks (lint+typecheck+test+build) verdes.
- [ ] §2 connect dispara backfill, UI muestra progreso, contador
      avanza.
- [ ] §3 backfill termina, banner de éxito aparece, polling se
      detiene.
- [ ] §4 GitHub tiene N commits con `author_date` y `committer_date`
      backdated correctos al `created_at` original.
- [ ] §5 estructura de files en repo es `prompts/<slug>.md`,
      contenido = última versión por prompt.
- [ ] §7 disconnect + reconnect resetea y re-corre el backfill.
- [ ] §8 saves durante backfill quedan pendientes y son procesados
      por el loop, no por P11.
- [ ] §9 token revocado → status='failed' + UI con copy correcto.
- [ ] §10 repo borrado → status='failed' + UI con copy correcto.
- [ ] §11 reconciler on boot retoma backfill interrumpido.
- [ ] §12 caso vacío (0 prompts) → status='completed' sin banner.
- [ ] §13 backfill completed → P11 vuelve a funcionar normal en
      saves nuevos.
- [ ] §15 author/committer identity = github login + noreply email.
- [ ] §16 API expone los 6 nuevos campos.
- [ ] §17 SWR polling on/off correcto.
- [ ] §18 Locks de Redis se liberan.
- [ ] §19 Tests unitarios cubren branches críticas.
- [ ] Pre-push hook verde antes de pushear el branch.

Nada de lo siguiente es necesario para mergear (queda para fases
futuras o backlog):
- Botón manual "Re-sync" en `/settings/integrations`.
- Per-prompt detail del progreso.
- Auto-detection y UI flow de reconnect para `token_invalid`.
- Notificación external (email/push) al terminar el backfill.
- Reconciliation pass que también re-procese versions con
  `github_sync_error` setteado (V1 las skipea para evitar loop).
