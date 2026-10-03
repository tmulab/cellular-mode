# Acceptance criteria — `adaptive.preferences` (Stage 4, cell 5)

Written before the implementation, as the constitution requires. Each criterion is binary and
names the test that proves it and the mutation that turns that test red. Labels: VERIFIED (ran
it, evidence attached) / INFERRED / PROPOSED / UNKNOWN.

Scope: the plugin, its host port and its place in a composition. What the Observer *does* with
the answer is `apps/observer/ACCEPTANCE.md` D24; the module's own contract is
`tools/adaptive/ACCEPTANCE.md`; the integration criteria AD27–AD31 are
`tools/adaptive/ACCEPTANCE-INTEGRATION.md`.

## The plugin

| # | Criterion | Mechanism |
|---|---|---|
| P1 | It declares what it provides and nothing more | one permission (`fs.read`), one capability (`current`), `consequential: false`, **no `inject`** — it depends on no sibling and no sibling depends on it; no dev UI |
| P2 | It sees only the port it declared | asked from INSIDE the plugin: `readAdaptive` is present, and a `writeFile` port the host also offered is **invisible** (not refused — absent) |
| P3 | It cannot exist half-wired | loading without `readAdaptive` throws, naming the port; a factory given something that is not a clock throws `TypeError` |
| P4 | It never writes, and never infers | the module imports no `node:fs`, no `node:child_process`, no socket and no write primitive; the only mode-valued expression comes from `effectiveMode`, which reads the declaration; the code never names a mode as a literal; the clock is a parameter, never `Date.now()` inside a decision |
| P5 | The five standings are distinguishable, and the answer is the same shape every time | `active` reports the declared mode with its window and `source`; `expired` reports `ready` + a one-line notice and does **not** honour the mode; `invalid` reports `ready` + a notice and is never rendered as `none`; `none` reports `ready` with `notice: null`; `disabled` reports `enabled: false`. Window is HALF-OPEN. Every answer validates against the documented schema |
| P6 | An unusable preference file is reported instead of a mode | an unparsable or invalid `preferences.json` answers `invalid` with the reason, rather than ignoring the setting and honouring the declaration; a `mode`/`condition` key in it is rejected by name |
| P7 | It publishes no path and no private field | the HTTP payload carries no filesystem path and no `command` (the text the human typed stays in their own file); the schema is `additionalProperties: false` |
| P8 | Reading leaves no trace | two calls do not touch `session.json`; `dispose` is clean |

*Tests:* `eip/plugins/adaptive-preferences-contract.test.mjs` (P1–P4, P7),
`eip/plugins/adaptive-preferences.test.mjs` (P5, P6, P8),
`eip/plugins/adaptive-preferences-http.test.mjs` (P7 over real HTTP, and the contract document).

## The port

| # | Criterion | Mechanism |
|---|---|---|
| Q1 | Two names, and the list IS the validation | `session.json` and `preferences.json` read; **everything else is refused by name**, including `injected.json` — the hook's own cache, which exists on disk in the fixture so the refusal is a real claim |
| Q2 | Confinement is a property of the filesystem | the same single `confinedTarget` helper as the vault and write ports: traversal, absolute and drive-letter forms, NUL bytes, non-string names and a symbolic link in the directory are all refused; the vault and the repository are out of reach |
| Q3 | Absence is a VALUE, and it is the common case | a checkout with no `.cellular/` answers `null`, not an error: a human who never declared a mode is not a fault |
| Q4 | There is no writer, anywhere | the module imports no write primitive (asserted by reading its own source), and the port map has exactly one entry |
| Q5 | The privilege is never built when nobody needs it | `observerComposition` creates this port **only** when a loaded plugin is named `adaptive.preferences` |

*Tests:* `eip/host/adaptive-read-port.test.mjs` (Q1–Q4),
`eip/plugins/adaptive-preferences-http.test.mjs` (Q5).

## Mutations that must turn a specific criterion red

| Mutation | Must fail |
|---|---|
| `ADAPTIVE_FILES` grows `injected.json` | Q1 |
| `assertAdaptiveName` matches a pattern instead of the closed list | Q1 |
| the port creates a `writeAdaptive` counterpart | Q4 |
| `observerComposition` creates the adaptive port unconditionally | Q5 |
| `current` caches the answer between calls | P5 (expiry) |
| `effectiveMode` is called with `null` for the read error, so an unparsable file reads as `none` | P5 |
| an unusable `preferences.json` is ignored and the declaration honoured anyway | P6 |
| `command` is added to the output schema | P7 |
| `tools/adaptive/io.mjs` is added to `ADAPTIVE_PURE_IMPORTS` | AD30 (boundary gate) |

## Human review (declared, not hidden)

1. Whether the badge is legible and quiet enough beside a real project's header —
   `apps/observer/MANUAL-CHECKS.md`, **NOT YET PERFORMED** for this badge.
2. Whether `tired` capping the informative tail at three is the right amount for a real
   session. The limit is one constant (`PRESENTATION_LIMIT`) and the control that lifts it is
   always present, so changing it is a one-line decision — **UNKNOWN** until used.
