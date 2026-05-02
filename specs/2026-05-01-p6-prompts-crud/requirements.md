# P6 — Prompts CRUD (sin versionado) · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P6. P0–P5 dejaron la app autenticada con
session UX completa, pero sin feature de dominio real. P6 introduce
**el primer aggregate del producto**: el Prompt como entidad
gestionable (crear / listar / detallar / borrar).

V1 deliberada: en P6 NO hay edición de contenido del prompt — eso
vive en `prompt_versions.content` y entra en P7. P6 maneja solo
metadata (name, slug, description). Dura unos días pero deja el
shape canónico del aggregate listo para que P7 sume versionado
sobre la misma base.

## In scope
### Domain (`src/domain/prompt/`)
- VO `Slug` (branded type + `parseSlug`/`generateSlug`).
- VO `PromptName` (branded type + `parsePromptName`).
- Errors: `InvalidSlugError`, `InvalidPromptNameError`,
  `PromptNotFoundError`, `PromptDescriptionTooLongError`.
- Type `Prompt` (entity DTO):
  `{ id, userId, name, slug, description, currentVersionId,
   createdAt, updatedAt }`.
  En P6, `currentVersionId` siempre es `null` (no hay versions).
- Slug generation algorithm (deterministic):
  - lowercase + reemplazar espacios/`_` por `-`
  - strip non-alphanumeric excepto `-`
  - collapse `--+` → `-`
  - trim `-` leading/trailing
  - truncar a 60 chars
  - fallback `"prompt"` si queda vacío

### Application (`src/application/`)
- Port `PromptRepository` (`ports/prompt-repository.ts`):
  - `save(prompt)`
  - `findBySlug(userId, slug)`
  - `findAllByUserId(userId)`
  - `delete(userId, slug)`
  - `findNextAvailableSlug(userId, baseSlug)` — devuelve
    `baseSlug` si libre, o `baseSlug-N` con N mínimo libre.
- Commands (clases con method `execute`, convención de tech-stack.md):
  - `commands/create-prompt.ts` — `CreatePromptCommand`. Input de
    `execute`: `{ userId, name, description? }`. Genera slug,
    resuelve colisión, persiste, devuelve `Prompt`.
  - `commands/delete-prompt.ts` — `DeletePromptCommand`. Input de
    `execute`: `{ userId, slug }`. Lanza `PromptNotFoundError` si
    no existe.
- Queries (clases con method `execute`):
  - `queries/get-prompt-by-slug.ts` — `GetPromptBySlugQuery`.
  - `queries/list-prompts-for-user.ts` — `ListPromptsForUserQuery`,
    ordena por `createdAt DESC`.

### Infrastructure
- Schema `src/infrastructure/persistence/schema/prompts.ts`:
  - `id text PK default crypto.randomUUID()`
  - `user_id text NOT NULL FK users.id ON DELETE CASCADE`
  - `name text NOT NULL`
  - `slug text NOT NULL`
  - `description text` (nullable, max 500 chars enforced en domain)
  - `current_version_id text` (nullable, FK pendiente para P7)
  - `created_at timestamp NOT NULL DEFAULT NOW()`
  - `updated_at timestamp NOT NULL DEFAULT NOW()`
  - UNIQUE constraint `(user_id, slug)`.
- Schema barrel actualizado: `export * from "./prompts"`.
- Migration generada con `db:generate` y aplicada.
- `src/infrastructure/persistence/repositories/postgres-prompt-repository.ts`
  implementa el port con Drizzle.

### HTTP (`src/interfaces/http/`)
- 4 routes nuevas en `server.ts`:
  - `POST /api/prompts` — body validado con Zod
    (`{ name: string(1-100), description?: string(0-500) }`).
    Returns 201 + `Prompt`. 401 sin sesión, 400 si falla validación.
  - `GET /api/prompts` — returns 200 + `Prompt[]` (del usuario).
  - `GET /api/prompts/:slug` — returns 200 + `Prompt` o 404.
  - `DELETE /api/prompts/:slug` — returns 204 o 404.
- Helper `requireUser(request)` (en
  `interfaces/http/lib/require-user.ts`): retorna user o `Response`
  401. Patrón reusable para próximas fases.
- Zod schemas en `interfaces/http/schemas/prompt.ts`.
- Bun.serve.routes agrega `/api/prompts` y `/api/prompts/*`.

### Frontend
- API client tipado: `src/frontend/lib/api/prompts.ts` exporta
  `listPrompts`, `getPrompt`, `createPrompt`, `deletePrompt`.
- Hooks: `src/frontend/hooks/use-prompts.ts` con `usePrompts()` y
  `usePrompt(slug)` (SWR).
- Pages:
  - `src/frontend/pages/PromptsListPage.tsx` — lista o empty state
    con CTA "Create your first prompt".
  - `src/frontend/pages/PromptCreatePage.tsx` — form con
    `react-hook-form` + Zod resolver. Input `name`, Textarea
    `description`. Tras submit redirige a `/prompts/:slug`.
  - `src/frontend/pages/PromptDetailPage.tsx` — muestra metadata
    (name grande, slug en código, fecha, description) + sección
    "Content" con placeholder "Editor coming next phase" + botón
    Delete (con confirm). Tras delete vuelve a `/`.
- Refactor de `App.tsx` → layout con `<Header />` + `<main><Outlet />`.
  El contenido del scaffold (logo, APITester) se reemplaza por las
  rutas anidadas.
- `frontend.tsx` con nested routes (React Router):
  - `/login` → `<LoginPage />`
  - `/` → `<RequireAuth><AppLayout /></RequireAuth>`:
    - index → `<PromptsListPage />`
    - `prompts/new` → `<PromptCreatePage />`
    - `prompts/:slug` → `<PromptDetailPage />`
- Borrar `src/frontend/APITester.tsx` (scaffold viejo, ya no usado).

### Deps a instalar
- `react-hook-form` (en `.env.example`-style: ya prevista en
  tech-stack.md, no instalada hasta P6).
- `@hookform/resolvers` para integrar zod.

## Out of scope
- Edición de contenido del prompt (P7 introduce versions y editor).
- Autorización / sharing / teams.
- Rate limiting (P9).
- Soft delete / undo / trash bin.
- Búsqueda / filtrado en la lista (lista ordenada por created_at,
  sin paginación; en V1 con pocos prompts por user alcanza).
- Markdown / preview de description.
- Importar / exportar (P13).

## Decisiones acordadas (este turno)

### 1. Slug collision: numeric suffix
**Decisión**: tras la sanitización, `findNextAvailableSlug(userId,
baseSlug)` chequea si `baseSlug` está libre; si no, prueba
`baseSlug-2`, `baseSlug-3`, etc. hasta encontrar uno libre.

**Razón**: sin fricción para el user (siempre logra crear).
Predecible — un user con 3 "Marketing email" termina con slugs
`marketing-email`, `marketing-email-2`, `marketing-email-3`.
Lectura limpia para URLs y referenciar desde la API. ~5 LOC en el
adapter Postgres (LIKE + parse del sufijo).

**Implementación**:
```sql
SELECT slug FROM prompts
WHERE user_id = $1 AND slug LIKE $2 || '%'
ORDER BY slug;
```
parsear sufijos `-N`, encontrar el menor entero libre ≥ 2.

### 2. Detail UX en P6: metadata + placeholder
**Decisión**: la pantalla de detalle muestra el aggregate completo
de P6 (name, slug, description, fecha) + una sección "Content"
con un mensaje claro de que el editor llega en P7. Botón "Edit
content" disabled. Botón "Delete" funcional.

**Razón**: separación de concerns clara entre P6 (metadata) y P7
(contenido versionado). El user entiende que el feature está
evolucionando, sin engaños. Cuando P7 mergee, este placeholder se
reemplaza por el editor + historial sin tocar P6.

### 3. Routing: `/` lista + `/prompts/new` + `/prompts/:slug`
**Decisión**: home directamente lista los prompts. Sin `/prompts`
intermedio.

**Razón**: V1 con un solo concepto en la app. El home no necesita
chrome adicional. Si en V2 aparecen Settings, API Keys, etc., cada
uno vive en su sub-path y `/` puede convertirse en dashboard sin
breaking changes (los users que tengan `/` en URL bar siguen
viendo prompts).

## Decisiones técnicas derivadas

### Slug VO con branded type
```ts
// src/domain/prompt/slug.ts
declare const __brand: unique symbol;
export type Slug = string & { [__brand]: "Slug" };

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export function parseSlug(input: string): Slug {
  if (!SLUG_REGEX.test(input)) throw new InvalidSlugError(input);
  return input as Slug;
}

export function generateSlug(name: string): Slug {
  const cleaned = name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-+$/, ""); // re-trim after slice
  return parseSlug(cleaned || "prompt");
}
```

### Composition root extension
`server.ts` ahora arma:
```ts
const promptRepo = new PostgresPromptRepository(db);
const createPrompt = new CreatePromptCommand(promptRepo);
const deletePrompt = new DeletePromptCommand(promptRepo);
const getPromptBySlug = new GetPromptBySlugQuery(promptRepo);
const listPromptsForUser = new ListPromptsForUserQuery(promptRepo);
```

Cada command/query expone un único método público `execute(...)`:
```ts
const prompt = await createPrompt.execute({ userId, name, description });
const prompts = await listPromptsForUser.execute(userId);
```

### Zod schemas en HTTP boundary
```ts
// src/interfaces/http/schemas/prompt.ts
export const createPromptSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});
```
HTTP route parsea con `createPromptSchema.parse(body)` antes de
llamar al command. Domain VOs validan invariantes adicionales
(slug regex, etc.).

### Test plan (sin tests automatizados todavía)
- Tests unitarios de `parseSlug`/`generateSlug` para casos de
  edge: emoji, doble espacio, vacío después de cleanup, etc.
- Tests de integración del repo quedan para futuras fases (P14
  CI con Postgres dedicado).
- En P6 dejamos al menos un test unitario de `generateSlug` para
  validar que la cadena de transformaciones pasa los casos clave.

## Critical files

### Nuevos
- `src/domain/prompt/{slug,prompt-name,errors,types,index}.ts`
- `src/domain/prompt/__test__/slug.test.ts` (al menos un test del VO)
- `src/application/ports/prompt-repository.ts`
- `src/application/commands/{create-prompt,delete-prompt}.ts`
- `src/application/queries/{get-prompt-by-slug,list-prompts-for-user}.ts`
- `src/infrastructure/persistence/schema/prompts.ts`
- `src/infrastructure/persistence/migrations/0001_*.sql` (generada)
- `src/infrastructure/persistence/repositories/postgres-prompt-repository.ts`
- `src/interfaces/http/schemas/prompt.ts`
- `src/interfaces/http/lib/require-user.ts`
- `src/frontend/lib/api/prompts.ts`
- `src/frontend/hooks/use-prompts.ts`
- `src/frontend/pages/{PromptsListPage,PromptCreatePage,PromptDetailPage}.tsx`

### Modificados
- `src/infrastructure/persistence/schema/index.ts` — re-export
  prompts.
- `src/interfaces/http/server.ts` — wire 4 routes + commands/queries.
- `src/frontend/App.tsx` — layout con Outlet.
- `src/frontend/frontend.tsx` — nested routes.
- `package.json` — `react-hook-form`, `@hookform/resolvers`.

### Eliminados
- `src/frontend/APITester.tsx` (scaffold viejo).
- `src/application/commands/.gitkeep` (al fin tiene archivos
  reales).

## References
- `specs/mission.md` → "V1 = storage + versionado + API".
- `specs/tech-stack.md` → CQS, Zod en boundary, repository pattern.
- `specs/roadmap.md` → P6 (definición canónica), P7 (consume el
  aggregate para versionado).
- `feedback_authjs_core.md` → patrón POST + CSRF para signin/signout
  (no aplica a /api/prompts; estos son fetch normales con cookie).
