# P13 — Export ZIP/JSON · Validation

Conditions for merging this PR. All must hold.

---

## Automated

### A1. Quality gate (pre-push hook)

```sh
bun run lint        # 0 warnings
bun run typecheck   # 0 errors
bun run build       # ok
bun test            # all green incl. new tests
```

### A2. Unit — `ExportAllPromptsQuery`

`src/application/queries/__test__/export-all-prompts.query.test.ts`
debe cubrir:

- ✅ Devuelve `prompts: []` cuando el user no tiene prompts.
- ✅ Devuelve prompts ordenados por `createdAt ASC`, tie-break por
  `id ASC`.
- ✅ Devuelve versiones ordenadas por `versionNumber ASC` dentro de
  cada prompt.
- ✅ No incluye prompts/versiones de otros usuarios (fake repo con 2
  users distintos).
- ✅ Mapea correctamente `currentVersionNumber`, `commitMessage`,
  `githubCommitSha` (incluyendo `null`s).

### A3. Unit — `ZipBundleWriter`

`src/infrastructure/export/__test__/zip-bundle-writer.adapter.test.ts`
debe cubrir:

- ✅ **Determinismo**: 2 calls con el mismo bundle → mismo hash de
  bytes (`Bun.CryptoHasher` SHA-256 de los chunks concatenados).
- ✅ **Estructura**: `unzipSync(bytes)` retorna keys
  `["README.md", "index.json", "prompts/<slug>/v<N>.md", ...]`.
- ✅ **`index.json` round-trip**: parsear retorna estructura
  equivalente al bundle (modulo Date → ISO string).
- ✅ **README.md presente** y contiene la palabra "prompteando".
- ✅ **Bundle vacío** (`prompts: []`) → ZIP solo con README +
  index.json (con `prompts: []`); no tira error.
- ✅ **Slug collision defensivo**: dos prompts con mismo slug
  generan paths distintos (`<slug>/...` y `<slug>-<id8>/...`).
- ✅ **mtime epoch 0**: todas las entries tienen mtime
  `1980-01-01` (mínimo del ZIP spec; soportado por `fflate`). No es
  el wall-clock actual.

### A4. Integration — endpoint (best-effort)

Si existe scaffolding de http test con sesión simulada (chequear
infra actual antes de implementar):

- ✅ `GET /api/export.zip` sin sesión → 401.
- ✅ `GET /api/export.zip` con sesión + 0 prompts → 200, body es ZIP
  válido (parseable con `fflate.unzipSync`), contiene README + empty
  index.
- ✅ Headers de response:
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename="prompteando-export-YYYY-MM-DD.zip"`
  - `Cache-Control: no-store`

Si no hay scaffolding, skip (no blocker). Cubierto por smoke manual.

---

## Manual smoke (must pass before merge)

### M1. Setup

1. `docker compose up -d`
2. `bun run db:migrate` (debería ser no-op para P13).
3. `bun run dev`

### M2. Happy path

1. Login con cualquier provider.
2. Crear 2 prompts:
   - Slug `welcome-email`, 3 versiones (commit messages: "init",
     "fix grammar", "shorter intro").
   - Slug `support-reply`, 1 versión (commit message: "init").
3. Ir a `/settings/profile`.
4. Verificar que la sección "Tu data" / "Your data" aparece al final
   con copy + botón.
5. Click "Download my data".
6. ✅ El browser descarga `prompteando-export-YYYY-MM-DD.zip`.
7. Descomprimir el ZIP. Estructura esperada:
   ```
   prompteando-export-YYYY-MM-DD/
   ├── README.md
   ├── index.json
   └── prompts/
       ├── welcome-email/
       │   ├── v1.md
       │   ├── v2.md
       │   └── v3.md
       └── support-reply/
           └── v1.md
   ```
8. ✅ `cat README.md` muestra la guía de estructura.
9. ✅ `jq . index.json` parsea sin error y lista los 2 prompts con
   sus 4 versions totales (3 + 1).
10. ✅ `cat prompts/welcome-email/v3.md` muestra el contenido de la
    versión 3 raw (no frontmatter, no diff).
11. ✅ `index.json` tiene `generatedAt` con timestamp actual ISO.

### M3. Empty path

1. Login con un user nuevo (sin prompts).
2. Ir a `/settings/profile`.
3. Click "Download my data".
4. ✅ Descarga ZIP de pocos KB.
5. Descomprimir → solo `README.md` + `index.json` con
   `"prompts": []`. No tira error, no 404.

### M4. Auth path

1. Logout.
2. Navegar manualmente a `/api/export.zip` en el browser.
3. ✅ Response 401 (o redirect a `/login` según middleware actual).
4. No descarga ZIP.

### M5. Determinismo manual (optional)

1. Como user con prompts, descargar 2 veces seguidas (sin crear
   versiones nuevas en el medio).
2. ✅ `sha256sum` de ambos archivos coincide.

### M6. Tamaño / streaming sanity

1. Crear (script) un prompt con 50 versiones de 4KB c/u.
2. Click descarga.
3. ✅ Descarga termina sin OOM del server (`docker stats` no muestra
   spike). La barra de descarga del browser progresa (es streaming,
   no instantánea).

### M7. Cross-browser

- ✅ Chrome: descarga arranca + filename correcto.
- ✅ Firefox: descarga arranca + filename correcto.
- ✅ Safari: descarga arranca + filename correcto.

(Linux/macOS dev. iOS/Android validan en P15+ post-deploy.)

---

## UX / copy review

- ✅ Sección "Your data" / "Tu data" visualmente coherente con el
  resto de cards de Pγ (mismo padding, font-display en title, copy
  en muted).
- ✅ Copy en rioplatense (alineado con PR #27 — "renombrá",
  "bajate", etc.).
- ✅ Botón primario (no secondary) — refleja la importancia del
  feature flagship.

---

## Conventions check (per `specs/conventions.md`)

- ✅ §1 — sin `process.env.X` fuera de `env.ts` (P13 no añade
  envs).
- ✅ §2 — todos los commits siguen Conventional Commits (`feat(p13):`,
  `test(p13):`, `chore(p13):`, `docs(p13):`).
- ✅ §5 — sin constants nuevos? Si los hay (filename pattern,
  README copy), van en `src/infrastructure/export/constants.ts`.
- ✅ §6 — `ExportAllPromptsQuery.execute(userId)` 1 arg → posicional.
  Sin object input.
- ✅ §9 — naming:
  - `export-all-prompts.query.ts` ✓
  - `zip-bundle-writer.adapter.ts` ✓
  - `export.handler.ts` ✓
  - `export-bundle.dto.ts` (DTO; sin suffix dedicado por convention,
    aceptable como tipo plano).
- ✅ §11 — UI sin colores hardcoded; usar shadcn/Pγ tokens
  (`bg-card`, `text-muted-foreground`, etc.). Botón usa el variant
  `default` de shadcn (mapea a `bg-primary`).
- ✅ Hexagonal: `domain/` no toca P13 (cero changes). `application/`
  no importa `fflate`. `infrastructure/export/` es único lugar con
  `fflate`. ✓

---

## Done definition

P13 está mergeable cuando:

- [ ] Todos los items de **Automated** (A1–A3) pasan.
- [ ] A4 pasa **o** está documentado como skipped (sin scaffolding).
- [ ] Todos los items M1–M5 pasaron en smoke local.
- [ ] M6 pasó en smoke (o documentado el resultado).
- [ ] M7 pasó en al menos 2 browsers (Chrome + Firefox).
- [ ] PR review aprobada — sin TODOs colgando, sin `console.log`
  debug, copy revisada.
- [ ] `tech-stack.md` lista `fflate` en deps.
- [ ] El branch está rebased contra `master` antes del merge final.
