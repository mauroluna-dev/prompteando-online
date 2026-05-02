import type { ApiKeyName } from "./api-key-name";

export type ApiKey = {
  id: string;
  userId: string;
  name: ApiKeyName;
  prefix: string;
  keyHash: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/**
 * The HTTP-safe projection of an ApiKey: omits `keyHash` so the
 * frontend never receives the secret material.
 */
export type ApiKeyView = Omit<ApiKey, "keyHash">;

export function toApiKeyView(apiKey: ApiKey): ApiKeyView {
  const { keyHash: _keyHash, ...view } = apiKey;
  return view;
}
