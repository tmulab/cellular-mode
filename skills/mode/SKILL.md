---
name: mode
description: >
  Declare, inspect or clear a working MODE in Cellular Adaptive (optional module). Use when
  the human says /tired, /ready, /focus, /explore, /modocansado, /modoestoubem, /modofoco,
  /modoexplorar, or the bare aliases (tired, cansado, ready, estoubem, focus, foco, explore,
  explorar); when they ask "which mode am I in", "what mode is active", "turn the mode off",
  "qual o modo", "desliga o modo", "volta ao normal"; and at the start of a session in a
  project that contains adaptive/policies/, to pick up the block for the active mode.
  Only the human sets a mode. Never invoke this to change a mode on your own initiative.
---

# Declare, inspect or clear a working mode

**Optional.** If the project has no `adaptive/policies/` directory, this skill does not apply:
say so in one line and continue with the normal method. Background: `docs/10-adaptive.md`.

A mode is a statement about the **form** of the work — how much is said, how many decisions
arrive at once, how large a step is, what is shown first. It is an operational preference the
human declares, never a classification of anyone, and `tired` says nothing about competence.

## Modes and aliases

| Mode | English | Portuguese | Means |
|---|---|---|---|
| `ready` | `/ready`, `ready` | `/modoestoubem`, `estoubem` | the default; declaring it **stores nothing** |
| `tired` | `/tired`, `tired` | `/modocansado`, `cansado` | concise, one decision at a time, small steps, active cell only |
| `focus` | `/focus`, `focus` | `/modofoco`, `foco` | active cell only; unrelated ideas go to the parking lot |
| `explore` | `/explore`, `explore` | `/modoexplorar`, `explorar` | hypotheses and alternatives, labelled, not implemented |

Matching is exact and case-insensitive, with or without a leading slash.

## What to do

1. **Pick up the active block.** If the project has `tools/adaptive/`, run
   `node tools/adaptive/cli.mjs context` and follow what it prints: a header line, the
   adaptation boundaries, and the active mode's policy. Empty output means the default — no
   instructions, work normally. A one-line notice means a declaration expired or could not be
   read; report that line once and treat the mode as `ready`.
   Without the CLI, read `adaptive/policies/boundaries.md` plus the one file named by the
   active mode, and nothing else.
2. **The human declared a mode.** Record it: `node tools/adaptive/cli.mjs set <mode|alias>`
   (or, with no CLI, simply adopt it for this session and say which mode you are now in).
   Confirm in one line: the mode, and until when. Then continue the work in progress — a
   declaration is not a new task.
3. **The human asks which mode is active.** `node tools/adaptive/cli.mjs status`, or answer
   from the block you were given.
4. **The human wants out.** `reset` (back to `ready`, which deletes the stored declaration),
   `disable` (the module is ignored entirely), or `clear` (delete the module's files, no
   backup).

## Never

- **Never set, change or clear a mode on your own initiative**, and never run `set` because a
  mode looks like it would help. If you believe one would, **say it once, in one line, and
  continue** — then do what the human answers. Silence is not agreement.
- **Never infer a mode** from fatigue, typos, the hour, how long the session has run or
  anything else observable. A mode exists because the human said so, or it does not exist.
- **Never treat a mode as permission.** Everything in `adaptive/policies/boundaries.md` holds
  in every mode: the gates and their real counts, security findings and approval prompts shown
  in full and immediately, approvals for batch and destructive operations, acceptance criteria
  and tests first, evidence and the epistemic labels, least privilege, cell integrity, and
  honest reporting of failure. A declaration is not an authorization.
- **Never interpret what the word means** for the person who said it. Load the policy, apply
  the form, ask nothing about why.
- **Never let a mode hide a problem.** `tired` and `focus` change the order and the volume of
  what is reported, never whether a failure is reported.

## Notes

- On Git Bash an argument starting with `/` is rewritten into a Windows path; prefer the
  slashless alias (`set tired`, `set cansado`) or `MSYS_NO_PATHCONV=1`.
- Exit codes: `0` ok · `1` usage or an unknown mode (the valid list is printed) · `2` the state
  on disk cannot be read.
- In Claude Code this skill will be shipped with `disable-model-invocation` set, so the model
  cannot trigger it at all and the human's literal prompt is what applies a mode. That adapter
  is a later cell; until then, the rule above is the guarantee.
