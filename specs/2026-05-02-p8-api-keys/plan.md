# P8 — API Keys management · Plan

Numbered task groups. Cada grupo es una unidad coherente.

## 1. Domain layer (ApiKey aggregate)
1.1. `src/domain/api-key/api-key-name.ts`:
- Branded type `ApiKeyName`.
- `parseApiKeyName(input)`: trim, validar 1-50 chars, lanza
  `InvalidApiKeyNameError`.

1.2. `src/domain/api-key/errors.ts`:
- `InvalidApiKeyNameError`, `ApiKeyNotFoundError`,
  `ApiKeyQuotaExceededError`, `ApiKeyAlreadyRevokedError`. Cada uno
  con `code`.

1.3. `src/domain/api-key/helpers.ts`:
- `generateApiKeyPlaintext()`: usa `crypto.getRandomValues` /
  `crypto.randomUUID` no — necesitamos 16 bytes hex. Bun expone
  `crypto.getRandomValues`. Shape: `"po_live_" + bytes.toString("hex")`.
- `extractApiKeyPrefix(plaintext)`: devuelve `plaintext.slice(0, 16)`
  (= `po_live_` + 8 hex).
- `API_KEY_PREFIX_LENGTH = 16`, `API_KEY_PLAINTEXT_LENGTH = 40`.

1.4. `src/domain/api-key/types.ts`:
```ts
export type ApiKey = {
  id: string;
  userId: string;
  name: ApiKeyName;
  prefix: string;
  keyHash: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};
```

1.5. Barrel `index.ts`.

1.6. Tests:
- `__test__/api-key-name.test.ts`: accept 1-50, reject empty / 51 chars.
- `__test__/helpers.test.ts`: `generateApiKeyPlaintext` produce string
  con prefix `po_live_` y 32 hex; `extractApiKeyPrefix` devuelve los
  primeros 16 chars.

## 2. Application: ports + commands + query
2.1. `src/application/ports/api-key-repository.ts`:
```ts
export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<void>;
  findById(userId: string, id: string): Promise<ApiKey | null>;
  findAllByUserId(userId: string): Promise<ApiKey[]>;
  setRevokedAt(userId: string, id: string, when: Date): Promise<boolean>;
  countActiveByUserId(userId: string): Promise<number>;
}
```

2.2. `src/application/ports/api-key-hasher.ts`:
```ts
export interface ApiKeyHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}
```

2.3. `src/application/commands/create-api-key.ts` —
`CreateApiKeyCommand`:
- Constructor `(repo, hasher)`.
- Input: `{ userId, name }`.
- Steps:
  1. Parse name vía `parseApiKeyName`.
  2. `count = repo.countActiveByUserId(userId)`. Si `count >= 10`,
     lanza `ApiKeyQuotaExceededError(10)`.
  3. plaintext = `generateApiKeyPlaintext()`.
  4. prefix = `extractApiKeyPrefix(plaintext)`.
  5. keyHash = `await hasher.hash(plaintext)`.
  6. Construir `ApiKey` con id, userId, name, prefix, keyHash,
     lastUsedAt=null, revokedAt=null, createdAt=now.
  7. `await repo.save(apiKey)`.
  8. Return `{ apiKey, plaintext }`.

2.4. `src/application/commands/revoke-api-key.ts`:
- Constructor `(repo)`.
- Input: `{ userId, id }`.
- Pasos:
  1. `apiKey = repo.findById(userId, id)` → null → `ApiKeyNotFoundError`.
  2. Si `apiKey.revokedAt !== null` → `ApiKeyAlreadyRevokedError`.
  3. `repo.setRevokedAt(userId, id, new Date())`.

2.5. `src/application/queries/list-api-keys-for-user.ts`:
- `ListApiKeysForUserQuery` con `execute(userId)` → `repo.findAllByUserId(userId)`.

## 3. Infrastructure: schema + migration
3.1. `src/infrastructure/persistence/schema/api-keys.ts`:
```ts
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [
  index("api_keys_user_active_idx").on(t.userId, t.revokedAt),
]);
```

3.2. `schema/index.ts` re-export.

3.3. `bun run db:generate` → 0003_*.sql.

3.4. `bun run db:migrate` aplica.

3.5. Verify:
```bash
bun run db:psql -- -c "\d api_keys"
```

## 4. Infrastructure: repo + hasher
4.1. `src/infrastructure/persistence/repositories/postgres-api-key-repository.ts`:
- `save`, `findById`, `findAllByUserId` (DESC by createdAt),
  `setRevokedAt` (UPDATE returning rowsAffected),
  `countActiveByUserId` (`WHERE revoked_at IS NULL`).

4.2. `src/infrastructure/auth/bun-password-api-key-hasher.ts`:
```ts
import type { ApiKeyHasher } from "@/application/ports/api-key-hasher";

export class BunPasswordApiKeyHasher implements ApiKeyHasher {
  async hash(plaintext: string): Promise<string> {
    return Bun.password.hash(plaintext, { algorithm: "argon2id" });
  }
  async verify(plaintext: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plaintext, hash);
  }
}
```

## 5. HTTP: schemas + 3 routes
5.1. `src/interfaces/http/schemas/api-key.ts`:
```ts
export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(50),
});
```

5.2. server.ts composition root:
```ts
const apiKeyRepo = new PostgresApiKeyRepository(db);
const apiKeyHasher = new BunPasswordApiKeyHasher();
const createApiKey = new CreateApiKeyCommand(apiKeyRepo, apiKeyHasher);
const revokeApiKey = new RevokeApiKeyCommand(apiKeyRepo);
const listApiKeys = new ListApiKeysForUserQuery(apiKeyRepo);
```

5.3. 3 routes Elysia:
- `POST /api/keys`: requireUser → parse body → execute → return
  `{ apiKey: { ...sin keyHash }, plaintext }` con 201. Errores:
  ZodError → 400, InvalidApiKeyNameError → 400,
  ApiKeyQuotaExceededError → 429.
- `GET /api/keys`: requireUser → execute → mapear cada item
  removiendo `keyHash` → 200 + array.
- `DELETE /api/keys/:id`: requireUser → execute → 204. Errores:
  ApiKeyNotFoundError → 404, ApiKeyAlreadyRevokedError → 410.

5.4. Bun.serve.routes:
```
"/api/keys": (req) => app.handle(req),
"/api/keys/*": (req) => app.handle(req),
```

5.5. Smoke server-side:
```bash
# 401 sin auth
curl -i -X POST .../api/keys -d '{"name":"x"}'
# Crear
curl -X POST -H "$C" -H "Content-Type: application/json" \
  -d '{"name":"n8n-prod"}' http://localhost:3010/api/keys
# Listar
curl -H "$C" http://localhost:3010/api/keys
# Revoke
curl -X DELETE -H "$C" http://localhost:3010/api/keys/<id>
```

## 6. Frontend: shadcn dialog + API client + hooks
6.1. `bunx shadcn add dialog` → instala `dialog.tsx`.

6.2. `src/frontend/lib/api/api-keys.ts`:
- `listApiKeys()`: GET → `ApiKeyListItem[]` (sin keyHash).
- `createApiKey({ name })`: POST → `{ apiKey, plaintext }`.
- `revokeApiKey(id)`: DELETE → void.

6.3. `src/frontend/hooks/use-api-keys.ts`:
- `useApiKeys()`: SWR sobre `/api/keys`.

## 7. Frontend: ApiKeysPage + Header link
7.1. `src/frontend/pages/ApiKeysPage.tsx`:
- Layout: header con title + "X / 10 active" counter + botón Generate.
- Generate disabled cuando `activeCount >= 10`.
- Click Generate → form inline con Input name + botones Create/Cancel.
- Tras create → `Dialog` open con plaintext + botón Copy + botón
  Done. Dismiss → form se cierra y key aparece en lista.
- Lista:
  - Active: name, prefix (mono), createdAt, lastUsedAt o "Never used",
    botón Revoke (destructive).
  - Revoked: misma row pero con opacidad reducida, badge "Revoked",
    sin botón.

7.2. `src/frontend/components/Header.tsx`:
- Agregar link `<NavLink to="/settings/api-keys">API Keys</NavLink>`
  entre el logo y el `<UserMenu />`.
- Active state styling vía className callback.

7.3. `src/frontend/frontend.tsx`:
- Agregar nested route `<Route path="settings/api-keys" element={<ApiKeysPage />} />`.

7.4. `bun run build` ok.

## 8. Validación end-to-end
8.1. Pre-condiciones: postgres up, migration aplicada, sesión activa.

8.2. Server-side:
```bash
# Quota check: crear 10 keys → la 11ª debe fallar
for i in 1..10; do
  curl -s -X POST -H "$C" -H "Content-Type: application/json" \
    -d "{\"name\":\"key-$i\"}" http://localhost:3010/api/keys | jq -r .apiKey.prefix
done
# 11ª:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "$C" \
  -H "Content-Type: application/json" \
  -d '{"name":"overflow"}' http://localhost:3010/api/keys
# Expected: 429

# Revocar una → ahora hay 9 active, 11ª debe pasar
ID=$(curl -s -H "$C" http://localhost:3010/api/keys | jq -r '.[0].id')
curl -X DELETE -H "$C" http://localhost:3010/api/keys/$ID
# Expected: 204
# Re-revocar → 410
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "$C" \
  http://localhost:3010/api/keys/$ID
# Expected: 410

# 11ª ahora debe pasar
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "$C" \
  -H "Content-Type: application/json" \
  -d '{"name":"after-revoke"}' http://localhost:3010/api/keys
# Expected: 201
```

8.3. DB sanity:
```bash
bun run db:psql -- -c "SELECT count(*) FILTER (WHERE revoked_at IS NULL) AS active, count(*) AS total FROM api_keys;"
# Expected: active <= 10, total > 10 si hubo revokes.
```

8.4. Browser:
- Header: link "API Keys" visible al lado del logo.
- Click → `/settings/api-keys`. Empty state al inicio.
- Generate → form name → submit → Dialog con plaintext.
- Copy + Done.
- Lista muestra el prefix (no la full key).
- Revoke → row pasa a gris con badge.
- Crear hasta llegar al límite → botón Generate disabled.

## 9. Cierre
9.1. Non-regression:
- `bun test` (incluye nuevos tests de api-key-name + helpers).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth, /api/me, /health, prompts CRUD, versionado: todo intacto.
- Layer boundaries: domain + application limpios.
- CQS counts: 5 Commands + 6 Queries + 11 execute methods.

9.2. `git status` clean.

9.3. Commit specs + abrir PR.
