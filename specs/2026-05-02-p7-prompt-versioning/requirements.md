# P7 — Versionado de prompts · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P7. P6 dejó el aggregate Prompt con
metadata, pero el detalle solo muestra "editor coming next phase". P7
trae el contenido real: un nuevo aggregate `PromptVersion` ligado a
`Prompt`, append-only, y reemplaza el placeholder por un editor
funcional con historial de versiones lateral.

Al cerrar P7 el producto recién es **usable** end-to-end:
crear prompt → escribir contenido → guardar versiones → restaurar
versiones históricas. P8+ suma API keys para consumirlos desde
afuera.

## In scope

### Domain (`src/domain/prompt-version/`)
- VO `VersionNumber` (branded type sobre `number`,
  `parseVersionNumber` valida integer ≥ 1).
- Entity `PromptVersion`:
  ```ts
  type PromptVersion = {
    id: string;
    promptId: string;
    versionNumber: VersionNumber;
    content: string;
    commitMessage: string | null;
    githubCommitSha: string | null; // null en P7, P11 lo setea
    createdAt: Date;
  };
  ```
- Errors: `InvalidVersionNumberError`, `VersionNotFoundError`.

### Application
- Port `VersionRepository`:
  - `appendNewVersion(version)` — INSERT versión + UPDATE
    `prompts.current_version_id` **atómicamente** (Drizzle
    transaction en el adapter).
  - `findByPromptIdAndNumber(promptId, versionNumber)`.
  - `findCurrentForPrompt(promptId)`.
  - `findAllForPrompt(promptId)` — orden DESC por
    `versionNumber`.
  - `countForPrompt(promptId)`.
- Use cases (clases con `execute`):
  - `SaveNewVersionCommand`: input `{ userId, slug, content,
    commitMessage? }`. Resuelve prompt por slug (auth), carga
    current version, si `content === currentContent` retorna
    current (no-op), si no calcula `versionNumber = count + 1`,
    arma entity y llama `appendNewVersion`.
  - `RestoreVersionCommand`: input `{ userId, slug,
    versionNumber }`. Resuelve prompt y version histórica, si
    `target.content === current.content` retorna current (no-op),
    si no crea nueva version con `content = target.content` y
    `commitMessage = "Restore v{N}"`, append.
  - `ListVersionsQuery`: `{ userId, slug }` → versions DESC.
  - `GetVersionQuery`: `{ userId, slug, versionNumber }` →
    `PromptVersion` o `VersionNotFoundError`.

### Infrastructure
- Schema `src/infrastructure/persistence/schema/prompt-versions.ts`:
  - `id text PK default crypto.randomUUID()`
  - `prompt_id text NOT NULL FK prompts.id ON DELETE CASCADE`
  - `version_number integer NOT NULL`
  - `content text NOT NULL`
  - `commit_message text` (nullable)
  - `github_commit_sha text` (nullable, P11)
  - `created_at timestamp NOT NULL DEFAULT NOW()`
  - UNIQUE constraint `(prompt_id, version_number)`
- Update schema `prompts.ts`: agregar FK explícita
  `current_version_id → prompt_versions.id ON DELETE SET NULL`
  (en P6 era nullable sin FK).
- Migration generada via `db:generate`.
- `PostgresVersionRepository`:
  - `appendNewVersion`: usa `db.transaction()` para INSERT + UPDATE.
  - Queries via Drizzle.

### HTTP
- 4 routes nuevas en `server.ts`:
  - `POST /api/prompts/:slug/versions` body
    `{ content: string(0-100000), commitMessage?: string(0-200) }`.
    201 + DTO. Si no-op, devuelve la version actual con 200 +
    header `X-Version-NoOp: true`.
  - `GET /api/prompts/:slug/versions` → 200 + `PromptVersion[]`.
  - `GET /api/prompts/:slug/versions/:n` → 200 + `PromptVersion` o
    404.
  - `POST /api/prompts/:slug/versions/:n/restore` → 201 + new
    version. 404 si la versión target no existe.
- Zod schemas en `interfaces/http/schemas/prompt-version.ts`.
- Bun.serve.routes agrega las rutas nuevas.

### Frontend
- API client: `src/frontend/lib/api/versions.ts` con `listVersions`,
  `getVersion`, `saveVersion`, `restoreVersion`.
- Hooks: `src/frontend/hooks/use-versions.ts` (`useVersions(slug)`,
  `useVersion(slug, n)`).
- `PromptDetailPage` rewritten:
  - Layout 2 cols: editor a la izquierda (~70%), history sidebar a
    la derecha (~30%).
  - **Empty state** (prompt sin versions todavía):
    placeholder + textarea vacío + botón "Create first version".
  - **Editor mode** (default cuando hay current version): textarea
    con `content` cargado, input para `commitMessage`, botón Save.
    No-op detectado → mensaje "No changes" inline (sin toast lib).
  - **Viewing historical** (click en version sidebar): banner
    "Viewing version N" + textarea readonly + botón "Restore"
    (vuelve al editor con content de esa version) + link "Back
    to current".
- History sidebar: lista de versions DESC por number, cada item
  muestra `v{N}` + commitMessage (truncado) + tiempo relativo
  (e.g., "2 days ago"). Versión actual highlighted. Click cambia
  a viewing mode.
- Eliminar el placeholder "Editor coming next phase" del P6.

### Pre-step: clean slate
Antes del primer save tras P7 mergeado:
```bash
bun run db:psql -- -c "DELETE FROM prompts;"
```
Borra los prompts de prueba creados durante P6 (todos sin versions).
P7 schema agrega la FK `current_version_id → prompt_versions.id`,
y los prompts existentes ya tenían `current_version_id = null` así
que la migration no los rompe — pero el user decidió empezar
limpio. La limpieza es manual (no es parte de un script).

## Out of scope
- Edición del nombre/description del prompt (P6 settled, no
  vuelve en P7).
- Diff entre versions (UI de "vs"). Polish P16.
- Comments, branches, merge — esto NO es git, son versiones lineales.
- Sync con GitHub (P10/P11).
- Tags / labels en versions más allá de `commitMessage`.
- Locking concurrente (dos saves simultáneos del mismo prompt
  podrían carrera por `version_number`; aceptable en V1, mitigado
  por el UNIQUE constraint que rejectaría el segundo).
- Tests automatizados de integration (P14 con CI).

## Decisiones acordadas (este turno)

### 1. Initial version: clean slate + empty state UI
**Decisión**:
- Backend acepta prompts con `currentVersionId = null`
  indefinidamente — comportamiento P6 no cambia.
- Frontend del detalle: si no hay versions, muestra empty state
  con CTA "Create first version" que abre el editor con
  `content = ""`.
- Pre-deploy: el user borra manualmente los prompts de prueba de
  P6 (`DELETE FROM prompts;`). Schema migration de P7 no requiere
  data migration.

**Razón**: append-only puro (no se inventan versions placeholder).
El historial nunca tiene una "v1 vacía" automática. Cuando el user
hace Save por primera vez, ese ES su v1 — el momento que él decidió
escribir.

### 2. Save idempotente: detectar no-op
**Decisión**: `SaveNewVersionCommand` carga la current version
antes de escribir. Si `input.content === currentVersion.content`
(string equality estricta), retorna la current sin escribir.
Frontend muestra "No changes" inline.

**Razón**: mantiene historial limpio (3 saves seguidos del mismo
content = 1 version). Costo: una query SELECT extra por save.
Aceptable. Para empty content (`""`), el caso edge es: no hay
current version → no-op no aplica, escribe v1 con `content = ""`.

### 3. Editor inline en `/prompts/:slug`
**Decisión**: el detail page deja de ser "metadata + placeholder";
ahora tiene editor + history sidebar en una sola URL.

**Razón**: simplifica navegación (un solo URL para ver/editar/
restaurar). Persona 1 (no-coder con n8n) abre el prompt, ve el
contenido, edita, guarda — sin saltar entre rutas. Cuando el user
quiera "ver readonly" para compartir, puede hacer click en una
version del sidebar (modo viewing) y compartir esa URL si
agregamos query params en el futuro.

## Decisiones técnicas derivadas

### Atomicidad
`appendNewVersion` usa `db.transaction((tx) => { tx.insert(...); tx.update(prompts).set({ currentVersionId }) })`. La transaction garantiza que un fallo en cualquiera de los dos statements deshace ambos. Es la única primitiva de transacción en el código de P7.

### Schema de PromptVersion shape
```ts
import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { prompts } from "./prompts";

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    commitMessage: text("commit_message"),
    githubCommitSha: text("github_commit_sha"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prompt_versions_prompt_number_idx").on(t.promptId, t.versionNumber)],
);
```

Y en `schema/prompts.ts` se agrega la FK que P6 dejó en standby:
```ts
currentVersionId: text("current_version_id")
  .references(() => promptVersions.id, { onDelete: "set null" }),
```

⚠️ Esto es FK circular declarativa: `prompts.current_version_id`
→ `prompt_versions.id` y `prompt_versions.prompt_id` → `prompts.id`.
Drizzle Kit maneja la generación de migration ordenando los
`CREATE TABLE` y separando los `ALTER TABLE ADD CONSTRAINT`.
La operación es válida porque ambos lados del cycle son nullable
o sus rows no preexisten cruzados al insert.

### HTTP no-op signaling
- POST `/api/prompts/:slug/versions` con content idéntico a current:
  - Status: 200 (no 201)
  - Header: `X-Version-NoOp: true`
  - Body: la version actual (no se escribió nada nueva)
- Esto permite al frontend detectar el no-op sin reparsear los
  diffs en cliente.

### Frontend version count límite
La sidebar muestra todas las versions del prompt (sin paginación
en V1). Si el user supera ~100 versions, agregamos paginación en
P16. Por ahora `findAllForPrompt` es un `SELECT *`.

## Critical files

### Nuevos
- `src/domain/prompt-version/{types,version-number,errors,index}.ts`
- `src/application/ports/version-repository.ts`
- `src/application/commands/{save-new-version,restore-version}.ts`
- `src/application/queries/{get-version,list-versions}.ts`
- `src/infrastructure/persistence/schema/prompt-versions.ts`
- `src/infrastructure/persistence/migrations/0002_*.sql`
- `src/infrastructure/persistence/repositories/postgres-version-repository.ts`
- `src/interfaces/http/schemas/prompt-version.ts`
- `src/frontend/lib/api/versions.ts`
- `src/frontend/hooks/use-versions.ts`
- `src/frontend/components/PromptEditor.tsx`
- `src/frontend/components/VersionHistory.tsx`

### Modificados
- `src/infrastructure/persistence/schema/index.ts` — re-export.
- `src/infrastructure/persistence/schema/prompts.ts` — FK
  `current_version_id → prompt_versions.id`.
- `src/interfaces/http/server.ts` — wire 4 routes nuevas + DI.
- `src/frontend/pages/PromptDetailPage.tsx` — rewritten (editor
  inline + history sidebar).

## References
- `specs/mission.md` → "V1 = storage + versionado + API".
- `specs/tech-stack.md` → CQS classes, transactions sobre Drizzle.
- `specs/roadmap.md` → P7 (verificación canónica), P9 (consume
  versions vía API pública), P11 (commit on save).
- `feedback_cqs_class_convention.md` → todos los use cases nuevos
  como clases con `execute`.
