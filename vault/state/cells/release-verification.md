# Cell: Release verification
**ID:** release-verification
**Area:** policy/, tools/gates/release.mjs, eip/host write-port test
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Act on R-1/R-2 decisions and verify the symlink guard
**Boundary:** in: R-1 proposal, R-2 review+narrowing, release gate, junction test | NOT in: installing dependencies
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** the release gate lists only real blockers
**Last fact:** R-2: empty-allowlist scan 0 findings (positive control detects), 4 entries removed, allowlist [], status WITHDRAWN; R-1 ACCEPTED dev-only release-blocking, policy/typecheck-proposal.md (typescript + @types/node, versions UNKNOWN offline); tools/gates/release.mjs + check-all release flag (exit 2, R-1 only); symlink guard VERIFIED win32 via junction, POSIX UNKNOWN
**Build/typecheck:** green
**Decisions:** pending exceptions honoured in dev but always printed; only APPROVED/WITHDRAWN resolve a relaxation
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
