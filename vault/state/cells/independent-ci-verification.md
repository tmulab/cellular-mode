# Cell: Independent CI verification
**ID:** independent-ci-verification
**Area:** .github/workflows, tools/gates (ci-trailer, evidence counts), docs
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Re-run every mandatory check on a clean GitHub runner and check the Verified-State trailer against the real commit tree
**Boundary:** in: workflow with least privilege and SHA-pinned actions, trailer checker with pre-Article-8 policy, evidence test counts, local structural validation, branch-protection recommendation | NOT in: changing repository settings or branch protection, pushing to trigger a run
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** workflow validated locally and labelled not yet run on GitHub; trailer checker tested; final verification authorized
**Last fact:** GitHub Actions workflow .github/workflows/verify.yml (push and pull_request only, contents read only, no secrets, persist-credentials false, actions pinned by SHA: checkout v7.0.1, setup-node v7.0.0, setup-python v7.0.0, setup-java v6.0.1) re-runs the whole mandatory suite plus conformance on a clean runner; tools/gates/ci-trailer.mjs compares the Verified-State tree with the real commit tree (local run: HEAD b92c7c8 MATCH, full history 1 MATCH and 9 PRE_ARTICLE_8); verify-final now records tests/pass/fail/skipped and lists skips; lead added a guard test that every piped step declares shell bash so pipefail applies (mutation red); workflow NOT yet run on GitHub; branch protection only recommended
**Build/typecheck:** green
**Decisions:** the trailer is a claim about a tree, never proof that tests passed; CI's own run is the evidence; pre-Article-8 commits are reported, never failed, never backfilled
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
