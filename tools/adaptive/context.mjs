// context.mjs — the compact text an agent actually receives. PURE: texts come in as strings.
//
// This is the module that spends the human's attention and the model's context, so it is
// written to spend as little as possible. Three rules.
//
// MINIMAL. The boundaries, plus the ACTIVE mode's policy, and nothing else. Injecting a
// policy that is not in force would be both a cost paid on every prompt and a false
// statement about how the work is being conducted.
//
// CAPPED. A declared byte budget, checked on every build. Over the budget is an ERROR, not a
// truncation: half an instruction block is worse than none, because the half that survives
// still looks authoritative.
//
// HONEST ABOUT ABSENCE. `ready`, `none` and `disabled` produce the empty string — the default
// way of working needs no instructions. An expired or unreadable declaration produces exactly
// its one-line notice, because silence there is indistinguishable from "nothing happened".
import { BOUNDARIES_POLICY, MODES } from './modes.mjs';

/** @typedef {import('./types.mjs').EffectiveMode} EffectiveMode */

/** The budget for the whole block, in bytes. Measured per mode by `context.test.mjs`. */
export const MAX_BLOCK_BYTES = 2048;

/** @type {(iso: string) => string} */
const atMinute = (iso) => iso.slice(0, 16).replace('T', ' ');

/**
 * PURE. Strips what an injected copy does not need: the title line (the header already names
 * the mode) and every blank line. Nothing else is touched — no reflowing, no reordering, no
 * summarising. A reader comparing the block with the file must find the same sentences.
 * @param {unknown} text @returns {string}
 */
export function compactPolicy(text) {
  const lines = String(text ?? '').split('\n');
  const body = lines[0]?.startsWith('# ') ? lines.slice(1) : lines;
  return body.filter((line) => line.trim() !== '').join('\n');
}

/**
 * PURE. Exactly the files a caller must read for this state — two when a mode is active,
 * NONE otherwise. A caller that reads more than this is paying for text it cannot use.
 * @param {EffectiveMode} effective @returns {string[]}
 */
export function policyPathsFor(effective) {
  if (!effective.enabled || effective.standing !== 'active') return [];
  const mode = MODES.find((m) => m.id === effective.mode);
  if (mode === undefined || !mode.temporary) return [];
  return [BOUNDARIES_POLICY, mode.policyFile];
}

/** One line: which mode, when it was declared, until when, through which door. The `until`
 * shows only the time when it falls on the declared date, and the whole instant when it does
 * not — a bare "02:02" for tomorrow would read as the past.
 * @type {(effective: EffectiveMode) => string} */
function header(effective) {
  const from = String(effective.activatedAt);
  const to = String(effective.expiresAt);
  const until = to.slice(0, 10) === from.slice(0, 10) ? atMinute(to).slice(11) : atMinute(to);
  return `# Cellular Adaptive · ${effective.mode} · declared ${atMinute(from)}`
    + ` · until ${until} · source ${effective.source ?? 'unknown'}`;
}

/**
 * PURE. Builds the block, or the empty string when there is nothing to inject.
 *
 * `policyTexts` is keyed by the repository-relative paths `policyPathsFor` asked for. A
 * missing or blank text THROWS: an empty block that still carried a header would claim a mode
 * is in force while delivering none of its content, which is the worst of the three outcomes.
 * @param {EffectiveMode} effective
 * @param {Record<string, string>} policyTexts
 * @returns {string} the block, with no trailing newline; the caller owns that
 */
export function contextBlock(effective, policyTexts) {
  const paths = policyPathsFor(effective);
  if (paths.length === 0) {
    const closed = effective.standing === 'expired' || effective.standing === 'invalid';
    const notice = effective.notice;
    return closed && typeof notice === 'string' && notice !== '' ? notice : '';
  }
  const parts = [header(effective)];
  for (const path of paths) {
    const text = policyTexts[path];
    if (text === undefined) throw new Error(`cannot build the context block: no text for ${path}`);
    const compact = compactPolicy(text);
    if (compact === '') throw new Error(`cannot build the context block: ${path} is empty`);
    parts.push(compact);
  }
  const block = parts.join('\n');
  const bytes = new TextEncoder().encode(block).length;
  if (bytes > MAX_BLOCK_BYTES) {
    throw new Error(`context block is ${bytes} bytes, over the budget of ${MAX_BLOCK_BYTES} bytes`);
  }
  return block;
}
