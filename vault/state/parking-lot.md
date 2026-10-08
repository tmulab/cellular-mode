# Parking lot

One line per captured idea. Nothing is ever deleted here.
Format: `- [YYYY-MM-DD] <idea> (context: cell <name>)`
Promoted to a cell → append `✔ → cell <name>` to its line.
- [2026-10-02] No cancelled or abandoned cell state exists in the protocol: reopening is a new cell. Decide whether that is a feature or a gap before a 1.0. (context: cell Hygiene tests and reports)
- [2026-10-02] Adapters for Cursor, Codex CLI, Gemini CLI, Copilot and Aider still need one real live session each before anyone can call them tested. (context: cell Hygiene tests and reports)
- [2026-10-02] cellmode args: option values that start with -- are rejected (e.g. a done criterion mentioning a flag); consider supporting --opt=value (context: no active cell)
- [2026-10-02] cellmode open has no option to record the first next step, so every newly opened cell starts with NEXT STEP: — (the Observer auditor flags it as AUD-CELL-CONTRACT WARNING); consider a next option on open (context: cell Observer auditor) ✔ → cell Stage 3 final validation
- [2026-10-03] Add a Trojan Source gate: fail on literal invisible or bidi-control characters (U+200B-200F, U+202A-202E, U+2066-2069, U+FEFF) in source; escapes only (context: cell Observer advisor)
- [2026-10-06] Pre-existing flaky test: eip/upp-host/process.test.mjs 'a plugin that ignores shutdown is terminated anyway' failed once under parallel load (2026-10-06, Stage 7 Cell 1); passes in isolation and reruns (context: cell bootstrap-audit)
- [2026-10-07] Second intermittent test: tests/gates-ci-trailer-git.test.mjs 'an UNKNOWN boundary fails closed' failed once in a full run, passed alone and on rerun (2026-10-07, Stage 8 Cell 7). Joins the process.test.mjs flake; cause UNKNOWN. (context: cell hardening-builder)
