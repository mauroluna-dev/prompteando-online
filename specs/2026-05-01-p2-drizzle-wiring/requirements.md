# P2 — Postgres + Drizzle Wiring · Requirements

## Why this phase
Refer: `specs/roadmap.md` → P2. P1 dejó Postgres corriendo en Docker
y `.env.example` con `DATABASE_URL`. P2 conecta el runtime a esa BD
vía Drizzle ORM con el adapter nativo de Bun (`drizzle-orm/bun-sql`),
y deja el pipeline de migrations listo para que cualquier fase
posterior (P3 trae las primeras tablas con Auth.js) solo agregue
schemas y corra `bun run db:migrate`.

No se crean tablas reales en P2 — el deliverable es la "fontanería":
db singleton, schema/ con barrel vacío, drizzle.config.ts,
migrations/ con journal bootstrapeado, y scripts en package.json.

## In scope
- Instalar `drizzle-orm` (runtime) y `drizzle-kit` (dev).
- `drizzle.config.ts` apuntando a `dialect: "postgresql"`, schema
  bajo `src/infrastructure/persistence/schema/index.ts`, output bajo
  `src/infrastructure/persistence/migrations/`.
- `src/infrastructure/persistence/db.ts` con la instancia singleton
  de Drizzle sobre `Bun.sql`.
- `src/infrastructure/persistence/schema/index.ts` (barrel) con
  `export {}` por ahora.
- `src/infrastructure/persistence/migrations/meta/_journal.json`
  bootstrapeado con `entries: []` para que el migrator pueda correr
  desde cero sin errores.
- `scripts/migrate.ts` (~10 LOC) que aplica migrations usando
  `drizzle-orm/bun-sql/migrator`.
- `package.json` scripts: `db:generate`, `db:migrate`, `db:studio`.
- Sección "DB ops" en `README.md`.
- Verificación: tras `bun run db:migrate`, la tabla
  `__drizzle_migrations` existe en Postgres.

## Out of scope
- Cualquier tabla real (Auth.js en P3, prompts en P6, versions en P7,
  api_keys en P8, github_connection en P10).
- Repositories concretos (`PostgresPromptRepository`, etc.). Entran
  cuando existen las tablas.
- Connection pooling fino (Bun.sql defaults alcanzan en V1).
- Seeding de datos / fixtures.
- Backups, replicas, tunning.
- Tests de integración con Postgres (entran cuando haya repositories).
- Tipos / inferencia de Drizzle exportados al dominio (los puertos
  trabajan con tipos del dominio, no con tipos de Drizzle).

## Decisiones acordadas (este turno)

### 1. Migrate runner: Bun.sql custom script
**Decisión**: `db:migrate` invoca un script ~10 LOC en
`scripts/migrate.ts` que usa `Bun.SQL` + `drizzle-orm/bun-sql/migrator`.
No usamos `drizzle-kit migrate` porque conecta vía `pg` internamente,
contra el mandate de `CLAUDE.md` (no `pg`, no `postgres.js`).

`drizzle-kit` igual queda instalado (devDep) para `db:generate`
(lee schema, escribe SQL) y `db:studio` (web UI). Esos comandos no
abren conexión Postgres en runtime de la app — `generate` solo lee
archivos, y `studio` es un dev tool puntual.

### 2. Migrations dir: `src/infrastructure/persistence/migrations/`
**Decisión**: las migrations conviven con el resto del adapter de
persistencia (db.ts, schema/, repositories cuando lleguen). Refuerza
la cohesión hexagonal: todo lo que toca BD vive en una sola capa.

### 3. Schema layout: split per aggregate desde día 1
**Decisión**: `schema/` es una carpeta. `schema/index.ts` actúa como
barrel re-exportando todos los aggregates. En P2 está vacío
(`export {}`); a partir de P3 cada aggregate trae su propio archivo:
- P3 → `users.ts`, `accounts.ts`, `sessions.ts`, `verification-tokens.ts`
- P6 → `prompts.ts`
- P7 → `prompt-versions.ts`
- P8 → `api-keys.ts`
- P10 → `user-github-connection.ts`

`db.ts` importa el barrel completo (`import * as schema from "./schema"`)
y se lo pasa a `drizzle(sql, { schema })` para habilitar relaciones
type-safe end-to-end.

## Decisiones técnicas derivadas

### `drizzle.config.ts`
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/persistence/schema/index.ts",
  out: "./src/infrastructure/persistence/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```
Bun auto-carga `.env`, así que `process.env.DATABASE_URL` resuelve sin
`dotenv`.

### `db.ts` (singleton)
```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = new SQL(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export type DB = typeof db;
```
Cualquier consumer (repositories, queries) importa `db` desde
`@/infrastructure/persistence/db`. Falla en import si la env no está
seteada — comportamiento intencional, esto es código de infra y los
tests de domain/application no deben tocarlo.

### `scripts/migrate.ts`
```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { SQL } from "bun";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = new SQL(process.env.DATABASE_URL);
const db = drizzle(sql);

console.log("Running migrations...");
await migrate(db, {
  migrationsFolder: "src/infrastructure/persistence/migrations",
});
console.log("Migrations applied.");
await sql.end();
```
Idempotente: el migrator chequea el journal y solo aplica lo nuevo.
Ejecuta una vez creando `__drizzle_migrations` aunque no haya entries.

### `migrations/meta/_journal.json`
Bootstrap inicial:
```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
```
Sin esto, `db:generate` lo crea en su primera corrida — pero queremos
que `db:migrate` corra antes de tener schemas reales (validación de
P2), así que lo dejamos commiteado.

### `package.json` scripts
```jsonc
{
  "scripts": {
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate":  "bun scripts/migrate.ts",
    "db:psql":     "docker compose exec postgres psql -U prompteando -d prompteando"
  }
}
```

> **Nota sobre db:studio**: descartado. `drizzle-kit studio` exige un
> driver Postgres directo (`pg`, `postgres.js`, `@neondatabase/serverless`
> o `@vercel/postgres`) y no soporta `bun-sql`. Instalar cualquiera viola
> el mandate de CLAUDE.md. Reemplazado por `db:psql` (atajo a la psql
> dentro del container de Postgres). Para inspección visual, devs
> conectan TablePlus / DBeaver / pgAdmin externo a `localhost:5432`
> con las credenciales de `.env.example`.

## Critical files
- `package.json` — agregar `drizzle-orm` (deps), `drizzle-kit` (devDeps),
  scripts `db:*`.
- `drizzle.config.ts` — **crear** (raíz del repo).
- `src/infrastructure/persistence/db.ts` — **crear**.
- `src/infrastructure/persistence/schema/index.ts` — **crear**
  (placeholder con `export {}`).
- `src/infrastructure/persistence/migrations/meta/_journal.json` —
  **crear** (bootstrap).
- `scripts/migrate.ts` — **crear**.
- `src/infrastructure/persistence/.gitkeep` — **eliminar** (`db.ts`
  ya mantiene la carpeta trackeada).
- `README.md` — agregar sección "DB ops".

## References
- `specs/tech-stack.md` → secciones "Database" y "Architecture"
  (capa `infrastructure/persistence/`).
- `specs/roadmap.md` → P2 (verificación canónica) y P3 (consumidor
  inmediato — primer aggregate de tablas).
- `CLAUDE.md` → Bun.sql obligatorio, no `pg`, no `postgres.js`.
- Memoria persistida: ya cubierto en `project_constitution.md`.
- Drizzle docs: `drizzle-orm/bun-sql` adapter, `drizzle-kit` config.
