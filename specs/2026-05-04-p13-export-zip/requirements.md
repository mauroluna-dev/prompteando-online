# P13 — Export ZIP/JSON · Requirements

## Why this phase

`mission.md` promises "exportable por diseño" como contrapeso al
flagship GitHub: **aun sin GitHub conectado, el usuario puede bajarse
todo su historial cuando quiera, sin pedirle permiso a nadie**.

Hoy:
- Sin GitHub el usuario no tiene salida del producto. Si decidimos
  cerrar prompteando mañana, sus prompts se pierden.
- Con GitHub el historial vive en su repo, pero no toda persona target
  (no-coder orquestador) conecta GitHub. P10–P12 cubren al
  vibe-coder; P13 cubre al no-coder.
- North Star "time-to-first-value < 5 min" implica también
  "time-to-leave < 1 click". Sin export no hay leverage de confianza.

P13 cierra ese gap entregando **un único endpoint autenticado que
streamea un ZIP determinístico con el dump completo de prompts +
versiones**, más un botón "Download my data" en `/settings/profile`.

**No depende de P10–P12 (GitHub).** Funciona idéntico tenga el usuario
GitHub conectado o no. Es la garantía anti-vendor-lock-in del path
fallback.

## Decisiones tomadas (sesión 2026-05-04, post-Pγ aftermath)

1. **Scope: prompts + todas sus versiones, nada más.**
   Sin API keys, sin métricas (P18), sin GitHub connection, sin
   sesiones. Razón:
   - Mission solo promete portabilidad de prompts.
   - API keys y GitHub conn tienen secrets/tokens — no queremos un
     export accidentalmente filtrable que los exponga (aún sin
     plaintext, su sola presencia es señal).
   - Métricas son derivables del uso futuro, no un asset del usuario.
   - Reduce blast radius de privacidad y simplifica el spec V1.

2. **Layout: `prompts/<slug>/v<N>.md` + `index.json` + `README.md`.**
   Coincide con el roadmap entry. Una carpeta por prompt, un archivo
   markdown crudo (sin frontmatter) por versión, índice JSON con
   metadata legible por máquina, README en el root explicando la
   estructura. Razón: machine-readable + human-readable a la vez, fácil
   de re-importar en V2 si se agrega "import ZIP".

3. **Library: `fflate` streaming.**
   ~25KB MIT, soporta `Zip()` con `add()` / `end()` y emite chunks via
   callback. Streameamos directo al `Response` body de Elysia con un
   `ReadableStream` para no buffer todo en memoria. Razón: con 1K
   versiones de 4KB c/u serían ~4MB cargados en RAM; con stream el
   server queda flat. Descartado:
   - Pure Bun ZIP writer: ~100 LOC + tests + edge cases (CRC32,
     local file headers, central directory). No vale la pena el ahorro
     vs `fflate`.
   - `jszip`: 3x más grande, no streaming-first, mas dep peso.

4. **Endpoint: `GET /api/export.zip`.** Auth: sesión (cookie). NO
   accesible vía API key — el dump es del usuario humano, no del
   consumer programático. Filename via
   `Content-Disposition: attachment; filename="prompteando-export-YYYY-MM-DD.zip"`.

5. **UI: `/settings/profile` con nueva sección "Your data".**
   Card con título + copy corto + botón primario "Download my data".
   Razón: discoverable junto a info de cuenta, no requiere ruta nueva,
   coherente con la estructura SettingsLayout actual. El download se
   dispara con un `<a href="/api/export.zip" download>` (sin SWR — el
   browser maneja el stream nativamente).

6. **No paginación, no rate limit.** El endpoint puede tardar varios
   segundos para usuarios con cientos de versiones. Aceptable en V1.
   Si hace falta limitar: agregar a futuro `Retry-After` cuando el
   user pida 2+ exports en N minutos. Out de V1.

7. **Determinístico (orden estable).** Prompts ordenados por
   `created_at ASC, id ASC`. Versiones por `version_number ASC`. Razón:
   2 exports back-to-back sin cambios deben producir ZIPs byte-idénticos
   (testeable, debugeable). NOTA: mtime de los entries del ZIP queda en
   epoch 0 (1980-01-01 que es el mínimo del ZIP spec) para no romper el
   determinismo. El timestamp real vive en `index.json`.

8. **Slug-conflict handling.** Si dos prompts tuvieran el mismo slug
   (no debería pasar — `(user_id, slug)` es UNIQUE), el segundo se
   escribe como `<slug>-<id-prefix>/`. Defensivo: en práctica no se
   dispara. Igual cubierto.

9. **Slicing: 1 PR.**
   Backend (query + handler + dep) + frontend (sección + botón) son
   ~250 LOC totales y la verificación end-to-end requiere ambas. No
   tiene sentido partir.

## In scope

### Domain

Sin entities ni VOs nuevos. Reusa `Prompt`, `PromptVersion`, `Slug`.

### Application (`src/application/queries/`)

- **`export-all-prompts.query.ts`** — `ExportAllPromptsQuery`:
  ```ts
  export class ExportAllPromptsQuery {
    constructor(
      private readonly promptRepo: PromptRepository,
      private readonly versionRepo: VersionRepository,
    ) {}

    async execute(userId: string): Promise<ExportBundle> { ... }
  }
  ```
  - Carga prompts del user (orden estable).
  - Para cada prompt carga sus versiones (orden estable).
  - Retorna `ExportBundle` (DTO) con todo en memoria estructurado:
    ```ts
    type ExportBundle = {
      generatedAt: Date;
      user: { id: string };
      prompts: Array<{
        id: string;
        slug: string;
        name: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        currentVersionNumber: number | null;
        versions: Array<{
          versionNumber: number;
          content: string;
          commitMessage: string | null;
          createdAt: Date;
          githubCommitSha: string | null;
        }>;
      }>;
    };
    ```
  - **Sin paginación intermedia**: el caller (handler) decide cuándo
    transformar a stream. La query no genera ZIP — solo data
    estructurada. Mantiene SRP.

### Infrastructure

Sin adapter nuevo (`fflate` se usa directamente desde el handler — es
una concern de transporte/serialización, no de dominio).

**`src/infrastructure/export/`** (NEW):
- **`zip-bundle-writer.adapter.ts`** — wrapper sobre `fflate.Zip`:
  ```ts
  export class ZipBundleWriter {
    async toReadableStream(bundle: ExportBundle): Promise<ReadableStream<Uint8Array>> { ... }
  }
  ```
  - Construye el ZIP con `fflate.Zip` async.
  - Adds:
    - `README.md` (texto fijo, ver §README abajo).
    - `index.json` (serialización del bundle).
    - Por cada prompt y versión: `prompts/<slug>/v<N>.md` con
      `version.content` raw.
  - Emite chunks via `ondata` callback → `controller.enqueue` del
    `ReadableStream`.
  - Maneja epoch 0 mtime para determinismo (`mtime: new Date(0)`).
  - **Justificación de ubicación**: `src/infrastructure/export/` en
    vez de meterlo en `interfaces/http/`. La política de "el handler
    no orquesta lógica de serialización compleja" + el hecho que es
    reutilizable (potencial CLI export en el futuro) lo justifican.

### HTTP

- **`src/interfaces/http/handlers/export.handler.ts`** (NEW):
  - Route: `GET /api/export.zip`.
  - Auth middleware (sesión); 401 si no hay user.
  - Llama `exportAllPromptsQuery.execute(userId)` → bundle.
  - Llama `zipBundleWriter.toReadableStream(bundle)` → stream.
  - Returns `new Response(stream, { headers: ... })` con:
    - `Content-Type: application/zip`
    - `Content-Disposition: attachment; filename="prompteando-export-YYYY-MM-DD.zip"`
    - `Cache-Control: no-store`
  - Sin `Content-Length` (es streaming).

- **Wireup en `server.ts`**: instanciar `ZipBundleWriter` y
  `ExportAllPromptsQuery` en el composition root, montar el handler.

### Frontend

- **`src/frontend/pages/SettingsProfilePage.tsx`** (EDIT):
  Agregar sección "Your data" al final de la página, dentro de un
  `<Card>` con `<CardHeader>` + `<CardContent>`:
  - Título: "Your data" (font-display).
  - Copy: "Download all your prompts and version history as a ZIP
    archive. Available even without GitHub connected."
  - Botón primario: `<Button asChild>` envolviendo
    `<a href="/api/export.zip" download>Download my data</a>`.
  - Nota muted: "Includes all prompts and every version. Markdown +
    JSON. ~few seconds."

- **No SWR / no fetch hook**. El download nativo del browser maneja
  el stream sin ocupar el thread JS. Click → descarga arranca → file
  picker del browser.

### Specs cross-reference

- `tech-stack.md` → agregar bullet en "Dependencias a instalar" sobre
  `fflate` post-MVP (junto a CodeMirror y recharts).
- `mission.md` ya documenta "exportable por diseño" — no requiere
  edit.
- `roadmap.md` — marcar P13 como "in progress" si llevamos ese log.

### `README.md` (dentro del ZIP)

Texto fijo, multilingual EN (la app es ES rioplatense pero el target
del export es agnóstico):

```markdown
# prompteando export

This archive contains all your prompts and their version history,
exported on YYYY-MM-DDTHH:MM:SSZ.

## Structure

- `index.json` — machine-readable manifest with metadata for every
  prompt and version.
- `prompts/<slug>/v<N>.md` — raw content of each version, by prompt.

## Re-importing

This bundle is portable: any markdown viewer can open the `v*.md`
files. The `index.json` schema is documented at
https://prompteando.online/docs/export-format (V2).

Generated by prompteando. Your data, always.
```

Strings hardcoded en `zip-bundle-writer.adapter.ts` (no archivo
template — es ~10 líneas).

## Out of scope (deferred)

- **Import ZIP** ("upload export"): inverso del export. V2.
- **CSV export**: solo ZIP de markdown + JSON en V1.
- **Export filtrado** (un solo prompt, una sola versión, range de
  fechas): full dump en V1.
- **Export programático via API key**: solo sesión humana en V1.
- **Encryption del ZIP** (password-protected): out V1.
- **Email del export** ("send to my inbox cuando esté listo"): out
  V1, requiere SMTP infra.
- **Diff entre dos exports**: out (use `git diff` en sus repos si
  conectaron GitHub).
- **Export de API keys metadata** (sin secrets): out por privacy
  hygiene; reducir blast radius.
- **Export de métricas P18**: out — son derivadas, no asset del user.
- **Rate limit** del endpoint: out, agregar reactivamente si se
  observa abuso.

## Risks / open items

- **Tamaño**: usuario con 100 prompts × 50 versiones × 4KB = 20MB.
  Streaming evita el spike de RAM. El download tarda lo que tarda el
  browser en bajar 20MB. Aceptable.
- **Memory para `bundle`**: la query carga todo en memoria antes de
  streamear. Para 1K versiones × 4KB son ~4MB en RAM por petición.
  Aceptable en V1. Si crece: refactor a `AsyncIterable<PromptWithVersions>`
  y streamear desde la query (V2).
- **Determinismo**: si Postgres devuelve filas en orden no estable,
  el ZIP cambia byte-a-byte entre exports. Mitigación: ORDER BY
  explícito (`created_at ASC, id ASC` por prompts; `version_number
  ASC` por versiones). Test de no-regresión documentado en
  `validation.md`.
- **Filename con caracteres no-ASCII**: `slug` ya está restringido a
  `[a-z0-9-]` por el VO `Slug`, así que no hay problema. Si el name
  tuviera unicode raro queda en `index.json` igual.
- **Browser bloqueando el download**: `download` attribute requiere
  same-origin. El endpoint vive en `/api/...` del mismo origen, así
  que OK. Validar en QA con Safari.
- **`fflate` v0.x**: la lib está en major 0 todavía (estabilidad de
  API). Pin exact version en `package.json`. Si rompe en upgrade,
  port al pure Bun ZIP writer es ~100 LOC.
- **Slugs duplicados (defensa en profundidad)**: la BD lo previene
  con UNIQUE. El writer también desduplica defensivamente (sufijo
  `-<id8>`) para no producir un ZIP corrupto si la invariante falla.
- **Comportamiento con 0 prompts**: el ZIP igual contiene `README.md`
  + `index.json` (con `prompts: []`). No tira 404. UX: el botón
  igual aparece, descargar un ZIP "vacío" no es error.
