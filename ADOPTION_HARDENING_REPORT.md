# Adoption Hardening — Stage 8 report

Project: Cellular Mode — TMU-LAB · Base: `56f811c` · Started 2026-10-07.
Evidence basis: the observational real-world adoption trial of 2026-10-07 (two disposable projects outside this
repository; report kept outside the repository, not copied here). Ids below are the trial's (A = new project,
B = existing project). Stage 8 corrects demonstrated adoption problems only; it adds no product area.

## 1. Triage of the 25 trial findings (Cell 1)

Decisions: **FIX** (correctness, security, public onboarding, truthful docs, behaviour-preserving adoption) ·
**DOC** (documentation correction only) · **DEFER** · **EXPECTED** · **UNKNOWN**.

| Id | Class (trial) | Finding | Decision | Rationale |
|---|---|---|---|---|
| A-01 | IMPL | `bootstrap new` refuses a target holding the Builder's own draft | FIX | breaks the documented Builder → Bootstrap path |
| A-02 / B-11 | IMPL | normal work (`cellmode open`, approving checks) turns status to `drift`/`repair` | FIX | false drift; "repair" would overwrite project memory |
| A-03 / B-06 | IMPL | hook and `cellmode complete` advise `npm run verify:final`, absent in targets | FIX | the instructed command does not exist |
| A-04 | SECURITY | target `vault/builder/draft.json` not git-ignored; was committed | FIX | documented privacy guarantee not delivered |
| A-05 / B-03 | IMPL + DOC | managed-block text and PROPOSED text never shown before consent | FIX | consent must see what it approves |
| A-07 | IMPL | a deferred-technology decision counted as an approved stack → implementation cell | FIX | first-cell classification states a falsehood |
| A-14 / B-05 | IMPL | copied `tools/gates/test-counts.mjs` joins the target's `node --test` | FIX | adoption changed the host's test suite |
| A-08 | DOC + USAB | Builder never asks for exclusions; `scope.out` empty | FIX | explicit exclusions bound the first cell |
| A-10 | DOC | docs/11 and docs/12 give conflicting new-project orders | FIX (docs) | one executable path, cross-referenced |
| A-11 / B-07 / B-08 | DOC + IMPL | approval shape undocumented; `--mandatory` unusable for `new` | FIX | Article 8 needed hand-edited internal JSON |
| B-09 | DOC / EXPECTED | on Windows `npm` checks are `not-runnable` (no shell) | FIX | narrow non-shell resolution, else explicit fallback |
| A-06 | USAB | promoting the Builder's own proposal requires retyping it | FIX | composes existing decide operations; onboarding step |
| B-04 | USAB | one dry run prints two different approval lists | FIX | one complete list is the consent document |
| B-12 | USAB | `uninstall --dry-run` hides 44 of 52 deletions; `--verbose` ignored | FIX | a destructive plan must be fully reviewable |
| B-13 | USAB | after a successful uninstall `status` reports `partial`/`repair` forever | FIX | falls out of the status redesign |
| A-13 | USAB | install limitation printed truncated mid-command | FIX | truncated instruction is not actionable |
| A-09 | USAB | `builder cell --accept` fails late when `vault/state/` is absent | DOC | the corrected path lets Bootstrap create the state and the cell |
| A-17 | USAB | done criterion is a manual browser action, evidence is automated | DOC | guidance on writing testable done criteria; no code |
| A-12 | USAB | plan shows `vault/state/` as one line; counts differ (117/121/120) | DOC | explain the placeholder; counts follow from it |
| B-10 | USAB | `verify-final` reports an un-startable check as `failed` | DOC | fail-closed is correct; label difference documented |
| B-14 | USAB | uninstall leaves scratch dirs untracked once the ignore block is gone | DOC | scratch is user-visible by design; documented |
| B-02 | DOC | forgotten `--profile` prints only the suggestion | DOC | `help` lists all profiles; docs say so |
| A-15 | USAB | `builder status --json` → "needs a value" | DEFER | cosmetic, no adoption impact |
| A-16 | EXPECTED | a `new` project has no `package.json`; npm vocabulary does not apply | EXPECTED | docs use `node …` forms (with A-03) |
| B-01 | EXPECTED | a clean `--analyze` exits 2 | EXPECTED | findings exit is documented; restated in docs |

Totals: FIX 16 · DOC 6 · DEFER 1 · EXPECTED 2 · UNKNOWN 0. The trial's single unexplained
observation (a `componentVersion` difference between the two manifests) stays **UNKNOWN** and is not acted on.

## 2. Hardening contracts (Cell 1)

- **H1 — drafts are never authoritative.** Bootstrap tolerates `vault/builder/**` in a new target, never reads it
  for planning, never copies or records it; only an approved `vault/project-contract.json` is input. Draft-only
  targets install without a contract (no silent promotion).
- **H2 — drafts stay private.** The managed `.gitignore` block covers `vault/builder/`; refusing that block while a
  draft exists produces an explicit warning in plan and install output.
- **H3 — three ownership classes.** *immutable* (copied/generated installation assets: drift if changed),
  *evolving* (`vault/state/**`, `vault/verification.json`: expected to change, never drift), *user/referenced*
  (never drift). Uninstall rules unchanged: anything not byte-identical to the record is kept.
- **H4 — no installed file is host-test-discoverable.** Checked against Node's default `--test` patterns (and the
  obvious pytest/cargo/Maven/Gradle/Go conventions) by a gate-level test over every profile's file set.
- **H5 — consent shows content.** Plans (text and `--json`) carry the exact managed-block text and one complete
  approval list; Builder status prints PROPOSED text.
- **H6 — Article 8 without internal JSON.** A Bootstrap `verification` command lists, explains, approves,
  makes mandatory and revokes checks; approval stays human-explicit and never sets VERIFIED. Every remedy message
  names `node tools/gates/verify-final.mjs`, which exists wherever `article-8` is installed.
- **H7 — Windows without a shell.** A closed list of package-manager shims (`npm`, `npx`) is resolved to their
  Node entry points and run as argv; the resolved argv is recorded; shell wrappers stay refused. If resolution
  fails the check is `not-runnable` with the exact non-shell alternative.
- **H8 — exclusions are asked.** One Builder question collects explicit exclusions (DECLARED); "none" is accepted;
  nothing is inferred from silence.

## 3. Defects fixed (Cells 2–8), with the test that holds each

| Contract | Trial findings closed | Tests |
|---|---|---|
| H1 — drafts never authoritative | A-01 | `tools/bootstrap/bootstrap-draft.test.mjs` |
| H2 — drafts stay private | A-04 (the only SECURITY finding) | `tools/bootstrap/bootstrap-draft.test.mjs` |
| H3 — three ownership classes | A-02 / B-11, B-13, B-14 | `tools/bootstrap/bootstrap-status-h3.test.mjs` |
| H4 — nothing installed is host-test-discoverable | A-14 / B-05 | `tools/bootstrap/bootstrap-discovery.test.mjs`, `tests/gates-count-tests.test.mjs` |
| H5 — consent shows content | A-05 / B-03, B-04, A-13, B-12 | `tools/bootstrap/bootstrap-consent.test.mjs` |
| H6 — Article 8 without internal JSON | A-03 / B-06, A-11 / B-07 / B-08 | `tools/bootstrap/bootstrap-verification-cli.test.mjs`, `tools/bootstrap/bootstrap-verification-e2e.test.mjs`, `tools/bootstrap/bootstrap-verification.test.mjs`, `tests/verification-contract.test.mjs`, `tests/gates-final-hooks.test.mjs` |
| H7 — Windows without a shell | B-09 | `tests/verification-shim.test.mjs`, `tests/gates-verification-suite.test.mjs` |
| H8 — exclusions are asked | A-08, A-06, A-07 | `tools/prompt-builder/questions.test.mjs`, `tools/prompt-builder/answers.test.mjs`, `tools/prompt-builder/first-cell.test.mjs`, `tools/prompt-builder/cli-proposals.test.mjs` |

Three further fixes were made **after** trial 2, from its own findings:

| Id | Fix | Tests |
|---|---|---|
| A2-01 | `git init` is now an explicit step 0 of the beginner path in `docs/12-bootstrap.md`, and the prose about the approval list on an empty directory now matches what the tool prints; `docs/11-prompt-builder.md` and `README.md` repeat the precondition | `tests/links.test.mjs`, `tests/size.test.mjs`, `tests/language.test.mjs` (documentation-only change) |
| B-07 / B2-02 | the install's contract summary no longer advises `--mandatory <id> --confirm` (exit 3 after an install) or editing the file by hand; it names `verification <dir> list` and the `add` / `run` / `mandatory` subcommands, and restates H6 | `tools/bootstrap/bootstrap-verification.test.mjs` — assertions added for the CLI route and against both of the two removed phrasings |
| A2-05 | the Builder `acceptance` question asks for a check **a program can run**, decided by a command or a test, instead of something you could try yourself | `tools/prompt-builder/questions.test.mjs` — new case, plus the existing plain-language and tired-mode cases |

## 4. Usability improvements

- One complete approval list per run, each id with a *why*, identical in text and `--json` (it used to print two partial lists).
- Managed-block bytes printed `+`-prefixed before consent; `--json` carries the same bytes in `blocks[].text`.
- `uninstall --dry-run --verbose` lists every action with its reason; the plain form caps and says how many it hid.
- `status` gained *evolved* and `uninstalled-with-residue`, so normal work and a finished removal are no longer reported as drift needing repair.
- The `verification` subcommand family replaced hand-editing internal JSON; every write is `--confirm`-gated and prints the exact record first, exit 5.
- `decide accept-proposal <field> --confirm` promotes the Builder's own PROPOSED option without retyping it.
- The first cell is an **architecture** cell when no stack is approved, with a concrete NOT-in list.
- The Builder asks for explicit exclusions (`scope-out`), and "none" is a real answer.
- Install limitations (the Windows hook exec-bit) print whole, including the exact `git update-index --chmod=+x` command.
- On Windows, `npm` and `npx` checks resolve to their Node entry points and run without a shell.

## 5. Documentation corrections

- `docs/12-bootstrap.md` is now the single beginner path (eight steps plus step 0); `docs/11` and `README.md` point into it instead of offering a second order.
- Stated explicitly: a new project has no `package.json`, so use the `node …` forms; `--analyze` exits 2 on a clean report and must never be chained with `&&`; do not run `cellmode init` or `builder cell --accept` before the install; the single `vault/state/` plan entry expands on disk, which is why three counts differ; a scratch directory becomes visible again once the ignore block is removed; `verify-final` labels an un-startable check `failed`, which is fail-closed, not a false claim.
- A section "Write a done criterion your tests can prove" was added, and, after trial 2, the Builder question that coached the opposite was reworded.
- **Cell 6 incident.** A subagent ran `git checkout` on `docs/12-bootstrap.md` and `tools/gates/FINAL-VERIFICATION.md`, discarding unstaged Stage 8 documentation edits. `FINAL-VERIFICATION.md` was restored in full; `docs/12`'s status section was reconstructed in Cell 6; the Cell 2 and Cell 5 documentation facts (draft tolerated and never read, managed-block text shown, `uninstall --verbose`) were rewritten in Cell 8. Code and tests were unaffected. Rule added and recorded in the log: delegations never run `git checkout`, `restore`, `reset` or `stash`; an agent undoes its own edits by editing.

## 6. Deferred findings — recorded, not fixed

- **A-15 / A2-04** — `builder status --json` says "option `--json` needs a value" instead of "unknown option"; cosmetic, no adoption impact.
- **A2-02** — `--approve <id>` for an id absent from that run's list is accepted silently; a misspelled id is still refused.
- **A2-03** — `verification list`'s hint puts `--confirm` after `--`; it works, but contradicts "everything after `--` is argv".
- **A2-06** — the generated architecture cell demands Trilateral counts a decision-only cell cannot produce.
- **A2-07** — `install-manifest.json` records `source.revision` with no dirtiness flag, although the bytes came from a dirty tree.
- **A2-08** — the first commit on Windows buries the Article 8 refusal under about 140 CRLF warnings; no `.gitattributes` is installed or proposed.
- **A2-09** — `status`'s "N extra (unowned)" counts only the installed subtrees but reads as a whole-tree statement.
- **A2-10** — step 2's `next` re-prints the question `answer` already printed, with nothing marking it as the same one.
- **A2-11** — the Builder echoes `smallestVersion` and `security.sensitiveData` where the accepted id is `smallest-version` and `sensitive-data`.
- **A2-12** — docs/12 says "until `status` says *ready*"; `Readiness: ready` is printed by `approve`, not by `status`.
- **B2-01** — `existing --analyze` prints 4 approvals where the dry run's complete list has 6, without saying it is partial.
- **B2-03** — `uninstall` files the *evolving* `vault/verification.json` under `keep-modified` with accident wording; the keep itself is right.
- **B2-04** — after `cellmode open`, `INDEX.md` shows an active cell while `log.md` has zero entries; by design, unexplained at the point of confusion.
- **B2-05** — `existing --dry-run` reprints the compatibility trailer, which suggests a different profile than the plan below it.
- **B2-06** — `verification run` echoes resolved absolute host paths to stdout (never to any artefact); a CI log would keep them.
- **B2-07** — `existing` without `--profile` prints one suggested profile; `new` prints all four and all six approval ids.
- **B2-08** — manifest approvals are `{action, at}` with no approval **id**, so the record cannot be grepped by id.
- **Builder `--root` before the command** (found in Cell 8, in neither trial): `cli.mjs --root <dir> status` prints `unknown command: --root` plus the whole usage text and **exits 0** — a refusal that reports success.
- **Two intermittent tests, parked, cause UNKNOWN** — `eip/upp-host/process.test.mjs` "a plugin that ignores shutdown is terminated anyway" (Stage 7) and `tests/gates-ci-trailer-git.test.mjs` "an UNKNOWN boundary fails closed" (Stage 8 Cell 7); each failed once in a full parallel run and passed alone and on rerun.

## 7. Unresolved UNKNOWNs

- **The `componentVersion` difference between the two trial-1 manifests** — observed once, never reproduced, never explained. Not acted on; no code was changed on its account.
- **The cause of the two intermittent test failures** — load-dependent ordering, a real race and a fixture collision are all consistent with the evidence. Neither failure was reproduced deliberately, so the cause is UNKNOWN and both tests stay in the suite, parked, not quarantined. A bounded read-only investigation on 2026-10-08 (20 isolated runs of each, 10 full-suite runs) did not reproduce either.
- **The first Stage 8 closing run: `verify:final` 1477/1478** (failing test not recorded). **UNKNOWN / not reproduced under bounded investigation** (10 later full-suite runs at 1478/1478). Not fixed.
- **PB3 in that same run: REPRODUCED and IDENTIFIED, deterministic.** The Stage 8 test `bootstrap-draft.test.mjs` expected the Builder-present diagnostic even in the PB3 copy, where the earlier diagnostic "Prompt Builder not installed in the source" is correct. Corrected in the test only (both source worlds, H1 assertion unchanged); behaviour untouched. It does **not** explain the single Stage 7 PB3 failure (that test did not exist then), which remains **UNKNOWN**.

## 8. Security boundaries — what Stage 8 did and did not change

- **No shell, still.** H7 resolves a **closed list of two** package-manager names (`npm`, `npx`) to their Node entry points and runs them as argv. Shell wrappers (`.cmd`, `.ps1`, `.bat`) stay refused; a resolution that fails yields `not-runnable` with the exact non-shell alternative, never a shell fallback.
- **Drafts stay private** (H2), and the resolved absolute argv is printed to the terminal only — it is written to no contract, manifest, baseline or evidence file (checked by grep over every generated artefact in trial B2).
- **No approval, gate or boundary was weakened.** Approval stays two-key (id plus `--confirm`); an approval never writes VERIFIED; final verification still fails closed on zero mandatory checks; analysis still executes nothing.
- **What Stage 8 changed inside `tools/gates/`**, precisely: `verification-suite.mjs` gained the H7 non-shell shim resolution, mirrored in `tools/bootstrap/exec-shim.mjs` with `tests/verification-shim.test.mjs` holding the two copies equal (gates must not import bootstrap); remedy and refusal texts in `authorization.mjs`, `final-evidence.mjs`, `rules.mjs`, `verify-final.mjs`, `ci-summary.mjs`, `trilateral-legs.mjs`, `byte-equivalence.mjs`, `removal-paths.mjs`, `CI.md` and `FINAL-VERIFICATION.md` now name `node tools/gates/verify-final.mjs` first; and `test-counts.mjs` was renamed `count-tests.mjs` so that a copied gate file stops joining the host's `node --test` run (H4). **Stage 8 changed no Article 8 core rule** — the one human-approved change to the Article 8 core happened in Stage 7 and is out of scope here.

## 9. Before and after — trial 1 (2026-10-07) vs trial 2 (2026-10-08)

Only figures the trial notes state. **Trial 2 ran on the working tree as it stood before the three post-trial fixes of section 3**, so A2-01, A2-05 and B2-02 appear as *found*, not as fixed.

| Metric | A (new) t1 | A2 (new) t2 | B (existing) t1 | B2 (existing) t2 |
|---|---|---|---|---|
| Builder questions asked | 10, 0 skipped | 11, 0 skipped | n/a (Builder not installed) | n/a |
| Commands, total | 61 logged steps | 57 | 22 | 30 |
| of which Cellular Mode CLI | 38 | 38 | 8 to a working install, 3 exploratory | 8 to a working install; 6 of the 30 exploratory |
| Approvals requested / given | 3 / 2 | 10 / 9 | 6 available / 5 granted | 6 granted, 2 withheld |
| Concepts a newcomer must hold | 18 | 19 | about 12 | about 13 |
| Steps from idea to an active first cell | 19 on the happy path, 20 in practice | 6 documented steps = 18 CM commands, plus 1 undocumented `git init` = 19 | not measured | not measured |
| Exported prompt | 5 310 bytes / 72 lines | 5 651 bytes / 72 lines | not exercised | not exercised |
| Hand edits of internal JSON | 2 | **0** | 3 | **0** |
| Blockers | 0 | 0 | 0 | 0 |
| Issues recorded | 17 | 12 | 14 | 8 |
| Trial-1 findings re-checked | — | 11 RESOLVED, 4 CHANGED, 1 CHANGED-partly, 1 STILL PRESENT, 0 regressions | — | 9 RESOLVED, 3 CHANGED, 1 STILL PRESENT, 1 NOT EXERCISED |
| Tests before and after install | n/a, then 6 pass (7 under auto-discovery) | n/a, then 3 pass, exactly the 3 written | 11 then **12** | 11 then **11** |
| Checks reaching VERIFIED | n/a (baseline not offered on `new`) | 2 mandatory at final verification | 0, both `not-runnable` on Windows | 2 VERIFIED (`npm-test`, `npm-lint`) through H7 |
| Compatibility report accuracy | n/a | n/a | 21/21 claims correct | 21/21 claims correct |
| Pre-existing files altered without approval | n/a | n/a | 0 | 0 |
| Source repository mutated by the trial | no | no, porcelain `d4e21efd…` before and after | no | no, same hash at both ends |

## 10. Deterministic verification

See closing verification below. The closing Article 8 run follows this report; its result is in the evidence file and the hand-over message.

## 11. Observed human and model behaviour

Both trials were run by an **AI agent acting as a technically competent newcomer**, following only the public documentation, in disposable projects outside this repository. That is the whole evidential basis of Stage 8: an adoption walkthrough, **not a human user study**. No human followed the eight steps for the first time, so nothing here establishes how a person reads the pages, where a person hesitates, or how long any step takes. Claims about model behaviour are equally **UNKNOWN**: one agent, one host, two runs, no control and no variation of model or prompt. What the trials do establish is behavioural: every consequential action demanded an id and `--confirm`, dry runs wrote nothing (proved by whole-tree hashes including `.git`), the verification contract refused to pass an install with zero mandatory checks, and all four Article 8 behaviours — refuse, verify, accept, revoke after a later write — were observed as specified.
