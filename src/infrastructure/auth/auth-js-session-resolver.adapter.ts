import type { SessionResolver } from "@/application/ports/session-resolver.port";
import { getSession } from "./get-session";

export const authJsSessionResolver: SessionResolver = async (request) => {
  const session = await getSession(request);
  return session ? { user: session.user } : null;
};
