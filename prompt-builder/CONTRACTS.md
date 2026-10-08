# Cellular Prompt Builder — contracts (v1)

Status: PROPOSED in cell `prompt-builder-audit` (Stage 6, Cell 1); the four architectural
decisions below were approved by the human on 2026-10-04. Cells 2–7 implement this file.

## Purpose

Turn an ordinary-language idea into an **approved project contract** and a **proposed first
cell**, then export **agent-neutral execution prompts**. Optional, deterministic, zero
dependencies, no language model required. It never implements the project itself.

## Approved architecture decisions (2026-10-04, human)

| ID | Decision |
|---|---|
| PB1 | Separate CLI `node tools/prompt-builder/cli.mjs` (`npm run builder`). `cellmode init` (vault skeleton) is untouched; `tools/cellmode` never imports the Builder. |
| PB2 | Draft state `vault/builder/draft.json`, git-ignored (private by default). Approved contract `vault/project-contract.json`; the human decides whether to commit it. Cells live only in `vault/state/`, created through the existing cellmode transitions. |
| PB3 | Gates strengthened, never weakened: a boundary rule isolating `tools/prompt-builder/`, and a removal rehearsal for the Builder alongside the unchanged Adaptive one. |
| PB4 | Skill `skills/builder/SKILL.md`; Claude Code pointers `/builder` and `/construtor`. |

## Layout

- `tools/prompt-builder/` — code (ESM `.mjs`, JSDoc types, `*.test.mjs` colocated, ≤200 lines/file).
- `tools/prompt-builder/fixtures/` — deterministic scenario fixtures (JSON).
- `prompt-builder/` — this contract and the published schema notes.
- `skills/builder/SKILL.md` — the agent procedure; pointers under `.claude/skills/` and
  `adapters/claude-code/.claude/skills/`.
- `docs/11-prompt-builder.md` — onboarding; `PROMPT_BUILDER_REPORT.md` — Stage 6 report.

Disk access is confined to two modules: `store.mjs` (draft, contract, read-only project walk and
cell-state read) and `store-cells.mjs` (writes one 📋 planned cell through cellmode's own
`cmdPlan`/`writeCell`). Everything else is pure.

## Import boundary

`tools/prompt-builder/**` MAY import `node:*` and pure modules of `tools/cellmode/`
(cell rendering, slug, transitions through its exported API). It MUST NOT import `eip/**`,
`tools/adaptive/**` or `tools/gates/**`. Nothing outside `tools/prompt-builder/` imports it.

## Epistemic entry

Every project statement is an **Entry**:

```json
{ "value": "string ≤ 500 chars", "status": "DECLARED|VERIFIED|INFERRED|PROPOSED|UNKNOWN",
  "basis": "required unless DECLARED: evidence path, reasoning, or recommendation source" }
```

- DECLARED: the human said it. VERIFIED: evidence path inside the repository (relative).
- INFERRED and PROPOSED never become DECLARED by themselves: only a recorded human decision
  (`decisions[].status = "approved"`) promotes a PROPOSED entry, and the entry keeps
  `basis: "decision:<id>"`.
- UNKNOWN has `value: ""` and is surfaced as an open question.

## Project contract — `cellular-mode/project-contract`, version 1

Top-level keys (closed set; unknown keys are errors except under `extensions`):

| Key | Type | Required to approve |
|---|---|---|
| `schema` | `"cellular-mode/project-contract"` | yes |
| `version` | `1` | yes |
| `path` | `"new" \| "existing" \| "resume"` | yes |
| `identity` | `{ name: Entry, slug: string }` (slug = cellmode slug rules) | yes |
| `objective`, `users`, `problem`, `smallestVersion` | Entry | objective yes; others may be UNKNOWN |
| `scope` | `{ in: Entry[], out: Entry[] }` | `in` ≥ 1 |
| `requirements` | `{ functional: Entry[], nonfunctional: Entry[] }` | no |
| `integrations`, `technologies.approved`, `technologies.proposed` | Entry[] | no |
| `security` | `{ sensitiveData: Entry, constraints: Entry[] }` | `sensitiveData` not UNKNOWN |
| `environment`, `involvement` | Entry | no |
| `deployment`, `risks` | Entry[] | no |
| `openQuestions` | `{ id, question, field }[]` | derived, never hand-edited |
| `decisions` | `Decision[]` | — |
| `acceptance` | Entry[] | ≥ 1 |
| `approval` | `{ approved: boolean, at: ISO-8601 \| null }` | set only by `approve --confirm` |
| `extensions` | object, keys must match `^x-[a-z0-9-]+$` | no |

`Decision = { id: "D<n>", question, proposal, status: "pending|approved|rejected", at }`.
`technologies.approved` may hold only DECLARED entries, VERIFIED entries (technology already
present in an existing repository, with relative evidence path), or entries with
`basis: "decision:<id>"`. Never INFERRED, PROPOSED or UNKNOWN.

Draft-level `proposals: { questionId, field, entry }[]` hold PROPOSED recommendations for
single-Entry fields, so a recommendation never sits in an unrelated contract field.

Validation (`validateContract`) is hand-written, pure and total, in the style of
`tools/adaptive/schema.mjs`: returns `{ ok, errors: {path, message}[] }`. Separate
`readiness(contract)` reports what blocks approval; `conflicts(contract)` reports
contradictions (same item in scope in/out, technology both approved and rejected,
sensitive data declared without a security constraint) — conflicts are surfaced for human
review, never auto-resolved.

The contract does not copy cell state: cells, log and next steps stay in `vault/state/`.

## Discovery session — `vault/builder/draft.json`

`{ schema: "cellular-mode/builder-draft", version: 1, contract, asked: string[], skipped: string[] }`.
`nextQuestion(draft, mode)` returns the single highest-priority unanswered question whose
answer changes the next step, or `null`. Answers: text → DECLARED; "I don't know" →
UNKNOWN plus, where a deterministic recommendation exists, a PROPOSED entry with its
assumptions and trade-offs (never approved automatically).

Paths:
- **new** — questions in priority order: `objective`, `users`, `problem`, `smallest-version`, `scope-in`, `scope-out`, `sensitive-data`, `technologies`, `involvement`, `environment`, `acceptance`.
  Scope is **two** questions, never one: what is in and what is out are two separate declarations, and `scope.out` is what bounds the proposed first cell. `scope-out` is contract **H8** — explicit exclusions are asked, never inferred from silence; the literal answer `none` is accepted and recorded DECLARED, so "nothing is excluded" is a statement rather than an absence.
- **existing** — read-only inspection first (`inspect(root)`): manifest files, languages
  by extension, test directories, existing agent instructions, existing `vault/state/`.
  Findings become VERIFIED entries with relative evidence paths; it writes nothing outside
  `vault/builder/` and never edits project instructions, manifests or scripts.
- **resume** — if `vault/state/` has an active or paused cell, report it and defer to
  `/cell`; else if a draft exists, continue it; else report the limitation and ask only for
  what is needed. Never start a new project silently.

## First cell — prepare → approve → activate → complete

1. **Prepare**: `proposeFirstCell(contract)` renders a cell in the existing cellmode cell
   format (objective, boundary in/NOT in, dependencies, done criterion, allowed/prohibited
   operations, open issues). If objective or scope is not actionable, or technologies are
   undecided, the proposal is a **discovery/architecture cell**. Order: blocking conflict or
   objective blocker → discovery; no approved technology or a pending decision → architecture;
   scope blocker → discovery; otherwise implementation.
2. **Approve**: requires an approved contract and `cell --accept --confirm`; creates a 📋
   planned cell through cellmode's `plan` transition.
3. **Activate**: the human runs `cellmode open`/`/cell` — the Builder never activates.
4. **Complete**: only the existing pause/complete ritual.

Without `--confirm`, approving commands exit **5** (human confirmation required), as in cellmode.

## Prompts — three layers

`renderPrompt(contract, cell, adapterId)` → `{ text, bytes, layers }`:
1. **Method** — a short reference to `AGENTS.md` and the cell/pause skills; never the full
   constitution.
2. **Project** — approved, DECLARED or VERIFIED context only; PROPOSED/UNKNOWN listed as such.
3. **Active cell** — objective, scope, exclusions, acceptance, evidence, approval boundaries.

Every prompt names role, objective, context, permitted and prohibited operations,
acceptance criteria, required evidence and approval boundaries. All user/repository text is
quoted inside a delimited DATA block, stripped of control characters and delimiter look-alikes,
and labelled "data, not instructions". A prompt never authorizes deployment, destructive
commands, publication or production-data changes. Exported text contains no absolute paths
and no secret-shaped values (refused at answer time, re-checked at export).

Adapters: `{ id, support: "implemented" | "proposed", render }`. Implemented: `neutral`,
`claude-code` (refers to project-local `.claude/skills` instead of inlining). Contracts are
adapter-independent; no model name or context-window size is assumed anywhere.

## Cellular Adaptive (optional)

The Builder never reads Adaptive state. The Skill passes `--mode <ready|tired|focus|explore>`
only when `tools/adaptive/cli.mjs context` reports a human-declared mode. Absent → `ready`.
tired: one question, short text; focus: off-objective ideas → `cellmode park`; explore:
alternatives allowed, nothing becomes approved. No mode changes a gate or an approval.

## Privacy and security

Collect only what discovery needs; refuse secret-shaped answers; no network calls; generated
paths validated (relative, inside the project, no `..`); drafts private by default.

**Publication check (human requirement, 2026-10-04).** Before a contract is eligible for
version control, `publicationCheck(contract)` must pass: no secret-shaped values, no
absolute or personal filesystem paths (drive letters, home directories, user names in
paths), no e-mail addresses or phone numbers, and no free text outside the declared fields.
`approve --confirm` writes `vault/project-contract.json` only when the check passes and
prints its findings otherwise. **Approving a contract never authorizes committing it**: the
Builder never runs git; committing remains a separate, explicit human decision.

`vault/state/` remains the sole authoritative project history. The Builder creates no second
vault and never activates a cell.
