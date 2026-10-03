// commands.mjs — what each CLI command does. One function per command, each total: it returns
// lines and an exit code, or throws a CliError carrying one.
//
// This is where the pure modules meet `io.mjs`. It does not read the clock, the environment or
// the argument list: `main.mjs` owns those, so every function here is exercised with explicit
// inputs. Three rules a reader should be able to check by skimming:
//   - `status` and `context` WRITE NOTHING.
//   - a state file that cannot be read stops the command with EXIT.STATE; it is never
//     overwritten to make the command succeed, because it is the human's file.
//   - a preference file is never given a mode: `toggle` writes `enabled` and nothing else new.
import { CliError, EXIT } from './errors.mjs';
import {
  STATE_REL, clear as clearState, deleteSession, readPolicyTexts, readPreferences, readSession,
  writePreferences, writeSession,
} from './io.mjs';
import { BOUNDARIES_POLICY, MODES } from './modes.mjs';
import { DEFAULT_TTL_HOURS, SCHEMA_VERSION } from './schema.mjs';
import { VOCABULARY, declare } from './transitions.mjs';
import { contextBlock, policyPathsFor } from './context.mjs';
import { effectiveMode, ttlHoursOf } from './validity.mjs';

/** @typedef {{ lines: string[], code: number }} CommandResult */

/** @type {(iso: string) => string} */
const atMinute = (iso) => iso.slice(0, 16).replace('T', ' ');

/** Reads both files and refuses to continue on an unusable preference file. The session is
 * returned WITH its read error, so the caller can report "invalid" instead of "nothing".
 * @type {(root: string, now: string) => import('./types.mjs').EffectiveMode} */
function readState(root, now) {
  const prefs = readPreferences(root);
  if (prefs.error !== null) throw new CliError(prefs.error, EXIT.STATE);
  const session = readSession(root);
  return effectiveMode(session.value, now, prefs.value, session.error);
}

/** @type {(root: string, now: string) => CommandResult} */
export function status(root, now) {
  const state = readState(root, now);
  /** @type {string[]} */
  const lines = [];
  if (state.notice !== null) lines.push(state.notice);
  const why = state.standing === 'active'
    ? `(declared ${atMinute(String(state.activatedAt))}, until ${atMinute(String(state.expiresAt))}, source ${state.source})`
    : (state.standing === 'disabled' ? '(adaptive is disabled)' : '(the default)');
  lines.push(`mode: ${state.mode} ${why}`);
  lines.push(`standing: ${state.standing}`);
  const policy = MODES.find((m) => m.id === state.mode)?.policyFile;
  if (state.standing === 'active' && policy !== undefined) {
    lines.push(`policy: ${BOUNDARIES_POLICY} + ${policy}`);
  }
  return { lines, code: state.standing === 'invalid' ? EXIT.STATE : EXIT.OK };
}

/** @type {(root: string, token: string | undefined, now: string, source?: string) => CommandResult} */
export function set(root, token, now, source = 'cli') {
  if (token === undefined) throw new CliError(`\`set\` requires a mode: ${VOCABULARY.join(', ')}`);
  const prefs = readPreferences(root);
  if (prefs.error !== null) throw new CliError(prefs.error, EXIT.STATE);
  const result = declare(token, { source, command: token, now, ttlHours: ttlHoursOf(prefs.value) });
  if (!result.ok) throw new CliError(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  if (result.value === null) {
    const deleted = deleteSession(root);
    return {
      lines: [`ready: nothing stored${deleted ? ` (deleted ${STATE_REL}/session.json)` : ''}`],
      code: EXIT.OK,
    };
  }
  const where = writeSession(root, result.value);
  const until = atMinute(result.value.expiresAt);
  return {
    lines: [`declared: ${result.value.mode} (source ${result.value.source}, until ${until}) -> ${where}`],
    code: EXIT.OK,
  };
}

/** @type {(root: string, enabled: boolean) => CommandResult} */
export function toggle(root, enabled) {
  const prefs = readPreferences(root);
  if (prefs.error !== null) throw new CliError(prefs.error, EXIT.STATE);
  const base = prefs.value ?? { schema: SCHEMA_VERSION, enabled: true, ttlHours: DEFAULT_TTL_HOURS };
  const where = writePreferences(root, { ...base, enabled });
  const what = enabled
    ? 'enabled: declarations are honoured again'
    : 'disabled: nothing is injected, the stored declaration is kept';
  return { lines: [`${what} (${where})`], code: EXIT.OK };
}

/** @type {(root: string) => CommandResult} */
export function clear(root) {
  const deleted = clearState(root);
  const line = deleted.length > 0 ? `cleared: ${deleted.join(', ')}` : 'cleared: nothing to delete';
  return { lines: [line], code: EXIT.OK };
}

/** The block an agent receives. Empty output is a legitimate answer (the default needs no
 * instructions); a MISSING policy file is not, and stops the command.
 * @type {(root: string, now: string) => CommandResult} */
export function context(root, now) {
  const state = readState(root, now);
  const { texts, missing } = readPolicyTexts(root, policyPathsFor(state));
  if (missing.length > 0) {
    throw new CliError(`cannot build the context block: missing ${missing.join(', ')} under the project root`, EXIT.STATE);
  }
  try {
    const block = contextBlock(state, texts);
    return { lines: block === '' ? [] : [block], code: EXIT.OK };
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), EXIT.STATE);
  }
}
