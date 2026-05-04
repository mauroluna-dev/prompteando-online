# P18 — API Key usage metrics · Validation

## Static checks
```bash
bun run lint
bunx tsc --noEmit
bun test
bun run build
```

## Functional checks

### 1. Migration aplicada
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash -c "\d api_key_metrics_daily"
```
Esperar las 8 columnas + PK + index.

### 2. Recording funciona end-to-end
```bash
curl -H "Authorization: Bearer ps_live_<key>" https://localhost:3010/v1/prompts/onboarding-welcome
# 200 OK

# Verificar Redis:
docker compose exec -T redis redis-cli GET metrics:apikey:<keyid>:counts:2026-05-04
# Expected: "1"

docker compose exec -T redis redis-cli LRANGE metrics:apikey:<keyid>:lat:2026-05-04 0 -1
# Expected: ["<latencyMs>"]
```

### 3. Recording NO bloquea response
- Hacer 100 requests serie:
  ```bash
  for i in {1..100}; do curl -H "Authorization: Bearer ps_live_<key>" https://localhost:3010/v1/prompts/foo > /dev/null 2>&1; done
  ```
- Latencia P95 medida con un wrapper externo (`hyperfine` o
  `time`) debe estar dentro del rango pre-P18 ± 10ms.

### 4. Consolidación
```bash
bun scripts/cron-consolidate-metrics.ts --day 2026-05-03
```
- Ver logs: `[consolidate] processed N keys, 0 errors`.
- Verificar en BD:
  ```sql
  SELECT * FROM api_key_metrics_daily WHERE day = '2026-05-03';
  ```
  - Cada key con uso ese día debe tener una fila con counts > 0,
    p50/p95 calculados, top_prompts ordenado.

### 5. Endpoint de métricas
```bash
curl -b "$COOKIE" https://localhost:3010/api/keys/<keyId>/metrics?range=30d | jq
```
- Schema: `{daily: [...], totals: {...}, latency: {...}, topPrompts: [...]}`.
- `daily.length` <= 30, ordenado ascendente.
- `totals.errorRate` = errors / requests.
- `topPrompts.length` <= 10, ordenado por count desc.

### 6. Frontend dashboard
- Login → `/settings/api-keys`.
- Click "Production" key → expande inline.
- Ver: 4 KPI cards con valores, bar chart de 30 barras, tabla
  top 5 prompts con barras horizontales.
- Click range picker `7d` → re-fetch, dashboard actualiza con
  serie de 7 días.
- Click `View full details` → navega a `/settings/api-keys/:id`.

### 7. Deep-dive page
- `/settings/api-keys/<keyId>` muestra todo lo del expandable
  + tabla "Errors by status code" + chart latency over time.

### 8. Empty state
- Key recién creada sin requests → expandir → mostrar mensaje
  "No requests yet. Start consuming this key to see metrics."

### 9. Owner check
- Login con user A → intentar `GET /api/keys/<keyId-de-user-B>/metrics`
  → 404.

### 10. Retention
```bash
bun scripts/cron-prune-old-metrics.ts
```
- Insertar fila manualmente con `day = '2024-01-01'` (>90d).
- Correr el cron.
- Verificar que la fila vieja se borró, las recientes no.

### 11. Idempotencia del consolidate
- Correr `cron-consolidate-metrics --day 2026-05-03` 2 veces
  seguidos.
- Segunda corrida: detecta `consolidated_at` reciente → skip
  (logs: `[consolidate] keyId=<id> already consolidated, skipping`).
- Sin filas duplicadas.

### 12. Top-N cap
- Generar requests a 1500 slugs distintos en un día.
- Consolidar.
- `top_prompts` jsonb tiene como máximo 10 entries.

## Acceptance / merge gate
- [ ] Static checks verdes.
- [ ] §1 schema correcto.
- [ ] §2 recording incrementa Redis correctamente.
- [ ] §3 latencia del endpoint pública no degradada.
- [ ] §4 cron consolidación produce filas correctas.
- [ ] §5 endpoint API responde con shape esperado.
- [ ] §6 dashboard inline funciona end-to-end.
- [ ] §7 deep-dive page funciona.
- [ ] §8 empty state correcto.
- [ ] §9 ownership enforced.
- [ ] §10 retention prune borra >90d.
- [ ] §11 consolidación idempotente.
- [ ] §12 top-N cap funcionando.

Out of scope para mergear:
- Alertas por errores altos.
- Geographic / IP analytics.
- Cost tracking.
- Realtime streaming dashboard.
- Export CSV.
