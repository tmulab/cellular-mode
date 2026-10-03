# Release checklist — public release

**Current verdict: no technical blocker left for stages 1-2; stage 3 adds three OPEN items (31-33).**
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
| 32 | Browser checks performed | ⚠️ automated items PASSED, human items open | headless Edge 154 over the DevTools protocol, real WebGL, 2026-10-03: 2D, 3D, navigation, selection, details, timeline, text view, audit, advisor, 320 px, 500 cells, CSP — per item in [`apps/observer/MANUAL-CHECKS.md`](apps/observer/MANUAL-CHECKS.md); five UI defects found and fixed. 👤 perceived contrast, screen reader and feel remain LEFT FOR HUMAN |
| 33 | 👤 Stage-3 work committed | ✅ local commit authorized 2026-10-03 | committed locally after the final gates; **push not yet authorized** (pending the human browser items) |
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

## Who must decide what

1. **Security contact** (item 6) — done: role address set on 2026-10-02.
2. **Push and publish** (items 28–29) — two separate authorizations (init and the first
   local commit were authorized and done on 2026-10-02).
3. **ADR 0003** (item 31) and the **stage-3 commit** (item 33) — both open, both human-only.

R-1 (item 15) was decided on 2026-10-02 and is closed. Nothing on this list may be marked
green by an agent on its own initiative.
