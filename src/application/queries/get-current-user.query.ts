import type { SessionResolver } from "@/application/ports/session-resolver.port";
import type { User } from "@/domain/user";

export class GetCurrentUserQuery {
  constructor(private readonly resolveSession: SessionResolver) {}

  async execute(request: Request): Promise<User | null> {
    const session = await this.resolveSession(request);
    return session?.user ?? null;
  }
}
