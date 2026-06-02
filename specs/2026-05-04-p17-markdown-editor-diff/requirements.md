# P17 — Markdown editor + version diff · Requirements

## Why this phase

Hoy el editor de prompts es un `<textarea>` plano (P6/P7). Esto:
- No tiene syntax highlighting de markdown, dificultando leer
  prompts largos con frontmatter, listas, code blocks.
- No deja comparar dos versiones — el usuario tiene que abrir 2
  pestañas o copiar-pegar para ver qué cambió entre v3 y v4.
- No tiene line numbers ni soft-wrap configurable.
- No respeta el diseño (Pγ) — es un textarea sin estilo coherente.

Después de P17:
- El editor es CodeMirror 6 con lang-markdown, theme alineado a
  los design tokens, soft-wrap por default.
- Toggle "Diff vs ▾" abre un side-by-side con cualquier versión
  histórica (picker de versión A y B, default = vN-1 vs vN).
- Cambios resaltados con `@codemirror/merge` MergeView (verde +
  rojo según `--color-diff-*` tokens).
- Cero load extra al backend: el diff se computa client-side
  con los contenidos ya cacheados por SWR en `useVersions`.

## Decisiones tomadas (sesión 2026-05-04)

1. **Editor**: CodeMirror 6 (`@codemirror/state`,
   `@codemirror/view`, `@codemirror/lang-markdown`,
   `@codemirror/merge`). Headless, ~70KB gzipped. Razón:
   lightweight vs Monaco (~700KB), control total del theme.

2. **Diff layout**: side-by-side con picker A/B en el sidebar.
   Default opening: A=vN-1, B=vN (current). Razón: para prompts
   largos (1-5KB típicos) el contexto del lado importa; unified
   pierde el "qué párrafo era" cuando hay reescritura.

3. **Theme custom**: NO usar `one-dark` ni temas built-in. Mapear
   colores a las CSS vars de Pγ via `EditorView.theme()`. Razón:
   coherencia visual con el resto de la app.

4. **Diff client-side**: el merge se computa en el browser sobre
   `version.content` ya disponible. NO endpoint nuevo. Razón:
   los versions ya viajan en el listado, agregar un endpoint
   sería duplicar superficie sin ganancia.

5. **Edit y Diff son toggles, no tabs**: el botón
   `<ToggleGroup value="edit|diff">` cambia el componente
   renderizado. En modo Diff el editor es read-only (no se
   puede tipear), porque el contenido es la comparación de dos
   versiones inmutables.

6. **Soft-wrap activado por default**: prompts pueden tener
   líneas largas (URLs, instrucciones de una sola línea). Toggle
   en el menú "⋮" para desactivarlo si el usuario quiere.

## In scope

### Frontend

#### Componente `<MarkdownEditor>`

Archivo: `src/frontend/components/MarkdownEditor.tsx`.

Props:
```ts
type MarkdownEditorProps = {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** focus el editor al mount. Default false. */
  autoFocus?: boolean;
};
```

Internals:
- `useRef<HTMLDivElement>` para el contenedor.
- `useEffect` que crea `EditorView` con extensiones:
  - `lineNumbers()`
  - `markdown({ codeLanguages: languages })` (opcional para
    syntax highlighting de code blocks)
  - `EditorView.lineWrapping` (soft-wrap)
  - `EditorView.theme(customTheme)` mapeando a CSS vars
  - `EditorState.readOnly.of(props.readOnly ?? false)`
  - `EditorView.updateListener.of(...)` que dispatcha `onChange`
    en cambios.
- Cleanup destruye la `EditorView` en unmount.
- `value` controlled: si cambia externamente, `dispatch` con
  `changes: { from: 0, to: state.doc.length, insert: value }`.

Theme mapping (excerpt):
```ts
const customTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-surface-elevated)",
    color: "var(--color-foreground-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    lineHeight: "1.5",
  },
  ".cm-content": { caretColor: "var(--color-accent-primary)" },
  ".cm-cursor": { borderLeftColor: "var(--color-accent-primary)" },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface-subtle)",
    color: "var(--color-foreground-muted)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-surface-subtle)" },
  // markdown-specific syntax colors mapped to design tokens
});
```

#### Componente `<VersionDiff>`

Archivo: `src/frontend/components/VersionDiff.tsx`.

Props:
```ts
type VersionDiffProps = {
  contentA: string;
  contentB: string;
  labelA: string;  // e.g. "v3"
  labelB: string;  // e.g. "v4 (current)"
};
```

Internals:
- Usa `MergeView` de `@codemirror/merge`.
- Configurado con:
  - `a: { doc: contentA, extensions: [markdown(), EditorView.lineWrapping, readonly] }`
  - `b: { doc: contentB, extensions: [markdown(), EditorView.lineWrapping, readonly] }`
  - `orientation: "a-b"` (side-by-side, A left B right)
  - `revertControls: false` (no permitir aplicar cambios — es
    read-only)
  - `gutter: true`
  - `highlightChanges: true`
  - Theme custom que pinta `+` con `--color-diff-add-*` y `-`
    con `--color-diff-del-*`.
- Headers en cada panel mostrando `labelA` y `labelB`.

#### `<PromptEditorPage>` extendido

Archivo existente: `src/frontend/pages/PromptDetailPage.tsx` (o
equivalente).

Cambios:
- Reemplazar `<textarea>` actual por `<MarkdownEditor>`.
- Agregar state local: `mode: "edit" | "diff"`,
  `diffVersionA: VersionNumber`, `diffVersionB: VersionNumber`.
- Toolbar agrega `<ToggleGroup type="single" value={mode}>` con
  opciones "Edit" y "Diff vs ▾".
- Cuando `mode === "diff"`:
  - Renderiza `<VersionDiff>` en lugar del editor.
  - Sidebar muestra cada versión con 2 toggles: "[A] [B]" para
    elegir qué versión va a qué lado.
  - Default: A = previousVersion, B = currentVersion.
- Cuando `mode === "edit"`:
  - El sidebar versions sigue clickeable para "view-only" de
    una versión vieja (otra historia, no parte de P17).

#### Hook nuevo: `useVersionDiff(slug, vA, vB)`

Archivo: `src/frontend/hooks/use-version-diff.ts`.

```ts
export function useVersionDiff(
  slug: string,
  versionA: number,
  versionB: number,
): { contentA: string | null; contentB: string | null; isLoading: boolean } {
  const { data: versions, isLoading } = useVersions(slug);
  if (!versions) return { contentA: null, contentB: null, isLoading };
  const a = versions.find((v) => v.versionNumber === versionA);
  const b = versions.find((v) => v.versionNumber === versionB);
  return {
    contentA: a?.content ?? null,
    contentB: b?.content ?? null,
    isLoading: false,
  };
}
```

Razón: encapsular la búsqueda en el array y permitir tests
aislados del componente.

### Backend

**Sin cambios.** El listado actual de versiones
(`GET /api/prompts/:slug/versions`) ya devuelve `content` en
cada item (verificar — si no, agregarlo al `ListVersionsQuery`
DTO).

### Dependencias nuevas

`package.json` runtime:
```
@codemirror/state
@codemirror/view
@codemirror/lang-markdown
@codemirror/merge
```

Approx total bundle delta: +120KB minified (acceptable; el editor
es uno de los componentes más usados).

## Out of scope (deferred)

- **Markdown preview pane**: render del markdown como HTML al
  lado del editor. V1 = solo editor con syntax highlighting; el
  preview sale post-V1.
- **Vim/Emacs keybindings**: built-in en CodeMirror 6 vía
  `@codemirror/vim`. Diferido a settings de usuario futuro.
- **Find & replace within editor**: built-in vía `@codemirror/search`.
  Diferido.
- **Autocomplete de variables `{{var}}`**: corresponde a V2
  (templates).
- **Diff inline (unified)**: solo side-by-side por ahora; toggle
  unified post-V1 si se pide.
- **Diff de >2 versiones a la vez (3-way)**: no.
- **Permalink al diff** (`?diff=v3..v4` en URL): nice-to-have,
  diferido salvo que sea trivial integrar.
- **Comments en versiones específicas** (estilo PR review): no.

## Risks / open items

- **Performance del MergeView con prompts >100KB**: GitHub Markdown
  files típicos son <10KB; prompteando limita al tamaño de un
  prompt razonable. Si aparece prompt grande, `MergeView` puede
  laggear. Mitigación: warning si `content.length > 50_000` y
  fallback a unified mode.
- **CodeMirror SSR**: si la app empieza a SSR, el editor no
  monta server-side (depende de DOM). Wrap en `useEffect` con
  guard `typeof window !== 'undefined'`. Por ahora es CSR via
  Bun HTML imports, no problem.
- **Theme drift entre app y editor**: cualquier cambio de
  `--color-*` tokens debe verificarse visualmente en el editor.
  Mitigación: snapshot test del theme + sample content.
- **Cargado de Cal Sans / Numans / Geist Mono**: requiere
  `@fontsource/*` o link a Google Fonts. Si no carga, fallback
  a Geist + Inter + Geist Mono (las que ya están). Documentar
  la regresión visual y que NO bloquea P17.
- **Multibyte content** (CJK, emoji): CodeMirror 6 lo maneja
  bien por default, pero verificar contadores de líneas.
