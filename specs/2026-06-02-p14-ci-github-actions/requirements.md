# P14 — CI con GitHub Actions · Requirements

## Why this phase

El repo ya tiene una quality gate local (husky `pre-push`:
`lint && typecheck && build && test`) pero **nada la enforcea en el
remoto**. Un colaborador sin los hooks instalados, un push con
`--no-verify`, o un merge desde la UI de GitHub pueden meter código
roto en `master`. P14 mueve esa gate al servidor: cada push y cada PR
corre los mismos 4 checks en GitHub Actions, dando una señal verde/roja
visible antes de mergear.

P14 no agrega features de producto — es infraestructura de calidad que
**cubre retroactivamente todo P0–P13** y es prerequisito de P15
(deploy) para no deployar un build roto.

**Depends on**: P13 (CI cubre todas las features ya escritas).

## Decisiones tomadas (sesión 2026-06-02)

1. **Checks: lint + typecheck + test + build (4 checks).**
   Paridad total con el hook `pre-push`. Resuelve la inconsistencia del
   roadmap (su *Goal* dice "lint + test + build", sus *Deliverables*
   dicen "typecheck + test + build") incluyendo **ambos** lint y
   typecheck. Nada que bloquee un push local puede pasar CI.

2. **Estructura: 4 jobs paralelos, uno por check.**
   `lint`, `typecheck`, `test`, `build` corren concurrentes, cada uno
   como su propio status check. Razón: branch protection granular
   (P15+ podrá requerir checks individuales), menor wall-clock, y un
   fallo no enmascara a los otros. Cada job hace su propio
   `bun install --frozen-lockfile` (cacheado por `setup-bun`).

3. **Test job: dummy env, sin service containers.**
   No se levantan Postgres ni Redis en CI. Razón: ningún test se
   conecta a Postgres, y el único test que usa Redis
   (`bun-redis-lock.adapter.test.ts`) es integración pura que se puede
   skipear. Trade-off aceptado: **se pierde la cobertura de Redis vivo
   en CI** (sigue corriendo localmente en `pre-push`).

   **Sutileza técnica crítica** (descubierta al planear): no se puede
   simplemente dejar `REDIS_URL` sin setear. `redis.ts` importa
   `env.ts`, que valida `REDIS_URL: z.url()` **al importarse**. Si
   `REDIS_URL` falta, `schema.parse(process.env)` tira `ZodError` y el
   archivo de test (y cualquiera que importe `env` transitivamente)
   falla al cargar — no skipea. Por lo tanto:
   - CI **sí** provee `REDIS_URL` (y todo el resto del env) con valores
     dummy válidos, para que `env.ts` parsee OK.
   - El guard de skip del lock test cambia de `!process.env.REDIS_URL`
     a `!process.env.REDIS_URL || process.env.CI === "true"`. GitHub
     Actions setea `CI=true` por default, así que el test self-skipea
     en CI pero **sigue corriendo localmente** (donde `CI` no está
     seteado y hay un Redis real). Cambio mínimo, no acopla el resto
     del suite a CI.

4. **`HUSKY=0` en CI.** `bun install` dispara el lifecycle `prepare`
   (`husky`), que intenta instalar git hooks. En CI es ruido
   innecesario (los hooks no aplican a un runner efímero). Setear
   `HUSKY=0` lo desactiva limpiamente.

5. **Triggers: `pull_request` (todos) + `push` solo a `master`.**
   El roadmap dice "push y pull_request". Para evitar runs duplicados
   (un push a una rama con PR abierto dispararía ambos), se limita
   `push` a `master` y se deja `pull_request` para ramas de feature.
   Resultado: 1 corrida por PR + 1 corrida en el merge a `master`.

6. **`bun install --frozen-lockfile`.** Falla si `bun.lock` no coincide
   con `package.json` — garantiza builds reproducibles y detecta
   lockfiles desactualizados.

7. **`setup-bun` con `bun-version: latest`.** Pin diferible: por ahora
   `latest` para no quedar atados a una versión; si aparece flakiness
   por un upgrade, pinear a la minor en uso. Documentado como punto a
   revisar.

8. **Branch protection: diferida.**
   Esta PR entrega solo el workflow. Requerir los 4 checks como gate de
   merge en `master` se hace después (necesita permisos de admin sobre
   el repo). Se documentan los pasos en `validation.md` para
   habilitarlo cuando se quiera. CI corre en PRs desde ya, pero todavía
   no bloquea el merge.

9. **Slicing: 1 PR.** Un solo archivo de workflow + un ajuste de 1
   línea al guard del lock test + docs. Atómico.

## In scope

### `.github/workflows/ci.yml` (NEW)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [master]
jobs:
  lint:      # bun install + bun run lint
  typecheck: # bun install + bun run typecheck
  test:      # bun install + bun test  (con env dummy)
  build:     # bun install + bun run build
```

- Runner: `ubuntu-latest`.
- Steps comunes: `actions/checkout@v4`, `oven-sh/setup-bun@v2`,
  `bun install --frozen-lockfile`, luego el script del check.
- `env: { HUSKY: 0 }` a nivel workflow (aplica a todos los jobs).
- El job `test` agrega un bloque `env:` con los dummies (ver abajo).

### Dummy env (solo job `test`)

Valores válidos por formato para que `env.ts` parsee sin Postgres/Redis
reales:

| Var | Valor dummy | Razón |
|---|---|---|
| `DATABASE_URL` | `postgres://ci:ci@localhost:5432/ci` | `z.url()` |
| `REDIS_URL` | `redis://localhost:6379` | `z.url()` |
| `AUTH_SECRET` | string ≥32 chars | `min(32)` |
| `AUTH_URL` | `http://localhost:3010` | `z.url()` |
| `GITHUB_AUTH_CLIENT_ID/SECRET` | `ci` | `min(1)` |
| `GITHUB_INTEGRATIONS_CLIENT_ID/SECRET` | `ci` | `min(1)` |
| `GOOGLE_CLIENT_ID/SECRET` | `ci` | `min(1)` |
| `ENCRYPTION_KEY` | base64 de 32 bytes (~44 chars) | `min(40)` |

`NODE_ENV` queda en su default (`development`) o se setea a `test`.
Ningún secreto real — son placeholders; no se usa GitHub Secrets porque
no hay servicios externos que contactar.

### Cambio al lock test

`src/infrastructure/cache/__test__/bun-redis-lock.adapter.test.ts`:
- Guard actual: `const skip = !process.env.REDIS_URL;`
- Nuevo: `const skip = !process.env.REDIS_URL || process.env.CI === "true";`
- Comentario explicando por qué (CI no tiene Redis; local sí).

### Specs cross-reference

- `roadmap.md` — marcar P14 done cuando mergee.
- `tech-stack.md` — no requiere cambio (ya menciona testing con `bun
  test`); opcionalmente agregar un bullet "CI" en Tooling.
- `README.md` — opcional: badge de CI (queda para P16 que ya pide
  "badge de CI", para no duplicar).

## Out of scope (deferred)

- **Branch protection / required checks** — diferido (decisión 8),
  pasos documentados en `validation.md`.
- **Service containers Postgres/Redis** en CI — no se levantan
  (decisión 3); si se agregan tests de integración contra DB en el
  futuro, reconsiderar.
- **Migrations en CI** (`bun run db:migrate`) — innecesario sin
  Postgres y sin tests que lo usen.
- **Cache de dependencias manual** — `setup-bun` ya cachea; no se
  agrega `actions/cache` adicional en V1.
- **Matrix de versiones de Bun / OS** — un solo runner, una sola
  versión. Innecesario para un solo runtime target.
- **Deploy / release automation** — es P15.
- **Badge de CI en README** — lo pide P16 explícitamente; no se
  duplica acá.
- **E2E Playwright en CI** — lo introduce P16.

## Risks / open items

- **`env.ts` evoluciona**: si una fase futura agrega una var required a
  `env.ts`, el job `test` empezará a fallar hasta agregar el dummy
  correspondiente. Mitigación: el bloque `env:` del workflow es la
  lista a mantener; documentado.
- **Tests que asuman Redis/Postgres vivo**: hoy solo el lock test toca
  un servicio y se guard-ea. Si una fase futura agrega tests de
  integración contra DB sin guard, fallarán en CI. Mitigación:
  convención de guardear tests de integración por env (ya es el patrón
  del lock test).
- **`bun-version: latest` rompe**: un upgrade de Bun podría introducir
  flakiness. Mitigación: pinear a la minor en uso (decisión 7).
- **`--frozen-lockfile` falla por lockfile desactualizado**: es el
  comportamiento deseado (señal de que alguien tocó `package.json` sin
  `bun install`). No es un bug.
- **Runs duplicados**: mitigado limitando `push` a `master`
  (decisión 5).
