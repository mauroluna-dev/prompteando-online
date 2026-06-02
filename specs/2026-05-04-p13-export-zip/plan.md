# P13 — Export ZIP/JSON · Plan

Single PR. Numbered task groups; each item ≈ 1 atomic commit.

---

## 1. Spec docs

1.1. `docs(p13): add P13 spec docs (requirements, plan, validation)`
   — este directorio. (Este commit lo hacemos primero como scaffolding
   del PR.)

---

## 2. Dependency + tech-stack note

2.1. `bun add fflate` (pin exact, no `^`).
2.2. `chore(p13): add fflate dep + document in tech-stack`
   — incluye edit a `specs/tech-stack.md` agregando `fflate` a
   "Dependencias a instalar (V1)".

---

## 3. Application — `ExportAllPromptsQuery`

3.1. `feat(p13): add ExportBundle DTO`
   — `src/application/queries/export-bundle.dto.ts` con el type
   `ExportBundle` exportado.

3.2. `feat(p13): add ExportAllPromptsQuery`
   — `src/application/queries/export-all-prompts.query.ts`. Inyecta
   `PromptRepository` + `VersionRepository`. `execute(userId)` carga
   prompts y versiones con orden determinístico. Retorna
   `ExportBundle`.

3.3. `test(p13): unit-test ExportAllPromptsQuery shape + ordering`
   — fakes en memoria de los dos repos. Valida:
   - Orden de prompts (created_at ASC, id ASC tie-breaker).
   - Orden de versions (version_number ASC).
   - 0 prompts → `prompts: []` (no throw).
   - Versiones de prompts ajenos no leakean.

---

## 4. Infrastructure — `ZipBundleWriter`

4.1. `feat(p13): add ZipBundleWriter (fflate streaming adapter)`
   — `src/infrastructure/export/zip-bundle-writer.adapter.ts`.
   Método `toReadableStream(bundle): ReadableStream<Uint8Array>`.
   Usa `fflate.Zip` con `ondata` enqueue al controller. Mtime epoch
   0. README.md fijo + index.json + per-version markdown files.
   Defensa anti-slug-collision con sufijo `-<id8>`.

4.2. `test(p13): unit-test ZipBundleWriter determinism + structure`
   — generar mismo bundle 2× → ZIPs byte-idénticos
   (`Bun.hash(bytes)` matching). Abrir el ZIP con `fflate.unzipSync`
   y validar:
   - `README.md` y `index.json` presentes en root.
   - `index.json` parseable y matchea `bundle`.
   - `prompts/<slug>/v<N>.md` por cada versión.
   - 0 prompts → solo README + index con `prompts: []`.

---

## 5. HTTP — endpoint `/api/export.zip`

5.1. `feat(p13): add export.handler.ts (GET /api/export.zip)`
   — `src/interfaces/http/handlers/export.handler.ts`. Auth
   middleware sesión, llama query → writer → Response stream con
   headers correctos. Filename con fecha UTC.

5.2. `feat(p13): wire export route in server.ts`
   — instanciar `ZipBundleWriter` + `ExportAllPromptsQuery` en
   composition root, montar handler en Elysia.

5.3. `test(p13): integration-test /api/export.zip end-to-end`
   — opcional según infra de tests existente. Si hay test http con
   sesión simulada: hit endpoint → response status 200, headers
   correctos, body es un ZIP válido (parseable).
   Si no hay scaffolding: dejar para QA manual y skip.

---

## 6. Frontend — sección "Your data" en `/settings/profile`

6.1. `feat(p13): add Your data section to SettingsProfilePage`
   — edit a `src/frontend/pages/SettingsProfilePage.tsx`. Card con
   header + body + botón primario. Botón = `<Button asChild>` con
   `<a href="/api/export.zip" download>Download my data</a>`. Copy
   en rioplatense (alineado con #27): "Bajate todos tus prompts y el
   historial completo de versiones en un ZIP. Disponible aun sin
   GitHub conectado." Nota muted: "Incluye todos los prompts y todas
   sus versiones. Markdown + JSON. Tarda unos segundos."

---

## 7. Smoke + ship

7.1. `bun run lint && bun run typecheck && bun run build && bun test`
   localmente.

7.2. Smoke manual (ver `validation.md`):
   - Crear 2 prompts con 2 versiones c/u.
   - Click "Download my data" → ZIP descarga.
   - Abrir ZIP → estructura matchea spec.

7.3. Push, abrir PR. PR description linkea a este spec dir y a la
   verification de `validation.md`.

---

## Touched files (preview)

```
specs/2026-05-04-p13-export-zip/                    # NEW (3 files)
specs/tech-stack.md                                  # EDIT (deps note)
package.json                                         # EDIT (fflate)
bun.lock                                             # EDIT
src/application/queries/export-bundle.dto.ts        # NEW
src/application/queries/export-all-prompts.query.ts # NEW
src/application/queries/__test__/
  export-all-prompts.query.test.ts                   # NEW
src/infrastructure/export/
  zip-bundle-writer.adapter.ts                       # NEW
src/infrastructure/export/__test__/
  zip-bundle-writer.adapter.test.ts                  # NEW
src/interfaces/http/handlers/export.handler.ts       # NEW
src/interfaces/http/server.ts                        # EDIT (wireup)
src/frontend/pages/SettingsProfilePage.tsx           # EDIT (Your data section)
```

Estimación: ~9 commits, ~250 LOC neto (sin counting tests). Una sola
PR — no slicing.

---

## Out of plan (V1 won't do)

- Import ZIP (V2).
- Tests de integración Playwright del flujo de descarga (no hay
  Playwright en este repo todavía; P16 lo introduce).
- Métricas del endpoint (no instrumentamos `/api/export.zip` con
  P18 — es ruta de sesión humana, no API pública).
- I18n del README.md dentro del ZIP — queda en EN por ser dump
  agnóstico.
