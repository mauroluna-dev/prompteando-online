# P0 — Hexagonal Scaffolding · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P0. El scaffold actual de Bun es plano —
todo vive en `src/`. Para que cualquier feature posterior caiga en su
capa sin fricción, P0 deja el repo estructurado según
`specs/tech-stack.md` (Hexagonal + CQS) y reemplaza el
`src/index.ts` crudo por un servidor Elysia mínimo con un health
endpoint. No se construye ninguna feature de dominio en esta fase;
es puro andamiaje.

## In scope
- Reubicar el frontend actual (React scaffold + shadcn) bajo
  `src/frontend/`.
- Crear las carpetas vacías de las capas hexagonales
  (`domain/`, `application/{commands,queries,ports}/`,
  `infrastructure/{persistence,github,cache,auth}/`,
  `interfaces/http/{routes,middlewares}/`).
- Reemplazar `src/index.ts` por `src/interfaces/http/server.ts` con
  Elysia, exponiendo `GET /health` y sirviendo el HTML del frontend.
- Path aliases en `tsconfig.json` para todas las capas y para shadcn
  (`@/components`, `@/lib`).
- Instalar **solo** las deps que P0 ya consume.
- Test dummy de sanidad en `src/domain/__test__/sanity.test.ts`.

## Out of scope
- Drizzle / Postgres / esquema de BD (entra en P2).
- Auth.js / providers OAuth (P3+).
- Octokit / GitHub integration (P10+).
- Docker Compose dev environment (P1).
- CI / GitHub Actions (P14).
- Cualquier feature de dominio (prompts, versions, api keys).

## Decisiones acordadas (este turno)

### Folder layout
**Decisión**: mover TODO el frontend actual a `src/frontend/`.
- Se mueven: `App.tsx`, `APITester.tsx`, `frontend.tsx`,
  `index.html`, `index.css`, `lib/utils.ts`, `components/ui/*`,
  `logo.svg`, `react.svg`.
- `styles/globals.css` **queda en la raíz** del repo (es configuración
  de Tailwind a nivel proyecto, no asset del frontend). Se actualiza
  el import relativo en `src/frontend/index.css` de
  `../styles/globals.css` → `../../styles/globals.css`.
- Backend hex layers viven directamente bajo `src/`.

### Deps a instalar
**Decisión**: solo lo que P0 consume.
```
elysia
@elysiajs/cors
zod
swr
react-router
```
Drizzle se instala en P2; `@auth/*` en P3; Octokit en P10;
`react-hook-form` en P6.

### Test layout
**Decisión**: subcarpeta `__test__/` por módulo (consistente con la
mención literal en `specs/roadmap.md`).
- Unit tests de domain/application:
  `src/<layer>/<module>/__test__/*.test.ts`.
- Tests de integración: `tests/integration/*.test.ts` (no se crea en
  P0; sólo el sanity test bajo `src/domain/__test__/`).

## Decisiones técnicas derivadas
- Path aliases en `tsconfig.json`:
  ```
  @/domain/*         → src/domain/*
  @/application/*    → src/application/*
  @/infrastructure/* → src/infrastructure/*
  @/interfaces/*     → src/interfaces/*
  @/frontend/*       → src/frontend/*
  @/components/*     → src/frontend/components/*    # shadcn compat
  @/lib/*            → src/frontend/lib/*           # shadcn compat
  ```
- `components.json` no requiere cambios funcionales: los componentes
  shadcn existentes ya usan `@/components` y `@/lib`; los aliases se
  reapuntan a `src/frontend/` y todo sigue resolviendo.
- `package.json` scripts:
  - `dev`: `bun --hot src/interfaces/http/server.ts`
  - `start`: `NODE_ENV=production bun src/interfaces/http/server.ts`
- `build.ts` ya descubre HTML entrypoints en `src/`. Verificar que el
  glob captura `src/frontend/index.html`; ajustar si filtra solo el
  primer nivel.
- `bunfig.toml` no cambia (sólo declara plugin Tailwind).
- Elysia sirve el HTML del frontend importándolo:
  `import index from "../../frontend/index.html"` desde
  `src/interfaces/http/server.ts`. Esto preserva el bundling nativo de
  Bun y HMR.

## Critical files
- `src/index.ts` → **eliminar**.
- `src/index.html`, `src/App.tsx`, `src/APITester.tsx`,
  `src/frontend.tsx`, `src/index.css`, `src/lib/`, `src/components/`,
  `src/logo.svg`, `src/react.svg` → **mover a `src/frontend/`**.
- `src/interfaces/http/server.ts` → **crear** (Elysia).
- `src/domain/__test__/sanity.test.ts` → **crear**.
- `tsconfig.json` → agregar `baseUrl` y `paths`.
- `package.json` → actualizar `dev`/`start` y agregar deps P0.
- `build.ts` → verificar / ajustar glob de HTML entrypoints.
- `README.md` → reflejar nueva estructura.

## References
- `specs/mission.md` — contexto del producto y personas.
- `specs/tech-stack.md` — stack y arquitectura completos.
- `specs/roadmap.md` — definición canónica y verificación de P0.
- `CLAUDE.md` — mandatos Bun-native (Bun.serve via Elysia, sin Node).
