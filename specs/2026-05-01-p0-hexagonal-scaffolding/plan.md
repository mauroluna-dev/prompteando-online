# P0 — Hexagonal Scaffolding · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una y revisar en aislamiento.

## 1. Crear estructura de carpetas hexagonales (vacías)
1.1. Crear directorios:
- `src/domain/`
- `src/application/commands/`
- `src/application/queries/`
- `src/application/ports/`
- `src/infrastructure/persistence/`
- `src/infrastructure/github/`
- `src/infrastructure/cache/`
- `src/infrastructure/auth/`
- `src/interfaces/http/routes/`
- `src/interfaces/http/middlewares/`

1.2. Agregar `.gitkeep` en cada carpeta vacía para que Git las trackee.

## 2. Migrar el frontend a src/frontend/
2.1. Crear `src/frontend/`.

2.2. `git mv` cada archivo:
- `src/App.tsx` → `src/frontend/App.tsx`
- `src/APITester.tsx` → `src/frontend/APITester.tsx`
- `src/frontend.tsx` → `src/frontend/frontend.tsx`
- `src/index.html` → `src/frontend/index.html`
- `src/index.css` → `src/frontend/index.css`
- `src/logo.svg` → `src/frontend/logo.svg`
- `src/react.svg` → `src/frontend/react.svg`
- `src/lib/` → `src/frontend/lib/`
- `src/components/` → `src/frontend/components/`

2.3. Actualizar `src/frontend/index.css`:
`@import "../styles/globals.css"` → `@import "../../styles/globals.css"`.

2.4. Verificar que los imports relativos entre archivos del frontend
siguen resolviendo (App.tsx ↔ APITester.tsx ↔ logo, etc.). No deberían
romperse porque los archivos se mueven juntos.

## 3. Eliminar entry point viejo y crear server Elysia
3.1. Eliminar `src/index.ts`.

3.2. Crear `src/interfaces/http/server.ts`:
- `import { Elysia } from "elysia"`
- `import index from "../../frontend/index.html"`
- Route `GET /health` → JSON `{ ok: true }`
- Route catch-all `GET *` → servir el HTML del frontend
- `.listen(3000)`

3.3. Actualizar `package.json` scripts:
- `dev`: `bun --hot src/interfaces/http/server.ts`
- `start`: `NODE_ENV=production bun src/interfaces/http/server.ts`

## 4. tsconfig: path aliases
4.1. Agregar a `tsconfig.json` `compilerOptions`:
```jsonc
"baseUrl": ".",
"paths": {
  "@/domain/*":         ["src/domain/*"],
  "@/application/*":    ["src/application/*"],
  "@/infrastructure/*": ["src/infrastructure/*"],
  "@/interfaces/*":     ["src/interfaces/*"],
  "@/frontend/*":       ["src/frontend/*"],
  "@/components/*":     ["src/frontend/components/*"],
  "@/lib/*":            ["src/frontend/lib/*"]
}
```

4.2. `bunx tsc --noEmit` debe terminar sin errores.

## 5. Instalar deps de P0
5.1. `bun add elysia @elysiajs/cors zod swr react-router`

5.2. Confirmar versions compatibles con React 19 / Bun latest. (React
Router v7 ya es compatible con React 19.)

5.3. Commitear `bun.lock` y `package.json` actualizados.

## 6. Sanity test
6.1. Crear `src/domain/__test__/sanity.test.ts`:
```ts
import { test, expect } from "bun:test";

test("scaffolding sanity", () => {
  expect(1).toBe(1);
});
```

6.2. `bun test` debe pasar con al menos 1 test.

## 7. Verificar build pipeline
7.1. Inspeccionar `build.ts`: confirmar que el glob de HTML entrypoints
descubre `src/frontend/index.html`. Si filtra solo `src/*.html`, ajustar
a `src/**/*.html`.

7.2. `bun run build` debe terminar sin error y generar `dist/index.html`
+ assets bundled (CSS, JS, SVGs).

## 8. Smoke test end-to-end
8.1. `bun dev` levanta el server.

8.2. `curl localhost:3000/health` → 200 + `{ ok: true }`.

8.3. Browser: `http://localhost:3000/` muestra la UI del scaffold
(App.tsx con Card y APITester) sin errores en DevTools console.

8.4. Hot reload funciona: editar `src/frontend/App.tsx` → cambio
visible en el browser sin recargar manualmente.

## 9. Cierre
9.1. Actualizar `README.md`:
- Nueva estructura de `src/`.
- Path aliases disponibles.
- Comandos clave (`bun dev`, `bun test`, `bun run build`).

9.2. `git status` limpio salvo los cambios esperados.

9.3. Abrir PR `feat/p0-hexagonal-scaffolding` → `master` con link
a `specs/2026-05-01-p0-hexagonal-scaffolding/validation.md` en la
descripción.
