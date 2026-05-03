import type { User } from "@/domain/user";

export type SessionResolver = (
  request: Request,
) => Promise<{ user: User } | null>;
