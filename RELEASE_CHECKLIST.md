# Release checklist — public release

**Current verdict: no technical blocker left.** R-1 was resolved on 2026-10-02 (item 15):
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
| 3 | No third-party code bundled; the notices say so | ✅ VERIFIED | `THIRD_PARTY_NOTICES.md`; `npm run gates` (deps) finds zero dependencies |
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
| 22 | Both ADRs accepted by the responsible human | ✅ VERIFIED | [0001](docs/adr/0001-frontend-exception.md), [0002](docs/adr/0002-zero-dependency-kernel.md) — approved by Hudson A. R. Bonomo, 2026-10-02 |
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

## Who must decide what

1. **Security contact** (item 6) — done: role address set on 2026-10-02.
2. **Push and publish** (items 28–29) — two separate authorizations (init and the first
   local commit were authorized and done on 2026-10-02).

R-1 (item 15) was decided on 2026-10-02 and is closed. Nothing on this list may be marked
green by an agent on its own initiative.
