export interface Lock {
  /**
   * Try to acquire a distributed lock under `key` for `ttlMs`.
   * Returns a release token if acquired, or `null` if the lock is
   * currently held by someone else.
   */
  tryAcquire(key: string, ttlMs: number): Promise<string | null>;

  /**
   * Release the lock under `key`. Implementations must do a CAS
   * delete: only release if the stored value matches `token`.
   */
  release(key: string, token: string): Promise<void>;
}
