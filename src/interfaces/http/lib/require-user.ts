import type { CurrentUserDTO } from "@/domain/user";
import type { GetCurrentUserQuery } from "@/application/queries/get-current-user";

/**
 * HTTP-layer helper: returns the authenticated user, or a 401
 * Response that the caller should return immediately.
 */
export async function requireUser(request: Request, getCurrentUser: GetCurrentUserQuery): Promise<CurrentUserDTO | Response> {
  const user = await getCurrentUser.execute(request);
  if (!user) return new Response(null, { status: 401 });
  return user;
}
