# P9 — API pública de consumo + rate limiting · Plan

Numbered task groups.

## 1. Domain: nuevos errors + DTO público
1.1. En `src/domain/api-key/errors.ts` agregar:
- `MissingAuthorizationHeaderError`
- `InvalidApiKeyError` (genérico para 401 unificado)
- `RateLimitExceededError(retryAfter: number)`

1.2. En `src/domain/prompt-version/types.ts` (o nuevo
`public-prompt-dto.ts`) agregar:
```ts
export type PublicPromptDTO = {
  content: string;
  version: number;
  updatedAt: string;       // ISO
  commitMessage: string | null;
};
```

1.3. Re-export desde el barrel.

## 2. Application: 2 ports + extensión + 2 queries + invalidate hooks
2.1. `src/application/ports/cache.ts`:
```ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

2.2. `src/application/ports/rate-limiter.ts`:
```ts
export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfter: number };

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
```

2.3. Extender `ApiKeyRepository` (port) con
`findByPrefix(prefix: string): Promise<ApiKey | null>`.

2.4. `src/application/queries/authenticate-api-key.ts` —
`AuthenticateApiKeyQuery`:
- Constructor `(repo, hasher)`.
- Input: el header `Authorization` raw (string sin "Bearer ").
  O un input `{ headerValue: string | null }` que el query parsea.
- Decisión: el query recibe `headerValue: string | null` y se
  encarga del parsing — la HTTP layer no necesita conocer el
  formato exacto.
- Pasos:
  1. Si `headerValue == null` o no empieza con "Bearer " →
     `MissingAuthorizationHeaderError`.
  2. Strip "Bearer " → plaintext.
  3. Validar shape (`/^po_live_[a-f0-9]{32}$/`) → `InvalidApiKeyError`.
  4. `prefix = extractApiKeyPrefix(plaintext)`.
  5. `key = repo.findByPrefix(prefix)` — null o `revokedAt != null` →
     `InvalidApiKeyError`.
  6. `hasher.verify(plaintext, key.keyHash)` → false →
     `InvalidApiKeyError`.
  7. Return `key`.

2.5. `src/application/queries/get-latest-published-version.ts` —
`GetLatestPublishedVersionQuery`:
- Constructor `(promptRepo, versionRepo, cache)`.
- Input: `{ userId, slug }`.
- Output: `PublicPromptDTO | null`.
- Cache key: `prompt:current:${userId}:${slug}`.
- Pasos:
  1. cache.get → si hit, return.
  2. promptRepo.findBySlug → null → return null.
  3. Si `prompt.currentVersionId == null` → return null.
  4. versionRepo.findCurrentForPrompt → null → return null
     (defensive; no debería pasar si current_version_id está set).
  5. DTO: `{ content, version: versionNumber, updatedAt:
     prompt.updatedAt.toISOString(), commitMessage }`.
  6. cache.set(key, dto, 300).
  7. return dto.

2.6. Modificar SaveNewVersionCommand:
- Constructor agrega `cache: Cache`.
- Tras `appendNewVersion` exitoso (no en no-op), `cache.del(\`prompt:current:${prompt.userId}:${prompt.slug}\`)`.

2.7. RestoreVersionCommand: idem.

2.8. DeletePromptCommand: constructor agrega `cache`, tras delete
exitoso `cache.del(...)`.

2.9. `bunx tsc --noEmit` clean.

## 3. Schema: index sobre prefix + migration
3.1. En `src/infrastructure/persistence/schema/api-keys.ts`:
```ts
}, (t) => [
  index("api_keys_user_active_idx").on(t.userId, t.revokedAt),
  index("api_keys_prefix_idx").on(t.prefix),
]);
```

3.2. `bun run db:generate` → produce `0004_*.sql` con solo el
`CREATE INDEX`.

3.3. `bun run db:migrate` aplica.

3.4. Verify:
```bash
bun run db:psql -- -c "\d api_keys" | grep -i prefix
```

## 4. Infrastructure: Redis cache + rate limiter
4.1. `src/infrastructure/cache/redis.ts`:
```ts
import { redis } from "bun";
export { redis };
```
(El cliente lee `REDIS_URL` automáticamente.)

4.2. `src/infrastructure/cache/bun-redis-cache.ts`:
```ts
export class BunRedisCache implements Cache {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value));
    await redis.expire(key, ttlSeconds);
  }
  async del(key: string): Promise<void> {
    await redis.del(key);
  }
}
```

4.3. `src/infrastructure/cache/bun-redis-rate-limiter.ts`:
```ts
export class BunRedisRateLimiter implements RateLimiter {
  async consume(key, limit, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs);
    const wkey = `rl:${key}:${windowStart}`;
    const count = await redis.incr(wkey);
    if (count === 1) await redis.expire(wkey, windowSeconds);
    const resetAt = (windowStart + 1) * windowMs;
    if (count > limit) {
      return {
        allowed: false,
        retryAfter: Math.ceil((resetAt - now) / 1000),
      };
    }
    return { allowed: true, remaining: limit - count, resetAt };
  }
}
```

4.4. Extender PostgresApiKeyRepository con `findByPrefix`:
```ts
async findByPrefix(prefix: string): Promise<ApiKey | null> {
  const rows = await this.db.select().from(apiKeys)
    .where(eq(apiKeys.prefix, prefix)).limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}
```
(Si en el futuro hay colisiones, bumpear a `findAll` y la query
itera; por ahora `LIMIT 1` con index hace el trabajo.)

## 5. HTTP: helper requireApiKey + endpoint /v1/prompts/:slug
5.1. `src/interfaces/http/lib/require-api-key.ts`:
```ts
export async function requireApiKey(request, authenticate): Promise<ApiKey | Response> {
  try {
    return await authenticate.execute(request.headers.get("authorization"));
  } catch (err) {
    if (err instanceof MissingAuthorizationHeaderError ||
        err instanceof InvalidApiKeyError) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
      });
    }
    throw err;
  }
}
```

5.2. server.ts composition root extension:
```ts
const cache = new BunRedisCache();
const rateLimiter = new BunRedisRateLimiter();
const authenticateApiKey = new AuthenticateApiKeyQuery(apiKeyRepo, apiKeyHasher);
const getLatestPublishedVersion = new GetLatestPublishedVersionQuery(promptRepo, versionRepo, cache);

// Re-instanciar con cache:
const saveNewVersion = new SaveNewVersionCommand(promptRepo, versionRepo, cache);
const restoreVersion = new RestoreVersionCommand(promptRepo, versionRepo, cache);
const deletePrompt = new DeletePromptCommand(promptRepo, cache);
```

5.3. Route nueva en Elysia:
```ts
.options("/v1/prompts/:slug", () => new Response(null, {
  status: 204,
  headers: corsHeaders,
}))
.get("/v1/prompts/:slug", async ({ request, params }) => {
  const keyOr401 = await requireApiKey(request, authenticateApiKey);
  if (keyOr401 instanceof Response) return keyOr401;

  const rl = await rateLimiter.consume(`apikey:${keyOr401.id}`, 100, 60);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "retry-after": String(rl.retryAfter),
      },
    });
  }

  const dto = await getLatestPublishedVersion.execute({ userId: keyOr401.userId, slug: params.slug });
  if (!dto) return new Response(JSON.stringify({ error: "Prompt not found" }), {
    status: 404,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

  return new Response(JSON.stringify(dto), {
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": String(rl.remaining),
      "x-ratelimit-reset": String(rl.resetAt),
    },
  });
});

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};
```

5.4. Bun.serve.routes:
```
"/v1/prompts/*": (req) => app.handle(req),
```

5.5. Smoke server-side:
```bash
# Crear prompt + versión via UI (o via curl con cookie de sesión).
# Generar API key.

# Sin Authorization → 401
curl -i http://localhost:3010/v1/prompts/test-slug
# Con key inválida → 401
curl -i -H "Authorization: Bearer po_live_invalid000000000000000000000000" \
  http://localhost:3010/v1/prompts/test-slug
# Válido → 200 + DTO
curl -i -H "Authorization: Bearer $REAL_KEY" \
  http://localhost:3010/v1/prompts/test-slug
```

## 6. Validar cache invalidation
6.1. `bun dev` corriendo. Crear prompt + v1 + v2 via UI.

6.2. `curl /v1/prompts/$slug` → trae v2 (cache miss → cache set).

6.3. `curl /v1/prompts/$slug` → trae v2 desde cache (verificar via
log o testando latencia).

6.4. Inspeccionar Redis:
```bash
docker compose exec redis redis-cli get "prompt:current:<userId>:<slug>"
# Expected: JSON con la DTO.
```

6.5. UI: editar y Save → v3.

6.6. `curl /v1/prompts/$slug` → trae v3 (cache fue invalidada).

6.7. Inspeccionar Redis: la key debería estar borrada (post save) y
luego setear de nuevo cuando el siguiente fetch la repuebla.

## 7. Validar rate limiting
7.1. `for i in 1..101; do curl -s -o /dev/null -w "%{http_code}\n"
-H "Authorization: Bearer $KEY" http://localhost:3010/v1/prompts/$slug; done`

7.2. Primeras 100 → 200; 101 → 429 con header `Retry-After`.

7.3. Header `X-RateLimit-Remaining` decrece monotónico.

7.4. Esperar 60s → counter reset → 200 nuevo.

## 8. Cierre
8.1. Non-regression:
- `bun test` (incluye nuevos posibles tests).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth + UI flow + API keys management de P8 sigue.
- CQS counts: 6 Commands + 8 Queries + 14 execute methods.

8.2. `git status` clean.

8.3. Commitear specs.

8.4. Abrir PR.
