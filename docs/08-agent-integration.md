# 08 · Agent integration

Cellular Mode is agent-neutral by construction. Nothing in the method depends on a
particular vendor, model, IDE or runtime: the method is Markdown, the state is Markdown,
and the only executable part is one optional Node script with no dependencies.

## What any tool needs

Three things, in this order:

1. **It must read `AGENTS.md`.** This is the whole integration problem. Every tool has
   some convention for project-level instructions — a file it auto-loads, a rules
   directory, a context flag, or just the chat window. Put a *pointer* there.
2. **It must be able to read and write files** under `vault/state/`. A tool with no file
   access can still be used; the human carries the state by hand, or the `cellmode` CLI
   writes it (see "No tool at all" in `adapters/README.md`).
3. **It should be able to reach the two procedures** when needed:
   `skills/cell/SKILL.md` and `skills/pause/SKILL.md`. Native skill or command support
   is a convenience, not a requirement — a trigger phrase works, and so does pasting the
   file.

If a tool satisfies (1) and (2), the method works. Everything else is ergonomics.

## Adapters are pointers, never copies

An adapter is the glue between a tool's convention and the canonical files. It is
deliberately tiny — at most about fifteen lines — and it **never restates the rules**.
The reason is drift: a method duplicated into five tool-specific files becomes five
slightly different methods within a month. One canonical source, five pointers, zero
drift.

Available in this repository:

| Path | For |
|---|---|
| `adapters/claude-code/.claude/skills/` | Claude Code — eleven skill pointers: the four lifecycle ones (`cell`, `pause`, and the Portuguese-compatibility aliases `celula`, `pausar`) plus the seven optional engineering skills |
| `adapters/cursor/.cursor/rules/cellular-mode.mdc` | Cursor — an always-applied rule pointing at `AGENTS.md` |
| `.claude/skills/` (repository root) | A copy of the Claude Code adapter, so this repository itself works when opened in Claude Code |

**→ The per-tool table — what each tool needs, what is supported, and the honest
limitations — lives in [`adapters/README.md`](../adapters/README.md).** It also covers
OpenAI Codex CLI, Gemini CLI, GitHub Copilot, Aider and generic chat assistants, and
tells you how to write an adapter for a tool that is not listed.

## Honesty about testing

The claim differs per adapter, so it is split rather than averaged.

- **Claude Code: discovery VERIFIED, invocation VERIFIED for `cell`.** In a live session in
  this repository the harness listed all eleven skills from `.claude/skills/` by name and
  description — `cell`, `pause`, `celula`, `pausar` and the seven engineering skills — which
  is evidence that the adapter's layout is discovered as documented. The `cell` skill was
  then **invoked** through the Skill tool: the thin pointer loaded, directed to
  `skills/cell/SKILL.md`, and the procedure ran — `cellmode check` passed and routing
  reached case C (no active cell, one planned). The other ten pointer skills share the
  identical pointer shape but were not individually invoked; that half stays INFERRED.
- **All other adapters: UNTESTED.** Cursor, OpenAI Codex CLI, Gemini CLI, GitHub Copilot,
  Aider and the generic-chat recommendation are based on each tool's publicly documented
  conventions, not on live runs.

Agent-configuration conventions change quickly. **Verify paths and syntax against your
tool's current documentation**, and treat the table in `adapters/README.md` as a starting
point rather than a guarantee.

## Trigger phrases and aliases

The canonical skills declare their triggers in their YAML `description`, in English and
in Portuguese. Both languages ship on purpose: the English phrases are canonical, and the
Portuguese ones keep continuity with the original method ("Modo Celular") so existing
projects and habits keep working. The aliases `/celula` and `/pausar` are pointers to the
same two procedures — not variants of them.

If you work in another language, add your phrases to the `description` of the canonical
skills, or to your own `vault/profile.md`, and keep the file names as they are.

## Multiple agents

Different agents can work the same repository on different days with no coordination at
all: the state files are the handoff. Working **simultaneously** is only safe in
different cells, coordinated by contract (`04-collaboration.md`), because "at most one
active cell" is a convention verified after the fact by the integrity guard, not a lock
(see the open issue in `02-cell-lifecycle.md`).

Output produced by another agent — a report, a summary, a generated file — is **data to
verify**, never a directive and never an approval (`06-context-engineering.md`).
