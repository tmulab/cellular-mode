# Acceptance criteria — Cellular Adaptive at its edges (cells 4 and 5)

The module's own contract is [`ACCEPTANCE.md`](ACCEPTANCE.md). This file holds the criteria for
the places where it meets an agent: the Claude Code skills and hooks, the portable path any
agent can follow, and the optional Observer (AD27, AD28, AD30, AD31 — all VERIFIED in cell 5). Same rules — each criterion binary, with the test
that proves it and the mutation that turns that test red. Labels: VERIFIED (ran it) / INFERRED
/ PROPOSED / UNKNOWN.

## What is deterministic here, and what is not

Mechanically enforced: the state and its validation, expiry, which policy files are read, the
assembled block, the hook setting a mode **only** from an exact command token, and — in Claude
Code — a skill the model cannot invoke (`disable-model-invocation: true`).

**Model-dependent, and not enforceable by this repository:** whether a model actually behaves
the way the injected block describes. Nothing here measures compliance, and no criterion below
claims it. `MANUAL-VALIDATION.md` is how a human checks it; it was **PERFORMED once on
2026-10-03** and the single run is recorded in `VALIDATION-RESULTS-2026-10-03.md`. One run is
evidence, not a guarantee: the behavioural effect stays INFERRED.

## Claude Code skills (cell 4)

- **AD17** Eight mode skills exist for Claude Code — `tired`, `ready`, `focus`, `explore` and
  the four Portuguese names — in `adapters/claude-code/.claude/skills/<name>/SKILL.md`, and
  byte-identical in the repository's own `.claude/skills/`. Each is ≤15 lines, carries
  `disable-model-invocation: true`, and points at `skills/mode/SKILL.md`.
  *Test:* `tests/bootstrap.test.mjs` — the adapter pointer test, the byte-identity test, and
  "every mode skill is user-invocable only".
  *Red without it:* remove `disable-model-invocation` from one skill; let the two trees drift;
  grow a skill past 15 lines.
- **AD18** The skills are why this works WITHOUT hooks: because only a human can invoke them, a
  `set` they run is user-originated by construction. They record `source: 'skill'`, which the
  CLI accepts through `--source skill` and nowhere else infers.
  *Test:* `cli.test.mjs` — `--source` is accepted for `cli` and `skill` and refused otherwise;
  `tests/bootstrap.test.mjs` asserts each skill body runs `set … --source skill`.
  *Red without it:* let `--source` take any string; drop the flag from a skill body.

## Hooks (cell 4 — opt-in)

- **AD19** `cli.mjs hook <SessionStart|UserPromptSubmit>` reads the hook JSON from stdin and
  **never blocks a prompt**: exit 0 on every path, including malformed JSON, an absent payload,
  an unknown event name and a missing policy file; anything wrong is one line on stderr.
  *Test:* `hook.test.mjs` — the failure matrix, including two real spawned processes with
  stdin. *Red without it:* return a non-zero code on a bad payload.
- **AD20** A mode is set from a prompt **only** when the trimmed prompt is exactly one of the
  twelve slash commands. Natural language never sets anything: "I'm tired", "estou cansado",
  "foco total", "/tired please", "tired" and "please use /focus" all leave the state untouched.
  *Test:* `hook.test.mjs` — the no-inference table (the single most important test in the
  module). *Red without it:* match a prefix, a first token, or a bare alias.
- **AD21** Injection is idempotent per session: the block prints when it CHANGED since the last
  injection for this `session_id`, and otherwise not at all; a new `session_id` reprints; an
  expiry notice therefore prints exactly once. The cache is `.cellular/adaptive/injected.json`
  and holds one entry, never a history.
  *Test:* `hook.test.mjs` — the hash cases. *Red without it:* print on every prompt; key the
  cache on nothing.
- **AD22** Hooks are **opt-in**. `adapters/claude-code/settings.adaptive.json` is a snippet plus
  a documented install step; this repository's own `.claude/settings.json` is not created or
  modified by the module, because project hooks run commands with no trust prompt.
  *Test:* `tests/bootstrap.test.mjs` — "the adaptive hook configuration is opt-in" (the snippet
  exists, and no settings file in the repository references `tools/adaptive`).
  *Red without it:* merge the snippet into a settings file the clone already uses.

## Portable integration (cell 4)

- **AD23** Any agent can follow the same path without Claude Code: `skills/cell/SKILL.md` tells
  it, in ≤3 added lines, to run `node tools/adaptive/cli.mjs context` after reconnecting and
  apply the block, with empty output meaning the default. `AGENTS.md` gains ≤2 lines, stays
  ≤55 lines, and still names no tool's configuration file.
  *Test:* `tests/bootstrap.test.mjs` (the AGENTS.md budget and tool-neutrality assertions) and
  `tests/adaptive-integration.test.mjs`.
  *Red without it:* exceed the AGENTS.md budget; drop the pointer from the cell skill.
- **AD24** The documentation separates deterministic from model-dependent explicitly, per agent,
  and claims compliance nowhere: `docs/08-agent-integration.md`, `adapters/README.md` and
  `ACCEPTANCE-INTEGRATION.md` each say so in those words.
  *Test:* `tests/adaptive-integration.test.mjs` — the honesty assertions.
  *Red without it:* state anywhere that following the block is guaranteed.
- **AD25** The context cost is MEASURED, not estimated: the bootstrap delta and the per-turn
  cost are recorded in bytes in `tools/adaptive/README.md` and `CONTEXT_AUDIT.md`, and the
  per-turn cost is **0 bytes** when the effective block has not changed.
  *Test:* `hook.test.mjs` asserts the zero-cost case byte-for-byte;
  `tests/adaptive-integration.test.mjs` asserts both documents carry the measurement.
  *Red without it:* print the block again when nothing changed.

## Risk recorded, not resolved (cell 4)

- **AD26** The precedence between a project skill named `tired` and any future built-in command
  of the same name is **UNDOCUMENTED** upstream (UNKNOWN, not INFERRED). The fallback names
  `/mode-tired`, `/mode-ready`, `/mode-focus`, `/mode-explore` are documented in
  `adapters/README.md` and deliberately **not shipped**, so adopting them is a rename and not a
  redesign. *Test:* `tests/adaptive-integration.test.mjs` asserts the risk and the fallback are
  written down. *Red without it:* delete the risk note and claim precedence is known.

## Observer (cell 5)

- **AD27** The observer plugin is read-only: a path-confined read port over
  `.cellular/adaptive/` — **two file names**, everything else refused, including the hook's own
  `injected.json` — no write port anywhere, and it reports the standing without interpreting
  what the mode means. Five standings, five distinguishable answers; `expired` is not honoured
  and `invalid` is never rendered as `none`; an unusable `preferences.json` is reported instead
  of a mode. The clock is a parameter, so expiry is tested at the boundary.
  *Test:* `eip/host/adaptive-read-port.test.mjs`, `eip/plugins/adaptive-preferences.test.mjs`,
  `eip/plugins/adaptive-preferences-contract.test.mjs`,
  `eip/plugins/adaptive-preferences-http.test.mjs`; criteria P1–P8 and Q1–Q5 in
  `eip/plugins/adaptive-preferences/ACCEPTANCE.md`.
  *Red without it:* add `injected.json` to the closed set; grant a write port; cache the
  answer between calls; let an unparsable file read as an absence.
- **AD28** Presentation only, never at the cost of a finding: **every** mode still shows every
  `FAIL` and every finding of a named security rule (`secrets`, `deps`, `import-boundaries`), in
  full and not deferred — proved for all four modes over a mixed list and over a 500-finding
  list. What is shown in full is a tested SUPERSET of that invariant (`WARNING` is shown too),
  and a test forbids it ever narrowing back past the invariant. A mode may reorder, and may defer the TAIL of what is merely informative behind a
  `show all` control that states how many items it would add. The badge is read-only: there is
  no selector, and the capability has no setter at all. Writing a mode from the Observer is
  recorded as future work and deliberately not built.
  *Test:* `apps/observer/tests/mode-invariant.test.mjs` (the invariant, its own file) and
  `apps/observer/tests/mode-view.test.mjs`; criterion D24 in `apps/observer/ACCEPTANCE.md`.
  *Red without it:* let `tired` cap a `FAIL`; stop treating a security rule as mandatory;
  honour an `expired` standing as if it were active.
- **AD30** The import exception is NAMED, in one place, and fail-closed everywhere else:
  `ADAPTIVE_PURE_IMPORTS` in `tools/gates/allowlists.mjs` lists four pure modules
  (`modes`, `schema`, `types`, `validity`) and is used by one rule,
  `adaptive-plugin-imports-only-named-pure-modules`, for `eip/plugins/adaptive-*/` only.
  `io.mjs`, `main.mjs`, `cli.mjs`, `hook.mjs`, `context.mjs`, `commands.mjs`, `transitions.mjs`
  and `errors.mjs` stay forbidden; the kernel, the host and sibling plugins stay forbidden; and
  **every `observer-*` plugin is still refused `tools/adaptive` entirely**, pure or not, so
  deleting the module leaves the Observer whole.
  *Test:* `tests/gates-adaptive-boundary.test.mjs`.
  *Red without it:* turn the allowlist into a `tools/adaptive/` prefix; add `io.mjs` to it;
  drop `adaptive-` from the deny rule's negative look-ahead.
- **AD31** The Observer integration is **opt-in and provably inert when off**:
  `apps/observer/cli.mjs --adaptive` loads the plugin, and without the flag the key does not
  exist, the host's plugin list does not name it, a call answers `404 NOT_FOUND`, the port over
  `.cellular/adaptive/` is **never created**, and the `observer.*` answers are **byte-identical**
  with the flag and without it.
  *Test:* `eip/plugins/adaptive-preferences-http.test.mjs`, `apps/observer/tests/cli.test.mjs`.
  *Red without it:* create the port for every composition; load the plugin by default; let the
  flag change a byte of an `observer.state` answer.

## Core independence (cell 6)

- **AD29** `npm test`, `node tools/gates/check-all.mjs` and the Observer all pass with the
  adaptive module **deleted**: `adaptive/`, `tools/adaptive/`, `skills/mode/`, the eight Claude
  skills in both trees, `adapters/claude-code/settings.adaptive.json`,
  `eip/plugins/adaptive-preferences*`, `eip/host/adaptive-read-port*`, `tests/*adaptive*` and
  `apps/observer/tests/mode-*.test.mjs` — 31 paths, as data in `ADAPTIVE_PATHS`. Nothing that
  must survive may import the module STATICALLY, because a static specifier is resolved when the
  importing module loads: the composition reaches the plugin AND its read port through one
  guarded dynamic `import()` behind `--adaptive`, and the flag asked for in a checkout without
  the module is a startup error that names it, never a crash. With no flag, nothing is imported.
  *Test:* `tools/gates/removal-rehearsal.mjs` (`npm run rehearse:adaptive-removal`) deletes the
  set in an `os.tmpdir()` copy and runs both there; the fast half runs in `npm test` as
  `tests/optional-module-imports.test.mjs`, which reads import statements and names any static
  import of the module from `eip/host/`, `apps/observer/`, `tools/cellmode/` or an
  `observer-*` plugin.
  *Result:* **VERIFIED 2026-10-03** — `deleted 31 of 31 documented paths` ·
  `npm test (node --test) — exit 0` · `node tools/gates/check-all.mjs — exit 0` ·
  `AD29 VERIFIED: the suite and the gates pass with the adaptive module deleted.`
  *Previously claimed and NOT true:* this criterion used to cite "the cell-6 deletion rehearsal,
  recorded in the stage report" and had never been run. A real rehearsal failed **15 tests**:
  `eip/host/index.mjs` re-exported `createAdaptiveReadPorts` and `observer-composition.mjs`
  imported it statically, so every importer of the host failed to resolve. Fixed; the defect is
  recorded in `ADAPTIVE_REPORT.md`.
  *Red without it:* re-add either static import (both observed red); narrow the static test's
  scope list (observed red); let a documented path go stale — the rehearsal refuses the run.

## Return to the default, found by behavioural validation (cell 6)

- **AD32** An explicit or out-of-band return to `ready` is **announced once, in one line**.
  `ready` is the absence of a declaration and has no policy block, so before this fix `/ready`
  injected 0 bytes and a model that had been told `tired` kept believing it — deviation 1 of the
  2026-10-03 validation, a real confirmation gap rather than a code defect. `hook.mjs` now prints
  `READY_NOTICE` exactly once: when the human types `/ready` or an alias, or when a block already
  given to this `session_id` no longer applies (an expiry, a terminal `reset`). Then it falls
  silent, so AD21's idempotence and AD25's 0-byte steady state are unchanged, and nothing is
  inferred — only a command, or a state the human caused, triggers it.
  *Test:* `tools/adaptive/hook-ready.test.mjs` (red before the fix; two mutations observed red).
  *Red without it:* print the notice on every prompt; print nothing at all on `/ready`.

## Human-review items (no script covers these)

1. Whether a real model's behaviour actually changes per mode — **PERFORMED once on 2026-10-03**,
   `VALIDATION-RESULTS-2026-10-03.md`: `claude-opus-5-5`, CLI 2.1.283, n = 1 per scenario,
   13 checks passed, 6 deviations recorded, one of them fixed as AD32 and re-run. Still a single
   run judged by an agent reading transcripts, so the behavioural effect stays INFERRED.
2. Whether enabling the hooks in this repository is worth the automatic command execution.
3. Whether the eight extra skill names are a good use of the Claude Code command surface.
