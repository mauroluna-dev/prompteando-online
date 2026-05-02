import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePrompts } from "@/frontend/hooks/use-prompts";

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PromptsListPage() {
  const { data: prompts, isLoading } = usePrompts();

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }

  if (!prompts || prompts.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>No prompts yet</CardTitle>
            <CardDescription>
              Create your first prompt to start versioning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/prompts/new">
                <Plus className="mr-2 h-4 w-4" />
                Create your first prompt
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
        <Button asChild>
          <Link to="/prompts/new">
            <Plus className="mr-2 h-4 w-4" />
            New prompt
          </Link>
        </Button>
      </div>

      <ul className="divide-border divide-y rounded-lg border">
        {prompts.map((p) => (
          <li key={p.id}>
            <Link
              to={`/prompts/${p.slug}`}
              className="hover:bg-muted/50 flex items-center justify-between p-4 transition-colors"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{p.name}</span>
                <code className="text-muted-foreground text-xs">{p.slug}</code>
              </div>
              <span className="text-muted-foreground text-xs">
                {formatDate(p.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
