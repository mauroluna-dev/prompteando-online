import type { MetricsSummary } from "@/domain/api-key";
import { cn } from "@/lib/utils";
import { MetricCard } from "./MetricCard";
import { MiniBarChart } from "./MiniBarChart";
import { TopPromptsList } from "./TopPromptsList";

/**
 * P18 — Composes the standard usage dashboard for one API key:
 * 4 KPI cards on top, daily bar chart in the middle, top prompts
 * list on the bottom.
 *
 * Used inline in expandable ApiKeysPage rows AND as the body of
 * the deep-dive page (which adds its own extras around it).
 */
export function UsageDashboard({
  summary,
  rangeLabel,
  className,
}: {
  summary: MetricsSummary;
  rangeLabel: string;
  className?: string;
}) {
  const errorRatePct = (summary.totals.errorRate * 100).toFixed(2);
  const topPrompt = summary.topPrompts[0];

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={`Requests totales (${rangeLabel})`}
          value={summary.totals.requests.toLocaleString("es-AR")}
        />
        <MetricCard
          label="Tasa de error"
          value={`${errorRatePct}%`}
          sub={
            summary.totals.errors > 0
              ? `${summary.totals.errors.toLocaleString("es-AR")} errores`
              : "sin errores"
          }
        />
        <MetricCard
          label="Latencia p95"
          value={`${summary.latency.p95}ms`}
          sub={`p50 ${summary.latency.p50}ms`}
        />
        <MetricCard
          label="Prompt más usado"
          value={
            topPrompt ? (
              <code className="font-mono text-base">{topPrompt.slug}</code>
            ) : (
              <span className="text-muted-foreground text-base">—</span>
            )
          }
          sub={
            topPrompt
              ? `${topPrompt.count.toLocaleString("es-AR")} requests`
              : "sin tráfico"
          }
        />
      </div>

      <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">
            Requests por día
          </h3>
          <span className="text-muted-foreground text-xs">{rangeLabel}</span>
        </header>
        {summary.daily.length === 0 ? (
          <EmptyChart />
        ) : (
          <MiniBarChart
            data={summary.daily}
            height={140}
            ariaLabel={`Requests por día, ${rangeLabel}`}
          />
        )}
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Prompts más usados</h3>
          <span className="text-muted-foreground text-xs">{rangeLabel}</span>
        </header>
        <TopPromptsList items={summary.topPrompts} />
      </section>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="bg-muted/40 text-muted-foreground flex h-[120px] items-center justify-center rounded text-sm">
      Sin requests todavía en este rango.
    </div>
  );
}
