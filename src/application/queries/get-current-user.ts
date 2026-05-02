import type { CurrentUserDTO } from "@/domain/user";
import type { SessionResolver } from "@/application/ports/session-resolver";

export type GetCurrentUser = (request: Request) => Promise<CurrentUserDTO | null>;

export const makeGetCurrentUser =
  (resolveSession: SessionResolver): GetCurrentUser =>
  async (request) => {
    const session = await resolveSession(request);
    return session?.user ?? null;
  };
