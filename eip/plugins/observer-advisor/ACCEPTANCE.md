# Acceptance criteria — `observer.advisor` (Stage 3, Cell 3 · the advisor)

Written **before** the code. Each criterion is binary and addressed by a test;
mutation-proved where noted. Labels: VERIFIED (ran it) / INFERRED / PROPOSED / UNKNOWN.

## Scope

The advisor is the only part of the observer that does not measure anything. It assembles a
**bounded** description of the current cell, asks a model adapter for an interpretation, and
treats the answer as **untrusted data**: parsed, validated, grounded in the evidence it was
given, stripped of everything else, and rendered as text. It is disabled by default, it has
**no permission at all** (no filesystem, no network, no process), and nothing it answers is
ever executed, turned into a command, a capability call or an approval.

`Rec = { id, kind, label, statement, evidenceRefs: string[], uncertainty }` with
`kind ∈ next-action | contract-review | verification | split-cell | dependency |
pause-or-handoff | architecture | investigation`, `label ∈ VERIFIED | INFERRED | PROPOSED |
UNKNOWN`, `statement` ≤ 600 plain-text characters, `id` of the form `ADV-<nnn>`.

## Criteria

### Disabled by default, and provably powerless

- **V1** `observer.advisor` is NOT in `OBSERVER_PLUGINS`: a composition built without
  `--advisor <id>` publishes no `observer.advisor` key, and a capability call for it answers
  `NOT_FOUND` (HTTP 404). Mutation-proved on the exact code, not on "it failed".
- **V2** `observer.state` and `observer.audit` are fully functional in that same composition:
  every capability of both still answers with the advisor absent (regression guard).
- **V3** The manifest declares `permissions: []`, `inject: { 'observer.state': required,
  'observer.audit': required }`, and exactly three capabilities — `advise`,
  `recommendations`, `status` — all `consequential: false`. Asked from INSIDE the plugin,
  `ctx.ports` is **empty**: the vault readers the host offers are invisible here, and no
  network, clock or spawn port exists anywhere in the composition.
- **V4** The adapter is supplied by the COMPOSITION, never discovered: `advisorPlugin({ id })`
  resolves the id against a registry the host builds, and an unknown id throws at startup with
  a message naming the only id that exists (`fixture`). `--advisor nope` exits non-zero and
  prints that sentence; nothing is loaded.
- **V5** The registry refuses an adapter whose `describe().network` is `true` unless
  `allowNetwork` is explicitly set, and the plugin itself refuses to be created with one. No
  network adapter ships, and the header of `fixture-adapter.mjs` records why: a `remote`
  adapter is PROPOSED (refused by default, no provider SDK, no endpoint, no token anywhere in
  this repository) and a `local` small-model adapter is PENDING (it needs a weight file, a
  licence review and a decision about where weights live, none of which is in this cell).
- **V6** The session state (call count, accumulated recommendations) is in memory only, and
  `dispose` clears it: afterwards `status` reports `calls.used: 0` and `recommendations`
  answers an empty list.

### The bounded context (pure)

- **V7** `buildContext` includes ONLY the active cell's recorded fields, the cells it
  DECLARES as dependencies, the last N log entries (default 5), the findings of the last audit
  as `id + status + rule + scope`, and the question. Mutation-proved: a log entry older than
  the window, a cell that is neither active nor declared, and a finding's `evidence` array are
  each absent from the context text.
- **V8** Every context item carries a stable evidence id — `cell:<id>`, `log:<n>`,
  `finding:<AUD-…>`, `question` — and `ids` lists exactly those ids.
- **V9** The context never exceeds its byte cap (default 8 KiB, measured with
  `Buffer.byteLength`), truncation is deterministic (same inputs ⇒ same text), and every item
  left out is named in `dropped`. Mutation-proved: a vault with 400 cells and 200 log entries
  still produces a context within the cap, and `dropped` is not empty.

### Output validation — the safety core (pure)

- **V10** Model text is parsed STRICTLY: not a string, over the byte cap, not JSON, not an
  object, or no `recommendations` array ⇒ zero recommendations and a recorded reason, never a
  throw and never a partial guess. `__proto__`, `constructor` and `prototype` keys are dropped
  by the parse itself (mutation-proved: the resulting object's prototype is untouched).
- **V11** Only the declared fields survive: a recommendation is rebuilt from `kind`, `label`,
  `statement`, `evidenceRefs`, `uncertainty` and nothing else, so any extra property a model
  invents (`command`, `approve`, `exec`, `capability`) is absent from the answer.
- **V12** GROUNDING: a `VERIFIED` or `INFERRED` recommendation whose surviving
  `evidenceRefs` contain no id of the supplied context is downgraded to `UNKNOWN` with
  `uncertainty` `unsupported by supplied evidence`. Mutation-proved on the exact label.
- **V13** A reference that is not an id of the supplied context is REMOVED from the
  recommendation and recorded in `meta.validation.refsRemoved`.
- **V14** A statement claiming a result the evidence does not carry — tests passing, a build,
  a typecheck, a file not present in the context — is downgraded to `UNKNOWN` with an
  `uncertainty` saying so. Mutation-proved: the same statement WITH a `finding:` reference to
  the relevant leg is not downgraded.
- **V15** A statement is normalised to plain text: control characters and zero-width
  characters are stripped, newlines collapse to spaces, and the result is capped at 600
  characters. An unknown `kind` rejects the recommendation; a missing `uncertainty` becomes
  `not stated by the model`.
- **V16** NO EXECUTION: an adapter answering with shell commands, the word `approve`, a
  capability key and a path traversal produces ONE thing — text in `statement`. Proved by
  spying: the kernel's `execute` and `approval` events fire for nothing but the test's own
  call, the approver is never consulted, no port is called, and the vault and repository trees
  are byte-identical (SHA-256) before and after.
- **V17** Every answer carries `generatedBy: 'model'` and a disclaimer naming it an
  AI-generated interpretation and not a verification. A recommendation never carries a
  deterministic `status` field, so it cannot be mistaken for a finding.

### Limits

- **V18** `maxCallsPerSession` (default 20) and `minIntervalMs` (default 2000) are enforced:
  exceeding either answers `INPUT_INVALID` (HTTP 400) with `details[0].path` naming the limit,
  and the adapter is NOT called. `status` reports `calls.used`, `calls.remaining` and the
  limits. A call is counted before the adapter runs, so a failing adapter cannot be retried
  without limit.
- **V19** A question longer than 500 characters is `INPUT_INVALID` with `path: 'question'`;
  an unknown `mode` and an extra property are `INPUT_INVALID` at the kernel gate.
- **V20** The adapter receives an `AbortSignal` that fires on the capability's own signal and
  on the advisor's own timeout, AND the call is raced against that deadline: an adapter that
  ignores the signal and never answers still ends as a refusal, not as a hang. (Found by the
  test: honouring the signal is the adapter's to do, so the deadline must be the plugin's to
  enforce.)
- **V21** Nothing is called in the background: no interval, no call the user did not ask for,
  and no timer that survives a call (the deadline timer is unref'd and cleared in a `finally`).
  `silent` mode only ACCUMULATES the results of explicit `advise` calls, and `recommendations`
  answers that accumulation - waiting changes nothing.

### Contract

- **V22** `api/openapi.json` documents the three capabilities in the SDK schema subset, real
  HTTP answers validate against those schemas, no new route is invented, and the label and
  kind vocabularies are CLOSED enums in the document.
- **V23** The UI states `Advisor disabled (optional). Observer and Auditor work without it.`
  when the plugin is absent; when present it shows the adapter name, the AI-generated banner,
  one label badge per recommendation, its evidence refs, its uncertainty — and it renders
  every statement with `textContent`, never `innerHTML`.
