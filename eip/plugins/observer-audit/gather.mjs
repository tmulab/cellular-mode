// Reading, and only reading. Every byte this plugin ever looks at enters through here.
//
// Four confined ports go in, one plain value comes out, and `audit.mjs` judges that value
// without touching the world. Two properties are worth stating out loud:
//
//   NOTHING IS INVENTED. A file that is absent is absent: `pkg` becomes `null`, a policy
//   becomes its EMPTY fallback and the path is listed as unreadable. An empty allowlist
//   reports MORE findings than the real one, never fewer, so failing to read a policy can
//   never turn into a permission.
//
//   NOTHING IS UNBOUNDED. A per-file cap and a total budget mean a report cannot become a
//   memory exhaustion; whatever the budget refuses is RETURNED as `skipped`, and the audit
//   says so in a finding instead of quietly covering less than it claims.
import { parseEvidence } from '../../../tools/gates/evidence.mjs';

/** @typedef {import('../../../tools/gates/types.mjs').FileTuple} FileTuple */
/** @typedef {import('./types.mjs').RepoFile} RepoFile */

/** One handwritten file is text, not a payload. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** The whole repository as text, with room for a large documentation tree. */
export const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

/**
 * The JSON inputs the rules depend on, with the value that stands in when one cannot be
 * read and whether its ABSENCE is worth reporting.
 *
 * Each fallback is the EMPTY policy, deliberately: fail closed. And absence means two
 * different things here, so it is answered two different ways — a repository with no
 * `policy/` directory is the healthy case (`tools/gates/scan.mjs` says the same), while a
 * repository with no `package.json` has nothing for the manifest half of the dependency
 * rule to check, and that is a gap a reader must be told about.
 */
export const JSON_INPUTS = Object.freeze({
  pkg: { path: 'package.json', fallback: null, requiredFile: true },
  sizeExceptions: { path: 'policy/size-exceptions.json', fallback: /** @type {unknown} */ ([]), requiredFile: false },
  secretsAllowlist: { path: 'policy/secrets-allowlist.json', fallback: /** @type {unknown} */ ([]), requiredFile: false },
  allowedDependencies: {
    path: 'policy/allowed-dependencies.json',
    fallback: /** @type {unknown} */ ({ allowed: [] }),
    requiredFile: false,
  },
});

/** @typedef {{ readRepoFile: (rel: string) => Promise<string | null>,
 *   listRepoFiles: () => Promise<RepoFile[]>, readEvidence: () => Promise<unknown>,
 *   readHead: () => Promise<string | null> }} Readers */

/**
 * Read one JSON input. Invalid JSON is always reported; a MISSING file is reported only
 * when the rules actually needed it.
 * @param {Readers['readRepoFile']} read
 * @param {{ path: string, fallback: unknown, requiredFile: boolean }} input
 * @returns {Promise<{ value: unknown, unreadable: string | null }>}
 */
async function readJson(read, { path, fallback, requiredFile }) {
  const text = await read(path);
  if (text === null) return { value: fallback, unreadable: requiredFile ? path : null };
  try {
    return { value: JSON.parse(text), unreadable: null };
  } catch {
    return { value: fallback, unreadable: path };
  }
}

/**
 * Everything one audit needs, read once.
 * @param {Readers} readers
 * @returns {Promise<Omit<import('./types.mjs').AuditInput, 'at' | 'model'>>}
 */
export async function gather({ readRepoFile, listRepoFiles, readEvidence, readHead }) {
  const listed = await listRepoFiles();
  /** @type {FileTuple[]} */
  const files = [];
  /** @type {string[]} */
  const skipped = [];
  let budget = MAX_TOTAL_BYTES;
  for (const file of listed) {
    if (file.size > MAX_FILE_BYTES || file.size > budget) {
      skipped.push(file.path);
      continue;
    }
    const text = await readRepoFile(file.path);
    if (text === null) {
      // Listed a moment ago and gone now: a racing editor, not an escape. Reported, so a
      // reader never mistakes a shrinking scope for a clean repository.
      skipped.push(file.path);
      continue;
    }
    budget -= file.size;
    files.push({ path: file.path, text });
  }

  /** @type {string[]} */
  const unreadable = [];
  /** @type {Record<string, unknown>} */
  const values = {};
  for (const [key, input] of Object.entries(JSON_INPUTS)) {
    const answer = await readJson(readRepoFile, input);
    values[key] = answer.value;
    if (answer.unreadable !== null) unreadable.push(answer.unreadable);
  }
  const pkg = values['pkg'];

  return {
    files,
    listed,
    skipped,
    pkg: pkg !== null && typeof pkg === 'object' ? /** @type {Record<string, unknown>} */ (pkg) : null,
    policies: {
      sizeExceptions: values['sizeExceptions'],
      secretsAllowlist: values['secretsAllowlist'],
      allowedDependencies: values['allowedDependencies'],
      unreadable,
    },
    evidence: parseEvidence(await readEvidence()),
    head: await readHead(),
  };
}
