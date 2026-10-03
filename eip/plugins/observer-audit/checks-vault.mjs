// PURE. The four checks about the VAULT — the method's own state.
//
// Not one of them re-reads or re-parses anything: the model arrives from the
// `observer.state` sibling, which built it with the `tools/cellmode` pure parsers, and the
// integrity verdict inside it is `checkState`'s own output. A second opinion about the
// vault would be a second truth, and the one that drifts is always the one nobody runs.
import { lastEntryFor } from '../../../tools/cellmode/log.mjs';
import { PROJECT, cellScope, draft } from './statuses.mjs';

/** @typedef {import('./types.mjs').AuditEntry} AuditEntry */
/** @typedef {import('./types.mjs').AuditModel} AuditModel */
/** @typedef {import('./types.mjs').Draft} Draft */

export const RULES = Object.freeze({
  STATE: 'cell-state',
  CONTRACT: 'cell-contract',
  DEPENDENCIES: 'dependencies',
  DONE_EVIDENCE: 'done-evidence',
});

/** The statuses whose cells are expected to carry a complete contract. A planned cell has
 * not been opened yet, so judging its fields would be judging work nobody started. */
const CONTRACTED = Object.freeze(['active', 'paused', 'done']);

/** `—` and the empty string both mean "not recorded" in the file format.
 * @type {(value: unknown) => boolean} */
const recorded = (value) => {
  const text = String(value ?? '').trim();
  return text !== '' && text !== '—';
};

/** The four fields a cell contract is made of, with the words a human uses for them.
 * @type {ReadonlyArray<readonly [keyof import('./types.mjs').AuditCellFile, string]>} */
const CONTRACT_FIELDS = Object.freeze([
  /** @type {readonly ['objective', string]} */ (['objective', 'objective']),
  /** @type {readonly ['boundaryIn', string]} */ (['boundaryIn', 'boundary (in)']),
  /** @type {readonly ['doneCriterion', string]} */ (['doneCriterion', 'done criterion']),
  /** @type {readonly ['nextStep', string]} */ (['nextStep', 'next step']),
]);

/** PURE. The integrity guard's verdict, carried through. One PASS, or one FAIL per finding.
 * @param {AuditModel} model @returns {Draft[]} */
export function cellStateChecks(model) {
  const findings = model.integrity.findings;
  if (findings.length === 0) {
    return [draft({
      rule: RULES.STATE,
      status: 'PASS',
      evidence: ['vault/state/log.md', 'vault/state/INDEX.md', 'vault/state/CURRENT-CELL.md'],
      explanation: 'the integrity guard the CLI runs (tools/cellmode/check.mjs) reports no finding:'
        + ' the log, the index and the current-cell projection agree.',
    })];
  }
  return findings.map((finding) => draft({
    rule: RULES.STATE,
    status: 'FAIL',
    evidence: ['vault/state/log.md', `code ${finding.code}`],
    explanation: finding.message,
    action: 'reconcile the projection with log.md, which is the single source of truth — never the other way round.',
  }));
}

/** PURE. Per cell: is the contract actually written down?
 * @param {AuditModel} model @returns {Draft[]} */
export function cellContractChecks(model) {
  if (model.entries.length === 0) {
    return [draft({
      rule: RULES.CONTRACT,
      status: 'NOT_APPLICABLE',
      evidence: ['vault/state/INDEX.md'],
      explanation: 'INDEX.md declares no cell, so there is no contract to judge.',
    })];
  }
  /** @type {Draft[]} */
  const out = [];
  for (const entry of model.entries) {
    if (!CONTRACTED.includes(entry.status)) continue;
    if (entry.cell === null) {
      out.push(draft({
        rule: RULES.CONTRACT,
        scope: cellScope(entry.id),
        status: 'WARNING',
        evidence: [`vault/state/cells/${entry.id}.md`],
        explanation: 'this cell has a row in INDEX.md but no readable cell file, so its contract'
          + ' cannot be read at all.',
        action: `open a cell to restore vault/state/cells/${entry.id}.md from log.md.`,
      }));
      continue;
    }
    const cell = entry.cell;
    for (const [field, label] of CONTRACT_FIELDS) {
      // A done cell has nothing next, and the file format spells that `—`. Demanding a
      // next step from finished work is how a checklist teaches people to write "n/a".
      if (field === 'nextStep' && entry.status === 'done') continue;
      if (recorded(cell[field])) continue;
      out.push(draft({
        rule: RULES.CONTRACT,
        scope: cellScope(entry.id),
        status: 'WARNING',
        evidence: [`vault/state/cells/${entry.id}.md`, `field ${label}`],
        explanation: `this ${entry.status} cell records no ${label}, so the next session inherits`
          + ' a decision instead of a contract.',
        action: `record the ${label} in the cell file.`,
      }));
    }
  }
  return out.length === 0
    ? [draft({
      rule: RULES.CONTRACT,
      status: 'PASS',
      evidence: ['vault/state/cells'],
      explanation: `every active, paused and done cell (${model.entries.length} row(s) in INDEX.md)`
        + ' records its objective, boundary and done criterion, and every unfinished one records a next step.',
    })]
    : out;
}

/** PURE. A declared dependency on a cell nobody declared. An UNDECLARED pair is never
 * inferred into an edge, and therefore never into a finding either.
 * @param {AuditModel} model @returns {Draft[]} */
export function dependencyChecks(model) {
  const known = new Set(model.entries.map((entry) => entry.id));
  /** @type {Draft[]} */
  const out = [];
  for (const entry of model.entries) {
    for (const target of entry.dependencies) {
      if (known.has(target)) continue;
      out.push(draft({
        rule: RULES.DEPENDENCIES,
        scope: cellScope(entry.id),
        status: 'WARNING',
        evidence: [`vault/state/cells/${entry.id}.md`, `dependency ${target}`],
        explanation: `this cell declares a dependency on "${target}", which is not a cell in INDEX.md.`,
        action: `either open a cell named "${target}" or correct the Dependencies field.`,
      }));
    }
  }
  return out.length === 0
    ? [draft({
      rule: RULES.DEPENDENCIES,
      status: 'PASS',
      evidence: ['vault/state/cells'],
      explanation: 'every declared dependency names a cell that exists in INDEX.md.',
    })]
    : out;
}

/** A build line that reads as a failure. Narrow on purpose: these are the words the
 * protocol's own entries use, and a wider pattern would flag "no failures". */
const BUILD_RED = /❌|\bfail(?:ed|s|ing|ure)?\b|\bbroken\b|\bred\b/i;

/** PURE. A cell marked done whose closure carries no verification evidence.
 * @param {AuditModel} model @returns {Draft[]} */
export function doneEvidenceChecks(model) {
  const done = model.entries.filter((entry) => entry.status === 'done');
  if (done.length === 0) {
    return [draft({
      rule: RULES.DONE_EVIDENCE,
      status: 'NOT_APPLICABLE',
      evidence: ['vault/state/INDEX.md'],
      explanation: 'no cell is marked done, so there is no completion claim to back with evidence.',
    })];
  }
  /** @type {Draft[]} */
  const out = [];
  for (const entry of done) {
    const last = lastEntryFor(model.logEntries, entry.name);
    const build = String(last?.build ?? '').trim();
    const missing = last === null || build === '' || build === '—';
    if (!missing && !BUILD_RED.test(build)) continue;
    out.push(draft({
      rule: RULES.DONE_EVIDENCE,
      scope: cellScope(entry.id),
      status: 'WARNING',
      evidence: ['vault/state/log.md', missing ? 'Build: not recorded' : 'Build: reads as failed'],
      explanation: missing
        ? 'this cell is marked done but its last log entry records no Build field, so the'
          + ' completion claim rests on nothing a reader can check.'
        : 'this cell is marked done while its last recorded build reads as failed.',
      action: 'run the gates, then append a closure entry whose Build field states the real result.',
    }));
  }
  return out.length === 0
    ? [draft({
      rule: RULES.DONE_EVIDENCE,
      scope: PROJECT,
      status: 'PASS',
      evidence: ['vault/state/log.md'],
      explanation: `all ${done.length} done cell(s) record a build in their last log entry.`,
    })]
    : out;
}
