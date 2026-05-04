import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, History, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";
import { usePrompt } from "@/frontend/hooks/use-prompts";
import { useVersions } from "@/frontend/hooks/use-versions";
import { deletePrompt } from "@/frontend/lib/api/prompts";
import { restoreVersion, saveVersion } from "@/frontend/lib/api/versions";
import { VersionHistory } from "@/frontend/components/VersionHistory";

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

  const [viewingNumber, setViewingNumber] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noOpMessage, setNoOpMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const noOpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentVersion = prompt
    ? (versions.find((v) => v.id === prompt.currentVersionId) ?? null)
    : null;
  const viewingVersion =
    viewingNumber !== null
      ? (versions.find((v) => v.versionNumber === viewingNumber) ?? null)
      : null;

  // Keep editor content in sync with current version when not viewing.
  useEffect(() => {
    if (viewingNumber === null) {
      setContent(currentVersion?.content ?? "");
    }
  }, [currentVersion?.id, viewingNumber]);

  // Cleanup any pending no-op timer on unmount.
  useEffect(() => {
    return () => {
      if (noOpTimer.current) clearTimeout(noOpTimer.current);
    };
  }, []);

  if (promptLoading || versionsLoading) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }

  if (!prompt) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Card className="text-center">
          <CardHeader>
            <CardTitle>Prompt not found</CardTitle>
            <CardDescription>
              It may have been deleted or never existed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/prompts">Back to list</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = versions.length === 0;
  const isViewing = viewingNumber !== null && viewingVersion !== null;

  const handleSave = async () => {
    if (!slug) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveVersion(slug, {
        content,
        commitMessage: commitMessage.trim() || undefined,
      });
      if (result.isNoOp) {
        setNoOpMessage(true);
        if (noOpTimer.current) clearTimeout(noOpTimer.current);
        noOpTimer.current = setTimeout(() => setNoOpMessage(false), 3000);
      } else {
        setCommitMessage("");
        await mutate(`/api/prompts/${slug}/versions`);
        await mutate(`/api/prompts/${slug}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!slug || viewingNumber === null) return;
    setRestoring(true);
    try {
      await restoreVersion(slug, viewingNumber);
      setViewingNumber(null);
      await mutate(`/api/prompts/${slug}/versions`);
      await mutate(`/api/prompts/${slug}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to restore");
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
      navigate("/prompts", { replace: true });
    } catch {
      setDeleting(false);
    }
  };

  const editorDirty = !isEmpty && content !== (currentVersion?.content ?? "");
  const saveDisabled = saving || (!isEmpty && !editorDirty);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="self-start">
        <Link to="/prompts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{prompt.name}</h1>
        <code className="text-muted-foreground text-sm">{prompt.slug}</code>
        <p className="text-muted-foreground text-xs">
          Created {formatDate(prompt.createdAt)}
        </p>
        {prompt.description ? (
          <p className="text-sm">{prompt.description}</p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          {isViewing ? (
            <Card>
              <CardHeader className="gap-1 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" />
                  Viewing v{viewingVersion.versionNumber}
                </CardTitle>
                <CardDescription>
                  {viewingVersion.commitMessage ?? "No commit message."}{" "}
                  · {formatDate(viewingVersion.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Textarea
                  readOnly
                  value={viewingVersion.content}
                  className="min-h-[400px] font-mono text-sm"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setViewingNumber(null)}
                  >
                    Back to current
                  </Button>
                  <Button
                    onClick={() => void handleRestore()}
                    disabled={restoring}
                  >
                    {restoring ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Restore this version
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="gap-1 pb-3">
                <CardTitle className="text-base">
                  {isEmpty ? "Create first version" : "Editor"}
                </CardTitle>
                <CardDescription>
                  {isEmpty
                    ? "This prompt has no content yet. Write the first version below."
                    : "Edit the prompt and save to create a new version."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your prompt here…"
                  className="min-h-[400px] font-mono text-sm"
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="commit-message">Commit message (optional)</Label>
                  <Input
                    id="commit-message"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="What changed?"
                    maxLength={200}
                  />
                </div>
                {saveError ? (
                  <p className="text-destructive text-sm">{saveError}</p>
                ) : null}
                {noOpMessage ? (
                  <p className="text-muted-foreground text-sm">
                    No changes to save.
                  </p>
                ) : null}
                <div className="flex items-center justify-end">
                  <Button
                    onClick={() => void handleSave()}
                    disabled={saveDisabled}
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

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
          />
        </aside>
      </div>

      <div className="border-destructive/40 flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Delete this prompt</p>
          <p className="text-muted-foreground text-xs">
            Removes the prompt and all its versions. Cannot be undone.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}
