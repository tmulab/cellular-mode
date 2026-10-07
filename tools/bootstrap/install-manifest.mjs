// install-manifest.mjs — `vault/install-manifest.json`, the authoritative record of what was
// installed (decision BS2). Schema `cellular-mode/install-manifest`, version 1, exactly the key
// set `bootstrap/CONTRACTS.md` declares.
//
// Three properties are worth more than the schema itself.
//   CLOSED — an unknown key anywhere is an error, at every level. A record that quietly accepted
//     a field would be a record whose next version nobody can read with confidence.
//   RELATIVE — every path is target-relative and `pathProblem`-clean, and the target is named by
//     its BASENAME: this file is committed, and a committed file naming somebody's home
//     directory has published it.
//   PUBLISHABLE — `publicationFindings` runs over the whole document, keys and values alike, so a
//     secret-shaped string cannot reach it through a field nobody thought about.
//
// Validated on write AND on read, because a validator enforced only upstream is one with a
// bypass. `buildInstallManifest` is pure: it takes the clock as a parameter, so the same install
// described twice produces the same bytes twice.
import { CODES, refuse } from './errors.mjs';
import { publicationFindings } from './publication.mjs';
import {
  BASENAME, COMMIT, HOST_KEYS, ISO, SOURCE_KEYS, TOP_KEYS,
  checkLists, checkStrings, container, fail,
} from './install-manifest-parts.mjs';

/** @typedef {import('./install-manifest-parts.mjs').ManifestError} ManifestError */
/** @typedef {{ path: string, mode: string, created: boolean, sha256Before: string | null,
 *   sha256After: string, block?: string | null, blockSha256?: string | undefined }} FileRecord */
/** @typedef {{ kind: string, status: string, detail: string }} IntegrationRecord */

export const SCHEMA = 'cellular-mode/install-manifest';
export const VERSION = 1;
export { FILE_MODES, INTEGRATION_KINDS, INTEGRATION_STATUS } from './install-manifest-parts.mjs';

/**
 * PURE and TOTAL. Every complaint about a candidate manifest, publication findings included.
 * @param {unknown} value @returns {{ ok: boolean, errors: ReadonlyArray<ManifestError> }}
 */
export function validateInstallManifest(value) {
  /** @type {ManifestError[]} */
  const errors = [];
  const manifest = container(value, 'manifest', TOP_KEYS, errors);
  if (manifest === null) return { ok: false, errors: Object.freeze(errors) };
  if (manifest.schema !== SCHEMA) errors.push(fail('schema', `must be "${SCHEMA}"`));
  if (manifest.version !== VERSION) errors.push(fail('version', `must be ${VERSION}`));
  if (typeof manifest.profile !== 'string' || manifest.profile === '') {
    errors.push(fail('profile', 'must name the profile installed'));
  }
  if (!ISO.test(String(manifest.installedAt))) errors.push(fail('installedAt', 'must be an ISO-8601 instant'));
  const source = container(manifest.source, 'source', SOURCE_KEYS, errors);
  if (source !== null) {
    for (const key of ['name', 'version']) {
      if (typeof source[key] !== 'string' || source[key] === '') {
        errors.push(fail(`source.${key}`, `${key} must be a non-empty string`));
      }
    }
    if (source.revision !== null && !COMMIT.test(String(source.revision))) {
      errors.push(fail('source.revision', 'must be a 40-character commit id, or null when it was not established'));
    }
  }
  const target = container(manifest.target, 'target', ['name'], errors);
  if (target !== null && !BASENAME.test(String(target.name))) {
    errors.push(fail('target.name', 'must be a plain directory basename, never a path'));
  }
  const host = container(manifest.host, 'host', HOST_KEYS, errors);
  if (host !== null) {
    for (const key of ['languages', 'buildSystems', 'ci']) checkStrings(host[key], `host.${key}`, errors);
    if (typeof host.hooks !== 'string' || host.hooks === '') {
      errors.push(fail('host.hooks', 'hooks names the machinery detected'));
    }
  }
  checkLists(manifest, errors);
  for (const finding of publicationFindings(value)) {
    errors.push(fail(finding.path, `must not be published: it ${finding.finding}`));
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** PURE. One file entry, with `block` present only when there is one — an explicit `null` in a
 * committed record is a key whose meaning the next reader has to guess.
 *
 * `block` is `{ component, sha256 }`: the component it belongs to AND the digest of the block as
 * written, markers included. The digest is what lets `uninstall` tell an intact block from one
 * somebody edited, which no hash of the whole file can answer — the rest of that file is theirs to
 * change. A record written before the digest existed carries the bare component name; the reader
 * accepts it and reports the block's integrity as UNKNOWN rather than assuming it.
 * @param {FileRecord} file @returns {Record<string, unknown>} */
function fileEntry(file) {
  const base = {
    path: file.path, mode: file.mode, created: file.created,
    sha256Before: file.sha256Before, sha256After: file.sha256After,
  };
  if (file.block === undefined || file.block === null) return base;
  return { ...base, block: typeof file.blockSha256 === 'string'
    ? { component: file.block, sha256: file.blockSha256 }
    : file.block };
}

/**
 * PURE. The manifest for one completed install. Lists are sorted so that two installs of the
 * same plan produce byte-identical records.
 * @param {{ plan: { profile: string, components: ReadonlyArray<{ id: string }> },
 *   results: ReadonlyArray<FileRecord>,
 *   source: { name: string, version: string, revision: string | null },
 *   targetName: string, approvals: ReadonlyArray<{ action: string, at: string }>,
 *   integrations: ReadonlyArray<IntegrationRecord>,
 *   host: { languages: ReadonlyArray<string>, buildSystems: ReadonlyArray<string>,
 *     ci: ReadonlyArray<string>, hooks: string },
 *   componentVersions: Readonly<Record<string, string>>,
 *   limitations: ReadonlyArray<string>, now: string }} input
 * @returns {Record<string, unknown>}
 */
export function buildInstallManifest(input) {
  const files = [...input.results].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    schema: SCHEMA,
    version: VERSION,
    source: {
      name: input.source.name, version: input.source.version, revision: input.source.revision,
    },
    profile: input.plan.profile,
    components: input.plan.components
      .map(({ id }) => ({ id, componentVersion: input.componentVersions[id] ?? '0.0.0' })),
    installedAt: input.now,
    target: { name: input.targetName },
    files: files.map(fileEntry),
    integrations: input.integrations.map((entry) => ({ ...entry })),
    approvals: [...input.approvals].map((entry) => ({ ...entry })),
    host: {
      languages: [...input.host.languages],
      buildSystems: [...input.host.buildSystems],
      ci: [...input.host.ci],
      hooks: input.host.hooks,
    },
    limitations: [...input.limitations],
  };
}

/** The manifest, or a BAD_MANIFEST refusal. The single gate both the writer and a later reader
 * pass through. @param {unknown} value @returns {Record<string, unknown>} */
export function assertInstallManifest(value) {
  const result = validateInstallManifest(value);
  if (!result.ok) {
    throw refuse(CODES.BAD_MANIFEST, `the install manifest is not usable: ${result.errors.length} error(s)`,
      { errors: result.errors.map((error) => `${error.path}: ${error.message}`) });
  }
  return /** @type {Record<string, unknown>} */ (value);
}
