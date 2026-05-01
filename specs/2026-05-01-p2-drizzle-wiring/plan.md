# P2 — Postgres + Drizzle Wiring · Plan

Numbered task groups. Cada grupo es una unidad coherente — apta para
commitear de a una.

## 1. Instalar deps de P2
1.1. `bun add drizzle-orm`
1.2. `bun add -d drizzle-kit`
1.3. Confirmar versions instaladas en `package.json`.
1.4. Commitear `package.json` + `bun.lock`.

## 2. Crear drizzle.config.ts
2.1. Crear `drizzle.config.ts` en la raíz:
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

2.2. Verificar que `bunx drizzle-kit --help` corre sin errores
(confirma que la config es válida y drizzle-kit está accesible).

## 3. Crear schema/ (folder) con barrel vacío
3.1. Crear `src/infrastructure/persistence/schema/index.ts`:
```ts
// Barrel of aggregate schemas. Sub-files added per phase:
//   P3  → users.ts, accounts.ts, sessions.ts, verification-tokens.ts
//   P6  → prompts.ts
//   P7  → prompt-versions.ts
//   P8  → api-keys.ts
//   P10 → user-github-connection.ts
export {};
```

3.2. (Opcional) `src/infrastructure/persistence/schema/.gitkeep` no
hace falta porque `index.ts` ya mantiene la carpeta trackeada.

## 4. Bootstrap de migrations/ + journal
4.1. Crear directorio
`src/infrastructure/persistence/migrations/meta/`.

4.2. Crear `src/infrastructure/persistence/migrations/meta/_journal.json`:
```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
```

4.3. Eliminar `src/infrastructure/persistence/.gitkeep` (heredado de
P0); el folder ya queda trackeado por los archivos nuevos.

## 5. Crear db.ts singleton
5.1. Crear `src/infrastructure/persistence/db.ts`:
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

5.2. Verificar que `bunx tsc --noEmit` sigue clean (los tipos de
Drizzle deben resolverse).

## 6. Crear scripts/migrate.ts
6.1. Crear directorio `scripts/` en la raíz.

6.2. Crear `scripts/migrate.ts`:
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

6.3. Excluir `scripts/` del typecheck si fuese necesario (debería
typecheck sin issues con strict mode).

## 7. Agregar package.json scripts
7.1. En `package.json`, sección `scripts`, agregar:
```jsonc
"db:generate": "bunx drizzle-kit generate",
"db:migrate":  "bun scripts/migrate.ts",
"db:studio":   "bunx drizzle-kit studio"
```

7.2. Verificar que los scripts existentes (`dev`, `start`, `build`,
`test`) siguen intactos.

## 8. Validar pipeline end-to-end
8.1. Levantar Postgres:
```bash
docker compose up -d postgres
```
Esperar `healthy` (~10s).

8.2. Aplicar migrations:
```bash
bun run db:migrate
```
Expected output incluye "Running migrations..." y "Migrations applied."
sin errores. La primera corrida sobre una DB limpia crea
`__drizzle_migrations` aun cuando `entries: []`.

8.3. Verificar la tabla en Postgres:
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "\dt drizzle.*"
```
Expected: aparece `drizzle.__drizzle_migrations` (Drizzle crea su
tracking table en el schema `drizzle` por default).

8.4. `bun run db:generate` con schema vacío:
```bash
bun run db:generate
```
Expected: termina sin error. No genera nuevos archivos `.sql`
(no hay tablas declaradas). El journal puede ser tocado o no.

8.5. (Opcional) `bun run db:studio` en otra terminal:
arranca el web UI en `https://local.drizzle.studio` o similar.
Mostrar que conecta a la DB. Cerrar con Ctrl-C.

8.6. Reset reproducible: `bun run db:migrate` corrido por segunda
vez no rompe (idempotente).

## 9. Update README
9.1. Agregar sección "DB ops" al `README.md` con:
- `bun run db:migrate` — aplica migrations.
- `bun run db:generate` — genera SQL desde diffs en `schema/`.
- `bun run db:studio` — abre el inspector visual de Drizzle.
- Workflow típico: editar `schema/<aggregate>.ts` →
  `bun run db:generate` → revisar SQL → `bun run db:migrate`.

## 10. Cierre
10.1. Confirmar non-regression de P0 y P1:
- `bun test` pasa (sanity test verde).
- `bunx tsc --noEmit` clean.
- `bun run build` ok.
- `bun dev` + `curl /health` ok (con Postgres corriendo).
- `docker compose --profile full up --build` los 3 healthy
  (la app no usa `db.ts` aún, pero levanta).

10.2. `git status` limpio.

10.3. Abrir PR `feat/p2-drizzle-wiring` → `master` con link a
`specs/2026-05-01-p2-drizzle-wiring/validation.md`.
