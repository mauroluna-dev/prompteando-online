# P17 — Markdown editor + diff · Plan

Numbered task groups. Cada grupo deja la app en estado compilable
salvo donde se indique.

## 0. Pre-flight: design tokens (depende de Pγ)

Si Pγ todavía no aterrizó los tokens, P17 puede arrancar
escribiendo CSS vars provisional en
`src/frontend/styles/tokens.css` (las del design brief Pγ §3) y
sumarlas al `@theme` de Tailwind. Sin esto los colores del editor
no se mapean.

## 1. Install deps

```bash
bun add @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/merge
```

Verificar bundle size delta con `bun run build` (esperar
~120KB).

## 2. `<MarkdownEditor>` component

2.1. Crear `src/frontend/components/MarkdownEditor.tsx` siguiendo
los specs de requirements §Frontend → "Componente
`<MarkdownEditor>`".

2.2. Crear `src/frontend/components/codemirror-theme.ts`
exportando `customTheme` con el mapping a CSS vars.

2.3. Tests unitarios mínimos
`src/frontend/components/__test__/MarkdownEditor.test.tsx`
(usar `happy-dom`):
- Mount + unmount limpia la EditorView.
- `value` prop controlled: cambiar prop externamente actualiza
  el contenido.
- `onChange` se dispara al tipear (simular con
  `view.dispatch({changes:...})`).
- `readOnly: true` previene cambios.

## 3. Reemplazar textarea en PromptDetailPage

3.1. Encontrar el `<textarea>` actual del editor (posiblemente
en `PromptDetailPage.tsx` o `PromptEditorPage.tsx`).

3.2. Reemplazar con `<MarkdownEditor value={...} onChange={...} />`.
Mantener el botón Save y el commit-message input.

3.3. Smoke manual: editar un prompt → ver syntax highlighting
de `**bold**`, `# heading`, ```code``` blocks. Save → la versión
se persiste igual que antes.

## 4. `<VersionDiff>` component

4.1. Crear `src/frontend/components/VersionDiff.tsx` siguiendo
los specs de requirements §Frontend → "Componente
`<VersionDiff>`".

4.2. Tema custom para el merge view: `MergeView` acepta
extensions distintas en `a` y `b`. Usar el mismo `customTheme`
+ override de los colores de chunk con `--color-diff-*`.

4.3. Tests unitarios mínimos:
- Mount con dos contenidos distintos → MergeView se crea, ambas
  panelas tienen los textos correctos.
- Cambio de `contentA` por prop → re-render del side izquierdo.

## 5. Hook `useVersionDiff`

5.1. Crear `src/frontend/hooks/use-version-diff.ts` per spec.

5.2. Test unitario:
- Versions array vacío → `{ contentA: null, contentB: null, isLoading: false }`.
- Match exitoso de ambas → contenidos correctos.
- Match parcial (vA existe, vB no) → `contentB: null`.

## 6. Toggle Edit / Diff en PromptDetailPage

6.1. Importar `<ToggleGroup>` de shadcn/ui (instalar si no
existe: `bunx shadcn@latest add toggle-group`).

6.2. Agregar state:
```tsx
const [mode, setMode] = useState<"edit" | "diff">("edit");
const [diffVersionA, setDiffVersionA] = useState<number | null>(null);
const [diffVersionB, setDiffVersionB] = useState<number | null>(null);
```

6.3. Cuando se entra a `mode === "diff"` por primera vez:
default `diffVersionA = currentVersion - 1`,
`diffVersionB = currentVersion`. Si solo hay una versión,
toggle Diff queda disabled con tooltip "Need at least 2
versions to diff".

6.4. Layout condicional:
```tsx
{mode === "edit" ? (
  <MarkdownEditor value={...} onChange={...} />
) : (
  <VersionDiff
    contentA={diffData.contentA ?? ""}
    contentB={diffData.contentB ?? ""}
    labelA={`v${diffVersionA}`}
    labelB={`v${diffVersionB}${diffVersionB === currentVersion ? " (current)" : ""}`}
  />
)}
```

## 7. Sidebar version selectors A/B

7.1. Editar `<VersionHistory>` (componente existente del sidebar).
Agregar prop opcional:
```ts
mode?: "navigate" | "diff-select";
selectedA?: number;
selectedB?: number;
onSelectA?: (n: number) => void;
onSelectB?: (n: number) => void;
```

7.2. Cuando `mode === "diff-select"`:
- Cada `<VersionHistoryItem>` muestra dos pequeños toggles:
  `[A]` `[B]` a la izquierda.
- Click en `[A]` setea `diffVersionA`. Click en `[B]` setea
  `diffVersionB`. La versión activa se resalta.
- Si A === B, mostrar warning "Pick two different versions".

7.3. Cuando `mode === "navigate"` (default): comportamiento
actual.

## 8. Empty / loading / error states

8.1. Si `useVersions` está cargando → render skeleton del
sidebar y placeholder en el editor.

8.2. Si no hay versiones aún (recién creado el prompt) → el
editor muestra el contenido vacío editable. Diff toggle disabled.

8.3. Si `useVersionDiff` devuelve null para alguna parte (race
con delete?) → toast error + revertir a edit mode.

## 9. Validation pass

9.1. `bun run lint && bun run typecheck && bun run build && bun test` verde.

9.2. Smoke manual:
- Crear prompt nuevo, editar con el editor nuevo, save → v1 OK.
- Editar 2 veces más → v3 actual.
- Toggle Diff vs ▾ → side-by-side de v2 vs v3, highlights correctos.
- Cambiar A a v1 → se actualiza el panel izquierdo sin reload.
- Toggle Edit → vuelve al editor con v3 content.
- Hacer un cambio → save → v4 → diff default ahora es v3 vs v4.

## 10. Commits + PR

Commits conventional siguiendo `specs/conventions.md` §2:
- `feat(p17): install codemirror 6 deps`
- `feat(p17): add MarkdownEditor wrapping CodeMirror 6`
- `feat(p17): replace textarea with MarkdownEditor in editor page`
- `feat(p17): add VersionDiff component using @codemirror/merge`
- `feat(p17): add useVersionDiff hook`
- `feat(p17): wire Edit/Diff toggle + version A/B selectors`
- `docs(p17): add P17 spec docs (requirements, plan, validation)`

PR contra `master`. Screenshot del editor + diff en la descripción.
