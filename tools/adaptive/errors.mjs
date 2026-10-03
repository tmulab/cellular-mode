// errors.mjs — a failure carries its exit code. The table is in README.md and in USAGE.
//
// Three codes, and the distinction between the last two is the one that matters: `USAGE` is
// "you asked for something that is not a thing", `STATE` is "what is on disk cannot be read as
// a declaration". Collapsing them would make a broken file look like a typo.
export const EXIT = {
  OK: 0,
  USAGE: 1,
  STATE: 2,
};

export class CliError extends Error {
  /** @param {string} message @param {number} [code] */
  constructor(message, code = EXIT.USAGE) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
