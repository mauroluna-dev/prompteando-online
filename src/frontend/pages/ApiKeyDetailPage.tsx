import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RangeToggle,
  UsageDashboard,
} from "@/frontend/components/metrics";
import {
  EmptyState,
  Skeleton,
} from "@/frontend/components/states";
import type { MetricsRangeValue } from "@/domain/api-key";
import { useApiKeys } from "@/frontend/hooks/use-api-keys";
import { useApiKeyMetrics } from "@/frontend/hooks/use-api-key-metrics";

/**
 * P18 — Deep-dive page for one API key. Mounted at
 * /settings/api-keys/:id under the SettingsLayout sidebar.
 *
 * Layout:
 *  - Header: breadcrumb + key name + prefix + range picker
 *  - <UsageDashboard> (4 KPIs + bar chart + top prompts)
 *  - "Latency over time" line chart (p50 + p95)
 *  - "Errors by status code" tabla (V1 placeholder — column not
 *    persisted yet; shows "no data" until a follow-up phase)
 */
export function ApiKeyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<MetricsRangeValue>("30d");
  const { data: allKeys = [], isLoading: keysLoading } = useApiKeys();
  const key = useMemo(
    () => allKeys.find((k) => k.id === id) ?? null,
    [allKeys, id],
  );

  const { data, error, isLoading } = useApiKeyMetrics(
    id ?? null,
    range,
    { includeStatusBreakdown: true },
  );

  if (keysLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  if (!key) {
    return (
      <EmptyState
        icon={KeyRound}
        title="Key not found"
        description="It may have been revoked, deleted, or never existed for this account."
        action={
          <Button asChild>
            <Link to="/settings/api-keys">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to API keys
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/settings/api-keys">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to API keys
        </Link>
      </Button>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {key.name}
          </h1>
          <code className="text-muted-foreground font-mono text-xs">
            {key.prefix}…
          </code>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <p className="text-destructive text-sm">
          {error instanceof Error ? error.message : "Failed to load metrics"}
        </p>
      ) : data ? (
        <>
          <UsageDashboard summary={data} rangeLabel={range} />
          <LatencyOverTime data={data.daily} rangeLabel={range} />
          <StatusBreakdown
            data={data.statusBreakdown ?? []}
            rangeLabel={range}
          />
        </>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[140px]" />
      <Skeleton className="h-32" />
      <Skeleton className="h-[200px]" />
    </div>
  );
}

function LatencyOverTime({
  data,
  rangeLabel,
}: {
  data: { day: string; p50: number; p95: number }[];
  rangeLabel: string;
}) {
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">
          Latency over time
        </h3>
        <span className="text-muted-foreground text-xs">{rangeLabel}</span>
      </header>
      {data.length === 0 ? (
        <div className="bg-muted/40 text-muted-foreground flex h-[200px] items-center justify-center rounded text-sm">
          No latency data in this range.
        </div>
      ) : (
        <div className="w-full">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={data}
              margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                stroke="var(--color-muted-foreground)"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(d: string) =>
                  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "2-digit",
                    timeZone: "UTC",
                  })
                }
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                width={40}
                unit="ms"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                  padding: "6px 10px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                dot={false}
                name="p50"
              />
              <Line
                type="monotone"
                dataKey="p95"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                name="p95"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function StatusBreakdown({
  data,
  rangeLabel,
}: {
  data: { statusCode: number; count: number }[];
  rangeLabel: string;
}) {
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">
          Errors by status code
        </h3>
        <span className="text-muted-foreground text-xs">{rangeLabel}</span>
      </header>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Status-code breakdown is not tracked yet (V1 only stores aggregate
          error counts). Coming in a follow-up phase.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.statusCode} className="border-t">
                <td className="py-2 font-mono">{row.statusCode}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

