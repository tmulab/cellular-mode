#!/usr/bin/env node
// removal-rehearsal.mjs — AD29 and PB3, made mechanical.
//
// Cellular Adaptive and the Cellular Prompt Builder are both OPTIONAL. The only honest way to
// prove that is to DELETE one and run everything again, so this gate does exactly that in a
// disposable copy of the repository:
//
//   npm run rehearse:adaptive-removal     # AD29 — the adaptive module
//   npm run rehearse:builder-removal      # PB3  — the Prompt Builder
//
// Which module is removed is the first argument (default `adaptive`); WHAT each module is
// lives in `./removal-paths.mjs`, as data. Neither is part of `npm test` — each copies a tree
// and runs the whole suite twice over, which is minutes, not seconds. The fast half of the same
// claim is `tests/optional-module-imports.test.mjs`, which reads the import statements without
// deleting anything, and the gate rules that state the arrows are in `./rules.mjs`.
//
// Two rules about the filesystem, because this is the one tool here that removes files:
//   1. it only ever writes inside a directory `mkdtemp` just created for it under `os.tmpdir()`;
//   2. before removing that directory it PRINTS it and re-checks that it is still the one it
//      created, by realpath and by name prefix. Anything else is refused, loudly.
// The repository itself is only ever READ.
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADAPTIVE_PATHS, MODULES, moduleByName } from './removal-paths.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The name every rehearsal directory starts with. Part of the deletion guard. */
export const TEMP_PREFIX = 'cellular-removal-';

// Re-exported because this module is the address callers already know; the lists themselves
// are data and live next door. See `./removal-paths.mjs`.
export { ADAPTIVE_PATHS, MODULES };

/** Never copied: not ours, the record of the work, generated output. `node_modules` is linked
 * instead, because copying 40 MB to prove an unrelated point is a waste. */
const SKIP = new Set(['node_modules', '.git', '.cellular']);

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

/** A path inside the COPY, or a refusal. The one guard every write and delete below goes
 * through. @type {(temp: string, rel: string) => string} */
function inside(temp, rel) {
  const target = join(temp, rel);
  if (!target.startsWith(temp + sep)) throw new Error(`refusing a path outside the copy: ${rel}`);
  return target;
}

/** Deletes one documented path inside the COPY. @type {(temp: string, rel: string) => boolean}
 * `true` when it was there and is gone, `false` when it was already absent. */
function deletePath(temp, rel) {
  const target = inside(temp, rel);
  if (!existsSync(target)) return false;
  rmSync(target, { recursive: true, force: true });
  return true;
}

/** Deletes the documented set inside the COPY. Refuses to touch anything outside it. The two
 * lists are counted apart so the printed tally is about the definition (`paths`) and never
 * inflated by a pending entry that happened to exist.
 * @param {string} temp @param {import('./removal-paths.mjs').RemovableModule} mod
 * @returns {{ deleted: string[], missing: string[], pending: string[], late: string[] }} */
function deleteModule(temp, mod) {
  /** @type {string[]} */
  const deleted = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const pending = [];
  /** @type {string[]} */
  const late = [];
  for (const rel of mod.paths) (deletePath(temp, rel) ? deleted : missing).push(rel);
  for (const rel of mod.pending) (deletePath(temp, rel) ? late : pending).push(rel);
  return { deleted, missing, pending, late };
}

/** Removes the module's own `package.json` scripts, in the COPY only. A convenience name
 * pointing at a deleted entry point is not a dependency, but a manifest that still advertises
 * it describes a command the copy cannot run.
 * @param {string} temp @param {ReadonlyArray<string>} names @returns {string[]} */
function dropScripts(temp, names) {
  if (names.length === 0) return [];
  const file = inside(temp, 'package.json');
  const pkg = /** @type {{ scripts?: Record<string, string> }} */ (JSON.parse(readFileSync(file, 'utf8')));
  /** @type {string[]} */
  const dropped = [];
  for (const name of names) {
    if (pkg.scripts?.[name] === undefined) throw new Error(`package.json has no "${name}" script: the list is stale`);
    delete pkg.scripts[name];
    dropped.push(name);
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return dropped;
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

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const mod = moduleByName(argv.find((arg) => !arg.startsWith('--')) ?? 'adaptive');
say(`🧪 ${mod.label} removal rehearsal — ${mod.claim}`);
const temp = copyRepo();
say(`   copy: ${temp}`);
/** @type {ReturnType<typeof run>[]} */
let results = [];
try {
  const { deleted, missing, pending, late } = deleteModule(temp, mod);
  say(`   deleted ${deleted.length} of ${mod.paths.length} documented paths`);
  for (const name of dropScripts(temp, mod.dropScripts)) say(`   dropped the "${name}" package script`);
  for (const rel of late) say(`   also deleted (pending, and now present — promote it): ${rel}`);
  for (const rel of pending) say(`   PENDING (a concurrent cell owns it, not yet written): ${rel}`);
  if (missing.length > 0) {
    say(`❌ ${missing.length} documented path(s) were ALREADY ABSENT — the list is stale:`);
    for (const rel of missing) say(`   - ${rel}`);
    throw new Error(`the documented ${mod.name} file set does not match this repository`);
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
  ? `✅ ${mod.claim} VERIFIED: the suite and the gates pass with the ${mod.name} module deleted.`
  : `❌ ${mod.claim} FAILED: something outside the module depends on it.`);
process.exit(green ? 0 : 2);
