// prompt.mjs — `renderPrompt`: an approved contract plus one cell become the text somebody
// pastes into an agent. PURE and TOTAL (no clock, no filesystem, no network): the same inputs
// render byte for byte, which is what makes an exported prompt reviewable at all.
//
// FAIL CLOSED, in this order, before a single layer is built:
//   1. unknown adapter → `UNKNOWN_ADAPTER` (never a silent fallback to neutral);
//   2. `publicationCheck` fails → `UNSAFE_EXPORT`. A prompt travels further than a contract:
//      into a chat window, a log, a bug report. Exporting one is a publication;
//   3. the contract is not approved and `{ draft: true }` was not asked for → `NOT_APPROVED`;
//   4. the FINISHED text is scanned again for credential shapes, absolute or personal paths
//      and contact details → `UNSAFE_EXPORT`. Step 2 checks the input, step 4 checks the
//      output, and only the second one can catch a cell that was never in the contract.
// Findings name the path and the shape, never the value: a refusal that echoed the secret
// would copy it into the terminal it was trying to keep it out of.
//
// WHAT A DRAFT PROMPT IS. `{ draft: true }` does not weaken anything: it changes the heading to
// a warning and replaces the objective with the discovery-only limit, so the one thing an
// unapproved contract can authorise is finding out more.
import { adapterFor } from './adapters.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { getField } from './fields.mjs';
import { cellLayer, methodLayer, projectLayer } from './prompt-layers.mjs';
import { DRAFT_HEADER, MODES } from './prompt-rules.mjs';
import { publicationCheck } from './publication.mjs';
import { findContacts, findPersonalPaths, findSensitive } from './sensitive.mjs';

/** @typedef {import('../cellmode/types.mjs').Cell} Cell */
/** @typedef {import('./adapters.mjs').Adapter} Adapter */
/** @typedef {{ method: number, project: number, cell: number }} LayerSizes */
/** @typedef {{ text: string, bytes: number, layers: LayerSizes, adapter: string,
 *   nonce: string, warnings: string[] }} RenderedPrompt */

/** How many bytes of prompt this project considers reasonable for one cell. A BUDGET, not a
 * limit: going over earns a warning, because the honest fix is a smaller contract or a smaller
 * cell, and silently truncating a prompt would drop a prohibition. The number is this
 * project's own judgement — three layers of pointers, not documents. */
export const PROMPT_BUDGET_BYTES = 6000;

/** The heading of an ordinary prompt. Carries no project text: the title of a document is read
 * first and trusted most, so nothing from a contract goes in it. */
export const PROMPT_HEADER = '# Cell prompt — Cellular Mode';

/** @type {(text: string) => number} */
const bytesOf = (text) => Buffer.byteLength(text, 'utf8');

/** Every shape that must not survive into an exported prompt, as `{ kind }` findings. The three
 * detectors are Cell 2's, asked again over the OUTPUT: no fourth copy of a credential shape.
 * @param {string} text @returns {Array<{ path: string, kind: string }>} */
export function exportFindings(text) {
  /** @type {Array<{ path: string, kind: string }>} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const hit of [...findSensitive(text), ...findPersonalPaths(text), ...findContacts(text)]) {
    if (seen.has(hit.kind)) continue;
    seen.add(hit.kind);
    out.push({ path: 'prompt', kind: hit.kind });
  }
  return out;
}

/** @type {(mode: unknown, warnings: string[]) => string} */
function resolveMode(mode, warnings) {
  if (mode === undefined || mode === null || mode === '') return 'ready';
  const name = String(mode);
  if (MODES.includes(name)) return name;
  warnings.push(`unknown mode "${name}" — ignored; no mode changes a gate or an approval`);
  return 'ready';
}

/**
 * PURE and TOTAL except for its refusals. The three-layer prompt for one cell of one contract.
 * @param {unknown} contract the project contract
 * @param {unknown} cell the cell, in cellmode's own cell shape
 * @param {string} [adapterId] which export target; `neutral` works anywhere
 * @param {{ mode?: string, draft?: boolean, adapters?: ReadonlyArray<Adapter> }} [options]
 * @returns {RenderedPrompt}
 */
export function renderPrompt(contract, cell, adapterId = 'neutral', options = {}) {
  const adapter = options.adapters === undefined
    ? adapterFor(adapterId)
    : adapterFor(adapterId, options.adapters);
  const publication = publicationCheck(contract);
  if (!publication.ok) {
    throw new BuilderError(
      CODES.UNSAFE_EXPORT,
      `the contract is not fit to export: ${publication.findings.length} finding(s)`,
      { findings: publication.findings },
    );
  }
  const approved = getField(contract, 'approval.approved') === true;
  if (!approved && options.draft !== true) {
    throw new BuilderError(
      CODES.NOT_APPROVED,
      'the contract is not approved — approve it, or export with { draft: true } for a '
      + 'discovery-only prompt',
      { approved: false },
    );
  }

  /** @type {string[]} */
  const warnings = [];
  const mode = resolveMode(options.mode, warnings);
  if (!approved) warnings.push('the contract is not approved — this prompt is a DRAFT: discovery only');

  const method = methodLayer(adapter.pointer);
  const project = projectLayer(contract, cell);
  const work = cellLayer({ draft: !approved, mode });
  const text = adapter.render({
    header: approved ? PROMPT_HEADER : `# ${DRAFT_HEADER}`,
    method,
    project: project.text,
    cell: work,
  });

  const findings = exportFindings(text);
  if (findings.length > 0) {
    throw new BuilderError(
      CODES.UNSAFE_EXPORT,
      `the rendered prompt carries ${findings.length} shape(s) that must not be exported`,
      { findings },
    );
  }

  const bytes = bytesOf(text);
  if (bytes > PROMPT_BUDGET_BYTES) {
    warnings.push(`the prompt is ${bytes} bytes, over the ${PROMPT_BUDGET_BYTES}-byte budget — `
      + 'shorten the contract or the cell, never the rules');
  }
  return {
    text,
    bytes,
    layers: { method: bytesOf(method), project: bytesOf(project.text), cell: bytesOf(work) },
    adapter: adapter.id,
    nonce: project.nonce,
    warnings,
  };
}
