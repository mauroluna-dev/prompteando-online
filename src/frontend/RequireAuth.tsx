import type { ReactNode } from "react";
import useSWR from "swr";
import { Navigate } from "react-router";
import { fetcher } from "@/lib/fetcher";

type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires?: string;
};

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading } = useSWR<Session | null>("/auth/session", fetcher);

  if (isLoading) {
    return null;
  }

  if (!data?.user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
