import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePrompt } from "@/frontend/hooks/use-prompts";
import { deletePrompt } from "@/frontend/lib/api/prompts";

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
  const { data: prompt, isLoading } = usePrompt(slug);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  if (isLoading) {
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
              <Link to="/">Back to list</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${prompt.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deletePrompt(prompt.slug);
      await mutate("/api/prompts");
      navigate("/", { replace: true });
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <Button asChild variant="ghost" className="self-start">
        <Link to="/">
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
      </header>

      {prompt.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{prompt.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
          <CardDescription>
            The prompt body lives in versions — editor coming in the next
            phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border bg-muted/30 text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            Editor coming in next phase.
          </div>
          <div className="mt-4 flex justify-end">
            <Button disabled variant="outline">
              Edit content
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="border-destructive/40 flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Delete this prompt</p>
          <p className="text-muted-foreground text-xs">
            Removes the prompt permanently. Cannot be undone.
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
