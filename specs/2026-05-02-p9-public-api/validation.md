# P9 — API pública de consumo + rate limiting · Validation

Pre-condiciones:
- `docker compose up -d postgres redis` healthy.
- Migration nueva aplicada (`0004_*.sql` con index sobre prefix).
- Sesión activa en browser para crear data de prueba.
- Existe al menos un prompt con al menos una version (current).
- Existe una API key con su plaintext disponible (`$KEY`).

Setup test fixtures:
```bash
# (vía UI o curl con cookie):
# 1. crear prompt "Test Public" → slug "test-public"
# 2. abrir editor → escribir "hello consumer" → save (v1)
# 3. /settings/api-keys → generate key → copiar plaintext a $KEY
```

## Functional checks

### 1. 401 sin Authorization
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3010/v1/prompts/test-public
# Expected: 401
```

### 2. 401 Authorization malformado
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: not-a-bearer" \
  http://localhost:3010/v1/prompts/test-public
# Expected: 401
```

### 3. 401 key con shape inválido
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer po_live_short" \
  http://localhost:3010/v1/prompts/test-public
# Expected: 401
```

### 4. 401 key con prefix inexistente
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer po_live_$(printf 'a%.0s' {1..32})" \
  http://localhost:3010/v1/prompts/test-public
# Expected: 401
```

### 5. 401 key revocada
- Generar una key, revocarla via UI.
- Usar el plaintext de la key revocada:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $REVOKED_KEY" \
  http://localhost:3010/v1/prompts/test-public
# Expected: 401
```

### 6. Body unificado en todos los 401
```bash
for case in "no-header" "malformed" "invalid-shape" "wrong-prefix"; do
  # adaptar headers...
  body=$(curl -s -H "..." http://localhost:3010/v1/prompts/test-public)
  echo "$case: $body"
done
# Expected: todos devuelven {"error":"Invalid API key"}
```

### 7. 200 con DTO completo
```bash
curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/test-public | jq
# Expected:
# {
#   "content": "hello consumer",
#   "version": 1,
#   "updatedAt": "<ISO>",
#   "commitMessage": <string|null>
# }
```

### 8. Headers de rate limit presentes
```bash
curl -i -s -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/test-public | grep -i "x-ratelimit"
# Expected:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99 (o lo que toque)
# X-RateLimit-Reset: <epoch ms>
```

### 9. 404 prompt inexistente
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/nonexistent-slug
# Expected: 404
```

### 10. 404 prompt sin current_version_id
- Crear prompt en UI sin tocar el editor (queda con currentVersionId
  null).
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/empty-prompt
# Expected: 404
```

### 11. Rate limit: 101ª request → 429 + Retry-After
```bash
SLUG=test-public
for i in $(seq 1 105); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $KEY" \
    http://localhost:3010/v1/prompts/$SLUG
done | sort | uniq -c
# Expected: 100x "200" + 5x "429"

curl -s -i -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/$SLUG | grep -i "retry-after"
# Expected: Retry-After: <small int>
```

### 12. Rate limit aislado por key
- Generar 2 keys distintas.
- Llenar el quota con key A.
- Request con key B sigue devolviendo 200 (counter independiente).

### 13. Cache hit en segunda request
```bash
docker compose exec redis redis-cli FLUSHDB
curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/$SLUG > /dev/null
docker compose exec redis redis-cli KEYS "prompt:current:*"
# Expected: una key del prompt fetched (cache miss → set).

curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/$SLUG > /dev/null
# Inspect logs (si los hay) o latencia: la 2ª request debería ser
# medible-más rápida porque sale de Redis.
```

### 14. Cache invalidation en save
```bash
# Pre-condición: cache de prompt existe en Redis.
docker compose exec redis redis-cli KEYS "prompt:current:*" | wc -l
# Expected: >= 1.

# Editar prompt en UI → save (nueva version).

docker compose exec redis redis-cli KEYS "prompt:current:*"
# Expected: la key correspondiente al prompt editado YA NO existe
# (o, si paso poco tiempo, no está la versión vieja cacheada).

# Siguiente fetch trae la nueva versión:
curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/$SLUG | jq .version
# Expected: número incrementado vs antes.
```

### 15. Cache invalidation en delete
- Prompt cacheado en Redis.
- Borrar via UI.
- Nuevo fetch → 404.
- Redis: la key del prompt borrado ya no existe.

### 16. CORS headers en /v1/*
```bash
curl -s -i -H "Authorization: Bearer $KEY" \
  http://localhost:3010/v1/prompts/$SLUG | grep -i "access-control"
# Expected:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, OPTIONS
# Access-Control-Allow-Headers: Authorization, Content-Type
```

### 17. OPTIONS preflight devuelve 204
```bash
curl -s -X OPTIONS -i \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  http://localhost:3010/v1/prompts/$SLUG | head -5
# Expected: HTTP/1.1 204 + access-control-allow-* headers.
```

### 18. Authorization de admin endpoints sigue requiriendo cookie
- Las routes existentes `/api/prompts`, `/api/keys`, `/api/me` siguen
  requiriendo cookie de sesión (no aceptan Bearer token):
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $KEY" \
  http://localhost:3010/api/prompts
# Expected: 401 (NO 200 — la API key NO es válida para endpoints
# admin, solo para /v1/*).
```

## Structural checks

### 19. Index sobre prefix presente
```bash
bun run db:psql -- -c "\d api_keys" | grep -i "api_keys_prefix_idx"
# Expected: una línea matcheando.
```

### 20. Hexagonal layers limpios
```bash
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces|react" src/domain
# empty
grep -rnE "from \"@auth|drizzle|elysia|@/infrastructure|@/interfaces" src/application
# empty
```

### 21. CQS counts
```bash
grep -lE "^export class [A-Z][A-Za-z]+Command" src/application/commands/*.ts | wc -l
# Expected: 6 (sin nuevos commands; existentes modificados con cache port).

grep -lE "^export class [A-Z][A-Za-z]+Query" src/application/queries/*.ts | wc -l
# Expected: 8 (suma de P0..P8 = 6, + AuthenticateApiKey + GetLatestPublishedVersion).

grep -E "(class.*Command|class.*Query)" src/application/{commands,queries}/*.ts -A 12 | grep -c "execute("
# Expected: 14.
```

### 22. Archivos creados (resumen)
- application/ports/{cache,rate-limiter}.ts
- application/queries/{authenticate-api-key,get-latest-published-version}.ts
- infrastructure/cache/{redis,bun-redis-cache,bun-redis-rate-limiter}.ts
- infrastructure/persistence/migrations/0004_*.sql (index sobre prefix)
- interfaces/http/lib/require-api-key.ts

### 23. Cache injected en commands de mutación
- SaveNewVersionCommand, RestoreVersionCommand, DeletePromptCommand
  reciben `cache` en constructor.
- Tras mutación exitosa, cada uno hace `cache.del(...)`.

### 24. ApiKeyRepository tiene `findByPrefix`
```bash
grep -E "findByPrefix" src/application/ports/api-key-repository.ts \
  src/infrastructure/persistence/repositories/postgres-api-key-repository.ts
# Expected: 2 hits (port + impl).
```

## Non-regression checks

### 25. P0..P8 siguen funcionando
- `bun test` pasa.
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow funciona.
- /api/me, /health, prompts CRUD, versionado, API keys management.

### 26. Git limpio
```bash
git status
# Expected: nothing to commit.
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR (atención
especial a: 401 unificado, no leak de información, rate limit
funciona contra Redis real, cache invalidation cubre las 3 mutations).
