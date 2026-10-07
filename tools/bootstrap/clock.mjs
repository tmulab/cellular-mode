// clock.mjs — the one ISO-8601 instant the install manifest records.
//
// `CELLMODE_NOW` is honoured, exactly as tools/cellmode and tools/prompt-builder honour it, so a
// test and a documented example produce the same bytes twice. A record whose only varying field is
// a timestamp is a record nobody can diff.
import { now } from '../cellmode/clock.mjs';

/** The instant to record. @param {NodeJS.ProcessEnv} [env] @returns {string} */
export function instantOf(env = process.env) {
  const fixed = env.CELLMODE_NOW;
  if (fixed === undefined || String(fixed).trim() === '') return new Date().toISOString();
  return `${now(env).replace(' ', 'T')}:00.000Z`;
}
