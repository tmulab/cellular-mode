// commands.mjs — the verification commands an existing project appears to already have.
//
// EVERY COMMAND HERE IS INFERRED, AND NOTHING IS EVER VERIFIED BY ANALYSIS. A `scripts.test` entry
// is evidence that `npm test` is how this project tests itself; it is not evidence that the command
// runs, that it passes, or that `npm` exists on this machine. Only an approved execution
// (`baseline.mjs`, approval id `baseline-checks`) can establish that, and even then it establishes
// RUNNABILITY and a pre-existing outcome, never correctness.
//
// AN ARGV ARRAY, NEVER A SHELL STRING. A discovered command is untrusted text from somebody else's
// repository. `parseSimpleArgv` therefore refuses anything that would need a shell to mean what it
// says — a pipe, `&&`, a variable, a redirect, a glob, a subshell — and such a line is recorded as
// UNKNOWN TEXT a human reads, not as a command anything may run. That refusal is the reason this
// module can hand its output to `exec.mjs` with `shell: false` and no further thought.
import { sanitize } from './display.mjs';

/** @typedef {'test'|'build'|'lint'|'typecheck'|'other'} CommandLabel */
/** @typedef {{ id: string, label: CommandLabel, argv: ReadonlyArray<string>,
 *   status: 'INFERRED', basis: string }} DiscoveredCommand */
/** @typedef {{ text: string, basis: string, reason: string }} UnknownText */
/** @typedef {{ commands: ReadonlyArray<DiscoveredCommand>,
 *   unknown: ReadonlyArray<UnknownText> }} Discovery */

/** The id prefix of a command PARSED out of a CI file rather than authored by the tables below.
 * Exported because the difference matters downstream: `verification.mjs` writes authored argv
 * arrays into the target's contract and leaves parsed ones as notes for a human, and an id scheme
 * two modules spell separately is an id scheme that drifts. */
export const CI_ID_PREFIX = 'ci-';

/** Characters that make a line a SHELL program rather than a command with arguments. A line holding
 * any of them outside quotes cannot be turned into an argv array honestly. */
const SHELL_CHARS = /[|&;$><`(){}*?!~\\\n\r]/;

/** How long a discovered line may be before it is not worth parsing. */
export const MAX_LINE = 300;

/**
 * PURE and TOTAL. The argv array a simple command line denotes, or `null` when it needs a shell.
 * Quoted arguments are supported because a path with a space is ordinary; an unbalanced quote is a
 * refusal, because guessing where it closes is guessing what the command does.
 * @param {unknown} line @returns {ReadonlyArray<string> | null}
 */
export function parseSimpleArgv(line) {
  if (typeof line !== 'string') return null;
  const text = line.trim();
  if (text === '' || text.length > MAX_LINE) return null;
  /** @type {string[]} */
  const argv = [];
  let current = '';
  let quote = '';
  let started = false;
  for (const char of text) {
    if (quote !== '') {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (started) argv.push(current);
      current = '';
      started = false;
      continue;
    }
    if (SHELL_CHARS.test(char)) return null;
    current += char;
    started = true;
  }
  if (quote !== '') return null;
  if (started) argv.push(current);
  return argv.length === 0 ? null : Object.freeze(argv);
}

/** @param {string} id @param {CommandLabel} label @param {ReadonlyArray<string>} argv
 * @param {string} basis @returns {DiscoveredCommand} */
const command = (id, label, argv, basis) => Object.freeze({
  id, label, argv: Object.freeze([...argv]), status: /** @type {'INFERRED'} */ ('INFERRED'), basis,
});

/** The `package.json` script names that mean each kind of check, and the argv each one implies.
 * `test` is `npm test`; everything else needs `npm run`. */
const SCRIPT_RULES = Object.freeze([
  Object.freeze({ script: 'test', label: /** @type {CommandLabel} */ ('test'), argv: ['npm', 'test'] }),
  Object.freeze({ script: 'typecheck', label: /** @type {CommandLabel} */ ('typecheck'), argv: ['npm', 'run', 'typecheck'] }),
  Object.freeze({ script: 'lint', label: /** @type {CommandLabel} */ ('lint'), argv: ['npm', 'run', 'lint'] }),
  Object.freeze({ script: 'build', label: /** @type {CommandLabel} */ ('build'), argv: ['npm', 'run', 'build'] }),
]);

/** The commands each non-Node build system implies, keyed by the build-system id the detectors
 * report. Data, so that adding an ecosystem is a table entry and not a branch. */
const SYSTEM_RULES = Object.freeze({
  cargo: Object.freeze([
    Object.freeze({ id: 'cargo-test', label: 'test', argv: ['cargo', 'test'] }),
    Object.freeze({ id: 'cargo-build', label: 'build', argv: ['cargo', 'build'] }),
  ]),
  go: Object.freeze([
    Object.freeze({ id: 'go-test', label: 'test', argv: ['go', 'test', './...'] }),
    Object.freeze({ id: 'go-build', label: 'build', argv: ['go', 'build', './...'] }),
  ]),
  maven: Object.freeze([Object.freeze({ id: 'mvn-test', label: 'test', argv: ['mvn', '-q', 'test'] })]),
});

/** @param {import('./detect.mjs').Detection} detection @returns {DiscoveredCommand[]} */
function fromManifests(detection) {
  /** @type {DiscoveredCommand[]} */
  const out = [];
  const pkg = detection.pkg;
  if (pkg !== null) {
    for (const rule of SCRIPT_RULES) {
      if (typeof pkg.scripts[rule.script] === 'string') {
        out.push(command(`npm-${rule.script}`, rule.label, rule.argv, `package.json scripts.${rule.script}`));
      }
    }
  }
  const systems = new Set(detection.buildSystems.map((entry) => entry.id));
  const table = /** @type {Readonly<Record<string, ReadonlyArray<{ id: string, label: CommandLabel, argv: ReadonlyArray<string> }>>>} */ (SYSTEM_RULES);
  for (const [system, rules] of Object.entries(table)) {
    if (!systems.has(system)) continue;
    const basis = detection.buildSystems.find((entry) => entry.id === system)?.evidence ?? system;
    for (const rule of rules) out.push(command(rule.id, rule.label, rule.argv, basis));
  }
  if (detection.testFrameworks.some((entry) => entry.id === 'pytest')) {
    const basis = detection.testFrameworks.find((entry) => entry.id === 'pytest')?.evidence ?? 'pyproject.toml';
    out.push(command('pytest', 'test', ['python', '-m', 'pytest'], basis));
  }
  if (systems.has('gradle') && detection.facts.existingFiles.includes('gradlew')) {
    out.push(command('gradlew-test', 'test', ['./gradlew', 'test'], 'gradlew'));
  }
  for (const target of ['test', 'build', 'lint', 'typecheck']) {
    if (detection.makeTargets.includes(target)) {
      out.push(command(`make-${target}`, /** @type {CommandLabel} */ (target), ['make', target], `Makefile target ${target}:`));
    }
  }
  return out;
}

/** PURE. The label a command line suggests, by its first recognisable word. `other` is the honest
 * default: a line we cannot classify is still a line, and guessing `test` would be worse.
 * @param {ReadonlyArray<string>} argv @returns {CommandLabel} */
export function labelOf(argv) {
  const joined = argv.join(' ').toLowerCase();
  if (/\btest\b/.test(joined)) return 'test';
  if (/\b(?:lint|clippy|eslint|ruff|flake8)\b/.test(joined)) return 'lint';
  if (/\b(?:typecheck|tsc|mypy)\b/.test(joined)) return 'typecheck';
  if (/\bbuild\b/.test(joined)) return 'build';
  return 'other';
}

/**
 * PURE. Every verification command an existing project appears to have, plus the CI lines that
 * could not become one. Deduplicated by argv, so a command named by both a manifest and a workflow
 * keeps the manifest's basis — the stronger of the two.
 * @param {import('./detect.mjs').Detection} detection @returns {Discovery}
 */
export function discoverCommands(detection) {
  /** @type {Map<string, DiscoveredCommand>} */
  const byArgv = new Map();
  for (const entry of fromManifests(detection)) {
    const key = entry.argv.join('\u0000');
    if (!byArgv.has(key)) byArgv.set(key, entry);
  }
  /** @type {UnknownText[]} */
  const unknown = [];
  let index = 0;
  for (const provider of detection.ci) {
    for (const line of provider.runLines) {
      const argv = parseSimpleArgv(line.line);
      if (argv === null) {
        unknown.push(Object.freeze({ text: sanitize(line.line, 100), basis: line.file,
          reason: 'needs a shell to mean what it says, so it is text a human reads and never a command Bootstrap runs' }));
        continue;
      }
      const key = argv.join('\u0000');
      if (byArgv.has(key)) continue;
      index += 1;
      byArgv.set(key, command(`${CI_ID_PREFIX}${index}`, labelOf(argv), argv, line.file));
    }
  }
  return Object.freeze({
    commands: Object.freeze([...byArgv.values()]),
    unknown: Object.freeze(unknown),
  });
}
