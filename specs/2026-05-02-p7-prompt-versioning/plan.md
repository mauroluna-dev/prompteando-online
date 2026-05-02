# P7 — Versionado de prompts · Plan

Numbered task groups. Cada grupo es una unidad coherente.

## 1. Domain layer (PromptVersion aggregate)
1.1. `src/domain/prompt-version/version-number.ts`:
- Branded type `VersionNumber`.
- `parseVersionNumber(input: number)`: integer ≥ 1, lanza
  `InvalidVersionNumberError`.

1.2. `src/domain/prompt-version/errors.ts`:
- `InvalidVersionNumberError`, `VersionNotFoundError`. Cada uno
  con `code`.

1.3. `src/domain/prompt-version/types.ts`:
```ts
export type PromptVersion = {
  id: string;
  promptId: string;
  versionNumber: VersionNumber;
  content: string;
  commitMessage: string | null;
  githubCommitSha: string | null;
  createdAt: Date;
};
```

1.4. `src/domain/prompt-version/index.ts` barrel.

1.5. Test mínimo: `__test__/version-number.test.ts` con casos
(integer ≥ 1 ok, 0 reject, -1 reject, 1.5 reject, NaN reject).

## 2. Application: port + 2 commands + 2 queries
2.1. `src/application/ports/version-repository.ts`:
```ts
export interface VersionRepository {
  appendNewVersion(version: PromptVersion): Promise<void>;
  findByPromptIdAndNumber(promptId: string, n: VersionNumber): Promise<PromptVersion | null>;
  findCurrentForPrompt(promptId: string): Promise<PromptVersion | null>;
  findAllForPrompt(promptId: string): Promise<PromptVersion[]>;
  countForPrompt(promptId: string): Promise<number>;
}
```

2.2. `src/application/commands/save-new-version.ts` —
`SaveNewVersionCommand`:
- Constructor: `(promptRepo, versionRepo)`.
- Input: `{ userId, slug, content, commitMessage? }`.
- Steps:
  1. `prompt = promptRepo.findBySlug(userId, parseSlug(slug))` —
     null → `PromptNotFoundError`.
  2. `current = versionRepo.findCurrentForPrompt(prompt.id)`.
  3. Si `current && current.content === content` → return current
     (signaled como no-op).
  4. `count = versionRepo.countForPrompt(prompt.id)`.
  5. Construir `PromptVersion` con `versionNumber = count + 1`,
     `id = crypto.randomUUID()`, message trimmed.
  6. `versionRepo.appendNewVersion(version)`.
  7. Devolver `{ version, isNoOp: false }`. Para el caso step 3:
     `{ version: current, isNoOp: true }`.

2.3. `src/application/commands/restore-version.ts` —
`RestoreVersionCommand`:
- Input: `{ userId, slug, versionNumber }`.
- Steps:
  1. Resolver prompt (auth check + 404).
  2. `target = findByPromptIdAndNumber(prompt.id, versionNumber)`
     — null → `VersionNotFoundError`.
  3. `current = findCurrentForPrompt(prompt.id)`.
  4. Si `current?.content === target.content` → return current
     (no-op signaled).
  5. `count + 1` → nueva version con `target.content` y
     `commitMessage = "Restore v" + versionNumber`.
  6. Append, return `{ version, isNoOp: false }`.

2.4. `src/application/queries/get-version.ts` — `GetVersionQuery`:
- Input: `{ userId, slug, versionNumber }`. Validates auth en
  prompt. Devuelve version o lanza `VersionNotFoundError`.

2.5. `src/application/queries/list-versions.ts` —
`ListVersionsQuery`:
- Input: `{ userId, slug }`. Devuelve `PromptVersion[]` DESC.

## 3. Infrastructure: schema + migration
3.1. Crear `src/infrastructure/persistence/schema/prompt-versions.ts`
con la tabla.

3.2. Editar `src/infrastructure/persistence/schema/prompts.ts`:
agregar `.references(() => promptVersions.id, { onDelete: "set null" })`
al `currentVersionId`.

⚠️ Hay un import circular aquí: `prompts.ts` importa de
`prompt-versions.ts` y viceversa. Drizzle lo maneja con
`AnyPgColumn` pattern o con late binding de la callback en
`.references(() => promptVersions.id)`. Si tsc se queja, romper el
ciclo declarando una `relations` aparte y solo refencias por nombre
de columna en una de las direcciones.

3.3. Schema barrel: `export * from "./prompt-versions"`.

3.4. `bun run db:generate`. Inspeccionar migration:
- CREATE TABLE prompt_versions con FK + UNIQUE INDEX.
- ALTER TABLE prompts ADD CONSTRAINT FK current_version_id.

3.5. `bun run db:migrate` aplica.

3.6. Verificar:
```bash
bun run db:psql -- -c "\d prompt_versions"
bun run db:psql -- -c "\d prompts" | grep current_version_id
```

## 4. Infrastructure: PostgresVersionRepository
4.1. `src/infrastructure/persistence/repositories/postgres-version-repository.ts`:
- Class `PostgresVersionRepository implements VersionRepository`.
- `appendNewVersion`:
  ```ts
  await this.db.transaction(async (tx) => {
    await tx.insert(promptVersions).values({...});
    await tx.update(prompts)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(eq(prompts.id, version.promptId));
  });
  ```
- Métodos restantes con SELECT directo.
- `mapRow` traduce row → entity (parsea `versionNumber`).

4.2. `bunx tsc --noEmit` clean.

## 5. HTTP: schemas + 4 routes
5.1. `src/interfaces/http/schemas/prompt-version.ts`:
```ts
export const saveVersionSchema = z.object({
  content: z.string().max(100_000),
  commitMessage: z.string().trim().max(200).optional(),
});
```

5.2. En `server.ts`:
- Instanciar `versionRepo = new PostgresVersionRepository(db)` y
  los 4 use cases con `new`.
- Agregar 4 routes Elysia:
  - `POST /api/prompts/:slug/versions` body validation +
    `SaveNewVersionCommand.execute`. Si `isNoOp`, devolver 200 +
    header `X-Version-NoOp: true`. Si fresh, 201.
  - `GET /api/prompts/:slug/versions` → lista DESC.
  - `GET /api/prompts/:slug/versions/:n` → 200 o 404.
  - `POST /api/prompts/:slug/versions/:n/restore` → 201 (o 200 si
    no-op) + nueva version. 404 si target no existe.

5.3. Bun.serve.routes:
```
"/api/prompts/:slug/versions": (req) => app.handle(req),
"/api/prompts/:slug/versions/:n": (req) => app.handle(req),
"/api/prompts/:slug/versions/:n/restore": (req) => app.handle(req),
```

5.4. Smoke:
```bash
# Sin auth: 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../versions
# Con auth:
curl -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"content":"hello v1"}' \
  http://localhost:3010/api/prompts/test/versions
# Repetir mismo content → no-op (200, header X-Version-NoOp)
```

## 6. Frontend: API client + hooks
6.1. `src/frontend/lib/api/versions.ts`:
- `listVersions(slug)`, `getVersion(slug, n)`,
  `saveVersion(slug, body)` (devuelve `{ version, isNoOp }` parseando
  el header), `restoreVersion(slug, n)`.

6.2. `src/frontend/hooks/use-versions.ts`:
- `useVersions(slug)`, `useVersion(slug, n)`.

## 7. Frontend: PromptDetailPage rewritten
7.1. Reescribir `src/frontend/pages/PromptDetailPage.tsx` con el
nuevo layout:
- 2 columns (CSS grid `lg:grid-cols-[1fr_280px]`).
- Estados:
  - **Empty** (`!data.versions.length`): card centrada con CTA
    "Create first version" → activa editor mode con content="".
  - **Editor mode** (default cuando hay current): textarea +
    commitMessage input + Save. No-op → mensaje "No changes" inline
    durante 3s.
  - **Viewing mode** (selección histórica): banner "Viewing v{n}"
    + textarea readonly + botón "Restore this version" + botón
    "Back to current".
- Usa `useState` para `mode: "edit" | "viewing-N" | "empty"`.

7.2. Componente `src/frontend/components/VersionHistory.tsx`:
- Recibe `versions: PromptVersion[]`, `currentNumber: number | null`,
  `selectedNumber: number | null`, `onSelect(n)`.
- Lista DESC de cards pequeñas: `v{N}` (bold si current),
  `commitMessage` (truncado), tiempo relativo.

7.3. Componente `src/frontend/components/PromptEditor.tsx`:
- Props: `initialContent`, `onSave(content, message)`, `pending`,
  `noOpMessage`.
- Layout: `<Textarea>` grande + `<Input>` para message + `<Button>`
  Save con spinner.
- Auto-detect cambios: button disabled si `content === initialContent`.

7.4. Eliminar el placeholder de Content que P6 dejó.

7.5. `bun run build` ok.

## 8. Pre-deploy: clean slate
8.1. Documentar en el PR description: antes de `bun run db:migrate`
en máquina del usuario, correr:
```bash
bun run db:psql -- -c "DELETE FROM prompts;"
```
para limpiar los prompts de prueba creados durante validación de P6.

8.2. La migration en sí no requiere data migration: agrega tabla
nueva y FK opcional.

## 9. Validación end-to-end
9.1. Pre-condiciones: postgres up, migrations aplicadas, sesión
activa, tunnel.

9.2. Server-side:
```bash
# Crear prompt
PROMPT_SLUG=$(curl -s -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"name":"Hola"}' http://localhost:3010/api/prompts | jq -r .slug)

# Save v1
curl -i -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"content":"hello world","commitMessage":"first"}' \
  http://localhost:3010/api/prompts/$PROMPT_SLUG/versions
# Expected: 201 + version con versionNumber=1

# Mismo content → no-op
curl -i -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"content":"hello world"}' \
  http://localhost:3010/api/prompts/$PROMPT_SLUG/versions
# Expected: 200 + X-Version-NoOp: true

# Distinto → v2
curl -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"content":"hello world v2"}' \
  http://localhost:3010/api/prompts/$PROMPT_SLUG/versions
# Expected: 201 + versionNumber=2

# Restore v1 → crea v3 con content de v1
curl -i -X POST -H "Cookie: $C" \
  http://localhost:3010/api/prompts/$PROMPT_SLUG/versions/1/restore
# Expected: 201 + versionNumber=3, content="hello world",
#           commitMessage="Restore v1"

# List
curl -H "Cookie: $C" http://localhost:3010/api/prompts/$PROMPT_SLUG/versions | jq 'length'
# Expected: 3
```

9.3. DB sanity:
```bash
bun run db:psql -- -c "SELECT version_number, commit_message FROM prompt_versions ORDER BY version_number;"
bun run db:psql -- -c "SELECT slug, current_version_id FROM prompts WHERE slug='$PROMPT_SLUG';"
# current_version_id apunta al row de v3.
```

9.4. Browser:
- Crear prompt nuevo → empty state.
- Click "Create first version" → editor abierto con content vacío.
- Escribir, Save → version 1 aparece en sidebar.
- Editar, Save → v2.
- Click v1 en sidebar → viewing mode con content de v1 + botón Restore.
- Click Restore → v3 creada, vuelve a editor mode con content de v1.
- Save sin cambios → mensaje "No changes" 3s, sidebar no cambia.

## 10. Cierre
10.1. Non-regression:
- `bun test` (incluye nuevos tests de version-number).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow, /api/me, /health intactos.
- Prompts CRUD de P6 sigue funcionando.
- Layer boundary greps clean.
- CQS convention: 4 commands + 5 queries (incluye nuevas).

10.2. `git status` limpio.

10.3. Commitear specs.

10.4. Abrir PR `feat/p7-prompt-versioning` → master.
