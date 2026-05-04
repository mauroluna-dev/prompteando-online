import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/lib/utils";

/**
 * P18 — Compact bar chart for daily request counts. No CartesianGrid,
 * no Y axis. X axis shows month-day for the first/middle/last bars
 * only. Tooltip on hover shows full date + count.
 *
 * Bars use `var(--color-chart-1)` per Pγ design tokens.
 */
export function MiniBarChart({
  data,
  height = 120,
  className,
  dataKey = "requests",
  ariaLabel,
}: {
  data: { day: string; requests: number; errors?: number }[];
  height?: number;
  className?: string;
  dataKey?: "requests" | "errors";
  ariaLabel?: string;
}) {
  const tickIndices = computeTickIndices(data.length);

  return (
    <div className={cn("w-full", className)} aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
        >
          <XAxis
            dataKey="day"
            stroke="var(--color-muted-foreground)"
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={(value, index) =>
              tickIndices.has(index) ? formatTick(value as string) : ""
            }
            tick={{ fontSize: 10 }}
            height={18}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              padding: "6px 10px",
              boxShadow: "var(--shadow-soft-lift-sm, 0 1px 2px rgb(0 0 0 / 0.04))",
            }}
            labelFormatter={(label) =>
              typeof label === "string" ? formatTooltipDate(label) : String(label ?? "")
            }
            formatter={(value) => [value as number, dataKey]}
          />
          <Bar
            dataKey={dataKey}
            fill="var(--color-chart-1)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function computeTickIndices(n: number): Set<number> {
  if (n === 0) return new Set();
  if (n === 1) return new Set([0]);
  if (n === 2) return new Set([0, 1]);
  return new Set([0, Math.floor(n / 2), n - 1]);
}

function formatTick(day: string): string {
  // "YYYY-MM-DD" → "MMM DD" (e.g. "May 04").
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function formatTooltipDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
