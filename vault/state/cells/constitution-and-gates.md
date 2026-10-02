# Cell: Constitution and gates
**ID:** constitution-and-gates
**Area:** tools/gates, policy/, tests/
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Automated enforcement of the engineering constitution
**Boundary:** in: size, secrets, deps, boundaries, trilateral gates + policy files | NOT in: docs, eip code
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** gates green on real repo, each gate red on seeded violation
**Last fact:** tools/gates/{scan,size,secrets,deps,boundaries,top-level,trilateral,check-all}.mjs + README; tests/gates*.test.mjs; policy/{size-exceptions,secrets-allowlist,allowed-dependencies}.json + relaxations.md; size tolerance 210 removed; npm run gates exit 0; trilateral: typecheck UNAVAILABLE, build 37 modules, tests 204/204; 5 mutations observed red
**Build/typecheck:** green
**Decisions:** typecheck UNAVAILABLE printed as warning, never green (R-1 pending human approval); vault/state excluded from size gate as append-only records; zero size exceptions
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
