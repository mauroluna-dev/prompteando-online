import { CONSTANTS } from "./constants";
import {
  InvalidChatContentError,
  InvalidPromptTypeError,
  TooManyTemplateVariablesError,
} from "./prompt.errors";
import { extractTemplateVariables } from "./template-parser";
import { renderTemplate } from "./template-renderer";

export type PromptType = (typeof CONSTANTS.PROMPT_TYPES)[number];
export type ChatRole = (typeof CONSTANTS.CHAT_ROLES)[number];

/**
 * A chat message. Regular roles carry `content`; a `placeholder` carries
 * a `name` and is replaced at render time by a provided list of messages.
 */
export type ChatMessage = {
  role: ChatRole;
  content?: string;
  name?: string;
};

export function parsePromptType(value: string): PromptType {
  if ((CONSTANTS.PROMPT_TYPES as readonly string[]).includes(value)) {
    return value as PromptType;
  }
  throw new InvalidPromptTypeError(value);
}

const ROLES = CONSTANTS.CHAT_ROLES as readonly string[];

function assertMessage(m: unknown, i: number): ChatMessage {
  if (typeof m !== "object" || m === null) {
    throw new InvalidChatContentError(`message ${i} is not an object`);
  }
  const msg = m as Record<string, unknown>;
  if (typeof msg.role !== "string" || !ROLES.includes(msg.role)) {
    throw new InvalidChatContentError(`message ${i} has an invalid role`);
  }
  if (msg.role === "placeholder") {
    if (typeof msg.name !== "string" || msg.name.length === 0) {
      throw new InvalidChatContentError(`placeholder ${i} needs a name`);
    }
    return { role: "placeholder", name: msg.name };
  }
  if (typeof msg.content !== "string") {
    throw new InvalidChatContentError(`message ${i} needs string content`);
  }
  return { role: msg.role as ChatRole, content: msg.content };
}

/** Parses the JSON-serialized message array stored in `content`. */
export function parseChatMessages(serialized: string): ChatMessage[] {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new InvalidChatContentError("not valid JSON");
  }
  if (!Array.isArray(raw)) {
    throw new InvalidChatContentError("expected an array of messages");
  }
  if (raw.length > CONSTANTS.MAX_CHAT_MESSAGES) {
    throw new InvalidChatContentError(
      `exceeds ${CONSTANTS.MAX_CHAT_MESSAGES} messages`,
    );
  }
  return raw.map(assertMessage);
}

export function serializeChatMessages(messages: ChatMessage[]): string {
  return JSON.stringify(messages);
}

/** Extracts variables for either prompt type from its `content`. */
export function extractVariablesForType(
  content: string,
  type: PromptType,
): string[] {
  return type === "chat"
    ? extractChatVariables(parseChatMessages(content))
    : extractTemplateVariables(content);
}

/** Variables referenced across all non-placeholder message contents. */
export function extractChatVariables(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of messages) {
    if (m.role === "placeholder" || !m.content) continue;
    for (const name of extractTemplateVariables(m.content)) {
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }
  }
  if (ordered.length > CONSTANTS.MAX_TEMPLATE_VARS) {
    throw new TooManyTemplateVariablesError(CONSTANTS.MAX_TEMPLATE_VARS);
  }
  return ordered;
}

export type ChatRenderResult = {
  messages: ChatMessage[];
  varsUsed: string[];
  missingVars: string[];
};

/**
 * Renders a chat prompt: substitutes `{{var}}` in each message and
 * expands `placeholder` messages with the provided message lists.
 */
export function renderChat(
  messages: ChatMessage[],
  values: Readonly<Record<string, string>>,
  placeholders: Readonly<Record<string, ChatMessage[]>> = {},
): ChatRenderResult {
  const out: ChatMessage[] = [];
  const varsUsed = new Set<string>();
  const missingVars = new Set<string>();

  for (const m of messages) {
    if (m.role === "placeholder") {
      const injected = m.name ? placeholders[m.name] : undefined;
      if (injected) out.push(...injected);
      continue;
    }
    const rendered = renderTemplate(m.content ?? "", values);
    rendered.varsUsed.forEach((v) => varsUsed.add(v));
    rendered.missingVars.forEach((v) => missingVars.add(v));
    out.push({ role: m.role, content: rendered.content });
  }

  return {
    messages: out,
    varsUsed: [...varsUsed],
    missingVars: [...missingVars],
  };
}
