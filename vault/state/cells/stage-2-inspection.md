# Cell: Stage 2 inspection
**ID:** stage-2-inspection
**Area:** methodology sources
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Map metodo_tmulab (latest) and the existing EIP design before building
**Boundary:** in: read-only inspection, traceable mapping | NOT in: any code
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** mapping written and reviewed
**Last fact:** Mapped latest metodo_tmulab (the author's private method source, 1352 lines, body through v5.2.7 though frontmatter says 5.1.0) vs the 50KB copy (only additions: Rule 1.1 nine false-green forms + source-guard rules, Rules 10.7/10.8); mapped the author's private rules index (index + Map Rule, TMU-LAB governance); mapped the EIP conventions of the author's private plugin repository (name=key, inject{required}, apply, effects with inverse, fail loud required / degrade optional, infra as config ports, plugin is not a server)
**Build/typecheck:** green
**Decisions:** Engineering layer: Hudson's extensions integrated faithfully (authorized 2026-10-02), Akita-original layer restated independently; public kernel is a zero-dep reimplementation of EIP concepts, no third-party or private code copied; HTTP/UI live in the composition (host), not in plugins
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
