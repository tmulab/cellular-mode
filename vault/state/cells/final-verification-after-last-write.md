# Cell: Final verification after last write
**ID:** final-verification-after-last-write
**Area:** tools/gates (fingerprint, verify-final, git hooks), tools/cellmode complete, constitution, skills
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Enforce that completion, commit and push are authorized only by verification evidence bound to the exact final state
**Boundary:** in: state fingerprint, verify:final, evidence outside the state, completion authorization, pre-commit and pre-push hooks, docs, regression tests | NOT in: weakening any gate, rewriting history, commit or push
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** stale-evidence regression tests red before and green after; this cell itself completed through the new procedure
**Last fact:** constitution Article 8 (verification at the final state): tools/gates/fingerprint.mjs (SHA-256 over every file git would include, plus the git tree id via a throwaway index), verify-final.mjs (npm run verify:final: fingerprint, mandatory suite, fingerprint again, evidence appended outside the state in .cellular/evidence/final-verification.jsonl), authorization.mjs and commit-range.mjs (status, commit, trailer, push, audit), .githooks pre-commit, commit-msg (Verified-State trailer), pre-push; check-all --require-authorized opt-in; cellmode complete now says completion is recorded but not authorized; boundary rule cellmode-does-not-depend-on-the-gates; tests (a)-(k) in throwaway git repos incl. vault append after verification; 4 mutations red; this entry was written before the final verification that authorizes it
**Build/typecheck:** green
**Decisions:** evidence lives outside the verified state; hooks are not installed until the author decides; --no-verify bypass is a documented limitation detectable by audit
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
