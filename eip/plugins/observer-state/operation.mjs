// The OPERATION the active cells belong to — discovered, never configured.
//
// The operation layer has no index: `vault/state/operations/` is a directory, and the
// link between a cell and its operation is the cell file's `**Operation:**` field. So
// discovery runs the only way that cannot invent anything: every cell NAMES its
// operation, each distinct name is slugified into the file the method would have
// written, that file is read through the same confined port as everything else, and
// `parseOperationFile` — the CLI's own parser, never a second one — says what it says.
//
// The documented consequence: an operation NO CELL REFERENCES is invisible to the
// observer. That is a reading of the vault, not a gap to paper over; an observer that
// listed directories would be publishing the filesystem instead of the method.
import { parseOperationFile } from '../../../tools/cellmode/operation-file.mjs';
import { slugify } from '../../../tools/cellmode/slug.mjs';

/** @typedef {import('../../../tools/cellmode/types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').Warning} Warning */

/** An operation id, and therefore an operation file name. The read port declares the
 * same shape; a name that does not slugify into it is reported, never read. */
export const OPERATION_ID = /^[a-z0-9-]{1,80}$/;

/** The symbol an ACTIVE operation carries. One operation at a time is the rule, so the
 * first 🔵 file found is the operation; the others are its history. */
export const ACTIVE_SYMBOL = '🔵';

/** `—` is how the file format spells "not recorded". @type {(value: unknown) => string} */
const text = (value) => {
  const raw = String(value ?? '').trim();
  return raw === '—' ? '' : raw;
};

/**
 * Read the active operation, from the names the cells carry. `read` is the host's
 * `fs.read` port: this module never builds a path either.
 * @param {(name: string) => Promise<string | null>} read
 * @param {ReadonlyArray<unknown>} names one per cell, as the cell file recorded it
 * @returns {Promise<{ operation: Operation | null, warnings: Warning[] }>}
 */
export async function readOperation(read, names) {
  /** @type {Warning[]} */
  const warnings = [];
  /** @type {string[]} */
  const slugs = [];
  for (const name of names) {
    const named = text(name);
    if (named === '') continue;
    const slug = slugify(named);
    if (!OPERATION_ID.test(slug)) {
      warnings.push({
        code: 'operation-id-unreadable',
        message: `"${named}" has no operation id matching ${OPERATION_ID.source}`,
      });
      continue;
    }
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  /** @type {Operation | null} */
  let operation = null;
  for (const slug of slugs) {
    const file = await read(`operations/${slug}.md`);
    const parsed = file === null ? null : parseOperationFile(file);
    if (parsed === null) {
      warnings.push({
        code: 'operation-file-missing',
        message: `a cell names the operation "${slug}", but there is no readable `
          + `operations/${slug}.md, so its finish line and pack are not published`,
      });
      continue;
    }
    if (operation === null && parsed.status === ACTIVE_SYMBOL) operation = parsed;
  }
  return { operation, warnings };
}

/**
 * PURE. The operation as the API publishes it, or `null`. Every field is what the file
 * recorded: the finish line with its FINGERPRINT beside it (so a reader can see that it
 * moved), and the pack's six grants as the closed vocabulary parsed them. `status` is
 * the protocol SYMBOL — the operation layer's statuses are not the cell statuses, and
 * mapping them into the cell vocabulary would publish a word the method never used.
 * @param {Operation | null} operation
 */
export function operationView(operation) {
  if (operation === null) return null;
  const pack = operation.pack;
  return {
    name: operation.name,
    id: operation.id,
    status: operation.status,
    finishLine: [...operation.finishLine],
    fingerprint: operation.fingerprint,
    pack: {
      spendCeiling: pack.spendCeiling,
      publisher: pack.publisher,
      batches: pack.batches.map((batch) => ({ op: batch.op, limit: batch.limit })),
      requiresYes: [...pack.requiresYes],
      denied: [...pack.denied],
      maxActiveCells: pack.maxActiveCells,
    },
    qualityBar: operation.qualityBar,
    spendSoFar: operation.spendSoFar,
    plannedCells: [...operation.plannedCells],
  };
}
