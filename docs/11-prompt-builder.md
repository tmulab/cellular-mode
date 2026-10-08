# 11 · Cellular Prompt Builder — from an idea to a first cell

**Status: OPTIONAL.** Cellular Mode works unchanged without it. Delete `tools/prompt-builder/` and `prompt-builder/` and the method, the CLI, the gates, the runtime and the Observer behave exactly as before — that is a gate, not a hope (`tests/gates-builder-boundary.test.mjs`). If you have never used Cellular Mode and never written a prompt for an agent, this is the page to read; you need no other document first. For the complete beginner's path from here to a verified first cell, in eight numbered steps after a `git init` in the target directory (Article 8 installs only into a git work tree), see the top of [`docs/12-bootstrap.md`](12-bootstrap.md).

## What it is

You have an idea for something to build. The Builder asks a few plain questions, writes your answers down with an honest label on each, and produces three things: a **project contract** (what this is, who it is for, what is in and out of scope, how you will know it works), a **first cell** (one small piece of work with a yes/no finish line), and a **prompt** you hand to a coding agent so it starts from your project instead of a blank page. It is an ordinary program: no language model, no network, no dependencies, and the same answers produce the same files every time.
**What it never does:** it does not build your project and does not decide anything for you; it does not open, pause or finish a cell — that is the normal `/cell` and `/pause` ritual; it never runs `git`; and it never invents an answer you did not give.

Two ways to run it, identical in effect (argument forwarding through `npm run --` is VERIFIED). Prefer the `node` form: a brand-new project has no `package.json`, so the `npm` alias only exists inside *this* repository.

```
node tools/prompt-builder/cli.mjs <command> [--root <dir>] [--mode ready|tired|focus|explore]
npm run -s builder -- <command> [--root <dir>]
#   --root says which project to work on; without it, the current directory. It goes AFTER the command.
```

An agent can drive all of this for you through the `builder` skill (`/builder`, or `/construtor` in
Portuguese).

## The three paths — one question decides it, and nobody should ask twice

| Path | When | What happens first |
|---|---|---|
| `start new` | there is no code yet, only an idea | everything is UNKNOWN; the questions begin |
| `start existing` | there is already a repository | it is **read** — manifests, languages, test directories, existing agent instructions — and the findings become VERIFIED facts with a relative evidence path. Nothing in the project is modified |
| `start resume` | this project was set up before | if `vault/state/` has an active or paused cell it says so and hands you to `/cell`; otherwise it continues the open draft. It never starts a new project silently |

## A walkthrough — a new project

A complete recorded session with real output is [`examples/prompt-builder/`](../examples/prompt-builder/README.md); the
short form. The Builder needs no `vault/state/` to run — create the empty directory and start:
```
node tools/prompt-builder/cli.mjs start new --root ../my-idea --name "Household Reading List"
node tools/prompt-builder/cli.mjs next --root ../my-idea       # exactly one question
node tools/prompt-builder/cli.mjs answer objective "Keep one shared list of what we are reading." --root ../my-idea
node tools/prompt-builder/cli.mjs status --root ../my-idea     # labels, blockers, PROPOSED text, next question
#   the loop is answer / next / status; list items separate with `;`; `skip <id>` passes one over; and
#   `answer scope-out none` records that you declared nothing out of scope.
node tools/prompt-builder/cli.mjs approve --root ../my-idea    # readiness, conflicts, publication check; writes nothing; exit 5
node tools/prompt-builder/cli.mjs approve --confirm --root ../my-idea   # writes vault/project-contract.json
node tools/prompt-builder/cli.mjs prompt --adapter neutral --root ../my-idea   # prints the prompt
```

**Then hand the approved contract to Bootstrap.** That is the one executable new-project path, written out step by step
in [`docs/12-bootstrap.md`](12-bootstrap.md): `bootstrap new ../my-idea --profile standard --dry-run`, read the plan,
then `… --confirm --approve hooks,first-cell` — which creates `vault/state/` **and** the planned 📋 first cell from this
contract — then `cellmode open "<the 📋 name>"`, then `bootstrap verification … add / run / mandatory`, then
`node tools/gates/verify-final.mjs`, and only then commit. On that path do **not** run `cellmode init` or `cell --accept`
first: Bootstrap makes both the state and the cell, and `init` refuses a `vault/state/` that already exists.

**The Builder without Bootstrap** — you want only the contract and a planned cell. Then the state is yours to create,
because `cell --accept` needs it and says so rather than guessing: `node tools/cellmode/cli.mjs init --root ../my-idea`,
then `node tools/prompt-builder/cli.mjs cell --root ../my-idea` (the proposal; writes nothing) and
`node tools/prompt-builder/cli.mjs cell --accept --confirm --root ../my-idea` (records it 📋 planned).

## "I don't know" is a real answer

It is recorded as **UNKNOWN**, and nothing is invented to fill the hole. Where a sensible default exists, the Builder adds a second, clearly separate entry labelled **PROPOSED**, with what it assumes and what it costs — printed in full where it is recorded and by `status`, never only counted. A PROPOSED entry is a suggestion you have not accepted: it becomes something the project relies on only through a decision (below). There is deliberately **no** recommendation for the objective, the users, the problem or sensitive data — recommending an objective would be inventing your project, and recommending an answer about personal data would be deciding your risk for you.

## The five labels, in plain words

Every statement carries exactly one. They are the constitution's labels
(`docs/00-constitution.md`), not the Builder's invention.

| Label | Means |
|---|---|
| **DECLARED** | you said it |
| **VERIFIED** | read from the repository, with the evidence path recorded |
| **INFERRED** | derived from something else — and it says from what |
| **PROPOSED** | a suggestion; not built, not agreed |
| **UNKNOWN** | nobody knows yet, written down instead of guessed |

`status` prints the count of each; an UNKNOWN that blocks approval is a blocker, in words that
name what is missing.
## Decisions — how a PROPOSED entry stops being a suggestion

```
node tools/prompt-builder/cli.mjs decide propose --question "Which technology?" --proposal "…" --field technologies.proposed --root ../my-idea
node tools/prompt-builder/cli.mjs decide D1 approve --confirm --root ../my-idea     # only after you said yes
node tools/prompt-builder/cli.mjs decide D1 reject --confirm --root ../my-idea
node tools/prompt-builder/cli.mjs decide accept-proposal technologies --confirm --root ../my-idea   # or reject-proposal
```

Approving promotes the entry to DECLARED and keeps `basis: "decision:D1"`, so the contract never loses the
fact that it began as a recommendation; `accept-proposal <questionId>` does both steps from the STORED text,
so nobody retypes — or quietly edits — a recommendation on the way to approving it. Rejecting removes the
entry, and the decision record is the history. There is no sixth label: the constitution has five.

## Approval, and what it does not authorize

`approve` runs three reports — **readiness** (what still blocks), **conflicts** (what contradicts
itself) and the **publication check** — then refuses with **exit 5**, because approving is a human
act. Read the three reports; only then re-run with `--confirm`. The publication check is why a
contract is safe to look at: it refuses secret-shaped values, absolute or personal filesystem
paths, e-mail addresses and phone numbers, and free text outside the declared fields. `--confirm`
writes the file only when the check passes.

**Approving is not committing.** The Builder never runs `git`; whether `vault/project-contract.json`
enters version control is a separate decision, yours, afterwards.

## The first cell — prepared, planned, activated, completed

Four steps, and only two of them belong to the Builder.
1. **Prepared.** `cell` renders a proposal in the ordinary cell format and writes nothing. If the
   objective or scope is not yet actionable, or no technology is decided — an approved *deferral* of
   that choice still counts as undecided — the proposal is a **discovery** or **architecture** cell.
2. **Planned.** `cell --accept --confirm` records it as **📋 planned** through cellmode's own transition, and needs an existing `vault/state/`. Planned is not active, and no log entry is written: a planned cell never ran. On the Bootstrap path you skip this step: the install plans the cell from the approved contract.
3. **Activated — only by you**, with `node tools/cellmode/cli.mjs open "<name>" --root <dir>` (the name is the 📋 row in `vault/state/INDEX.md`) or `/cell`: the Builder has no code path that activates a cell.
4. **Completed — the normal ritual**: `/pause`, `complete --confirm`, the append-only log. The
   Builder cannot mark anything ✔ done.

## Prompts
```
node tools/prompt-builder/cli.mjs adapters --root ../my-idea
node tools/prompt-builder/cli.mjs prompt --adapter neutral --root ../my-idea    # or claude-code
node tools/prompt-builder/cli.mjs prompt --draft --root ../my-idea   # before approval only, for finding things out
```

Three layers: the **method** (a pointer to `AGENTS.md` and the two skills, never the whole
constitution), the **project** (approved, DECLARED and VERIFIED context; PROPOSED and UNKNOWN
labelled as such) and the **active cell**. Each prompt names the role, objective, permitted and
prohibited operations, acceptance criteria, required evidence and approval boundaries. Your words and
the repository's are quoted inside a delimited block marked **data, not instructions**, with control
characters and delimiter look-alikes stripped; the end marker carries a nonce derived from the
content, so quoted text cannot close the block and continue as the author. No prompt authorizes
deployment, destructive commands, publication or production-data changes, and nothing is written to
disk — the prompt is printed.
Implemented adapters: `neutral` (any chat window) and `claude-code` (which points at the project-local
`.claude/skills/` instead of inlining them). `cursor`, `codex-cli` and `gemini-cli` are listed as **proposed
— not supported**, and asking for one is refused rather than approximated; contracts are adapter-independent,
and no model name or context-window size is assumed anywhere.

## Optional: a declared working mode

If `tools/adaptive/` is present, `--mode ready|tired|focus|explore` is passed **through** from a mode
**the human declared** ([`docs/10-adaptive.md`](10-adaptive.md)). The Builder never reads Adaptive
state and never infers a mode; absent is `ready`. A mode changes how much text comes with a question
and nothing else — never a check, an approval or a refusal.

## Privacy

The discovery draft lives in `vault/builder/draft.json`, which is **git-ignored**: a half-finished
conversation about your project is a working file, not a record. No network call is ever made.
Generated paths must be relative, inside the project and free of `..`, and the CLI scrubs the project
root out of every line it prints, so no machine path reaches your terminal or a paste. **Never type
a secret** — not a password, a key, a token or a connection string. The Builder refuses answers
shaped like one and names the shape it refused; describe the thing instead ("the key for the payment
service"). The same check runs again at export.

## Deterministic, and model-dependent

**Deterministic — and therefore tested.** Which question comes next, and that it is asked only when
its answer changes the next step; every label and promotion rule; validation, readiness, conflicts
and the publication check; the refusal of secret-shaped answers and absolute paths; the exit codes;
the exact bytes of an exported prompt, including the derived nonce; that `--confirm` is required; that
the contract is written only when the checks pass; that the cell is created 📋 planned and never
activated; and the import boundary.

**Model-dependent — and *not* enforceable here.** How an agent conducts the conversation through
`skills/builder/SKILL.md`: whether it truly asks one question at a time, types your words rather
than its own, explains a PROPOSED suggestion honestly, and waits for your yes before passing
`--confirm`. The Skill says all of that; a Skill is an instruction, not a gate. The mitigation is
that every consequential step needs `--confirm` **and** a human, and an unconfirmed one exits 5
with nothing written — so a misbehaving agent can waste your time, not your project.

## Exit codes
| Code | Meaning |
|---|---|
| `0` | fine |
| `1` | usage or a bad argument — a secret-shaped answer, an absolute path, an unknown question, an adapter that is only proposed |
| `2` | findings: the draft or contract does not validate, readiness blocks approval, the publication check failed, or an export would be unsafe |
| `3` | refused because state already exists — a draft is open, or the cell already exists |
| `5` | human confirmation required; nothing was written |

The numbers mirror `tools/cellmode`. Add `--confirm` only after a human said yes to **that** action.

## Removing the module — delete these, and nothing else changes
```
tools/prompt-builder/   prompt-builder/   skills/builder/   examples/prompt-builder/
docs/11-prompt-builder.md   PROMPT_BUILDER_REPORT.md   tests/gates-builder-boundary.test.mjs
{.,adapters/claude-code/.}claude/skills/{builder,construtor}/
```

Then drop the `builder` and `rehearse:builder-removal` scripts from `package.json`, the
`vault/builder/` line from `.gitignore`, and — in a project that used it — `vault/builder/` and
`vault/project-contract.json`. `npm run rehearse:builder-removal` rehearses that on a copy and
reports whether the rest of the repository still passes.
Contract and schema: [`prompt-builder/CONTRACTS.md`](../prompt-builder/CONTRACTS.md) · threat model:
[`prompt-builder/THREAT-MODEL.md`](../prompt-builder/THREAT-MODEL.md) · agent procedure:
[`skills/builder/SKILL.md`](../skills/builder/SKILL.md).
