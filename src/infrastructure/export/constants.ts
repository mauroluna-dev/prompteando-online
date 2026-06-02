export const CONSTANTS = {
  /** Deflate level for entries. Fixed so archives stay deterministic. */
  DEFLATE_LEVEL: 6,
  /**
   * Entry timestamp, pinned to the ZIP spec's epoch (1980-01-01) so two
   * exports of unchanged data are byte-identical; the real export time
   * lives in `index.json`. Built from LOCAL components on purpose:
   * fflate encodes the DOS timestamp via local-time getters and throws
   * for years < 1980, so a UTC midnight would underflow to 1979 in any
   * negative-offset timezone. Local construction always encodes
   * 1980-01-01 00:00:00 regardless of the host timezone.
   */
  ENTRY_MTIME: new Date(1980, 0, 1, 0, 0, 0, 0),
  /** `Content-Disposition` filename: `<prefix><YYYY-MM-DD>.zip`. */
  FILENAME_PREFIX: "prompteando-export-",
  README_PATH: "README.md",
  INDEX_PATH: "index.json",
  PROMPTS_DIR: "prompts",
} as const;
