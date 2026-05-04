# P18 — API Key usage metrics · Plan

## 1. Schema migration

1.1. Editar `src/infrastructure/persistence/schema/api-keys.ts`
(o crear `api-key-metrics.ts`):
```ts
export const apiKeyMetricsDaily = pgTable("api_key_metrics_daily", {
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  totalRequests: integer("total_requests").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  p50Ms: integer("p50_ms").notNull().default(0),
  p95Ms: integer("p95_ms").notNull().default(0),
  topPrompts: jsonb("top_prompts").notNull().$type<{slug: string, count: number}[]>().default([]),
  consolidatedAt: timestamp("consolidated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.apiKeyId, t.day] }),
  dayIdx: index("api_key_metrics_daily_day_idx").on(t.day),
}));
```

1.2. `bun run db:generate` → revisar `0008_*.sql`.

1.3. `bun run db:migrate`.

## 2. Domain extension

2.1. Crear `src/domain/api-key/metrics-range.vo.ts`:
```ts
export class MetricsRange {
  private constructor(readonly value: "7d" | "30d" | "90d", readonly days: number) {}
  static parse(input: string): MetricsRange {
    if (input === "7d") return new MetricsRange("7d", 7);
    if (input === "30d") return new MetricsRange("30d", 30);
    if (input === "90d") return new MetricsRange("90d", 90);
    throw new InvalidMetricsRangeError(input);
  }
}
```

2.2. Crear `src/domain/api-key/api-key-metrics-daily.entity.ts`:
- `static fromRow`, `toJSON`.
- `static aggregate(samples: number[]): { p50: number; p95: number }`
  con quickselect o sort ascendente.

2.3. Constants nuevos en `src/domain/api-key/constants.ts`:
ver requirements §Domain → constants.

2.4. Tests unitarios:
- `MetricsRange.parse` válidos / inválidos.
- `aggregate([])` → 0/0.
- `aggregate([1..100])` → p50≈50, p95≈95.

## 3. Application: ports + commands + queries + jobs

3.1. Crear `src/application/ports/metrics-counter.port.ts`.

3.2. Crear `src/application/ports/api-key-metrics-repository.port.ts`.

3.3. Crear `src/application/commands/record-api-key-hit.command.ts`:
- 4 args posicionales (apiKeyId, slug, statusCode, latencyMs).
- Llama `metricsCounter.recordHit({...day: today UTC})`.

3.4. Crear `src/application/queries/get-api-key-metrics.query.ts`:
- Verifica ownership con `apiKeyRepo.findByIdAndUserId`.
- Lee daily snapshots Postgres + day-current Redis.
- Calcula `totals`, `errorRate`, `topPrompts`.

3.5. Crear `src/application/jobs/consolidate-api-key-metrics.job.ts`.

3.6. Crear `src/application/jobs/prune-old-metrics.job.ts`.

3.7. Tests con fakes para todos.

## 4. Infrastructure

4.1. Crear `src/infrastructure/cache/bun-redis-metrics-counter.adapter.ts`
con pipeline de comandos.

4.2. Crear `src/infrastructure/persistence/repositories/postgres-api-key-metrics.repository.ts`.

4.3. Tests integración (Postgres real) para upsert + findRange +
deleteOlderThan.

## 5. HTTP

5.1. Editar `src/interfaces/http/server.ts`:
- Instanciar `metricsCounter`, `apiKeyMetricsRepo`,
  `recordApiKeyHit`, `getApiKeyMetrics`, `consolidateMetrics`,
  `pruneOldMetrics`.

5.2. Wrap el handler de `/v1/prompts/:slug` con
`measureAndRecord(handler, { apiKeyId, slug })` que captura
start/end, statusCode de la response, dispara
`recordApiKeyHit.execute(...)` fire-and-forget.

5.3. Endpoint nuevo:
```ts
.get("/api/keys/:id/metrics", async ({ request, params, query }) => {
  const userOr401 = await requireUser(request, getCurrentUser);
  if (userOr401 instanceof Response) return userOr401;
  try {
    const range = MetricsRange.parse((query.range as string) ?? "30d");
    const metrics = await getApiKeyMetrics.execute({
      userId: userOr401.id,
      apiKeyId: params.id,
      range,
    });
    return Response.json(metrics);
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) return jsonError(404, err.message);
    if (err instanceof InvalidMetricsRangeError) return jsonError(400, err.message);
    throw err;
  }
})
```

## 6. Frontend

6.1. Install: `bun add recharts`. Verificar bundle.

6.2. Crear `src/frontend/lib/api/api-key-metrics.ts`:
```ts
export async function getApiKeyMetrics(keyId: string, range: string) { ... }
```

6.3. Crear `src/frontend/hooks/use-api-key-metrics.ts`.

6.4. Crear componentes:
- `<MetricCard>` (`src/frontend/components/MetricCard.tsx`):
  pill con label arriba + valor grande.
- `<MiniBarChart>` con recharts.
- `<TopPromptsList>` con barras horizontales %.
- `<UsageDashboard>` orquesta los 3 anteriores.

6.5. Editar `/settings/api-keys` page:
- Cada row es `<Collapsible>`.
- Al expandir → fetch lazy de metrics → render
  `<UsageDashboard>`.
- Range picker global arriba.

6.6. Crear página nueva `/settings/api-keys/:id`:
- Full-page del dashboard + extras (tabla errores, chart
  latencia over time).

## 7. Cron

7.1. Crear `scripts/cron-consolidate-metrics.ts`:
```ts
// instancia el job desde el composition root y corre run()
```

7.2. Crear `scripts/cron-prune-old-metrics.ts`.

7.3. Editar `docker-compose.prod.yml` agregando 2 servicios
basados en imagen scheduler (ej. `mcuadros/ofelia`) con
configuración:
- consolidate: `0 5 * * *` (00:05 UTC)
- prune: `0 6 * * 0` (semanal, domingo 00:06 UTC)

Alternativa simple: systemd timers en el VPS.

## 8. Validation

8.1. `bun run lint && bun run typecheck && bun run build && bun test` verde.

8.2. Smoke manual: ver validation.md.

## 9. Commits + PR

Conventional commits:
- `feat(p18): add api_key_metrics_daily schema + migration 0008`
- `feat(p18): add MetricsRange VO + ApiKeyMetricsDaily entity`
- `feat(p18): add MetricsCounter + ApiKeyMetricsRepository ports`
- `feat(p18): implement BunRedisMetricsCounter adapter`
- `feat(p18): add RecordApiKeyHitCommand + GetApiKeyMetricsQuery`
- `feat(p18): add ConsolidateApiKeyMetricsJob + PruneOldMetricsJob`
- `feat(p18): wire metrics middleware + GET /api/keys/:id/metrics`
- `feat(p18): add UsageDashboard + MetricCard + recharts integration`
- `feat(p18): expand /settings/api-keys with inline metrics`
- `feat(p18): add /settings/api-keys/:id deep-dive page`
- `feat(p18): add cron scripts for consolidation + prune`
- `docs(p18): add P18 spec docs`
