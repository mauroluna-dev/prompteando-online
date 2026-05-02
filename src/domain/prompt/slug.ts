import { InvalidSlugError } from "./errors";

declare const __brand: unique symbol;
export type Slug = string & { readonly [__brand]: "Slug" };

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const MAX_LENGTH = 60;

export function parseSlug(input: string): Slug {
  if (!SLUG_REGEX.test(input)) throw new InvalidSlugError(input);
  return input as Slug;
}

export function generateSlug(name: string): Slug {
  const cleaned = name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, "");

  return parseSlug(cleaned || "prompt");
}
