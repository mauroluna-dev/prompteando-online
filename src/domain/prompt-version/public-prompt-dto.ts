/**
 * The shape returned by the public consumption endpoint
 * `GET /v1/prompts/:slug`. Cache stores this DTO directly.
 */
export type PublicPromptDTO = {
  content: string;
  version: number;
  updatedAt: string; // ISO 8601 timestamp
  commitMessage: string | null;
};
