# P6 — Prompts CRUD · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una.

## 1. Install P6 deps
1.1. `bun add react-hook-form @hookform/resolvers`
1.2. Confirmar versions y commitear `package.json` + `bun.lock`.

## 1b. Adoptar convención CQS class-based en código existente
Antes de sumar los nuevos commands/queries de P6, alinear el código
heredado al patrón canónico (clases con sufijo `Command`/`Query`
y método público `execute`) per `specs/tech-stack.md`.

1b.1. Refactor `src/application/queries/get-current-user.ts`:
- Reemplazar `makeGetCurrentUser` factory por clase
  `GetCurrentUserQuery`:
  ```ts
  export class GetCurrentUserQuery {
    constructor(private readonly resolveSession: SessionResolver) {}
    async execute(request: Request): Promise<CurrentUserDTO | null> {
      const session = await this.resolveSession(request);
      return session?.user ?? null;
    }
  }
  ```

1b.2. Update `src/interfaces/http/server.ts`:
- Reemplazar `const getCurrentUser = makeGetCurrentUser(...)` por
  `const getCurrentUser = new GetCurrentUserQuery(...)`.
- Reemplazar `getCurrentUser(request)` por
  `getCurrentUser.execute(request)`.

1b.3. `bunx tsc --noEmit` clean. Commit como
`refactor(p6): adopt CQS class convention in get-current-user`.

## 2. Domain layer (Prompt aggregate)
2.1. Crear `src/domain/prompt/slug.ts`:
- Branded type `Slug`.
- Regex `/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/`.
- `parseSlug(input)` lanza `InvalidSlugError`.
- `generateSlug(name)` aplica la cadena de transformaciones
  (lowercase, replace space/_, strip non-alnum, collapse, trim,
  truncate 60, fallback "prompt").

2.2. Crear `src/domain/prompt/prompt-name.ts`:
- Branded type `PromptName`.
- `parsePromptName(input)`: trim, validar 1–100 chars, lanza
  `InvalidPromptNameError`.

2.3. Crear `src/domain/prompt/errors.ts`:
- `InvalidSlugError`, `InvalidPromptNameError`,
  `PromptNotFoundError`, `PromptDescriptionTooLongError`.
- Cada uno extiende Error con un `code` string para mapear a HTTP.

2.4. Crear `src/domain/prompt/types.ts`:
```ts
export type Prompt = {
  id: string;
  userId: string;
  name: string;
  slug: Slug;
  description: string | null;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

2.5. Crear `src/domain/prompt/index.ts` barrel.

2.6. Crear `src/domain/prompt/__test__/slug.test.ts` con casos:
- `generateSlug("My Prompt")` → `"my-prompt"`
- `generateSlug("MARKET 2024 🚀")` → `"market-2024"`
- `generateSlug("   ")` → `"prompt"`
- `parseSlug("Invalid Slug")` lanza error.

## 3. Application layer (port + commands + queries)
3.1. `src/application/ports/prompt-repository.ts`:
```ts
export interface PromptRepository {
  save(prompt: Prompt): Promise<void>;
  findBySlug(userId: string, slug: Slug): Promise<Prompt | null>;
  findAllByUserId(userId: string): Promise<Prompt[]>;
  delete(userId: string, slug: Slug): Promise<boolean>;
  findNextAvailableSlug(userId: string, baseSlug: Slug): Promise<Slug>;
}
```

3.2. `src/application/commands/create-prompt.ts` —
`CreatePromptCommand` clase con `execute`:
```ts
import type { PromptRepository } from "@/application/ports/prompt-repository";
import { generateSlug, parsePromptName } from "@/domain/prompt";
import type { Prompt } from "@/domain/prompt";

type CreatePromptInput = { userId: string; name: string; description?: string };

export class CreatePromptCommand {
  constructor(private readonly repo: PromptRepository) {}

  async execute(input: CreatePromptInput): Promise<Prompt> {
    const promptName = parsePromptName(input.name);
    const baseSlug = generateSlug(input.name);
    const slug = await this.repo.findNextAvailableSlug(input.userId, baseSlug);
    const now = new Date();
    const prompt: Prompt = {
      id: crypto.randomUUID(),
      userId: input.userId,
      name: promptName,
      slug,
      description: input.description ?? null,
      currentVersionId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(prompt);
    return prompt;
  }
}
```

3.3. `src/application/commands/delete-prompt.ts` —
`DeletePromptCommand` con `execute({ userId, slug })`. Llama
`repo.delete()`; si devuelve `false`, lanza `PromptNotFoundError`.

3.4. `src/application/queries/get-prompt-by-slug.ts` —
`GetPromptBySlugQuery` con `execute(userId, slug)`:
- Llama `repo.findBySlug`; lanza `PromptNotFoundError` si null.

3.5. `src/application/queries/list-prompts-for-user.ts` —
`ListPromptsForUserQuery` con `execute(userId)` que llama
`repo.findAllByUserId` y devuelve `Prompt[]`.

3.6. Eliminar `src/application/commands/.gitkeep` (ya hay archivos
reales).

## 4. Infrastructure: schema + migration
4.1. `src/infrastructure/persistence/schema/prompts.ts`:
```ts
export const prompts = pgTable("prompts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  currentVersionId: text("current_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("prompts_user_slug_idx").on(t.userId, t.slug),
]);
```

4.2. Actualizar `schema/index.ts`: `export * from "./prompts"`.

4.3. `bun run db:generate` → produce
`src/infrastructure/persistence/migrations/0001_*.sql`.

4.4. Inspeccionar SQL: CREATE TABLE + UNIQUE INDEX + FK CASCADE.

4.5. `bun run db:migrate` aplica.

4.6. Verificar:
```bash
bun run db:psql -- -c "\d prompts"
# Expected: la tabla con columnas + unique index + FK.
```

## 5. Infrastructure: PostgresPromptRepository
5.1. `src/infrastructure/persistence/repositories/postgres-prompt-repository.ts`:
- Class `PostgresPromptRepository implements PromptRepository`.
- `save`: `INSERT ... ON CONFLICT DO UPDATE` para idempotencia (V1
  aún no editamos, pero dejamos el pattern).
- `findBySlug`: `SELECT WHERE userId AND slug LIMIT 1`.
- `findAllByUserId`: `SELECT WHERE userId ORDER BY createdAt DESC`.
- `delete`: `DELETE WHERE userId AND slug RETURNING id` y devolver
  `result.length > 0`.
- `findNextAvailableSlug`: `SELECT slug WHERE slug LIKE base || '%'`,
  parsear sufijos, encontrar menor entero libre ≥ 2.

5.2. Helper interno `mapRow(row)` traduce columnas snake_case →
campos camelCase del entity.

5.3. `bunx tsc --noEmit` clean.

## 6. HTTP: schemas + helper + 4 routes
6.1. `src/interfaces/http/schemas/prompt.ts`:
- `createPromptSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() })`.

6.2. `src/interfaces/http/lib/require-user.ts`:
```ts
export async function requireUser(request: Request, getCurrentUser) {
  const user = await getCurrentUser(request);
  if (!user) return new Response(null, { status: 401 });
  return user;
}
```
(En realidad necesita devolver un union — el handler chequea
`user instanceof Response`.)

6.3. En `server.ts`, instanciar repo + commands/queries:
```ts
const promptRepo = new PostgresPromptRepository(db);
const createPrompt = new CreatePromptCommand(promptRepo);
const deletePrompt = new DeletePromptCommand(promptRepo);
const getPromptBySlug = new GetPromptBySlugQuery(promptRepo);
const listPromptsForUser = new ListPromptsForUserQuery(promptRepo);
```

6.4. Agregar 4 routes Elysia (cada handler invoca `.execute(...)`):
- `POST /api/prompts`: requireUser → parse body con Zod →
  `createPrompt.execute({ userId, ...body })` → 201 + DTO.
- `GET /api/prompts`: requireUser →
  `listPromptsForUser.execute(userId)` → 200 + array.
- `GET /api/prompts/:slug`: requireUser →
  `getPromptBySlug.execute(userId, slug)` → 200 o 404 (catch
  `PromptNotFoundError`).
- `DELETE /api/prompts/:slug`: requireUser →
  `deletePrompt.execute({ userId, slug })` → 204 o 404.

6.5. Manejo de errores de dominio: try/catch que mapea
`PromptNotFoundError` → 404, `InvalidPromptNameError` /
`InvalidSlugError` → 400.

6.6. `Bun.serve.routes`: agregar
```
"/api/prompts": (req) => app.handle(req),
"/api/prompts/*": (req) => app.handle(req),
```

6.7. Smoke server-side:
```bash
# Sin sesión
curl -i -X POST http://localhost:3010/api/prompts \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'
# Expected: 401

# Con cookie de sesión
curl -X POST -H "Cookie: __Secure-authjs.session-token=$T" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Prompt"}' \
  http://localhost:3010/api/prompts
# Expected: 201 + Prompt JSON

# Listar
curl -H "Cookie: ..." http://localhost:3010/api/prompts
# Expected: array con el prompt creado
```

## 7. Frontend: API client + hooks
7.1. `src/frontend/lib/api/prompts.ts`:
- `listPrompts()`, `getPrompt(slug)`, `createPrompt(input)`,
  `deletePrompt(slug)`. Cada uno hace `fetch` con
  `credentials: "same-origin"` y manejo básico de errores.

7.2. `src/frontend/hooks/use-prompts.ts`:
- `usePrompts()` — `useSWR("/api/prompts", fetcher)` tipado con
  `Prompt[]`.
- `usePrompt(slug)` — `useSWR(slug ? \`/api/prompts/\${slug}\` :
  null, fetcher)` tipado con `Prompt | null`.

## 8. Frontend: AppLayout refactor
8.1. Reescribir `src/frontend/App.tsx` como `AppLayout`:
- `<div className="flex min-h-screen flex-col">`
- `<Header />` arriba
- `<main className="container mx-auto flex-1 p-8"><Outlet /></main>`
- Sin contenido del scaffold viejo (logo, APITester, Card del
  scaffold).

8.2. Eliminar `src/frontend/APITester.tsx`.

8.3. Borrar imports rotos en `App.tsx` (logo, reactLogo, etc.).

## 9. Frontend: pages (List, Create, Detail)
9.1. `src/frontend/pages/PromptsListPage.tsx`:
- `usePrompts()`.
- Empty state: card centered con "No prompts yet" + CTA "Create
  your first prompt" linkeando a `/prompts/new`.
- List: cada item es una row con name + slug + fecha + link al
  detail. Botón "+ New" arriba a la derecha.

9.2. `src/frontend/pages/PromptCreatePage.tsx`:
- `useForm` con resolver Zod (mismo schema que el HTTP).
- Input para name (Input component), Textarea para description.
- Submit → `createPrompt(input)` → `mutate("/api/prompts")` →
  `navigate("/prompts/" + slug, { replace: true })`.
- Loading state en submit.
- Error display si falla la API.

9.3. `src/frontend/pages/PromptDetailPage.tsx`:
- `usePrompt(slug)`.
- Loading: skeleton mínimo.
- 404 (`!data` con isLoading false): card "Prompt not found" + link
  back a `/`.
- Display:
  - `<h1>{name}</h1>`
  - `<code className="text-muted-foreground">{slug}</code>`
  - `<p className="text-sm text-muted-foreground">Created {fmt}</p>`
  - description (si existe)
  - Sección Content:
    - `<div className="border rounded-lg p-6 text-center text-muted-foreground">
       Editor coming in next phase.
     </div>`
    - Botón disabled "Edit content".
  - Botón Delete con confirm dialog (shadcn AlertDialog si está
    disponible; si no, `window.confirm` por ahora).

9.4. Si AlertDialog no está agregado, usar `window.confirm()` para
el delete confirm. Polish a shadcn AlertDialog en P16.

## 10. Frontend: routing wire-up
10.1. Reescribir `src/frontend/frontend.tsx`:
```tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/*" element={<RequireAuth><App /></RequireAuth>}>
      <Route index element={<PromptsListPage />} />
      <Route path="prompts/new" element={<PromptCreatePage />} />
      <Route path="prompts/:slug" element={<PromptDetailPage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

10.2. Verificar que `Outlet` está renderizando correcto en
`AppLayout`.

10.3. Build OK: `bun run build`.

## 11. Validación end-to-end
11.1. Pre-condiciones:
- `docker compose up -d postgres redis` (healthy).
- Migrations aplicadas (`bun run db:migrate`).
- `.env` completo + tunnel activo.
- Logueado en browser.

11.2. Server-side:
```bash
# Crear 3 prompts
for n in "First" "Second" "Third"; do
  curl -s -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
    -d "{\"name\":\"$n\"}" http://localhost:3010/api/prompts | jq .slug
done
# Verificar slug collision
curl -s -X POST -H "Cookie: $C" -H "Content-Type: application/json" \
  -d '{"name":"First"}' http://localhost:3010/api/prompts | jq .slug
# Expected: "first-2"
```

11.3. Browser:
- `/` con sesión → muestra empty state si recién creado el user;
  sino lista los 3.
- Click "+ New" → form. Submit "My Prompt" → redirect a
  `/prompts/my-prompt`.
- Detail muestra metadata + Content placeholder + Delete.
- Click Delete → confirm → redirect a `/`. La lista pierde 1.
- Crear 2 prompts con mismo name → ver `my-prompt` y `my-prompt-2`.

11.4. DB sanity:
```bash
bun run db:psql -- -c "SELECT slug, name FROM prompts ORDER BY created_at;"
```

## 12. Cierre
12.1. Non-regression:
- `bun test` pasa (incluye nuevo test de slug).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- OAuth flow GitHub + Google sigue funcionando.
- `/health` responde 200.

12.2. `git status` limpio.

12.3. Commitear specs P6.

12.4. Abrir PR `feat/p6-prompts-crud` → `master`.
