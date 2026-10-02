// secrets.mjs — secret-exposure scan, as a pure function over text tuples.
//
// This was the secret half of tests/leaks.test.mjs. It moved here so that the CLI
// (`npm run gates`) and the hygiene test enforce ONE set of shapes: the test now
// imports from this module instead of keeping a second copy that can drift.
//
// Every detector source is assembled from fragments at runtime, exactly as the leak
// test does it, so THIS FILE never contains a literal match and never flags itself.
// A scanner that trips on its own rule book teaches people to add exclusions.
//
// WHAT THIS DOES NOT PROVE: nothing here proves the repository is secure. It proves
// that a handful of well-known credential SHAPES are absent from the checked text.
// A secret with an unusual shape, a secret in a file we do not read, or a secret in
// the history of a version-control system we do not inspect, all pass.
/** @typedef {import('./types.mjs').FileTuple} FileTuple */
/** @typedef {import('./types.mjs').Finding} Finding */
/** One allowlist entry, before validation says whether it is one: a bag of `unknown`
 * read field by field, which is all a policy file can promise.
 * @typedef {Record<string, unknown>} RawAllow
 */

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

/**
 * Detector shapes. `why` is written for the person who has to fix the finding.
 * Order is reporting order.
 */
export const SECRET_SHAPES = [
  { rule: 'private-key-block', re: new RegExp(j('BEGIN ', '[A-Z ]*', 'PRIVATE KEY')), why: 'private key block' },
  { rule: 'aws-access-key-id', re: new RegExp(j('\\b', 'AKI', 'A', '[0-9A-Z]{16}', '\\b')), why: 'cloud access key id' },
  {
    rule: 'aws-secret-key',
    re: new RegExp(j('aws', '_', 'secret', '_', 'access', '_', 'key', '\\s*[:=]\\s*', '\\S{20,}'), 'i'),
    why: 'cloud secret access key assignment',
  },
  {
    rule: 'github-token',
    re: new RegExp(j('\\b', 'g', 'h', '[pousr]', '_', '[A-Za-z0-9]{20,}')),
    why: 'code-forge access token',
  },
  {
    rule: 'github-pat',
    re: new RegExp(j('\\b', 'github', '_', 'pat', '_', '[A-Za-z0-9_]{20,}')),
    why: 'code-forge fine-grained access token',
  },
  {
    rule: 'model-api-key',
    re: new RegExp(j('\\b', 's', 'k', '-', '[A-Za-z0-9_-]{20,}')),
    why: 'model-provider API key',
  },
  {
    rule: 'slack-token',
    re: new RegExp(j('\\b', 'x', 'o', 'x', '[baprs]', '-', '[A-Za-z0-9-]{10,}')),
    why: 'chat-platform token',
  },
  {
    rule: 'generic-credential-assignment',
    re: new RegExp(
      j('\\b', '(?:pass', 'word|pass', 'wd|sec', 'ret|to', 'ken|api', '[_-]?', 'key)', '\\s*[:=]\\s*', '[\'"]', '[^\'"]{8,}', '[\'"]'),
      'i',
    ),
    why: 'a credential-shaped name assigned a quoted literal of eight characters or more',
  },
];

const REQUIRED_FIELDS = ['path', 'rule', 'rationale', 'approvedBy'];

/** An allowlist entry without a rationale is not an allowlist entry.
 * @param {unknown} allowlist @returns {Finding[]} */
export function validateAllowlist(allowlist) {
  if (!Array.isArray(allowlist)) {
    return [{ rule: 'secrets:policy-shape', path: 'policy/secrets-allowlist.json', detail: 'must be a JSON array' }];
  }
  /** @type {Finding[]} */
  const findings = [];
  allowlist.forEach((/** @type {RawAllow | null} */ entry, /** @type {number} */ i) => {
    const at = `policy/secrets-allowlist.json[${i}]`;
    if (entry === null || typeof entry !== 'object') {
      findings.push({ rule: 'secrets:policy-shape', path: at, detail: 'entry must be an object' });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string' || value.trim() === '') {
        findings.push({ rule: 'secrets:policy-incomplete', path: at, detail: `missing ${field}` });
      }
    }
  });
  return findings;
}

/**
 * Does the allowlist cover this (path, rule)? `rule: '*'` covers every detector for
 * that path; a trailing `/` on `path` covers a directory. Only complete entries
 * count - an entry missing a rationale is reported, not honoured.
 * @param {string} path @param {string} rule @param {unknown} [allowlist] @returns {boolean}
 */
export function isAllowed(path, rule, allowlist = []) {
  if (!Array.isArray(allowlist)) return false;
  return allowlist.some((/** @type {RawAllow | null} */ e) => {
    if (!e || typeof e.path !== 'string') return false;
    if (typeof e.rationale !== 'string' || e.rationale.trim() === '') return false;
    const pathHit = e.path.endsWith('/') ? path.startsWith(e.path) : path === e.path;
    return pathHit && (e.rule === '*' || e.rule === rule);
  });
}

/**
 * PURE. `files` is `[{ path, text }]`. Returns `{ rule, path, line, detail }` per
 * hit, plus any policy findings. Line numbers are 1-based so the report is an
 * address, not a hint.
 * @param {ReadonlyArray<FileTuple>} files @param {unknown} [allowlist] @returns {Finding[]}
 */
export function checkSecrets(files, allowlist = []) {
  const findings = validateAllowlist(allowlist);
  for (const { path, text } of files) {
    const lines = String(text ?? '').split('\n');
    for (const { rule, re, why } of SECRET_SHAPES) {
      if (isAllowed(path, rule, allowlist)) continue;
      lines.forEach((line, i) => {
        if (re.test(line)) {
          findings.push({ rule: `secrets:${rule}`, path, line: i + 1, detail: `${why} at ${path}:${i + 1}` });
        }
      });
    }
  }
  return findings;
}
