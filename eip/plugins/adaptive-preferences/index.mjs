// adaptive.preferences — the declared mode, as structured data. READ-ONLY, by construction.
//
// This plugin is OPTIONAL twice over. Cellular Adaptive is optional, and loading this plugin
// is opt-in on top of that (`apps/observer/cli.mjs --adaptive`): without the flag the key does
// not exist, nothing in the Observer changes, and a call for it answers 404 NOT_FOUND — which
// a client must render as "no badge", never as an error.
//
// Four things it deliberately does NOT do:
//   it does not INFER a mode. There is no code path from activity, timing, phrasing or
//     anything else to a mode: the only source is a file the HUMAN caused to be written;
//   it does not INTERPRET what a mode means. `tired` is reported as the word `tired`, and
//     what that implies is the policy text's business and the reader's;
//   it does not WRITE. It declares `fs.read`, so the only port it is handed is
//     `readAdaptive`, over two file names; there is no write port in the composition at all;
//   it does not re-implement temporal validity. `standing` and the whole answer come from
//     `tools/adaptive/validity.mjs`, the same pure module the CLI uses, named in
//     `ADAPTIVE_PURE_IMPORTS` so that the import is an exception a reviewer can see.
//
// The clock is a PARAMETER. Expiry is the one thing here that changes without anybody doing
// anything, so the factory takes `now` and the tests pin it; the default export uses the real
// clock and is what a composition loads.
import { definePlugin } from '../../sdk/index.mjs';
import { validatePreferences } from '../../../tools/adaptive/schema.mjs';
import { effectiveMode } from '../../../tools/adaptive/validity.mjs';
import { CAPABILITIES } from './schemas.mjs';

/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('../../../tools/adaptive/types.mjs').Preferences} Preferences */

/** What the two files are called in a message to a human. The port answers text and refuses
 * every other name, so these strings are labels, never paths this plugin builds. */
export const SESSION_LABEL = '.cellular/adaptive/session.json';
export const PREFERENCES_LABEL = '.cellular/adaptive/preferences.json';

/** PURE. Parsed JSON, an absence, or a REPORT — never a silent blank. A file that cannot be
 * read as JSON is not "no declaration": those are different claims about the world.
 * @param {string | null} text @param {string} label
 * @returns {{ value: unknown, error: string | null }} */
export function parseState(text, label) {
  if (text === null) return { value: null, error: null };
  try {
    return { value: JSON.parse(text), error: null };
  } catch {
    return { value: null, error: `${label} is not valid JSON` };
  }
}

/** PURE. The preference half, validated so every consumer sees one shape. An invalid file is
 * an ERROR and not a fallback: quietly ignoring what somebody wrote is how a setting stops
 * meaning anything. Same rule, same wording, as `tools/adaptive/io.mjs`.
 * @param {string | null} text @returns {{ value: Preferences | null, error: string | null }} */
export function readPreferences(text) {
  const raw = parseState(text, PREFERENCES_LABEL);
  if (raw.error !== null) return { value: null, error: raw.error };
  if (raw.value === null) return { value: null, error: null };
  const parsed = validatePreferences(raw.value);
  if (parsed.ok) return { value: parsed.value, error: null };
  const first = parsed.errors[0];
  const where = first ? ` (${first.path === '' ? 'file' : first.path}: ${first.message})` : '';
  return { value: null, error: `${PREFERENCES_LABEL} is not a valid preference file${where}` };
}

/**
 * The manifest, built around ONE clock.
 * @param {{ now?: () => string }} [options] `now` answers an ISO 8601 instant
 */
export function createAdaptivePreferencesPlugin({ now = () => new Date().toISOString() } = {}) {
  if (typeof now !== 'function') {
    throw new TypeError('adaptive.preferences needs a clock that answers an ISO 8601 instant');
  }
  return definePlugin({
    name: 'adaptive.preferences',
    version: '1.0.0',
    sdk: '1',
    description: 'Reports the mode the human declared in .cellular/adaptive/ and whether that'
      + ' declaration still stands. Read-only, never inferred, never interpreted: the five'
      + ' standings are the same ones the adaptive CLI reports, from the same pure module.',
    // No inject. This plugin knows nothing about the observer, and no observer.* plugin knows
    // it exists: either side can be absent and the other is unchanged.
    permissions: ['fs.read'],
    config: {
      type: 'object', properties: {}, required: [], additionalProperties: false,
    },
    capabilities: CAPABILITIES,
    /** @param {PluginContext} ctx */
    apply(ctx) {
      // The port is checked HERE, at load: a reader that accepts work and answers from
      // nothing is worse than one that refuses to exist. An undeclared port is INVISIBLE,
      // so `typeof` is the only honest test.
      const readAdaptive = ctx.ports.readAdaptive;
      if (typeof readAdaptive !== 'function') {
        throw new Error('port "readAdaptive" (permission fs.read) is mandatory for adaptive.preferences');
      }
      /** @type {(name: string) => Promise<string | null>} */
      const read = async (name) => {
        const text = await readAdaptive(name);
        return typeof text === 'string' ? text : null;
      };

      return {
        current: async () => {
          // The preference file decides whether anything applies at all, so it is read
          // first and an unusable one is reported INSTEAD of a mode — never around it.
          const preferences = readPreferences(await read('preferences.json'));
          if (preferences.error !== null) {
            return effectiveMode(null, now(), null, preferences.error);
          }
          const session = parseState(await read('session.json'), SESSION_LABEL);
          // Read fresh on every call: a declaration expires while nobody is looking, and a
          // cached "active" is the one answer this capability must never give.
          return effectiveMode(session.value, now(), preferences.value, session.error);
        },
        /** Diagnostic: what the outside world actually looks like from in here. A port the
         * plugin did not declare is INVISIBLE, and this is how a test sees that. */
        portNames: () => Object.keys(ctx.ports).sort(),
      };
    },
  });
}

export default createAdaptivePreferencesPlugin();
