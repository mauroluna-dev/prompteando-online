import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useCurrentUser } from "@/frontend/hooks/use-current-user";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading } = useCurrentUser();

  if (isLoading) {
    return null;
  }

  if (!data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
