# P7 — Versionado de prompts · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` healthy.
- Migration nueva aplicada: `bun run db:migrate` muestra
  `0002_*.sql` en el journal.
- Pre-deploy ejecutado:
  `bun run db:psql -- -c "DELETE FROM prompts;"` (limpia P6 test data).
- Sesión activa, tunnel up si aplica.

## Functional checks

### 1. Migration crea tabla `prompt_versions` y FK en `prompts`
```bash
bun run db:psql -- -c "\d prompt_versions" | head -15
# Expected: tabla con id (PK), prompt_id (FK cascade), version_number,
# content, commit_message, github_commit_sha, created_at; UNIQUE
# (prompt_id, version_number).

bun run db:psql -- -c "\d prompts" | grep current_version_id
# Expected: FK a prompt_versions(id) con ON DELETE SET NULL.
```

### 2. POST sin sesión → 401
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3010/api/prompts/foo/versions \
  -H "Content-Type: application/json" -d '{"content":""}'
# Expected: 401
```

### 3. POST sobre prompt inexistente → 404
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" -d '{"content":"x"}' \
  http://localhost:3010/api/prompts/nonexistent/versions
# Expected: 404
```

### 4. POST primera versión → 201 + versionNumber=1
```bash
SLUG=$(curl -s -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
  -d '{"name":"Test V"}' http://localhost:3010/api/prompts | jq -r .slug)

curl -s -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
  -d '{"content":"hello v1","commitMessage":"first"}' \
  http://localhost:3010/api/prompts/$SLUG/versions \
  -w "\nHTTP %{http_code}\n"
# Expected: HTTP 201, body con id (UUID), promptId, versionNumber=1,
# content="hello v1", commitMessage="first", githubCommitSha=null,
# createdAt.
```

### 5. POST mismo content → no-op (200 + header)
```bash
curl -s -i -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
  -d '{"content":"hello v1"}' \
  http://localhost:3010/api/prompts/$SLUG/versions | head -10
# Expected:
# HTTP/1.1 200 OK
# X-Version-NoOp: true
# (body: la version actual, versionNumber sigue siendo 1)
```

### 6. POST distinto content → versionNumber=2
```bash
curl -s -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
  -d '{"content":"hello v2"}' \
  http://localhost:3010/api/prompts/$SLUG/versions | jq .versionNumber
# Expected: 2
```

### 7. GET list → DESC
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/prompts/$SLUG/versions \
  | jq '.[] | .versionNumber'
# Expected: 2, 1 (en ese orden).
```

### 8. GET specific → 200 + version
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/prompts/$SLUG/versions/1 \
  | jq .content
# Expected: "hello v1"
```

### 9. GET inexistente → 404
```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Cookie: $T" \
  http://localhost:3010/api/prompts/$SLUG/versions/99
# Expected: 404
```

### 10. POST restore → 201 + new version con content de target
```bash
curl -s -X POST -H "Cookie: $T" \
  http://localhost:3010/api/prompts/$SLUG/versions/1/restore \
  -w "\nHTTP %{http_code}\n"
# Expected: HTTP 201, body con versionNumber=3,
# content="hello v1", commitMessage="Restore v1"
```

### 11. Restore con content idéntico al current → no-op
- Si después del restore (que dejó current = v3 con content de v1),
  hacés restore de v1 otra vez:
```bash
curl -s -i -X POST -H "Cookie: $T" \
  http://localhost:3010/api/prompts/$SLUG/versions/1/restore | head -5
# Expected: HTTP 200, X-Version-NoOp: true.
```

### 12. `prompts.current_version_id` apunta a la última version
```bash
bun run db:psql -- -c "
SELECT p.slug, pv.version_number FROM prompts p
JOIN prompt_versions pv ON p.current_version_id = pv.id
WHERE p.slug = '$SLUG';
"
# Expected: una fila con version_number = 3.
```

### 13. Atomicidad — version + current se setean juntos
Difícil de verificar end-to-end sin inyectar fallos. Smoke
indirecto: tras una operación cualquiera, no debería haber un
prompt con `current_version_id` apuntando a un id que no existe en
`prompt_versions`:
```bash
bun run db:psql -- -c "
SELECT count(*) FROM prompts p
WHERE p.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM prompt_versions WHERE id = p.current_version_id
  );
"
# Expected: 0
```

### 14. Browser flow completo
- `/` con user (post clean-slate) → empty state de prompts.
- Crear prompt nuevo → detail muestra empty state de versions con
  CTA "Create first version".
- Click → editor abierto con textarea vacío.
- Escribir "hello world", commit msg "first" → Save → v1 aparece
  en sidebar (highlighted como current).
- Editar a "hello v2" → Save → v2 aparece arriba en sidebar,
  v1 sin highlight.
- Click v1 en sidebar → modo viewing: banner "Viewing v1" +
  textarea readonly con "hello world" + botones Restore + Back.
- Click "Restore" → v3 creada, vuelve a modo editor con
  content="hello world", sidebar muestra v3 highlighted.
- Save sin cambiar nada → mensaje "No changes" inline 3s,
  sidebar sin cambios.

### 15. Tests del VO version-number
```bash
bun test src/domain/prompt-version 2>&1 | tail -3
# Expected: pass.
```

## Structural checks

### 16. Hexagonal layers limpios
```bash
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces|react" src/domain
# Expected: empty.
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces" src/application
# Expected: empty.
```

### 17. CQS convention
```bash
grep -lE "^export class [A-Z][A-Za-z]+Command" src/application/commands/*.ts | wc -l
# Expected: 4 (CreatePrompt, DeletePrompt, SaveNewVersion, RestoreVersion).

grep -lE "^export class [A-Z][A-Za-z]+Query" src/application/queries/*.ts | wc -l
# Expected: 5 (GetCurrentUser, GetPromptBySlug, ListPromptsForUser,
#  GetVersion, ListVersions).

grep -E "(class.*Command|class.*Query)" src/application/{commands,queries}/*.ts -A 3 | grep -c "execute("
# Expected: 9.
```

### 18. Archivos creados
- `src/domain/prompt-version/{types,version-number,errors,index}.ts`
- `src/domain/prompt-version/__test__/version-number.test.ts`
- `src/application/ports/version-repository.ts`
- `src/application/commands/{save-new-version,restore-version}.ts`
- `src/application/queries/{get-version,list-versions}.ts`
- `src/infrastructure/persistence/schema/prompt-versions.ts`
- `src/infrastructure/persistence/migrations/0002_*.sql`
- `src/infrastructure/persistence/repositories/postgres-version-repository.ts`
- `src/interfaces/http/schemas/prompt-version.ts`
- `src/frontend/lib/api/versions.ts`
- `src/frontend/hooks/use-versions.ts`
- `src/frontend/components/{PromptEditor,VersionHistory}.tsx`

### 19. PromptDetailPage rewritten
- No incluye más el placeholder "Editor coming next phase".
- Usa `useVersions` y `useVersion`.
- Exporta solo `PromptDetailPage` (sin lógica del placeholder de P6).

### 20. server.ts wires
- 4 nuevas routes Elysia + 3 nuevas entries en `Bun.serve.routes`.
- `versionRepo = new PostgresVersionRepository(db)` y los 4 use
  cases instanciados.

## Non-regression checks

### 21. P0..P6 siguen funcionando
- `bun test` pasa todo (sanity + slug + version-number).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow GitHub + Google sigue.
- `/api/me`, `/health` responden.
- CRUD de prompts (P6) sigue: create, list, get, delete.

### 22. Git limpio
```bash
git status
# Expected: nothing to commit.
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR
(atención a la atomicidad del appendNewVersion y a la circular FK
entre prompts y prompt_versions). Comunicar el step de clean slate
en el PR description.
