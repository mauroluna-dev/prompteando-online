# P1 — Docker Compose Dev Environment · Validation

Esta fase está terminada y el PR es mergeable cuando **todos** los
checks de abajo pasan, ejecutados desde un fresh clone con
`bun install` corrido y un `.env` creado desde `.env.example`.

## Functional checks

### 1. Hybrid mode levanta postgres + redis
```bash
cp .env.example .env   # si .env no existe
docker compose up -d postgres redis
```
Tras ~10s:
```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}"
# Expected: ambos en estado "healthy".
```

### 2. Postgres acepta conexiones
```bash
psql postgres://promptstash:promptstash@localhost:5432/promptstash \
  -c '\l' | grep -q promptstash
# Expected: exit 0 (la DB "promptstash" aparece en la lista).
```

### 3. Redis responde a ping
```bash
redis-cli -h localhost -p 6379 ping
# Expected: PONG
```

### 4. App en host habla con los servicios y responde /health
```bash
bun dev &
SERVER_PID=$!
sleep 3
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/health
# Expected: {"ok":true} + HTTP 200
kill $SERVER_PID
```

### 5. Profile `full` levanta los 3 servicios
```bash
docker compose --profile full up -d --build
# Tras unos segundos (incluye build de la imagen):
docker compose ps --format "table {{.Service}}\t{{.Status}}"
# Expected: postgres, redis, app — todos "healthy".
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/health
# Expected: {"ok":true} + HTTP 200
docker compose --profile full down
```

### 6. Build standalone del Dockerfile
```bash
docker build --target prod -t promptstash:test .
# Expected: termina sin error.
```

### 7. .env.example contiene todas las V1 vars
`.env.example` declara como mínimo (con o sin valor):
- DATABASE_URL
- REDIS_URL
- AUTH_SECRET
- AUTH_URL
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- ENCRYPTION_KEY
- SENTRY_DSN

### 8. Persistencia entre `down`/`up`
```bash
docker compose up -d postgres
psql postgres://promptstash:promptstash@localhost:5432/promptstash \
  -c "CREATE TABLE _smoke (id int);"
docker compose down
docker compose up -d postgres
psql postgres://promptstash:promptstash@localhost:5432/promptstash \
  -c "\dt _smoke" | grep -q _smoke
# Expected: la tabla persiste; exit 0.
psql postgres://promptstash:promptstash@localhost:5432/promptstash \
  -c "DROP TABLE _smoke;"
docker compose down
```

## Structural checks

### 9. Archivos creados presentes
- `docker-compose.yml`
- `Dockerfile`
- `.dockerignore`
- `.env.example`

### 10. Dockerfile tiene 3 stages declarados
```bash
grep -E "^FROM .* AS (deps|build|prod)" Dockerfile | wc -l
# Expected: 3
```

### 11. compose declara 3 services
```bash
grep -E "^  (postgres|redis|app):" docker-compose.yml | wc -l
# Expected: 3
```
y el service `app` está bajo `profiles: [full]`.

### 12. .dockerignore excluye lo crítico
Líneas presentes: `node_modules`, `dist`, `.env`, `.git`, `specs`.

### 13. README documenta el dev environment
`README.md` tiene una sección que explica:
- `cp .env.example .env`
- `docker compose up -d postgres redis` + `bun dev` (modo daily).
- `docker compose --profile full up --build` (validation E2E).
- Tabla de servicios y puertos (3000, 5432, 6379).

## Non-regression checks

### 14. P0 sigue funcionando
- `bun test` pasa (sanity test verde).
- `bunx tsc --noEmit` clean.
- `bun run build` produce `dist/`.
- `bun dev` levanta y `/health` responde.

### 15. Git limpio post-trabajo
```bash
git status
# Expected: "nothing to commit, working tree clean".
```
`.env` (si existe localmente) no aparece como untracked
(`.gitignore` lo cubre).

## Ready to merge
Todos los checks anteriores pasan + revisión humana del PR. CI todavía
no aplica (P14); la verificación de esta fase es local y manual.
