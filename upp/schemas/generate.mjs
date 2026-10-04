// Write the published UPP schema files from their single source of truth.
//
//   node upp/schemas/generate.mjs            # write, and report what changed
//   node upp/schemas/generate.mjs --check    # exit 2 if a committed file is stale
//
// The source of truth is `eip/upp/schemas.mjs`, which the runtime's own validators use. These
// JSON files exist so a plugin written in Python, Java or Rust can read the SAME contract
// instead of a translation of it: a contract nobody can read from outside the process is not
// a contract, it is an implementation detail.
//
// Generated, never hand-edited. `tests/upp-schemas.test.mjs` asserts that the committed bytes
// equal `renderSchemaFile(document())`, so drift is a failing test rather than a surprise in
// another language (criterion U5).
//
// This is the ONLY module under `upp/` that touches disk, and it does nothing on import: the
// work happens solely when it is run as a program. An importer that could trigger a write
// would let a test regenerate the very files it was supposed to be checking.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISHED_SCHEMAS, renderSchemaFile } from '../../eip/upp/schemas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ file: string, path: string, text: string, current: string | null }} Entry */

/** What each published file should contain, and what it contains now.
 * @returns {Entry[]} */
export function plan() {
  return PUBLISHED_SCHEMAS.map(({ file, document }) => {
    const path = join(HERE, file);
    return {
      file,
      path,
      text: renderSchemaFile(document()),
      current: existsSync(path) ? readFileSync(path, 'utf8') : null,
    };
  });
}

/** @param {boolean} checkOnly @returns {number} the process exit code */
export function main(checkOnly) {
  const entries = plan();
  const stale = entries.filter((entry) => entry.current !== entry.text);
  if (checkOnly) {
    for (const entry of stale) {
      process.stdout.write(`STALE ${entry.file} - run: node upp/schemas/generate.mjs\n`);
    }
    process.stdout.write(stale.length === 0
      ? `upp schemas: ${entries.length} file(s) up to date\n`
      : `upp schemas: ${stale.length} stale file(s)\n`);
    return stale.length === 0 ? 0 : 2;
  }
  for (const entry of entries) {
    if (entry.current === entry.text) {
      process.stdout.write(`unchanged ${entry.file}\n`);
      continue;
    }
    writeFileSync(entry.path, entry.text, 'utf8');
    process.stdout.write(`${entry.current === null ? 'created' : 'updated'} ${entry.file}\n`);
  }
  return 0;
}

// Run only as a program. `process.argv[1]` is the script Node was handed, so an `import` of
// this module — from a test, or from another tool — writes nothing.
if (process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  process.exit(main(process.argv.includes('--check')));
}
