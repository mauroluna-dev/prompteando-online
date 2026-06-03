import { Link } from "react-router";
import {
  ArrowRight,
  Code2,
  Download,
  GitBranch,
  Github,
  History,
  Lock,
  Plug,
  Rocket,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <ZeroFriction />
        <YourHistoryYourRepo />
        <TechStack />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

function LandingNav() {
  return (
    <header className="bg-card/60 sticky top-0 z-10 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link
          to="/"
          className="font-display text-base font-semibold tracking-tight"
        >
          prompteando
        </Link>
        <nav className="flex items-center gap-1">
          <a
            href="https://github.com/mauroluna-dev/prompteito"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            GitHub
          </a>
          <Button asChild size="sm">
            <Link to="/login">
              Iniciar sesión
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 pt-20 pb-12 text-center sm:pt-28">
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide">
        <span className="bg-success-fg h-1.5 w-1.5 rounded-full" />
        v1.0 — gratis para siempre · open source
      </span>
      <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        Versioná tus prompts.
        <br />
        <span className="text-muted-foreground">
          Nunca pierdas la última que andaba.
        </span>
      </h1>
      <p className="text-muted-foreground max-w-2xl text-base leading-relaxed sm:text-lg">
        Cada vez que guardás queda una versión que no se pisa. Usás cada prompt
        desde n8n, Zapier o tu app con una sola dirección web. Y si conectás
        GitHub, todo queda copiado en tu cuenta.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="xl">
          <Link to="/login">
            <Github className="mr-2 h-5 w-5" />
            Crear cuenta
          </Link>
        </Button>
        <Button asChild size="xl" variant="outline">
          <a href="#how-it-works">Ver cómo funciona</a>
        </Button>
      </div>

      <HeroScreenshot />
    </section>
  );
}

function HeroScreenshot() {
  return (
    <div className="bg-foreground/95 mt-8 w-full overflow-hidden rounded-xl border shadow-xl ring-1 ring-black/5">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-amber-500/70" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
        <span className="text-muted-foreground/60 ml-3 font-mono text-xs">
          bienvenida-onboarding.md · v3 → v4
        </span>
      </div>
      <div className="grid gap-px bg-white/5 sm:grid-cols-2">
        <pre className="bg-foreground/95 overflow-x-auto p-5 font-mono text-xs leading-relaxed text-white/80">
          <code>
            {`---
prompt_name: Bienvenida Onboarding
slug: bienvenida-onboarding
version: 3
---

Sos un asistente de onboarding
amable para {{producto}}.

`}
            <span className="bg-diff-del-bg/20 text-diff-del-bg block">
              - Mantené las respuestas en menos de 2 oraciones.
            </span>
            <span>{`Guiá al usuario por el setup
en 3 pasos.`}</span>
          </code>
        </pre>
        <pre className="bg-foreground/95 overflow-x-auto p-5 font-mono text-xs leading-relaxed text-white/80">
          <code>
            {`---
prompt_name: Bienvenida Onboarding
slug: bienvenida-onboarding
version: 4
---

Sos un asistente de onboarding
amable para {{producto}}.

`}
            <span className="bg-diff-add-bg/30 text-diff-add-bg block">
              + Respuestas de máximo 2 oraciones.
            </span>
            <span className="bg-diff-add-bg/30 text-diff-add-bg block">
              + Evitá tecnicismos. Usá emoji 👋.
            </span>
            <span>{`Guiá al usuario por el setup
en 3 pasos.`}</span>
          </code>
        </pre>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      icon: Code2,
      title: "Escribí tu prompt",
      copy: "Pegalo desde Cursor, ChatGPT o Claude. Cada vez que guardás, versiona solo.",
    },
    {
      n: "2",
      icon: Plug,
      title: "Creá tu clave de acceso",
      copy: "Una clave por herramienta. La controlás vos y la desactivás cuando quieras.",
    },
    {
      n: "3",
      icon: Rocket,
      title: "Usalo desde donde quieras",
      copy: "n8n, Zapier, Make o tu código. Con tu clave y el nombre corto traés siempre la última versión aprobada.",
    },
  ];
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-6xl px-6 py-20 text-center"
    >
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Cómo funciona
      </h2>
      <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm">
        De escribir el prompt a consumirlo en producción en menos de 5 minutos.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.n}
              className="bg-card flex flex-col items-start gap-3 rounded-lg border p-6 text-left"
            >
              <div className="flex w-full items-center justify-between">
                <span className="bg-muted flex h-9 w-9 items-center justify-center rounded-md">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-muted-foreground/60 font-mono text-xs">
                  0{s.n}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {s.copy}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ZeroFriction() {
  const features = [
    {
      icon: Lock,
      title: "Versiones inmutables",
      copy: "Una vez guardada, una versión no cambia más. Restaurar crea una versión nueva, nunca pisa una vieja.",
    },
    {
      icon: Zap,
      title: "Sin ataduras",
      copy: "Conectás con cualquier herramienta usando una dirección web estándar. Sin librerías que instalar, sin quedar atrapado en una plataforma.",
    },
    {
      icon: GitBranch,
      title: "Copia en tu GitHub",
      copy: "Cada vez que guardás, dejamos una copia en tu cuenta de GitHub. Si cerramos mañana, te quedás con todo.",
    },
    {
      icon: Download,
      title: "Te lo llevás en un click",
      copy: "Aunque no uses GitHub, podés descargar tu historial completo en ZIP o JSON cuando quieras.",
    },
  ];
  return (
    <section className="bg-muted/30 border-y">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Pensado para cero fricción
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm">
          Lo justo y necesario. Sin funciones que todavía no necesitás.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="bg-card flex flex-col items-start gap-3 rounded-lg border p-5 text-left"
              >
                <span className="bg-muted flex h-8 w-8 items-center justify-center rounded-md">
                  <Icon className="text-muted-foreground h-4 w-4" />
                </span>
                <h3 className="font-display text-base font-semibold">
                  {f.title}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {f.copy}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function YourHistoryYourRepo() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide">
            <Github className="h-3.5 w-3.5" />
            Tu historial, tu repo
          </span>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            El versionado vive en{" "}
            <span className="text-muted-foreground">tu cuenta de GitHub</span>.
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Si conectás GitHub, creamos una carpeta privada{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              prompteando-&lt;tu-usuario&gt;
            </code>
            . Cada vez que guardás, dejamos una copia con el contenido y los
            datos de la versión (número, nota y fecha). Sos el único que puede
            leerla. Si cerramos mañana, te quedás con todo el historial.
          </p>
          <div className="flex flex-col gap-2 text-sm">
            <ChecklistItem>Historial ordenado por fecha y a tu nombre</ChecklistItem>
            <ChecklistItem>Copiamos tu historial aunque conectes más tarde</ChecklistItem>
            <ChecklistItem>Desconectás cuando quieras, en un click</ChecklistItem>
          </div>
        </div>

        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4" />
              <span className="font-mono text-xs">octocat/prompteando-octocat</span>
            </div>
            <span className="bg-success-bg text-success-fg rounded-full px-2 py-0.5 font-mono text-[10px]">
              Privado
            </span>
          </div>
          <ul className="divide-y text-sm">
            {[
              {
                msg: "Bienvenida Onboarding v4: agrego paso de reinicio",
                t: "hace 2 horas",
                sha: "8a3f12a",
              },
              {
                msg: "Bienvenida Onboarding v3: restaurada desde v1",
                t: "hace 1 día",
                sha: "ce4ab90",
              },
              {
                msg: "Descripción de producto v7: párrafos más concisos",
                t: "hace 1 día",
                sha: "c041afc",
              },
              {
                msg: "Descripción de producto v6: versión inicial",
                t: "hace 3 días",
                sha: "abade71",
              },
            ].map((c) => (
              <li
                key={c.sha}
                className="hover:bg-muted/30 flex items-center justify-between px-4 py-3 transition-colors"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{c.msg}</span>
                  <span className="text-muted-foreground text-xs">{c.t}</span>
                </div>
                <code className="text-muted-foreground bg-muted/50 ml-3 shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]">
                  {c.sha}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-success-bg text-success-fg flex h-5 w-5 items-center justify-center rounded-full">
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}

function TechStack() {
  const stack = ["Bun", "Postgres", "Redis", "Drizzle", "GitHub", "React 19"];
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12 text-center">
      <p className="text-muted-foreground mb-5 font-mono text-xs uppercase tracking-wide">
        Construido con
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {stack.map((tech) => (
          <span
            key={tech}
            className="font-display text-muted-foreground text-lg font-medium"
          >
            {tech}
          </span>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center">
        <h2 className="font-display max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Empezá a versionar tus prompts hoy.
        </h2>
        <p className="text-background/70 max-w-xl text-sm leading-relaxed">
          Gratis y open source, para siempre. Sin planes pagos, sin tarjeta, sin
          letra chica. Entrá con GitHub o Google y en menos de 5 minutos tenés
          tu primer prompt funcionando.
        </p>
        <Button
          asChild
          size="xl"
          className="bg-background text-foreground hover:bg-background/90"
        >
          <Link to="/login">
            Crear cuenta
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-card border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold">prompteando.online</span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <History className="h-3 w-3" />
            v1.0
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-5 text-xs">
          <a
            href="https://github.com/mauroluna-dev/prompteito"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <Link to="/login" className="hover:text-foreground transition-colors">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </footer>
  );
}
