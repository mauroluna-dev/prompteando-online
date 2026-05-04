import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./UserMenu";

export function AppShell() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function AppHeader() {
  const { pathname } = useLocation();
  // Settings tab covers anything under /settings/* EXCEPT /settings/api-keys
  // (which has its own top-level tab).
  const settingsActive =
    pathname.startsWith("/settings/") && !pathname.startsWith("/settings/api-keys");

  return (
    <header className="bg-card sticky top-0 z-10 flex h-14 w-full items-center justify-between border-b px-6">
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="font-display text-base font-semibold tracking-tight"
        >
          promptstash
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <TabLink to="/" end>
            Prompts
          </TabLink>
          <TabLink to="/settings/api-keys">API Keys</TabLink>
          <TabLink to="/settings/profile" forceActive={settingsActive}>
            Settings
          </TabLink>
        </nav>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}

function TabLink({
  to,
  end,
  forceActive,
  children,
}: {
  to: string;
  end?: boolean;
  forceActive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "rounded-md px-3 py-1.5 transition-colors",
          isActive || forceActive
            ? "bg-muted text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
