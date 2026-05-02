import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";
import type { CurrentUserDTO } from "@/domain/user";

type Session = { user: CurrentUserDTO; expires: string };

export async function getSession(request: Request): Promise<Session | null> {
  const url = new URL(request.url);
  url.pathname = "/auth/session";
  const sessionRequest = new Request(url, { headers: request.headers });

  const response = await Auth(sessionRequest, authConfig);
  if (!response.ok) return null;

  const json = (await response.json()) as Partial<Session> | null;
  if (!json?.user || !("id" in json.user)) return null;
  return json as Session;
}
