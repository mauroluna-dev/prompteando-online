import type { TopPromptShare } from "@/domain/api-key";
import { cn } from "@/lib/utils";

/**
 * P18 — Top N prompts consumed by an API key over the range.
 * Each row: slug + horizontal bar showing share + count + percentage.
 */
export function TopPromptsList({
  items,
  className,
}: {
  items: TopPromptShare[];
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-sm", className)}>
        Todavía no se usó ningún prompt en este período.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => {
        const pct = Math.round(item.share * 100);
        return (
          <li
            key={item.slug}
            className="flex items-center gap-3 text-sm"
          >
            <code className="text-foreground w-44 truncate font-mono text-xs">
              {item.slug}
            </code>
            <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-chart-1 h-full rounded-full"
                style={{ width: `${Math.max(2, pct)}%` }}
                aria-hidden
              />
            </div>
            <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
              {item.count.toLocaleString()}{" "}
              <span className="text-muted-foreground/70">({pct}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
