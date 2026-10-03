// hook.mjs — the Claude Code hook handlers. Opt-in, and deliberately narrow.
//
// A hook sees every prompt the human types. That makes this the one file in the module where
// "detecting" a mode would be easy, cheap and invisible — and therefore the one file where the
// rule has to be mechanical: a mode is set ONLY when the trimmed prompt is EXACTLY one of the
// slash commands. "I'm tired", "estou cansado", "foco total" and "/tired please" set nothing.
// There is no fuzzy match, no first-token parse, no keyword list; `modeCommandOf` is four lines
// and `hook.test.mjs` asserts the whole table of things that must change nothing.
//
// The second rule is that a hook NEVER blocks a prompt. Every path here returns normally and
// the caller exits 0; anything wrong becomes one line on stderr. A module about working comfort
// has no business standing between a human and their next sentence.
import {
  deleteSession, hashOf, readInjected, readPolicyTexts, readPreferences, readSession,
  writeInjected, writeSession,
} from './io.mjs';
import { resolveMode } from './modes.mjs';
import { declare } from './transitions.mjs';
import { contextBlock, policyPathsFor } from './context.mjs';
import { effectiveMode, ttlHoursOf } from './validity.mjs';

/** The two events this module answers. Both are documented upstream as receiving JSON on stdin
 * and adding stdout to the context (INFERRED from the Claude Code hook documentation). */
export const HOOK_EVENTS = Object.freeze(['SessionStart', 'UserPromptSubmit']);

/** One line, printed once, when the interaction returns to the default (AD32). */
export const READY_NOTICE = '# Cellular Adaptive · ready · no declaration active; the default interaction applies again.';

/** @typedef {{ lines: string[], notes: string[] }} HookResult */

/**
 * PURE. The mode a prompt DECLARES, or `null` — which is the answer for every sentence a human
 * ever writes. The prompt must be exactly `/` plus a mode id or alias, with nothing else but
 * surrounding whitespace. Matching is case-insensitive and never partial, so there is no
 * sentence an agent or a user can be surprised by.
 * @param {unknown} prompt @returns {import('./types.mjs').ModeId | null}
 */
export function modeCommandOf(prompt) {
  if (typeof prompt !== 'string') return null;
  const text = prompt.trim();
  return text.startsWith('/') ? resolveMode(text) : null;
}

/** @type {(text: unknown) => { value: Record<string, unknown>, note: string | null }} */
function parsePayload(text) {
  if (typeof text !== 'string' || text.trim() === '') return { value: {}, note: null };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { value: /** @type {Record<string, unknown>} */ (parsed), note: null };
    }
    return { value: {}, note: 'adaptive: the hook payload was not a JSON object; continuing with no session id' };
  } catch {
    return { value: {}, note: 'adaptive: could not read the hook payload as JSON; continuing with no session id' };
  }
}

/**
 * Runs one hook event. Returns what to print and what to say on stderr; the caller always
 * exits 0. Nothing here throws, and nothing here is inferred: the only way a mode changes is an
 * exact command in `payload.prompt`.
 * @param {string} root @param {unknown} event @param {unknown} payloadText @param {string} now
 * @returns {HookResult}
 */
export function runHook(root, event, payloadText, now) {
  if (typeof event !== 'string' || !HOOK_EVENTS.includes(event)) {
    return {
      lines: [],
      notes: [`adaptive: unknown hook event ${JSON.stringify(String(event ?? ''))}; expected ${HOOK_EVENTS.join(' or ')}`],
    };
  }
  const parsed = parsePayload(payloadText);
  /** @type {string[]} */
  const notes = parsed.note === null ? [] : [parsed.note];
  const payload = parsed.value;
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : '';
  const prefs = readPreferences(root);
  if (prefs.error !== null) return { lines: [], notes: [...notes, `adaptive: ${prefs.error}`] };

  let declared = false;
  if (event === 'UserPromptSubmit') {
    const mode = modeCommandOf(payload.prompt);
    if (mode !== null) {
      const result = declare(mode, {
        source: 'claude-hook',
        command: String(payload.prompt).trim(),
        now,
        ttlHours: ttlHoursOf(prefs.value),
      });
      if (!result.ok) notes.push(`adaptive: ${result.errors.map((e) => e.message).join('; ')}`);
      else if (result.value === null) deleteSession(root);
      else writeSession(root, result.value);
      declared = result.ok;
    }
  }

  const session = readSession(root);
  const state = effectiveMode(session.value, now, prefs.value, session.error);
  const { texts, missing } = readPolicyTexts(root, policyPathsFor(state));
  if (missing.length > 0) {
    return { lines: [], notes: [...notes, `adaptive: cannot build the context block, missing ${missing.join(', ')}`] };
  }
  let block = '';
  try {
    block = contextBlock(state, texts);
  } catch (error) {
    return { lines: [], notes: [...notes, `adaptive: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const hash = hashOf(block);
  const previous = readInjected(root);
  const changed = previous.sessionId !== sessionId || previous.hash !== hash;
  // Nothing is remembered about a session that was never given anything.
  if (block !== '' || previous.hash !== '') writeInjected(root, sessionId, hash);
  const show = block !== '' && (declared || event === 'SessionStart' || changed);
  if (show) return { lines: [block], notes };
  // `ready` has no block, so a return to it would otherwise be silent and the model would keep
  // the earlier mode (validation of 2026-10-03, deviation 1). Say it once: when the human asked,
  // or when this session had been given a block that no longer applies.
  const endedHere = changed && previous.sessionId === sessionId && previous.hash !== '';
  const announce = block === '' && state.enabled && (declared || endedHere) && state.notice === null;
  return { lines: announce ? [READY_NOTICE] : [], notes };
}
