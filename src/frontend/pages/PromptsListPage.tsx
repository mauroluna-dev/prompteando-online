import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ChevronRight,
  FileText,
  Github,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Skeleton,
} from "@/frontend/components/states";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";
import { usePrompts } from "@/frontend/hooks/use-prompts";

function formatRelative(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "recién";
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 30) return `hace ${diffD}d`;
  return date.toLocaleDateString("es-AR", { month: "short", day: "numeric" });
}

// Pγ: each prompt gets a colored icon tile derived from its slug for
// quick visual scanning. Hash → 1 of 5 hues from the design palette.
const TILE_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
];

function tileColorFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(h) % TILE_COLORS.length]!;
}

export function PromptsListPage() {
  const { data: prompts, isLoading } = usePrompts();
  const { data: connection } = useGithubConnection();
  const [query, setQuery] = useState("");

  const hasGithub = Boolean(connection);

  const filtered = useMemo(() => {
    if (!prompts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [prompts, query]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Tus prompts
          </h1>
          <p className="text-sm text-muted-foreground">
            {prompts ? promptCountSummary(prompts.length, hasGithub) : "Cargando…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar prompts…"
              className="h-9 w-60 pl-9"
            />
          </div>
          <Button asChild>
            <Link to="/prompts/new">
              <Plus className="mr-1 h-4 w-4" />
              Nuevo prompt
            </Link>
          </Button>
        </div>
      </header>

      {isLoading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        prompts && prompts.length === 0 ? (
          <PromptListEmptyState />
        ) : (
          <NoResults query={query} onClear={() => setQuery("")} />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                to={`/prompts/${p.slug}`}
                className="bg-card hover:border-foreground/20 hover:bg-accent/40 group flex items-center gap-4 rounded-lg border p-4 transition-colors"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tileColorFor(p.slug)}`}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{p.name}</span>
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    <code className="font-mono">{p.slug}</code>
                    <span aria-hidden>·</span>
                    <span>Actualizado {formatRelative(p.updatedAt)}</span>
                  </div>
                  {p.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <SyncBadge hasGithub={hasGithub} />
                <ChevronRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function promptCountSummary(total: number, hasGithub: boolean): string {
  const base = `${total} prompt${total === 1 ? "" : "s"}`;
  if (!hasGithub) return base;
  return `${base} · sincronizando con GitHub`;
}

function SyncBadge({ hasGithub }: { hasGithub: boolean }) {
  if (!hasGithub) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
        sin sync
      </span>
    );
  }
  return (
    <span className="bg-success-bg text-success-fg inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <Github className="h-3 w-3" />
      sincronizado
    </span>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="bg-card flex items-center gap-4 rounded-lg border p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PromptListEmptyState() {
  return (
    <EmptyState
      icon={FileText}
      title="Todavía no hay prompts"
      description="Creá tu primer prompt y empezá a versionar. Cada guardado es inmutable y expone un endpoint público que podés llamar desde cualquier lado."
      action={
        <Button asChild>
          <Link to="/prompts/new">
            <Plus className="mr-1 h-4 w-4" />
            Nuevo prompt
          </Link>
        </Button>
      }
    />
  );
}

function NoResults({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="bg-card flex flex-col items-center gap-2 rounded-lg border p-8 text-center">
      <p className="text-sm">
        Ningún prompt coincide con{" "}
        <span className="font-medium">"{query}"</span>.
      </p>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Limpiar búsqueda
      </Button>
    </div>
  );
}
