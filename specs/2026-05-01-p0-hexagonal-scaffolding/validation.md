# P0 — Hexagonal Scaffolding · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan, ejecutados desde un fresh clone con
`bun install` ya corrido.

## Functional checks

### 1. Health endpoint responde
```bash
bun dev &
SERVER_PID=$!
sleep 2

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
# Expected: 200

curl -s http://localhost:3000/health
# Expected: {"ok":true}
```

### 2. Frontend served en raíz
```bash
curl -s http://localhost:3000/ | grep -q '<div id="root"'
# Expected: exit 0 (encontró el div root del HTML)
```

### 3. Smoke en browser
- Abrir `http://localhost:3000/` en un navegador.
- La UI del scaffold (logo + Card + APITester) renderiza sin
  errores en DevTools console.
- Hot reload: editar `src/frontend/App.tsx` (ej. cambiar un texto) y
  guardar. El cambio aparece en el browser sin reload manual.

```bash
kill $SERVER_PID
```

### 4. Tests pasan
```bash
bun test
# Expected: exit 0, al menos 1 test pasando ("scaffolding sanity").
```

### 5. Build de producción
```bash
bun run build
# Expected: exit 0.
ls dist/index.html
# Expected: existe.
```

### 6. TypeScript sin errores
```bash
bunx tsc --noEmit
# Expected: exit 0, sin diagnostics.
```

## Structural checks

### 7. Carpetas hexagonales presentes
Todas las siguientes deben existir (con `.gitkeep` adentro si no
tienen archivos):
```
src/domain/
src/application/commands/
src/application/queries/
src/application/ports/
src/infrastructure/persistence/
src/infrastructure/github/
src/infrastructure/cache/
src/infrastructure/auth/
src/interfaces/http/routes/
src/interfaces/http/middlewares/
src/frontend/
```

### 8. Frontend completo en src/frontend/
Existen:
- `src/frontend/index.html`
- `src/frontend/App.tsx`
- `src/frontend/APITester.tsx`
- `src/frontend/frontend.tsx`
- `src/frontend/index.css`
- `src/frontend/lib/utils.ts`
- `src/frontend/components/ui/{button,card,input,label,select,textarea}.tsx`
- `src/frontend/logo.svg`
- `src/frontend/react.svg`

NO existen (fueron movidos):
- `src/index.html`
- `src/App.tsx`, `src/APITester.tsx`, `src/frontend.tsx`
- `src/index.css`
- `src/lib/`
- `src/components/`
- `src/logo.svg`, `src/react.svg`

### 9. Server entry rewired
- `src/interfaces/http/server.ts` existe y usa `Elysia`.
- `src/index.ts` **NO** existe.
- `package.json` script `dev` apunta a
  `bun --hot src/interfaces/http/server.ts`.
- `package.json` script `start` apunta a
  `NODE_ENV=production bun src/interfaces/http/server.ts`.

### 10. Path aliases en tsconfig
`tsconfig.json` contiene `baseUrl: "."` y las 7 entradas de `paths`
declaradas en `requirements.md`.

### 11. Deps P0 instaladas
`package.json` (dependencies o devDependencies) incluye:
- `elysia`
- `@elysiajs/cors`
- `zod`
- `swr`
- `react-router`

## Non-regression checks

### 12. Stack preexistente intacto
`package.json` sigue declarando, sin cambios:
- `react`, `react-dom`
- `tailwindcss`, `bun-plugin-tailwind`
- `@radix-ui/react-label`, `@radix-ui/react-select`,
  `@radix-ui/react-slot`
- `lucide-react`
- `class-variance-authority`, `clsx`, `tailwind-merge`

`bunfig.toml` mantiene plugin Tailwind. `components.json` puede tener
sus aliases sin cambios (o ajustes mínimos) y los componentes shadcn
existentes siguen resolviendo `@/components` y `@/lib`.

### 13. Git limpio post-trabajo
```bash
git status
# Expected: "nothing to commit, working tree clean"
# (luego de commitear los cambios de la fase).
```

### 14. README al día
`README.md` describe la nueva estructura de `src/`, los path aliases,
y los comandos `bun dev` / `bun test` / `bun run build`.

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR. CI todavía
no aplica (entra en P14); la verificación de esta fase es local.
