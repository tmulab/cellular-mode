#!/usr/bin/env node
// removal-rehearsal.mjs — AD29, made mechanical.
//
// Cellular Adaptive is OPTIONAL. The only honest way to prove that is to DELETE it and run
// everything again, so this gate does exactly that in a disposable copy of the repository:
//
//   npm run rehearse:adaptive-removal
//
// It is not part of `npm test` — it copies a tree and runs the whole suite twice over, which
// is minutes, not seconds. The fast half of the same claim is `tests/optional-module-imports.test.mjs`,
// which reads the import statements without deleting anything.
//
// Two rules about the filesystem, because this is the one tool here that removes files:
//   1. it only ever writes inside a directory `mkdtemp` just created for it under `os.tmpdir()`;
//   2. before removing that directory it PRINTS it and re-checks that it is still the one it
//      created, by realpath and by name prefix. Anything else is refused, loudly.
// The repository itself is only ever READ.
import { cpSync, existsSync, lstatSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The name every rehearsal directory starts with. Part of the deletion guard. */
export const TEMP_PREFIX = 'cellular-removal-';

/** Never copied: not ours, the record of the work, generated output. `node_modules` is linked
 * instead, because copying 40 MB to prove an unrelated point is a waste. */
const SKIP = new Set(['node_modules', '.git', '.cellular']);

/**
 * THE DOCUMENTED ADAPTIVE FILE SET — what "the adaptive module" means, as data.
 *
 * This list is the definition AD29 is checked against. Adding a file to the module without
 * adding it here makes the rehearsal weaker, which is why the gate prints the set it deleted
 * and fails if a path in it is already absent: a stale entry is a silent hole.
 * @type {ReadonlyArray<string>}
 */
export const ADAPTIVE_PATHS = Object.freeze([
  'adaptive',
  'tools/adaptive',
  'skills/mode',
  'adapters/claude-code/settings.adaptive.json',
  'eip/plugins/adaptive-preferences',
  'eip/plugins/adaptive-preferences-contract.test.mjs',
  'eip/plugins/adaptive-preferences-fixture.mjs',
  'eip/plugins/adaptive-preferences-http.test.mjs',
  'eip/plugins/adaptive-preferences.test.mjs',
  'eip/host/adaptive-read-port.mjs',
  'eip/host/adaptive-read-port.test.mjs',
  'tests/adaptive-integration.test.mjs',
  'tests/gates-adaptive-boundary.test.mjs',
  'apps/observer/tests/mode-invariant.test.mjs',
  'apps/observer/tests/mode-view.test.mjs',
  ...['tired', 'ready', 'focus', 'explore', 'modocansado', 'modoestoubem', 'modofoco', 'modoexplorar']
    .flatMap((name) => [
      `.claude/skills/${name}`,
      `adapters/claude-code/.claude/skills/${name}`,
    ]),
]);

/** @param {string} text */
const say = (text) => process.stdout.write(`${text}\n`);

/** A copy of the repository in a fresh temp directory. @returns {string} */
function copyRepo() {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), TEMP_PREFIX));
  cpSync(ROOT, temp, {
    recursive: true,
    dereference: false,
    filter: (src) => !SKIP.has(basename(src)),
  });
  const modules = join(ROOT, 'node_modules');
  if (existsSync(modules)) {
    try {
      // A junction (Windows) or a directory symlink (POSIX): `tsc` and `node --test` only read it.
      symlinkSync(modules, join(temp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      cpSync(modules, join(temp, 'node_modules'), { recursive: true });
    }
  }
  return temp;
}

/** Deletes the documented set inside the COPY. Refuses to touch anything outside it.
 * @param {string} temp @returns {{ deleted: string[], missing: string[] }} */
function deleteAdaptive(temp) {
  /** @type {string[]} */
  const deleted = [];
  /** @type {string[]} */
  const missing = [];
  for (const rel of ADAPTIVE_PATHS) {
    const target = join(temp, rel);
    if (!target.startsWith(temp + sep)) throw new Error(`refusing a path outside the copy: ${rel}`);
    if (!existsSync(target)) {
      missing.push(rel);
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    deleted.push(rel);
  }
  return { deleted, missing };
}

/** Runs one command in the copy and reports its exit code and tail.
 * @param {string} temp @param {string} label @param {string[]} args
 * @returns {{ label: string, ok: boolean, code: number, tail: string }} */
function run(temp, label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: temp, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const code = result.status ?? 1;
  return {
    label,
    ok: code === 0,
    code,
    tail: text.split('\n').filter((line) => line.trim() !== '').slice(-14).join('\n'),
  };
}

/** Removes the temp directory, and ONLY one this process created under `os.tmpdir()`.
 * @param {string} temp */
export function removeTemp(temp) {
  const base = realpathSync(tmpdir());
  const real = realpathSync(temp);
  if (!real.startsWith(base + sep) || !basename(real).startsWith(TEMP_PREFIX)) {
    throw new Error(
      `refusing to delete ${real}: a rehearsal only removes a ${TEMP_PREFIX}* directory `
      + `directly under ${base}. Remove it by hand if you still want it gone.`,
    );
  }
  const modules = join(real, 'node_modules');
  try {
    // Unlink the junction FIRST, so a recursive remove can never walk into the real tree.
    if (lstatSync(modules).isSymbolicLink()) unlinkSync(modules);
  } catch { /* copied, or absent: the recursive remove below handles both */ }
  rmSync(real, { recursive: true, force: true });
}

const keep = process.argv.includes('--keep');
say('🧪 Cellular Adaptive removal rehearsal — AD29');
const temp = copyRepo();
say(`   copy: ${temp}`);
/** @type {ReturnType<typeof run>[]} */
let results = [];
try {
  const { deleted, missing } = deleteAdaptive(temp);
  say(`   deleted ${deleted.length} of ${ADAPTIVE_PATHS.length} documented paths`);
  if (missing.length > 0) {
    say(`❌ ${missing.length} documented path(s) were ALREADY ABSENT — the list is stale:`);
    for (const rel of missing) say(`   - ${rel}`);
    throw new Error('the documented adaptive file set does not match this repository');
  }
  results = [
    run(temp, 'npm test (node --test)', ['--test']),
    run(temp, 'node tools/gates/check-all.mjs', [join(temp, 'tools', 'gates', 'check-all.mjs')]),
  ];
} finally {
  if (keep) say(`   kept (--keep): ${temp}`);
  else {
    say(`   removing: ${temp}`);
    removeTemp(temp);
  }
}

for (const result of results) {
  say(`${result.ok ? '✅' : '❌'} ${result.label} — exit ${result.code}`);
  if (!result.ok) say(result.tail.replace(/^/gm, '   '));
}
const green = results.length > 0 && results.every((result) => result.ok);
say(green
  ? '✅ AD29 VERIFIED: the suite and the gates pass with the adaptive module deleted.'
  : '❌ AD29 FAILED: something outside the module depends on it.');
process.exit(green ? 0 : 2);
