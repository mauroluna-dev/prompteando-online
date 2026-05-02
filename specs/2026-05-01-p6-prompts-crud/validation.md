# P6 — Prompts CRUD · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` (healthy).
- Migration nueva aplicada: `bun run db:migrate` muestra
  `0001_*.sql` en el journal.
- `.env` completo, sesión activa en browser, tunnel up si aplica.

## Functional checks

### 1. Migration crea tabla `prompts`
```bash
bun run db:psql -- -c "\d prompts" | head -20
```
Expected: tabla con columnas `id`, `user_id`, `name`, `slug`,
`description`, `current_version_id`, `created_at`, `updated_at`,
unique constraint `(user_id, slug)`, FK `user_id → users.id` con
`ON DELETE CASCADE`.

### 2. POST /api/prompts sin sesión → 401
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3010/api/prompts \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'
# Expected: 401
```

### 3. POST /api/prompts con body inválido → 400
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST -H "Cookie: __Secure-authjs.session-token=$T" \
  -H "Content-Type: application/json" \
  -d '{"name":""}' http://localhost:3010/api/prompts
# Expected: 400 (Zod rechaza min(1)).

curl -s -o /dev/null -w "%{http_code}" \
  -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$(printf 'x%.0s' {1..101})\"}" \
  http://localhost:3010/api/prompts
# Expected: 400 (max 100 chars).
```

### 4. POST /api/prompts con body válido → 201 + prompt
```bash
curl -s -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" \
  -d '{"name":"Marketing Email","description":"For launches"}' \
  http://localhost:3010/api/prompts
# Expected: 201 + JSON con id (UUID), userId, name="Marketing Email",
# slug="marketing-email", description="For launches",
# currentVersionId=null, createdAt, updatedAt.
```

### 5. Slug collision con sufijo numérico
```bash
# Crear 3 con el mismo name
for i in 1 2 3; do
  curl -s -X POST -H "Cookie: $T" \
    -H "Content-Type: application/json" \
    -d '{"name":"My Prompt"}' \
    http://localhost:3010/api/prompts | jq -r .slug
done
# Expected:
# my-prompt
# my-prompt-2
# my-prompt-3
```

### 6. GET /api/prompts lista los del user
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/prompts | jq '. | length'
# Expected: número >= 3 (los del check anterior).
```

### 7. GET /api/prompts/:slug devuelve uno
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/prompts/my-prompt | jq .name
# Expected: "My Prompt"
```

### 8. GET /api/prompts/:slug inexistente → 404
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: $T" http://localhost:3010/api/prompts/nonexistent
# Expected: 404
```

### 9. DELETE /api/prompts/:slug → 204 + eliminado
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE -H "Cookie: $T" \
  http://localhost:3010/api/prompts/my-prompt
# Expected: 204
curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: $T" http://localhost:3010/api/prompts/my-prompt
# Expected: 404
```

### 10. DELETE /api/prompts/:slug ajeno → 404
Probar con un slug que no pertenece al user (ej. crear con user A,
intentar delete con cookie de user B). Debe devolver 404 (no 403,
para no leakear existencia).

### 11. Browser: empty state → create → list → detail → delete
- `/` con user nuevo → muestra empty state + CTA.
- Click "Create your first prompt" → `/prompts/new`.
- Submit form `{ name: "Welcome flow", description: "..." }` →
  redirect a `/prompts/welcome-flow`.
- Detail muestra name, slug, description, fecha, sección Content
  con placeholder, botón Delete.
- Volver a `/` (link Header) → lista contiene "Welcome flow".
- Crear 2 más → lista de 3.
- Click un item → detail.
- Click Delete → confirm → vuelve a `/` → lista pierde uno.

### 12. Slug auto-gen pasa los casos del test
```bash
bun test src/domain/prompt/__test__/slug.test.ts
# Expected: pass.
```

## Structural checks

### 13. Hexagonal layers limpios
```bash
# domain no importa nada externo
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces|react" src/domain
# Expected: empty.

# application solo de domain + ports
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces" src/application
# Expected: empty.
```

### 13b. CQS convention: `<Name>Command` / `<Name>Query` con `execute`
```bash
# Cada archivo en commands/ exporta una clase con sufijo Command
grep -lE "^export class [A-Z][A-Za-z]+Command" src/application/commands/*.ts | wc -l
# Expected: 2 (create-prompt, delete-prompt).

# Cada archivo en queries/ exporta una clase con sufijo Query
grep -lE "^export class [A-Z][A-Za-z]+Query" src/application/queries/*.ts | wc -l
# Expected: 3 (get-current-user heredada de P5 — refactor incluido —
#  + get-prompt-by-slug + list-prompts-for-user).

# Todas las classes Command/Query exponen un method `execute`
grep -E "(class.*Command|class.*Query)" src/application/{commands,queries}/*.ts -A 3 | grep -c "execute("
# Expected: igual al número de classes.
```

### 14. Archivos creados según requirements
- `src/domain/prompt/{slug,prompt-name,errors,types,index}.ts`
- `src/domain/prompt/__test__/slug.test.ts`
- `src/application/ports/prompt-repository.ts`
- `src/application/commands/{create-prompt,delete-prompt}.ts`
- `src/application/queries/{get-prompt-by-slug,list-prompts-for-user}.ts`
- `src/infrastructure/persistence/schema/prompts.ts`
- `src/infrastructure/persistence/migrations/0001_*.sql`
- `src/infrastructure/persistence/repositories/postgres-prompt-repository.ts`
- `src/interfaces/http/schemas/prompt.ts`
- `src/interfaces/http/lib/require-user.ts`
- `src/frontend/lib/api/prompts.ts`
- `src/frontend/hooks/use-prompts.ts`
- `src/frontend/pages/{PromptsListPage,PromptCreatePage,PromptDetailPage}.tsx`

### 15. Schema barrel actualizado
`src/infrastructure/persistence/schema/index.ts` re-exporta
`./prompts`.

### 16. server.ts wires repo + 4 commands/queries
Composition root tiene:
- `new PostgresPromptRepository(db)`.
- `new CreatePromptCommand(promptRepo)`,
  `new DeletePromptCommand(promptRepo)`,
  `new GetPromptBySlugQuery(promptRepo)`,
  `new ListPromptsForUserQuery(promptRepo)`.
- 4 routes Elysia + entries en `Bun.serve.routes`. Cada handler
  invoca `.execute(...)` sobre la instancia correspondiente.

### 17. APITester eliminado
- `src/frontend/APITester.tsx` no existe.
- `App.tsx` no lo importa.

### 18. Routing nested
`frontend.tsx` usa `<Route path="/" element={<RequireAuth><App />}}>` con
nested routes (index + 2 sub-paths).

### 19. Deps presentes
`package.json` incluye `react-hook-form` y `@hookform/resolvers`.

## Non-regression checks

### 20. P0..P5 siguen funcionando
```bash
bun test                # incluye sanity + slug
bunx tsc --noEmit       # clean
bun run build           # ok
```
- OAuth flow GitHub + Google sigue.
- `/api/me` devuelve 200 + DTO.
- `/auth/session` sigue accesible.
- `/health` responde 200.

### 21. Git limpio
```bash
git status
# Expected: nothing to commit.
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (atención
especial a la dirección de imports entre layers). CI todavía no
aplica (P14).
