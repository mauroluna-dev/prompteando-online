# Prompteando

**Versioná tus prompts sin perder lo que funcionaba — gratis y sin
vendor lock-in.** Open source, hecho desde Argentina para no-coders y
vibe-coders.

[![CI](https://github.com/mauroluna-dev/prompteando-online/actions/workflows/ci.yml/badge.svg)](https://github.com/mauroluna-dev/prompteando-online/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-000.svg)](https://bun.sh)

> _"PromptLayer, pero gratis y sin vendor lock-in."_

<!-- TODO: agregar GIF/captura de la app acá (dashboard → editor → consumo por API). -->

## El problema

Hoy la gente sobreescribe sus prompts directo: no hay historial, no hay
rollback cuando una iteración rompe el output, y nadie sabe qué versión
está corriendo en producción. El "backup" es pegarlo en un Google Doc.

## Qué es Prompteando

Un versionador de prompts con cero fricción:

- 📌 **Cada `Save` crea una versión inmutable y numerada.** Historial
  completo, rollback a cualquier versión.
- 🔌 **Cada prompt expone un endpoint público de lectura** con API Key,
  para consumirlo desde n8n, Zapier, Make, `curl` o tu código.
- 🐙 **Tu historial, tu repo (opcional pero flagship).** Si conectás
  GitHub, cada save se commitea en *tu* repo bajo *tu* cuenta. Si mañana
  Prompteando desaparece, te quedás con todo.
- 📦 **Exportable por diseño.** Aun sin GitHub, bajás todo tu historial
  en ZIP/JSON cuando quieras. Nunca rehén de un proveedor.
- 📊 **Métricas de uso por API Key**: requests/día, p50/p95, error rate,
  top prompts.

## Para quién

1. **No-coder orquestador** — founders, PMs, marketers que arman flujos
   con LLMs en n8n / Zapier / Make. No tocan código pero iteran prompts
   y no quieren perder lo que andaba.
2. **Vibe-coder** — devs que copy-pastean prompts entre Cursor, Claude
   Code y ChatGPT, y pierden la versión que funcionaba.

Más detalle de visión, personas y scope en [`specs/mission.md`](specs/mission.md).

## Templates con variables

Un prompt puede marcarse como **template** (opt-in) y usar
`{{variables}}` que se sustituyen server-side al consumirlo. Activás el
modo template desde el editor, anotás descripción/default por variable, y
lo consumís por un endpoint dedicado:

```bash
curl -X POST https://<tu-host>/v1/prompts/<slug>/render \
  -H "Authorization: Bearer po_live_..." \
  -H "content-type: application/json" \
  -d '{"vars": {"nombre": "Ana", "producto": "Plan Pro"}}'
# → {"content":"Hola Ana, sobre Plan Pro.","version":1,"vars_used":[...],"missing_vars":[]}
```

- **Detección híbrida**: las variables se infieren del contenido; podés
  declarar un `default` por variable (la vuelve opcional).
- **Falla estricta**: si falta una variable requerida, devuelve `422`
  con `missing_vars` — nunca manda un prompt a medio renderizar.
- **Versionado**: pasá `"version": N` para fijar una versión; cada
  versión guarda su propio set de variables.
- **Discovery**: el `GET /v1/prompts/:slug` raw devuelve también
  `isTemplate` y `templateVars`, así un consumidor sabe qué variables
  mandarle al `/render` sin parsear el contenido.
- **Backward compatible**: el `GET` sigue devolviendo el contenido con
  los `{{}}` literales; solo se sumaron campos nuevos a la respuesta.

## Labels de deploy

Versionar no alcanza: necesitás saber *qué versión está en producción*.
Asigná labels (`production`, `staging`, o custom) a una versión y
consumila por label — deploy = mover el label, rollback = re-asignarlo.

```bash
# consumir la versión etiquetada production
curl "https://<tu-host>/v1/prompts/<slug>?label=production" \
  -H "Authorization: Bearer po_live_..."
```

`latest` es virtual (siempre la última versión). Sin `?label=`, el `GET`
devuelve la última versión (como siempre). El `POST .../render` también
acepta `label`. Los labels se gestionan desde el editor.

## Chat prompts

Además de prompts de texto, podés crear prompts **chat**: un array de
mensajes con roles (`system` / `user` / `assistant`). Soportan las mismas
`{{variables}}` y **message placeholders** (un mensaje `placeholder` que
se reemplaza en runtime con una lista de mensajes — útil para inyectar
historial). El `POST .../render` de un prompt chat devuelve `messages`
(array compilado) en vez de `content`. Se editan desde el toggle
Text/Chat del editor.

## Config por versión

Cada versión puede llevar **config** (model params como JSON libre:
`model`, `temperature`, etc.) versionada junto al prompt. El `GET` y el
`/render` la devuelven en el campo `config`, así cambiás de modelo o
tuneás parámetros sin tocar el código del consumidor.

## SDKs

Clientes oficiales para consumir tus prompts desde código, con caching +
fallback y soporte de labels/versiones:

- **TypeScript/JavaScript**: [`@prompteando/client`](packages/client-ts) —
  `npm install @prompteando/client`.
- **Python**: [`prompteando`](packages/client-py) — `pip install prompteando`.

```ts
import { PrompteandoClient } from "@prompteando/client";
const stash = new PrompteandoClient({ apiKey: "po_live_...", baseUrl: "https://prompts.tu-dominio.com" });
const { content } = await stash.render("welcome-email", { vars: { nombre: "Ana" }, label: "production" });
```

## Self-host

Prompteando es 100% self-hosteable. La app no se publica al host: escucha
solo en la red interna de Docker (`app:3010`). Poné tu propio reverse
proxy (nginx / Caddy / Traefik) adelante y reenviá a `app:3010`.

```bash
cp .env.production.example .env.production    # completá los secretos
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

El servicio `migrate` aplica las migrations una sola vez antes de que la
app arranque. Postgres y Redis quedan internos (nunca publicados al
host). Detalle de variables en [`.env.production.example`](.env.production.example).

> Generá `AUTH_SECRET` y `ENCRYPTION_KEY` con `openssl rand -base64 32`.
> Serví siempre detrás de HTTPS. Ver [`SECURITY.md`](./SECURITY.md).

## Quickstart (desarrollo local)

```bash
bun install                              # deps
cp .env.example .env                     # config local (ver "Auth setup")
docker compose up -d postgres redis      # data services
bun run db:migrate                       # aplica migrations
bun dev                                  # app en host con HMR
```

App en `http://localhost:3010`. `GET /health` → `{"ok":true}`. SPA en `/`.

```bash
bun test         # tests
bun run build    # build de producción a dist/
```

## Dev environment

**Pre-requisitos**: Bun (>= 1.3), Docker (Docker Desktop, colima o
podman compose). El daily workflow es **híbrido**: Postgres y Redis
corren en Docker, la app corre con `bun dev` en el host (HMR limpio,
sin volúmenes ni file-watching dentro de un container).

| Servicio | Puerto host | Imagen              |
| -------- | ----------- | ------------------- |
| app      | 3010        | (host con `bun dev`)|
| postgres | 5432        | postgres:16-alpine  |
| redis    | 6379        | redis:7-alpine      |

### Comandos

```bash
# Workflow diario (modo hybrid)
docker compose up -d postgres redis      # data services en background
bun dev                                  # app con HMR

# Validación end-to-end (los 3 servicios containerizados)
docker compose --profile full up --build
curl http://localhost:3010/health        # esperado: {"ok":true}

# Parar
docker compose down                      # mantiene volumes
docker compose down -v                   # borra volumes (DB limpia)
```

Credenciales dev de Postgres: usuario `prompteando`, password
`prompteando`, db `prompteando`. La connection string ya viene en
`.env.example` como `DATABASE_URL`.

## DB ops

Drizzle ORM sobre `Bun.sql` (driver nativo). Schema en
`src/infrastructure/persistence/schema/` (split per aggregate),
migrations en `src/infrastructure/persistence/migrations/`.

```bash
# Editar schema/<aggregate>.ts y luego:
bun run db:generate    # produce el SQL diff bajo migrations/
bun run db:migrate     # aplica migrations contra Postgres (idempotente)
bun run db:psql        # abre psql en el container (con DB ya seleccionada)
```

`db:migrate` usa `drizzle-orm/bun-sql/migrator` directamente —
sin `pg` ni `postgres.js`. La primera corrida crea la tabla
`drizzle.__drizzle_migrations` que registra qué archivos ya se
aplicaron.

> **Inspección visual de la DB**: `drizzle-kit studio` requiere un
> driver Postgres directo (`pg` / `postgres.js`) y no es compatible
> con Bun.sql, por lo que no se incluye. Para un cliente visual,
> conectá TablePlus / DBeaver / pgAdmin a `localhost:5432` con las
> credenciales de `.env.example`.

## Auth setup

Prompteando usa [Auth.js](https://authjs.dev) (`@auth/core`) con el
Drizzle adapter. Login con **GitHub** o **Google** (OAuth-only,
sin email/password). El mismo email vía distintos providers se
unifica al mismo `users` row (`allowDangerousEmailAccountLinking`
habilitado en ambos providers — ambos verifican email server-side).

> Tip: generá `AUTH_SECRET` con `openssl rand -base64 32` y guardá
> el valor; rotarlo invalida todas las sesiones activas.

### Dos OAuth Apps de GitHub

GitHub permite **una sola** Authorization callback URL por OAuth App, así
que Prompteando usa **dos** apps separadas:

1. **Login** (Auth.js) — callback `<AUTH_URL>/auth/callback/github`.
   Variables `GITHUB_AUTH_CLIENT_ID` / `GITHUB_AUTH_CLIENT_SECRET`.
2. **Integración** (Settings → Conectar GitHub) — callback
   `<AUTH_URL>/api/integrations/github/oauth-callback`. Variables
   `GITHUB_INTEGRATIONS_CLIENT_ID` / `GITHUB_INTEGRATIONS_CLIENT_SECRET`.

Para cada una: https://github.com/settings/applications/new →
**Homepage URL** `http://localhost:3010` (o tu host público) y la
**Authorization callback URL** correspondiente. Copiá Client ID y generá
el Client Secret.

### Google OAuth Client

1. https://console.cloud.google.com/ → crear o reusar un proyecto.
2. **APIs & Services** → **OAuth consent screen** → tipo *External*,
   completar los campos requeridos (scopes: `email`, `profile`, `openid`).
3. **Credentials** → **Create Credentials** → **OAuth client ID** →
   *Web application*.
4. **Authorized JavaScript origins**: `http://localhost:3010`
5. **Authorized redirect URIs**: `http://localhost:3010/auth/callback/google`
   (Google sí permite varios redirect URIs, así que agregá también el
   host público si usás un tunnel).

### `.env`

Copiá [`.env.example`](.env.example) y completá. Variables principales:

```env
# Data services
DATABASE_URL=postgres://prompteando:prompteando@localhost:5432/prompteando
REDIS_URL=redis://localhost:6379

# Auth.js
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3010        # o la URL pública del tunnel

# GitHub OAuth App #1 — login
GITHUB_AUTH_CLIENT_ID=<...>
GITHUB_AUTH_CLIENT_SECRET=<...>

# GitHub OAuth App #2 — integración (Conectar GitHub)
GITHUB_INTEGRATIONS_CLIENT_ID=<...>
GITHUB_INTEGRATIONS_CLIENT_SECRET=<...>

# Google OAuth
GOOGLE_CLIENT_ID=<...>
GOOGLE_CLIENT_SECRET=<...>

# Cifrado at-rest del token de GitHub (AES-256-GCM). 32 bytes base64.
ENCRYPTION_KEY=<openssl rand -base64 32>

# Opcional: observabilidad
SENTRY_DSN=
```

`trustHost: true` está activado, así que Auth.js infiere el host del
request. Cuando `AUTH_URL` está seteada, el handler en
`src/infrastructure/auth/handler.ts` reescribe protocol/host/port
del request para que las callback URLs siempre apunten al origen
público — esto evita que un tunnel sin `X-Forwarded-Proto: https`
genere `redirect_uri` con `http://`.

## Estructura del repo

```
src/
├── domain/                       # Entidades, VOs, errores. Sin deps externas.
│   └── __test__/                 # Unit tests por módulo.
├── application/
│   ├── commands/                 # Mutaciones (CQS).
│   ├── queries/                  # Lecturas (CQS).
│   └── ports/                    # Interfaces para infrastructure.
├── infrastructure/
│   ├── persistence/              # Drizzle / Postgres.
│   ├── github/                   # Octokit.
│   ├── cache/                    # Bun.redis (rate limiting, cache).
│   └── auth/                     # Auth.js wiring.
├── interfaces/
│   └── http/
│       ├── server.ts             # Elysia + Bun.serve composition root.
│       ├── routes/
│       └── middlewares/
└── frontend/                     # React 19 + shadcn/ui + Tailwind.
    ├── App.tsx
    ├── frontend.tsx
    ├── index.html
    ├── components/ui/
    └── lib/
```

## Path aliases (tsconfig)

| Alias              | Resuelve a                  |
| ------------------ | --------------------------- |
| `@/domain/*`         | `src/domain/*`                |
| `@/application/*`    | `src/application/*`           |
| `@/infrastructure/*` | `src/infrastructure/*`        |
| `@/interfaces/*`     | `src/interfaces/*`            |
| `@/frontend/*`       | `src/frontend/*`              |
| `@/components/*`     | `src/frontend/components/*`   |
| `@/lib/*`            | `src/frontend/lib/*`          |

## Stack

Bun · Elysia · React 19 · React Router · SWR · Tailwind 4 · shadcn/ui ·
Postgres + Drizzle · Redis (Bun.redis) · Auth.js · Octokit.

Detalle completo y razonamiento en
[`specs/tech-stack.md`](specs/tech-stack.md).

## Contribuir

Toda contribución suma. Leé [`CONTRIBUTING.md`](./CONTRIBUTING.md) para
levantar el proyecto, las convenciones canónicas
([`specs/conventions.md`](specs/conventions.md)) y el flujo de PR. La
comunicación es en español; el código y los commits, en inglés.

## Licencia

[MIT](./LICENSE) © Mauro Luna.
