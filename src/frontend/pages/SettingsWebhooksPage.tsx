import { useState } from "react";
import { Copy, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWebhooks } from "@/frontend/hooks/use-webhooks";
import {
  createWebhook,
  deleteWebhook,
  type WebhookEvent,
} from "@/frontend/lib/api/webhooks";

const ALL_EVENTS: WebhookEvent[] = ["version.created", "label.assigned"];

const EVENT_LABELS: Record<WebhookEvent, string> = {
  "version.created": "Cuando guardo una versión nueva",
  "label.assigned": "Cuando le pongo un apodo a una versión",
};

export function SettingsWebhooksPage() {
  const { data: webhooks = [] } = useWebhooks();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["version.created"]);
  const [busy, setBusy] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const toggleEvent = (e: WebhookEvent) =>
    setEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );

  const handleCreate = async () => {
    if (!url.trim() || events.length === 0) return;
    setBusy(true);
    try {
      const created = await createWebhook(url.trim(), events);
      await mutate("/api/webhooks");
      setUrl("");
      setNewSecret(created.secret);
      toast.success("Aviso creado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      await mutate("/api/webhooks");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
          <WebhookIcon className="h-5 w-5" />
          Avisos automáticos
        </h1>
        <p className="text-muted-foreground text-sm">
          Te avisamos en una dirección web (URL) tuya cada vez que pasa algo con
          tus prompts. Sirve para conectar con n8n, Zapier, Make o tu propio
          sistema y disparar acciones automáticas.
        </p>
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Detalles para desarrolladores</summary>
          <p className="mt-1">
            Mandamos un <code className="font-mono">POST</code> firmado con
            HMAC-SHA256. Verificá la firma con el encabezado{" "}
            <code className="font-mono">x-prompteando-signature</code> usando la
            clave secreta que te damos al crear el aviso.
          </p>
        </details>
      </header>

      {newSecret ? (
        <div className="bg-info-bg text-info-fg flex flex-col gap-1 rounded-md border border-blue-200 p-3 text-sm">
          <span className="font-medium">Clave secreta (se muestra una sola vez)</span>
          <span className="text-info-fg/80 text-xs">
            Guardala ahora. Sirve para confirmar que el aviso vino realmente de
            nosotros.
          </span>
          <div className="mt-1 flex items-center gap-2">
            <code className="bg-background/60 grow rounded px-2 py-1 font-mono text-xs">
              {newSecret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(newSecret);
                toast.success("Clave secreta copiada.");
              }}
            >
              <Copy className="mr-1 h-3 w-3" />
              Copiar
            </Button>
          </div>
        </div>
      ) : null}

      <section className="bg-card flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-display text-sm font-semibold">Nuevo aviso</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-url" className="text-xs">
            ¿A qué dirección web (URL) te avisamos?
          </Label>
          <Input
            id="webhook-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tu-app.com/avisos/prompteando"
            className="h-9"
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-muted-foreground mb-1 text-xs">
            ¿Cuándo querés que te avisemos?
          </legend>
          {ALL_EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={events.includes(e)}
                onChange={() => toggleEvent(e)}
              />
              {EVENT_LABELS[e]}
            </label>
          ))}
        </fieldset>
        <Button
          size="sm"
          onClick={() => void handleCreate()}
          disabled={busy}
          className="self-start"
        >
          Crear aviso
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-semibold">Activos</h2>
        {webhooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay avisos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="bg-card flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-sm">{w.url}</span>
                  <span className="text-muted-foreground text-xs">
                    {w.events
                      .map((e) => EVENT_LABELS[e as WebhookEvent] ?? e)
                      .join(" · ")}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleDelete(w.id)}
                  aria-label="Borrar aviso"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
