# Integration report — the TMU-LAB Engineering Method

How the TMU-LAB Engineering Method (private source, `metodo_tmulab`, a single
1,352-line instruction file) became the engineering layer of this repository: a
constitution, a short map, seven on-demand skills, one long reference and four templates.

Nothing was copied. The base layer was **restated**; the author's own extensions were
**rendered faithfully into English**, generalized and de-personalized. See *Attribution*.

## Attribution

- **Base layer — Fábio Akita.** The ideas in the original's Rules 0, the test-first core
  of Rule 1, the core of Rule 3, Rules 5, 6, the "AI jail" half of Rule 7, Rule 8, and the
  "from zero to deploy in seven days / Day N" framing are his. They are **restated here in
  our own words and our own structure**; no sentence of his text is reproduced, and no
  endorsement is implied. Credited in `THIRD_PARTY_NOTICES.md`.
- **Extensions — Hudson A. R. Bonomo.** Everything the original tags as an extension
  (v2 through v5.2.7) or as refined in v5 is his: Trilateral Verification, the epistemic
  spec, the security-hardening pass, the structural-sanity and reality rungs, the settled
  decisions discipline, the repository-to-repository port protocol, the data tiers, design
  as contract, human-agent communication, the verification question, and the nine forms of
  false green. He authorized their release under Apache-2.0 on **2026-10-02**, which is
  what permits the faithful English rendering used here.
- **Observation about the original source.** Its front matter declares version `5.1.0`
  while its body runs through `v5.2.7` and its own evolution table lists v5.2.1–v5.2.7.
  The inconsistency is recorded here as an observation about the source, not corrected:
  this repository does not version the original.

## What was preserved

- **Trilateral Verification** — name, semantics, the three-line report with real counts,
  pre-existing failures documented and never absorbed, and the full strict type-checking
  flag list. It is both a constitutional article and a skill section.
- **The verification question** and its five parts, including *prove it is red without the
  fix*.
- **A revert that passes is a FINDING, not relief** — all nine forms of false green, each
  with its distinction from the others and its detection heuristic, plus the two rules for
  writing a source guard. This is the single largest preserved block.
- **The two gate-reach checks** (does the type check reach the tests; does the gate find
  members by itself or depend on a list), with their detection recipes and the process
  corollary *a request in a report is not a gate*.
- **The settled-decision discipline**: markers, numbered inventory before proposing,
  non-negotiable once closed, and *compaction removes memory, not obligations*.
- **The six agent epistemic errors**, as Manifestation / Cause / Guard.
- **Monorepo awareness** and the **repository-to-repository port protocol** in full:
  read-only legacy, Clean / Cruft / To-decide inventory, new architecture wins, a port-log
  entry per port, deprecation only after green gates plus a parallel-use period.
- **Data tiers and pause-and-confirm**, with the command blocklist.
- **Design and vocabulary as contract**, including the ASCII wireframe before a large
  interface shell and the proportionality of blocking checkpoints.
- **Scale limits**, **coverage targets per layer** with their percentages, the coverage
  report block, and *below target on a mandatory layer ⇒ write the missing tests first*.

## What was generalized

- **Stack neutrality.** Named tools became examples, clearly labelled where they appear at
  all. The original's commands, accessibility engine, browser driver, data layer and
  framework-specific checks became "the project's type checker / build / test runner" with
  the exact commands moved to `vault/policy.md`.
- **Role names.** "The developer" became "the human" or "the responsible human";
  "CLAUDE.md" became `AGENTS.md` plus the project policy, so the method is agent-neutral.
- **The "Day N" ladder.** The seven-days-to-deploy framing (Akita's) was dropped in favour
  of **named passes** — verification, gates, sanity, hardening, coverage — that do not
  imply a calendar.
- **Accessibility and smoke checks** became generic rule-set-based checks rather than one
  vendor's API.
- **The paste-into-your-project checklist** became parameters in
  `templates/project-policy.md`, so there is one place to configure instead of a list to
  copy and let rot.
- **The Map Rule** ("closed a stage, update the map") was already the heart of Cellular
  Mode's closing ritual; its generic obligation lives in `skills/pause/SKILL.md` and
  `docs/03-state-and-memory.md`.

## What was made optional

- **The epistemic spec** (operating modes, semantic restrictions, a registry of domain
  epistemic errors) is a **generic scaffold only**: `templates/epistemic-spec.md`. No
  domain content, no vocabulary, no modes from the original project. Most projects should
  delete it.
- **All seven engineering skills** are Level 2 *on demand*. Nothing new is permanently
  loaded except six lines in `AGENTS.md`. A project that wants only the cell lifecycle
  simply never opens them.
- **The full-system rung** (real storage, real browser) stays optional by design, exactly
  as the original's Rule 11.0 required: it does not apply to a UI shell, a navigable mock,
  a pure library, or interactive documentation.

## What was excluded, and why

| Excluded | Reason |
|---|---|
| Any verbatim text of the base layer | Third-party rights: restated, never reproduced |
| Domain modes, vocabulary and worked health-care examples of the epistemic spec | Project-specific policy, and sensitive-domain content |
| The Map Rule's concrete artefacts (named diagrams, vault page names, a project constitution of its own) | Project-specific policy; the generic obligation was kept |
| Contract-first "spine" as a mandatory architecture | A project decision, not a method rule; it belongs to the architecture layer |
| Product names, service ports, host addresses, repository names | Private infrastructure detail |
| The version-evolution table and the "what changed from v4 to v5" essay | History of the original document, not of this one; the traceability table below replaces it |
| The "how to use this skill" installation notes and the project's own skill inventory | Tool- and project-specific; replaced by `docs/08-agent-integration.md` and `adapters/` |

## What is left for future work

- A mechanical **coverage gate** that reads the targets from the policy and fails when a
  mandatory layer is below them. Today the targets are declared and the report is written
  by hand — which is exactly the shape the original warned about in *a request in a report
  is not a gate*.
- **Visual regression** checks, which the original also parked.
- A reusable **prompt-injection pattern set** for step 5 of the hardening pass.
- A **source-guard lint** that flags the two anti-patterns of `false-green.md` — a regex
  where a literal assertion would do, and an assertion against a module's own flag.

## Traceability

Status labels: **preserved** (semantics intact) · **generalized** (semantics intact,
stack- or project-specific detail removed) · **optional** (shipped as a scaffold a project
may ignore) · **excluded** (with the reason above).

| Original | New location | Status |
|---|---|---|
| Core philosophy (pilot / navigator; discipline > intuition) | `docs/05-engineering-rules.md` "Principles" | preserved |
| Rule 0 — read the project instruction file first | `AGENTS.md`; `templates/project-policy.md` | generalized |
| Rule 0.1 — settled-decision inventory; decision markers | `skills/decisions/SKILL.md` §1–§2 | preserved |
| Rule 1 — test-first always | `docs/05` §2; `skills/verify/SKILL.md` §2 | preserved |
| Rule 1.1 — the verification question, five parts, the ladder | `docs/05` §1; `skills/verify/SKILL.md` §1 | preserved |
| Rule 1.1 / v5.2–v5.2.6 — the nine forms of false green | `skills/verify/false-green.md` §1–§9 | preserved |
| Rule 1.1 / v5.2.7 — literal over regex; never assert a self-declared flag | `skills/verify/false-green.md` "How to WRITE a source guard" | preserved |
| Rule 2 — **Trilateral Verification**, strict flag list | `docs/00-constitution.md` Art. 4; `docs/05` §3; `skills/verify/SKILL.md` §3 | preserved |
| Rule 3 — one-shot is a myth; scale limits table | `docs/05` §4; `templates/project-policy.md` "Scale limits" | preserved |
| Rule 4 — epistemic spec (modes, restrictions, domain errors) | `templates/epistemic-spec.md` | optional |
| Rule 4.1 — the six agent epistemic errors | `docs/05` §8; `templates/project-policy.md` | preserved |
| Rule 5 — detachment from the code; never ask for a manual edit | `docs/05` §10 | preserved |
| Rule 6 — continuous documentation (context / decision / reason) | `docs/05` §10; `docs/03-state-and-memory.md` | preserved |
| Rule 7 — "AI jail": no destructive command without confirmation | `skills/protect/SKILL.md`; `AGENTS.md` approval boundary | generalized |
| Rule 7 — security hardening, ordered steps 1–7 | `skills/harden/SKILL.md` §1; `templates/project-policy.md` defaults | preserved |
| Rule 8 — monorepo awareness | `docs/05` §11 | preserved |
| Rule 8.1 — repository-to-repository port protocol, steps 1–5 | `skills/port/SKILL.md`; `templates/port-log.md` | preserved |
| Rule 9 / 9.1–9.3 — accessibility, smoke navigation, icon checks | `skills/sanity/SKILL.md` §3 | generalized |
| Rule 10.1–10.6 — structural sanity scans | `skills/sanity/SKILL.md` §1 | generalized |
| Rule 10.7 — does the type check reach the tests? | `skills/sanity/SKILL.md` §2.1 | preserved |
| Rule 10.8 — list-driven gate; *a request in a report is not a gate* | `skills/sanity/SKILL.md` §2.2 | preserved |
| Rule 11 — reality tests with real storage and real browser | `docs/05` §1 top rung; `skills/coverage/SKILL.md` §1 | generalized |
| Rule 11.0 — when the reality rung does **not** apply | `skills/verify/SKILL.md` §2; `skills/coverage/SKILL.md` §2 | preserved |
| Rule 11.1–11.4 — auth, CRUD, permissions, multi-actor flows | `skills/coverage/SKILL.md` §1 (targets); code samples excluded | generalized |
| Rule 12.1 — coverage targets per layer, with percentages | `skills/coverage/SKILL.md` §1; `templates/project-policy.md` | preserved |
| Rule 12.2 — the canonical critical-flow list | `templates/project-policy.md` (project fills it) | generalized |
| Rule 12.3 — what needs little or no coverage | `skills/coverage/SKILL.md` §2 | preserved |
| Rule 12.4 — the coverage report block | `skills/coverage/SKILL.md` §3; `templates/project-policy.md` | preserved |
| Rule 12.5 — the golden rule (a mocked test proves the mock) | `docs/05` §7; `skills/coverage/SKILL.md` §4 | preserved |
| Rule 13.1 — data classification, four tiers | `skills/protect/SKILL.md` §1; `templates/project-policy.md` | preserved (top tier renamed, naming configurable) |
| Rule 13.2 — the absolute command blocklist | `skills/protect/SKILL.md` §2; `templates/project-policy.md` | preserved |
| Rule 13.3 — pause-and-confirm, five steps | `skills/protect/SKILL.md` §3; `templates/project-policy.md` | preserved |
| Rule 13.4 — the project declares its own top tier | `templates/project-policy.md` "Protected resources" | preserved |
| Rule 14.1–14.3 — design tokens and vocabulary are a contract | `docs/05` §9; `templates/project-policy.md` "Sources of truth that are literal" | preserved |
| Rule 15.1–15.4 — exact delivery, real choices, no re-asking, costly questions | `docs/05` §10 | preserved |
| Rule 15.5 — ASCII wireframe before a large interface shell | `docs/05` §9; `templates/project-policy.md` checkpoint table | preserved |
| Rule 15.6 — blocking checkpoints proportional to the decision | `templates/project-policy.md` "Checkpoint proportionality" | preserved |
| Full feature workflow (23 steps) | `docs/02-cell-lifecycle.md` + `skills/cell`, `skills/verify`, `skills/pause` | generalized |
| Paste-into-your-project checklist | `templates/project-policy.md` (as parameters) | generalized |
| Version-evolution table; "v4 to v5" essay | this report (traceability + attribution) | excluded |
| Rules index — core philosophy and what the method requires | `docs/05-engineering-rules.md` | generalized |
| Rules index — **Map Rule** ("closed a stage, update the map") | `skills/pause/SKILL.md`; `docs/03-state-and-memory.md`; `docs/06-context-engineering.md` | generalized |
| Rules index — named diagrams, vault page names, project constitution | — | excluded |
| "How to use this skill"; the project's own skill inventory | `docs/08-agent-integration.md`; `adapters/` | generalized |

Every numbered rule and lettered section of both original files appears above exactly
once. The only rows marked **excluded** are the four named in the exclusion table plus the
original's own version history.
