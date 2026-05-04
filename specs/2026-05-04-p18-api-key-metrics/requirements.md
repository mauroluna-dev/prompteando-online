# P18 — API Key usage metrics · Requirements

## Why this phase

Hoy un usuario sabe que su key existe y cuándo fue `last_used_at`,
pero no:

- Cuántas veces se usó hoy / esta semana / este mes.
- Qué prompts está consumiendo más (¿la key de Production le pega
  4K veces a `onboarding-welcome`, o a `dev-test`?).
- Si está cerca del rate limit o tirando errores.
- Cuánta latencia mide la API end-to-end.

Sin estas señales, el usuario:
- No detecta abuso o leak de key.
- No sabe si vale la pena cachear más agresivamente.
- No tiene feedback de que el endpoint público está funcionando.

P18 cierra ese gap con métricas agregadas (no event-level), storage
barato (Redis counters + Postgres daily snapshot), y un dashboard
inline en `/settings/api-keys` + una deep-dive page por key.

**Sale del out-of-scope V1** original ("Observabilidad / logging de
invocaciones") porque es métrica de PRODUCTO, no de infra. Mission
ya documenta el cambio (PR #21).

## Decisiones tomadas (sesión 2026-05-04, post-P17)

1. **Storage: aggregate counters Redis + snapshot diario Postgres.**
   Sin event log per-request (out of scope). Razón: barato, suficiente
   para los 4 casos de uso, no rompe a volumen real.

2. **Dashboard: inline expandable + deep-dive page.**
   `/settings/api-keys`: cada key row se expande mostrando 4 KPIs +
   bar chart 30d + top 5 prompts. Adicional: `/settings/api-keys/:id`
   con extras (errores por status code, chart p50/p95 over time).

3. **Slicing: 2 PRs.**
   - **Slice 1**: data layer (schema, domain, ports, infra Redis +
     Postgres, command + query, jobs, middleware, HTTP endpoint, cron
     scripts, tests). Verificable end-to-end con curl + redis-cli +
     psql sin tocar la UI.
   - **Slice 2**: UI dashboard (recharts, MetricCard / MiniBarChart /
     TopPromptsList / UsageDashboard, ApiKeysPage rebuild + deep-dive
     page).

4. **Recording NO bloquea el endpoint público.** El middleware mide
   `latencyMs = endTime - startTime`, captura `statusCode` de la
   response, dispara `void recordApiKeyHit.execute(...).catch(log)`
   FIRE-AND-FORGET. Razón: las métricas no deben impactar p95 del
   endpoint que están midiendo.

5. **Cron de consolidación: diario a las 00:05 UTC.** Para cada key
   conocida: lee Redis del día anterior, calcula p50/p95 y top 10
   prompts, UPSERT en `api_key_metrics_daily`. Solo borra Redis si
   el UPSERT confirmó OK (idempotente).

6. **Cron infra: scripts Bun standalone.** `scripts/cron-*.ts` que
   reusan el composition root. Wireup en `docker-compose.prod.yml`
   queda para fase de deploy (P15 ya documenta el patrón con
   ofelia / systemd timer). En dev se corren a mano:
   `bun scripts/cron-consolidate-metrics.ts --day=YYYY-MM-DD`.

7. **Errors definidos como `statusCode >= 400`.** Rate limits (429)
   cuentan como error para el conteo. Distinción status-by-status
   solo en la deep-dive page.

8. **Time zone: UTC strict** para todas las claves de día y filas
   en Postgres. UI muestra en local TZ del browser pero el storage
   es UTC (`new Date().toISOString().slice(0, 10)`).

9. **Sin backfill histórico.** Las métricas arrancan desde el
   deploy de P18. Documentar en la deep-dive page como
   "Métricas disponibles desde \<deploy date\>".

10. **Default range: 30d.** Range picker `7d | 30d | 90d` (toggle
    group). Cap retention 90d.

## In scope

### Slice 1 — Data layer

#### Domain (`src/domain/api-key/`)

- **`metrics-range.vo.ts`**:
  ```ts
  export class MetricsRange {
    private constructor(
      readonly value: "7d" | "30d" | "90d",
      readonly days: number,
    ) {}
    static parse(input: string): MetricsRange {
      if (input === "7d")  return new MetricsRange("7d", 7);
      if (input === "30d") return new MetricsRange("30d", 30);
      if (input === "90d") return new MetricsRange("90d", 90);
      throw new InvalidMetricsRangeError(input);
    }
  }
  ```

- **`api-key-metrics-daily.entity.ts`**:
  - Constructor privado + `static fromRow` + `static aggregate`.
  - `static aggregate(samples: number[]): { p50: number; p95: number }`
    via sort ascendente (suficiente para cap 10K samples).
  - `toJSON()` para serializar el DTO.

- **`metrics-summary.ts`** (DTO type, no entity):
  ```ts
  export type MetricsSummary = {
    daily: { day: string; requests: number; errors: number; p50: number; p95: number }[];
    totals: { requests: number; errors: number; errorRate: number };
    latency: { p50: number; p95: number };
    topPrompts: { slug: string; count: number; share: number }[];
    statusBreakdown?: { statusCode: number; count: number }[];  // deep-dive only
  };
  ```

- **Constants extendidos en `src/domain/api-key/constants.ts`**:
  ```ts
  METRICS_REDIS_TTL_SECONDS: 8 * 24 * 60 * 60,  // 8 days
  METRICS_LATENCY_SAMPLE_CAP: 10_000,
  METRICS_BY_SLUG_CAP: 1_000,
  METRICS_TOP_PROMPTS_LIMIT: 10,
  METRICS_DAILY_RETENTION_DAYS: 90,
  ```

- **Errors nuevos** en `api-key.errors.ts`:
  - `InvalidMetricsRangeError(value)`.

#### Application

- **Ports**:
  - `metrics-counter.port.ts`:
    ```ts
    export interface MetricsCounter {
      recordHit(input: {
        apiKeyId: string;
        slug: string;
        statusCode: number;
        latencyMs: number;
        day: string;  // "YYYY-MM-DD" UTC
      }): Promise<void>;

      readDay(apiKeyId: string, day: string): Promise<{
        counts: number;
        errors: number;
        latencies: number[];
        bySlug: Record<string, number>;
      } | null>;

      clearDay(apiKeyId: string, day: string): Promise<void>;
    }
    ```
  - `api-key-metrics-repository.port.ts`:
    ```ts
    export interface ApiKeyMetricsRepository {
      upsert(daily: ApiKeyMetricsDaily): Promise<void>;
      findRange(apiKeyId: string, fromDay: string, toDay: string): Promise<ApiKeyMetricsDaily[]>;
      deleteOlderThan(retentionDays: number): Promise<number>;
    }
    ```
  - **Extender `ApiKeyRepository`** con
    `findByIdAndUserId(id: string, userId: string): Promise<ApiKey | null>`
    para el ownership check del query (si no existe ya).

- **Commands**:
  - `record-api-key-hit.command.ts` — 4 args posicionales.
    Computa `day = today UTC`, llama `metrics.recordHit({...})`.
    NO throws; cualquier error se loguea pero no se propaga
    (best-effort, no bloquea response del endpoint público).

- **Queries**:
  - `get-api-key-metrics.query.ts`:
    ```ts
    async execute(input: {
      userId: string;
      apiKeyId: string;
      range: MetricsRange;
      includeStatusBreakdown?: boolean;  // deep-dive
    }): Promise<MetricsSummary>
    ```
    Verifica ownership con `apiKeyRepo.findByIdAndUserId`. Throw
    `ApiKeyNotFoundError` si no encontrado o no del user. Lee daily
    snapshots de Postgres + (opcional) day-current de Redis para el
    día en curso (suma a totals). Devuelve `daily` ordenado ASC,
    `totals`, `latency` (del último día), `topPrompts` (agregados
    sobre el rango).

- **Jobs**:
  - `consolidate-api-key-metrics.job.ts`:
    ```ts
    async run(input: { day?: string }): Promise<{
      consolidated: number;
      errors: number;
    }>
    ```
    Default `day = ayer UTC`. Para cada api_key:
    1. `data = metrics.readDay(keyId, day)`. Si null → skip.
    2. Calcular p50/p95 de `data.latencies`.
    3. Top 10 de `data.bySlug` ordenado por count.
    4. `repo.upsert(daily)`. Si throw → log + count error, continuar.
    5. Si upsert OK → `metrics.clearDay(keyId, day)`.
    Error per-key NO aborta el run completo.

  - `prune-old-metrics.job.ts`:
    ```ts
    async run(): Promise<{ deleted: number }>
    ```
    `repo.deleteOlderThan(METRICS_DAILY_RETENTION_DAYS)`.

#### Infrastructure

- **`bun-redis-metrics-counter.adapter.ts`** en
  `src/infrastructure/cache/`:
  - Pipeline de comandos en `recordHit`:
    ```
    INCR    metrics:apikey:<id>:counts:<day>
    EXPIRE  metrics:apikey:<id>:counts:<day> <ttl>
    HINCRBY metrics:apikey:<id>:by-slug:<day> <slug> 1
    EXPIRE  metrics:apikey:<id>:by-slug:<day> <ttl>
    LPUSH   metrics:apikey:<id>:lat:<day> <ms>
    LTRIM   metrics:apikey:<id>:lat:<day> 0 9999
    EXPIRE  metrics:apikey:<id>:lat:<day> <ttl>
    if statusCode >= 400:
      INCR   metrics:apikey:<id>:errors:<day>
      EXPIRE metrics:apikey:<id>:errors:<day> <ttl>
    ```
  - `readDay`: `MGET counts errors`, `LRANGE lat 0 -1`,
    `HGETALL by-slug`. Devuelve null si counts === null.
  - `clearDay`: DEL las 4 keys.

- **`postgres-api-key-metrics.repository.ts`** en
  `src/infrastructure/persistence/repositories/`:
  - `upsert`: `INSERT … ON CONFLICT (api_key_id, day) DO UPDATE`.
  - `findRange`: `SELECT … WHERE api_key_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day ASC`.
  - `deleteOlderThan`: `DELETE WHERE day < CURRENT_DATE - INTERVAL '<days> days'`.
    Returning count.

- **Schema migration `0008_*`**:
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
  CREATE INDEX api_key_metrics_daily_day_idx
    ON api_key_metrics_daily (day);
  ```

#### HTTP

- **Middleware en `/v1/prompts/:slug`** (handler existente):
  ```ts
  const start = performance.now();
  const response = await /* existing handler */;
  const latencyMs = Math.round(performance.now() - start);
  void recordApiKeyHit.execute(
    keyOr401.id,
    params.slug,
    response.status,
    latencyMs,
  ).catch(err => console.error("[metrics-record]", err));
  return response;
  ```

- **Endpoint nuevo**:
  ```
  GET /api/keys/:id/metrics?range=7d|30d|90d&include=status-breakdown
  ```
  - Auth: requiere sesión (requireUser).
  - Validación: `range` parsed via `MetricsRange.parse` o default 30d.
  - 200 con `MetricsSummary`. 404 si la key no existe o no es del user.
    400 si `range` inválido.

#### Cron scripts

- `scripts/cron-consolidate-metrics.ts`:
  Importa el composition root (parcial), instancia el job, le pasa
  el `--day` o ayer por default. Logs estructurados.

- `scripts/cron-prune-old-metrics.ts`:
  Idem para el prune.

### Slice 2 — UI dashboard

#### Frontend deps

- `bun add recharts` (~40KB).

#### Componentes nuevos

- **`<MetricCard label value sub />`**
  (`src/frontend/components/metrics/MetricCard.tsx`):
  Pill con label arriba (uppercase muted) + value grande
  (font-display) + sub opcional.

- **`<MiniBarChart data height />`**
  (`src/frontend/components/metrics/MiniBarChart.tsx`):
  recharts BarChart sin axis, 30 barras max, tooltip on hover,
  bars usan `--color-chart-1`.

- **`<TopPromptsList items />`**
  (`src/frontend/components/metrics/TopPromptsList.tsx`):
  Rows con barra horizontal % + count, ordenadas desc.

- **`<UsageDashboard summary />`**
  (`src/frontend/components/metrics/UsageDashboard.tsx`):
  Orquesta los 3 anteriores. Layout per design brief.

- **`<RangeToggle value onChange />`**
  (`src/frontend/components/metrics/RangeToggle.tsx`):
  Toggle group 7d/30d/90d. Default 30d.

#### Hooks

- `useApiKeyMetrics(keyId, range)`:
  ```ts
  return useSWR<MetricsSummary>(
    `/api/keys/${keyId}/metrics?range=${range.value}`,
    fetcher,
  );
  ```

#### Páginas

- **`ApiKeysPage` rebuild** (cierra el deferred de Pγ — la página
  legacy P8/P9 ahora se rediseña Pγ + integra metrics):
  - Header + range picker global.
  - Cada key row es `<Collapsible>`. Header del collapsible:
    nombre, prefix, last used, status pill.
  - Expandido: lazy fetch de métricas → render `<UsageDashboard>`.
  - Footer: link "View full details →" a `/settings/api-keys/:id`.

- **`/settings/api-keys/:id` (nueva ruta)**:
  - Full-page del UsageDashboard + tabla de errores por status code
    + chart de p50/p95 over time.
  - Range picker dedicado.

#### Routing

- Agregar `/settings/api-keys/:id` bajo `<SettingsLayout>` en
  `frontend.tsx`. La página comparte el sidebar Settings.

### Specs cross-reference

- `conventions.md` §11 (design tokens + typography) ya enforced — UI
  componentes usan `bg-chart-1` / `font-display` / etc.
- `tech-stack.md` Frontend → "Charting (P18)" ya documenta recharts.
- `mission.md` ya documenta el cambio de scope (métricas in V1, event
  log out V1).

## Out of scope (deferred)

- **Event-level log** (`api_key_request_log` con 1 row per request).
- **Alertas / notificaciones** (key tirando muchos errores, near rate
  limit). P19+.
- **Geographic / IP analytics** (qué países llaman, etc).
- **Cost tracking por modelo** (V2 con templates).
- **Realtime streaming** del dashboard (WebSocket). Polling SWR con
  `refreshInterval` opcional.
- **Export CSV** de métricas. Nice-to-have post-P18.
- **Comparison entre keys** (key A vs key B side-by-side). No.
- **Backfill histórico** (las keys pre-P18 no tienen datos previos).
- **Cron infra deploy** (docker-compose.prod.yml service / systemd
  timer). Documentado en P15; los scripts cron de P18 son
  invocables a mano hasta que P15 los wirea.

## Risks / open items

- **Key con muchísimos slugs distintos**: HASH `by-slug` puede crecer
  (key de dev pegándole a 1000 slugs/día). Mitigación: cap a
  `METRICS_BY_SLUG_CAP = 1000` entries por día per key (drop nuevos
  slugs si overflow), top N en consolidate.
- **Latencia del INCR/LPUSH**: ~1ms cada uno; con 4-5 comandos en
  pipeline son ~5ms agregados. Mitigación: pipeline + fire-and-forget
  en el handler (no esperar antes de responder).
- **Consolidation falló por algún día**: el cron del día siguiente
  intenta solo "ayer". Si fallamos un día completo, ese día se
  pierde de Redis (TTL 8d nos da margen). Mitigación: los logs del
  cron deben monitorearse; manualmente se puede correr
  `--day=YYYY-MM-DD` para backfillear cualquier día con datos en
  Redis.
- **Time zone**: storage UTC strict. UI muestra en TZ local — días
  pueden "desfasar" visualmente para users no-UTC, pero la línea de
  tiempo es coherente. Aceptable en V1.
- **Migration de keys nuevas**: para keys creadas DESPUÉS del deploy
  de P18, todo funciona. Para keys preexistentes con uso histórico
  — no hay backfill (no tenemos los datos). Documentar en deep-dive
  page como "Métricas disponibles desde \<deploy date\>".
- **Redis crash mid-day**: si Redis se cae y se reinicia (sin
  persistencia), los counters del día se pierden. AOF/RDB en prod
  mitiga. Aceptable en V1.
- **API Keys page rebuild interaction con P12 (backfill UI)**: la
  ApiKeysPage no toca integrations, así que cero conflicto con el
  BackfillStatusSection.
