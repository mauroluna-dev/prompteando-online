import type { ChatMessage, PromptType } from "@/domain/prompt";

/**
 * The shape returned by the public consumption endpoint
 * `GET /v1/prompts/:slug`. Cache stores this DTO directly. For `chat`
 * prompts, `content` is the JSON-serialized message array.
 */
export type PublicPromptDTO = {
  content: string;
  version: number;
  updatedAt: string; // ISO 8601 timestamp
  commitMessage: string | null;
  // P19 — lets a consumer discover whether the prompt is a template
  // and which `{{vars}}` it expects (for POST .../render).
  isTemplate: boolean;
  templateVars: string[];
  // P21 — "text" | "chat".
  type: PromptType;
};

/**
 * The shape returned by the template render endpoint
 * `POST /v1/prompts/:slug/render` (P19/P21). Not cached (varies per
 * call). For `text` prompts `content` is set and `messages` is null;
 * for `chat` prompts it is the inverse.
 */
export type RenderedPromptDTO = {
  type: PromptType;
  content: string | null;
  messages: ChatMessage[] | null;
  version: number;
  varsUsed: string[];
  missingVars: string[];
};
