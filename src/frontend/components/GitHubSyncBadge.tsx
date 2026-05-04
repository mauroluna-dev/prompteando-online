import { AlertTriangle, Github, Loader2 } from "lucide-react";

type Props = {
  githubCommitSha: string | null;
  githubSyncError: string | null;
  hasConnection: boolean;
  repoFullName: string | null;
};

const ERROR_COPY: Record<string, string> = {
  token_invalid: "Token inválido. Reconectá GitHub.",
  insufficient_scope: "Permisos insuficientes en GitHub.",
  repo_missing: "No encuentro el repo en GitHub.",
  rate_limited: "GitHub rate limit. Probá de nuevo en unos minutos.",
  lock_timeout: "Sync demorado. Hacé un nuevo save para reintentar.",
};

function describeError(code: string): string {
  return ERROR_COPY[code] ?? "Error sincronizando con GitHub.";
}

export function GitHubSyncBadge({
  githubCommitSha,
  githubSyncError,
  hasConnection,
  repoFullName,
}: Props) {
  if (!hasConnection) return null;

  if (githubCommitSha) {
    const url = repoFullName
      ? `https://github.com/${repoFullName}/commit/${githubCommitSha}`
      : null;
    const icon = (
      <Github className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
    );
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Synced to GitHub — view commit"
        className="hover:text-foreground inline-flex items-center"
        aria-label="View commit on GitHub"
        onClick={(e) => e.stopPropagation()}
      >
        {icon}
      </a>
    ) : (
      <span title="Synced to GitHub" className="inline-flex items-center">
        {icon}
      </span>
    );
  }

  if (githubSyncError) {
    return (
      <span
        title={describeError(githubSyncError)}
        className="inline-flex items-center"
        aria-label={describeError(githubSyncError)}
      >
        <AlertTriangle
          className="text-amber-500 h-3.5 w-3.5"
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span
      title="Syncing to GitHub…"
      className="inline-flex items-center"
      aria-label="Syncing to GitHub"
    >
      <Loader2
        className="text-muted-foreground h-3.5 w-3.5 animate-spin"
        aria-hidden="true"
      />
    </span>
  );
}
