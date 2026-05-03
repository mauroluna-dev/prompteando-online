import { CONSTANTS } from "./constants";
import { PromptDescriptionTooLongError } from "./prompt.errors";
import { PromptName } from "./prompt-name.vo";
import { Slug } from "./slug.vo";

export type PromptRow = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class Prompt {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private _name: PromptName,
    readonly slug: Slug,
    private _description: string | null,
    private _currentVersionId: string | null,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(
    id: string,
    userId: string,
    name: PromptName,
    slug: Slug,
    description: string | null,
    now: Date,
  ): Prompt {
    Prompt.assertDescriptionLength(description);
    return new Prompt(id, userId, name, slug, description, null, now, now);
  }

  static fromRow(row: PromptRow): Prompt {
    return new Prompt(
      row.id,
      row.userId,
      PromptName.parse(row.name),
      Slug.parse(row.slug),
      row.description,
      row.currentVersionId,
      row.createdAt,
      row.updatedAt,
    );
  }

  get name(): PromptName {
    return this._name;
  }
  get description(): string | null {
    return this._description;
  }
  get currentVersionId(): string | null {
    return this._currentVersionId;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  setCurrentVersion(versionId: string, now: Date): void {
    this._currentVersionId = versionId;
    this._updatedAt = now;
  }

  toJSON(): PromptDTO {
    return {
      id: this.id,
      userId: this.userId,
      name: this._name.value,
      slug: this.slug.value,
      description: this._description,
      currentVersionId: this._currentVersionId,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  private static assertDescriptionLength(description: string | null): void {
    if (description && description.length > CONSTANTS.MAX_DESCRIPTION_LENGTH) {
      throw new PromptDescriptionTooLongError(CONSTANTS.MAX_DESCRIPTION_LENGTH);
    }
  }
}

export type PromptDTO = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
