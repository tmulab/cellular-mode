// check-operation.mjs — the OPERATION rules of the integrity guard: four findings that
// read `operations/<slug>.md` against the log entry that opened it. PURE: it is handed
// the parsed operations, the raw file TEXTS, the operation log entries and the cells,
// and answers with findings. The reads are `check-layer.mjs`'s, the git facts are
// `check-git.mjs`'s, and `check.mjs` stays a pure function of what it is given.
//
// Why the raw text and not only the parsed operation: a pack outside the CLOSED
// vocabulary makes `parseOperationFile` THROW, so the operation whose pack is the
// finding is exactly the one that never parses. Reading that one field as text is what
// lets the guard NAME it instead of crashing on it.
//
// A ✔ operation is history: its pack expired with it and its log entries can never be
// rewritten (append-only), so a finding about one could never be cleared. All four rules
// therefore read the operations that are still open — 🔵 or ⏸ — and rule 2 only the 🔵 one.
import { parseFields, oneLine } from './fields.mjs';
import { slugify } from './slug.mjs';
import { parsePack, renderPack, fingerprintFinishLine, NONE } from './operation-file.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {{ timestamp: string, name: string, status: string, fingerprint: string }} OperationEntry */

export const OPERATION_CODES = {
  FINISH_LINE_MOVED: 'finish-line-moved',
  PACK_MISSING: 'pack-missing',
  PACK_GRANTS_FORBIDDEN: 'pack-grants-forbidden',
  SPEND_OVER_CEILING: 'spend-over-ceiling',
};

export const DONE = '✔';
const ACTIVE = '🔵';
const OPERATION_HEAD = /^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+·\s+Operation:\s*(.+)$/;
const TITLE = '# Operation:';

/** A fingerprint in a message is cut to its first 12 hex characters: enough to tell two
 * apart, and the whole value is in the file and in the entry. @type {(h: unknown) => string} */
const short = (h) => oneLine(h, NONE).slice(0, 12);
/** @type {(name: unknown) => string} */
const label = (name) => oneLine(name, 'unnamed');

/**
 * A Spend or a spend ceiling as a NUMBER, or null when the text is not one. Only a plain
 * number counts (thousands separators dropped): `2000` and `2,000` are numbers, `2k
 * tokens`, `—` and `` are not, and a value that is not a number produces NO finding — a
 * guard that decided for itself what "2k" means would be inventing the ceiling it
 * enforces. @param {unknown} value @returns {number | null}
 */
export function numberOf(value) {
  const text = oneLine(value, '').replace(/[,_\s]/g, '');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

/**
 * PURE. Every `## <stamp> · Operation: <name>` entry of log.md, oldest first: the entries
 * `parseLog` deliberately ignores (openings, pauses, completions, pack amendments,
 * conflict crossings). @param {unknown} text @returns {OperationEntry[]}
 */
export function parseOperationEntries(text) {
  /** @type {OperationEntry[]} */
  const entries = [];
  /** @type {{ timestamp: string, name: string, body: string[] } | null} */
  let open = null;
  const flush = () => {
    if (open === null) return;
    const f = parseFields(open.body.join('\n'));
    entries.push({
      timestamp: open.timestamp,
      name: open.name,
      status: f.Status ?? '',
      fingerprint: f.Fingerprint ?? '',
    });
    open = null;
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    const hit = OPERATION_HEAD.exec(line);
    if (hit) {
      flush();
      open = { timestamp: hit[1] ?? '', name: (hit[2] ?? '').trim(), body: [] };
    } else if (line.startsWith('## ')) flush();
    else if (open) open.body.push(raw);
  }
  flush();
  return entries;
}

/**
 * The OPENING entry of one operation: the first entry that names it and carries a
 * fingerprint. Names are matched as slugs, so recasing the title in the file does not
 * lose the entry that opened it. @param {ReadonlyArray<OperationEntry>} entries
 * @param {unknown} name @returns {OperationEntry | null}
 */
export function openingEntry(entries, name) {
  const want = slugify(oneLine(name, ''));
  return entries.find((e) => slugify(e.name) === want && e.fingerprint !== '') ?? null;
}

/** The `# Operation:` title of a raw file, or ''. @param {string} text @returns {string} */
function titleOf(text) {
  const line = text.split('\n').find((l) => l.trim().startsWith(TITLE));
  return line === undefined ? '' : line.trim().slice(TITLE.length).trim();
}

/**
 * PURE. The four operation findings. Order is rule order, after `checkState`'s own four.
 * @param {{ operations?: ReadonlyArray<Operation>,
 *   texts?: ReadonlyArray<{ slug: string, text: string }>,
 *   entries?: ReadonlyArray<OperationEntry>, cells?: ReadonlyArray<Cell> }} [input]
 * @returns {Finding[]}
 */
export function checkOperations({
  operations = [], texts = [], entries = [], cells = [],
} = {}) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {(code: string, message: string) => number} */
  const add = (code, message) => findings.push({ code, message });

  // 1. The finish line is FROZEN at opening: the file's fingerprint, and the hash of the
  //    finish line as it now reads, must both be what the opening entry recorded. With no
  //    opening entry there is nothing to compare against — that is a gap in the record,
  //    not a moved finish line, and this rule stays silent about it.
  for (const op of operations.filter((o) => o.status !== DONE)) {
    const opening = openingEntry(entries, op.name);
    if (opening === null) continue;
    const carried = oneLine(op.fingerprint, '');
    if (carried !== opening.fingerprint) {
      add(OPERATION_CODES.FINISH_LINE_MOVED, `finish line moved: operation "${label(op.name)}"`
        + ` carries fingerprint ${short(carried)} but its opening entry (${opening.timestamp})`
        + ` recorded ${short(opening.fingerprint)}`);
    } else if (fingerprintFinishLine(op.finishLine) !== opening.fingerprint) {
      add(OPERATION_CODES.FINISH_LINE_MOVED, `finish line moved: operation "${label(op.name)}"`
        + ` keeps fingerprint ${short(carried)} but its Finish line now hashes to `
        + short(fingerprintFinishLine(op.finishLine)));
    }
  }

  // 2. An ACTIVE operation with no pack. The pack is what the human authorized at
  //    opening; an empty one grants nothing, so every batch and every publication inside
  //    the operation is unauthorized and the file cannot say otherwise.
  for (const op of operations.filter((o) => o.status === ACTIVE)) {
    if (renderPack(op.pack) === NONE) {
      add(OPERATION_CODES.PACK_MISSING, `pack missing: operation "${label(op.name)}" is 🔵 `
        + 'but its Authorization pack is empty (—) — an operation with no pack authorizes nothing');
    }
  }

  // 3. A pack the CLOSED vocabulary rejects, read from the TEXT and reported with the
  //    model's own named error. These files do not parse, so they are not in `operations`.
  for (const { slug, text } of texts) {
    const f = parseFields(text);
    const name = titleOf(text);
    if (name === '' || oneLine(f.Status, '') === DONE) continue;
    try {
      parsePack(f['Authorization pack'] ?? '');
    } catch (error) {
      add(OPERATION_CODES.PACK_GRANTS_FORBIDDEN, `pack grants forbidden: operation `
        + `"${label(name)}" (${slug}) has an Authorization pack the closed vocabulary `
        + `rejects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 4. Spend against a NUMERIC ceiling. `Spend so far` is meant to BE the sum of the
  //    cells' Spend (docs/03 §3), so the greater of the two is what the operation has
  //    spent; a non-numeric ceiling or Spend is skipped rather than guessed.
  for (const op of operations.filter((o) => o.status !== DONE)) {
    const ceiling = numberOf(op.pack.spendCeiling);
    if (ceiling === null) continue;
    const own = cells.filter((c) => slugify(oneLine(c.operation, '')) === op.id);
    const summed = own.reduce((total, c) => total + (numberOf(c.spend) ?? 0), 0);
    const spent = Math.max(summed, numberOf(op.spendSoFar) ?? 0);
    if (spent > ceiling) {
      add(OPERATION_CODES.SPEND_OVER_CEILING, `spend over ceiling: operation `
        + `"${label(op.name)}" has spent ${spent} against a spend ceiling of ${ceiling} `
        + `(${own.length} cell(s) summed: ${summed} · Spend so far: ${oneLine(op.spendSoFar)})`);
    }
  }

  return findings;
}
