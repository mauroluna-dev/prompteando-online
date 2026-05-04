import { Link, NavLink, Outlet } from "react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./UserMenu";

const NAV_ITEMS: { label: string; to: string; end?: boolean }[] = [
  { label: "Prompts", to: "/", end: true },
  { label: "API Keys", to: "/settings/api-keys" },
  { label: "Settings", to: "/settings/profile" },
];

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
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "rounded-md px-3 py-1.5 transition-colors",
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
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
