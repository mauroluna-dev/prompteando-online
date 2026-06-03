import { useState } from "react";
import { Copy, Play, Variable } from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import {
  extractVariablesForType,
  parseChatMessages,
  type PromptType,
  renderChat,
  renderTemplate,
  type TemplateVarMeta,
} from "@/domain/prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateTemplateSettings } from "@/frontend/lib/api/prompts";

/** Live var detection from editor content; never throws in the UI. */
function detectVars(content: string, type: PromptType): string[] {
  try {
    return extractVariablesForType(content, type);
  } catch {
    return [];
  }
}

export function TemplatePanel({
  slug,
  isTemplate,
  varMeta,
  content,
  type,
}: {
  slug: string;
  isTemplate: boolean;
  varMeta: TemplateVarMeta;
  content: string;
  type: PromptType;
}) {
  const vars = detectVars(content, type);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    try {
      await updateTemplateSettings(slug, { isTemplate: next });
      await mutate(`/api/prompts/${slug}`);
      toast.success(next ? "Plantilla activada." : "Plantilla desactivada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setToggling(false);
    }
  };

  return (
    <section className="bg-card flex flex-col gap-4 rounded-md border p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display flex items-center gap-1.5 text-sm font-semibold">
            <Variable className="h-4 w-4" />
            Plantilla con variables
          </h2>
          <p className="text-muted-foreground text-xs">
            Dejá huecos como <code className="font-mono">{"{{nombre}}"}</code> en
            el texto y completalos con un valor distinto cada vez que lo uses.
          </p>
        </div>
        <Switch
          checked={isTemplate}
          onCheckedChange={(next) => void handleToggle(next)}
          disabled={toggling}
          aria-label="Activar plantilla con variables"
        />
      </header>

      {isTemplate ? (
        <div className="flex flex-col gap-5">
          <VariablesEditor slug={slug} vars={vars} varMeta={varMeta} />
          <RenderTester
            content={content}
            type={type}
            vars={vars}
            varMeta={varMeta}
          />
          <RenderSnippet slug={slug} vars={vars} />
        </div>
      ) : null}
    </section>
  );
}

function VariablesEditor({
  slug,
  vars,
  varMeta,
}: {
  slug: string;
  vars: string[];
  varMeta: TemplateVarMeta;
}) {
  const [draft, setDraft] = useState<TemplateVarMeta>(varMeta);

  const setField = (name: string, field: "description" | "default", value: string) => {
    setDraft((prev) => ({
      ...prev,
      [name]: {
        description: prev[name]?.description ?? null,
        default: prev[name]?.default ?? null,
        [field]: value.length > 0 ? value : null,
      },
    }));
  };

  const persist = async () => {
    try {
      await updateTemplateSettings(slug, { varMeta: draft });
      await mutate(`/api/prompts/${slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    }
  };

  if (vars.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs">
        Todavía no hay variables. Escribí{" "}
        <code className="font-mono">{"{{algo}}"}</code> en el editor y aparece acá.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Variables detectadas</Label>
      <div className="flex flex-col gap-2">
        {vars.map((name) => (
          <div
            key={name}
            className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center"
          >
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
              {`{{${name}}}`}
            </code>
            <Input
              value={draft[name]?.description ?? ""}
              onChange={(e) => setField(name, "description", e.target.value)}
              onBlur={() => void persist()}
              placeholder="Descripción (opcional)"
              className="h-8 text-xs"
            />
            <Input
              value={draft[name]?.default ?? ""}
              onChange={(e) => setField(name, "default", e.target.value)}
              onBlur={() => void persist()}
              placeholder="Valor por defecto (si lo ponés, deja de ser obligatorio)"
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type RenderOutcome =
  | { kind: "ok"; content: string }
  | { kind: "missing"; missingVars: string[] };

function renderForType(
  content: string,
  type: PromptType,
  values: Record<string, string>,
): RenderOutcome {
  if (type === "chat") {
    try {
      const r = renderChat(parseChatMessages(content), values);
      return r.missingVars.length > 0
        ? { kind: "missing", missingVars: r.missingVars }
        : {
            kind: "ok",
            content: r.messages
              .map((m) => `${m.role}: ${m.content ?? `[${m.name}]`}`)
              .join("\n\n"),
          };
    } catch {
      return { kind: "ok", content: "(el chat tiene un error de formato)" };
    }
  }
  const r = renderTemplate(content, values);
  return r.missingVars.length > 0
    ? { kind: "missing", missingVars: r.missingVars }
    : { kind: "ok", content: r.content };
}

function RenderTester({
  content,
  type,
  vars,
  varMeta,
}: {
  content: string;
  type: PromptType;
  vars: string[];
  varMeta: TemplateVarMeta;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RenderOutcome | null>(null);

  // Renders the LIVE editor content (same pure domain functions the
  // server uses), applying declared defaults — strict like /render.
  const handleRender = () => {
    const effective: Record<string, string> = {};
    for (const name of vars) {
      const typed = values[name];
      if (typed && typed.length > 0) {
        effective[name] = typed;
      } else {
        const def = varMeta[name]?.default;
        if (def != null) effective[name] = def;
      }
    }
    setResult(renderForType(content, type, effective));
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Vista previa</Label>
      <p className="text-muted-foreground text-xs">
        Mirá cómo queda el texto con los valores que pongas. Usa lo que tenés en
        el editor ahora, no hace falta guardar.
      </p>
      {vars.map((name) => (
        <Input
          key={name}
          value={values[name] ?? ""}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [name]: e.target.value }))
          }
          placeholder={
            varMeta[name]?.default
              ? `${name} (default: ${varMeta[name]?.default})`
              : name
          }
          className="h-8 text-xs"
        />
      ))}
      <div>
        <Button size="sm" onClick={handleRender}>
          <Play className="mr-2 h-4 w-4" />
          Ver resultado
        </Button>
      </div>
      {result?.kind === "ok" ? (
        <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
          {result.content}
        </pre>
      ) : null}
      {result?.kind === "missing" ? (
        <div className="bg-destructive/5 text-destructive border-destructive/30 rounded-md border px-3 py-2 text-xs">
          Faltan variables:{" "}
          <span className="font-mono font-medium">
            {result.missingVars.join(", ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RenderSnippet({ slug, vars }: { slug: string; vars: string[] }) {
  const varsObj = vars.reduce<Record<string, string>>((acc, name) => {
    acc[name] = "...";
    return acc;
  }, {});
  const snippet = [
    `curl -X POST https://<tu-host>/v1/prompts/${slug}/render \\`,
    `  -H "Authorization: Bearer po_live_..." \\`,
    `  -H "content-type: application/json" \\`,
    `  -d '${JSON.stringify({ vars: varsObj })}'`,
  ].join("\n");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Usar desde otras apps (n8n, Zapier, código…)</Label>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(snippet);
            toast.success("Código copiado.");
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          aria-label="Copiar el código de ejemplo"
        >
          <Copy className="h-3 w-3" />
          Copiar
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        Ejemplo para pedir el prompt ya completado. Reemplazá{" "}
        <code className="font-mono">po_live_…</code> por tu clave de acceso.
      </p>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{snippet}</pre>
    </div>
  );
}
