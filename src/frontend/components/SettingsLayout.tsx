import { NavLink, Outlet } from "react-router";
import { CreditCard, KeyRound, Plug, User } from "lucide-react";

const SECTIONS: {
  label: string;
  to: string;
  icon: typeof User;
  badge?: string;
}[] = [
  { label: "Profile", to: "/settings/profile", icon: User },
  { label: "API Keys", to: "/settings/api-keys", icon: KeyRound },
  { label: "Integrations", to: "/settings/integrations", icon: Plug },
  { label: "Billing", to: "/settings/billing", icon: CreditCard, badge: "soon" },
];

export function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-8">
      <aside className="hidden w-56 shrink-0 sm:block">
        <p className="text-muted-foreground mb-3 px-3 text-xs font-medium uppercase tracking-wide">
          Settings
        </p>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const disabled = Boolean(s.badge);
            const className = ({ isActive }: { isActive: boolean }) =>
              [
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                disabled
                  ? "text-muted-foreground/60 cursor-not-allowed"
                  : isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              ].join(" ");

            if (disabled) {
              return (
                <span key={s.to} className={className({ isActive: false })}>
                  <Icon className="h-4 w-4" />
                  {s.label}
                  <span className="bg-muted text-muted-foreground ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase">
                    {s.badge}
                  </span>
                </span>
              );
            }
            return (
              <NavLink key={s.to} to={s.to} className={className}>
                <Icon className="h-4 w-4" />
                {s.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
