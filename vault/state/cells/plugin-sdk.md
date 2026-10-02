# Cell: Plugin SDK
**ID:** plugin-sdk
**Area:** eip/sdk
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Small versioned plugin contract with in-house schema validation
**Boundary:** in: manifest contract, schema subset, error codes | NOT in: kernel, plugins, transport
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** contract tests green
**Last fact:** eip/sdk/{version,errors,schema,manifest,define,index}.mjs + README; 27 tests (schema, manifest, define)
**Build/typecheck:** green
**Decisions:** SDK_VERSION '1'; key = name = provided capability (domain.name); fixed permission list; devUi optional static HTML <=64KB
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
