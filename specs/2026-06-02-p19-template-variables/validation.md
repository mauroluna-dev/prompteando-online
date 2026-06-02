# P19 — Template variables · Validation

## Static checks

```bash
bun run lint        # 0 warnings
bunx tsc --noEmit   # 0 errores
bun test            # unit + integration verdes
bun run build       # build ok
```

## Functional checks

Setup: usuario logueado, un prompt nuevo, una API key activa
(`po_live_...`). `BASE=http://localhost:3010`.

### 1. Detección de variables al guardar

- Crear prompt, content:
  `Hola {{nombre}}, te escribo por {{producto}}. Saludos {{nombre}}.`
- Save → v1.
- Verificar en DB (`bun run db:psql`):
  `SELECT template_vars FROM prompt_versions WHERE ...;`
  → `["nombre", "producto"]` (dedup, orden de aparición).

### 2. Toggle de modo template

- `is_template` arranca en `false`.
- `GET /v1/prompts/:slug` con Bearer → 200 con el content **raw**
  (los `{{}}` literales). Backward compat.
- En el editor, prender "Modo template" (o
  `PATCH /api/prompts/:slug/template {"isTemplate":true}`).

### 3. Render happy path (200)

```bash
curl -X POST $BASE/v1/prompts/<slug>/render \
  -H "Authorization: Bearer po_live_xxx" \
  -H "content-type: application/json" \
  -d '{"vars":{"nombre":"Ana","producto":"Plan Pro"}}'
```
→ 200 `{ content: "Hola Ana, te escribo por Plan Pro. Saludos Ana.",
version: 1, vars_used: ["nombre","producto"], missing_vars: [] }`.
Ambas ocurrencias de `{{nombre}}` sustituidas.

### 4. Falla estricta por var faltante (422)

```bash
curl -X POST $BASE/v1/prompts/<slug>/render \
  -H "Authorization: Bearer po_live_xxx" \
  -H "content-type: application/json" \
  -d '{"vars":{"nombre":"Ana"}}'
```
→ **422** `{ error: "Missing variables", missing_vars: ["producto"] }`.
No devuelve content a medio renderizar.

### 5. Default vuelve opcional a la variable

- Declarar default para `producto` (`PATCH .../template` con
  `varMeta: {"producto":{"default":"Plan Pro"}}`).
- Repetir el render del paso 4 (sin `producto` en el body)
  → **200**, `content` usa "Plan Pro". `producto` no aparece en
  `missing_vars`.

### 6. Pinning de versión usa el snapshot correcto

- Editar el prompt a `Hola {{nombre}} ({{empresa}})` → Save → v2.
- `render` con `version: 1` → requiere `{nombre, producto}` (vars de v1).
- `render` con `version: 2` (o sin pinear) → requiere `{nombre, empresa}`.
- Confirma que `template_vars` es inmutable por versión.

### 7. Prompt no-template (400)

- Sobre un prompt con `is_template=false`, pegar a
  `POST /v1/prompts/:slug/render` → **400**
  `{ error: "Not a template", hint: "use GET /v1/prompts/:slug" }`.

### 8. Auth, rate limit y métricas (mismo stack que el GET)

- Sin Bearer / key revocada → **401**.
- Exceder 100 req/min sobre `/render` → **429** con `retry-after`.
- Tras varios renders, el dashboard de métricas (P18) de esa key
  refleja los hits (el endpoint llama `recordApiKeyHit` fire-and-forget
  igual que el GET).

### 9. UI — editor

- Modo template ON → panel "Variables" lista `nombre`, `producto`
  parseadas **live** del editor.
- Cargar `description`/`default` → persisten (recarga los mantiene).
- "Probar render": completar inputs → muestra el render; dejar una vacía
  (sin default) → muestra el **422** con la faltante resaltada.
- El snippet copiable trae el `curl` correcto al endpoint público.

### 10. Edge cases

- Content `{{ nombre cliente }}` (con espacio) → NO se detecta como var
  (queda literal). La UI lo aclara.
- Content con > `MAX_TEMPLATE_VARS` variables → save rechazado con error
  claro.
- `vars` value > `MAX_VAR_VALUE_LENGTH` en el body → 400/422 (anti-abuso).

## Demo

Video < 2 min: crear template con 2 vars → prender modo template →
declarar un default → render por `curl` con éxito → render sin una var →
422 → mostrar el mismo flujo desde un nodo de n8n (HTTP Request → POST
`/render`).
