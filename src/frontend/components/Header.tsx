import { Link, NavLink } from "react-router";
import { UserMenu } from "./UserMenu";

export function Header() {
  return (
    <header className="border-border bg-background sticky top-0 z-10 flex w-full items-center justify-between gap-4 border-b px-6 py-3">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          promptstash
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Prompts
          </NavLink>
          <NavLink
            to="/settings/api-keys"
            className={({ isActive }) =>
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            API Keys
          </NavLink>
          <NavLink
            to="/settings/integrations"
            className={({ isActive }) =>
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Integrations
          </NavLink>
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
