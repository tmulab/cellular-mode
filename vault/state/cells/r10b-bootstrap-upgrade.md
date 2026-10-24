# Cell: R10b bootstrap upgrade
**ID:** r10b-bootstrap-upgrade
**Area:** bootstrap
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** upgrade verb for apps already running the method. Conflicts named: registers R6's new skills in the catalog if R6 reports the need; docs/12 at 197 lines
**Boundary:** in: tools/bootstrap/**, docs/12-bootstrap.md | NOT in: tools/cellmode/**, skills/**, any real repository outside temp folders, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** upgrade --dry-run writes zero bytes and prints the plan per ownership class; --confirm replaces immutables, extends the vault skeleton without touching log.md, rewrites the manifest, status healthy after; a user-modified immutable is refused; node --test green
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read status-ownership.mjs, install-manifest.mjs and writer-evolving.mjs and write how status decides each ownership class
