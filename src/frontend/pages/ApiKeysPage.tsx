import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useApiKeys } from "@/frontend/hooks/use-api-keys";
import { createApiKey, revokeApiKey } from "@/frontend/lib/api/api-keys";

const API_KEY_QUOTA = 10;

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    if (!confirm(`Revoke "${keyName}"? Existing integrations using this key will stop working.`))
      return;
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      await mutate("/api/keys");
      toast.success(`Key "${keyName}" revoked.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey.plaintext);
    setCopied(true);
    toast.success("Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground text-sm">
          Use these keys to read prompts from n8n, curl, fetch, or any other
          consumer.{" "}
          <span className="font-medium">
            {activeCount} / {API_KEY_QUOTA} active
          </span>
          .
        </p>
      </header>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New API key</CardTitle>
            <CardDescription>
              Give it a memorable name so you can identify it later.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="n8n production"
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
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button
            onClick={() => setShowForm(true)}
            disabled={atQuota}
            title={atQuota ? `Limit of ${API_KEY_QUOTA} active keys reached. Revoke one first.` : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            Generate new key
          </Button>
        </div>
      )}

      {isLoading ? (
        <ul className="divide-border divide-y rounded-lg border" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-1 items-center gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </li>
          ))}
        </ul>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="Generate your first key to start consuming prompts via the public API from n8n, curl, or any HTTP client."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Generate first key
            </Button>
          }
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {keys.map((k) => {
            const isRevoked = k.revokedAt !== null;
            return (
              <li
                key={k.id}
                className={[
                  "flex items-center justify-between gap-4 p-4",
                  isRevoked ? "opacity-50" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <KeyRound className="text-muted-foreground h-5 w-5 shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{k.name}</span>
                      {isRevoked ? (
                        <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          Revoked
                        </span>
                      ) : null}
                    </div>
                    <code className="text-muted-foreground truncate text-xs">{k.prefix}…</code>
                    <span className="text-muted-foreground text-[11px]">
                      {isRevoked
                        ? `Revoked ${formatDate(k.revokedAt!)}`
                        : k.lastUsedAt
                          ? `Last used ${formatDate(k.lastUsedAt)}`
                          : `Created ${formatDate(k.createdAt)} · never used`}
                    </span>
                  </div>
                </div>
                {!isRevoked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRevoke(k.id, k.name)}
                    disabled={revokingId === k.id}
                  >
                    {revokingId === k.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Revoke
                  </Button>
                ) : null}
              </li>
            );
          })}
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
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this key now. <span className="font-medium">It will not be shown again.</span>
            </DialogDescription>
          </DialogHeader>
          {revealedKey ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Name</Label>
                <code className="text-sm">{revealedKey.name}</code>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Key</Label>
                <div className="bg-muted flex items-center gap-2 rounded-md border p-2">
                  <code className="flex-1 break-all text-xs">{revealedKey.plaintext}</code>
                  <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
                    {copied ? (
                      <>
                        <Check className="mr-1 h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3 w-3" />
                        Copy
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
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
