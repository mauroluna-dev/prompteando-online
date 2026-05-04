import type { PromptVersionDTO as PromptVersion } from "@/domain/prompt-version";
import { GitHubSyncBadge } from "./GitHubSyncBadge";

function timeAgo(d: Date | string): string {
  const ts = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months === 1 ? "" : "es"}`;
}

type Props = {
  versions: PromptVersion[];
  currentNumber: number | null;
  selectedNumber: number | null;
  onSelect: (n: number | null) => void;
  githubConnection: { hasConnection: boolean; repoFullName: string | null };
  /**
   * P17 — Diff-select mode. When all 3 props are provided, each
   * version row shows tiny [A] [B] toggle buttons that pick which
   * version goes on each side of the diff. Row body click is
   * disabled in this mode.
   */
  diffSelect?: {
    selectedA: number | null;
    selectedB: number | null;
    onSelectA: (n: number) => void;
    onSelectB: (n: number) => void;
  };
};

export function VersionHistory({
  versions,
  currentNumber,
  selectedNumber,
  onSelect,
  githubConnection,
  diffSelect,
}: Props) {
  if (versions.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        Todavía no hay versiones.
      </div>
    );
  }

  const isDiffMode = Boolean(diffSelect);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold tracking-tight">
          Historial
        </h2>
        {!isDiffMode && selectedNumber !== null ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => onSelect(null)}
          >
            Volver a la actual
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {versions.map((v) => {
          const isCurrent = v.versionNumber === currentNumber;
          const isSelected = !isDiffMode && v.versionNumber === selectedNumber;
          const isA = diffSelect?.selectedA === v.versionNumber;
          const isB = diffSelect?.selectedB === v.versionNumber;
          const rowClass = [
            "flex w-full flex-col gap-0.5 rounded-md border p-2 text-left transition-colors",
            isSelected || isA || isB
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50",
          ].join(" ");

          const rowBody = (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  v{v.versionNumber}
                  {isCurrent ? (
                    <span className="text-muted-foreground ml-1 text-[10px] font-normal uppercase">
                      actual
                    </span>
                  ) : null}
                  <GitHubSyncBadge
                    githubCommitSha={v.githubCommitSha}
                    githubSyncError={v.githubSyncError}
                    hasConnection={githubConnection.hasConnection}
                    repoFullName={githubConnection.repoFullName}
                  />
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
            </>
          );

          return (
            <li key={v.id}>
              {isDiffMode && diffSelect ? (
                <div className={rowClass}>
                  {rowBody}
                  <div className="mt-1 flex gap-1">
                    <ABToggle
                      label="A"
                      active={isA}
                      onClick={() => diffSelect.onSelectA(v.versionNumber)}
                    />
                    <ABToggle
                      label="B"
                      active={isB}
                      onClick={() => diffSelect.onSelectB(v.versionNumber)}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onSelect(isSelected ? null : v.versionNumber)
                  }
                  className={rowClass}
                >
                  {rowBody}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ABToggle({
  label,
  active,
  onClick,
}: {
  label: "A" | "B";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      ].join(" ")}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
