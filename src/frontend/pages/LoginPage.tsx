import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/frontend/hooks/use-current-user";
import { signInWith } from "@/frontend/lib/auth-actions";

type Provider = "github" | "google";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Provider | null>(null);

  useEffect(() => {
    if (me) navigate("/", { replace: true });
  }, [me, navigate]);

  const handleClick = (provider: Provider) => {
    setPending(provider);
    void signInWith(provider);
  };

  const isPending = pending !== null;

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight">
              Welcome to promptstash
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Versioná tus prompts. Nunca pierdas la última que andaba.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-8 shadow-sm">
            <Button
              size="xl"
              className="w-full"
              disabled={isPending}
              onClick={() => handleClick("github")}
            >
              {pending === "github" ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Github className="mr-2 h-5 w-5" />
              )}
              Continuar con GitHub
            </Button>
            <Button
              size="xl"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() => handleClick("google")}
            >
              {pending === "google" ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <GoogleIcon className="mr-2 h-5 w-5" />
              )}
              Continuar con Google
            </Button>
            <div className="my-1 h-px bg-border" />
            <p className="text-center text-xs leading-snug text-muted-foreground">
              Solo leemos los repos que vos crees con promptstash. Auditá
              nuestro código en GitHub si querés verificarlo.
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            ¿Sin cuenta de GitHub o Google? Próximamente más opciones.
          </p>
        </div>
      </main>
    </div>
  );
}

function Nav() {
  return (
    <header className="flex h-16 w-full items-center justify-between border-b bg-card px-8">
      <span className="font-display text-lg font-semibold tracking-tight">
        promptstash
      </span>
      <nav className="flex items-center gap-6">
        <a
          href="https://github.com/mauroluna-dev/promptstash"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
