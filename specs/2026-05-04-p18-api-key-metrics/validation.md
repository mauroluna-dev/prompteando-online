# P18 — API Key usage metrics · Validation

Cómo saber que cada slice está listo para mergear.

## Static checks (obligatorios para ambos slices)

```bash
bun run lint        # 0 warnings (--max-warnings=0)
bunx tsc --noEmit   # 0 errors
bun test            # 100% pass (101+ tests post-P18)
bun run build       # ok
```

Pre-push hook (husky) automatiza los 4. Si falla → fix antes de
push, NO usar `--no-verify`.

---

## SLICE 1 — Data layer

### Pre-condiciones
- Master con P17 y todo el sprint Pγ mergeado.
- `docker compose up -d postgres redis` healthy.
- Migration 0008 generada y aplicada (`bun run db:migrate`).
- Verificar columnas:
  ```bash
  docker compose exec -T postgres psql -U prompteando -d prompteando \
    -c "\d api_key_metrics_daily"
  ```
  Esperar 8 columnas + PK compuesta + index `api_key_metrics_daily_day_idx`.

### Functional checks

#### S1.1. Recording funciona end-to-end

Setup: una API key activa del user (`po_live_…`) y al menos un
prompt accesible.

```bash
KEY=po_live_xxxxx
SLUG=onboarding-welcome

curl -H "Authorization: Bearer $KEY" \
  https://3010.mauroluna.dev/v1/prompts/$SLUG
# 200 OK
```

Verificar Redis (UTC day):
```bash
DAY=$(date -u +%Y-%m-%d)
KEYID=<api-key-uuid>

docker compose exec -T redis redis-cli GET "metrics:apikey:$KEYID:counts:$DAY"
# Expected: "1"

docker compose exec -T redis redis-cli LRANGE "metrics:apikey:$KEYID:lat:$DAY" 0 -1
# Expected: ["<latencyMs>"]

docker compose exec -T redis redis-cli HGETALL "metrics:apikey:$KEYID:by-slug:$DAY"
# Expected: $SLUG → "1"
```

#### S1.2. Recording NO bloquea response

```bash
hyperfine --warmup 5 -m 50 \
  "curl -s -H 'Authorization: Bearer $KEY' https://3010.mauroluna.dev/v1/prompts/$SLUG"
```

Comparar p95 con baseline pre-P18 (capturar antes de mergear). El
delta esperado: < 5ms (los 5 INCR/HINCRBY/LPUSH son fire-and-forget
después de la response).

#### S1.3. Errores cuentan correctamente

```bash
curl -H "Authorization: Bearer wrong_key_xyz" \
  https://3010.mauroluna.dev/v1/prompts/$SLUG
# 401
```

```bash
docker compose exec -T redis redis-cli GET "metrics:apikey:$KEYID:errors:$DAY"
```

(Nota: el 401 NO incrementa porque la key inválida no resuelve a
ningún apiKeyId. Eso es by-design — no rastreamos requests
unauth. El conteo de errores aplica a status >=400 con KEY VÁLIDA:
ej. 404 prompt-not-found, 429 rate-limit.)

Para verificar 404:
```bash
curl -H "Authorization: Bearer $KEY" \
  https://3010.mauroluna.dev/v1/prompts/does-not-exist
# 404
```

```bash
docker compose exec -T redis redis-cli GET "metrics:apikey:$KEYID:errors:$DAY"
# Expected: "1" (1 error counted)
```

#### S1.4. Cap de samples y by-slug

```bash
# Generar 11k requests al mismo slug
for i in {1..11000}; do
  curl -s -H "Authorization: Bearer $KEY" \
    https://3010.mauroluna.dev/v1/prompts/$SLUG > /dev/null
done

docker compose exec -T redis redis-cli LLEN "metrics:apikey:$KEYID:lat:$DAY"
# Expected: 10000  (cap aplicado por LTRIM)
```

#### S1.5. Consolidate cron

Setup: tener counters de "ayer" en Redis (forzar día con
`metrics.recordHit({..., day: "2026-05-03"})` o esperar día
natural).

```bash
bun run cron:consolidate-metrics --day=2026-05-03
# Expected stdout JSON:
# {"ts":"2026-05-04T...","job":"consolidate-metrics","consolidated":N,"errors":0}
```

Verificar Postgres:
```bash
docker compose exec -T postgres psql -U prompteando -d prompteando \
  -c "SELECT * FROM api_key_metrics_daily WHERE day='2026-05-03';"
```

Esperar:
- Una fila por key con counts > 0 ese día.
- `total_requests` = counts.
- `total_errors` = errors counter (0 si no hubo).
- `p50_ms`, `p95_ms` calculados.
- `top_prompts` jsonb con top 10 ordenado desc por count.
- `consolidated_at` ≈ ahora.

Verificar Redis vacío para ese day:
```bash
docker compose exec -T redis redis-cli KEYS "metrics:apikey:$KEYID:*:2026-05-03"
# Expected: vacío (clearDay borró las 4 keys)
```

#### S1.6. Idempotencia del consolidate

Correr el cron 2 veces seguidas para el mismo día:
```bash
bun run cron:consolidate-metrics --day=2026-05-03
bun run cron:consolidate-metrics --day=2026-05-03
```

Segunda corrida:
- Counters ya borrados de Redis → readDay devuelve null → skip
  inmediato (consolidated=0, errors=0). Sin duplicate fila en
  Postgres.

#### S1.7. Endpoint /api/keys/:id/metrics

```bash
COOKIE="$(echo your-session-cookie)"
KEYID=<api-key-uuid>

curl -s -b "$COOKIE" \
  "https://3010.mauroluna.dev/api/keys/$KEYID/metrics?range=30d" \
  | jq
```

Esperar shape:
```json
{
  "daily": [
    {"day": "2026-04-04", "requests": 0, "errors": 0, "p50": 0, "p95": 0},
    ...
    {"day": "2026-05-04", "requests": 5, "errors": 1, "p50": 87, "p95": 210}
  ],
  "totals": {"requests": 5, "errors": 1, "errorRate": 0.2},
  "latency": {"p50": 87, "p95": 210},
  "topPrompts": [{"slug":"onboarding-welcome","count":4,"share":0.8}, ...]
}
```

#### S1.8. Ownership check

```bash
# Login como user A, intentar leer key de user B
curl -s -b "$COOKIE_USER_A" \
  "https://3010.mauroluna.dev/api/keys/$KEYID_USER_B/metrics?range=30d" \
  -w "\n%{http_code}\n"
# Expected: 404 (no leak de "key existe pero no es tuya")
```

#### S1.9. Range inválido

```bash
curl -s -b "$COOKIE" \
  "https://3010.mauroluna.dev/api/keys/$KEYID/metrics?range=foo" \
  -w "\n%{http_code}\n"
# Expected: 400 + body con error message
```

#### S1.10. Prune cron

Insertar fila de prueba con día > 90 días atrás:
```bash
docker compose exec -T postgres psql -U prompteando -d prompteando <<SQL
INSERT INTO api_key_metrics_daily (api_key_id, day, total_requests)
VALUES ('$KEYID', '2025-01-01', 100);
SQL
```

```bash
bun run cron:prune-old-metrics
# Expected stdout: {"ts":"...","job":"prune-old-metrics","deleted":1}
```

Verificar:
```bash
docker compose exec -T postgres psql -U prompteando -d prompteando \
  -c "SELECT count(*) FROM api_key_metrics_daily WHERE day < CURRENT_DATE - INTERVAL '90 days';"
# Expected: 0
```

### Acceptance / merge gate — Slice 1

- [ ] Static checks verdes.
- [ ] §S1.1 recording incrementa Redis correctamente.
- [ ] §S1.2 latencia del endpoint público no degradada (delta <5ms).
- [ ] §S1.3 errores con key válida cuentan; con key inválida no.
- [ ] §S1.4 cap de samples y by-slug aplicado.
- [ ] §S1.5 cron consolidate produce filas correctas.
- [ ] §S1.6 consolidate idempotente.
- [ ] §S1.7 endpoint API responde con shape correcto.
- [ ] §S1.8 ownership enforced.
- [ ] §S1.9 range inválido → 400.
- [ ] §S1.10 prune borra >90d.
- [ ] Pre-push hook verde.

---

## SLICE 2 — UI dashboard

### Pre-condiciones
- Slice 1 mergeado en master.
- Datos de prueba: al menos 1 key con consolidaciones de los
  últimos 30 días (correr el cron sobre días variados o generar
  data manual con `INSERT INTO api_key_metrics_daily`).

### Functional checks

#### S2.1. ApiKeysPage muestra rows expandibles

1. Login → `/settings/api-keys`.
2. Ver lista con headers de cada key (nombre, prefix, last used).
3. Click en una row → expande con `<UsageDashboard>` adentro.
4. Verificar que el fetch a `/api/keys/:id/metrics?range=30d` pasa
   en DevTools → Network.
5. Re-collapse → re-expand → SWR cache hit, sin re-fetch.

#### S2.2. UsageDashboard renderea correcto

Con datos, ver:
- 4 `<MetricCard>` con valores correctos: Total requests / Errors %
  / p95 ms / Top prompt slug.
- `<MiniBarChart>` con 30 barras (una por día), tooltip on hover
  muestra día + count.
- `<TopPromptsList>` con max 5 items, barras horizontales con %
  proporcional, count a la derecha.
- Bars usan `var(--color-chart-1)` (cumple §11.1).
- Headers de KPIs usan `font-display` (cumple §11.2).

#### S2.3. Range toggle funciona

1. Range default = 30d (selected pill).
2. Click 7d → re-fetch → daily array tiene 7 entries → bar chart
   actualiza.
3. Click 90d → re-fetch → 90 entries.

#### S2.4. Empty state

Con una key recién creada (sin hits):
- Expandir → render "No metrics yet" amigable (no UsageDashboard
  half-broken).

#### S2.5. Deep-dive page

1. Click "View full details →" en row expandida.
2. Navega a `/settings/api-keys/:id`.
3. Header con nombre + prefix + breadcrumb back a settings.
4. Mismo `<UsageDashboard>` + bloque adicional "Errors by status
   code" (tabla) + line chart p50/p95 over time.
5. Range picker dedicated, no comparte estado con la lista.

#### S2.6. Ownership 404 page

Manualmente navegar a `/settings/api-keys/<other-user-key-id>`:
- Backend devuelve 404 → page muestra "Key not found" con CTA
  "Back to keys". No crash.

#### S2.7. Visual conformance

- Página corre el sidebar Settings (mismo layout que Profile +
  Integrations).
- Cumple §11 (design tokens, typography roles, spacing scale).
- Mobile: lista colapsa a 1-col, dashboard inline también single
  column.

### Acceptance / merge gate — Slice 2

- [ ] Static checks verdes.
- [ ] §S2.1 expandable rows con lazy fetch funcionan.
- [ ] §S2.2 dashboard renderea con datos correctos.
- [ ] §S2.3 range picker re-fetcha.
- [ ] §S2.4 empty state amigable.
- [ ] §S2.5 deep-dive page completa.
- [ ] §S2.6 ownership 404 + back CTA.
- [ ] §S2.7 visual cumple §11 + responsive.
- [ ] Pre-push hook verde.

---

## Out of scope para mergear (cualquiera de los 2 slices)

- Alertas / notificaciones cuando una key tira muchos errores.
- Geographic / IP analytics.
- Cost tracking por modelo (V2 con templates).
- Realtime streaming (WebSocket) — polling SWR es suficiente.
- Export CSV de métricas.
- Comparison entre keys side-by-side.
- Backfill histórico para keys pre-P18.
- Cron infra deploy (docker-compose.prod.yml service / systemd
  timer) — los scripts existen, el wiring queda para P15.

---

## Post-merge

Una vez mergeados ambos slices:

1. Configurar el cron de consolidación en producción (ver
   `roadmap.md` P15 para opciones: ofelia, systemd timer).
   Schedule: diario a las 00:05 UTC.
2. Configurar prune cron: semanal, ej. domingos 00:10 UTC.
3. Monitorear los logs del cron por 1 semana — si algún día falla
   y los datos quedan en Redis, correr manualmente con `--day=`.
4. Anunciar en docs / changelog: "API key metrics disponibles
   desde \<deploy date\>. Las keys preexistentes no tienen datos
   anteriores."
