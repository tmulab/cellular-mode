# Cellular Bootstrap — Stage 7 report

**Status: OPTIONAL module.** It gates no release of the method: delete `tools/bootstrap/` and `bootstrap/` and the
method, the CLI, the gates, the runtime and the Observer are unchanged — rehearsed, not asserted
(`npm run rehearse:bootstrap-removal`, claim BS1). Onboarding for someone who has never used it:
[`docs/12-bootstrap.md`](docs/12-bootstrap.md). Design and approved decisions:
[`bootstrap/CONTRACTS.md`](bootstrap/CONTRACTS.md). Threat model:
[`bootstrap/THREAT-MODEL.md`](bootstrap/THREAT-MODEL.md). Labels are the constitution's: VERIFIED (a command ran,
evidence attached) · INFERRED (what from is stated) · PROPOSED (not built) · UNKNOWN (said so).

## 1. What was built

A separate CLI — `node tools/bootstrap/cli.mjs <new|existing|status|uninstall>` (`npm run bootstrap`) — that installs a coherent, selected subset of
Cellular Mode into another directory: a new project or an existing repository (language-neutral by design; fixtures cover Node/JS/TS, Python, Rust, Java,
Go and polyglot). It never copies the whole repository, never replaces a file, does not intentionally modify the target application's behaviour, opens no
socket, and needs an approval **id** plus `--confirm` for every consequential step.

- **57 non-test modules** in `tools/bootstrap/`, **32 colocated test files**, plus four repository-level tests.
- **11 component manifests** (`bootstrap/components/*.json`): `method-core`, `engineering-skills`, `cellmode-cli`,
  `verification`, `article-8`, `claude-code-adapter`, `cursor-adapter`, `adaptive`, `prompt-builder`, `upp`, `observer`.
- **6 GENERATE templates** (`bootstrap/templates/`): target `AGENTS.md`, the managed block for an existing instruction
  file, the `.gitignore` block, the Claude Code skill pointer, the verification contract, the additive CI workflow.
- Three named profiles plus `custom`; `--dry-run`; the Adoption Compatibility Report; the Adoption Baseline; the install
  manifest; `status` with drift classification; a keep-by-default `uninstall`.
- **BS3**: one Article 8 implementation, generalized — `tools/gates/verify-final.mjs` reads an optional project
  verification contract `vault/verification.json`, and runs the built-in suite, unchanged, when it is absent.

## 2. Architecture (decisions BS1–BS4, approved by the human on 2026-10-06)

| ID | Decision as built |
|---|---|
| BS1 | A separate CLI. `tools/cellmode` never imports it and `cellmode init` is untouched; module tests use the `bootstrap-` prefix (the pre-existing `tests/bootstrap.test.mjs` is unrelated and unchanged) |
| BS2 | `vault/install-manifest.json` in the target is the authoritative, committable record; work in progress lives in git-ignored `vault/bootstrap/`; no secret, token, machine metadata or absolute path in either |
| BS3 | ONE Article 8 implementation, generalized through `vault/verification.json`; commands are argv arrays, never shell strings; only VERIFIED or explicitly human-approved checks may be mandatory |
| BS4 | The Prompt Builder is **never imported**: `compose-builder.mjs` runs the Builder's own CLI as a subprocess through `exec.mjs` and branches on its documented exit codes only. The PB3 boundary rule was strengthened, never relaxed |

Four rules shape the module, each enforced by name in `tools/gates/rules.mjs` and asserted by
`tests/gates-bootstrap-boundary.test.mjs`. **One writer family:** every disk write and deletion in a target goes through
`writer.mjs` / `writer-base.mjs` / `writer-remove.mjs`, and every path through one `confine`. **One process boundary:**
`node:child_process` appears in `exec.mjs` and nowhere else — `spawn`, `shell: false`, argv array, timeout, output cap,
and no `exec`, `execSync`, `execFile` or `fork` anywhere.
**No transport:** no network module may be imported. **Import direction:** `node:*` and pure `tools/cellmode/` modules
only; `eip/**`, `tools/adaptive/**` and `tools/gates/**` are denied — the gates are **copied as data**, never imported.
Everything else is pure: detection, commands, planning, rendering, the manifest, the baseline, the uninstall plan.
`plan(analysis, selection)` is deterministic, and the plan is what `apply` executes — nothing is decided at write time.

## 3. Implemented vs VERIFIED

| Capability | Implemented | VERIFIED by |
|---|---|---|
| Manifest validation, single ownership, exclusion, per-profile import closure and the named command gap | yes | `bootstrap-manifest.test.mjs`, `bootstrap-catalog.test.mjs`, `bootstrap-closure.test.mjs` |
| Dependency resolution, conflicts, conditional `article-8`, the deterministic plan and its rendering in four verbosity modes | yes | `bootstrap-resolve.test.mjs`, `bootstrap-plan.test.mjs`, `bootstrap-render.test.mjs`, `bootstrap-mode.test.mjs` |
| `new` end to end, planned first cell, no absolute path published; the Builder reached by subprocess, exit-code branches in both worlds | yes | `bootstrap-new.test.mjs`, `bootstrap-compose.test.mjs`, `bootstrap-compose-guard.test.mjs` |
| Detection (languages, build systems, CI, hooks, instructions, docs, security) and command discovery as argv, INFERRED only, with shell-shaped CI lines kept as text | yes | `bootstrap-detect.test.mjs`, `bootstrap-probe.test.mjs`, `bootstrap-commands.test.mjs` |
| Adoption Compatibility Report and its renderer; Adoption Baseline, the `baseline-checks` approval, pre-existing failures | yes | `bootstrap-report.test.mjs`, `bootstrap-baseline.test.mjs` |
| `existing` install preserving every pre-existing file; managed blocks on `AGENTS.md` / `CLAUDE.md` / `.gitignore` | yes | `bootstrap-existing.test.mjs`, `bootstrap-adopt.test.mjs`, `bootstrap-install-block.test.mjs`, `bootstrap-install.test.mjs` |
| Verification contract generation, and the round trip across generator and gate | yes | `bootstrap-verification.test.mjs`, `tests/verification-contract.test.mjs` |
| Article 8 in a target (refusal, pass, trailer, revocation by a later write); hooks only under all five conditions, otherwise a composition plan | yes | `bootstrap-article8.test.mjs` |
| The generalized gate: argv-only, shell wrappers refused, fail-closed suite | yes | `tests/gates-verification-contract.test.mjs`, `tests/gates-verification-suite.test.mjs` |
| Additive SHA-pinned CI workflow only with approval, otherwise proposed text | yes | `bootstrap-article8.test.mjs`, `bootstrap-verification.test.mjs` |
| Install manifest (write, read, validate, publication check) and `status`: healthy / drift / partial, next action, zero writes | yes | `bootstrap-record.test.mjs`, `bootstrap-status.test.mjs` |
| `uninstall`: dry run, keep-by-default, `--force-modified`, round-trip identity | yes | `bootstrap-uninstall.test.mjs`, `bootstrap-uninstall-keep.test.mjs`, `bootstrap-remove.test.mjs` |
| Confinement, symlink refusal, size ceiling; hostile names and manifests; a proxy pointed at a closed port; a sentinel sibling untouched; no secret or absolute path in any artefact | yes | `bootstrap-writer.test.mjs`, `bootstrap-harden-input.test.mjs`, `bootstrap-harden-install.test.mjs` |
| Static no-shell / no-network / one-exec proofs; dry runs write nothing; a second install refuses with zero writes | yes | `bootstrap-harden.test.mjs`, `tests/gates-bootstrap-boundary.test.mjs`, `bootstrap-idempotence.test.mjs` |
| An absent component source refuses instead of crashing | yes | `bootstrap-availability.test.mjs` |
| Removal of the whole module leaves the repository green | yes | `npm run rehearse:bootstrap-removal` |

Every cell of Stage 7 used a red-proof: a deliberate mutation (dropping a copied dependency, inverting the `mandatory`
rule, skipping the pre-unlink re-hash) made the relevant test fail and was then restored — recorded per cell in
`vault/state/log.md`.

## 4. INFERRED (reasoned, not measured)

- That a discovered command *means* what its id says (`test`, `build`, `lint`) is inferred from the project's
  `package.json` or build file. Bootstrap labels it INFERRED and never makes it mandatory on its own.
- The profile suggestion for a JavaScript/TypeScript repository (`standard`, otherwise `minimal`) is a heuristic,
  printed and never applied without an explicit `--profile`.
- That the installed subset is *useful* in a foreign repository. Import closure proves the copied set can load; whether
  a team adopts the method from it is not something a test establishes. The byte totals in §9 are likewise derived from
  the manifest expansion in this checkout, not from a real install.

## 5. PROPOSED or unsupported (not built)

- **Other CI providers write nothing.** GitLab, CircleCI, Azure Pipelines, Bitbucket and Jenkins are *detected* and the
  output is text for a human to apply. Only `.github/workflows/cellular-verify.yml` can be created, and only with the
  `ci-workflow` approval, `--confirm`, and that exact path absent.
- **No updater, no repair, no upgrade automation.** `status` classifies and names the next action; performing it is a
  human's call, and a re-run never reinstalls (exit 3, zero writes). **No GUI and no interactive prompt** either.
- **Windows:** a `.cmd` command (such as `npm`) cannot be started by `spawn` without a shell, and a shell is refused —
  an approved check that resolves to a `.cmd` is recorded as `not-runnable` with the reason, never as a pass. The
  executable bit on copied `.githooks/` files is not set automatically.
- **The Observer's audit plugin is not installed in targets** (it imports this repository's own gates); its view says so.
- **Forced deletion record.** When nothing is kept, the manifest is removed, so a `--force-modified` deletion survives
  only in the command output. Documented in `bootstrap/CONTRACTS.md` and the threat model.
- **UNKNOWN — whether the `GIT_OPTIONAL_LOCKS=0` / `--no-optional-locks` / `core.fsmonitor=false` guard is necessary.**
  A mutation that removed it survived on small fixtures; it is kept as defence in depth, not as a verified need.
- Frozen by the human on 2026-10-06, see §11: more CI providers, more languages, upgrade and repair automation, a GUI,
  Multi-Model support, a component marketplace, sandboxing, branch protection, further profiles and components.

## 6. Security boundaries

Full account in [`bootstrap/THREAT-MODEL.md`](bootstrap/THREAT-MODEL.md), which names the test behind each mitigation
(T1–T19). In summary: the target repository and every specification are **untrusted**, and six boundaries are crossed —
target content into the process, hand-editable manifests and contracts into the process, an on-disk manifest into a
deletion, CLI arguments into a plan, the process into a subprocess, the process into generated artefacts. The
mitigations are gates, not intentions: one `confine` before every read, write and deletion, with `lstat` on every
existing segment and a real-path check on the deepest existing ancestor; a control, newline or bidi character in a path
is a refusal, because a filename must not forge a line of the report consent is formed from; no filename ever reaches a
command line; one spawner with `shell: false`, and shell wrappers refused by name; size read before bytes; a manifest
validated and every file re-hashed immediately before its unlink; every manifest string crossed against a publication
check; the target named by its basename alone; no network module importable. Residual risks are stated rather than
closed: TOCTOU is narrowed not eliminated, exotic hostile filenames are platform-dependent, an unlisted secret shape is
undetected, and which checks deserve `mandatory` is a human judgement. A clean scan is not safety.

## 7. Project types exercised (from the fixtures, VERIFIED)

`tools/bootstrap/fixtures/projects.mjs` holds thirteen small real trees, each a few files, all under the `fixtures/`
suffix every component manifest excludes: **node** (scripts, lockfile, tests), **python** (`pyproject.toml`,
`requirements.txt`, pytest, ruff), **rust** (`Cargo.toml`, lock), **java** (`pom.xml`, with a Gradle variant built in a
test), **go** (`go.mod` plus a `Makefile`), **github-actions** (a simple `run:` and one needing a shell), **custom-ci**
(`.gitlab-ci.yml` and a `Jenkinsfile`), **husky**, **instructions** (`AGENTS.md`, `CLAUDE.md`, a Cursor rule, Copilot
instructions), **security**, **docs**, **failing-baseline** (red tests before adoption), plus a merged polyglot tree.
Two more are built at run time so no file here contains them: a **secret-shaped** tree (token and key assembled from
fragments) and **hostile filenames** (a newline, a tab, `..`-like names, skipped where the platform refuses them). Also
exercised: a real git repository with one commit, an **existing install** (refusal), **drift** and **partial** states, all
three profiles plus `custom`, every dry run, and uninstall.

## 8. Untested environments

- **macOS and Linux local runs were not performed here.** Everything in §3 was run on Windows; CI runs the suite on
  Linux for the committed state, which is the only Linux evidence that exists.
- **Real large repositories.** Fixtures are a few files each by design; no adoption of a repository with history,
  submodules, hundreds of thousands of files or an exotic filesystem has been attempted.
- **Non-GitHub CI execution.** The additive workflow has only ever been *generated*; no GitLab, CircleCI, Azure,
  Bitbucket or Jenkins pipeline has run anything from an install.
- **Model behaviour.** How any language model uses the installed skills is not established by any test here.

## 9. Context and storage costs

Measured in this checkout by expanding the component manifests (copy-mode files only, target-relative sizes on disk):

| profile | copied files | bytes copied |
|---|---|---|
| `minimal` (with `article-8`) | 46 | ~202 KiB |
| `standard` | 111 | ~491 KiB |
| `full` | 227 | ~1 793 KiB |

The counts in `bootstrap/CONTRACTS.md` (43 / 108 / 224) are the **Cell 1** findings; each profile gained exactly the
three gate modules BS3 added to `article-8` in Cell 5 (`verification-suite`, `verification-contract`,
`verification-argv`), which is the whole difference — INFERRED from that manifest, which now names thirteen gate modules
where Cell 1 recorded ten. Generated files are small, project-specific and not in the table. Documentation cost:
`docs/12-bootstrap.md` and this report are 200 lines or fewer and neither is loaded by default — Bootstrap is reached
from `AGENTS.md` level 4 only when the topic comes up, and a target installs the normal `cell` and `pause` skills.

## 10. The optionality regression, and its correction

Found during Cell 7's hardening pass, and worth recording because it was a failure of the *optionality* claim rather
than of Bootstrap's own behaviour: `rehearse:adaptive-removal` (AD29) and `rehearse:builder-removal` (PB3) both went red
because Bootstrap's own tests crashed in a checkout with an optional module deleted. Two causes, both closed:

1. **A raw `ENOENT` from the walk.** `expandFiles` read a component's declared source directory without establishing it
   was there. Now one place (`tools/bootstrap/catalog-expand.mjs`) raises `COMPONENT_UNAVAILABLE` (exit 2) naming the
   component and the missing relative path, and a profile naming an unavailable component is refused **whole**, with the
   hint to use `--profile custom` without it — never silently downgraded, because installing less than a profile
   promises is the worse failure. Unselected absent components produce no finding, and `status` / `uninstall` need no
   component source at all. Branches added in `bootstrap-plan`, `bootstrap-render`, `bootstrap-closure`,
   `bootstrap-catalog` and `bootstrap-install` so each is correct in both worlds.
2. **The compose tests used this repository as their "Builder present" fixture**, which deleted itself with the Builder.
   They now use a stub source, so every exit-code branch of `compose-builder.mjs` runs in both worlds.

`tools/bootstrap/bootstrap-availability.test.mjs` holds the claim, including the assertion that nothing is unavailable
in *this* checkout, so the narrow branch can never become the only one that runs. **All three removal rehearsals are
VERIFIED**: BS1 (`rehearse:bootstrap-removal`), AD29 (`rehearse:adaptive-removal`), PB3 (`rehearse:builder-removal`).

## 11. Process notes, and the human's stop

- **A mistake, recorded.** During the Cell 6 closure, `npm run verify:final` failed: `bootstrap/CONTRACTS.md` stood at
  202 lines and broke the 200-line size gate. The file was trimmed and the command re-run green. Both records — the
  failure and the pass — are in `.cellular/evidence/final-verification.jsonl`: the first run is not deleted because the
  second one passed, which is the whole point of an append-only evidence file.
- **A full stop, requested by the human on 2026-10-06**, mid-way through Cell 7, with a status report instead of more
  work; the paused cell recorded that the working tree might hold a partial fix, UNKNOWN until checked. Work resumed
  only after the human re-evaluated the stage.
- **Scope freeze (human, 2026-10-06).** Stage 7 closes with what is in §1–§3; the frozen list is in §5. Cells 7 and 8
  were closed without a per-cell `verify:final`: the human asked for exactly **one** run after all Stage 7 writes.

## 12. Stage 7 release-checklist items (referenced from `RELEASE_CHECKLIST.md`)

| | Item | Status | What is left |
|---|---|---|---|
| 55 | 👤 Stage-7 commit and private push | ❌ **not done — needs authorization** | every Stage 7 change is uncommitted; nothing committed, pushed, tagged or published, and `--no-verify` never used |
| 56 | CI on the Stage-7 commit | ⬜ **not run** | it can only run after item 55; it is also the only Linux evidence for this stage |
| 57 | Real-model behavioural evaluation of an installed target | ⚠️ **NOT PERFORMED** | deterministic tests do not establish model behaviour |
| 58 | Adoption of a large real repository | ⚠️ **NOT PERFORMED** | fixtures are a few files each by design (§8) |

## 13. Final verification
Closing Article 8 run (2026-10-06, after this report and the Cell 8 record): **1426/1426** tests, 0 failed, 0 skipped, 0 cancelled; byte equivalence
830 files compared, 0 differing; typecheck, release gates and vault integrity passed; removal rehearsals BS1, AD29 and PB3 VERIFIED; fingerprint
`sha256:ac81fbe49f70c2a5e14ad293236560170d4256a71d6c4f24b5563f28d53e5ec9`, tree `8be8e0d2adeafa9c37e3ab5cf9cae3a7ec324f20`. The earlier failed run (§11) stays in the
evidence log. Four wording corrections followed on 2026-10-07; the run that authorizes the committed state is later — see the evidence file and hand-over.
