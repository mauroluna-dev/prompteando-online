# P18 — API Key usage metrics · Plan

Numbered task groups, organizadas en **2 slices** (PRs separados).
Cada grupo deja la app en estado compilable (`bun run lint &&
typecheck && build && test` verde) salvo donde se indique.

---

## SLICE 1 — Data layer (PR #1)

Sin UI. Verificable con `curl` + `redis-cli` + `psql`.

### 1.1. Schema + migration 0008

1.1.1. Crear `src/infrastructure/persistence/schema/api-key-metrics.ts`:
```ts
import { pgTable, text, integer, jsonb, timestamp, primaryKey, index, date } from "drizzle-orm/pg-core";
import { apiKeys } from "./api-keys";

export const apiKeyMetricsDaily = pgTable(
  "api_key_metrics_daily",
  {
    apiKeyId: text("api_key_id").notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    totalRequests: integer("total_requests").notNull().default(0),
    totalErrors: integer("total_errors").notNull().default(0),
    p50Ms: integer("p50_ms").notNull().default(0),
    p95Ms: integer("p95_ms").notNull().default(0),
    topPrompts: jsonb("top_prompts")
      .$type<{ slug: string; count: number }[]>()
      .notNull().default([]),
    consolidatedAt: timestamp("consolidated_at", { mode: "date" })
      .notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.apiKeyId, t.day] }),
    dayIdx: index("api_key_metrics_daily_day_idx").on(t.day),
  }),
);
```

1.1.2. Re-export desde `src/infrastructure/persistence/schema/index.ts`.

1.1.3. `bun run db:generate` → revisar `0008_*.sql` (CREATE TABLE
+ PK compuesta + index).

1.1.4. `bun run db:migrate`. Verificar
`docker compose exec postgres psql -U promptstash -d promptstash
-c "\d api_key_metrics_daily"`.

### 1.2. Domain extension

1.2.1. Crear `src/domain/api-key/metrics-range.vo.ts` per
requirements §Application → Domain.

1.2.2. Crear `src/domain/api-key/api-key-metrics-daily.entity.ts`
con `static fromRow`, `static aggregate(samples)`, `toJSON()`.

1.2.3. Crear `src/domain/api-key/metrics-summary.ts` con el type
`MetricsSummary`.

1.2.4. Extender `src/domain/api-key/constants.ts` con las 5 keys
nuevas (`METRICS_REDIS_TTL_SECONDS`, `METRICS_LATENCY_SAMPLE_CAP`,
`METRICS_BY_SLUG_CAP`, `METRICS_TOP_PROMPTS_LIMIT`,
`METRICS_DAILY_RETENTION_DAYS`).

1.2.5. Extender `src/domain/api-key/api-key.errors.ts` con
`InvalidMetricsRangeError`.

1.2.6. Re-exports en `src/domain/api-key/index.ts`.

1.2.7. Tests unitarios:
- `MetricsRange.parse` válidos + inválido throws.
- `ApiKeyMetricsDaily.aggregate([])` → `{p50: 0, p95: 0}`.
- `aggregate([1..100])` → `p50 ≈ 50`, `p95 ≈ 95`.
- `aggregate([5])` → `{p50: 5, p95: 5}`.

### 1.3. Application ports

1.3.1. Crear `src/application/ports/metrics-counter.port.ts`.

1.3.2. Crear `src/application/ports/api-key-metrics-repository.port.ts`.

1.3.3. Extender `src/application/ports/api-key-repository.port.ts`
con `findByIdAndUserId(id, userId)` si no existe.

### 1.4. Application command + query

1.4.1. Crear `src/application/commands/record-api-key-hit.command.ts`:
- Constructor: `(metrics: MetricsCounter, clock?: { now(): Date })`.
- `execute(apiKeyId, slug, statusCode, latencyMs)` (4 posicionales,
  per conventions §6).
- Calcula `day = clock.now().toISOString().slice(0, 10)`.
- Llama `metrics.recordHit({...})`. Wrap en try/catch interno
  para no propagar (best-effort).

1.4.2. Crear `src/application/queries/get-api-key-metrics.query.ts`:
- Constructor: `(apiKeyRepo, metricsRepo, metricsCounter, clock)`.
- `execute({ userId, apiKeyId, range, includeStatusBreakdown })`
  (5+ args → object input per §6).
- Lógica:
  1. Ownership: `apiKey = await apiKeyRepo.findByIdAndUserId(...)`.
     Si null → throw `ApiKeyNotFoundError`.
  2. Calcular `fromDay`, `toDay` desde `range.days`.
  3. `daily = await metricsRepo.findRange(apiKeyId, fromDay, toDay)`.
  4. Sumar a `totals` el día actual desde Redis (opcional, para
     que el dashboard refleje hoy en vivo).
  5. Calcular `errorRate`, `topPrompts` agregados (sumar `count`
     across `top_prompts` de cada day, top N final).
  6. Devolver `MetricsSummary`. `statusBreakdown` solo si flag.

1.4.3. Tests unitarios con fakes:
- Ownership: key de otro user → throws.
- Empty range → todos los counts 0, errorRate 0.
- Range con datos → totals correctos, daily ordenado ASC.
- topPrompts agregado correctamente entre days.

### 1.5. Application jobs

1.5.1. Crear `src/application/jobs/consolidate-api-key-metrics.job.ts`:
- Constructor: `(apiKeyRepo, metricsCounter, metricsRepo, clock?)`.
- `run({ day? })`. Default `day = clock.now() − 1 día UTC`.
- Iterar `await apiKeyRepo.findAllActiveIds()` (extender repo si
  no existe — un `SELECT id FROM api_keys` simple).
- Per key: try → readDay → si null skip → calcular agregados →
  upsert → clearDay. Catchear errores per-key (log + count).
- Return `{ consolidated, errors }`.

1.5.2. Crear `src/application/jobs/prune-old-metrics.job.ts`.
Trivial: `await repo.deleteOlderThan(METRICS_DAILY_RETENTION_DAYS)`.

1.5.3. Tests con fakes:
- Empty Redis → 0 consolidated.
- 3 keys con datos → 3 upserts + 3 clearDay calls.
- 1 key con upsert que falla → errors=1, otras 2 procesan OK,
  clearDay NO se llama para la fallida (datos quedan en Redis
  para reintento).

### 1.6. Infrastructure adapters

1.6.1. Crear `src/infrastructure/cache/bun-redis-metrics-counter.adapter.ts`
con el pipeline de comandos de requirements §Infrastructure →
"BunRedisMetricsCounter". Usar `redis.send(...)` consistente con
los otros adapters Redis.

1.6.2. Tests integración (skip si REDIS_URL ausente):
- `recordHit` × 3 con mismo (key, slug) → counts=3, by-slug[slug]=3.
- `recordHit` con statusCode 500 → errors counter incrementa.
- `recordHit` 11_000 veces → `latencies.length === 10_000` (cap).
- `recordHit` con 1_500 slugs distintos → `Object.keys(bySlug).length
  === 1_000` (cap, drop overflow).
- `readDay` después de no hits → null.
- `clearDay` borra las 4 keys.

1.6.3. Crear `src/infrastructure/persistence/repositories/postgres-api-key-metrics.repository.ts`
con upsert + findRange + deleteOlderThan.

1.6.4. Tests integración:
- `upsert` 2 veces para misma key+day → 1 fila (UPSERT funcionó).
- `findRange` ordena ASC.
- `deleteOlderThan(90)` con fila de hace 100 días → borrada.

### 1.7. HTTP wiring

1.7.1. En `src/interfaces/http/server.ts` (composition root):
- Instanciar `metricsCounter`, `apiKeyMetricsRepo`, `recordApiKeyHit`,
  `getApiKeyMetrics`, `consolidateMetrics`, `pruneOldMetrics`.

1.7.2. Wrap el handler de `GET /v1/prompts/:slug` con captura de
latency + status:
```ts
.get("/v1/prompts/:slug", async (ctx) => {
  const start = performance.now();
  const response = await /* existing logic */;
  const latencyMs = Math.round(performance.now() - start);
  // requireApiKey ya extrajo keyOr401 antes del logic; capturar
  // su id (ver código actual para el patrón exacto).
  if (apiKeyId) {
    void recordApiKeyHit
      .execute(apiKeyId, params.slug, response.status, latencyMs)
      .catch((err) => console.error("[metrics-record]", err));
  }
  return response;
})
```
**Cuidado**: el handler actual hace early-return en distintas ramas
(401, 429, 404, 200). El recording debe correr en TODAS — refactor
a un wrapper helper si es la opción más limpia.

1.7.3. Endpoint nuevo:
```ts
.get("/api/keys/:id/metrics", async ({ request, params, query }) => {
  const userOr401 = await requireUser(request, getCurrentUser);
  if (userOr401 instanceof Response) return userOr401;
  try {
    const range = MetricsRange.parse((query.range as string) ?? "30d");
    const includeStatusBreakdown =
      typeof query.include === "string" &&
      query.include.split(",").includes("status-breakdown");
    const summary = await getApiKeyMetrics.execute({
      userId: userOr401.id,
      apiKeyId: params.id,
      range,
      includeStatusBreakdown,
    });
    return Response.json(summary);
  } catch (err) {
    if (err instanceof InvalidMetricsRangeError) return jsonError(400, err.message);
    if (err instanceof ApiKeyNotFoundError) return jsonError(404, err.message);
    throw err;
  }
})
```

### 1.8. Cron scripts

1.8.1. Crear `scripts/cron-consolidate-metrics.ts`:
```ts
#!/usr/bin/env bun
import { /* composition root deps */ } from "@/...";

const dayArg = process.argv.find((a) => a.startsWith("--day="))?.split("=")[1];
const result = await consolidateMetrics.run({ day: dayArg });
console.log(JSON.stringify({
  ts: new Date().toISOString(),
  job: "consolidate-metrics",
  ...result,
}));
process.exit(result.errors > 0 ? 1 : 0);
```
Documentar uso en el header del archivo.

1.8.2. Crear `scripts/cron-prune-old-metrics.ts` (idéntico shape).

1.8.3. Agregar entries a `package.json` scripts:
```json
"cron:consolidate-metrics": "bun scripts/cron-consolidate-metrics.ts",
"cron:prune-old-metrics": "bun scripts/cron-prune-old-metrics.ts"
```

### 1.9. Validation pass — Slice 1

1.9.1. `bun run lint && bun run typecheck && bun run build && bun test` verde.

1.9.2. Smoke manual end-to-end (per `validation.md` §Slice 1):
- `curl` × 5 al endpoint público con una key.
- Verificar Redis: counters subieron.
- Correr `bun run cron:consolidate-metrics --day=YYYY-MM-DD`.
- Verificar fila en `api_key_metrics_daily` + Redis vacío.
- `curl /api/keys/<id>/metrics?range=7d` con session cookie devuelve
  `MetricsSummary` correcto.

### 1.10. Commits + PR Slice 1

Commits granulares siguiendo `conventions.md` §2:
- `feat(p18): add api_key_metrics_daily schema + migration 0008`
- `feat(p18): add MetricsRange VO + ApiKeyMetricsDaily entity + constants`
- `feat(p18): add MetricsCounter + ApiKeyMetricsRepository ports`
- `feat(p18): add RecordApiKeyHitCommand`
- `feat(p18): add GetApiKeyMetricsQuery`
- `feat(p18): add ConsolidateApiKeyMetricsJob + PruneOldMetricsJob`
- `feat(p18): implement BunRedisMetricsCounter adapter`
- `feat(p18): implement PostgresApiKeyMetricsRepository`
- `feat(p18): wrap public endpoint with metrics middleware + add /api/keys/:id/metrics`
- `feat(p18): add cron scripts (consolidate + prune)`
- `docs(p18): add P18 spec docs (requirements, plan, validation)`

PR contra master. Título: "P18 slice 1 — API key metrics data layer".

---

## SLICE 2 — UI dashboard (PR #2)

Depende de slice 1 mergeado.

### 2.1. Install recharts

2.1.1. `bun add recharts`. Verificar bundle delta (~+40KB).

### 2.2. Frontend API client + hook

2.2.1. Crear `src/frontend/lib/api/api-key-metrics.ts`:
```ts
export async function getApiKeyMetrics(
  keyId: string,
  range: "7d" | "30d" | "90d",
  options?: { includeStatusBreakdown?: boolean },
): Promise<MetricsSummary> { ... }
```

2.2.2. Crear `src/frontend/hooks/use-api-key-metrics.ts` con SWR.

### 2.3. Componentes shared metrics

2.3.1. Crear directorio `src/frontend/components/metrics/`:
- `MetricCard.tsx`
- `MiniBarChart.tsx`
- `TopPromptsList.tsx`
- `UsageDashboard.tsx` (orquesta)
- `RangeToggle.tsx`
- `index.ts` (barrel)

2.3.2. Theme recharts:
- Bars usan `var(--color-chart-1)`.
- Tooltip con `bg-card border` y typography del design system.
- Sin CartesianGrid en mini.

### 2.4. ApiKeysPage rebuild (Pγ + metrics)

2.4.1. Reescribir `src/frontend/pages/ApiKeysPage.tsx`:
- Layout Pγ (max-w-5xl, padding 24, font-display H1).
- Cada key row es `<Collapsible>` (instalar shadcn collapsible si
  falta: `bunx shadcn@latest add collapsible`).
- Header collapsed: nombre, prefix, last_used, status pill,
  chevron.
- Expandido: lazy `useApiKeyMetrics` (only fetch on open).
- Inside: `<UsageDashboard summary />` + footer link a deep-dive.
- Range picker global arriba del listado.
- Empty state cuando `keys.length === 0` (reusar `<EmptyState>`
  de Pγ).

### 2.5. Deep-dive page

2.5.1. Crear `src/frontend/pages/ApiKeyDetailPage.tsx`:
- Route `/settings/api-keys/:id`.
- Header: breadcrumb, nombre, prefix.
- Range picker dedicated.
- `<UsageDashboard>` + sección "Errors by status code" (tabla)
  + chart de p50/p95 over time (line chart recharts).
- Si la key es ajena al user → 404 page con "Back to keys".

2.5.2. Wire route en `frontend.tsx` bajo `<SettingsLayout>`:
```tsx
<Route path="api-keys/:id" element={<ApiKeyDetailPage />} />
```

### 2.6. Validation pass — Slice 2

2.6.1. `bun run lint && typecheck && build && test` verde.

2.6.2. Smoke visual + funcional:
- Login → `/settings/api-keys` muestra rows de keys con metrics
  inline al expandir.
- Cambiar range → re-fetch + dashboard actualiza.
- Click "View full details" → navega a deep-dive page.
- Deep-dive: tabla de errors por status visible cuando hay datos.
- Empty key (recién creada, sin hits) → estado vacío amigable.

### 2.7. Commits + PR Slice 2

Commits:
- `feat(p18): install recharts`
- `feat(p18): add api-key-metrics API client + useApiKeyMetrics hook`
- `feat(p18): add metrics components (MetricCard, MiniBarChart, TopPromptsList)`
- `feat(p18): add UsageDashboard + RangeToggle composers`
- `feat(p18): rebuild ApiKeysPage with collapsible rows + inline metrics`
- `feat(p18): add /settings/api-keys/:id deep-dive page`

Título PR: "P18 slice 2 — API key metrics dashboard UI".

---

## Cross-slice notes

- **Conventions §11** (design tokens + typography) aplica a slice 2.
  Cero hex hardcoded en componentes nuevos. recharts colors via
  CSS vars (`getComputedStyle` o passing fill props).
- **No backfill data**: las keys preexistentes empiezan a registrar
  desde el primer hit post-deploy de slice 1. La UI debe mostrar
  estado "No metrics yet" amigable cuando `daily.length === 0`.
- **Pre-push hook** asegurado por husky (lint + typecheck + build
  + tests). Si pre-push falla, fix antes de push.
