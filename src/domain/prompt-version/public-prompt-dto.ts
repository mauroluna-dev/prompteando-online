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

/**
 * The shape returned by the template render endpoint
 * `POST /v1/prompts/:slug/render` (P19). Not cached (varies per call).
 */
export type RenderedPromptDTO = {
  content: string;
  version: number;
  varsUsed: string[];
  missingVars: string[];
};
