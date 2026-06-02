# P9 — API pública de consumo + rate limiting · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P9. P8 dejó la gestión de API keys
funcional (UI + backend); P9 las pone a trabajar: el endpoint
**`GET /v1/prompts/:slug`** que cualquier consumidor (n8n, Zapier,
Make, curl, fetch en un backend) puede llamar con
`Authorization: Bearer po_live_xxx` para obtener la última versión
del prompt en JSON.

Es el primer endpoint público (sin sesión web; solo bearer token).
La fase trae también:
- **Autenticación de API keys** (verify hash via argon2id) +
  rate limiting (sliding/fixed window) + cache (TTL + invalidation).
- Las primitivas (ports `RateLimiter` y `Cache`) que se reusan en
  futuras fases si aparecen más endpoints públicos.

Después de P9 el producto está utilizable end-to-end por la persona
1: crea prompt en la UI, copia la API key, lo pega en un n8n node
HTTP request — el prompt versionado vive en producción.

## In scope

### Domain
- Sumar a `src/domain/api-key/errors.ts`:
  - `MissingAuthorizationHeaderError` (HTTP 401, body unificado).
  - `InvalidApiKeyError` (HTTP 401, body unificado). Reemplaza
    cualquier specific reason que el endpoint público pueda
    encontrar (revoked, hash mismatch, prefix no existe, formato
    inválido).
  - `RateLimitExceededError(retryAfterSeconds: number)` (HTTP 429).
- (No nuevas entities ni schemas en el domain; reusamos los de P6/P7/P8.)

### Application
- Ports nuevos:
  - `src/application/ports/rate-limiter.ts`:
    ```ts
    export type RateLimitResult =
      | { allowed: true; remaining: number; resetAt: number }
      | { allowed: false; retryAfter: number };
    export interface RateLimiter {
      consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
    }
    ```
  - `src/application/ports/cache.ts`:
    ```ts
    export interface Cache {
      get<T>(key: string): Promise<T | null>;
      set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
      del(key: string): Promise<void>;
    }
    ```
- Extender `ApiKeyRepository` (port + adapter):
  - `findByPrefix(prefix: string): Promise<ApiKey | null>` —
    matchea `WHERE prefix = ?`. En la práctica devuelve 0 o 1 row
    (colisión de 8 hex es 1/2³² = astronómica).
- Use cases nuevos (clases con `execute`):
  - `AuthenticateApiKeyQuery` (en `application/queries/`):
    Input: `Authorization` header value (string `"Bearer ..."`).
    - Valida formato → `InvalidApiKeyError` si malformado.
    - Extrae plaintext → prefix.
    - `repo.findByPrefix(prefix)` → null o revoked → `InvalidApiKeyError`.
    - `hasher.verify(plaintext, keyHash)` → false → `InvalidApiKeyError`.
    - Devuelve la `ApiKey` (incluye `userId`).
  - `GetLatestPublishedVersionQuery` (en `application/queries/`):
    Input: `{ userId, slug }`.
    Output: DTO `PublicPromptDTO` o null (si prompt no existe o no
    tiene current_version_id).
    - Cache key: `prompt:current:${userId}:${slug}`.
    - Lookup cache; hit → return.
    - Miss → query prompt + version → arma DTO → set cache (TTL 300s) → return.
- Modificar use cases existentes para invalidar cache:
  - `SaveNewVersionCommand`: tras `appendNewVersion` exitoso (no en
    no-op), `cache.del(promptCacheKey(userId, slug))`.
  - `RestoreVersionCommand`: idem.
  - `DeletePromptCommand`: tras delete exitoso, `cache.del(...)`.
- DTO `PublicPromptDTO` en `src/domain/prompt-version/types.ts`
  (o un nuevo archivo). Shape exacto:
  ```ts
  type PublicPromptDTO = {
    content: string;
    version: number;
    updatedAt: string;       // ISO timestamp
    commitMessage: string | null;
  };
  ```
  Match exacto con la verificación del roadmap.

### Infrastructure
- `src/infrastructure/cache/bun-redis-cache.ts`:
  - Implementa `Cache` con `Bun.redis`.
  - `set`: `await Bun.redis.set(key, JSON.stringify(value));
    await Bun.redis.expire(key, ttl);` (o equivalente con
    EX option si lo soporta).
  - `get`: parsea JSON; null si no existe.
  - `del`: `await Bun.redis.del(key)`.
- `src/infrastructure/cache/bun-redis-rate-limiter.ts`:
  - Implementa `RateLimiter` con fixed window via INCR + EXPIRE.
  - Algoritmo:
    ```
    const windowStart = Math.floor(now / (windowSeconds * 1000));
    const wkey = `rl:${key}:${windowStart}`;
    const count = await Bun.redis.incr(wkey);
    if (count === 1) await Bun.redis.expire(wkey, windowSeconds);
    if (count > limit) {
      const resetAt = (windowStart + 1) * windowSeconds * 1000;
      return { allowed: false, retryAfter: Math.ceil((resetAt - now) / 1000) };
    }
    return { allowed: true, remaining: limit - count, resetAt: ... };
    ```
  - Fixed window es menos preciso que sliding (puede haber
    duplicación de tráfico en el cambio de ventana) pero usa 2
    comandos Redis vs 4 — para V1 alcanza. Sliding queda en P16
    si hay quejas.
- Extender `PostgresApiKeyRepository` con `findByPrefix`. Puede
  necesitar un nuevo index — discutir abajo.
- `Bun.redis` connection: `BUN_REDIS_URL` env var (Bun lee
  automáticamente?). O via `process.env.REDIS_URL`. Ya está en
  `.env.example` desde P1. La instancia se importa desde
  `infrastructure/cache/redis.ts` (un singleton ligero).

### HTTP
- Helper `requireApiKey(request)` paralelo a `requireUser`:
  - Lee `Authorization` header.
  - Llama `AuthenticateApiKeyQuery.execute(...)`.
  - Devuelve `ApiKey` o `Response` (401 con body unificado).
- Helper `enforceRateLimit(apiKey)`:
  - `RateLimiter.consume(\`apikey:${apiKey.id}\`, 100, 60)`.
  - Si denied, devuelve Response 429 + `Retry-After` header.
- Route nueva `GET /v1/prompts/:slug`:
  - requireApiKey
  - enforceRateLimit
  - GetLatestPublishedVersionQuery
  - 200 + DTO si existe; 404 si no existe o no tiene current
    version; 429 si rate limited.
  - Headers: `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: <n>`,
    `X-RateLimit-Reset: <ms epoch>`.
- Bun.serve.routes: agrega `/v1/prompts/*`.
- CORS: el endpoint público es CORS-open. Usar `@elysiajs/cors`
  scoped al group `/v1/*` o setear headers manualmente.
  Decisión técnica: setear headers manualmente para no agregar
  config global.

## Out of scope
- Sliding window preciso (fixed alcanza V1; polish P16).
- Per-IP rate limiting adicional.
- API key scopes (read/write).
- Endpoint para version específica (`/v1/prompts/:slug/v/:n`)
  — V2.
- last_used_at update (decidido este turno: no se actualiza en V1).
- Webhooks de uso.
- Body POST en el endpoint público (V1 es read-only).

## Decisiones acordadas (este turno)

### 1. 401 unificado
**Decisión**: cualquier modo de fallo de auth devuelve
`401 { "error": "Invalid API key" }`. No se distingue entre prefix
inexistente, hash mismatch, key revocada, header malformado, etc.

**Razón**: best practice de seguridad. No leakea información útil a
un atacante haciendo brute force de prefixes. Logs internos
registran la causa fina (debug DX) sin exponerla al cliente.

### 2. Rate limit per key, 100 req/min
**Decisión**: Redis key `rl:apikey:{keyId}:{windowStart}`. Cada API
key tiene su propio counter. 3 keys del mismo user = 300 req/min
combinado.

**Razón**: estándar industria. Si una key se filtra y abusan, el
daño se aisla a esa key (revocarla limpia). Tracking sencillo:
1 counter por key. Para volumen V1 alcanza sobrado.

### 3. last_used_at no se actualiza en V1
**Decisión**: el endpoint público NO escribe en
`api_keys.last_used_at`. La columna queda siempre `null`. UI
muestra "Created X · never used" indefinidamente.

**Razón**: simplificación V1. Cada request escapa de un write extra
(el rate limit + cache lookup ya tocan Redis; sumar un
UPDATE Postgres por hit es overhead que no necesitamos para el
MVP). El feature "Last used N min ago" entra en P16 (polish) o
cuando aparezca demanda real.

## Decisiones técnicas derivadas

### Index para `findByPrefix`
Sin index, lookup por prefix es full table scan. P8 dejó solo
`(user_id, revoked_at)`. Necesitamos un index nuevo:
```ts
index("api_keys_prefix_idx").on(t.prefix);
```
**No único** porque dos prefixes podrían (improbable pero posible)
colisionar. La query filtra por prefix y vuelve a verificar el hash
con `hasher.verify`, así que false-positive solo cuesta una
verificación extra.

Esto requiere una migration `0004_*.sql` que solo agrega el index.

### Cache invalidation: keys
- Format: `prompt:current:${userId}:${slug}`.
- Invalida en: `SaveNewVersionCommand`, `RestoreVersionCommand`,
  `DeletePromptCommand`.
- TTL 300s (5 min): cubre el caso "user editó hace minutos pero
  cambió a otro device". Si pasa el TTL sin invalidación
  (defensa contra inconsistencia silenciosa), el siguiente fetch
  trae fresh.

### Composition root extension
```ts
const cache = new BunRedisCache();
const rateLimiter = new BunRedisRateLimiter();
const authenticateApiKey = new AuthenticateApiKeyQuery(apiKeyRepo, apiKeyHasher);
const getLatestPublishedVersion = new GetLatestPublishedVersionQuery(promptRepo, versionRepo, cache);

// Inject cache into mutations:
const saveNewVersion = new SaveNewVersionCommand(promptRepo, versionRepo, cache);
const restoreVersion = new RestoreVersionCommand(promptRepo, versionRepo, cache);
const deletePrompt = new DeletePromptCommand(promptRepo, cache);
```

### CORS para /v1/*
Headers manuales en la response del endpoint público:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization
```
Plus un handler `OPTIONS /v1/prompts/:slug` para preflight.

### Bun.redis singleton
```ts
// src/infrastructure/cache/redis.ts
import { redis } from "bun";
export { redis };
```
`redis` ya está conectado vía `process.env.REDIS_URL` (Bun auto).

## Critical files

### Nuevos
- `src/application/ports/rate-limiter.ts`
- `src/application/ports/cache.ts`
- `src/application/queries/authenticate-api-key.ts`
- `src/application/queries/get-latest-published-version.ts`
- `src/infrastructure/cache/redis.ts` (Bun.redis singleton)
- `src/infrastructure/cache/bun-redis-cache.ts`
- `src/infrastructure/cache/bun-redis-rate-limiter.ts`
- `src/infrastructure/persistence/migrations/0004_*.sql` (index sobre prefix)
- `src/interfaces/http/lib/require-api-key.ts`

### Modificados
- `src/domain/api-key/errors.ts` — sumar
  `MissingAuthorizationHeaderError`, `InvalidApiKeyError`,
  `RateLimitExceededError`. Algunos pueden no usarse fuera de la
  HTTP layer; check si vale la pena domain vs interfaces.
- `src/application/ports/api-key-repository.ts` — agrega
  `findByPrefix`.
- `src/application/commands/save-new-version.ts` — recibe `cache`
  port, invalida tras append.
- `src/application/commands/restore-version.ts` — idem.
- `src/application/commands/delete-prompt.ts` — recibe `cache`,
  invalida tras delete.
- `src/infrastructure/persistence/repositories/postgres-api-key-repository.ts`
  — agrega `findByPrefix`.
- `src/infrastructure/persistence/schema/api-keys.ts` — agrega
  `index("api_keys_prefix_idx").on(t.prefix)`.
- `src/interfaces/http/server.ts` — wire de los nuevos use cases +
  endpoint público + CORS headers.

## References
- `specs/mission.md` → "API consumo público con API Key".
- `specs/tech-stack.md` → API Keys (`Bun.password.verify`),
  Cache & Rate Limiting (`Bun.redis`), API consumo (Bearer header).
- `specs/roadmap.md` → P9 (canónico).
- `feedback_cqs_class_convention.md` → use cases nuevos como clases.
