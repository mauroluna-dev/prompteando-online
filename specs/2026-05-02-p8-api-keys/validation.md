# P8 — API Keys management · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan.

Pre-condiciones:
- `docker compose up -d postgres redis` healthy.
- Migration nueva aplicada: `bun run db:migrate` muestra `0003_*.sql`
  en el journal.
- Sesión activa.

## Functional checks

### 1. Migration crea tabla `api_keys`
```bash
bun run db:psql -- -c "\d api_keys" | head -15
# Expected: id (PK), user_id (FK cascade), name, prefix, key_hash,
# last_used_at (nullable), revoked_at (nullable), created_at;
# index (user_id, revoked_at).
```

### 2. POST sin sesión → 401
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3010/api/keys \
  -H "Content-Type: application/json" -d '{"name":"x"}'
# Expected: 401
```

### 3. POST body inválido (name vacío) → 400
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" -d '{"name":""}' \
  http://localhost:3010/api/keys
# Expected: 400
```

### 4. POST válido → 201 + plaintext + apiKey sin keyHash
```bash
curl -s -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
  -d '{"name":"n8n-prod"}' http://localhost:3010/api/keys
# Expected: JSON con keys "apiKey" y "plaintext".
# - plaintext: matches /^po_live_[a-f0-9]{32}$/
# - apiKey.prefix: matches /^po_live_[a-f0-9]{8}$/
# - apiKey: NO incluye field "keyHash".
```

### 5. GET list incluye prefix pero NO keyHash
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/keys | jq '.[0] | keys'
# Expected (en algún orden): id, userId, name, prefix, lastUsedAt,
# revokedAt, createdAt. NO incluye "keyHash".
```

### 6. Quota: 11ª key activa → 429
```bash
# Limpiar primero (test fresh):
bun run db:psql -- -c "DELETE FROM api_keys;"

# Crear 10
for i in $(seq 1 10); do
  curl -s -X POST -H "Cookie: $T" -H "Content-Type: application/json" \
    -d "{\"name\":\"k$i\"}" http://localhost:3010/api/keys >/dev/null
done

# 11ª:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" \
  -d '{"name":"overflow"}' http://localhost:3010/api/keys
# Expected: 429
```

### 7. Revoke → 204 y la key pasa a revoked
```bash
ID=$(curl -s -H "Cookie: $T" http://localhost:3010/api/keys | jq -r '.[0].id')

curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "Cookie: $T" \
  http://localhost:3010/api/keys/$ID
# Expected: 204

bun run db:psql -- -c "SELECT name, revoked_at FROM api_keys WHERE id='$ID';"
# Expected: una fila con revoked_at no NULL.
```

### 8. Re-revoke (idempotencia ?) → 410
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "Cookie: $T" \
  http://localhost:3010/api/keys/$ID
# Expected: 410 Gone
```

### 9. Revoke abre slot → 11ª key ahora pasa
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Cookie: $T" \
  -H "Content-Type: application/json" \
  -d '{"name":"reborn"}' http://localhost:3010/api/keys
# Expected: 201 (porque ahora hay 9 active + 1 revoked, slot libre).
```

### 10. Revoke ajeno → 404
- Crear key con user A.
- Login con user B.
- DELETE /api/keys/<id-de-A> → 404 (no leakeamos existencia).

### 11. List muestra activas + revocadas
```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/keys | \
  jq 'map({name, prefix, revoked: .revokedAt != null}) | length'
# Expected: número total >= 10 (active + revoked).

curl -s -H "Cookie: $T" http://localhost:3010/api/keys | \
  jq 'map(select(.revokedAt != null)) | length'
# Expected: >= 1.
```

### 12. Hash plaintext seguro (sanity)
```bash
bun run db:psql -- -c "SELECT length(key_hash) FROM api_keys LIMIT 1;"
# Expected: length > 50 (argon2id encoded, includes salt + params).
# Plaintext no debería estar visible en ninguna parte de la BD.
```

### 13. Browser: navegación y flow completo
- Header: link "API Keys" visible siempre, con highlight cuando estás
  en `/settings/api-keys`.
- Page con counter "X / 10 active" arriba.
- Click "+ Generate new key" → form con Input name → Create.
- `Dialog` se abre con:
  - Plaintext en monospace (40 chars `po_live_<32 hex>`).
  - Botón "Copy" copia al clipboard.
  - Warning visible.
  - Botón "Done" cierra.
- Tras dismiss: lista muestra la nueva key con su prefix solamente.
- Click "Revoke" en una key → row pasa a gris con badge "Revoked",
  sin botón Revoke.
- Crear keys hasta el 10º → botón Generate disabled con tooltip.

## Structural checks

### 14. Hexagonal layers
```bash
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces|react" src/domain
# Expected: empty.
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces" src/application
# Expected: empty.
```

### 15. CQS convention
```bash
grep -lE "^export class [A-Z][A-Za-z]+Command" src/application/commands/*.ts | wc -l
# Expected: 6 (CreatePrompt, DeletePrompt, SaveNewVersion, RestoreVersion,
# CreateApiKey, RevokeApiKey).

grep -lE "^export class [A-Z][A-Za-z]+Query" src/application/queries/*.ts | wc -l
# Expected: 6 (GetCurrentUser, GetPromptBySlug, ListPromptsForUser,
# GetVersion, ListVersions, ListApiKeysForUser).

grep -E "(class.*Command|class.*Query)" src/application/{commands,queries}/*.ts -A 12 \
  | grep -c "execute("
# Expected: 12.
```

### 16. Archivos creados (resumen)
- domain/api-key/{api-key-name,helpers,errors,types,index}.ts
- domain/api-key/__test__/{api-key-name,helpers}.test.ts
- application/ports/{api-key-repository,api-key-hasher}.ts
- application/commands/{create-api-key,revoke-api-key}.ts
- application/queries/list-api-keys-for-user.ts
- infrastructure/persistence/schema/api-keys.ts
- infrastructure/persistence/migrations/0003_*.sql
- infrastructure/persistence/repositories/postgres-api-key-repository.ts
- infrastructure/auth/bun-password-api-key-hasher.ts
- interfaces/http/schemas/api-key.ts
- frontend/lib/api/api-keys.ts
- frontend/hooks/use-api-keys.ts
- frontend/pages/ApiKeysPage.tsx
- frontend/components/ui/dialog.tsx (vía shadcn)

### 17. server.ts wires
- Composition root tiene `apiKeyRepo`, `apiKeyHasher`, los 3 use
  cases instanciados.
- 3 routes Elysia + 2 entries en Bun.serve.routes.

### 18. Header link presente
`Header.tsx` tiene `<NavLink to="/settings/api-keys">API Keys</NavLink>`
entre el logo y el UserMenu, con active state styling.

### 19. /api/keys nunca leakea keyHash
Ningún endpoint del módulo serializa `keyHash` en la response. El
campo existe en BD y en el adapter pero el HTTP layer lo filtra.

```bash
curl -s -H "Cookie: $T" http://localhost:3010/api/keys \
  | jq -e 'all(.[]; has("keyHash") | not)'
# Expected: true (no key tiene keyHash).
```

## Non-regression checks

### 20. P0..P7 siguen funcionando
- `bun test` pasa todos.
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow GitHub + Google sigue.
- /api/me, /health, prompts CRUD, versionado todos verdes.

### 21. Git limpio
```bash
git status
# Expected: nothing to commit.
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (atención
a que `keyHash` no leakee, y que el flujo del Dialog deje claro que
el plaintext solo se ve una vez). CI todavía no aplica (P14).
