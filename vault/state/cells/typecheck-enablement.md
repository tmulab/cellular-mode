# Cell: Typecheck enablement
**ID:** typecheck-enablement
**Area:** jsconfig.json, package.json, tools/gates/typecheck.mjs, JSDoc across the codebase
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Resolve R-1: real checkJs typecheck with the four strict flags
**Boundary:** in: dev deps typescript + @types/node, JSDoc fixes, gate wiring | NOT in: runtime deps, conversion to .ts
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** tsc 0 errors and the release gate exits 0
**Last fact:** typescript 5.9.3 (Apache-2.0) + @types/node 24.19.1 (MIT) + transitive undici-types 7.24.6 (MIT), exact pins, package-lock.json; jsconfig.json checkJs + strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + noImplicitOverride, skipLibCheck false, glob include reaches tests (verified by injected errors); 1038 errors -> 0 via JSDoc, zero any/ts-ignore, 5 justified ts-expect-error in contract-violation tests; 2 probe bugs fixed in tools/gates/typecheck.mjs; R-1 WITHDRAWN; .gitignore node_modules
**Build/typecheck:** green
**Decisions:** TS 5.9 chosen over 7.x native rewrite for a verification gate; release gate is the readiness oracle
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
