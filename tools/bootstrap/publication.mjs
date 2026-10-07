// publication.mjs — the two questions asked of every string that is about to become part of the
// install manifest: could this be somebody's absolute path, and could this be a secret?
//
// `vault/install-manifest.json` is COMMITTED project history (decision BS2). What it holds is
// published — to a repository, to a review, to whatever a reader pastes next — so the record is
// relative paths, component ids, hashes and instants, and nothing else. The target directory is
// named by its basename alone for this reason and no other.
//
// Written locally on purpose. The Prompt Builder has a far richer `sensitive.mjs`, but it is an
// OPTIONAL module: a static import of it would make Bootstrap stop working the moment somebody
// deletes it, which is exactly the failure `tests/optional-module-imports.test.mjs` exists to
// prevent. So this file duplicates a small, documented subset deliberately. It is a DETECTOR,
// not a decryptor: it reports shapes, and a shape it does not know is UNKNOWN, which is why the
// manifest's key set is closed as well — the two checks cover each other.

/** @typedef {{ path: string, finding: string }} Finding */

/** Shapes that mean "an absolute or machine-specific path". @type {ReadonlyArray<{ re: RegExp, why: string }>} */
const PATH_SHAPES = Object.freeze([
  Object.freeze({ re: /^[A-Za-z]:[\\/]/, why: 'looks like a Windows absolute path' }),
  Object.freeze({ re: /^\\\\/, why: 'looks like a UNC network path' }),
  Object.freeze({ re: /^\//, why: 'looks like a POSIX absolute path' }),
  Object.freeze({ re: /(?:^|[\\/])(?:Users|home)[\\/][^\\/]+/, why: 'names a home directory' }),
  Object.freeze({ re: /^file:\/\//i, why: 'is a file URL' }),
]);

/** Shapes that mean "a credential". Each one is a token format with a fixed prefix or an
 * assignment whose right-hand side is long enough to be a key rather than a word.
 * @type {ReadonlyArray<{ re: RegExp, why: string }>} */
const SECRET_SHAPES = Object.freeze([
  Object.freeze({ re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'is a private key block' }),
  Object.freeze({ re: /\bAKIA[0-9A-Z]{16}\b/, why: 'looks like an AWS access key id' }),
  Object.freeze({ re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, why: 'looks like a GitHub token' }),
  Object.freeze({ re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, why: 'looks like a Slack token' }),
  Object.freeze({ re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, why: 'looks like a signed token' }),
  Object.freeze({
    re: /\b(?:api[_-]?key|secret|password|passwd|token|bearer)\b\s*[:=]\s*\S{8,}/i,
    why: 'assigns a value to a credential-shaped name',
  }),
  Object.freeze({ re: /[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/, why: 'is a long opaque blob' }),
  Object.freeze({ re: /[^@\s]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, why: 'looks like a contact address' }),
]);

/** The two digests this record legitimately holds, whole and lower-case: a SHA-256 (`sha256After`)
 * and a git commit id (`source.revision`). Exempting them is not a hole — an attacker gains
 * nothing from a string that is EXACTLY 40 or 64 hex characters and nothing else, and without the
 * exemption the opaque-blob rule would refuse every manifest this tool writes. VERIFIED by a real
 * install: the first run of `new --confirm` failed here on a commit id. */
const DIGEST = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * PURE and TOTAL. Why `value` must not be published, or `null`. A whole digest is exempted from
 * the opaque-blob rule and from nothing else — the path rules above still apply to it.
 * @param {unknown} value @returns {string | null}
 */
export function stringFinding(value) {
  if (typeof value !== 'string' || value === '') return null;
  for (const shape of PATH_SHAPES) if (shape.re.test(value)) return `${shape.why}`;
  if (DIGEST.test(value)) return null;
  for (const shape of SECRET_SHAPES) if (shape.re.test(value)) return `${shape.why}`;
  return null;
}

/**
 * PURE and TOTAL. Every publication finding in a document, by JSON path. Keys are checked as
 * well as values: a key is text somebody chose too.
 * @param {unknown} value @param {string} [at] @returns {ReadonlyArray<Finding>}
 */
export function publicationFindings(value, at = '') {
  /** @type {Finding[]} */
  const out = [];
  /** @param {unknown} node @param {string} path @returns {void} */
  const walk = (node, path) => {
    if (typeof node === 'string') {
      const finding = stringFinding(node);
      if (finding !== null) out.push({ path: path === '' ? '(root)' : path, finding });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    for (const [key, item] of Object.entries(node)) {
      const here = path === '' ? key : `${path}.${key}`;
      const keyFinding = stringFinding(key);
      if (keyFinding !== null) out.push({ path: here, finding: `the key ${keyFinding}` });
      walk(item, here);
    }
  };
  walk(value, at);
  return Object.freeze(out);
}
