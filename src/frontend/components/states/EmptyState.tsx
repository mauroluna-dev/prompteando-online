import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pγ — Reusable empty-state primitive.
 *
 * Used when a data-driven surface has zero items (no prompts, no API
 * keys, no versions yet, etc.). Includes a circular icon, a heading,
 * a short subtitle, and an optional CTA slot.
 *
 * Visual matches the "Empty state" card in the States Reference frame.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon | ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col items-center gap-3 rounded-lg border p-12 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
