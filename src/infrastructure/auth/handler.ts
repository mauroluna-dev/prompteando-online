import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";

const AUTH_URL = process.env.AUTH_URL;

export const handleAuth = (request: Request) => {
  // When AUTH_URL is set (typical when running behind a tunnel /
  // reverse proxy whose forwarded headers we cannot fully trust),
  // rewrite the inbound URL so Auth.js builds callback URIs against
  // the public origin rather than inferring them from the local
  // request URL.
  if (AUTH_URL) {
    const inbound = new URL(request.url);
    const authUrl = new URL(AUTH_URL);
    inbound.protocol = authUrl.protocol;
    inbound.host = authUrl.host;
    inbound.port = authUrl.port;
    return Auth(new Request(inbound, request), authConfig);
  }
  return Auth(request, authConfig);
};
