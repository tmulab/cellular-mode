# 05 · The engineering method — a map

This is the **map** of the TMU-LAB Engineering Method: the principles, and which file holds
each procedure. It is short on purpose, because the procedures load **on demand**.
Three layers, least to most negotiable. **Constitution** — `docs/00-constitution.md`, not
negotiable: strengthening allowed, relaxation needs an explicit, justified, documented,
human-approved exception. **Method** — this file plus the engineering skills below: the
procedures are stable, which ones a project runs is a choice. **Policy** —
`vault/policy.md` (from `templates/project-policy.md`), entirely configurable. Cells,
state and resumption (`02`, `03`, `06`) work with any engineering standard: the **mode**
gives work its size and rhythm, the **method** gives it rigor.

## Principles

The agent is the **pilot** (it writes the code); the human is the **navigator** (thinks,
architects, decides). Throwing prompts and accepting whatever comes back is not a mode.

> Discipline > intuition · Planning > improvisation · Tests > features · Domain > code ·
> **A settled decision > a repeated recommendation.**

And the finding that drove the later versions of the original method: the agent has
**epistemic errors of its own** (§8) — working vices that poison a session regardless of
the code produced, treated with the rigor given to domain bugs.

## Where each procedure lives

| Procedure | Skill (Level 2) | Reference (Level 4) |
|---|---|---|
| Verification question, test-first loop, Trilateral | `skills/verify/SKILL.md` | `skills/verify/false-green.md` |
| Protected data, blocklist, pause-and-confirm | `skills/protect/SKILL.md` | `docs/04-collaboration.md` |
| Security hardening, threat modelling | `skills/harden/SKILL.md` | `templates/project-policy.md` |
| Structural sanity, gate reach, accessibility, smoke | `skills/sanity/SKILL.md` | — |
| Coverage targets and the coverage report | `skills/coverage/SKILL.md` | `templates/project-policy.md` |
| Repository-to-repository port | `skills/port/SKILL.md` | `templates/port-log.md` |
| Settled-decision inventory | `skills/decisions/SKILL.md` | `templates/adr.md` |
| Domain epistemic scaffold (optional) | — | `templates/epistemic-spec.md` |

None is loaded by default: an agent reads the one the task is about.

## 1. The verification question

Before writing the first test of any task, answer explicitly:

> **How can we verify that this really works?**

The answer counts only with a **verification test**: realistic production-shaped data (not
`foo`/`bar`); the **expected scope declared before running** (exact values where
deterministic, ranges and invariants where not); the **real function** run over that data,
mocking only what is genuinely external; a **proof that it is red without the fix**; and a
delivery report naming scenario, data, declared scope and result. *If you cannot state the
expected scope, you do not understand the feature yet.* It is the **middle rung** of the
ladder — above the mocked unit test, below the expensive full-system test — and unlike the
top rung it runs on **every** task; the whole ladder is in `skills/verify/SKILL.md`.

**A revert that passes is a FINDING, not relief.** Step four is *revert and read the
result*, never *revert and confirm the red*. Green opens an investigation. The nine forms
of false green, their detection heuristics and the two source-guard rules are in
`skills/verify/false-green.md` — read it the moment a revert comes back green. Worked
form: `templates/cell-contract.md`.

## 2. Test-first

Understand the feature → write the tests (unit + integration, mocks for what does not exist
yet) → implement until they pass → run the Trilateral → fix any failing layer before moving
on. Asked to "just implement X": offer the tests first; if the human insists, state the risk
once and comply. **No feature without a test; no test without an adequate mock.** Legitimate
exemption: work with no behavior to assert yet — a UI shell, a navigable mock, a pure design
system — whose coverage is §6 instead.

## 3. Trilateral Verification

After **every** significant change, three independent gates, reported as **three lines**
with real counts:

```
✅ typecheck: 0 errors
✅ build:     success
✅ tests:     129/129 pass (3 pre-existing failures, documented)
```

**Why three and not one:** type checking catches wrong types that mock-heavy tests paper
over; the build catches packaging and server-rendering errors the type checker accepts;
tests catch logic that compiles and returns the wrong answer. Together they are
*categorically* stronger than any one alone.

- **Pre-existing failures are documented, never absorbed** — named, counted, kept out.
- **A gate that cannot run is UNKNOWN, never green** (`00-constitution.md` Article 3):
  report it with a warning marker, say what *was* checked instead, never give it the success
  marker. Commands are per project, declared in `vault/policy.md`.
- **Strict type checking in full.** For TypeScript the floor is `strict: true` **plus**
  `noUncheckedIndexedAccess` (array and dictionary access bugs),
  `exactOptionalPropertyTypes` (an explicit undefined where only optionality was meant)
  and `noImplicitOverride` (an override that no longer overrides). `strict: true` alone is
  not enough. Other languages: enable every strict mode the toolchain offers — the loosest
  setting that still calls itself "strict" is not the goal.
- **Does the gate reach what you think it reaches?** An exclude list filters the *program*,
  not just the output; a list-driven gate is blind to whatever is off it (`skills/sanity/`).

## 4. Scale limits

One prompt does not build a project. Defaults, all configurable in `vault/policy.md`:

| Metric | Limit | Reason |
|---|---|---|
| Lines per file | **200** | Beyond this, review quality collapses |
| Lines written per session | **800–1200** | Empirical ceiling before context gets volatile |
| New files per session | **15–20** | Each one needs the three gates |
| Open decisions per prompt | **3**, ideally **1** | More than three means planning is missing, not code |

Overflowing a limit: say so with numbers, propose a split into named sessions with sizes,
wait for approval, execute only the first. "I'll try to fit it all and stop if I can't" is a
broken delivery.

## 5. Data tiers and the protection protocol

Four tiers — **Protected / Production / Development / Derived** — the top one declared per
project, plus a command blocklist and a five-step pause-and-confirm before any operation that
*might* touch it. **A project that declares nothing is treated entirely as Production.**
Reading is free; protection covers mutation. `skills/protect/SKILL.md`, `docs/04-collaboration.md`.

## 6. Static sanity and security hardening

Fast checks that read the source without running it catch what neither unit tests nor the
build notice: internal links to routes that do not exist, assets missing from disk, interface
calls with no handler, strings in the wrong language in user-facing labels, browser-only APIs
in server-only code, deprecated framework classes — plus the two gate-reach checks of §3, and
accessibility and smoke navigation where there is a user interface. Seconds to run; they
belong in the test suite, not in a ceremony (`skills/sanity/SKILL.md`). Security hardening is
a dedicated **ordered** pass, not a sprinkle, closed with the Trilateral; a new execution
capability or trust boundary gets a threat-model pass first. Checklist and defaults:
`skills/harden/SKILL.md`, `templates/project-policy.md`.

## 7. Coverage by layer

A single global percentage rewards useless tests. The target is per layer, each with its
own criterion, and **below the target on a mandatory layer means writing the missing tests
before the next feature**. Targets, exemptions and the report block:
`skills/coverage/SKILL.md`. The rule behind the numbers: **a mocked test proves the mock
works; a real-system test proves the system works.** If the answer to "does this work?"
depends on "it works in the tests", the tests are wrong.

## 8. Agent epistemic errors

Record them in `vault/policy.md` as **Manifestation / Cause / Guard**. Six canonical:

| Vice | Manifestation · Cause | Guard |
|---|---|---|
| **Automatic agreement** | Approves a proposal while already seeing a problem with it · agreeableness learned as helpfulness | Before validating, run one pass of "what is the most likely problem here?" and say what you saw |
| **Inflated delivery** | Asked for X, delivers X + Y + Z, so review hardens and progress accounting becomes fiction · accumulation read as competence | Deliver the agreed scope; when more fits, **ask**. Lone exception: a bug found inside the task and needed by it — fix it and report the fix separately |
| **A recommendation dressed as a question** | One option, argued at length, called a choice · confusing "help decide" with "decide and justify" | List the real alternatives with honest trade-offs, mark the recommendation in one sentence, wait. With genuinely one path, say so and proceed |
| **Re-asking a settled decision** | A closed decision reopened after a compaction · lost context taken as permission to re-decide | `skills/decisions/SKILL.md`. **Compaction removes memory, not obligations** |
| **Spontaneous vocabulary optimization** | Approved copy, product terms and design values get "improved" · normalizing the unfamiliar into the familiar | §9 |
| **False certainty about history** | "Remembers" a decision never made, or forgets a recorded one · summarized context can confabulate | Cite the source; with no citable source, say "I think" and ask |

The domain-side counterpart — modes, semantic restrictions, a registry of domain epistemic
errors — is an **optional** scaffold: `templates/epistemic-spec.md`.

## 9. Design and vocabulary are a contract

Where a visual or textual source of truth exists — a token file, a design export, an approved
copy deck — copy its values **literally**: colors, sizes, spacing, strings, labels, messages.
**Adapt structure only.** Do not reorder, translate or normalize; a neologism stays a
neologism. Product vocabulary carries product decisions, and a generic synonym loses the
decision. To change the source: stop, quote the original, say why, ask, and if approved change
*both* places. Before a large interface shell — more than ~15 files or ~800 lines of layout —
sketch an **ASCII wireframe** and wait: five minutes of drawing avoids the "build it → that is
not what I meant → rebuild" cycle.

## 10. Communication and flow

- **Deliver exactly what was agreed.** Delivering less is not a disservice; delivering
  *different* is.
- **Never require manual edits from the human.** When your code is wrong, the human explains
  in prose and you produce the complete correction; "edit line 42 yourself" is not an
  acceptable output.
- **Exact paths, real errors.** Never "in the config file", never an optimistic paraphrase of
  a stack trace. A new file justifies in one line why it did not fit in an existing one.
- **A new question is expensive.** Before asking, check the policy, the settled decisions,
  the attached history, and whether you can reasonably infer the answer and mark the
  inference as yours, subject to override. Surviving all four: ask **one** focused question.
- **Keep the checkpoint proportional** to the decision — table in
  `templates/project-policy.md`. Too much exhausts; too little is guesswork.
- **Document continuously**, on the spot: *context → decision → reason*.

## 11. Many packages, and more than one repository

In a multi-package repository: hold the context of every affected package, propagate a
refactor to all of them, make cross-package integration tests mandatory, and when renaming a
field or an interface **check every consumer** — only a gate that finds them by itself can be
trusted (§3). Living beside a legacy repository while rebuilding is a **standard** workflow,
not an exception: read-only over the legacy, a written inventory, the new architecture
winning every conflict, a port-log entry per port, deprecation only after the gates are green
and a parallel-use period has passed. Procedure: `skills/port/SKILL.md`.

## 12. Settled decisions

A closed decision is numbered, dated, attributed, given a reason — and never re-asked. When
history is attached to a session it is read **to extract decisions**, not "to understand
context", before anything new is proposed. Procedure and markers:
`skills/decisions/SKILL.md`; decisions outliving the policy get `templates/adr.md`.
