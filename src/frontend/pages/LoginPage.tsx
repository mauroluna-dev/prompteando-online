import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = "/auth/signin/github";
            }}
          >
            <Github className="mr-2 h-4 w-4" />
            Continuar con GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
