// deps.mjs — dependency integrity for a project that claims zero dependencies.
//
// "Zero dependencies" is a claim about two different things, and both are checked:
//   1. the manifest: package.json dependencies + devDependencies must be empty;
//   2. the code: every import specifier must be relative or a `node:` built-in.
// Checking only (1) would miss a bare `import x from 'left-pad'` that happens to
// resolve on a developer's machine through a hoisted node_modules; checking only (2)
// would miss a declared dependency nobody imports yet. Together they are the proof.
//
// LOCKFILE: there is none, and that is the expected state. A lockfile pins what was
// installed; nothing is installed, so there is nothing to pin and nothing to drift.
// The absence is therefore reported as consistent, never as a missing artefact.

/** @typedef {import('./types.mjs').FileTuple} FileTuple */
/** @typedef {import('./types.mjs').Finding} Finding */
/** One entry of policy/allowed-dependencies.json, before validation: a bag of
 * `unknown` read field by field, which is all a policy file can promise.
 * @typedef {Record<string, unknown>} RawAllowedDependency
 */

const MANIFEST_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const REQUIRED_FIELDS = ['name', 'rationale', 'approvedBy'];

/** Normalises policy/allowed-dependencies.json into `{ names, findings }`.
 * @param {unknown} policy @returns {{ names: Set<string>, findings: Finding[] }} */
export function readAllowed(policy) {
  const wrapper = /** @type {{ allowed?: unknown }} */ (policy ?? {});
  const list = Array.isArray(policy) ? policy : Array.isArray(wrapper.allowed) ? wrapper.allowed : null;
  if (list === null) {
    return {
      names: new Set(),
      findings: [{ rule: 'deps:policy-shape', path: 'policy/allowed-dependencies.json', detail: 'expected an array, or an object with an `allowed` array' }],
    };
  }
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Set<string>} */
  const names = new Set();
  list.forEach((/** @type {RawAllowedDependency | null} */ entry, /** @type {number} */ i) => {
    const at = `policy/allowed-dependencies.json[${i}]`;
    if (entry === null || typeof entry !== 'object') {
      findings.push({ rule: 'deps:policy-shape', path: at, detail: 'entry must be an object' });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string' || value.trim() === '') {
        findings.push({ rule: 'deps:policy-incomplete', path: at, detail: `missing ${field}` });
      }
    }
    if (typeof entry.name === 'string' && entry.name.trim() !== '') names.add(entry.name);
  });
  return { names, findings };
}

/** PURE. Manifest half: declared dependencies must all be allowed.
 * @param {Record<string, unknown> | null | undefined} pkg
 * @param {Set<string>} [allowedNames] @returns {Finding[]} */
export function checkManifest(pkg, allowedNames = new Set()) {
  /** @type {Finding[]} */
  const findings = [];
  for (const field of MANIFEST_FIELDS) {
    const block = pkg?.[field];
    if (block === undefined) continue;
    if (block === null || typeof block !== 'object') {
      findings.push({ rule: 'deps:manifest-shape', path: 'package.json', detail: `${field} must be an object` });
      continue;
    }
    for (const name of Object.keys(block)) {
      if (!allowedNames.has(name)) {
        findings.push({
          rule: 'deps:undeclared-dependency',
          path: 'package.json',
          detail: `${field}.${name} is not listed in policy/allowed-dependencies.json with a rationale`,
        });
      }
    }
  }
  return findings;
}

/**
 * Import specifiers of one module text, in source order. Covers static
 * `import`/`export ... from`, bare `import 'x'` side-effect imports, and dynamic
 * `import('x')` with a literal argument. A dynamic import of a computed expression
 * is invisible to any static reader - that limitation is in the README, not hidden.
 *
 * Comments are stripped FIRST. Without that step the gate reports the examples in
 * its own documentation as violations, and a team whose gate cries wolf learns to
 * add exclusions instead of reading findings.
 * @param {unknown} text @returns {string}
 */
export function stripComments(text) {
  return String(text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:/'"`\\])\/\/[^\n]*/gm, '$1');
}

/** @param {unknown} text @returns {string[]} */
export function importSpecifiers(text) {
  /** @type {string[]} */
  const found = [];
  const source = stripComments(text);
  const patterns = [
    /^[^\S\n]*(?:import|export)[^'"]*?\sfrom\s*['"]([^'"]+)['"]/gm,
    /^[^\S\n]*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const specifier = m[1];
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

/** A specifier the project is allowed to use without any dependency at all.
 * @param {string} specifier @returns {boolean} */
export function isLocalOrBuiltin(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:');
}

/** PURE. Code half: no bare specifiers outside the allowlist.
 * @param {ReadonlyArray<FileTuple>} files @param {Set<string>} [allowedNames]
 * @returns {Finding[]} */
export function checkImports(files, allowedNames = new Set()) {
  /** @type {Finding[]} */
  const findings = [];
  for (const { path, text } of files) {
    if (!/\.(mjs|js)$/.test(path)) continue;
    for (const specifier of importSpecifiers(text)) {
      if (isLocalOrBuiltin(specifier)) continue;
      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : (specifier.split('/')[0] ?? specifier);
      if (allowedNames.has(pkgName)) continue;
      findings.push({
        rule: 'deps:bare-specifier',
        path,
        detail: `imports "${specifier}" - a zero-dependency project may import only relative paths and node: built-ins`
          + ' (unprefixed built-ins included: use node:fs, not fs)',
      });
    }
  }
  return findings;
}

/** PURE. Both halves plus the policy check, in one call.
 * @param {{ pkg?: Record<string, unknown> | null, files?: ReadonlyArray<FileTuple>,
 *   policy?: unknown }} input @returns {Finding[]} */
export function checkDeps({ pkg, files = [], policy = { allowed: [] } }) {
  const { names, findings } = readAllowed(policy);
  return [...findings, ...checkManifest(pkg, names), ...checkImports(files, names)];
}
