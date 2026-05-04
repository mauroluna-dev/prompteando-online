import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ExternalLink, Github, Loader2, Trash2, Unplug } from "lucide-react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";
import {
  disconnectGithub,
  getGithubOAuthUrl,
} from "@/frontend/lib/api/integrations";

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Cancelaste la autorización en GitHub.",
  access_denied: "Cancelaste la autorización en GitHub.",
  "invalid-state":
    "El link de autorización expiró o fue alterado. Probá de nuevo.",
  "invalid-callback":
    "GitHub respondió con datos incompletos. Probá de nuevo.",
  "insufficient-scope":
    "Necesitás aceptar el permiso de repositorios para conectar.",
  "oauth-failed":
    "GitHub rechazó el intercambio de credenciales. Probá de nuevo.",
  "repo-failed":
    "No pudimos crear o acceder al repo. Verificá que tengas permisos en tu cuenta.",
};

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SettingsIntegrationsPage() {
  const { data: connection, isLoading } = useGithubConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const errorCode = searchParams.get("error");
  const justConnected = searchParams.get("connected") === "1";

  // Refresh after a successful connection so the card flips to connected.
  useEffect(() => {
    if (justConnected) {
      void mutate("/api/integrations/github");
    }
  }, [justConnected]);

  const dismissBanner = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    next.delete("connected");
    setSearchParams(next, { replace: true });
  };

  const handleConnect = async () => {
    setConnecting(true);
    setActionError(null);
    try {
      const url = await getGithubOAuthUrl();
      window.location.href = url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error inesperado");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        "¿Desconectar GitHub? Tu repo y los commits no se borran; podés revocar el token desde github.com/settings/applications.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setActionError(null);
    try {
      await disconnectGithub();
      await mutate("/api/integrations/github");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-muted-foreground text-sm">
          Conectá servicios externos para que tus prompts vivan donde vos
          decidís.
        </p>
      </header>

      {justConnected ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-900 dark:text-green-200">
          <span>GitHub conectado correctamente.</span>
          <button
            className="text-xs underline"
            onClick={dismissBanner}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {errorCode ? (
        <div className="bg-destructive/10 text-destructive border-destructive/30 flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
          <span>
            {ERROR_MESSAGES[errorCode] ??
              `Algo salió mal (código: ${errorCode}).`}
          </span>
          <button
            className="text-xs underline"
            onClick={dismissBanner}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <CardTitle className="text-base">GitHub</CardTitle>
          </div>
          <CardDescription>
            Cada save de un prompt se commitea a tu repo personal privado
            <code className="bg-muted mx-1 rounded px-1 py-0.5 text-xs">
              promptstash-&lt;tu-usuario&gt;
            </code>
            . Tu historial vive en tu cuenta — no nuestra.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Cargando…</div>
          ) : connection ? (
            <ConnectedState
              connection={connection}
              onDisconnect={() => void handleDisconnect()}
              disconnecting={disconnecting}
            />
          ) : (
            <NotConnectedState
              onConnect={() => void handleConnect()}
              connecting={connecting}
            />
          )}
          {actionError ? (
            <p className="text-destructive text-sm">{actionError}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function NotConnectedState({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-900 dark:text-yellow-200">
        <strong className="font-medium">Heads up:</strong> al autorizar pedimos
        scope <code>repo</code> (read+write a todos tus repos). Solo tocamos
        <code className="mx-1">promptstash-&lt;tu-usuario&gt;</code> — auditás
        nuestro código en GitHub si querés verificarlo.
      </div>
      <div>
        <Button onClick={onConnect} disabled={connecting}>
          {connecting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Github className="mr-2 h-4 w-4" />
          )}
          Conectar GitHub
        </Button>
      </div>
    </div>
  );
}

function ConnectedState({
  connection,
  onDisconnect,
  disconnecting,
}: {
  connection: { githubLogin: string; repoFullName: string; connectedAt: Date | string };
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const repoUrl = `https://github.com/${connection.repoFullName}`;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
            Cuenta
          </dt>
          <dd className="font-medium">{connection.githubLogin}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
            Repo
          </dt>
          <dd>
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              {connection.repoFullName}
              <ExternalLink className="h-3 w-3" />
            </a>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
            Conectado
          </dt>
          <dd>{formatDate(connection.connectedAt)}</dd>
        </div>
      </dl>
      <div>
        <Button
          variant="outline"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Unplug className="mr-2 h-4 w-4" />
          )}
          Desconectar
          <Trash2 className="ml-2 h-3 w-3 opacity-50" />
        </Button>
      </div>
    </div>
  );
}
