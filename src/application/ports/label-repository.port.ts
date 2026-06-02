export interface LabelRepository {
  /** Upsert: points `label` at `versionId` for the prompt. */
  assign(
    promptId: string,
    label: string,
    versionId: string,
    now: Date,
  ): Promise<void>;

  /** Returns true if a row was removed. */
  remove(promptId: string, label: string): Promise<boolean>;

  findVersionIdByLabel(
    promptId: string,
    label: string,
  ): Promise<string | null>;

  listForPrompt(
    promptId: string,
  ): Promise<{ label: string; versionId: string }[]>;
}
