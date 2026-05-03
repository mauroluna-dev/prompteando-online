import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";
import { env } from "@/infrastructure/config/env";

export const handleAuth = (request: Request) => {
  // Rewrite the inbound URL so Auth.js builds callback URIs against
  // the public origin rather than inferring them from the local
  // request URL — necessary when running behind a tunnel / reverse
  // proxy whose forwarded headers we cannot fully trust.
  const inbound = new URL(request.url);
  const authUrl = new URL(env.AUTH_URL);
  inbound.protocol = authUrl.protocol;
  inbound.host = authUrl.host;
  inbound.port = authUrl.port;
  return Auth(new Request(inbound, request), authConfig);
};
