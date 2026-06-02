# P19 — Template variables · Plan

Grupos de tareas numerados. Cada grupo deja la app en estado compilable
(`bun run typecheck` + `bun test` verdes) salvo donde se indique. Orden:
domain → persistencia → application → HTTP público → HTTP sesión →
frontend.

## 1. Domain (puro, sin deps)

1.1. `src/domain/prompt/constants.ts` — sumar `TEMPLATE_VAR_PATTERN`
   (`/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g`), `MAX_TEMPLATE_VARS = 50`,
   `MAX_VAR_NAME_LENGTH = 64`, `MAX_VAR_VALUE_LENGTH = 10_000`.

1.2. `src/domain/prompt/template-variable-name.vo.ts` — VO clase con
   `static parse(raw)`. Valida charset + longitud.

1.3. `src/domain/prompt/template-parser.ts` —
   `extractTemplateVariables(content): string[]`. Dedup preservando
   orden. Lanza `TooManyTemplateVariablesError` si supera el límite.

1.4. `src/domain/prompt/template-renderer.ts` —
   `renderTemplate(content, values): { content, varsUsed, missingVars }`.
   Función pura. NO decide el 422.

1.5. `src/domain/prompt/prompt.errors.ts` — sumar `NotATemplateError`,
   `MissingTemplateVariablesError(missingVars)`,
   `TooManyTemplateVariablesError`.

1.6. Tests unitarios en `src/domain/prompt/__test__/`:
   - parser: extrae, dedup, `{{ x }}` con whitespace, ignora `{{ a b }}`,
     respeta el límite.
   - renderer: sustituye todas las ocurrencias, reporta `missingVars`,
     reporta `varsUsed`, content sin vars devuelve igual.
   - VO: parse válido/ inválido.

## 2. Persistencia (schema + migration + repos)

2.1. `schema/prompts.ts` — agregar `isTemplate` (boolean, default false)
   y `templateVarMeta` (jsonb, default `{}`).

2.2. `schema/prompt-versions.ts` — agregar `templateVars` (jsonb,
   default `[]`).

2.3. `bun run db:generate` → revisar el SQL diff → `bun run db:migrate`
   contra el Postgres del compose.

2.4. `PostgresPromptRepository` + `PostgresVersionRepository` — mapear
   las columnas nuevas en `fromRow` / `create` / update. Entities
   `Prompt` / `PromptVersion` exponen los campos nuevos.

2.5. Tests de repo (integration) verifican round-trip de las columnas.

## 3. Application

3.1. `save-new-version.command.ts` — al persistir, computar
   `extractTemplateVariables(content)` y pasarlo al repo. Idem
   `restore-version.command.ts`.

3.2. `render-prompt-version.query.ts` — `RenderPromptVersionQuery`.
   Constructor recibe `PromptRepository` + `VersionRepository`.
   `execute(ownerId, slug, vars, version?)`. Lógica de
   requirements §Application. Devuelve DTO o lanza
   `NotATemplateError` / `MissingTemplateVariablesError`.

3.3. `update-prompt-template-settings.command.ts` —
   `UpdatePromptTemplateSettingsCommand`. Valida keys de `varMeta` como
   `TemplateVariableName` y tamaños. Persiste vía `PromptRepository`.

3.4. Tests:
   - `save-new-version`: guardar content con `{{a}} {{b}}` → versión
     persiste `template_vars = ["a","b"]`.
   - `render` query: 200 happy path; falta var → `MissingTemplateVariables`;
     no-template → `NotATemplate`; default cubre var faltante; pinning de
     versión usa el snapshot correcto.
   - `update-template-settings`: toggle on/off, set/replace meta,
     rechazo de key inválida.

## 4. HTTP público — render endpoint

4.1. `src/interfaces/http/schemas/` — schema Zod del body
   (`{ vars: Record<string,string>, version?: number }`) y del DTO de
   respuesta.

4.2. `server.ts` — instanciar `RenderPromptVersionQuery` (junto a
   `getLatestPublishedVersion`). Agregar `.options(...)` +
   `.post("/v1/prompts/:slug/render", ...)` **calcando** el bloque del
   GET (línea ≈551): `requireApiKey` → `recordAndReturn` →
   `rateLimiter.consume` → query. Mapear errores:
   `NotATemplateError`→400, `MissingTemplateVariablesError`→422 (con
   `missing_vars`), `null`→404. El grupo `/v1/prompts/*` ya está en el
   mapa de `Bun.serve` — no tocar.

4.3. Test de handler (`handlers/__test__` o equivalente): 200, 400, 404,
   422, 429. Verificar que el GET raw sigue intacto sobre un template.

## 5. HTTP sesión — settings + preview

5.1. `server.ts` — `.patch("/api/prompts/:slug/template", ...)` con
   `require-user` → `UpdatePromptTemplateSettingsCommand`.

5.2. `server.ts` — `.post("/api/prompts/:slug/render-preview", ...)` con
   `require-user` → reusa `RenderPromptVersionQuery` (sin rate limit, sin
   metric). Agregar `/api/prompts/*` ya está ruteado a `app.handle`.

5.3. Tests de ambos endpoints (auth de sesión, happy + 422).

## 6. Frontend (full-stack)

6.1. Hook `useTemplateSettings(slug)` (SWR) — lee `is_template` +
   `template_var_meta` del prompt; `mutate` vía `PATCH .../template`.

6.2. `PromptEditorPage` — toggle "Modo template" (switch) wired al hook.

6.3. Componente `<TemplateVariablesPanel>` — lista vars detectadas
   (parseadas live del content con el mismo regex client-side) + inputs
   `description`/`default` por var, persistidos vía el hook.

6.4. Componente `<TemplateRenderTester>` — input por variable →
   `POST /api/prompts/:slug/render-preview`; muestra render o 422 con
   faltantes resaltadas.

6.5. Componente `<RenderSnippet>` — bloque copiable con el `curl`/`fetch`
   al endpoint público `POST /v1/prompts/:slug/render`.

6.6. UI mapeada a tokens Pγ, funcional y sobria (sin pulido visual —
   ver requirements). Tests de componente mínimos con `happy-dom`
   (parse live, toggle, preview 422).

## 7. Docs

7.1. README — sección corta "Templates con variables" con el ejemplo de
   `POST /v1/prompts/:slug/render`.

7.2. `specs/mission.md` y `specs/roadmap.md` — marcar P19 como la fase de
   kickoff de V2 (actualizado en este mismo PR de specs).

7.3. CLAUDE.md / conventions si algo nuevo lo amerita (no se anticipa
   convención nueva — el parser/renderer son domain puro estándar).

## Notas de orden / PRs

Si el PR queda grande, slice natural: **PR-A** grupos 1–4 (backend +
endpoint público, demoable por `curl`), **PR-B** grupos 5–7 (sesión +
UI + docs). Cada uno mergeable y verde por separado.
