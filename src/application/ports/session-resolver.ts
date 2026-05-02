import type { CurrentUserDTO } from "@/domain/user";

export type SessionResolver = (
  request: Request,
) => Promise<{ user: CurrentUserDTO } | null>;
