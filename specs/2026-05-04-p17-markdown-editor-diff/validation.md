# P17 — Markdown editor + diff · Validation

## Static checks
```bash
bun run lint
bunx tsc --noEmit
bun test
bun run build
```
Todos verdes.

## Functional checks

### 1. Editor reemplaza textarea sin regresión
- Abrir prompt existente → ver syntax highlighting (markdown
  bold/heading/code).
- Tipear contenido → state se actualiza, Save persiste, recarga
  muestra el cambio.
- Verificar que el flujo completo (edit → save → version aparece
  en sidebar → SWR revalidate) funciona igual que pre-P17.

### 2. Diff toggle aparece y se habilita correctamente
- Prompt con 1 sola versión → toggle Diff disabled con tooltip
  "Need at least 2 versions to diff".
- Prompt con 2+ versiones → toggle activo. Click → entra en modo
  diff con vN-1 vs vN por default.

### 3. Side-by-side diff highlights correctamente
- Crear prompt con content `Línea uno\nLínea dos`.
- Save → v1.
- Editar a `Línea uno\nLínea modificada\nLínea tres`.
- Save → v2.
- Diff vs v1: panel izquierdo muestra "Línea dos" en rojo,
  panel derecho muestra "Línea modificada" + "Línea tres" en
  verde.

### 4. Picker A/B funciona
- Tener 4 versiones (v1, v2, v3, v4 actual).
- Default diff: v3 vs v4.
- Click `[A]` en v1 → panel izquierdo cambia a v1.
- Click `[B]` en v2 → panel derecho cambia a v2. Diff actualiza
  sin re-fetch (verificar Network tab — no hay request nuevo).

### 5. Diff es read-only
- En modo diff, intentar tipear en cualquiera de los dos paneles
  → no inserta texto.
- Cursor visible para selection (copy permitido), pero edits no.

### 6. Toggle Edit vuelve al estado editable con la versión current
- Modo Diff con A=v1, B=v3 → click Edit.
- Content del editor = v4 (current), no v1 ni v3.
- Edit es editable (caret + tipeo funciona).

### 7. Theme alineado a tokens
- Background del editor = `--color-surface-elevated`.
- Caret = `--color-accent-primary`.
- Highlights del diff usan `--color-diff-add-*` y
  `--color-diff-del-*`.
- Cambiar `--color-accent-primary` en DevTools → caret cambia
  inmediatamente.

### 8. Soft-wrap activo por default
- Pegar una línea de 500 caracteres → wrap visual sin scroll
  horizontal.
- (Stretch) Toggle "Wrap lines" en menú ⋮ → cambia a no-wrap,
  scroll horizontal aparece.

### 9. Performance OK con prompts típicos
- Prompt de ~5KB → editor responsive, tipeo sin lag.
- Diff de 2 versiones de ~5KB cada una → render <100ms,
  highlights instantáneos.

### 10. Bundle size aceptable
```bash
bun run build
ls -la dist/
```
- Bundle JS total < 1.5MB (era ~725KB pre-P17, esperar ~850KB).

### 11. Error handling
- `useVersionDiff` con vA inexistente (ej. v99) → toast error,
  revierte a Edit.
- `MarkdownEditor` con `value={null as any}` (defensive) → no
  crash, muestra empty.

## Acceptance / merge gate
- [ ] Static checks verdes.
- [ ] §1 editor reemplaza textarea sin regresión.
- [ ] §2 toggle Diff aparece según número de versiones.
- [ ] §3 highlights side-by-side correctos.
- [ ] §4 picker A/B sin re-fetch.
- [ ] §5 diff read-only.
- [ ] §6 Edit recupera current.
- [ ] §7 theme alineado a tokens (visual check).
- [ ] §8 soft-wrap default.
- [ ] §9 performance OK con prompt típico.
- [ ] §10 bundle size aceptable.
- [ ] §11 errores cubiertos.

Out of scope para mergear (post-P17 polish):
- Find & replace dentro del editor.
- Vim/Emacs keybindings.
- Markdown HTML preview.
- Permalink al diff.
- Diff unified mode.
