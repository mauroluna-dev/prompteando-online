import { AlertTriangle, Github, Loader2 } from "lucide-react";

type Props = {
  githubCommitSha: string | null;
  githubSyncError: string | null;
  hasConnection: boolean;
  repoFullName: string | null;
};

const ERROR_COPY: Record<string, string> = {
  token_invalid: "Se cortó el permiso con GitHub. Reconectalo.",
  insufficient_scope: "Faltan permisos en GitHub.",
  repo_missing: "No encontramos tu carpeta en GitHub.",
  rate_limited: "GitHub nos frenó por exceso de pedidos. Probá en unos minutos.",
  lock_timeout: "La copia tardó demasiado. Guardá de nuevo para reintentar.",
};

function describeError(code: string): string {
  return ERROR_COPY[code] ?? "No se pudo guardar la copia en GitHub.";
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
        title="Guardado en GitHub — ver la copia"
        className="hover:text-foreground inline-flex items-center"
        aria-label="Ver la copia en GitHub"
        onClick={(e) => e.stopPropagation()}
      >
        {icon}
      </a>
    ) : (
      <span title="Guardado en GitHub" className="inline-flex items-center">
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
      title="Guardando copia en GitHub…"
      className="inline-flex items-center"
      aria-label="Guardando copia en GitHub"
    >
      <Loader2
        className="text-muted-foreground h-3.5 w-3.5 animate-spin"
        aria-hidden="true"
      />
    </span>
  );
}
