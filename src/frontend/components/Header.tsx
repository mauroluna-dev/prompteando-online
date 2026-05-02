import { UserMenu } from "./UserMenu";

export function Header() {
  return (
    <header className="border-border bg-background sticky top-0 z-10 flex w-full items-center justify-between border-b px-6 py-3">
      <span className="text-lg font-semibold tracking-tight">promptstash</span>
      <UserMenu />
    </header>
  );
}
