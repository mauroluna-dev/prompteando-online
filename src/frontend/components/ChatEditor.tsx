import { Plus, Trash2 } from "lucide-react";
import {
  type ChatMessage,
  type ChatRole,
  parseChatMessages,
  serializeChatMessages,
} from "@/domain/prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ROLES: ChatRole[] = ["system", "user", "assistant", "placeholder"];

const ROLE_LABELS: Record<ChatRole, string> = {
  system: "Sistema (instrucciones)",
  user: "Usuario",
  assistant: "Asistente",
  placeholder: "Hueco para completar",
};

function safeParse(value: string): ChatMessage[] {
  if (!value.trim()) return [];
  try {
    return parseChatMessages(value);
  } catch {
    return [];
  }
}

/**
 * Edits a chat prompt as a list of role/content messages. Controlled:
 * `value` is the JSON-serialized array, `onChange` emits the new JSON.
 */
export function ChatEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const messages = safeParse(value);

  const commit = (next: ChatMessage[]) => onChange(serializeChatMessages(next));

  const update = (i: number, patch: Partial<ChatMessage>) => {
    commit(messages.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const remove = (i: number) => commit(messages.filter((_m, idx) => idx !== i));
  const add = () =>
    commit([...messages, { role: "user", content: "" }]);

  return (
    <div className="flex min-h-[480px] flex-col gap-2 rounded-md border p-3">
      {messages.map((m, i) => (
        <div key={i} className="bg-card flex flex-col gap-1.5 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2">
            <select
              value={m.role}
              onChange={(e) =>
                update(i, { role: e.target.value as ChatRole })
              }
              aria-label="Quién dice este mensaje"
              className="border-input bg-background h-7 rounded-md border px-2 text-xs"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Quitar mensaje"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {m.role === "placeholder" ? (
            <Input
              value={m.name ?? ""}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="nombre del hueco (ej: historial)"
              aria-label="Nombre del hueco para completar"
              className="h-8 text-xs"
            />
          ) : (
            <Textarea
              value={m.content ?? ""}
              onChange={(e) => update(i, { content: e.target.value })}
              placeholder="Escribí el mensaje… podés usar {{variables}}"
              aria-label="Contenido del mensaje"
              className="min-h-[72px] text-sm"
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="self-start">
        <Plus className="mr-1 h-4 w-4" />
        Agregar mensaje
      </Button>
    </div>
  );
}
