import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function signInWithGitHub() {
  const csrfRes = await fetch("/auth/csrf", { credentials: "same-origin" });
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/auth/signin/github";

  const tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "csrfToken";
  tokenInput.value = csrfToken;
  form.appendChild(tokenInput);

  const callbackInput = document.createElement("input");
  callbackInput.type = "hidden";
  callbackInput.name = "callbackUrl";
  callbackInput.value = "/";
  form.appendChild(callbackInput);

  document.body.appendChild(form);
  form.submit();
}

export function LoginPage() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2 text-center">
          <CardTitle className="text-2xl font-bold">promptstash</CardTitle>
          <CardDescription>
            Versionador de prompts. Iniciá sesión para empezar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => void signInWithGitHub()}>
            <Github className="mr-2 h-4 w-4" />
            Continuar con GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
