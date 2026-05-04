import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pγ — Reusable inline error primitive.
 *
 * Used when a section fails to load or an action errors out, but the
 * rest of the page is still usable. For unrecoverable page-level
 * crashes, use a route-level error boundary instead.
 *
 * Visual matches the "Inline error" card in the States Reference frame.
 */
export function InlineError({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
  action,
  className,
}: {
  title: string;
  description?: string;
  /** Show a "Retry" button bound to this callback. Mutually exclusive with `action`. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Custom action node (overrides onRetry). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-3 rounded-md border p-3 text-sm",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-destructive/80 text-xs">{description}</p>
        ) : null}
      </div>
      {action ?? (onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
        >
          {retryLabel}
        </Button>
      ) : null)}
    </div>
  );
}
