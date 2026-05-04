# P11 — Auto-commit on SaveNewVersion · Validation

Pre-condiciones:
- P10 completo y funcional. Connection a GitHub activa para el
  user de prueba (validar con `GET /api/integrations/github` →
  200 con `repoFullName`).
- `docker compose up -d postgres redis` healthy.
- Migration 0006 aplicada (`bun run db:migrate`). Verificar
  `\d prompt_versions` muestra column `github_sync_error`.
- Sesión activa en browser para el user que tiene conexión.
- Al menos 1 prompt creado (sin versiones aún, o con versiones
  pre-P11 — ambos casos).

## Static checks (pre-flight)

```bash
bun run lint        # 0 warnings
bun run typecheck   # 0 errors
bun test            # all pass (incluye job tests + render-content tests)
bun run build       # ok
```

## Functional checks

### 1. Boot del server con migration 0006 aplicada

```bash
bun --hot src/interfaces/http/server.ts
# Expected: arranca sin throw. No nuevas envs requeridas en P11.
```

### 2. Save crea version y commit en GitHub (happy path)

Manual (browser):
1. Login → ir a un prompt existente (o crear uno).
2. Editar content → "Save" con commit message "Test P11 sync".
3. UI debe mostrar la nueva versión en el listado **inmediatamente**
   con un ícono "syncing" (loader / pulsing dot).
4. En 1-3 segundos, el ícono cambia a "synced" (octocat) que
   linkea al commit.
5. Click en el ícono → abre `https://github.com/<repoFullName>/commit/<sha>`.

En GitHub:
- Browse a `<repoFullName>/blob/main/prompts/<slug>.md` →
  contenido empieza con frontmatter:
  ```
  ---
  prompt_name: <name>
  slug: <slug>
  version: <N>
  commit_message: Test P11 sync
  updated_at: 2026-05-03T...
  ---

  <content del prompt>
  ```
- Commit message en el log: `<prompt_name> v<N>: Test P11 sync`.
- Author del commit = el usuario de GitHub (atribuido por el token).

Verificar en DB:
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "SELECT version_number, github_commit_sha, github_sync_error FROM prompt_versions ORDER BY version_number DESC LIMIT 1;"
# Expected:
# - version_number = N
# - github_commit_sha = <40 chars hex>
# - github_sync_error = NULL
```

### 3. Save sin GitHub connection no toca el repo

Setup: con un user **sin** conexión:
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "DELETE FROM user_github_connection WHERE user_id = '<user-sin-conn>';"
```

1. Login con ese user → editar prompt → save.
2. UI: la versión aparece sin ningún ícono GitHub (badge no se
   renderiza cuando `hasConnection === false`).
3. En DB: `github_commit_sha = NULL`, `github_sync_error = NULL`.

### 4. Sin commit duplicado para no-op save

1. Editar el prompt PERO dejar el content idéntico al actual.
2. Click Save.
3. Servidor responde con la versión actual (isNoOp). UI no debe
   mostrar una versión nueva.
4. Verificar en GitHub: NO hay commit nuevo (mirar log del repo).

```bash
gh api repos/<repoFullName>/commits --jq 'length'
# Same count que antes.
```

### 5. Restore dispara commit con la copia restaurada

1. Sobre un prompt con ≥2 versiones, ir a una versión vieja v1.
2. Click "Restaurar".
3. Aparece v(N+1) en el listado, con content == v1.content.
4. Sync icon: "syncing" → "synced".
5. En GitHub: commit con message
   `<prompt_name> v<N+1>: Restore from v1` (o lo que sea que el
   restore command setee como commit_message).
6. `prompts/<slug>.md` ahora tiene el content de v1 con
   frontmatter `version: <N+1>`.

### 6. UI polling: badge se actualiza sin refresh manual

1. Antes del save, verificar via DevTools → Network: no hay
   polling activo a `/api/prompts/:slug/versions`.
2. Click Save → la SWR query empieza a polear cada 5s
   (pestaña Network muestra requests recurrentes).
3. Cuando el commit completa, la siguiente respuesta trae el
   sha; el polling se detiene (pendingExists pasa a false).
4. Si dejás la pestaña abierta sin actividad, NO debe seguir
   poleando (revalidación normal de SWR está bien, pero
   `refreshInterval` debe ser 0).

### 7. Concurrencia: dos saves seguidos al mismo prompt

1. En la consola del browser, programar dos POST consecutivos
   (sin await entre ellos):
   ```js
   await Promise.all([
     fetch("/api/prompts/<slug>/versions", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({content: "v_a", commitMessage: "A"}) }),
     fetch("/api/prompts/<slug>/versions", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({content: "v_b", commitMessage: "B"}) }),
   ])
   ```
2. Ambos responden 201 inmediato (uno con vN, otro con vN+1).
3. Eventualmente ambos badges pasan a "synced" (esperar
   ~5-10s).
4. En GitHub: 2 commits nuevos, **secuenciales**, ninguno con
   error 409/422. El segundo lleva la SHA del primero como
   parent.
5. `prompts/<slug>.md` final tiene el content del segundo save
   (vN+1).

### 8. Failure path: token revocado externamente

1. En GitHub, ir a Settings → Applications → Authorized OAuth
   Apps → revocar el de promptstash.
2. Volver a la app y hacer save.
3. UI: la versión aparece con icon "syncing", luego transiciona
   a icon "warning" con tooltip "Token inválido. Reconectá
   GitHub.".
4. En DB:
   ```sql
   SELECT github_commit_sha, github_sync_error
   FROM prompt_versions WHERE id = '<id>';
   ```
   `github_commit_sha = NULL`, `github_sync_error = "token_invalid"`.
5. Verificar logs del server: 1 sola intento al gateway (no
   retry para non-retryable).

Limpieza: re-conectar GitHub vía `/settings/integrations` y
hacer un save nuevo para validar que la recuperación funciona
(badge nuevo == "synced").

### 9. Failure path: repo borrado externamente

1. En GitHub borrar el repo `promptstash-<login>`.
2. Save en la app.
3. Badge → warning con tooltip "No encuentro el repo en GitHub.".
4. DB: `github_sync_error = "repo_missing"`.

Limpieza: hacer disconnect + reconnect → P10 recrea el repo, y
saves siguientes funcionan.

### 10. Failure path: simular fallo transient con retries

Difícil de reproducir manualmente. Cubierto por test unitario en
`src/application/jobs/__test__/commit-version-to-github.job.test.ts`:

- Fake gateway: `commitVersion` rechaza con
  `GitHubCommitGatewayError("transient")` 3 veces.
- Job (con backoffs `[0, 0, 0]` inyectados) ejecuta 3 attempts.
- `markGithubSyncFailed("transient")` se llama una vez.
- `markGithubCommit` nunca se llama.

```bash
bun test src/application/jobs
# Expected: pass
```

### 11. Frontmatter parseable

```bash
gh api /repos/<repoFullName>/contents/prompts/<slug>.md \
  --jq '.content' | base64 -d | head -10
# Expected: las primeras líneas son un bloque YAML válido entre ---.
```

Probar con un parser real (opcional):
```bash
gh api /repos/<repoFullName>/contents/prompts/<slug>.md \
  --jq '.content' | base64 -d | yq '.frontmatter.version'
# o usar Python: python -c "import frontmatter, sys; print(frontmatter.loads(sys.stdin.read()).metadata)"
# Expected: el version_number correcto.
```

### 12. View incluye los nuevos campos

```bash
curl -s -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/prompts/<slug>/versions | jq '.[0]'
# Expected JSON keys incluye: githubCommitSha, githubSyncError.
```

### 13. Lock release: no leak después de un fail

Después de simular un fallo (tests unitarios o §8), el lock no
debe quedar tomado. Verificar manualmente:

```bash
docker compose exec -T redis redis-cli KEYS "gh:commit:*"
# Expected: vacío (todos los locks released o expirados por TTL).
```

### 14. Crash entre persist y dispatch (informational)

(Documentar más que validar.) Si el server muere exactamente
entre `INSERT prompt_versions` y `void commitJob.run()`, esa
versión queda con `sha=null, error=null` para siempre. Tests
unitarios no cubren esto. Aceptable para V1; mitigación futura
en P12 con un reconciler al boot.

## Acceptance / merge gate

- [ ] Static checks (lint+typecheck+test+build) verdes.
- [ ] §2 happy path completado: commit visible en GitHub con
      frontmatter correcto.
- [ ] §3 user sin connection: save no toca GitHub, no errores.
- [ ] §4 no-op save no genera commit.
- [ ] §5 restore commitea correctamente.
- [ ] §6 polling se inicia/detiene según pendingExists.
- [ ] §7 concurrencia: 2 saves seguidos producen 2 commits
      secuenciales sin conflicto.
- [ ] §8 token revocado: error correcto persistido y mostrado.
- [ ] §9 repo borrado: error correcto persistido y mostrado.
- [ ] §10 retry path cubierto por test unitario.
- [ ] §11 frontmatter es YAML parseable.
- [ ] §12 API expone los 2 nuevos campos.
- [ ] §13 locks de Redis se liberan correctamente.
- [ ] `specs/conventions.md` actualizado documentando `.job.ts`.
- [ ] Pre-push hook verde antes de pushear el branch.

Nada de lo siguiente es necesario para mergear (queda para P12+):
- Reconciliation pass al boot para versiones huérfanas.
- Backfill cronológico de versiones pre-P11.
- Botón "Re-sync" manual en la UI.
- Detección + UI flow de reconexión automática para
  `token_invalid`.
