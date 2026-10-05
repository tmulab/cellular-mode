// session.mjs — where a discovery session starts, as a pure routing function.
//
// The whole module exists to make one failure impossible: STARTING A NEW PROJECT OVER WORK
// THAT IS ALREADY RECORDED. `vault/state/` is the authoritative history, so when it holds an
// active or paused cell the Builder steps aside and names the cell for `/cell`; and when a
// discovery draft is already open, a request to start fresh needs a human confirmation
// instead of an overwrite. Nothing here writes: the caller decides what to do with the
// returned action, and only store.mjs can put it on disk.
import { emptyContract } from './contract-shape.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { emptyDraft } from './draft.mjs';
import { appendField, getField, isListField, setField } from './fields.mjs';
import { slugify } from '../cellmode/slug.mjs';

/** @typedef {import('./types.mjs').CellState} CellState */
/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Inspection} Inspection */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').ProjectPath} ProjectPath */
/** @typedef {import('./types.mjs').SessionResult} SessionResult */

/** @type {CellState} */
const NO_CELLS = Object.freeze({ exists: false, active: null, paused: [] });

/** @type {(state: CellState) => string[]} */
const named = (state) => (state.active === null ? [] : [state.active]).concat(state.paused);

/**
 * PURE. Writes the read-only inspection findings into a contract: list fields are appended
 * to, single fields are set. The slug follows cellmode's own rules, so a project discovered
 * here and a cell opened later agree on the identity.
 * @param {ProjectContract} contract @param {ReadonlyArray<Finding>} findings
 * @returns {ProjectContract}
 */
export function mergeFindings(contract, findings) {
  let out = contract;
  for (const { field, entry } of findings) {
    out = isListField(out, field) ? appendField(out, field, [entry]) : setField(out, field, entry);
  }
  const name = /** @type {Entry | undefined} */ (getField(out, 'identity.name'));
  if (out.identity.slug === '' && name !== undefined && name.value !== '') {
    out = setField(out, 'identity.slug', slugify(name.value));
  }
  return out;
}

/** @type {(state: CellState, draft: Draft | undefined) => string} */
function whyConfirm(state, draft) {
  const cells = named(state);
  const parts = [];
  if (cells.length > 0) parts.push(`vault/state/ already tracks ${cells.length} cell(s): ${cells.join(', ')}`);
  if (draft !== undefined) parts.push('a discovery draft is already open');
  return `${parts.join('; ')} — confirm before starting a new project, nothing was changed`;
}

/**
 * PURE. Routes the start of a session. `inspection` is the read-only repository inspection
 * (path `existing`), `cellState` what `store.readCellState` found, `existingDraft` what
 * `store.readDraft` found. None of them is required: an absent one means "nothing there".
 * @param {ProjectPath} path
 * @param {{ inspection?: Inspection, cellState?: CellState, existingDraft?: Draft }} [context]
 * @returns {SessionResult}
 */
export function startSession(path, context = {}) {
  if (path !== 'new' && path !== 'existing' && path !== 'resume') {
    throw new BuilderError(CODES.BAD_ENTRY, `path must be one of new, existing, resume — got "${String(path)}"`);
  }
  const cellState = context.cellState ?? NO_CELLS;
  const existingDraft = context.existingDraft;
  const busy = cellState.active !== null || cellState.paused.length > 0;

  if (path === 'resume') {
    if (busy) {
      const cells = named(cellState);
      const first = cells[0] ?? '';
      return {
        action: 'defer-to-cell',
        message: `${cells.length} recorded cell(s): ${cells.join(', ')} — use /cell to resume ${first};`
          + ' the Builder does not open, activate or close cells',
      };
    }
    if (existingDraft !== undefined) {
      return {
        action: 'continue-draft',
        draft: existingDraft,
        message: `continuing the open discovery draft: ${existingDraft.asked.length} question(s) answered,`
          + ` ${existingDraft.skipped.length} skipped`,
      };
    }
    return {
      action: 'nothing-to-resume',
      message: 'there is nothing to resume: no cell in vault/state/ and no discovery draft.'
        + ' Say whether this is a new project or an existing repository, and discovery starts there',
    };
  }

  if (busy || existingDraft !== undefined) {
    return { action: 'confirm-needed', message: whyConfirm(cellState, existingDraft) };
  }

  if (path === 'existing') {
    const findings = context.inspection?.findings ?? [];
    const draft = emptyDraft(path, mergeFindings(emptyContract(path), findings));
    return {
      action: 'new-draft',
      draft,
      message: `discovery started for an existing repository: ${findings.length} fact(s) read from it,`
        + ' recorded as VERIFIED; nothing in the project was modified',
    };
  }
  return {
    action: 'new-draft',
    draft: emptyDraft(path),
    message: 'discovery started for a new project: nothing is known yet, every field is UNKNOWN',
  };
}
