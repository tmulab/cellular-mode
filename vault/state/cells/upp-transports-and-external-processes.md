# Cell: UPP transports and external processes
**ID:** upp-transports-and-external-processes
**Area:** eip/host upp transports (in-process compat, process NDJSON, http), upp.config.json
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Run external plugins through the existing kernel via process and HTTP transports with operator authorization
**Boundary:** in: process supervisor, NDJSON transport, http client transport, kernel adapter, operator config, tests with a Node test plugin | NOT in: polyglot examples, application plugins, CI
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cell-3 criteria of docs/upp/ACCEPTANCE.md green incl. crash, timeout, cancel, malformed; final verification authorized
**Last fact:** eip/upp-host: strict operator config with manifest sha256 pin, single spawn site with shell false and argv array, minimal env, NDJSON byte-chunk framing (defect found: a line was extracted before measuring, so 9 bytes passed an 8-byte cap; fixed test-first), handshake judged on version and identity, one-answer-per-id correlation, lifecycle with health and at most one restart, http transport loopback by default without redirects, registerUppPlugin into the existing kernel (no ports, consequential preserved, approval before transport proven); RULES table moved to tools/gates/rules.mjs; 58 + boundary tests, 890/890; 9 mutations red
**Build/typecheck:** green
**Decisions:** U10 (in-process UPP equivalence) left PROPOSED here and moved to cell 4 conformance; allowNetwork true refused as not implemented; external plugins cannot call siblings in v1
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
