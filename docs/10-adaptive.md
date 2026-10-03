# 10 · Cellular Adaptive — declared modes, invariant floor

**Status: OPTIONAL and EXPERIMENTAL.** Cellular Mode works unchanged without it. Delete
`tools/adaptive/` and `adaptive/` and the method, the CLI, the gates, the runtime and the
Observer behave exactly as before — that is a gate, not a hope
(`tests/gates-adaptive-boundary.test.mjs`).

## What it is

A way for the human to say **how they want to work right now**, and for the agent to adjust
the *form* of the collaboration accordingly: how much is said, how many decisions arrive at
once, how large a step is, what is shown first.

Two sentences decide everything else about the design:

1. **A mode exists because the human declared it.** There is no detection, no scoring and
   no profile of a person. The only way a mode is set is an explicit command typed by the
   human (or an explicit `set` from their own terminal).
2. **A mode is a statement about form, never about requirements.** It cannot weaken a
   gate, hide a finding, skip an approval or widen a permission.

Modes are **operational preferences**, not a classification of anyone. In particular
`tired` says "less load per exchange", and never anything about competence.

## The four modes

| Mode | Commands | Temporary | In one line |
|---|---|---|---|
| `ready` | `/ready`, `/modoestoubem`, `estoubem` | no — it is the default | Normal working: default detail, relevant alternatives, broader planning. |
| `tired` | `/tired`, `/modocansado`, `cansado` | yes | Concise answers, one decision at a time, small steps, active cell only, fewer interruptions. |
| `focus` | `/focus`, `/modofoco`, `foco` | yes | Active cell only; unrelated ideas go to the parking lot; only essential blockers are raised. |
| `explore` | `/explore`, `/modoexplorar`, `explorar` | yes | Hypotheses and alternatives, labelled; ideas recorded; exploration is not implementation. |

Each mode has a short policy file read **on demand** — `adaptive/policies/<mode>.md`, at
most 25 lines — and only the **active** one is ever loaded, always together with
`adaptive/policies/boundaries.md`. `ready` is the absence of a declaration: declaring it
stores nothing.

## Adaptation boundaries

The split is data, in `tools/adaptive/modes.mjs`, so it can be tested instead of trusted.

**ADAPTABLE** (`ADAPTABLE`) — presentation and granularity only: communication detail,
decision presentation, task granularity, scope breadth of suggestions, notification volume,
exploration versus execution, and the *order* in which items are shown. Nothing on that
list changes **which** items exist.

**INVARIANT** (`INVARIANTS`) — the quality gates and their real counts; security findings,
always reported in full and immediately; approval for batch, destructive and
protected-resource operations; acceptance criteria and tests first, proved red; evidence and
the epistemic labels; least privilege; cell integrity and the append-only log; honest
reporting of failure and uncertainty; and the rule that a declaration is not an
authorization.

No mode has an override list, a per-mode exception map or a way to edit `INVARIANTS`. A
mode that needed one would not be a mode.

## Where the state lives

`.cellular/adaptive/` — already git-ignored, deliberately **outside `vault/`** so a
temporary preference never mixes with the authoritative cell log. `session.json` holds the
current declaration and its validity window; the optional `preferences.json` holds settings
and **can never hold a mode** (`FORBIDDEN_PREFERENCE_KEYS` in `tools/adaptive/schema.mjs`).
Both files are read tolerantly and written atomically, and a file that cannot be read as a
declaration is reported rather than repaired, deleted or treated as an absence. The commands
that manage them, the retention rules and the five standings are documented in
[`tools/adaptive/README.md`](../tools/adaptive/README.md).

## The Observer, optionally (Stage 4, cell 5)

**Status: OPT-IN, and provably inert when off (VERIFIED).** The dashboard
([`apps/observer`](../apps/observer/README.md)) can show a mode **the human declared**, and
nothing about that is on by default.

- **How it is wired.** `node apps/observer/cli.mjs --root . --adaptive` loads one read-only
  plugin, `adaptive.preferences` (`eip/plugins/adaptive-preferences/`), whose single capability
  `current` answers exactly the `EffectiveMode` shape the CLI reports — same five standings,
  same words, from the same pure module. Without the flag the key does not exist, a call answers
  `404 NOT_FOUND`, and the `observer.*` answers are **byte-identical** (AD31).
- **How it reads the state.** Through a host port confined to `<root>/.cellular/adaptive/` and
  to **two file names**; everything else is refused, including the hook's own `injected.json`.
  There is no write port in the composition at all, and the port is **created only** when that
  plugin is loaded: the privilege nobody needs is never built.
- **The one import exception**, named in `tools/gates/allowlists.mjs` as
  `ADAPTIVE_PURE_IMPORTS`: an `eip/plugins/adaptive-*` plugin may import the four PURE modules
  `modes`, `schema`, `types`, `validity` — and nothing else. `io.mjs` and the CLI stay
  forbidden, and **every `observer-*` plugin is still refused `tools/adaptive` entirely** (AD30),
  so deleting the module leaves the Observer whole.
- **What it changes on the page: presentation only.** `tired` puts verdicts (`FAIL`, `WARNING`)
  and security findings first and in full, and defers the tail of what is merely informative
  behind a `show all` control;
  `focus` orders the active cell's items first and narrows the timeline to it by default;
  `explore` opens the advisor's alternatives; `ready` is the previous behaviour exactly, as is
  any answer the page cannot read.
- **What it can never change (AD28, VERIFIED by test).** Every `FAIL` and every finding of a
  named security rule (`secrets`, `deps`, `import-boundaries`) is rendered **in full** under
  **every** mode — proved for all four modes over a mixed list and over a 500-finding list, in
  its own test file. An **expired** or **unreadable** declaration shows the reason instead of a
  mode, because something changed with nobody doing anything.
- **No selector — future work (PROPOSED, not built).** The badge is read-only and the capability
  has no setter: a mode is declared by the human at their own terminal or with their own command,
  never by a dashboard. Writing one from the Observer would need a consequential capability, a
  write port and an approval path, and is deliberately left unbuilt.

Criteria: `eip/plugins/adaptive-preferences/ACCEPTANCE.md` (P1–P8, Q1–Q5) ·
`apps/observer/ACCEPTANCE.md` D24 · `tools/adaptive/ACCEPTANCE-INTEGRATION.md` AD27–AD31.

## Relationship to MDAA

The design is **inspired by** the author's MDAA research programme (Modelo Dinâmico de
Acessibilidade à Aprendizagem). The table below is a transfer map, not a claim of
validation.

Two facts frame everything in it, and they come from the MDAA material itself:

- **Programme status:** 6 of 8 planned layers have a written artefact; two (Value,
  Collective) do not exist. Several papers state in their own cover notes that no empirical
  results are claimed, and one declares its bench written but not run.
- **Domain:** every stated domain is education and learning. **No MDAA source authorises
  the transfer to software engineering or developer interaction, and none discusses it.**
  The transfer below is therefore **OURS**, labelled **INFERRED** and **experimental**.

| Principle | MDAA source | How it is applied here | Status |
|---|---|---|---|
| A declared condition **scopes** a claim; it is not a trait of the person | Paper 1 §2.3; Paper 2 §1 | A mode scopes how this session is conducted; it never becomes a property of the human | MDAA: VERIFIED in source · transfer: OURS, INFERRED, experimental |
| **Declared ≠ observed ≠ inferred** are different epistemic objects | Paper 1 §5.1; the interpretation contract | Only an explicit human command sets a mode. `tools/adaptive/` contains no code path that picks one from behaviour (AD26) | MDAA: VERIFIED · our implementation of the rule: VERIFIED by test · transfer: OURS, INFERRED |
| The **meaning of a declared condition belongs to the person** | Working document §5; Paper 5 §5 | The system never interprets what `tired` means for anyone. It loads a text about form, nothing else | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Standing / validity is declared, frozen before use, and displayed** — never estimated | Paper 5 §4, §6 | One declared TTL (default 4 h, bounds 0.5–12), evaluated on read, shown with the mode; expiry returns to `ready` with a notice | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **The system offers; the person decides.** Silence does not confirm | Working document §2–§3; Paper 4 §5.1 | No agent sets a mode. Nothing is assumed from the absence of a declaration: absence *is* `ready` | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Declaration ≠ authorization** (state estimate ≠ evidence ≠ warrant ≠ action) | Paper 4 abstract, §1, §5.1 | The `INVARIANTS` list: a mode grants nothing. Approvals, gates and security reporting are untouched | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Provenance is stamped by whoever writes**, not claimed by whoever reports | Working document §9; Paper 6 §4 | `session.json` records `source` (`cli`, `claude-hook`, `skill`) and the command text verbatim, so a mode change is auditable | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **The normal state of an adaptive layer is not to adjust — and to say so** | Paper 6 architecture note §2 | `ready` is the default, stores nothing and injects nothing. Doing nothing is the common case, stated rather than silent | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Map, not label**: an observation must not be generalised into an identity | Theory note §14; Paper 1 §8; Paper 2 | No profile, no classification, no history file by default, nothing retained after a mode ends | MDAA: VERIFIED · transfer: OURS, INFERRED |

**What is NOT claimed.** No MDAA formalism is implemented here: there is no state vector,
no four-valued standing calculus, no replication threshold, no policy-adjustment layer.
Nothing from the MDAA simulation bench is copied, imported or relicensed. The debt is
conceptual, and the principles above are paraphrased with citation.

## Deterministic versus model-dependent (final)

**Deterministic**, and therefore tested: resolving a command to a mode; validating and writing
the state files; evaluating expiry on read; which policy files are read and the exact bytes of
the assembled block; a mode set from a prompt **only** when the trimmed prompt is exactly one of
the twelve slash commands; `source` recorded on every write; the boundary gate; and the
Observer's read-only rendering, including the invariant that no mode hides a `FAIL` or a
security finding. In Claude Code, additionally: the eight mode skills carry
`disable-model-invocation: true`, so the model cannot invoke them — which is why a skill-sourced
declaration is the human's by construction, and why the module works with no hooks at all.

**Model-dependent**, and therefore *not* enforceable by this repository: whether an agent
actually behaves the way the active policy text describes, and whether an agent refrains from
running `set` on its own initiative. Two mitigations, both honest about their limit: the Claude
Code skills cannot be model-invoked, and every write records its `source`, so a declaration
nobody made is visible afterwards. **That is auditability, not prevention.**

Whether a real model's behaviour changes per mode is therefore **UNKNOWN**, and it is checked by
a human procedure, not a test: [`tools/adaptive/MANUAL-VALIDATION.md`](../tools/adaptive/MANUAL-VALIDATION.md)
— **NOT YET PERFORMED**. The per-agent split is in
[`docs/08-agent-integration.md`](08-agent-integration.md); the integration criteria are in
`tools/adaptive/ACCEPTANCE-INTEGRATION.md`.

## Privacy stance

- **No diagnosis, no classification, no inference.** Not of a condition, not of a mood, not
  of fatigue. The method has never needed them (`docs/07-adaptation.md`) and this module
  does not change that.
- **Nothing about a person is stored.** A session file holds a mode the human typed and a
  window; returning to `ready` deletes it; `clear` removes everything, with no backup,
  because it is the human's data.
- **No history by default.** There is no log of past declarations to aggregate.
- **Nothing leaves the machine.** No network, no telemetry, no external URL; the state
  directory is git-ignored, so a declaration cannot be committed by accident.
- **Reading is free, mutation is not.** Any future reader (the Observer) gets a
  path-confined read port and no write port at all.

Decision record: [ADR 0004](adr/0004-cellular-adaptive.md) ·
criteria: `tools/adaptive/ACCEPTANCE.md` · policy texts: `adaptive/policies/`.
