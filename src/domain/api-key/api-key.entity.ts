import { ApiKeyAlreadyRevokedError } from "./api-key.errors";
import { ApiKeyName } from "./api-key-name.vo";

export type ApiKeyRow = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type ApiKeyView = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export class ApiKey {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly name: ApiKeyName,
    readonly prefix: string,
    readonly keyHash: string,
    private _lastUsedAt: Date | null,
    private _revokedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  static create(
    id: string,
    userId: string,
    name: ApiKeyName,
    prefix: string,
    keyHash: string,
    now: Date,
  ): ApiKey {
    return new ApiKey(id, userId, name, prefix, keyHash, null, null, now);
  }

  static fromRow(row: ApiKeyRow): ApiKey {
    return new ApiKey(
      row.id,
      row.userId,
      ApiKeyName.parse(row.name),
      row.prefix,
      row.keyHash,
      row.lastUsedAt,
      row.revokedAt,
      row.createdAt,
    );
  }

  get lastUsedAt(): Date | null {
    return this._lastUsedAt;
  }
  get revokedAt(): Date | null {
    return this._revokedAt;
  }
  get isRevoked(): boolean {
    return this._revokedAt !== null;
  }

  revoke(now: Date): void {
    if (this.isRevoked) throw new ApiKeyAlreadyRevokedError(this.id);
    this._revokedAt = now;
  }

  markUsed(now: Date): void {
    this._lastUsedAt = now;
  }

  toView(): ApiKeyView {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name.value,
      prefix: this.prefix,
      lastUsedAt: this._lastUsedAt,
      revokedAt: this._revokedAt,
      createdAt: this.createdAt,
    };
  }
}
