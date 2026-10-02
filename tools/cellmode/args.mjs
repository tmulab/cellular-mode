// args.mjs — tiny option parser. `--key value`, `--key=value`, boolean flags.
// Bad input is a usage error (exit 1), never a silent default.
import { CliError, EXIT } from './errors.mjs';

/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */

export const BOOLEAN_OPTIONS = new Set(['confirm']);

/** @param {string[]} argv @returns {ParsedArgs} */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const options = {};
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue; // unreachable while `i < argv.length`, and said so
    if (token === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const eq = token.indexOf('=');
    const key = eq > 0 ? token.slice(2, eq) : token.slice(2);
    if (key === '') throw new CliError(`bad option: ${token}`, EXIT.USAGE);
    if (eq > 0) { options[key] = token.slice(eq + 1); continue; }
    if (BOOLEAN_OPTIONS.has(key)) { options[key] = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(`option --${key} needs a value`, EXIT.USAGE);
    }
    options[key] = value;
    i += 1;
  }
  return { positional, options };
}

/** @param {Record<string, unknown>} options @param {string[]} allowed @param {string} command */
export function assertAllowed(options, allowed, command) {
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) {
      throw new CliError(`unknown option --${key} for \`${command}\``, EXIT.USAGE);
    }
  }
}

/** @param {ReadonlyArray<string>} positional @param {string} command */
export function assertNoPositional(positional, command) {
  if (positional.length) {
    throw new CliError(`\`${command}\` takes no positional arguments`, EXIT.USAGE);
  }
}

/** @param {Record<string, unknown>} options @param {string} key @param {string} command
 * @returns {string} */
export function requireOption(options, key, command) {
  const value = options[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`\`${command}\` requires a non-empty --${key}`, EXIT.USAGE);
  }
  return value.trim();
}

/** @param {ReadonlyArray<string>} positional @param {string} command @returns {string} */
export function requireName(positional, command) {
  const name = positional.join(' ').trim();
  if (name === '') throw new CliError(`\`${command}\` requires a cell name`, EXIT.USAGE);
  return name;
}
