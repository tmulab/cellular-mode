# Adapters — using Cellular Mode with different agents

Cellular Mode is **agent-neutral**. The method lives in plain Markdown:

- `AGENTS.md` — Level 1 bootstrap: the seven rules, where state lives, what to load next.
- `skills/cell/SKILL.md` and `skills/pause/SKILL.md` — the two canonical procedures.
- `vault/state/` — the recorded state the procedures read and write.

An *adapter* is only the glue that makes a specific tool discover those files. Adapters
are intentionally thin pointers (≤15 lines): the method is never duplicated, so it can
never drift between tools.

## Honesty statement

Stated per adapter, because the answer is not the same for all of them.

- **Claude Code — discovery VERIFIED and invocation VERIFIED.** In a live session in this
  repository the harness listed all eleven skills from `.claude/skills/` by name and
  description — `cell`, `pause`, `celula`, `pausar` and the seven engineering skills — so
  the adapter's file layout is discovered as documented. The **`cell` skill was then
  invoked** through Claude Code's Skill tool: the thin pointer at
  `.claude/skills/cell/SKILL.md` loaded, directed to `skills/cell/SKILL.md`, and the
  procedure was followed — the integrity guard (`cellmode check`) passed and routing
  reached case C (no active cell, one planned). The other **ten** pointer skills share the
  identical pointer shape but were **not individually invoked**: that half is INFERRED
  from the shared shape, not separately VERIFIED.
- **The eight Cellular Adaptive mode skills — shape VERIFIED, invocation NOT PERFORMED.**
  They are generated from one template, asserted by `tests/bootstrap.test.mjs` to be
  byte-identical in both trees and to carry `disable-model-invocation: true`. No live session
  has invoked one, and **whether a model then behaves as the block describes is not something
  this repository can check** — that is `tools/adaptive/MANUAL-VALIDATION.md`, NOT YET PERFORMED.
- **Every other adapter — UNTESTED.** Cursor, OpenAI Codex CLI, Gemini CLI, GitHub
  Copilot, Aider and the generic-chat recommendation were never run. They are based on
  each tool's publicly documented conventions at the time of writing.

Conventions for agent config files change quickly — **verify against your tool's current
docs** before relying on a path or a command syntax. Where slash-command support is
unknown, this table says so instead of guessing; the generic fallback always works.

## Per-tool table

| Tool | What you need | What is supported | Limitations |
|---|---|---|---|
| **Claude Code** | Copy `adapters/claude-code/.claude/` into your project root, plus `AGENTS.md` and a `CLAUDE.md` that imports it. | Auto-loads `CLAUDE.md` at session start; skills in `.claude/skills/<name>/SKILL.md` are invocable as `/cell`, `/pause`, `/celula`, `/pausar`, and are also matched from their `description` trigger phrases. | Discovery **VERIFIED** live (all eleven listed by name and description) and invocation **VERIFIED** for `cell` (pointer loaded, procedure followed); the other ten were not individually invoked. Slash-command naming follows the directory name; if your version differs, say the trigger phrase instead. |
| **OpenAI Codex CLI** | Keep `AGENTS.md` at the repository root. Nothing else. | `AGENTS.md` is the documented convention for repository-level agent instructions, which is exactly the Level 1 file. | No skill/slash-command mechanism assumed. Invoke by phrase: "open a cell", "pause the cell". Verify how nested `AGENTS.md` files merge in your version. |
| **Cursor** | Copy `adapters/cursor/.cursor/` into your project root. | A project rule with `alwaysApply: true` that points at `AGENTS.md`; the agent then reads the skills on demand. | No slash commands. The rule is a pointer, so the agent must actually open `AGENTS.md`; if it does not, paste the rule body into the chat once. Rule front-matter keys have changed across Cursor versions — check current docs. |
| **Gemini CLI** | Point its context file at `AGENTS.md` (a one-line pointer file, or the tool's configured context filename). | Reads a project context file at startup, so Level 1 loads the same way. | Context filename and settings key are version-specific; we do not claim a fixed name. No skill mechanism assumed. |
| **GitHub Copilot** (chat / coding agent) | Put a short pointer in `.github/copilot-instructions.md`: "Read and follow `AGENTS.md`". | Repository-level custom instructions are a documented feature and are enough for Level 1. | No `/cell` command. Copilot may not open linked files on its own; for a long session, paste `skills/cell/SKILL.md` once. Instruction-file support differs between IDE chat and the coding agent. |
| **Aider** | Add `AGENTS.md` (and the two skills, when working a cell) to the chat context, e.g. via `/read-only AGENTS.md` or a conventions file. | Explicit read-only context files are a documented mechanism; the method works once the files are in context. | Nothing is auto-discovered. You re-add context each session; `/read-only` keeps the method from being edited by mistake. No slash-command integration. |
| **Generic chat** (any assistant, web UI) | Nothing installed. | Paste `AGENTS.md` at the start of the session. When you want to open or close a cell, **say the trigger phrase** ("open a cell", "where did we stop", "stop here, note this down") **or paste the relevant skill file**. Paste back the content of `vault/state/CURRENT-CELL.md` to reconnect. | No file access: you carry state by hand, copying the agent's log entry into `vault/state/log.md` yourself. The `cellmode` CLI is the easy way to keep the files honest in this mode. |

## Optional: Cellular Adaptive (modes)

Two integration paths, both optional. The module itself:
[`tools/adaptive/README.md`](../tools/adaptive/README.md).

**1. Skills only — no hooks, nothing to install beyond the files.** The eight mode skills ship
in `adapters/claude-code/.claude/skills/` (and in this repository's own `.claude/skills/`).
Each carries `disable-model-invocation: true`, so **only the human can invoke them**; the
`set … --source skill` they run is therefore user-originated by construction. This is the
recommended path: it needs no hook, no settings file and no automatic command execution.

**2. Hooks — opt-in, for persistence across turns and compaction.** Copy the contents of
[`claude-code/settings.adaptive.json`](claude-code/settings.adaptive.json) into your own
`.claude/settings.json` (merging the `hooks` key), or keep it in
`.claude/settings.local.json` for yourself only. `SessionStart` restates the active block
after a resume or a compaction; `UserPromptSubmit` applies an exact mode command and otherwise
prints only when the block changed.

> **Why this is not installed for you.** Project hooks run commands **without a trust prompt**.
> Shipping an enabled hook in a repository anyone may clone would mean shipping automatic
> command execution. This repository therefore has no `.claude/settings.json` at all, and a
> test asserts that none of its settings files reference `tools/adaptive`.

**What is deterministic, and what is not.** Deterministic: the state and its validation, expiry,
which policy files are read, the bytes of the block, `source` recorded on every write, a mode
set from a prompt **only** when the prompt is exactly a slash command, and a skill the model
cannot invoke. Model-dependent, and **not** enforceable here: whether the agent actually behaves
the way the block describes. Nothing in this repository claims otherwise — see
`docs/08-agent-integration.md` for the per-agent table.

> **Recorded risk (UNKNOWN).** Whether a project skill named `tired` could ever be shadowed by a
> future built-in command of the same name is **not documented** by Claude Code. No such
> built-ins are documented today, so nothing is broken; the precedence rule is simply unknown.
> If it becomes a problem, the fallback is a rename, not a redesign: `/mode-tired`,
> `/mode-ready`, `/mode-focus`, `/mode-explore`. Those names are **documented here and
> deliberately not shipped**, so adopting them is a directory rename plus one line per file.

## Optional: the Cellular Prompt Builder (`/builder`, `/construtor`)

Two more pointer skills ship in the same directory, for the **optional** Prompt Builder: `builder`
and its Portuguese alias `construtor`, both pointing at `skills/builder/SKILL.md`. They turn an
idea into an approved project contract, a planned first cell and an agent-neutral prompt. The
module is a plain CLI (`npm run -s builder -- help`), so **any** agent — or a human with no agent
at all — can use it; the two skills only save you typing the trigger phrase. Nothing is installed
and nothing is assumed: if `tools/prompt-builder/` is absent, the skill says so in one line and
the normal method continues. Onboarding: [`docs/11-prompt-builder.md`](../docs/11-prompt-builder.md).

## Optional: Cellular Bootstrap (installing into another project)

The adapters above describe *this* repository. To put the method into a project of your own, the optional
`bootstrap` CLI installs a selected subset into it and generates the matching pointers: `.claude/skills/`
entries for the skills it actually installed (`claude-code-adapter`) and the Cursor rule
(`cursor-adapter`). Both are offered only when the target already uses that tool, or when you ask for
them, and nothing is written without `--confirm`. Onboarding:
[`docs/12-bootstrap.md`](../docs/12-bootstrap.md).

## Writing your own adapter

1. Find where your tool looks for project instructions (its docs, not this file).
2. Put a pointer there — not a copy: *"Read and follow `AGENTS.md` at the repository root."*
3. If the tool has a skill/command mechanism, add one entry per procedure, each pointing
   at `skills/cell/SKILL.md` or `skills/pause/SKILL.md`, with the trigger phrases copied
   from the canonical skill's `description`.
4. Keep it under ~15 lines. If your adapter starts restating the rules, it will drift.
5. Test it the honest way: run one real session, stop mid-way, start a new session, and
   check that reconnection takes under five minutes with zero re-explaining.

## No tool at all

The method does not require an agent. `node tools/cellmode/cli.mjs status` prints the
same ≤5-line reconnection a skill would produce, and `pause` / `complete` write the same
state files. A human alone with the CLI is a valid user of Cellular Mode.
