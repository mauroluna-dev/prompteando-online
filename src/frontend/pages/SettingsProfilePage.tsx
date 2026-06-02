import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/frontend/components/states";
import { useCurrentUser } from "@/frontend/hooks/use-current-user";
import { useGithubConnection } from "@/frontend/hooks/use-github-connection";

function initialsFor(user: { name: string | null; email: string }) {
  const source = user.name?.trim() || user.email;
  return source.slice(0, 2).toUpperCase();
}

export function SettingsProfilePage() {
  const { data: user, isLoading } = useCurrentUser();
  const { data: connection } = useGithubConnection();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Perfil
        </h1>
        <p className="text-muted-foreground text-sm">Tu identidad en prompteando.</p>
      </header>

      <section className="bg-card flex flex-col gap-5 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold">Cuenta</h2>
          <p className="text-muted-foreground text-sm">
            Tu información de cuenta.
          </p>
        </div>

        {isLoading || !user ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="text-base">
                  {initialsFor(user)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <p className="font-medium">{user.name ?? user.email}</p>
                <p className="text-muted-foreground text-xs">
                  {/* createdAt is not exposed via /api/me yet — placeholder */}
                  Te uniste hace poco
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" value={user.email} />
              <Field
                label="Usuario de GitHub"
                value={connection?.githubLogin ?? "Sin conectar"}
              />
            </div>
          </>
        )}
      </section>

      <section className="bg-card flex flex-col gap-5 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold">Tus datos</h2>
          <p className="text-muted-foreground text-sm">
            Bajate todos tus prompts y el historial completo de versiones en un
            ZIP. Disponible aun sin GitHub conectado.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-muted-foreground text-xs">
            Incluye todos los prompts y todas sus versiones. Markdown + JSON.
            Tarda unos segundos.
          </p>
          <Button asChild className="shrink-0">
            <a href="/api/export.zip" download>
              <Download className="mr-2 h-4 w-4" />
              Descargar mis datos
            </a>
          </Button>
        </div>
      </section>

      <section className="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-lg border p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex gap-3">
          <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-destructive text-lg font-semibold">
              Eliminar cuenta
            </h2>
            <p className="text-muted-foreground text-sm">
              Borra tu cuenta, tus prompts y todas las versiones de manera
              permanente. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <Button variant="destructive" disabled className="shrink-0">
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar mi cuenta
        </Button>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </Label>
      <Input readOnly value={value} className="bg-muted/40 font-mono text-sm" />
    </div>
  );
}
