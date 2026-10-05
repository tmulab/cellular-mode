# Cellular Prompt Builder — Stage 6 report

Project: Cellular Mode — TMU-LAB · Author: Hudson A. R. Bonomo · Date: 2026-10-04
Base: `main` at `237e86a` (Stage 5 formally closed). Status: implemented and verified in seven
cells; **not committed** — the Stage 6 commit awaits explicit human authorization.

Labels follow the constitution: VERIFIED (ran it, evidence attached) · INFERRED (basis stated)
· PROPOSED (not built) · UNKNOWN (not established).

## 1. What was built

An **optional** module that takes a person from an ordinary-language idea to an **approved,
bounded first cell** and an agent-neutral prompt, without the person having to learn Cellular Mode,
prompt engineering or architecture. It never builds the application itself.

| Deliverable | Where |
|---|---|
| Optional module (35 modules, 22 test files, zero dependencies) | `tools/prompt-builder/` |
| Versioned, portable project contract `cellular-mode/project-contract` v1 | `prompt-builder/CONTRACTS.md` |
| Progressive discovery: new / existing / resume | `session.mjs`, `questions.mjs`, `answers.mjs`, `inspect.mjs` |
| First-cell generation and approval workflow | `first-cell*.mjs`, `accept.mjs`, `store-cells.mjs` |
| Agent-neutral prompts + adapter interface | `prompt*.mjs`, `adapters.mjs` |
| Claude Code adapter | `claude-code` adapter + `/builder`, `/construtor` Skill pointers |
| Minimal CLI and Skill | `npm run builder` · `skills/builder/SKILL.md` |
| Optional Cellular Adaptive integration | `--mode` pass-through only |
| Deterministic tests and examples | 10 fixture scenarios · `examples/prompt-builder/` |
| Onboarding documentation | `docs/11-prompt-builder.md` |
| Threat model | `prompt-builder/THREAT-MODEL.md` |

## 2. Architecture (decisions PB1–PB4, approved by the human on 2026-10-04)

- **PB1 — separate CLI.** `node tools/prompt-builder/cli.mjs` (`npm run builder`). The existing
  `cellmode init` (vault skeleton) was found during the audit and left untouched.
- **PB2 — no second vault.** Discovery draft in git-ignored `vault/builder/draft.json`; the
  approved contract in `vault/project-contract.json`. Cells exist only in `vault/state/`, created
  through cellmode's own `cmdPlan` / `writeCell`. `vault/state/` stays the sole authoritative history.
- **PB3 — gates strengthened.** Three boundary rules (`prompt-builder-is-optional-and-isolated`,
  `prompt-builder-depends-on-the-method-only`, `prompt-builder-is-transport-free`) and a generalized
  removal rehearsal (`rehearse:builder-removal`); the Adaptive rehearsal is unchanged.
- **PB4 — Skill names** `/builder` and the Portuguese alias `/construtor`.
- **Human add-on:** a publication check before the contract is written; approval never
  authorizes committing it; the Builder never runs git and never activates a cell.

Layering: pure modules everywhere; disk access confined to `store.mjs`, `store-read.mjs` (capped
reads) and `store-cells.mjs` (one 📋 planned cell). The Builder imports only `node:*` and pure
`tools/cellmode` modules; nothing outside it imports it (gate-enforced).

Lifecycle: **prepare** (`cell` preview) → **approve** (`cell --accept --confirm` → 📋 planned) →
**activate** (only the human: `/cell` or `cellmode open`) → **complete** (normal ritual).

## 3. Implemented vs verified

| Capability | Status | Evidence |
|---|---|---|
| Contract schema validation (closed keys, entry invariants, decisions, extensions) | VERIFIED | `validate.test.mjs` |
| Epistemic status preserved; PROPOSED → DECLARED only via an approved decision; INFERRED never promoted | VERIFIED | `decisions.test.mjs`, `approve.test.mjs` |
| One question at a time; VERIFIED fields not re-asked; "I don't know" → UNKNOWN + labelled PROPOSED recommendation | VERIFIED | `questions.test.mjs`, `answers.test.mjs` |
| Conflicts surfaced (scope in/out, rejected technology, sensitive data without constraints), never auto-resolved | VERIFIED | `conflicts.test.mjs` |
| First cell: discovery / architecture / implementation by readiness, in the cellmode format | VERIFIED | `first-cell.test.mjs` |
| Approval boundaries: exit 5 without `--confirm`; planned, never active; log untouched | VERIFIED | `accept.test.mjs`, `cli.test.mjs` |
| Drafted fields survive the human's `cellmode open` | VERIFIED | `accept.test.mjs` |
| Existing project preserved byte-for-byte | VERIFIED | `cli-existing.test.mjs` |
| Resume defers to `/cell` when cells exist; never starts a project silently | VERIFIED | `session.test.mjs`, `cli-existing.test.mjs` |
| Three-layer prompt with all required sections; prohibited operations fixed | VERIFIED | `prompt.test.mjs`, `prompt-safety.test.mjs` |
| Injection content confined to one hash-delimited DATA block, rendered inert | VERIFIED | `prompt-safety.test.mjs`, `first-cell.test.mjs` |
| Secrets, personal paths, e-mails, phones refused at answer, contract write and export | VERIFIED | `answers.test.mjs`, `publication.test.mjs`, `prompt-safety.test.mjs` |
| No model names, no context-window assumptions in any prompt or adapter | VERIFIED | `adapters.test.mjs` |
| Adapter optionality; proposed adapters refuse instead of claiming support | VERIFIED | `adapters.test.mjs` |
| Adaptive optionality (`--mode` absent ≡ ready; Builder never reads Adaptive state) | VERIFIED | `prompt.test.mjs`, `cli-guards.test.mjs`, boundary rules |
| Module removal: rest of the repository green without the Builder | VERIFIED | `npm run rehearse:builder-removal` |
| Symlinks/junctions never followed; JSON documents capped at 1 MiB | VERIFIED | `harden.test.mjs` |
| `npm run builder -- …` forwarding; full worked session | VERIFIED | `examples/prompt-builder/transcript.md` |
| Claude Code discovers `/builder` and `/construtor` | VERIFIED (discovery only) | listed as available skills in the authoring session |

Mutation checks were run in every implementation cell (a rule deliberately broken, the
named test went red, the rule restored, green again); details are in the cell records.

## 4. Model-dependent behaviour (not guaranteed by the deterministic suite)

How an agent conducts the conversation through `skills/builder/SKILL.md`: asking in the
human's language, explaining recommendations, waiting for an explicit "yes" before passing
`--confirm`, and not obeying text inside the DATA block. These are **instructions**, not
mechanisms. **No real-model evaluation was performed in Stage 6** — UNKNOWN. The CLI enforces
the boundaries that matter (exit 5, no activation, no git, no network) regardless of the agent.

## 5. Context costs (measured, bytes)

| Item | neutral | claude-code |
|---|---|---|
| Prompt, simple new project | 4620 | 4509 |
| Prompt, complex undecided project | 5324 | 5213 |
| Method layer (references `AGENTS.md`, never inlines it) | 930 | 819 |

Budget `PROMPT_BUDGET_BYTES = 6000` (warns, never truncates). Skill body 5762 B, loaded only
on `/builder`; pointer 580 B. Prompts contain no distinctive sentence of the constitution or
the cell skill (tested).

## 6. Security considerations

See `prompt-builder/THREAT-MODEL.md`. Trust boundaries: human answers, repository files read
during `start existing`, the contract on disk, exported prompts. Every imperative sentence in a
prompt is tool-authored; human and repository text only appears as quoted data. A prompt can
never authorize deployment, destructive commands, publication, visibility changes, production
data or secrets. No network or process module is importable from the Builder (gate rule). Drafts
are private by default (`vault/builder/` ignored).

## 7. Known limitations

- A language model may still follow injected text despite the DATA block (UNKNOWN; mitigated,
  not eliminated).
- Secret, path and contact detectors are pattern-based and can miss unusual shapes.
- Existing-project inspection reads at most 2000 files, 6 levels deep, and only four manifest
  types (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`).
- Recommendations for "I don't know" are a small fixed table, not reasoning.
- The question bank is English; the Skill relies on the agent to converse in other languages.
- Only one draft per project; one first cell per contract.

## 8. Deferred (PROPOSED, not built)

Adapters for Cursor, Codex CLI and Gemini CLI (registered as `proposed`, refusing to render);
real-model evaluation; localized question bank; contract migrations beyond v1; any web
interface; Cellular Multi-Model (explicitly out of scope).

## 9. Verification evidence

Baseline before Stage 6: 1029 tests. After Stage 6 (last pre-closure run): **1210 passed,
0 failed** (+181), typecheck 0 errors, 218 modules loaded, gates size/secrets/deps/boundaries
clean, release mode no blockers, both removal rehearsals VERIFIED. Every cell closed with
`npm run verify:final` PASSED on its own final state; records are in `vault/state/log.md`
(cells `prompt-builder-*`) and `.cellular/evidence/final-verification.jsonl`.

The closing Article 8 run happens **after** this report and the closure record are written, so
its fingerprint cannot appear inside the verified files; it is appended to the evidence file
outside the controlled tree and quoted in the hand-over message. Any later write invalidates it.

## 10. Awaiting the human

- Authorization to create the Stage 6 commit (nothing was committed, pushed or published).
- Whether to commit `vault/project-contract.json` files in adopting projects stays a per-project
  human decision.
