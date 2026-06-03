import { useState } from "react";
import { Link } from "react-router";
import {
  ChevronDown,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EmptyState,
  Skeleton,
} from "@/frontend/components/states";
import {
  RANGE_LABELS,
  RangeToggle,
  UsageDashboard,
} from "@/frontend/components/metrics";
import type { ApiKeyView } from "@/domain/api-key";
import type { MetricsRangeValue } from "@/domain/api-key";
import { useApiKeys } from "@/frontend/hooks/use-api-keys";
import { useApiKeyMetrics } from "@/frontend/hooks/use-api-key-metrics";
import { createApiKey, revokeApiKey } from "@/frontend/lib/api/api-keys";
import { cn } from "@/lib/utils";

const API_KEY_QUOTA = 10;

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function lastUsedLabel(k: ApiKeyView): string {
  if (k.revokedAt) return `Desactivada el ${formatDate(k.revokedAt)}`;
  if (k.lastUsedAt) return `Usada por última vez el ${formatDate(k.lastUsedAt)}`;
  return `Creada el ${formatDate(k.createdAt)} · sin uso`;
}

export function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ name: string; plaintext: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [range, setRange] = useState<MetricsRangeValue>("30d");
  const [openId, setOpenId] = useState<string | null>(null);

  const activeCount = keys.filter((k) => k.revokedAt === null).length;
  const atQuota = activeCount >= API_KEY_QUOTA;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createApiKey({ name });
      setRevealedKey({ name: result.apiKey.name, plaintext: result.plaintext });
      setName("");
      setShowForm(false);
      await mutate("/api/keys");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "No se pudo crear la clave",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    if (
      !confirm(
        `¿Desactivar "${keyName}"? Las apps que estén usando esta clave van a dejar de funcionar.`,
      )
    )
      return;
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      await mutate("/api/keys");
      toast.success(`Clave "${keyName}" desactivada.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo desactivar la clave",
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey.plaintext);
    setCopied(true);
    toast.success("Clave copiada");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Claves de acceso
        </h1>
        <p className="text-muted-foreground text-sm">
          Funcionan como una contraseña para conectar tus prompts con otras apps
          (n8n, Zapier, Make o tu propio código).{" "}
          <span className="font-medium">
            {activeCount} de {API_KEY_QUOTA} activas
          </span>
          .
        </p>
      </header>

      {/* Toolbar: range picker + Generate */}
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <RangeToggle value={range} onChange={setRange} />
        <div>
          {showForm ? null : (
            <Button
              onClick={() => setShowForm(true)}
              disabled={atQuota}
              title={
                atQuota
                  ? `Llegaste al límite de ${API_KEY_QUOTA} claves activas. Desactivá una primero.`
                  : undefined
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Crear clave
            </Button>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="bg-card flex flex-col gap-3 rounded-lg border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-base font-semibold">Nueva clave de acceso</h2>
            <p className="text-muted-foreground text-sm">
              Ponele un nombre que te ayude a reconocerla después (por ejemplo,
              dónde la vas a usar).
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-name">Nombre</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="n8n producción"
              autoFocus
              maxLength={50}
            />
          </div>
          {createError ? (
            <p className="text-destructive text-sm">{createError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setName("");
                setCreateError(null);
              }}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Keys list */}
      {isLoading ? (
        <ListSkeleton />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Todavía no hay claves de acceso"
          description="Creá tu primera clave para empezar a usar tus prompts desde otras apps como n8n, Zapier o el código de tu proyecto."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Crear primera clave
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <li key={k.id}>
              <ApiKeyRow
                k={k}
                range={range}
                isOpen={openId === k.id}
                onToggle={() => setOpenId(openId === k.id ? null : k.id)}
                onRevoke={() => void handleRevoke(k.id, k.name)}
                revoking={revokingId === k.id}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={revealedKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevealedKey(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clave creada</DialogTitle>
            <DialogDescription>
              Copiala ahora y guardala en un lugar seguro.{" "}
              <span className="font-medium">No se va a mostrar de nuevo.</span>
            </DialogDescription>
          </DialogHeader>
          {revealedKey ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Nombre</Label>
                <code className="font-mono text-sm">{revealedKey.name}</code>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Clave</Label>
                <div className="bg-muted flex items-center gap-2 rounded-md border p-2">
                  <code className="flex-1 break-all font-mono text-xs">{revealedKey.plaintext}</code>
                  <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
                    {copied ? (
                      <>
                        <Check className="mr-1 h-3 w-3" />
                        Copiada
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                setRevealedKey(null);
                setCopied(false);
              }}
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiKeyRow({
  k,
  range,
  isOpen,
  onToggle,
  onRevoke,
  revoking,
}: {
  k: ApiKeyView;
  range: MetricsRangeValue;
  isOpen: boolean;
  onToggle: () => void;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const isRevoked = k.revokedAt !== null;
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className={cn(
        "bg-card overflow-hidden rounded-lg border",
        isRevoked ? "opacity-60" : "",
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <CollapsibleTrigger
          asChild
          disabled={isRevoked}
          className="flex flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
        >
          <button type="button">
            <KeyRound className="text-muted-foreground h-5 w-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{k.name}</span>
                {isRevoked ? (
                  <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                    Desactivada
                  </span>
                ) : null}
              </div>
              <code className="text-muted-foreground truncate font-mono text-xs">
                {k.prefix}…
              </code>
              <span className="text-muted-foreground text-[11px]">
                {lastUsedLabel(k)}
              </span>
            </div>
            {!isRevoked ? (
              <ChevronDown
                className={cn(
                  "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                  isOpen ? "rotate-180" : "",
                )}
              />
            ) : null}
          </button>
        </CollapsibleTrigger>
        {!isRevoked ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRevoke}
            disabled={revoking}
          >
            {revoking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Desactivar
          </Button>
        ) : null}
      </div>
      {isRevoked ? null : (
        <CollapsibleContent>
          <div className="border-t p-4">
            <KeyMetrics keyId={k.id} range={range} />
            <div className="mt-4 flex justify-end">
              <Button asChild variant="ghost" size="sm">
                <Link to={`/settings/api-keys/${k.id}`}>
                  Ver detalle completo
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function KeyMetrics({
  keyId,
  range,
}: {
  keyId: string;
  range: MetricsRangeValue;
}) {
  const { data, error, isLoading } = useApiKeyMetrics(keyId, range);

  if (isLoading) return <DashboardSkeleton />;
  if (error)
    return (
      <p className="text-destructive text-sm">
        {error instanceof Error
          ? error.message
          : "No se pudieron cargar las métricas"}
      </p>
    );
  if (!data) return null;
  return <UsageDashboard summary={data} rangeLabel={RANGE_LABELS[range]} />;
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="bg-card flex items-center gap-4 rounded-lg border p-4"
        >
          <Skeleton className="h-5 w-5 rounded" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[140px]" />
      <Skeleton className="h-32" />
    </div>
  );
}
