import type { PromptVersion } from "@/domain/prompt-version";

function timeAgo(d: Date | string): string {
  const ts = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type Props = {
  versions: PromptVersion[];
  currentNumber: number | null;
  selectedNumber: number | null;
  onSelect: (n: number | null) => void;
};

export function VersionHistory({
  versions,
  currentNumber,
  selectedNumber,
  onSelect,
}: Props) {
  if (versions.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        No versions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">History</h2>
        {selectedNumber !== null ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => onSelect(null)}
          >
            Back to current
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {versions.map((v) => {
          const isCurrent = v.versionNumber === currentNumber;
          const isSelected = v.versionNumber === selectedNumber;
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onSelect(isSelected ? null : v.versionNumber)}
                className={[
                  "flex w-full flex-col gap-0.5 rounded-md border p-2 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    v{v.versionNumber}
                    {isCurrent ? (
                      <span className="text-muted-foreground ml-2 text-[10px] font-normal uppercase">
                        current
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {timeAgo(v.createdAt)}
                  </span>
                </div>
                {v.commitMessage ? (
                  <span className="text-muted-foreground line-clamp-2 text-xs">
                    {v.commitMessage}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
