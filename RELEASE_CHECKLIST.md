# Release checklist — public release

**Current verdict: no technical blocker left for stages 1-2; stage 3 is closed; stage 4 adds five items (36-41); stage 5 adds seven (44-50), four of them OPEN — two ADR confirmations, the first remote CI run, and the stage-5 commit.**
R-1 was resolved on 2026-10-02 (item 15):
the typecheck leg is real and reports 0 errors, and `check-all.mjs --release` exits 0. What
remains is human-only authorization: publication (29). Security contact (6) set and push (28)
authorized on 2026-10-02 to a PRIVATE repository.
The local repository and its first commit were authorized and made on 2026-10-02 (26–27). Labels: ✅ VERIFIED (a command was run, or a file
was read end to end) · ⚠️ partial / caveated · ❌ not satisfied · UNKNOWN (not established —
and UNKNOWN is never green).

👤 marks an item only a human can close. An agent may prepare it and must then wait.

## Legal and attribution

| | Item | Status | Evidence / what is left |
|---|---|---|---|
| 1 | `LICENSE` is Apache-2.0 and unmodified | ✅ VERIFIED | `tests/license.test.mjs` asserts the header on every source file |
| 2 | `NOTICE` and `THIRD_PARTY_NOTICES.md` agree with `LICENSE` and with each other | ✅ VERIFIED | licensing decisions of 2026-10-02, recorded in `MIGRATION_REPORT.md` |
| 3 | Third-party code: exactly one vendored directory, declared | ✅ VERIFIED | `three@0.180.0` (MIT), hash-pinned, for the optional 3D view of `apps/observer/`; `THIRD_PARTY_NOTICES.md`, `apps/observer/vendor/VENDOR.md`, `tools/gates/VENDOR-EXCLUSION.md`; `npm run gates` (deps) still finds zero runtime dependencies |
| 4 | Contribution licensing stated (Apache-2.0 §5, no CLA) | ✅ VERIFIED | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 5 | 👤 Author identity and the TMU-LAB attribution are what the author wants published | ⚠️ needs a human read-through | `README.md`, `NOTICE` — names and `https://tmulab.org` appear; only the author can confirm |
| 6 | 👤 Security contact published (not a placeholder) | ✅ VERIFIED | role address set in [`SECURITY.md`](SECURITY.md) (decision of 2026-10-02); the leak test allows exactly that address in exactly that file |

## Original projects

| | Item | Status | Evidence |
|---|---|---|---|
| 7 | The original private sources are unchanged by this work | ✅ VERIFIED | nothing outside this repository was written; no code was copied — [ADR 0002](docs/adr/0002-zero-dependency-kernel.md) |
| 8 | Stage-1 content not rewritten (append-only held) | ✅ VERIFIED | `ARCHITECTURE_REPORT.md` §6: the stage-1 `log.md` digest is a byte-for-byte prefix of the current log |
| 9 | No personal data, no absolute paths, no private project names | ✅ VERIFIED | `npm run gates` (secrets) + `tests/leaks.test.mjs` |

## Gates and tests

| | Item | Status | Evidence / what is left |
|---|---|---|---|
| 10 | `npm test` passes | ✅ VERIFIED | see the run recorded at the bottom of this file |
| 11 | `npm run gates` — size · secrets · deps · boundaries — no findings | ✅ VERIFIED | same run |
| 12 | `node tools/cellmode/cli.mjs check` exits 0 | ✅ VERIFIED | same run |
| 13 | `node examples/text-stats/reproduce.mjs` exits 0 | ✅ VERIFIED | same run |
| 14 | Every relative Markdown link resolves | ✅ VERIFIED | `tests/links.test.mjs`, part of `npm test` |
| 15 | **R-1 — `typecheck` actually enabled** | ✅ VERIFIED | approved and done on 2026-10-02: `typescript@5.9.3` + `@types/node@24.19.1` (pinned, dev only), `jsconfig.json` with `checkJs` and four strict flags, **0 errors** over 100 modules including the tests. R-1 is **WITHDRAWN** — [`policy/typecheck-proposal.md`](policy/typecheck-proposal.md), [`policy/relaxations.md`](policy/relaxations.md) |
| 16 | **R-2 — secret-allowlist exceptions resolved** | ✅ resolved | **WITHDRAWN** — all four entries measured unnecessary and deleted, `policy/secrets-allowlist.json` is `[]`, pending count 0 — [`policy/secrets-review.md`](policy/secrets-review.md), register in [`policy/relaxations.md`](policy/relaxations.md) |
| 17 | `node tools/gates/check-all.mjs --release` exits 0 | ✅ VERIFIED | exit 0, zero blockers: both R-1 ids are clear (output below) |
| 18 | Mutation verdicts re-run automatically | ⚠️ manual | the `eip/*/ACCEPTANCE.md` tables are hand-applied and recorded; nothing re-runs them (`ARCHITECTURE_REPORT.md` §4.8) |
| 19 | Symlink-escape guard verified | ✅ VERIFIED on win32 | exercised through a directory **junction** (file symlink is `EPERM` unprivileged; `lstat` reports the junction as a symbolic link); removing the guard goes red — `eip/host/ACCEPTANCE.md` H11. POSIX symlink behaviour **UNKNOWN** (untested here) |

| 42 | **Article 8 — the release is verified at its FINAL state** | 👤 human, per release | `npm run verify:final` must be the LAST action: it fingerprints the controlled set, runs typecheck · `node --test` · `check-all --release` · `cellmode check`, re-checks the fingerprint, and appends the record to `.cellular/evidence/final-verification.jsonl`. Any write afterwards — including the entry that marks this checklist done — **invalidates it and the suite must be re-run**. Confirm with `node tools/gates/authorization.mjs status`; for the commits being released, `node tools/gates/authorization.mjs audit <range>` must list no unverified tree. Mechanism and limits: [`tools/gates/FINAL-VERIFICATION.md`](tools/gates/FINAL-VERIFICATION.md) |
| 43 | Independent CI verification of every pushed commit | ⚠️ implemented, **not yet run remotely** | [`.github/workflows/verify.yml`](.github/workflows/verify.yml) re-runs typecheck · module load · `node --test` · gates · release gate · cell state · UPP conformance on a clean `ubuntu-latest` checkout, then compares each commit's `Verified-State` trailer with `git rev-parse <commit>^{tree}` ([`tools/gates/ci-trailer.mjs`](tools/gates/ci-trailer.mjs)) and writes commit, CI fingerprint, test counts and verdict to the job summary. `contents: read` only, no secret, every action pinned by SHA. Structure VERIFIED locally by [`tests/ci-workflow.test.mjs`](tests/ci-workflow.test.mjs) (13 tests) and the trailer check VERIFIED on `b92c7c8` (1 MATCH) and over the full history (9 PRE_ARTICLE_8). **Behaviour on GitHub is UNKNOWN: the workflow has never run there** — it runs on the first push after authorization. Branch protection for `main` is a documented RECOMMENDATION; no repository setting was changed — [`tools/gates/CI.md`](tools/gates/CI.md) |

## Honesty of the claims

| | Item | Status | Evidence |
|---|---|---|---|
| 20 | Adapters labelled per tool, not averaged | ✅ VERIFIED | Claude Code: discovery **VERIFIED** and invocation **VERIFIED** for the `cell` skill in a live session (the other ten pointer skills share the identical pointer shape but were not individually invoked). Every other adapter: **UNTESTED**, documented conventions only — [`adapters/README.md`](adapters/README.md), [`docs/08-agent-integration.md`](docs/08-agent-integration.md) |
| 21 | Implemented / experimental / proposed table is current | ✅ VERIFIED | `README.md` status table; `docs/09-architecture.md` §4 |
| 22 | ADRs accepted by the responsible human | ✅ 3 of 3 | [0001](docs/adr/0001-frontend-exception.md), [0002](docs/adr/0002-zero-dependency-kernel.md) — approved by Hudson A. R. Bonomo, 2026-10-02. [0003](docs/adr/0003-observer-frontend.md) — approved 2026-10-03 (item 31) |
| 23 | `SECURITY.md` exists, with scope, threat model and the trusted-local-plugins statement | ✅ VERIFIED | [`SECURITY.md`](SECURITY.md) |
| 24 | No module claims isolation it does not have | ✅ VERIFIED | the write port is described as **path-confined**; kernel, host, SDK and README state that permissions are a contract, not a sandbox |
| 25 | 👤 "Trusted local plugins only" is the approved scope and the docs say so | ✅ VERIFIED | decision of 2026-10-02; stated in `SECURITY.md`, `README.md`, `docs/09` §9, `eip/sdk/README.md`, `eip/host/README.md` |

## Repository and publication — all 👤

| | Item | Status | What is left |
|---|---|---|---|
| 26 | Git repository initialized | ✅ VERIFIED | authorized 2026-10-02; branch `main`, no remote; `.gitignore` (node_modules) and `.gitattributes` (LF, keeps the LICENSE hash stable) |
| 27 | First commit made | ✅ VERIFIED | authorized 2026-10-02, made after every mandatory gate and the release gate passed; staged set reviewed for secrets, personal and private data, dependencies, artifacts (private names redacted per R-3) |
| 28 | Remote added, branch pushed | ✅ VERIFIED | authorized 2026-10-02: PRIVATE repository https://github.com/tmulab/cellular-mode (owner `tmulab` is a GitHub user account, confirmed by the author); `main` pushed; visibility and remote commit verified before and after the push |
| 29 | Published (npm, GitHub release, announcement) | ❌ not done | **no publish without authorization.** Items 15, 17 and 6 must be green first |
| 30 | Version and pre-1.0 scope stated at the top of the README | ✅ VERIFIED | `README.md` status line points here |

## The run behind the ✅ gate rows

Quoted from the end of this cell; re-run before any release decision, because a checklist
is a projection and the commands are the truth.

```
npm test        -> 263 pass, 0 fail
npm run typecheck -> tsc --noEmit -p jsconfig.json, 0 errors
npm run gates   -> size · secrets · deps · boundaries
node tools/gates/check-all.mjs --release   -> exit 0
  ✅ size · ✅ secrets · ✅ deps · ✅ boundaries — no findings
  ✅ pending exceptions: 0
  ✅ release: no blockers — every exception approved, every relaxation resolved
```

## Stage 3 — the Cellular Observer (added 2026-10-03)

The observer is **optional** and does not gate a release of the method; these items gate any
claim that stage 3 is finished. Full account: [`OBSERVER_REPORT.md`](OBSERVER_REPORT.md).

| | Item | Status | What is left |
|---|---|---|---|
| 31 | 👤 [ADR 0003](docs/adr/0003-observer-frontend.md) confirmed by the responsible human | ✅ VERIFIED | approved by Hudson A. R. Bonomo, 2026-10-03: independent local app, no Next.js in this version; future Next.js apps may register as application-type plugins |
| 32 | Browser checks performed | ✅ VERIFIED | headless Edge 154 over the DevTools protocol, real WebGL, 2026-10-03: 2D, 3D, navigation, selection, details, timeline, text view, audit, advisor, 320 px, 500 cells, CSP — per item in [`apps/observer/MANUAL-CHECKS.md`](apps/observer/MANUAL-CHECKS.md); five UI defects found and fixed. 👤 the interface received the human approval of Hudson A. R. Bonomo on 2026-10-03; final polish (2D framing, neutral disabled Advisor) verified headless the same day |
| 33 | 👤 Stage-3 work committed and pushed | ✅ VERIFIED | local commits authorized and made 2026-10-03; private push authorized and done the same day: remote `main` equalled the validated local `cfca2ed`, visibility private before and after, no release |
| 34 | Stage-3 gates and tests green | ✅ VERIFIED 2026-10-03 | the run quoted below |
| 35 | Trojan Source gate | ❌ not built | literal invisible/bidi characters were found in three files and fixed by hand this stage; the gate is parked in `vault/state/parking-lot.md` |

```
2026-10-03 run (stage 3, quoted from OBSERVER_REPORT.md §10):
npm run typecheck                          -> both configurations, 0 errors
npm test                                   -> 491 pass, 0 fail, 36 suites
npm run gates                              -> 362 files scanned, no findings, 0 pending exceptions
node tools/gates/trilateral.mjs --evidence -> typecheck 0 · build 119 modules · tests 491/491 · exit 0
node tools/gates/check-all.mjs --release   -> exit 0, no blockers
node tools/cellmode/cli.mjs check          -> passed · 1 active · 25 done · 26 log entries
node examples/text-stats/reproduce.mjs     -> 8 files identical, exit 0
node examples/observer-demo/reproduce.mjs  -> 9 files identical, exit 0
```

## Stage 4 — Cellular Adaptive (added 2026-10-03)

The adaptive module is **optional and experimental** and does not gate a release of the method;
these items gate any claim that stage 4 is finished. Full account:
[`ADAPTIVE_REPORT.md`](ADAPTIVE_REPORT.md) · design: [`docs/10-adaptive.md`](docs/10-adaptive.md).

| | Item | Status | What is left |
|---|---|---|---|
| 36 | 👤 [ADR 0004](docs/adr/0004-cellular-adaptive.md) confirmed by the responsible human | ✅ **APPROVED by Hudson A. R. Bonomo, 2026-10-03** | the ADR now reads *Accepted — APPROVED by Hudson A. R. Bonomo on 2026-10-03*. A decision of record, made by the author |
| 37 | Behavioural validation with a real model | ⚠️ PERFORMED once (n=1) | 2026-10-03, `claude-opus-5-5`, Claude Code CLI 2.1.283, sandbox copy: 13 checks passed, 6 deviations recorded, deviation 1 fixed (AD32) and re-run — [`VALIDATION-RESULTS-2026-10-03.md`](tools/adaptive/VALIDATION-RESULTS-2026-10-03.md). Observed behaviour, not a guarantee |
| 38 | Hooks are opt-in, never enabled by cloning | ✅ VERIFIED | `adapters/claude-code/settings.adaptive.json` ships as a snippet an adopter installs deliberately, because Claude Code project hooks run commands **with no trust prompt**. This repository's `.claude/settings.json` does not enable them |
| 39 | 👤 Stage-4 work committed and pushed | ✅ VERIFIED | local commit and private push authorized 2026-10-03: remote `main` equalled the validated `523cb44`, visibility private before and after, no release |
| 40 | 👤 DECIDED — the pause trigger is explicit only | ✅ **DECIDED by Hudson A. R. Bonomo, 2026-10-03, and applied** | the inferred-fatigue clause was **removed** from `skills/pause/SKILL.md`, both Claude Code pointers, `AGENTS.md` rule 7 and the docs. `/pause`, `/pausar` and the explicit stop phrases still run the ritual; a declared condition earns one offer and never an automatic pause or mode change. Enforced by `tests/pause-triggers.test.mjs`; history in `MIGRATION_REPORT.md` section 5 — `ADAPTIVE_REPORT.md` § *Resolved decision* |
| 41 | Stage-4 gates and tests green | ✅ VERIFIED 2026-10-03 | the run quoted below; no regression in `tools/cellmode`, `eip/kernel`, `eip/sdk`, the three `observer-*` plugins or `skills/pause` (diff against `5738789` is empty) |

```
2026-10-03 run (stage 4, quoted from ADAPTIVE_REPORT.md):
npm run typecheck                          -> both configurations, 0 errors
npm test                                   -> 702 pass, 0 fail, 48 suites
npm run gates                              -> 451 files scanned, no findings, 0 pending exceptions
node tools/gates/trilateral.mjs --evidence -> typecheck 0 · build 141 modules · tests 702/702 · exit 0
node tools/gates/check-all.mjs --release   -> exit 0, no blockers
node tools/cellmode/cli.mjs check          -> passed · 1 active · 35 done · 36 log entries
node examples/text-stats/reproduce.mjs     -> 8 files identical, exit 0
node examples/observer-demo/reproduce.mjs  -> 9 files identical, exit 0
```

## Stage 5 — UPP and independent CI (added 2026-10-03)

UPP and the CI workflow do **not** gate a release of the method; these items gate any claim
that stage 5 is finished. Full account: [`UPP_REPORT.md`](UPP_REPORT.md) · security:
[`docs/upp/SECURITY-REVIEW.md`](docs/upp/SECURITY-REVIEW.md).

| | Item | Status | What is left |
|---|---|---|---|
| 44 | 👤 [ADR 0005](docs/adr/0005-universal-plugin-protocol.md) confirmed by the responsible human | ✅ APPROVED | approved by Hudson A. R. Bonomo, 2026-10-04 — UPP 1.0: JSON-RPC 2.0 over NDJSON, adapted into the existing kernel, no second runtime |
| 45 | 👤 [ADR 0001](docs/adr/0001-frontend-exception.md) **amendment** (application plugins) confirmed | ✅ APPROVED | approved by Hudson A. R. Bonomo, 2026-10-04 — an independent frontend may be REGISTERED as `type: "application"`; registration is not in-process execution ([`docs/upp/APPLICATIONS.md`](docs/upp/APPLICATIONS.md)) |
| 46 | CI has actually run on GitHub | ⚠️ **NOT YET RUN REMOTELY** | item 43 holds the detail. The structure is VERIFIED locally; the *behaviour* on GitHub is **UNKNOWN** until the first push after authorization. No remote run may be quoted before it exists |
| 47 | Branch protection on `main` | ⚠️ **RECOMMENDATION only** | documented in [`tools/gates/CI.md`](tools/gates/CI.md); **no repository setting was changed** by this work. Without it, a push can land without a passing run. Enabling it is a human decision on a private repository |
| 48 | 👤 Stage-5 work committed and pushed | ❌ **not done — needs authorization** | every stage-5 change is uncommitted in the working tree. Nothing was committed, pushed, tagged or published, and `--no-verify` was never used. The authorization is per action, as in items 33 and 39 |
| 49 | Stage-5 gates and tests green | ✅ VERIFIED 2026-10-03 | the run quoted below, executed in the closing cell; `npm run rehearse:adaptive-removal` is green again after the regression recorded in `docs/upp/SECURITY-REVIEW.md` §4 |
| 50 | No regression in the earlier stages | ✅ VERIFIED 2026-10-03 | `git diff --stat b92c7c8 -- tools/cellmode eip/kernel eip/sdk eip/plugins tools/adaptive adaptive apps/observer skills` = 4 files, all additive or test-only: `SEMVER_PATTERN` exported from the SDK (one definition, not two), its README line, and a load-sensitivity fix in the observer proxy test. `tools/cellmode` and `tools/adaptive`: **no change**, and the boundary gate denies them `eip/upp*` by name |

```
2026-10-03 run (stage 5, closing cell — quoted from UPP_REPORT.md):
npm run typecheck                          -> both configurations, 0 errors
npm test                                   -> 993 tests, 993 pass, 0 fail, 0 skipped, 48 suites
npm run gates                              -> no findings, 0 pending exceptions
node tools/gates/check-all.mjs --release   -> exit 0, no blockers
npm run upp:conformance                    -> in-process · node · python · java · rust PASS 11/11; cpp UNEXECUTED
npm run rehearse:adaptive-removal          -> AD29 VERIFIED (suite + gates green with the module deleted)
node tools/gates/ci-trailer.mjs HEAD       -> 1 MATCH (history: 9 PRE_ARTICLE_8)
```

## Who must decide what

1. **Security contact** (item 6) — done: role address set on 2026-10-02.
2. **Push and publish** (items 28–29) — two separate authorizations (init and the first
   local commit were authorized and done on 2026-10-02).
3. **ADR 0003** (item 31) and the **stage-3 commit** (item 33) — both done on 2026-10-03.
4. **ADR 0004** (item 36) and the **pause-trigger decision** (item 40) — both decided by the
   author on 2026-10-03. The **stage-4 commit** (item 39) is still open and human-only, and
   item 37 (behavioural validation) stays deliberately **NOT PERFORMED** rather than guessed.

5. **ADR 0005** (item 44), the **ADR 0001 amendment** (item 45), the **stage-5 commit and push**
   (item 48) and **branch protection** (item 47) are open and human-only. Item 46 cannot be
   closed by anyone until a push makes the workflow run.

R-1 (item 15) was decided on 2026-10-02 and is closed. Nothing on this list may be marked
green by an agent on its own initiative.
