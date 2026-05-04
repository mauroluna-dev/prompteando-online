# P18 — API Key usage metrics · Requirements

## Why this phase

Hoy el usuario sabe que su key existe y cuándo fue `last_used_at`,
pero no:
- Cuántas veces se usó hoy / esta semana / este mes.
- Qué prompts está consumiendo más (¿es la key de Production
  pegándole a `onboarding-welcome` 4K veces, o a `dev-test`?).
- Si está cerca del rate limit o tirando errors.
- Cuánta latencia mide la API end-to-end.

Sin estas señales, el usuario:
- No detecta abuso o leak de key.
- No sabe si vale la pena cachear más agresivamente.
- No tiene feedback de que el endpoint público está funcionando.

P18 cierra ese gap con métricas agregadas (no event-level),
storage barato (Redis counters + Postgres daily snapshot), y
un dashboard inline en `/settings/api-keys`.

Esto **sale del out-of-scope V1** original ("Observabilidad /
logging de invocaciones") porque es métrica de PRODUCTO, no de
infra. Se documenta el cambio en `mission.md`.

## Decisiones tomadas (sesión 2026-05-04)

1. **Granularidad agregada**: aggregate counters en Redis +
   snapshot diario en Postgres. NO event log per-request.
   Razón: barato, suficiente para los casos de uso del usuario,
   no rompe a volumen alto.

2. **Storage en Redis** (en vivo):
   - `metrics:apikey:<id>:counts:<YYYY-MM-DD>` → INCR por
     request, INCRBY 1 por error, separado por `:errors`.
   - `metrics:apikey:<id>:lat:<YYYY-MM-DD>` → LPUSH latencyMs,
     LTRIM 0-9999 (cap 10K samples por día por key).
   - `metrics:apikey:<id>:by-slug:<YYYY-MM-DD>` → Redis HASH
     con `slug → count`.
   - TTL 8 días en cada key (para sobrevivir al cron del día
     siguiente con margen).

3. **Storage en Postgres** (histórico):
   - Tabla `api_key_metrics_daily`:
     - `api_key_id text` (FK a `api_keys.id`)
     - `day date`
     - `total_requests integer`
     - `total_errors integer`
     - `p50_ms integer`
     - `p95_ms integer`
     - `top_prompts jsonb` (`[{slug, count}, ...]` top 10)
     - PK compuesta: `(api_key_id, day)`.
   - Retención: 90 días. Cron mensual borra >90d.

4. **Cron de consolidación**: diario a las 00:05 UTC.
   - Itera todas las keys conocidas (`SELECT id FROM api_keys`).
   - Para cada (key, day=ayer):
     - GET counts/errors/lat/by-slug del Redis.
     - Calcula p50, p95 de las muestras.
     - Top 10 slugs ordenados por count.
     - INSERT/UPDATE en `api_key_metrics_daily`.
     - Borra los 4 keys de Redis (no espera al TTL).

5. **Endpoint nuevo**:
   `GET /api/keys/:id/metrics?range=7d|30d|90d`
   Devuelve:
   ```ts
   {
     daily: [{day: "2026-05-01", requests: 1234, errors: 5, p50: 45, p95: 120}, ...],
     totals: { requests: 12543, errors: 50, errorRate: 0.004 },
     latency: { p50: 50, p95: 150 },  // del último día
     topPrompts: [{slug: "onboarding-welcome", count: 4832, share: 0.38}, ...]
   }
   ```

6. **Frontend**: dashboard inline en `/settings/api-keys`. Cada
   key row es expandable y muestra:
   - 4 KPI cards (Total / Errors / p95 / Top prompt).
   - Bar chart de requests/day (recharts).
   - Lista top 5 prompts con barra horizontal % + count.
   - Range picker (7d / 30d / 90d).
   - Link a `/settings/api-keys/:id` para deep-dive.

7. **Recording NO bloquea la response del endpoint público**:
   el middleware mide `latencyMs = endTime - startTime` y dispara
   `void recordApiKeyHit.execute(...).catch(log)` después de
   enviar la response. Razón: las métricas no deben impactar
   p95 del endpoint que están midiendo.

8. **Consolidación es idempotente**: si el cron corre 2 veces
   el mismo día, el UPSERT en `api_key_metrics_daily` no
   duplica. Si Redis ya fue limpiado, los counts del segundo
   run son 0 → el UPSERT pisa con 0 — peligroso.
   **Mitigación**: el cron NO borra Redis hasta que el INSERT
   confirma OK. Si el INSERT falla, los datos quedan. Adicional:
   timestamp `consolidated_at` en `api_key_metrics_daily` y el
   cron skipea filas ya consolidadas para el mismo día.

9. **Errors definidos como** `statusCode >= 400`. Rate limits
   (429) cuentan como error.

## In scope

### Domain

- `src/domain/api-key/`:
  - VO `MetricsRange` (con `static parse("7d"|"30d"|"90d")`).
  - Entity `ApiKeyMetricsDaily` con `static fromRow`,
    `static aggregate(samples: number[])` para calcular p50/p95.
  - Type `MetricsSummary` exportado para el HTTP DTO.

- `constants.ts` extendido:
  ```ts
  METRICS_REDIS_TTL_SECONDS: 8 * 24 * 60 * 60,
  METRICS_LATENCY_SAMPLE_CAP: 10_000,
  METRICS_TOP_PROMPTS_LIMIT: 10,
  METRICS_DAILY_RETENTION_DAYS: 90,
  ```

### Application

- **Ports**:
  - `MetricsCounter` (`src/application/ports/metrics-counter.port.ts`):
    ```ts
    export interface MetricsCounter {
      recordHit(input: { apiKeyId: string; slug: string; statusCode: number; latencyMs: number; day: string }): Promise<void>;
      readDay(apiKeyId: string, day: string): Promise<{ counts: number; errors: number; latencies: number[]; bySlug: Record<string, number> } | null>;
      clearDay(apiKeyId: string, day: string): Promise<void>;
    }
    ```
  - `ApiKeyMetricsRepository`:
    ```ts
    export interface ApiKeyMetricsRepository {
      upsert(daily: ApiKeyMetricsDaily): Promise<void>;
      findRange(apiKeyId: string, fromDay: string, toDay: string): Promise<ApiKeyMetricsDaily[]>;
      findKeysWithUnconsolidatedDays(): Promise<{ apiKeyId: string; day: string }[]>;
      deleteOlderThan(retentionDays: number): Promise<number>;
    }
    ```

- **Commands**:
  - `RecordApiKeyHitCommand` (input: apiKeyId, slug, statusCode,
    latencyMs). Llama `MetricsCounter.recordHit`. Día = today
    UTC. Best-effort, no throw.

- **Queries**:
  - `GetApiKeyMetricsQuery`:
    ```ts
    async execute(input: { userId: string; apiKeyId: string; range: MetricsRange }): Promise<MetricsSummary>
    ```
    Verifica que la key le pertenezca al user (throw
    `ApiKeyNotFoundError` si no). Lee daily snapshots de
    Postgres + (opcional) day-current de Redis para el día en
    curso. Devuelve `daily, totals, latency, topPrompts`.

- **Jobs**:
  - `ConsolidateApiKeyMetricsJob`:
    ```ts
    async run(input: { day?: string }): Promise<{ consolidated: number; errors: number }>
    ```
    Default day = ayer. Para cada api_key:
    1. `metrics.readDay(keyId, day)`. Si null → skip.
    2. Calcular p50, p95 de `latencies`.
    3. Top 10 de `bySlug`.
    4. `repo.upsert(daily)`.
    5. `metrics.clearDay(keyId, day)`.
    6. Catchear errores per-key y continuar (logueando).

- **Cron retention**:
  - `PruneOldMetricsJob`: `repo.deleteOlderThan(90)`. Llamado
    semanalmente.

### Infrastructure

- **`BunRedisMetricsCounter`** (`src/infrastructure/cache/`):
  - Pipeline de comandos para `recordHit`:
    ```
    INCR  metrics:apikey:<id>:counts:<day>
    EXPIRE metrics:apikey:<id>:counts:<day> <ttl>
    HINCRBY metrics:apikey:<id>:by-slug:<day> <slug> 1
    EXPIRE metrics:apikey:<id>:by-slug:<day> <ttl>
    LPUSH metrics:apikey:<id>:lat:<day> <latencyMs>
    LTRIM metrics:apikey:<id>:lat:<day> 0 9999
    EXPIRE metrics:apikey:<id>:lat:<day> <ttl>
    if statusCode >= 400: INCR metrics:apikey:<id>:errors:<day> + EXPIRE
    ```
  - `readDay`: `MGET counts errors`, `LRANGE lat 0 -1`,
    `HGETALL by-slug`. Devuelve null si counts === null.

- **`PostgresApiKeyMetricsRepository`**.

- **Schema migration** (`0008_*.sql`):
  ```sql
  CREATE TABLE api_key_metrics_daily (
    api_key_id text NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    day date NOT NULL,
    total_requests integer NOT NULL DEFAULT 0,
    total_errors integer NOT NULL DEFAULT 0,
    p50_ms integer NOT NULL DEFAULT 0,
    p95_ms integer NOT NULL DEFAULT 0,
    top_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
    consolidated_at timestamp NOT NULL DEFAULT NOW(),
    PRIMARY KEY (api_key_id, day)
  );
  CREATE INDEX api_key_metrics_daily_day_idx ON api_key_metrics_daily (day);
  ```

### HTTP

- **Middleware**: extender el handler de `/v1/prompts/:slug`
  para:
  ```ts
  const start = performance.now();
  // ... existing handler logic ...
  const response = ...;
  const latencyMs = Math.round(performance.now() - start);
  void recordApiKeyHit.execute({
    apiKeyId: keyOr401.id,
    slug: params.slug,
    statusCode: response.status,
    latencyMs,
  }).catch(err => console.error("[metrics-record]", err));
  return response;
  ```

- **Endpoint nuevo**:
  - `GET /api/keys/:id/metrics?range=30d` → 200 con
    `MetricsSummary`. 401 si no auth, 404 si la key no existe
    o no pertenece al user.

### Frontend

- **Hook nuevo**: `useApiKeyMetrics(keyId, range)`:
  ```ts
  return useSWR<MetricsSummary>(`/api/keys/${keyId}/metrics?range=${range}`, fetcher);
  ```

- **Componente `<UsageDashboard>`**:
  - Recibe `MetricsSummary`.
  - Renderiza:
    - 4 `<MetricCard>` (Total / Errors / p95 / Top prompt).
    - `<MiniBarChart>` (recharts BarChart, 30 barras).
    - `<TopPromptsList>` (5 rows con barra horizontal %).

- **Range picker**:
  - `<ToggleGroup>` con 7d / 30d / 90d. Default 30d.

- **Página existente extendida**: `/settings/api-keys`:
  - Cada `<ApiKeyRow>` ahora es `<Collapsible>` con summary
    arriba (nombre, prefix, last used) + content que monta el
    `<UsageDashboard>` lazy (solo fetch al expandir).

- **Página nueva**: `/settings/api-keys/:id`:
  - Full-page del dashboard + tabla de últimos errores (status
    code → count) + chart de p50/p95 over time.
  - Range picker 7d/30d/90d.

### Cron infrastructure

- Servicio nuevo en `docker-compose.prod.yml` o systemd timer:
  - `consolidate-api-key-metrics` corriendo a las 00:05 UTC.
  - `prune-old-metrics` corriendo semanalmente.
  - Ambos como scripts `bun scripts/cron-*.ts` reusando la app.

## Out of scope (deferred)

- **Event-level log** (`api_key_request_log` con 1 row per
  request). Diferido por costo y porque el agregado cubre los
  casos de uso V1.
- **Alertas / notificaciones** cuando una key tira muchos
  errores o pega rate limits (P19+).
- **Geographic / IP analytics** (qué países llaman, etc).
- **Cost tracking por modelo** (vendría con templates V2 si la
  app llega a saber qué modelo terminó usando el output).
- **Realtime streaming** del dashboard (WebSocket). Polling SWR
  con `refreshInterval: 60_000` en lugar.
- **Export CSV** de métricas. Sale como nice-to-have post-P18.
- **Comparison entre keys** (key A vs key B side-by-side). No.

## Risks / open items

- **Key con muchísimos slugs distintos**: HASH `by-slug` puede
  crecer (ej. dev-test pegándole a 1000 slugs distintos por
  día). Mitigación: cap a 1000 entries en el HASH; consolidación
  toma top N.
- **Latencia del INCR/LPUSH**: ~1ms cada uno; con 4-5 comandos
  por hit son ~5ms agregados al request. Mitigación: pipeline +
  fire-and-forget en el handler (no esperar antes de responder).
- **Consolidation falló por algún día**: el cron del día siguiente
  intenta el día anterior. Necesitamos detectar y backfillear.
  Mitigación: query `findKeysWithUnconsolidatedDays` que escanee
  Redis en busca de día > 1d viejo.
- **Time zone**: usar UTC para todas las claves de día
  (`day = new Date().toISOString().slice(0, 10)`). UI muestra
  en local TZ pero el storage es UTC.
- **Migration de keys nuevas**: para keys creadas DESPUÉS del
  deploy de P18, todo funciona. Para keys preexistentes con
  uso histórico — no hay backfill (no tenemos los datos).
  Documentar como "métricas disponibles desde el deploy de P18".
