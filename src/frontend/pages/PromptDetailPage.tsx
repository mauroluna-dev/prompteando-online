import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Copy,
  GitCompare,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "@/frontend/components/MarkdownEditor";
import { Skeleton } from "@/frontend/components/states";
import { VersionDiff } from "@/frontend/components/VersionDiff";
import { VersionHistory } from "@/frontend/components/VersionHistory";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";
import { usePrompt } from "@/frontend/hooks/use-prompts";
import { useVersionDiff } from "@/frontend/hooks/use-version-diff";
import { useVersions } from "@/frontend/hooks/use-versions";
import { deletePrompt } from "@/frontend/lib/api/prompts";
import { restoreVersion, saveVersion } from "@/frontend/lib/api/versions";

type Mode = "edit" | "diff";

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PromptDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: prompt, isLoading: promptLoading } = usePrompt(slug);
  const { data: githubConnection } = useGithubConnection();
  const hasConnection = Boolean(githubConnection);
  const { data: versions = [], isLoading: versionsLoading } = useVersions(
    slug,
    { trackGithubSync: hasConnection },
  );
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("edit");
  const [viewingNumber, setViewingNumber] = useState<number | null>(null);
  const [diffA, setDiffA] = useState<number | null>(null);
  const [diffB, setDiffB] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentVersion = prompt
    ? (versions.find((v) => v.id === prompt.currentVersionId) ?? null)
    : null;
  const viewingVersion =
    viewingNumber !== null
      ? (versions.find((v) => v.versionNumber === viewingNumber) ?? null)
      : null;

  // Default A/B picker the first time we enter diff mode: previous
  // version vs current. Only seed once per page mount.
  useEffect(() => {
    if (mode !== "diff" || versions.length < 2) return;
    if (diffB === null) {
      const sorted = [...versions].sort(
        (x, y) => y.versionNumber - x.versionNumber,
      );
      setDiffB(sorted[0]?.versionNumber ?? null);
      setDiffA(sorted[1]?.versionNumber ?? null);
    }
  }, [mode, versions, diffB]);

  // Keep editor content in sync with current version when in edit
  // mode and not viewing a historical version.
  useEffect(() => {
    if (mode === "edit" && viewingNumber === null) {
      setContent(currentVersion?.content ?? "");
    }
  }, [currentVersion?.id, viewingNumber, mode]);

  const diffData = useVersionDiff(slug, diffA, diffB);

  if (promptLoading || versionsLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-[480px]" />
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <h1 className="font-display text-xl font-semibold">Prompt not found</h1>
        <p className="text-muted-foreground text-sm">
          It may have been deleted or never existed.
        </p>
        <Button asChild>
          <Link to="/prompts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>
    );
  }

  const isEmpty = versions.length === 0;
  const canDiff = versions.length >= 2;
  const isViewing = viewingNumber !== null && viewingVersion !== null;

  const handleSave = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const result = await saveVersion(slug, {
        content,
        commitMessage: commitMessage.trim() || undefined,
      });
      if (result.isNoOp) {
        toast.info("No changes to save.");
      } else {
        setCommitMessage("");
        await mutate(`/api/prompts/${slug}/versions`);
        await mutate(`/api/prompts/${slug}`);
        toast.success(`Saved as v${result.version.versionNumber}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!slug || viewingNumber === null) return;
    setRestoring(true);
    try {
      const result = await restoreVersion(slug, viewingNumber);
      setViewingNumber(null);
      await mutate(`/api/prompts/${slug}/versions`);
      await mutate(`/api/prompts/${slug}`);
      toast.success(
        `Restored v${viewingNumber} as v${result.version.versionNumber}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${prompt.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deletePrompt(prompt.slug);
      await mutate("/api/prompts");
      toast.success(`"${prompt.name}" deleted.`);
      navigate("/prompts", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  const handleCopySlug = async () => {
    await navigator.clipboard.writeText(prompt.slug);
    toast.success("Slug copied.");
  };

  const editorDirty = !isEmpty && content !== (currentVersion?.content ?? "");
  const saveDisabled = saving || (!isEmpty && !editorDirty);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/prompts">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to prompts
        </Link>
      </Button>

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {prompt.name}
          </h1>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <code className="font-mono">{prompt.slug}</code>
            <button
              type="button"
              onClick={() => void handleCopySlug()}
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
            <span aria-hidden>·</span>
            <span>Created {formatDate(prompt.createdAt)}</span>
          </div>
          {prompt.description ? (
            <p className="mt-1 text-sm">{prompt.description}</p>
          ) : null}
        </div>
        <ModeToggle mode={mode} onChange={setMode} canDiff={canDiff} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-3">
          {mode === "diff" ? (
            <DiffPane
              diffData={diffData}
              labelA={diffA !== null ? `v${diffA}` : "—"}
              labelB={
                diffB !== null
                  ? `v${diffB}${diffB === currentVersion?.versionNumber ? " (current)" : ""}`
                  : "—"
              }
            />
          ) : isViewing ? (
            <ViewingPane
              versionNumber={viewingVersion.versionNumber}
              commitMessage={viewingVersion.commitMessage}
              createdAt={viewingVersion.createdAt}
              content={viewingVersion.content}
              onBack={() => setViewingNumber(null)}
              onRestore={() => void handleRestore()}
              restoring={restoring}
            />
          ) : (
            <EditPane
              isEmpty={isEmpty}
              content={content}
              onContentChange={setContent}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              onSave={() => void handleSave()}
              saving={saving}
              saveDisabled={saveDisabled}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside>
          <VersionHistory
            versions={versions}
            currentNumber={currentVersion?.versionNumber ?? null}
            selectedNumber={viewingNumber}
            onSelect={setViewingNumber}
            githubConnection={{
              hasConnection,
              repoFullName: githubConnection?.repoFullName ?? null,
            }}
            diffSelect={
              mode === "diff"
                ? {
                    selectedA: diffA,
                    selectedB: diffB,
                    onSelectA: setDiffA,
                    onSelectB: setDiffB,
                  }
                : undefined
            }
          />
        </aside>
      </div>

      {/* Danger zone */}
      <section className="border-destructive/30 bg-destructive/5 mt-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-destructive text-sm font-semibold">
            Delete this prompt
          </p>
          <p className="text-muted-foreground text-xs">
            Removes the prompt and all its versions. Cannot be undone.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="shrink-0"
        >
          {deleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </Button>
      </section>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
  canDiff,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  canDiff: boolean;
}) {
  return (
    <div className="bg-muted inline-flex rounded-md p-0.5 text-sm">
      <button
        type="button"
        onClick={() => onChange("edit")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors",
          mode === "edit"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "edit"}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      <button
        type="button"
        onClick={() => onChange("diff")}
        disabled={!canDiff}
        title={canDiff ? undefined : "Need at least 2 versions to diff"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          mode === "diff"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "diff"}
      >
        <GitCompare className="h-3.5 w-3.5" />
        Diff
      </button>
    </div>
  );
}

function EditPane({
  isEmpty,
  content,
  onContentChange,
  commitMessage,
  onCommitMessageChange,
  onSave,
  saving,
  saveDisabled,
}: {
  isEmpty: boolean;
  content: string;
  onContentChange: (next: string) => void;
  commitMessage: string;
  onCommitMessageChange: (next: string) => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MarkdownEditor
        value={content}
        onChange={onContentChange}
        placeholder="Write your prompt here…"
        className="min-h-[480px]"
      />
      <div className="bg-card flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="commit-message" className="text-xs">
            Commit message{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="commit-message"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            placeholder={isEmpty ? "Initial version" : "What changed?"}
            maxLength={200}
            className="h-9"
          />
        </div>
        <Button onClick={onSave} disabled={saveDisabled}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save{isEmpty ? " first version" : ""}
        </Button>
      </div>
    </div>
  );
}

function ViewingPane({
  versionNumber,
  commitMessage,
  createdAt,
  content,
  onBack,
  onRestore,
  restoring,
}: {
  versionNumber: number;
  commitMessage: string | null;
  createdAt: Date | string;
  content: string;
  onBack: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-info-bg text-info-fg flex items-center justify-between gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm">
        <div className="flex flex-col">
          <span className="font-medium">Viewing v{versionNumber}</span>
          <span className="text-info-fg/80 text-xs">
            {commitMessage ?? "No commit message."} · {formatDate(createdAt)}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-info-fg/30 text-info-fg hover:bg-info-fg/10 shrink-0"
        >
          Back to current
        </Button>
      </div>
      <MarkdownEditor
        value={content}
        onChange={() => {
          /* read-only */
        }}
        readOnly
        className="min-h-[480px]"
      />
      <div className="flex justify-end">
        <Button onClick={onRestore} disabled={restoring}>
          {restoring ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Restore this version
        </Button>
      </div>
    </div>
  );
}

function DiffPane({
  diffData,
  labelA,
  labelB,
}: {
  diffData: { contentA: string | null; contentB: string | null; isLoading: boolean };
  labelA: string;
  labelB: string;
}) {
  if (diffData.isLoading) {
    return <Skeleton className="h-[480px]" />;
  }
  if (diffData.contentA === null || diffData.contentB === null) {
    return (
      <div className="bg-muted/40 flex h-[480px] items-center justify-center rounded-md border text-sm text-muted-foreground">
        Pick two versions from the sidebar to compare.
      </div>
    );
  }
  return (
    <VersionDiff
      contentA={diffData.contentA}
      contentB={diffData.contentB}
      labelA={labelA}
      labelB={labelB}
      className="min-h-[480px]"
    />
  );
}

