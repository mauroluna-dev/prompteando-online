# P14 — CI con GitHub Actions · Plan

Single PR. Numbered task groups; each item ≈ 1 atomic commit.

---

## 1. Spec docs

1.1. `docs(p14): add P14 spec docs (requirements, plan, validation)`
   — este directorio. Scaffolding del PR.

---

## 2. Lock test CI guard

2.1. `test(p14): skip BunRedisLock integration test in CI`
   — editar
   `src/infrastructure/cache/__test__/bun-redis-lock.adapter.test.ts`:
   guard `const skip = !process.env.REDIS_URL || process.env.CI === "true";`
   + comentario. Razón: en CI hay `REDIS_URL` dummy (para que `env.ts`
   parsee) pero no hay Redis real; el guard previo `!REDIS_URL` ya no
   alcanza. Local (sin `CI`) sigue corriendo el test.
   - Verificar local: `CI=true bun test <ese archivo>` → el describe
     aparece como skipped, suite verde.
   - Verificar local: `bun test <ese archivo>` (Redis up) → corre y pasa.

---

## 3. Workflow

3.1. `ci(p14): add GitHub Actions workflow (lint, typecheck, test, build)`
   — `.github/workflows/ci.yml`:
   - `name: CI`.
   - `on: pull_request` + `push: { branches: [master] }`.
   - `env: { HUSKY: 0 }` a nivel top.
   - 4 jobs paralelos en `ubuntu-latest`, cada uno:
     1. `actions/checkout@v4`
     2. `oven-sh/setup-bun@v2` (`bun-version: latest`)
     3. `bun install --frozen-lockfile`
     4. el comando del check
   - `lint` → `bun run lint`
   - `typecheck` → `bun run typecheck`
   - `test` → `bun test`, con bloque `env:` de dummies (ver
     `requirements.md` §Dummy env). Incluir `CI: true` está implícito
     (GitHub lo setea), pero se puede dejar explícito para claridad.
   - `build` → `bun run build`

---

## 4. Verificación local del YAML

4.1. Lint del YAML (sin commit aparte): validar sintaxis con
   `bunx --yes yaml-lint .github/workflows/ci.yml` o equivalente, o
   simplemente revisar a ojo + confiar en que GitHub lo parsee al push.
   (No bloqueante; GitHub reporta errores de schema en la pestaña
   Actions.)

---

## 5. Smoke + ship

5.1. Push de la rama → abrir PR. **La propia PR es la verificación**:
   los 4 checks deben correr y pasar verdes (ver `validation.md`).

5.2. Revisar en la pestaña "Checks" del PR:
   - 4 jobs aparecen: lint, typecheck, test, build.
   - Todos verdes.
   - En el log de `test`, el describe `BunRedisLock` figura **skipped**
     (no failed).

5.3. Si algún job falla por un dummy env faltante o un guard, iterar
   sobre `ci.yml` / el test y re-pushear hasta verde.

5.4. (Post-merge, opcional, fuera de esta PR) habilitar branch
   protection según los pasos de `validation.md`.

---

## Touched files (preview)

```
specs/2026-06-02-p14-ci-github-actions/   # NEW (3 files)
.github/workflows/ci.yml                   # NEW
src/infrastructure/cache/__test__/
  bun-redis-lock.adapter.test.ts           # EDIT (1-line guard)
```

Estimación: ~3 commits, ~70 líneas (mayormente YAML). Una sola PR.

---

## Out of plan (V1 won't do)

- Branch protection automatizada (diferida; pasos manuales en
  `validation.md`).
- Service containers Postgres/Redis.
- Badge de CI en README (lo hace P16).
- Playwright E2E en CI (lo hace P16).
- `actions/cache` extra (setup-bun ya cachea).
