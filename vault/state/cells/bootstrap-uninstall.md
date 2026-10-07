# Cell: bootstrap-uninstall
**ID:** bootstrap-uninstall
**Area:** stage-7
**Opened:** 2026-10-06 · **Status:** ✔
**Objective:** Stage 7 Cell 6: existing-installation status and drift detection (install/repair/upgrade classification) and safe uninstall driven by the install manifest, with dry-run
**Boundary:** in: tools/bootstrap status/drift/uninstall modules, CLI status + uninstall, tests | NOT in: updater implementation, security pass, docs
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** status classifies healthy/drift/partial; uninstall removes only intact owned files and blocks, never user content; dry-run writes nothing; trilateral + verify:final green
**Last fact:** Status and uninstall: writer family (writer-base, writer-remove: removeOwned re-hashes right before unlink, removeBlock exact intact block, removeEmptyDir), status(+read,+render: healthy/drift/partial; none/repair/upgrade/repair-or-upgrade; zero writes), uninstall(+plan,+render: dry-run, confirm, force-modified per path, hooks unset only if still .githooks, vault/state kept whole if user history added, manifest removed last or kept untouched with uninstall-report), manage-flow; install manifest block = {component, sha256}. +19 tests: round-trip byte identity after uninstall, hostile manifests refused; mutation on re-hash went red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 277 modules load, tests 1394/1394; gates release no blockers
**Decisions:** Manifest never rewritten; kept when anything remains. Block digests recorded; legacy bare form = integrity UNKNOWN. Forced deletion durable record only while something is kept (documented limitation).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
