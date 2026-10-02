// size.mjs — the 200-line rule, enforced instead of described.
//
// The constitution says: 200 lines per handwritten source file, exceptions listed
// with rationale in policy/size-exceptions.json. The previous version of this check
// used a flat tolerance of 210 lines, which is a silent exception for every file in
// the repository at once. A tolerance nobody has to justify is not a rule. So: the
// limit is 200, and the only way past it is a named entry that says why and who
// approved it.
//
// SCOPE (decided here, documented in tools/gates/README.md):
//   IN  - .mjs .js .ts .md anywhere in the repository, including tests, tools,
//         templates, docs and examples. These are handwritten.
//   OUT - node_modules/ and .git/ (not ours).
//   OUT - LICENSE and any extensionless file: upstream text nobody may edit, and
//         out of scope by type rather than by exception.
//   OUT - any path under a `vault/state/` directory (the repository's own vault,
//         the examples' vault, the templates' vault seed). Two reasons: those files
//         are append-only memory records - log.md and INDEX.md grow by design and
//         capping them would mean deleting history to pass a gate - and the
//         examples' vault is generated output, reproduced byte-for-byte by
//         examples/text-stats/reproduce.mjs.

/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').SizedFile} SizedFile */
/** One entry of policy/size-exceptions.json, before it is validated: a bag of
 * `unknown` read field by field, which is all a policy file can promise.
 * @typedef {Record<string, unknown>} RawException
 */

export const DEFAULT_LIMIT = 200;

const EXTENSIONS = ['.mjs', '.js', '.ts', '.md'];

/** True when the 200-line rule applies to this relative path.
 * @param {string} rel @returns {boolean} */
export function inScope(rel) {
  if (/(^|\/)(node_modules|\.git)\//.test(rel)) return false;
  if (/(^|\/)vault\/state\//.test(rel)) return false;
  return EXTENSIONS.some((ext) => rel.toLowerCase().endsWith(ext));
}

/** Lines in a text, ignoring a single trailing newline.
 * @param {string} text @returns {number} */
export function countLines(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

const REQUIRED_FIELDS = ['path', 'limit', 'rationale', 'approvedBy'];

/**
 * An exception entry is only an exception if it is complete. A half-filled entry
 * is reported as a finding of its own, so "add the path and move on" does not work.
 * @param {unknown} exceptions @returns {Finding[]}
 */
export function validateExceptions(exceptions) {
  /** @type {Finding[]} */
  const findings = [];
  if (!Array.isArray(exceptions)) {
    return [{ rule: 'size:policy-shape', path: 'policy/size-exceptions.json', detail: 'must be a JSON array' }];
  }
  exceptions.forEach((/** @type {RawException | null} */ entry, /** @type {number} */ i) => {
    const at = `policy/size-exceptions.json[${i}]`;
    if (entry === null || typeof entry !== 'object') {
      findings.push({ rule: 'size:policy-shape', path: at, detail: 'entry must be an object' });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      const value = entry[field];
      const empty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
      if (empty) findings.push({ rule: 'size:policy-incomplete', path: at, detail: `missing ${field}` });
    }
    if (entry.limit !== undefined && (!Number.isInteger(entry.limit) || Number(entry.limit) < 0)) {
      findings.push({ rule: 'size:policy-shape', path: at, detail: 'limit must be a non-negative integer' });
    }
  });
  return findings;
}

/** The limit that applies to one file: the exception's, or 200.
 * @param {string} rel @param {unknown} exceptions @returns {number} */
export function limitFor(rel, exceptions) {
  const list = Array.isArray(exceptions) ? exceptions : [];
  const hit = list.find((/** @type {RawException | null} */ e) => e && e.path === rel && Number.isInteger(e.limit));
  return typeof hit?.limit === 'number' ? hit.limit : DEFAULT_LIMIT;
}

/**
 * PURE. `files` is `[{ path, text }]` or `[{ path, lines }]`; `exceptions` is the
 * parsed policy array. Returns findings, never a count or a "mostly fine".
 * @param {ReadonlyArray<SizedFile>} files @param {unknown} [exceptions] @returns {Finding[]}
 */
export function checkSize(files, exceptions = []) {
  const findings = validateExceptions(exceptions);
  for (const file of files) {
    if (!inScope(file.path)) continue;
    const lines = file.lines ?? countLines(file.text ?? '');
    const limit = limitFor(file.path, exceptions);
    if (lines > limit) {
      findings.push({
        rule: limit === DEFAULT_LIMIT ? 'size:over-limit' : 'size:over-approved-limit',
        path: file.path,
        detail: `${lines} lines > limit ${limit}`,
        lines,
        limit,
      });
    }
  }
  return findings;
}

/** Files ranked by length, so drift is visible before it becomes a violation.
 * @param {ReadonlyArray<SizedFile>} files @param {number} [top]
 * @returns {Array<{ path: string, lines: number }>} */
export function ranking(files, top = 5) {
  return files
    .filter((f) => inScope(f.path))
    .map((f) => ({ path: f.path, lines: f.lines ?? countLines(f.text ?? '') }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, top);
}
