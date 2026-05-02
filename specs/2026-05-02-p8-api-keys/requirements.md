# P8 — API Keys management (UI) · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P8. P0–P7 dejaron la app autenticada y con
prompts versionados via UI. P8 es el primer paso para exponer
promptstash hacia afuera: las API Keys son la credencial que la
**API pública** de P9 va a verificar para servir prompts a n8n /
Zapier / curl / cualquier consumidor.

P8 cubre la **gestión** (UI + backend) — generar, listar, revocar.
P9 implementa el endpoint público que las consume (`GET /v1/prompts/:slug`)
y rate limiting.

## In scope

### Domain (`src/domain/api-key/`)
- VO `ApiKeyName` (1-50 chars, branded type).
- Errors: `InvalidApiKeyNameError`, `ApiKeyNotFoundError`,
  `ApiKeyQuotaExceededError`, `ApiKeyAlreadyRevokedError`.
- Entity:
  ```ts
  type ApiKey = {
    id: string;
    userId: string;
    name: ApiKeyName;
    prefix: string;       // visible portion, e.g. "ps_live_a1b2c3d4"
    keyHash: string;      // argon2id encoded (full hash + salt)
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  };
  ```
- Helpers:
  - `generateApiKeyPlaintext()`: returns `ps_live_<32 hex>` (40 chars
    total). 16 bytes of `crypto.randomBytes` → 32 hex chars.
  - `extractApiKeyPrefix(plaintext)`: returns the first 16 chars
    (`ps_live_<first 8 hex>`) for storage and display.

### Application
- Port `ApiKeyRepository`:
  - `save(apiKey)`
  - `findById(userId, id)`
  - `findAllByUserId(userId)` — DESC by createdAt; incluye revoked.
  - `setRevokedAt(userId, id, when)`
  - `countActiveByUserId(userId)` — `WHERE revoked_at IS NULL`.
- Port `ApiKeyHasher`:
  - `hash(plaintext): Promise<string>`
  - `verify(plaintext, hash): Promise<boolean>` (consumido en P9).
- Use cases (clases con `execute`):
  - `CreateApiKeyCommand`:
    - Input: `{ userId, name }`.
    - Valida name vía `parseApiKeyName`.
    - Cuenta active keys; si `>= 10` lanza `ApiKeyQuotaExceededError`.
    - Genera plaintext, prefix, y hash.
    - Persiste y retorna `{ apiKey, plaintext }` — plaintext solo en
      esta respuesta.
  - `RevokeApiKeyCommand`:
    - Input: `{ userId, id }`.
    - 404 vía `ApiKeyNotFoundError` si no existe o no es del user.
    - Si `revokedAt !== null` lanza `ApiKeyAlreadyRevokedError`
      (mapea a 410 Gone).
    - Setea `revokedAt = NOW()`.
  - `ListApiKeysForUserQuery`:
    - Input: `{ userId }`.
    - Devuelve `ApiKey[]` DESC by createdAt — todos (active +
      revoked).

### Infrastructure
- Schema `api-keys.ts`:
  - `id text PK default crypto.randomUUID()`
  - `user_id text NOT NULL FK users.id ON DELETE CASCADE`
  - `name text NOT NULL`
  - `prefix text NOT NULL`
  - `key_hash text NOT NULL`
  - `last_used_at timestamp` (nullable)
  - `revoked_at timestamp` (nullable; NULL = active)
  - `created_at timestamp NOT NULL DEFAULT NOW()`
  - INDEX `(user_id, revoked_at)` para acelerar `countActive`.
- `PostgresApiKeyRepository`.
- `BunPasswordApiKeyHasher`:
  - `hash(plaintext)` → `await Bun.password.hash(plaintext, "argon2id")`.
  - `verify(plaintext, hash)` → `await Bun.password.verify(plaintext, hash)`.
- Migration generada via `db:generate`.

### HTTP
- 3 routes:
  - `POST /api/keys` body `{ name }` → 201 + `{ apiKey, plaintext }`.
    400 si name inválido. **429** si quota excedida.
  - `GET /api/keys` → 200 + `ApiKey[]` (sin `keyHash` en el JSON
    response — por seguridad).
  - `DELETE /api/keys/:id` → 204 (soft delete). 404 si no es del
    user. **410 Gone** si ya revocada.
- Zod schema `createApiKeySchema = z.object({ name: z.string().trim().min(1).max(50) })`.

### Frontend
- shadcn `dialog` instalado via `bunx shadcn add dialog`.
- API client `src/frontend/lib/api/api-keys.ts` con
  `listApiKeys`, `createApiKey`, `revokeApiKey`.
- Hook `useApiKeys()`.
- Page `src/frontend/pages/ApiKeysPage.tsx` (route
  `/settings/api-keys`):
  - Header section: "API Keys" title + "X / 10 active" counter.
  - Botón "+ Generate new key" disabled al alcanzar quota.
  - Click abre form con Input name + botón Create.
  - Tras create: shadcn `Dialog` se abre mostrando el plaintext en
    monospace + botón "Copy" + warning prominente "This is the only
    time the key will be shown". Botón "Done" cierra.
  - Lista de keys: cada row muestra name, prefix en monospace,
    last used / created, botón Revoke.
  - Keys revocadas: gris, badge "Revoked", revoked at, sin Revoke
    button (solo info).
- `Header.tsx` actualizado: agrega link "API Keys" al lado del logo
  con `<NavLink>` para active state styling.
- `frontend.tsx` agrega route `/settings/api-keys` bajo el
  RequireAuth + AppLayout.

## Out of scope
- Endpoint público de consumo (P9).
- Rate limiting (P9).
- Permisos / scopes por key (V2).
- Webhook / notificaciones de uso (V2).
- API key rotación automatizada (V2).
- Auditoría detallada de cada uso (P9 hace `lastUsedAt` simple).

## Decisiones acordadas (este turno)

### 1. Revoke: soft delete con visibilidad en gris
**Decisión**: `DELETE /api/keys/:id` setea `revoked_at = NOW()`.
La lista incluye revocadas, en gris, con badge "Revoked" + fecha.
El endpoint público de P9 rechazará una key con `revoked_at`
distinto de NULL → 401.

**Razón**: audit trail simple sin compliance overhead. Si el user
quiere "borrar para siempre", revocar alcanza — la key no funciona
más. Patrón industria (Stripe, GitHub).

### 2. Settings entry: link "API Keys" en el header
**Decisión**: `Header.tsx` agrega `<NavLink to="/settings/api-keys">
API Keys</NavLink>` entre el logo y el UserMenu. Active state
styling cuando estás en esa ruta.

**Razón**: descubribilidad alta (visible siempre). Persona 1
(no-coder) necesita encontrar la pantalla sin tener que cazarla en
un menú escondido. Cuando V2 agregue más settings, refactorizamos
a `/settings` parent con sub-nav, sin breaking.

### 3. Quota: 10 keys activas por user
**Decisión**: `CreateApiKeyCommand` cuenta keys activas (`revoked_at
IS NULL`) y rechaza con `ApiKeyQuotaExceededError` → HTTP 429 si
`>= 10`. UI muestra "X / 10 active" en el header de la página y
disable el botón "Generate" al llegar.

**Razón**: defensive default. La mayoría de users necesita 2-3
(prod / staging / dev). 10 cubre casos legítimos sin abrir la
puerta a abuso (alguien scripteando creación). Subir el límite es
trivial si aparece feedback real.

## Decisiones técnicas derivadas

### Plaintext format y prefix
```
plaintext: "ps_live_" + 32 hex chars   (40 chars, 128 bits entropía)
prefix:    "ps_live_" + first 8 hex   (16 chars, suficiente para identificar)
```
- 32 hex = 16 bytes random — colisión astronómica.
- prefix de 8 hex (32 bits) hace prácticamente imposible adivinar
  un prefix válido sin tener la key real.
- Stored fields: `prefix` (display) + `key_hash` (argon2id full).

### Hashing
`Bun.password.hash(plaintext, "argon2id")` con defaults. La key es
larga (32 hex, alta entropía) así que los parámetros default
alcanzan. La verificación en P9 (`verify`) será el path caliente.

### Plaintext en response
`POST /api/keys` returns:
```json
{
  "apiKey": { id, userId, name, prefix, keyHash: "<...>", lastUsedAt: null, revokedAt: null, createdAt },
  "plaintext": "ps_live_a1b2c3d4..."
}
```
**Excepción al patrón normal**: `keyHash` se incluye en este response
solo porque la entity es lo que SaveCommand devuelve. El frontend
**ignora** `keyHash` y solo muestra el plaintext en el dialog. El
endpoint `GET /api/keys` filtra `keyHash` antes de serializar.

Alternativa más limpia: el response shape es una proyección
distinta, ej. `{ id, name, prefix, plaintext, createdAt }`. Vamos
con esta para no leakear nunca el hash al frontend.

### Composition root extension
```ts
const apiKeyRepo = new PostgresApiKeyRepository(db);
const apiKeyHasher = new BunPasswordApiKeyHasher();
const createApiKey = new CreateApiKeyCommand(apiKeyRepo, apiKeyHasher);
const revokeApiKey = new RevokeApiKeyCommand(apiKeyRepo);
const listApiKeys = new ListApiKeysForUserQuery(apiKeyRepo);
```

### Header link styling
```tsx
<NavLink
  to="/settings/api-keys"
  className={({ isActive }) =>
    isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
  }
>
  API Keys
</NavLink>
```

## Critical files

### Nuevos
- `src/domain/api-key/{api-key-name,helpers,errors,types,index}.ts`
- `src/domain/api-key/__test__/{api-key-name,helpers}.test.ts`
- `src/application/ports/{api-key-repository,api-key-hasher}.ts`
- `src/application/commands/{create-api-key,revoke-api-key}.ts`
- `src/application/queries/list-api-keys-for-user.ts`
- `src/infrastructure/persistence/schema/api-keys.ts`
- `src/infrastructure/persistence/migrations/0003_*.sql`
- `src/infrastructure/persistence/repositories/postgres-api-key-repository.ts`
- `src/infrastructure/auth/bun-password-api-key-hasher.ts` (nota:
  va en `infrastructure/auth/` por proximidad temática a otros
  hashers; alternativa es `infrastructure/security/`).
- `src/interfaces/http/schemas/api-key.ts`
- `src/frontend/lib/api/api-keys.ts`
- `src/frontend/hooks/use-api-keys.ts`
- `src/frontend/pages/ApiKeysPage.tsx`
- `src/frontend/components/ui/dialog.tsx` (vía shadcn CLI)

### Modificados
- `src/infrastructure/persistence/schema/index.ts` — re-export.
- `src/interfaces/http/server.ts` — wire 3 routes + DI.
- `src/frontend/components/Header.tsx` — link "API Keys".
- `src/frontend/frontend.tsx` — route `/settings/api-keys`.
- `package.json` — `radix-ui` ya está; shadcn dialog reusa.

## References
- `specs/mission.md` → "API key consumption" como deliverable V1.
- `specs/tech-stack.md` → API Keys section: format `ps_live_<...>`,
  `key_hash` con `Bun.password` argon2id, header
  `Authorization: Bearer`.
- `specs/roadmap.md` → P8 (canónico), P9 (consume las keys con
  middleware + rate limiting).
- `feedback_cqs_class_convention.md`.
