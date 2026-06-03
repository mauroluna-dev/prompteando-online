import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Github,
  Hash,
  KeyRound,
  Loader2,
  ShieldCheck,
  Slash,
  Unplug,
} from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/frontend/components/states";
import { cn } from "@/lib/utils";
import type { GitHubConnectionView } from "@/domain/github-connection";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";
import {
  connectGithubWithToken,
  ConnectGithubTokenError,
  disconnectGithub,
  getGithubOAuthUrl,
} from "@/frontend/lib/api/integrations";

const RECENTLY_FINISHED_WINDOW_MS = 30_000;

const BACKFILL_FAILURE_COPY: Record<string, string> = {
  token_invalid:
    "Perdimos permiso para escribir en tu repo. Desconectá y volvé a conectar para reintentar.",
  insufficient_scope:
    "Permisos insuficientes. Desconectá y volvé a conectar otorgando el scope `repo`.",
  repo_missing:
    "No encontramos el repo en GitHub. ¿Lo borraste? Desconectá y volvé a conectar para recrearlo.",
  lock_timeout:
    "El sync tardó demasiado en obtener el lock. Desconectá y volvé a conectar para reintentar.",
};

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

function failureCopy(reason: string | null | undefined): string {
  if (!reason) return "El sync falló. Desconectá y volvé a conectar para reintentar.";
  return (
    BACKFILL_FAILURE_COPY[reason] ??
    `El sync falló (${reason}). Desconectá y volvé a conectar para reintentar.`
  );
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return typeof d === "string" ? new Date(d) : d;
}

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-AR", {
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

  const errorCode = searchParams.get("error");
  const justConnected = searchParams.get("connected") === "1";

  // OAuth callback returns ?connected=1 or ?error=... in the URL.
  // Surface as toasts (sonner) and immediately strip from URL so a
  // refresh doesn't replay the message.
  useEffect(() => {
    if (justConnected) {
      void mutate("/api/integrations/github");
      toast.success("GitHub conectado correctamente.");
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      setSearchParams(next, { replace: true });
    }
  }, [justConnected, searchParams, setSearchParams]);

  useEffect(() => {
    if (!errorCode) return;
    toast.error(
      ERROR_MESSAGES[errorCode] ?? `Algo salió mal (código: ${errorCode}).`,
    );
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [errorCode, searchParams, setSearchParams]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getGithubOAuthUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
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
    try {
      await disconnectGithub();
      await mutate("/api/integrations/github");
      toast.success("GitHub desconectado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Integraciones
        </h1>
        <p className="text-muted-foreground text-sm">
          Conectá servicios externos para que tus prompts vivan donde vos
          decidís.
        </p>
      </header>

      {/* GitHub integration card */}
      <section className="bg-card flex flex-col gap-5 rounded-lg border p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-md">
              <Github className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <h2 className="font-display text-lg font-semibold">GitHub</h2>
              <p className="text-muted-foreground text-sm">
                Cada vez que guardás, dejamos una copia en tu GitHub. Tu
                historial vive en tu cuenta.
              </p>
            </div>
          </div>
          {connection ? (
            <span className="bg-success-bg text-success-fg inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3 w-3" />
              Conectado
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        ) : connection ? (
          <>
            <ConnectedState
              connection={connection}
              onDisconnect={() => void handleDisconnect()}
              disconnecting={disconnecting}
            />
            <BackfillStatusSection connection={connection} />
          </>
        ) : (
          <NotConnectedState
            onConnect={() => void handleConnect()}
            connecting={connecting}
          />
        )}
      </section>

      {/* Coming soon integrations */}
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
          Próximamente
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ComingSoonCard
            icon={<Hash className="h-5 w-5" />}
            label="Slack"
            description="Notificaciones cuando cambia una versión."
          />
          <ComingSoonCard
            icon={<Slash className="h-5 w-5" />}
            label="Linear"
            description="Conectá prompts con issues."
          />
        </div>
      </div>
    </div>
  );
}

type ConnectMethod = "oauth" | "pat";

function NotConnectedState({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  const [method, setMethod] = useState<ConnectMethod>("oauth");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Elegí cuánto acceso querés darnos a GitHub:
      </p>

      <div
        className="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Tipo de acceso a GitHub"
      >
        <MethodCard
          icon={ShieldCheck}
          title="Acceso completo"
          subtitle="Recomendado · 1 click"
          description="Te creamos una carpeta privada prompteando-<usuario>. GitHub nos pide acceso a tus repos, pero solo tocamos esa carpeta."
          selected={method === "oauth"}
          onSelect={() => setMethod("oauth")}
        />
        <MethodCard
          icon={KeyRound}
          title="Elegir un solo repo"
          subtitle="Para los más cuidadosos"
          description="Vos generás un token acotado a un repo tuyo y lo pegás acá. No vemos ningún otro repo."
          selected={method === "pat"}
          onSelect={() => setMethod("pat")}
        />
      </div>

      {method === "oauth" ? (
        <div className="flex flex-col gap-3">
          <div className="bg-warning-bg text-warning-fg rounded-md border border-amber-200 p-3 text-xs">
            <strong className="font-medium">Importante:</strong> GitHub nos pide
            acceso a tus repos para poder crear y escribir tu carpeta. Solo
            tocamos{" "}
            <code className="font-mono">prompteando-&lt;tu-usuario&gt;</code>.
            Nuestro código es abierto: podés revisarlo cuando quieras.
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
      ) : (
        <ConnectWithTokenForm />
      )}
    </div>
  );
}

function MethodCard({
  icon: Icon,
  title,
  subtitle,
  description,
  selected,
  onSelect,
}: {
  icon: typeof ShieldCheck;
  title: string;
  subtitle: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-primary/30 ring-1"
          : "hover:border-foreground/20 hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-medium">{title}</span>
      </div>
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {subtitle}
      </span>
      <span className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {description}
      </span>
    </button>
  );
}

const TOKEN_ERROR_COPY: Record<string, string> = {
  "token-invalid":
    "El token no es válido o expiró. Generá uno nuevo en GitHub y pegalo de nuevo.",
  "repo-access-denied":
    "El token no tiene acceso a ese repo. Revisá que owner/repo esté bien escrito y que se lo hayas dado al token.",
  "repo-write-denied":
    "El token llega al repo pero no puede escribir. Dale el permiso Contents: Read and write.",
  unknown: "No pudimos conectar. Probá de nuevo en un momento.",
};

function ConnectWithTokenForm() {
  const [repoFullName, setRepoFullName] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectGithubWithToken(token.trim(), repoFullName.trim());
      await mutate("/api/integrations/github");
      toast.success("GitHub conectado con acceso a un solo repo.");
    } catch (err) {
      const code =
        err instanceof ConnectGithubTokenError ? err.code : "unknown";
      setError(TOKEN_ERROR_COPY[code] ?? TOKEN_ERROR_COPY.unknown!);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = repoFullName.trim().length > 0 && token.trim().length > 0;

  return (
    <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
      <ol className="text-muted-foreground flex flex-col gap-1.5 text-xs">
        <li>
          1. Abrí{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
            className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
          >
            GitHub → nuevo token acotado
            <ExternalLink className="h-3 w-3" />
          </a>
          .
        </li>
        <li>
          2. En <strong>Repository access</strong> elegí{" "}
          <strong>Only select repositories</strong> y marcá tu repo.
        </li>
        <li>
          3. En <strong>Repository permissions</strong> poné{" "}
          <strong>Contents: Read and write</strong>.
        </li>
        <li>4. Generá el token y pegalo acá abajo.</li>
      </ol>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repo-full-name" className="text-xs">
          ¿Qué repo? (formato <code className="font-mono">usuario/repo</code>)
        </Label>
        <Input
          id="repo-full-name"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          placeholder="tu-usuario/mis-prompts"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-9 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="github-token" className="text-xs">
          Token
        </Label>
        <Input
          id="github-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_..."
          autoComplete="off"
          spellCheck={false}
          className="h-9 font-mono text-sm"
        />
      </div>

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <Button onClick={() => void handleSubmit()} disabled={busy || !canSubmit}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          Conectar con este repo
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
  connection: GitHubConnectionView;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const repoUrl = `https://github.com/${connection.repoFullName}`;
  const isPat = connection.connectionMethod === "pat";
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
          isPat
            ? "bg-success-bg text-success-fg border-emerald-200"
            : "bg-muted/40 text-muted-foreground",
        )}
      >
        {isPat ? (
          <KeyRound className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>
          {isPat ? (
            <>
              Acceso <strong>solo</strong> a{" "}
              <code className="font-mono">{connection.repoFullName}</code>. No
              vemos ningún otro repo tuyo.
            </>
          ) : (
            <>Acceso completo a tus repos · escribimos solo en esta carpeta.</>
          )}
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Detail label="Cuenta" value={connection.githubLogin} />
        <Detail
          label={isPat ? "Repo conectado" : "Carpeta en GitHub"}
          value={
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              {connection.repoFullName}
              <ExternalLink className="h-3 w-3" />
            </a>
          }
        />
        <Detail label="Conectado" value={formatDate(connection.connectedAt)} />
      </dl>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="self-start"
        >
          {disconnecting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Unplug className="mr-2 h-4 w-4" />
          )}
          Desconectar
        </Button>
        {isPat ? (
          <p className="text-muted-foreground text-xs">
            Desconectar borra el token que guardamos. Para revocarlo del lado de
            GitHub también, andá a{" "}
            <a
              href="https://github.com/settings/personal-access-tokens"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              tus tokens en GitHub
            </a>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function BackfillStatusSection({
  connection,
}: {
  connection: GitHubConnectionView;
}) {
  const status = connection.backfillStatus;
  const finishedAt = toDate(connection.backfillFinishedAt);
  const total = connection.backfillTotal ?? 0;
  const processed = connection.backfillProcessed ?? 0;

  const ackKey =
    status === "completed" && finishedAt
      ? `backfill-ack-${connection.userId}-${finishedAt.toISOString()}`
      : null;
  const [acked, setAcked] = useState<boolean>(() => {
    if (!ackKey || typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ackKey) === "1";
  });

  useEffect(() => {
    if (!ackKey || typeof window === "undefined") return;
    setAcked(window.sessionStorage.getItem(ackKey) === "1");
  }, [ackKey]);

  if (status === null || status === undefined) return null;

  if (status === "pending") {
    return (
      <div className="bg-info-bg text-info-fg flex items-center gap-3 rounded-md border border-blue-200 p-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Preparando el sync de tu historial existente a GitHub…</span>
      </div>
    );
  }

  if (status === "running") {
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    return (
      <div className="bg-info-bg text-info-fg flex flex-col gap-2 rounded-md border border-blue-200 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sincronizando {processed} de {total} commits
          </span>
          <span className="text-xs">{pct}%</span>
        </div>
        <div className="bg-blue-100 h-1.5 w-full overflow-hidden rounded">
          <div
            className="bg-info-fg h-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === "completed") {
    if (acked) return null;
    if (total === 0) return null;
    const recent =
      finishedAt &&
      Date.now() - finishedAt.getTime() < RECENTLY_FINISHED_WINDOW_MS;
    if (!recent) return null;
    const handleAck = () => {
      if (ackKey && typeof window !== "undefined") {
        window.sessionStorage.setItem(ackKey, "1");
      }
      setAcked(true);
    };
    return (
      <div className="bg-success-bg text-success-fg flex items-start justify-between gap-2 rounded-md border border-emerald-200 p-3 text-sm">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Sync completo: {total} commits replicados a GitHub.
        </span>
        <button className="text-xs underline" onClick={handleAck} type="button">
          Listo
        </button>
      </div>
    );
  }

  // status === 'failed'
  return (
    <div className="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-md border p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{failureCopy(connection.backfillFailureReason)}</span>
    </div>
  );
}

function ComingSoonCard({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="bg-card/50 flex items-center gap-3 rounded-lg border p-4 opacity-70">
      <div className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-md">
        {icon}
      </div>
      <div className="flex flex-col">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}
