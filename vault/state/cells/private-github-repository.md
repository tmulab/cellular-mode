# Cell: Private GitHub repository
**ID:** private-github-repository
**Area:** SECURITY.md, tests/leaks.test.mjs, RELEASE_CHECKLIST.md, git remote
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Set the security contact and push main to a private GitHub repository
**Boundary:** in: role address, narrow leak exception, private repo, push, verification | NOT in: public visibility, releases, packages
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** remote main equals the validated local commit and the repo is private
**Last fact:** SECURITY.md role address set; leaks test allows exactly that address in exactly SECURITY.md (mutation dropping the file restriction went red); repository owner tmulab is a GitHub user account, not an organization, use confirmed by the author; private repo created and main pushed
**Build/typecheck:** green
**Decisions:** visibility stays private until the author authorizes public release; no release, no package publish
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
