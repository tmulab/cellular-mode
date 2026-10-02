// errors.mjs — a failure carries its exit code. See README for the table.
export const EXIT = {
  OK: 0,
  USAGE: 1,
  INTEGRITY: 2,
  ACTIVE_CELL: 3,
  AMBIGUOUS: 4,
  NEEDS_CONFIRMATION: 5,
};

export class CliError extends Error {
  /** @param {string} message @param {number} [code] */
  constructor(message, code = EXIT.USAGE) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
