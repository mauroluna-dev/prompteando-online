# P19 — Template variables · Requirements

> **Kickoff de V2.** Primera fase post-V1 (V1 = P0–P18 + Pγ cerrado).
> Promueve los "templates con `{{var}}`" desde la sección *deferred* del
> roadmap a una fase decidida y accionable.

## Why this phase

Hoy un prompt se consume **raw**: `GET /v1/prompts/:slug` devuelve el
`content` tal cual. Si el usuario quiere reutilizar el mismo prompt con
datos distintos (ej: un template de email con `{{nombre}}` y
`{{producto}}`), tiene que:

- Duplicar el prompt una vez por cada variante, o
- Hacer la substitución del lado del cliente (en el nodo de n8n, en su
  código) — perdiendo el sentido de tener el prompt centralizado.

Después de P19:

- Un prompt puede marcarse como **template** (opt-in, `is_template`).
- Las variables `{{var}}` se **infieren** al guardar cada versión y se
  persisten como snapshot inmutable de esa versión.
- El usuario puede **declarar metadata opcional** por variable
  (descripción + default) a nivel prompt — detección **híbrida**.
- Un nuevo endpoint `POST /v1/prompts/:slug/render` sustituye las
  variables server-side y devuelve el prompt ya renderizado.
- El `GET /v1/prompts/:slug` raw existente **no cambia** — backward
  compatible.

## Decisiones tomadas (sesión 2026-06-02)

Las cuatro decisiones abiertas del roadmap V2 quedaron cerradas así:

1. **Engine: parser propio (~30 líneas).** Regex
   `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g` + `replace`. Cero dependencias,
   control total, alineado al ethos no-vendor / minimal-deps. NO se usa
   `mustache`: no necesitamos loops/secciones/partials, y su HTML-escape
   por default sería ruido para prompts crudos.

2. **Detección: híbrida (inferida + metadata opcional).** Las variables
   se **infieren** parseando el `content` al guardar la versión (cero
   fricción para el no-coder). Además, a nivel prompt el usuario puede
   declarar `description` y `default` por variable. El default vuelve
   **opcional** a esa variable en el render.

3. **Vars faltantes: falla estricta (422).** Si al renderizar falta
   alguna variable requerida (sin valor provisto y sin default), el
   endpoint devuelve **422** con la lista de faltantes. Nunca se manda
   un prompt a medio renderizar a un LLM — alineado al ethos "sabé qué
   corre en prod".

4. **Alcance: full-stack.** Backend (render endpoint + persistencia +
   toggle) **y** UI (modo template en el editor, panel de variables
   detectadas con metadata, "probar render"). Vertical slice como el
   resto del roadmap.

### Pre-decisiones del roadmap adoptadas como default

- **Sintaxis**: `{{var}}` raw, **sin escape** (el output es un prompt,
  no HTML).
- **Activación**: opt-in vía `is_template: bool` per-prompt. Mientras
  esté en `false`, el `content` se sirve raw aunque contenga `{{` —
  backward compat total.
- **Versionado / pinning**: el render acepta `version?: N`. Por default
  usa la última versión publicada. Cada versión guarda su propio
  snapshot de variables (`template_vars`), así un caller que pinea
  `?version=N` queda estable aunque versiones nuevas renombren vars.
- **Endpoint separado**: `POST /v1/prompts/:slug/render` (no extender el
  `GET` con query params). Las vars pueden ser muchas, estructuradas o
  largas — un body POST es lo correcto.

## Modelo de datos

Dos columnas nuevas en `prompts`, una en `prompt_versions`. Migration
nueva bajo `src/infrastructure/persistence/migrations/`.

### `prompts` (schema `prompts.ts`)

- `is_template: boolean NOT NULL DEFAULT false` — flag opt-in.
- `template_var_meta: jsonb NOT NULL DEFAULT '{}'` — metadata declarada,
  **mutable y NO versionada** (es UX, no contenido del prompt):
  ```jsonc
  {
    "nombre":   { "description": "Nombre del cliente", "default": null },
    "producto": { "description": "SKU a promocionar",  "default": "Plan Pro" }
  }
  ```

### `prompt_versions` (schema `prompt-versions.ts`)

- `template_vars: jsonb NOT NULL DEFAULT '[]'` — snapshot **inmutable**
  de los nombres de variable presentes en el `content` de ESA versión,
  calculado al guardar:
  ```jsonc
  ["nombre", "producto"]
  ```
  Se computa **siempre** al guardar una versión (es un regex barato),
  independientemente de `is_template`. El flag solo gatea el endpoint de
  render; tener el snapshot listo evita reparsear y permite prender el
  modo template sin recrear versiones.

> **Por qué meta a nivel prompt y vars a nivel versión**: el set de
> variables es una propiedad del *contenido* (cambia entre versiones, y
> debe ser inmutable para que el pinning funcione). La descripción y el
> default son UX editable que no debería forzar una versión nueva ni
> romper el snapshot histórico.

## Domain (`src/domain/prompt/`)

Render y parsing son operaciones **puras y determinísticas** → viven en
domain, sin pasar por `CryptoPort` ni ports.

- **VO `TemplateVariableName`** (`template-variable-name.vo.ts`): clase
  con `static parse(raw)`. Valida `^[a-zA-Z0-9_]+$` y longitud
  (`MAX_VAR_NAME_LENGTH`). Invariante: nombre no vacío.
- **`extractTemplateVariables(content): string[]`**
  (`template-parser.ts`): aplica el regex, dedup preservando orden de
  aparición, respeta `MAX_TEMPLATE_VARS` (si se excede → error de
  dominio, anti-abuso).
- **`renderTemplate(content, values): { content, varsUsed, missingVars }`**
  (`template-renderer.ts`): función pura. Sustituye cada `{{var}}` por
  `values[var]`. `varsUsed` = vars efectivamente sustituidas;
  `missingVars` = vars presentes en el content sin valor. NO decide el
  422 — solo reporta; el caller (query) decide.
- **Errores** (`prompt.errors.ts`): `TooManyTemplateVariablesError`,
  `NotATemplateError`, `MissingTemplateVariablesError`
  (lleva `missingVars: string[]`).
- **Constants** (`constants.ts`): `TEMPLATE_VAR_PATTERN`,
  `MAX_TEMPLATE_VARS` (ej: 50), `MAX_VAR_NAME_LENGTH` (ej: 64),
  `MAX_VAR_VALUE_LENGTH` (ej: 10_000, anti-abuso en el body del render).

## Application

Siguiendo CQS (clases Command/Query con `execute()`, ports por
constructor):

- **`RenderPromptVersionQuery`** (query nueva,
  `render-prompt-version.query.ts`):
  - `execute(ownerId: UserId, slug: Slug, vars: Record<string,string>, version?: VersionNumber)`
    (4 posicionales).
  - Resuelve el prompt por `ownerId` + `slug`. Si no existe → `null`
    (→ 404). Si `is_template === false` → lanza `NotATemplateError`
    (→ 400).
  - Carga la versión target (la última publicada, o la pineada `N`).
  - Computa los valores efectivos: `provided[var] ?? meta[var].default`.
  - Llama `renderTemplate`. Si `missingVars.length > 0` → lanza
    `MissingTemplateVariablesError(missingVars)` (→ 422).
  - Devuelve DTO `{ content, version, varsUsed, missingVars: [] }`.
- **`SaveNewVersionCommand`** (extender existente): al persistir la
  versión nueva, computar `extractTemplateVariables(content)` y
  guardarlo en `template_vars`. (Aplica también a
  `RestoreVersionCommand`, que crea versión copiando content.)
- **`UpdatePromptTemplateSettingsCommand`** (command nueva,
  `update-prompt-template-settings.command.ts`): setea `is_template` y/o
  reemplaza `template_var_meta`. Valida que las keys del meta sean
  `TemplateVariableName` válidas y que los values quepan en los límites.
  Auth de sesión (no API key).

Repos extendidos (no son ports nuevos):
- `PromptRepository`: leer/escribir `is_template`, `template_var_meta`.
- `VersionRepository`: leer/escribir `template_vars`.

## Infrastructure

- **Migration**: `ALTER TABLE prompts ADD COLUMN is_template ... DEFAULT
  false`, `ADD COLUMN template_var_meta jsonb ... DEFAULT '{}'`;
  `ALTER TABLE prompt_versions ADD COLUMN template_vars jsonb ... DEFAULT
  '[]'`. Generada con `bun run db:generate`, aplicada con
  `bun run db:migrate`.
- **Schema**: actualizar `prompts.ts` y `prompt-versions.ts`.
- **Repos**: `PostgresPromptRepository`, `PostgresVersionRepository`
  mapean las columnas nuevas en `create/fromRow`.
- **Cache**: el output renderizado **no se cachea** (varía por request
  según `vars`). El `content` base de la versión puede seguir saliendo
  del `BunRedisCache` existente; la substitución corre siempre.

## HTTP

### Público (API key — mismo stack que el GET raw)

`POST /v1/prompts/:slug/render` — calcado del bloque
`GET /v1/prompts/:slug` en `server.ts` (≈ línea 551):
`requireApiKey` → helper `recordAndReturn` (RecordApiKeyHit
fire-and-forget) → `rateLimiter.consume(apikey:<id>, 100, 60)` →
`renderPromptVersion.execute(...)`. El grupo `/v1/prompts/*` ya rutea a
`app.handle` en el `Bun.serve`, así que **no se toca** ese mapa.

- **Body**: `{ vars: Record<string,string>, version?: number }`.
- **200**: `{ content, version, vars_used: string[], missing_vars: [] }`.
- **400** `NotATemplateError`: `{ error: "Not a template", hint: "use GET /v1/prompts/:slug" }`.
- **404**: prompt inexistente para esa key.
- **422** `MissingTemplateVariablesError`:
  `{ error: "Missing variables", missing_vars: ["nombre"] }`.
- **429**: rate limit (idéntico al GET).
- Respuestas siempre `Response.json(...)` / `new Response(JSON.stringify)`
  — nunca devolver una entity/clase directo (ver
  [[feedback_elysia_class_serialization]]).

> El `GET /v1/prompts/:slug` raw queda **intacto**. Un caller que pega a
> GET sobre un template recibe el content con los `{{}}` literales.

### Sesión (dashboard)

- `PATCH /api/prompts/:slug/template` → `UpdatePromptTemplateSettings`.
  Body `{ isTemplate?: boolean, varMeta?: {...} }`. Auth con
  `require-user`. Devuelve el prompt actualizado.
- `POST /api/prompts/:slug/render-preview` → reusa
  `RenderPromptVersionQuery` con auth de **sesión** (no API key, sin
  rate limit, sin metric). Sirve al "probar render" del editor para que
  el preview matchee exactamente el comportamiento de prod (incluido el
  422 estricto y los defaults).

Schemas Zod de request/response en `src/interfaces/http/schemas/`.

## Frontend (`src/frontend/`)

En `PromptEditorPage`:

- **Toggle "Modo template"** (switch) → `PATCH .../template`. Cuando
  está ON:
  - **Panel "Variables"**: lista las vars detectadas (parseadas live del
    content en el editor con el mismo regex, o las de la versión
    guardada). Por cada una: inputs opcionales de `description` y
    `default` que persisten vía `PATCH .../template`.
  - **Panel "Probar render"**: un input por variable → llama a
    `POST /api/prompts/:slug/render-preview` y muestra el resultado, o el
    error 422 con las faltantes resaltadas.
  - **Snippet de consumo**: bloque copiable con el `curl` /
    `fetch` a `POST /v1/prompts/:slug/render` y el body de ejemplo, para
    que el no-coder lo pegue en n8n.
- Estados: toggle OFF → sin paneles. La UI se mantiene **funcional y
  sobria**, mapeada a los design tokens de Pγ — sin invertir en pulido
  visual todavía (ver [[project_aesthetic_not_settled]]).

## Edge cases a cubrir

- `is_template=false` + content con `{{` → GET raw lo devuelve literal,
  sin tocar. Backward compat.
- Charset: solo matchea `{{var}}` / `{{ var }}` con `[a-zA-Z0-9_]+`
  (whitespace interno se trimea). `{{ nombre cliente }}` (con espacio)
  **no** matchea — documentar en la UI.
- Variable repetida en el content → se sustituye en todas las
  ocurrencias, se lista una sola vez en `template_vars`.
- Var con `default` declarado → opcional (no entra en `missing_vars` si
  no se provee).
- Límites: `MAX_TEMPLATE_VARS`, `MAX_VAR_NAME_LENGTH`,
  `MAX_VAR_VALUE_LENGTH` → exceder = error (anti-abuso).
- **Prompt injection desde vars**: NO se sanitiza (el output es un
  prompt). Documentar warning: el valor de las vars es responsabilidad
  del consumer.

## Out of scope (P19)

- Loops / condicionales / partials (Mustache completo). Solo `{{var}}`.
- Renombrar vars con migración asistida de callers.
- Tipos de variable (number/enum/etc.) — todas son string.
- Cachear output renderizado.

## Depends on

P9 (API pública + API keys + rate limit), P7 (versionado), P18
(RecordApiKeyHit, para que el render quede medido como el GET). No
requiere P10–P12 (GitHub).
