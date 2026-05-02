import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";
import type { CurrentUserDTO } from "@/domain/user";

type Session = { user: CurrentUserDTO; expires: string };

const AUTH_URL = process.env.AUTH_URL;

export async function getSession(request: Request): Promise<Session | null> {
  const url = new URL(request.url);
  url.pathname = "/auth/session";
  // Mirror the handler's URL rewrite (P3): when behind a tunnel, the
  // session cookies use `__Secure-` / `__Host-` prefixes that Auth.js
  // only accepts over https. The Request URL we build for Auth(..)
  // must reflect the public origin so the cookie is honored.
  if (AUTH_URL) {
    const authUrl = new URL(AUTH_URL);
    url.protocol = authUrl.protocol;
    url.host = authUrl.host;
    url.port = authUrl.port;
  }

  const sessionRequest = new Request(url, { headers: request.headers });
  const response = await Auth(sessionRequest, authConfig);
  if (!response.ok) return null;

  const text = await response.text();
  if (!text) return null;
  const json = JSON.parse(text) as
    | { expires: string; user?: Record<string, unknown> }
    | null;
  const u = json?.user;
  if (!u || typeof u.id !== "string" || typeof u.email !== "string") {
    return null;
  }

  // Whitelist DTO fields. Avoid leaking Auth.js extras (e.g.
  // emailVerified) to the public /api/me response.
  return {
    expires: json.expires,
    user: {
      id: u.id,
      email: u.email,
      name: typeof u.name === "string" ? u.name : null,
      image: typeof u.image === "string" ? u.image : null,
    },
  };
}
