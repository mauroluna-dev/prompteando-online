import { cn } from "@/lib/utils";

/**
 * Pγ — Pulsing placeholder block.
 *
 * Composable primitive: callers shape the skeleton by sizing the
 * Skeleton (h-4, w-1/3, etc.). Avoids one-off "loading…" text.
 *
 *   <Skeleton className="h-10 w-10 rounded-md" />
 *   <Skeleton className="h-4 w-1/2" />
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("bg-muted animate-pulse rounded", className)}
      aria-hidden="true"
    />
  );
}
