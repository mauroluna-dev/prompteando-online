import type { MetricsRangeValue } from "@/domain/api-key";
import { cn } from "@/lib/utils";

const RANGES: MetricsRangeValue[] = ["7d", "30d", "90d"];

/**
 * P18 — Toggle group for the dashboard range filter. Mirrors the
 * Pγ AppShell tab style (bg-muted pill with active item on white).
 */
export function RangeToggle({
  value,
  onChange,
  className,
  label = "Rango",
}: {
  value: MetricsRangeValue;
  onChange: (next: MetricsRangeValue) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-2 text-sm", className)}
      role="group"
      aria-label={label}
    >
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <div className="bg-muted inline-flex rounded-md p-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              value === r
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={value === r}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
