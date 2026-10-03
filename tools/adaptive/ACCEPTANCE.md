# Acceptance criteria — Cellular Adaptive (Stage 4)

Written **before** the code. One file for the whole module, so the later cells inherit a
contract instead of inventing one. Each criterion is binary, names the test that proves it,
and names the mutation that must turn that test red. Labels: VERIFIED (ran it) / INFERRED /
PROPOSED / UNKNOWN.

Cell tags: **[c1]** contracts · **[c2]** persistence, validity and the CLI · **[c3]** modes,
aliases and the injected block · **[c4]** agent integration · **[c5]** observer ·
**[c6]** closure. A criterion tagged c4–c6 is **PROPOSED**: the contract the later cell must
satisfy, not a claim about existing behaviour.

## Scope

Cellular Adaptive is an **optional, experimental** module that changes the *form* of the
collaboration — how much is said, how many decisions arrive at once, how large a step is —
after the human declares a mode. It changes nothing about *what* is required: gates,
approvals, tests and security reporting are invariant. It performs no diagnosis, stores no
condition about a person, and infers no state.

## Contracts (cell 1)

- **AD1** The policy set exists and is small enough to inject: `adaptive/policies/`
  contains exactly `boundaries.md` (≤12 lines) and one file per mode (`tired.md`,
  `ready.md`, `focus.md`, `explore.md`, ≤25 lines each), and every mode in the registry
  points at an existing file.
  *Test:* `tools/adaptive/modes.test.mjs` — "every policy file exists and fits its budget".
  *Red without it:* delete or grow a policy file; drop `policyFile` from a registry entry.
- **AD2** The registry is frozen data: `MODES` is a frozen array of frozen records
  `{ id, aliases, policyFile, temporary }` with exactly four ids, `ready` is
  `temporary: false` and the other three are `temporary: true`, and `DEFAULT_MODE` is
  `'ready'`.
  *Test:* `modes.test.mjs` — "the registry is frozen" / "ready is the non-temporary default".
  *Red without it:* flip a `temporary` flag; drop an `Object.freeze`; add a fifth mode.
- **AD3** `resolveMode` accepts the canonical id and the Portuguese aliases, with or
  without a leading slash, in any case, with surrounding whitespace: `/tired`, `tired`,
  `/modocansado`, `cansado`, `MODOFOCO`, ` /explorar ` all resolve; everything else —
  unknown words, `''`, `'/'`, non-strings, `'//tired'`, `'tired now'` — returns `null`.
  *Test:* `modes.test.mjs` — the alias table and the rejection table.
  *Red without it:* drop the `toLowerCase`, the trim, or the slash strip; accept a prefix
  match instead of an exact one.
- **AD4** The invariants are data, not prose: `INVARIANTS` is a frozen list of
  `{ id, statement }` covering, at minimum, quality gates, security findings, approvals,
  tests and acceptance criteria, evidence and epistemic labels, plugin permissions, cell
  integrity, reporting failure and uncertainty, and the prohibition on inferring a state.
  *Test:* `modes.test.mjs` — "INVARIANTS covers the declared ground".
  *Red without it:* remove any of the named invariants.
- **AD5** The adaptable surface is data and does not overlap the invariants:
  `ADAPTABLE` is a frozen list of `{ id, dimension, note }` naming only presentational
  and granularity dimensions, and no `ADAPTABLE` dimension mentions a gate, an approval,
  a test or a permission.
  *Test:* `modes.test.mjs` — "ADAPTABLE and INVARIANTS do not overlap".
  *Red without it:* add "skip the gates" as an adaptable dimension.
- **AD6** `validateSession` is strict: it accepts exactly the eight declared keys,
  rejects any unknown key, rejects `mode: 'ready'` (the default is never stored), rejects
  a non-ISO date, rejects `expiresAt <= activatedAt`, and rejects a span outside
  `0.5 .. 12` hours. Every rejection returns `{ ok: false, errors }` with
  `{ path, message }` entries — never a throw.
  *Test:* `tools/adaptive/schema.test.mjs` — the session table.
  *Red without it:* allow unknown keys; drop the ordering check; widen the TTL bounds.
- **AD7** `validatePreferences` can never store a condition: the keys `mode`,
  `condition`, `conditions`, `tired`, `ready`, `focus`, `explore`, `declaredBy`,
  `activatedAt`, `expiresAt`, `command`, `scope` and `source` are rejected with a message
  that says why, distinct from the generic unknown-key message.
  *Test:* `schema.test.mjs` — "preferences reject every condition key".
  *Red without it:* remove a name from `FORBIDDEN_PREFERENCE_KEYS`; merge the two error
  messages into one.
- **AD8** Boundary: `tools/cellmode/**`, `eip/sdk/**`, `eip/kernel/**` and every
  `eip/plugins/*` except a future `adaptive-*` must not import `tools/adaptive/**`, so
  Cellular Mode and the runtime keep working with the whole module deleted. An
  `eip/plugins/adaptive-*` import is still a violation **today** (the plugin allow-rule
  catches it) and only becomes legal when c5 adds a named allowlist.
  *Test:* `tests/gates-adaptive-boundary.test.mjs` — the
  `adaptive-is-optional-and-isolated` cases, including the fail-closed case for
  `adaptive-*`.
  *Red without it:* delete the rule; widen it to a prefix that swallows the exception.

## Persistence, temporal validity and the CLI (cell 2)

AD14..AD16 were tagged c3 when this file was written; the CLI landed in cell 2, so they are
re-tagged here rather than restated elsewhere. `context` became AD13b, done in cell 3.

- **AD9** `io.mjs` is the ONLY module in `tools/adaptive/` that imports `node:fs`; every
  other module is pure, and the clock is a parameter rather than a call.
  *Test:* `io.test.mjs` import-surface scan; `validity.test.mjs` / `transitions.test.mjs`
  reject `Date.now`. *Red without it:* add a `readFileSync` or a `Date.now` to a pure module.
- **AD10** A missing, unreadable, malformed, schema-wrong or expired `session.json` yields
  effective mode `ready` and never throws. `missing` is `none` with no notice; malformed and
  schema-wrong are `invalid` WITH a notice; a closed window is `expired` WITH a notice. A
  malformed file is never auto-deleted — it is the human's file.
  *Test:* `validity.test.mjs` degradation table; `io.test.mjs` tolerant-read cases.
  *Red without it:* let a parse error propagate; render `invalid` as `none`; delete on read.
- **AD11** Expiry is evaluated on read and the window is half-open: `now === expiresAt` is
  already `expired`. The TTL comes from `preferences.ttlHours` when present, otherwise the
  4-hour default, and is never estimated from anything.
  *Test:* `validity.test.mjs` boundary cases; `transitions.test.mjs` TTL table.
  *Red without it:* use `>` instead of `>=`; ignore `preferences.ttlHours`.
- **AD12** State lives under `<root>/.cellular/adaptive/` and never under `vault/`. Paths are
  root-confined and built from constants; writes are atomic (temp file + rename).
  *Test:* `io.test.mjs` path, confinement and atomicity assertions; every CLI test hashes
  `vault/` before and after. *Red without it:* point the path builder at `vault/state/`.
- **AD13** Declaring `ready` STORES NOTHING: it deletes `session.json`. `reset` is the same
  transition under another name, and `clear` removes both files with no backup.
  *Test:* `transitions.test.mjs` (`declare('ready')` yields no session) and `cli.test.mjs`.
  *Red without it:* persist `mode: 'ready'`.
- **AD14** Exit codes: 0 on success, 1 on usage or an unknown mode (printing the valid
  vocabulary, Portuguese aliases included), 2 when the state on disk cannot be read as a
  declaration. `status` writes nothing.
  *Test:* `cli.test.mjs` exit-code table. *Red without it:* exit 0 on an unknown mode.
- **AD15** Every write records `source` and the command text exactly as typed, so a mode
  change is auditable after the fact; the CLI records `source: 'cli'`.
  *Test:* `cli.test.mjs` — "set records source and the command as typed".
  *Red without it:* default `source` silently; normalise the command text.
- **AD16** `disable` makes the module inert: standing is `disabled`, the effective mode is
  `ready`, nothing is injected, and a stored session is left untouched (re-`enable` restores
  it if its window is still open). Preferences can never acquire a mode through the CLI.
  *Test:* `cli.test.mjs` — disable/enable round trip and the written-keys assertion.
  *Red without it:* honour a stored mode while disabled; write a mode into preferences.

## The injected block and the agent-facing skill (cell 3)

- **AD13b** `context` emits one header line (mode, declared, until, source), the boundaries
  file and ONLY the active mode's policy, within a declared budget of 2048 bytes; `ready`,
  `none` and `disabled` emit nothing at all, and `expired`/`invalid` emit only the notice.
  Over budget, a missing policy text or a blank one is an ERROR — never a truncated or empty
  block that still claims a mode is in force.
  *Test:* `context.test.mjs` (per-mode content with the other three policies' fingerprints
  asserted ABSENT, the cap, the refusals) and `cli-context.test.mjs`, which also asserts that
  the byte table recorded in `README.md` is what the code produces.
  *Red without it:* concatenate all four policies; truncate instead of throwing; keep the
  policy title; emit a header with no policy.
- **AD27** `--root` is global in fact as well as in the usage text: accepted before the
  command, after it, and as `--root=<dir>`.
  *Test:* `cli.test.mjs` — "--root is global", on `parse` and end to end.
  *Red without it:* parse options only after the command (the bug this criterion came from).
- **AD28** `skills/mode/SKILL.md` is a thin, tool-neutral Level 2 procedure: ≤80 lines, all
  twelve aliases listed, and it states that an agent NEVER sets a mode on its own initiative —
  it may say once that one would help, and wait.
  *Test:* `tests/bootstrap.test.mjs` — "the mode skill is a thin, agent-neutral Level 2
  procedure" (conditional on `adaptive/policies/` existing, so deleting the module keeps the
  suite honest rather than vacuous).
  *Red without it:* drop the prohibition, the alias table or the boundaries pointer; let the
  skill tell an agent to run `set`.

## Integration and the Observer (cells 4 and 5)

Those criteria moved to [`ACCEPTANCE-INTEGRATION.md`](ACCEPTANCE-INTEGRATION.md) when cell 4
gave them real tests, and were renumbered there: **AD17..AD18** the Claude Code skills,
**AD19..AD22** the opt-in hooks, **AD23..AD25** the portable path and the measured context
cost, **AD26** the recorded precedence risk, **AD27..AD28** the optional Observer (PROPOSED),
**AD29** core independence. This file is the contract of the module; that one, of its edges.

## Invariants — binding on every cell

- **AD23** No mode changes `INVARIANTS`: no module exports a function that returns a
  modified copy, and the frozen list is identical whichever mode is active.
  *Test [c1]:* `modes.test.mjs` — "INVARIANTS is frozen and mode-independent".
  *Red without it:* add a per-mode override map.
- **AD24** No mode hides a security finding or an approval prompt. The policy text of
  `tired`, `focus` and `explore` each states this explicitly, and no policy file contains
  an instruction to defer, summarise away or suppress one.
  *Test [c1]:* `modes.test.mjs` — the policy-text assertions (each temporary mode's file
  names security findings and approvals as out of reach).
  *Red without it:* remove the sentence from a policy file.
- **AD25** Preferences can never hold a temporary condition — AD7, restated as a
  standing invariant because it is the rule most likely to be eroded by a convenience
  feature.
  *Test [c1]:* `schema.test.mjs`.
  *Red without it:* add `mode` to the preference schema.
- **AD26** Nothing infers the human's state. No code path sets a mode except an explicit
  user command or an explicit CLI `set`; `tools/adaptive/` contains no heuristic over
  timing, typing, error counts or session length.
  *Test [c1, extended c3]:* `modes.test.mjs` grep-level assertion over the module source —
  no `Date.now`-driven mode choice, no `infer`/`detect`/`classify`/`diagnos` symbol
  exported, and `resolveMode` is the only function returning a mode id.
  *Red without it:* add any function that picks a mode from observed behaviour.

## Human-review items (no script covers these)

1. Whether the four policy texts actually help, read by the person who declared the mode.
2. Whether the neutral wording stays neutral in both languages.
3. Whether the transfer of MDAA principles to software engineering is acceptable to the
   author of MDAA — the transfer is **ours** and labelled INFERRED/experimental
   (`docs/10-adaptive.md`).
4. Whether hooks should be enabled in this repository's own settings (c4).
