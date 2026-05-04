import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * P18 — KPI tile shown in the dashboard header. Label uppercase
 * muted on top, value large in display font, optional sub line
 * beneath (e.g. "in last 30 days").
 */
export function MetricCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-1 rounded-lg border p-4",
        className,
      )}
    >
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="font-display text-2xl font-semibold leading-tight">
        {value}
      </span>
      {sub ? (
        <span className="text-muted-foreground text-xs">{sub}</span>
      ) : null}
    </div>
  );
}
