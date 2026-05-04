import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useCurrentUser } from "@/frontend/hooks/use-current-user";

/**
 * For routes that should ONLY be visible to anonymous users (landing).
 * Logged-in users get redirected to `to` instead.
 */
export function RedirectIfAuthed({
  children,
  to,
}: {
  children: ReactNode;
  to: string;
}) {
  const { data, isLoading } = useCurrentUser();

  if (isLoading) return null;
  if (data) return <Navigate to={to} replace />;
  return <>{children}</>;
}
