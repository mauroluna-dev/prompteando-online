# P14 — CI con GitHub Actions · Validation

Conditions for merging this PR. All must hold.

---

## Automated (local, antes de pushear)

### A1. El suite pasa con el guard nuevo, simulando CI

```sh
# Simula CI: REDIS_URL seteado pero "CI=true" → el lock test skipea.
CI=true REDIS_URL=redis://localhost:6379 bun test
```
- ✅ Suite verde.
- ✅ El describe `BunRedisLock` aparece como **skipped**, no failed.

### A2. El suite sigue corriendo el lock test localmente

```sh
# Local normal (CI no seteado, Redis arriba via docker compose).
bun test src/infrastructure/cache/__test__/bun-redis-lock.adapter.test.ts
```
- ✅ El test de `BunRedisLock` **corre y pasa** (no skipea) cuando
  `CI` no está seteado y hay Redis.

### A3. Quality gate completa local

```sh
bun run lint        # 0 warnings
bun run typecheck   # 0 errors
bun run build       # ok
bun test            # all green
```

### A4. El env dummy parsea

Sanity de que los valores dummy del workflow satisfacen `env.ts`:
```sh
DATABASE_URL=postgres://ci:ci@localhost:5432/ci \
REDIS_URL=redis://localhost:6379 \
AUTH_SECRET=0123456789012345678901234567890123 \
AUTH_URL=http://localhost:3010 \
GITHUB_AUTH_CLIENT_ID=ci GITHUB_AUTH_CLIENT_SECRET=ci \
GITHUB_INTEGRATIONS_CLIENT_ID=ci GITHUB_INTEGRATIONS_CLIENT_SECRET=ci \
GOOGLE_CLIENT_ID=ci GOOGLE_CLIENT_SECRET=ci \
ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
CI=true bun -e 'import("@/infrastructure/config/env").then(()=>console.log("env ok"))'
```
- ✅ Imprime `env ok` (no tira `ZodError`).
- ✅ `ENCRYPTION_KEY` tiene ≥40 chars; `AUTH_SECRET` ≥32.

---

## En GitHub (la PR es la prueba)

### G1. Los 4 checks corren y pasan

Al abrir la PR (trigger `pull_request`):
- ✅ Aparecen 4 jobs en la pestaña **Checks**: `lint`, `typecheck`,
  `test`, `build`.
- ✅ Los 4 terminan en **verde**.
- ✅ Corren en paralelo (no secuenciales).

### G2. El lock test skipea en CI

En el log del job `test`:
- ✅ El describe `BunRedisLock` figura como **skipped**.
- ✅ El resto del suite corre y pasa.
- ✅ Ningún job intenta conectarse a un Postgres/Redis inexistente
  (no hay errores de connection refused).

### G3. Trigger correcto

- ✅ Abrir/actualizar un PR dispara la corrida (`pull_request`).
- ✅ Un push directo a `master` (el merge de esta PR) dispara una
  corrida (`push: branches: [master]`).
- ✅ Un push a una rama de feature **con PR abierto** no duplica la
  corrida innecesariamente (solo `pull_request`).

### G4. `--frozen-lockfile` no rompe

- ✅ `bun install --frozen-lockfile` pasa en los 4 jobs (señal de que
  `bun.lock` está en sync con `package.json`).

---

## Branch protection (diferido — pasos para después del merge)

No es blocker de esta PR. Cuando se quiera enforcar como gate de merge
(requiere admin del repo `mauroluna-dev/prompteando-online`):

**Opción UI**: Settings → Branches → Add branch ruleset / protection
rule para `master` → "Require status checks to pass before merging" →
seleccionar `lint`, `typecheck`, `test`, `build`.

**Opción `gh api`** (reproducible):
```sh
gh api -X PUT repos/mauroluna-dev/prompteando-online/branches/master/protection \
  -F 'required_status_checks[strict]=true' \
  -F 'required_status_checks[contexts][]=lint' \
  -F 'required_status_checks[contexts][]=typecheck' \
  -F 'required_status_checks[contexts][]=test' \
  -F 'required_status_checks[contexts][]=build' \
  -F 'enforce_admins=false' \
  -F 'required_pull_request_reviews=' \
  -F 'restrictions='
```
(Los `contexts` deben matchear los nombres de los jobs. Ajustar según
la API exija.)

---

## Conventions check (per `specs/conventions.md`)

- ✅ §2 — commits Conventional: `docs(p14):`, `test(p14):`, `ci(p14):`.
  (El type `ci` es válido en config-conventional.)
- ✅ §1 — no se toca `env.ts`; CI solo provee valores por fuera.
- ✅ Sin cambios de dominio/aplicación/infra salvo el guard de 1 línea
  del test (justificado para CI).

---

## Done definition

P14 está mergeable cuando:

- [ ] A1–A4 pasan localmente.
- [ ] G1 — los 4 checks corren y pasan verdes en la PR.
- [ ] G2 — el lock test skipea en CI (no falla).
- [ ] G3 — triggers se comportan como se espera.
- [ ] El branch está rebased contra `master` antes del merge final.
- [ ] (Diferido, no blocker) branch protection documentada para
  habilitar post-merge.
