import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CONSTANTS,
  InvalidOAuthStateError,
} from "@/domain/github-connection";
import { env } from "@/infrastructure/config/env";

function hmac(input: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(input)
    .digest("base64url");
}

export function signOAuthState(userId: string): string {
  const expiresAt = Date.now() + CONSTANTS.OAUTH_STATE_TTL_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyOAuthState(state: string): string {
  const parts = state.split(".");
  if (parts.length !== 3) {
    throw new InvalidOAuthStateError("malformed");
  }
  const [userId, expiresStr, sig] = parts as [string, string, string];

  const expected = hmac(`${userId}.${expiresStr}`);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidOAuthStateError("bad signature");
  }

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    throw new InvalidOAuthStateError("expired");
  }

  return userId;
}
