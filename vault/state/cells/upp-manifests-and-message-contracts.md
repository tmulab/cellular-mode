# Cell: UPP manifests and message contracts
**ID:** upp-manifests-and-message-contracts
**Area:** eip/upp (pure), upp/schemas
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Versioned language-independent manifest and JSON-RPC message contracts with validation and version negotiation
**Boundary:** in: manifest validation, toUppManifest compat, message builders and validators, error mapping, JSON schema files, tests | NOT in: transports, processes, CI
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cell-2 criteria of docs/upp/ACCEPTANCE.md green with mutation proofs; final verification authorized
**Last fact:** eip/upp pure modules (version negotiation, JSON-RPC envelopes and framing limits, error mapping with remote authority codes forced to PLUGIN_ERROR, manifest with argv-array entries and closed security sections, compat toUppManifest for all six existing plugins) + upp/schemas JSON generated from the JS source with a drift check; three new boundary rules; 82 new tests, 822/822; 5 mutations red; a false green in the drift test (the test regenerated what it checked) found by mutation and fixed structurally
**Build/typecheck:** green
**Decisions:** published JSON schemas state shape only; conditional rules live in validateUppManifest and the asymmetry is tested both ways
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
