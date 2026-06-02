import { useState } from "react";
import { Tag, X } from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLabels } from "@/frontend/hooks/use-labels";
import { assignLabel, removeLabel } from "@/frontend/lib/api/labels";

/**
 * Compact deploy-label manager: shows `label → vN` chips and a form to
 * point a label at a chosen version. `latest` is virtual (not shown).
 */
export function LabelsManager({
  slug,
  versionNumbers,
  defaultVersion,
}: {
  slug: string;
  versionNumbers: number[];
  defaultVersion: number | null;
}) {
  const { data: labels = [] } = useLabels(slug);
  const [name, setName] = useState("");
  const [version, setVersion] = useState<number | null>(defaultVersion);
  const [busy, setBusy] = useState(false);

  const key = `/api/prompts/${slug}/labels`;

  const handleAssign = async () => {
    const label = name.trim().toLowerCase();
    if (!label || version === null) return;
    setBusy(true);
    try {
      await assignLabel(slug, label, version);
      await mutate(key);
      setName("");
      toast.success(`Label "${label}" → v${version}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo asignar");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (label: string) => {
    try {
      await removeLabel(slug, label);
      await mutate(key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar");
    }
  };

  return (
    <section className="bg-card flex flex-col gap-3 rounded-md border p-3">
      <h2 className="font-display flex items-center gap-1.5 text-sm font-semibold">
        <Tag className="h-4 w-4" />
        Labels de deploy
      </h2>

      {labels.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <li
              key={l.label}
              className="bg-muted inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
            >
              <span className="font-mono font-medium">{l.label}</span>
              <span className="text-muted-foreground">→ v{l.versionNumber}</span>
              <button
                type="button"
                onClick={() => void handleRemove(l.label)}
                className="text-muted-foreground hover:text-destructive ml-0.5"
                aria-label={`Quitar ${l.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          Sin labels. Asigná <code className="font-mono">production</code> a
          una versión para consumirla por <code className="font-mono">?label=production</code>.
        </p>
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="label-name" className="text-xs">
            Label
          </Label>
          <Input
            id="label-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="production"
            className="h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="label-version" className="text-xs">
            Versión
          </Label>
          <select
            id="label-version"
            value={version ?? ""}
            onChange={(e) => setVersion(Number(e.target.value))}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            {versionNumbers.map((n) => (
              <option key={n} value={n}>
                v{n}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => void handleAssign()} disabled={busy}>
          Asignar
        </Button>
      </div>
    </section>
  );
}
