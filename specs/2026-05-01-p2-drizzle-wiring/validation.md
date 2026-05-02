# P2 — Postgres + Drizzle Wiring · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan, ejecutados desde un fresh clone con
`bun install` corrido y un `.env` creado desde `.env.example`.

Pre-condition: `docker compose up -d postgres` levantado y healthy.

## Functional checks

### 1. `bun run db:migrate` corre sin errores
```bash
docker compose up -d postgres
sleep 8

bun run db:migrate
# Expected output:
# Running migrations...
# Migrations applied.
# (exit 0)
```

### 2. `__drizzle_migrations` existe en Postgres
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1;" 2>&1 | \
  grep -E "(0 rows|1 row)"
# Expected: "(0 rows)" — la tabla existe (no crashea con "relation does
# not exist") y está vacía porque no hay migrations aplicadas todavía.
```

Alternativa más explícita:
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "\dt drizzle.*" | grep -q __drizzle_migrations
# Expected: exit 0.
```

### 3. `bun run db:migrate` es idempotente
```bash
bun run db:migrate   # primera corrida — crea __drizzle_migrations
bun run db:migrate   # segunda corrida — no hace nada nuevo, sin errores
# Expected: ambas terminan con exit 0.
```

### 4. `bun run db:generate` con schema vacío termina sin error
```bash
bun run db:generate
# Expected: exit 0. No genera archivos .sql nuevos (no hay tablas).
```

### 5. `bun run db:psql` abre psql en la DB
```bash
bun run db:psql -- -c "SELECT current_database();" | grep -q promptstash
# Expected: exit 0 (psql conecta dentro del container y devuelve el
# nombre de la DB).
```
(`db:studio` no se incluyó: drizzle-kit studio requiere `pg` /
`postgres.js` y viola CLAUDE.md. Inspección visual queda a TablePlus /
DBeaver externos.)

### 6. db.ts es importable desde otros módulos
```bash
bun --eval 'import("./src/infrastructure/persistence/db.ts").then(m => console.log(typeof m.db))' 
# Expected: "object"
```
(con `DATABASE_URL` seteado en el env del shell o en `.env`).

## Structural checks

### 7. Archivos creados presentes
- `drizzle.config.ts` (raíz)
- `scripts/migrate.ts`
- `src/infrastructure/persistence/db.ts`
- `src/infrastructure/persistence/schema/index.ts`
- `src/infrastructure/persistence/migrations/meta/_journal.json`

### 8. `drizzle.config.ts` apunta a las rutas correctas
Contiene:
- `dialect: "postgresql"`
- `schema: "./src/infrastructure/persistence/schema/index.ts"`
- `out: "./src/infrastructure/persistence/migrations"`
- `dbCredentials.url: process.env.DATABASE_URL`

### 9. `db.ts` exporta `db` y tipo `DB`
Contiene:
- `import { drizzle } from "drizzle-orm/bun-sql"`.
- `import { SQL } from "bun"`.
- `import * as schema from "./schema"`.
- `export const db = drizzle(sql, { schema });`
- `export type DB = typeof db;`

### 10. `scripts/migrate.ts` usa el migrator nativo de Bun
Contiene:
- `import { migrate } from "drizzle-orm/bun-sql/migrator"`.
- Llama `migrate(db, { migrationsFolder: "src/infrastructure/persistence/migrations" })`.
- Cierra la conexión con `await sql.end()`.

### 11. `_journal.json` bootstrapeado correctamente
```bash
cat src/infrastructure/persistence/migrations/meta/_journal.json | \
  bun --eval 'process.stdin.text().then(t => { const j = JSON.parse(t); console.log(j.dialect === "postgresql" && Array.isArray(j.entries)); })'
# Expected: true
```
(o simplemente verificación manual del contenido.)

### 12. Schema barrel vacío con export pattern
`src/infrastructure/persistence/schema/index.ts` contiene
`export {}` y comentario describiendo qué fases agregan tablas.

### 13. `package.json` scripts y deps
Scripts incluye:
- `db:generate`
- `db:migrate`
- `db:psql`

`dependencies` incluye `drizzle-orm`.
`devDependencies` incluye `drizzle-kit`.

### 14. CLAUDE.md compliance: cero `pg`, cero `postgres.js`
```bash
grep -E '"(pg|postgres)"' package.json && echo "VIOLATION" || echo "ok"
# Expected: "ok" (no aparece pg ni postgres como dep directa).
```
`drizzle-kit` puede traer `pg` como **transitive optional**; lo que
importa es que la app no lo importe ni esté como dep directa.

## Non-regression checks

### 15. P0/P1 siguen funcionando
```bash
bun test                  # 1 pass
bunx tsc --noEmit         # clean
bun run build             # genera dist/
```

### 16. App híbrida sigue arriba
```bash
bun dev &
SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/health
# Expected: {"ok":true}
kill $SERVER_PID
```

### 17. Compose full sigue levantando los 3 servicios
```bash
docker compose --profile full up -d --build
sleep 12
docker compose ps --format "table {{.Service}}\t{{.Status}}"
# Expected: app, postgres, redis — todos "healthy".
docker compose --profile full down
```
(La app aún no usa `db.ts`; solo verificamos que no se rompió nada.)

### 18. Git limpio post-trabajo
```bash
git status
# Expected: "nothing to commit, working tree clean".
```

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR. CI todavía
no aplica (P14); la verificación es local.
