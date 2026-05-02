import type { Slug } from "./slug";
import type { PromptName } from "./prompt-name";

export type Prompt = {
  id: string;
  userId: string;
  name: PromptName;
  slug: Slug;
  description: string | null;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
