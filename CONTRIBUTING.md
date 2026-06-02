# Contribuir a Prompteando

¡Gracias por querer aportar! Prompteando es open source, hecho desde
Argentina para quien se quiera prender. Toda contribución suma: código,
docs, reportes de bugs, ideas.

> Antes de arrancar, leé el [Código de Conducta](./CODE_OF_CONDUCT.md).
> La comunicación del proyecto es en **español**; el código, los commits
> y los identificadores van en **inglés** (ver convenciones abajo).

## Cómo levantar el proyecto

Pre-requisitos: **Bun (>= 1.3)** y **Docker** (Docker Desktop, colima o
podman compose).

```bash
bun install                              # deps
cp .env.example .env                     # completá los placeholders
docker compose up -d postgres redis      # data services
bun run db:migrate                       # aplica migrations
bun dev                                  # app con HMR en :3010
```

Detalle completo (OAuth, DB ops, tunnels) en el [README](./README.md).

## Antes de abrir un PR

Corré los mismos checks que corre el CI. Tienen que pasar en verde:

```bash
bun run lint        # ESLint + sonarjs, 0 warnings
bun run typecheck   # tsc --noEmit, 0 errores
bun test            # unit + integration
bun run build       # build de producción
```

Los hooks de `husky` (`commit-msg`, `pre-push`) ya corren parte de esto
automáticamente. No los saltees con `--no-verify`.

## Convenciones

Este repo tiene una "constitución" que es **fuente de verdad única**.
Toda contribución la respeta:

- [`specs/conventions.md`](./specs/conventions.md) — las 10 reglas
  canónicas (env centralizado, entities/VOs como clases, CQS con
  `execute()`, CryptoPort, file suffixes, design tokens, etc.).
- [`specs/tech-stack.md`](./specs/tech-stack.md) — stack y razonamiento.
- [`specs/mission.md`](./specs/mission.md) — visión, personas, scope.
- [`specs/roadmap.md`](./specs/roadmap.md) — fases.

Si algo de lo que querés hacer choca con las conventions, abrí un issue
para discutirlo antes — la constitución se cambia, pero a propósito y con
acuerdo, no de costado en un PR.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/)
(validado por `commitlint`). Mensajes **en inglés**:

```
feat(prompt): add version alias support
fix(auth): rewrite redirect_uri behind https tunnel
docs: clarify self-host steps
chore(deps): bump elysia to 1.4.28
```

## Flujo de PR

1. Forkeá / branch desde `master` con nombre descriptivo
   (`feat/...`, `fix/...`, `docs/...`).
2. Hacé tus cambios siguiendo las conventions.
3. Asegurate de que los 4 checks pasen localmente.
4. Abrí el PR contra `master` con una descripción clara de **qué** y
   **por qué** (no solo el "cómo" — eso ya está en el diff).
5. El CI corre `typecheck`, `test` y `build`. Branch protection los
   exige en verde para mergear.

## Reportar bugs / pedir features

Usá los templates de issue. Para bugs, incluí pasos de reproducción,
qué esperabas y qué pasó. Para vulnerabilidades de seguridad, **no**
abras un issue público — seguí [`SECURITY.md`](./SECURITY.md).
