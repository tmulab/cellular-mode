# Threat model — Cellular Bootstrap

Status: VERIFIED where a test is named, UNKNOWN or LIMITATION where this document says so.
Produced by the ordered pass in `skills/harden/SKILL.md` §2, applied to Bootstrap as a cluster of
**new capabilities**: it writes into a directory it does not own, and it starts programs. Decision
BS1 governs it — gates are strengthened, never weakened.

## What this now does that nothing here did before

Four new verbs, and no others. It **reads** an untrusted repository it was pointed at; it **writes**
files into that repository, confined; it **starts programs** (git probes, the optional Builder's
CLI, and project checks a human approved by id); and it **generates** text — `AGENTS.md`, a
verification contract, an install manifest, an additive CI workflow — from templates plus facts.
It does not open a socket, read an environment secret, edit a workflow, replace a file, activate a
cell, or touch this repository's own `vault/state/`.

## Assets

| Asset | Why it matters |
|---|---|
| The target repository | somebody else's work; a wrong write is a destroyed project |
| `vault/install-manifest.json` in the target | committed project history, so everything in it is published |
| `vault/adoption-baseline.json` | the pre-existing truth a later claim is measured against |
| `vault/verification.json` | decides which commands Article 8 will run in that project |
| The plan a human approves from | the report is the only place consent is formed; a forged line is consent taken |
| This checkout (the source) | read-only to Bootstrap, and must stay that way |

## Trust boundaries

1. **Target repository content → the process** (`existing --analyze`, drift checks). Untrusted text,
   untrusted filenames, untrusted links, untrusted size.
2. **Specifications and contracts → the process.** Component manifests, `vault/verification.json`,
   `vault/project-contract.json`: data, possibly hand-edited, possibly hostile.
3. **An install manifest on disk → a DELETION.** `uninstall` acts on a record it did not just write.
4. **CLI arguments → a plan.** Profiles, component ids, approval ids, `--force-modified` names.
5. **The process → a subprocess.** git, the Builder's CLI, approved project checks.
6. **The process → generated artefacts.** Where quoted data could become instruction or structure.

## Threats, mitigation, test

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | A path escapes the target (`..`, absolute, drive, NUL) | one `confine` on the way to every read, write and deletion; `pathProblem` first | `bootstrap-writer.test.mjs`, `bootstrap-remove.test.mjs` |
| T2 | A symlink or NTFS junction standing in the path redirects a write or a deletion outside | every existing segment is `lstat`ed and refused if it is a link; the deepest existing ancestor is real-pathed and must stay inside | `bootstrap-writer.test.mjs`, `bootstrap-remove.test.mjs`, `bootstrap-harden-install.test.mjs` |
| T3 | An install or uninstall touches anything outside the target | a full install **and** uninstall run beside a sentinel sibling directory, hashed before and after | `bootstrap-harden-install.test.mjs` |
| T4 | A filename forges a line of the report a human approves from | a control, newline or bidi character in a path is a REFUSAL (`pathProblem` → `controlProblem`), and everything printed also crosses `sanitize` | `bootstrap-harden-input.test.mjs`, `bootstrap-render.test.mjs` |
| T5 | A filename reaches a command line (`-rf`, `$(id)`, `&& rm`) | no filename is ever passed to a subprocess: every argv is literals, bar one target DIRECTORY after a `--root` flag | `bootstrap-harden.test.mjs` (static), `bootstrap-harden-input.test.mjs` (a real install over such names) |
| T6 | A command string is interpreted by a shell | one spawner, `shell: false`, argv array, timeout, output cap; no `exec`/`execSync`/`execFile`/`fork` anywhere; a contract argv naming `sh -c`, `cmd /c`, `powershell -Command` is refused by name | `bootstrap-harden.test.mjs`, `tests/gates-verification-contract.test.mjs` |
| T7 | A component manifest escapes, anchors, smuggles an extra key or names a mode nobody implements | closed key set, closed mode list, `pathProblem` on `source` and `target`, hand-written validator | `bootstrap-harden-input.test.mjs`, `bootstrap-manifest.test.mjs` |
| T8 | A huge or unreadable file exhausts memory instead of being refused | size is read **before** the bytes, against a named ceiling, for target files and for the verification contract | `bootstrap-writer.test.mjs`, `tests/gates-verification-suite.test.mjs` |
| T9 | A tampered install manifest drives a deletion | the manifest is validated before anything is removed, and each file is re-hashed immediately before its unlink; a mismatch is kept and reported | `bootstrap-remove.test.mjs`, `bootstrap-uninstall-keep.test.mjs` |
| T10 | A secret in the target is copied into an installed file or recorded in the manifest | manifests are read by name only, never scanned; every manifest string crosses `publication.stringFinding`; a secret-shaped target leaves no secret in any install output | `bootstrap-detect.test.mjs`, `bootstrap-record.test.mjs`, `bootstrap-harden-install.test.mjs` |
| T11 | An absolute or home path is published in committed history | the target is named by its basename alone; every composed artefact of a full install is scanned for a drive letter, a home directory, the temp directory and the source checkout | `bootstrap-harden-install.test.mjs`, `bootstrap-new.test.mjs` |
| T12 | Instruction-like text in the target becomes text in a generated `AGENTS.md`, block or CI workflow | generated artefacts are template text plus sanitized basenames and ids; repository prose is never inlined | `bootstrap-harden-install.test.mjs` |
| T13 | An existing file is replaced, or a workflow edited | Bootstrap never replaces: it appends ONE delimited managed block to a file whose comment syntax is on a closed list, with an approval; everything else is a proposed patch | `bootstrap-install.test.mjs`, `bootstrap-article8.test.mjs`, `bootstrap-verification.test.mjs` |
| T14 | Analysis runs the project's code, or rewrites `.git` | analysis never executes a discovered command; git probes are read-only with `GIT_OPTIONAL_LOCKS=0`, `--no-optional-locks` and `core.fsmonitor=false`; whole-tree hashes INCLUDE `.git` | `bootstrap-idempotence.test.mjs` |
| T15 | A project command becomes mandatory on nobody's authority | `mandatory` is valid only for a VERIFIED check or one with a recorded human approval; a contract with zero mandatory checks fails closed | `tests/verification-contract.test.mjs`, `tests/gates-verification-suite.test.mjs` |
| T16 | A hook or a CI file is installed without consent | five conditions **and** `--confirm` for `core.hooksPath`; a workflow is additive, approved, and never written over an existing one | `bootstrap-article8.test.mjs`, CI integration tests |
| T17 | A re-run repairs, reinstalls or deletes silently | an existing manifest makes `new`/`existing` refuse with exit 3 and zero writes; every dry run is hash-checked; `uninstall` twice is "not installed" | `bootstrap-idempotence.test.mjs` |
| T18 | Anything is fetched or sent over a network | no network module may be imported, by gate rule; a full install succeeds with the proxy variables pointed at a closed port | `tests/gates-bootstrap-boundary.test.mjs`, `bootstrap-harden-input.test.mjs` |
| T19 | The optional Bootstrap becomes load-bearing | nothing outside `tools/bootstrap/` imports it; removal is rehearsed in a disposable copy | `tests/gates-bootstrap-boundary.test.mjs`, `npm run rehearse:bootstrap-removal` |

## The six questions, answered

1. **New verbs:** read a pointed-at repository, write confined files into it, start a bounded
   program, generate text from templates. No socket, no secret read, no state transition.
2. **Who can reach it:** whoever can already run `node` in this checkout, with their own privileges.
   Bootstrap adds no endpoint and no role. Consequential steps need an approval **id** and
   `--confirm`; without them the exit is 5 and nothing is written.
3. **Worst thing a hostile input can do:** make Bootstrap *record* or *display* text from the
   target. It cannot write outside the target (T1–T3), delete an unrecorded or changed file (T9),
   run a command the human did not approve by id (T6, T15), send anything (T18), or be talked into
   a second install (T17).
4. **Narrowest privilege:** read the target it was given, write the planned paths, start `git` and
   approved commands. The capability is a single file; the network is denied **by name** in
   `tools/gates/rules.mjs` (`bootstrap-is-transport-free`), and `node:child_process` is denied in
   every file of the module but `exec.mjs` (`bootstrap-starts-a-process-in-exec-only`), so neither
   can be acquired by accident.
5. **When validation cannot be established:** deny. A manifest the validator refuses, a contract
   that will not parse, a file whose hash moved, a fact git could not answer — each is a refusal or
   an explicit UNKNOWN, never a default. `runCheck` reports `not-runnable` as an outcome rather than
   guessing, because no shell is ever used.
6. **What gets logged:** the plan, the report and the manifest. Relative paths, component ids,
   hashes, instants, counts. No secret, no contact, no absolute path, no machine metadata, no
   porcelain line from somebody else's repository (only counts), no environment.

## Residual risks

- **LIMITATION — the manifest is the uninstall record.** When nothing is kept, the manifest is
  removed, so a `--force-modified` deletion survives only in the command output. Documented in
  `bootstrap/CONTRACTS.md`.
- **LIMITATION — `not-runnable` on Windows.** `npm` is a `.cmd` shim that `spawn` cannot start
  without a shell, and a shell is refused. An approved check that is a `.cmd` is recorded as
  not-runnable with the reason, never as a pass.
- **LIMITATION — TOCTOU is narrowed, not eliminated.** `confine` re-checks links and real paths at
  every call, but an attacker who can modify the target *between* the check and the write holds the
  target already. Bootstrap assumes the operator owns the directory they point it at.
- **CLOSED — an absent component SOURCE now refuses instead of crashing.** Found in this pass as a
  raw `ENOENT` from the walk; now `COMPONENT_UNAVAILABLE` (exit 2) naming the component and the
  missing relative path, raised in one place (`tools/bootstrap/catalog-expand.mjs`). A profile that
  names an unavailable component is refused WHOLE, with the hint to use `--profile custom` without
  it — never downgraded to the components the checkout happens to hold, because installing less
  than a profile promises is the worse failure. `status` and `uninstall` need no component source at
  all: they work from the install manifest in the target. Tests:
  `tools/bootstrap/bootstrap-availability.test.mjs` (synthetic source, product-level profile
  refusal, the never-`[]` claim, the catalog-free check for `status`/`uninstall`, and the assertion
  that this checkout is complete), with the branch in `bootstrap-plan`, `bootstrap-render`,
  `bootstrap-closure`, `bootstrap-catalog` and `bootstrap-install` so each is correct in both
  worlds. VERIFIED by `rehearse:adaptive-removal` (AD29), `rehearse:builder-removal` (PB3) and
  `rehearse:bootstrap-removal` (BS1), all green.
- **UNKNOWN — hostile filenames the filesystem refuses.** The matrix creates names like `-rf` and
  `$(id).md` and skips the ones the platform rejects, so coverage of exotic names is
  platform-dependent and not total.
- **UNKNOWN — a secret shape nobody listed.** `publication.mjs` is a detector of named shapes; a
  credential in an unrecognised format is not detected. The closed manifest key set is the second
  layer, not a proof.
- **HUMAN REVIEW — which checks deserve `mandatory`.** Whether a project's command really proves
  what its id claims is a judgement no gate makes. So is whether an additive CI workflow belongs in
  a given repository at all.
- **A clean scan is not safety.** Every claim above means "no known pattern matched and the named
  test passed", not "Bootstrap is secure".
