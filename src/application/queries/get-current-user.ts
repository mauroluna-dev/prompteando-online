import type { CurrentUserDTO } from "@/domain/user";
import type { SessionResolver } from "@/application/ports/session-resolver";

export class GetCurrentUserQuery {
  constructor(private readonly resolveSession: SessionResolver) {}

  async execute(request: Request): Promise<CurrentUserDTO | null> {
    const session = await this.resolveSession(request);
    return session?.user ?? null;
  }
}
