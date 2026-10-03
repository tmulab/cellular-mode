# adaptive

A small, dependency-free module that lets **you** say how you want to work right now, and
lets an agent adjust the *form* of the collaboration accordingly.

**Optional and experimental.** Cellular Mode works unchanged without it: delete
`tools/adaptive/` and `adaptive/` and the method, the CLI, the gates, the runtime and the
Observer behave exactly as before. That is enforced by an import rule
(`adaptive-is-optional-and-isolated` in `tools/gates/boundaries.mjs`), not by convention.

Node >= 18, built-ins only, ESM. Background and the MDAA reference map:
[`docs/10-adaptive.md`](../../docs/10-adaptive.md) ·
decision: [ADR 0004](../../docs/adr/0004-cellular-adaptive.md) ·
criteria: [`ACCEPTANCE.md`](ACCEPTANCE.md).

```
node tools/adaptive/cli.mjs <command> [--root <dir>]
```

- `--root <dir>` — project root; state lives in `<root>/.cellular/adaptive/`. Default: the
  current directory.
- `ADAPTIVE_NOW="2026-10-03T14:02:00.000Z"` — fixes the clock, for tests and reproducible
  examples. It must be a full ISO 8601 instant **with a zone**; anything else is a usage
  error rather than a guess.

## Commands

| Command | Effect |
|---|---|
| `status` | What the effective mode is and why. Reads only — it creates nothing. |
| `set <mode\|alias>` | Declare a mode. `ready` stores **nothing**: it deletes the state file. |
| `reset` | Back to `ready`. The same transition as `set ready`. |
| `enable` | Turn the module back on. |
| `disable` | Honour nothing and inject nothing; the stored declaration is kept, not deleted. |
| `clear` | Delete `session.json` and `preferences.json`, with no backup. |
| `context` | Print the compact block for the **active** mode. Empty for the default. |
| `help` | Usage, including the alias table. |

**Exit codes:** `0` ok · `1` usage, bad arguments or an unknown mode (the valid vocabulary is
printed) · `2` the state on disk cannot be read as a declaration, or a policy file is missing.

`--root` is accepted **before or after** the command (`--root X set tired` and
`set tired --root X` both work), as `--root=X` too.

> **Git Bash / MSYS note.** A bare argument that starts with `/` is rewritten into a Windows
> path by the shell, so `set /tired` can arrive as a path inside the Git installation
> directory and be refused as an unknown mode. Use the slashless spelling (`set tired`,
> `set cansado`) or prefix the command with `MSYS_NO_PATHCONV=1`. Both spellings are
> equivalent everywhere else.

## Modes and aliases

| Mode | Commands | Stored? |
|---|---|---|
| `ready` | `ready`, `/ready`, `modoestoubem`, `estoubem` | never — it is the absence of a declaration |
| `tired` | `tired`, `/tired`, `modocansado`, `cansado` | yes, with a window |
| `focus` | `focus`, `/focus`, `modofoco`, `foco` | yes, with a window |
| `explore` | `explore`, `/explore`, `modoexplorar`, `explorar` | yes, with a window |

Matching is exact and case-insensitive, with or without one leading slash. The word is
yours: the module never interprets what it means, it only loads the matching policy text
(`adaptive/policies/<mode>.md`, read on demand, together with
`adaptive/policies/boundaries.md`).

## Files

| Path | Written by | Holds |
|---|---|---|
| `.cellular/adaptive/session.json` | `set`, `reset` | the current declaration: mode, `declaredBy`, `source`, the command **as typed**, `activatedAt`, `expiresAt`, `scope` |
| `.cellular/adaptive/preferences.json` | `enable`, `disable`, or your editor | `schema`, `enabled`, `ttlHours`, optional `communication` |
| `.cellular/adaptive/injected.json` | nothing yet | reserved for the context-injection cache of a later cell |

`.cellular/` is git-ignored, so a declaration cannot be committed by accident. The state is
deliberately **outside `vault/`**: the vault is the authoritative, append-only record of the
work, and a preference that is true for one afternoon does not belong in it. Every CLI test
hashes `vault/` before and after the command.

Writes are **atomic** (temporary file + rename), so a reader on the hot path of a prompt
never meets half a document. Paths are confined: everything resolves under
`<root>/.cellular/adaptive/` or the write is refused.

## Validity, and what happens when it runs out

A declaration carries its own window. The default is **4 hours**, with bounds **0.5 to 12**;
set `ttlHours` in `preferences.json` to change it. The window is **declared, never
estimated** — nothing here measures how long anyone should feel anything.

Expiry is evaluated **on read**, and the window is half-open: at exactly `expiresAt` the
declaration is already over. Five situations stay distinguishable, because collapsing any two
of them would tell you something untrue:

| Standing | Means | Effective mode | Says something? |
|---|---|---|---|
| `none` | nothing was declared | `ready` | no — an absence is not an event |
| `active` | inside its window | the declared mode | no |
| `expired` | the window has closed | `ready` | yes: one line naming what expired and when |
| `invalid` | the file cannot be read as a declaration | `ready` | yes: one line naming the file and the reason |
| `disabled` | you turned the module off | `ready` | no |

A malformed file is **never** repaired, deleted or read as an absence. It is yours.

## The injected block, measured

`context` prints one header line (mode, when it was declared, until when, through which door),
then `adaptive/policies/boundaries.md`, then **only** the active mode's policy. Titles and
blank lines are dropped; nothing is reflowed, reordered or summarised. The budget is
**2048 bytes** and over it is an error, never a truncation — half an instruction block still
looks authoritative.

Measured on 2026-10-03 with `node tools/adaptive/cli.mjs context | wc -c` (bytes, **not**
tokens; the trailing newline is excluded). `tools/adaptive/cli-context.test.mjs` asserts that
this table is what the code produces, so it cannot drift:

| Active mode | Block bytes | Of the 2048 budget |
|---|---|---|
| `tired` | 1999 | 98% |
| `explore` | 1963 | 96% |
| `focus` | 1878 | 92% |
| `ready`, or none, or disabled | 0 | the default needs no instructions |

An expired or unreadable declaration prints only its one-line notice (~75 bytes).

## What this module costs in context

Measured on 2026-10-03 with `wc -c`, bytes rather than tokens, because bytes are what the files
actually are. The module is optional, so **every number below is zero if you do not use it.**

| Where | Bytes | Paid |
|---|---|---|
| `AGENTS.md` (Level 1), before → after | 3916 → 4365 | **+449**, once per session, every session |
| `skills/cell/SKILL.md`, before → after | 4974 → 5335 | **+361**, only when a cell is opened or resumed |
| The 8 Claude Code skill names + descriptions | 1932 | once per session, if `.claude/skills/` is installed |
| `skills/mode/SKILL.md` | 4708 | only when a mode is actually declared or asked about |
| The injected block, per turn, **unchanged mode** | **0** | nothing is reprinted; `hook.test.mjs` asserts the empty output |
| The injected block, per turn, on a change | 1878–1999 | once, on the turn the mode changes (or at `SessionStart`) |

The two recurring costs are the Level-1 lines (+449 bytes) and, with the Claude skills
installed, the 1932 bytes of names and descriptions the harness lists. Everything else is
on-demand. Removing the module returns all of it.

## Retention, clearing and privacy

- **Nothing about a person is stored.** `session.json` holds a word you typed and a window.
- **Returning to `ready` deletes the file.** There is no record that you once declared
  anything.
- **No history.** Past declarations are not accumulated anywhere, by design.
- **`preferences.json` can never hold a mode or any condition key.** The validator refuses
  `mode`, `condition`, `tired`, `focus`, `explore`, `declaredBy`, `expiresAt` and the rest by
  name (`FORBIDDEN_PREFERENCE_KEYS` in `schema.mjs`), with its own error message. A
  temporary declaration that could become persistent would stop being temporary.
- **`clear` keeps no backup.** It is your data; a hidden copy would defeat the point.
- **Local only.** No network, no telemetry, no external URL.
- **No detection of any kind.** A mode exists because you declared it. There is no code path
  that picks one from timing, error counts, session length or anything else, and a test
  asserts the absence rather than trusting it.

## What no mode changes

Gates and their real counts, security findings, approvals for batch and destructive
operations, tests and acceptance criteria, evidence and the epistemic labels, least
privilege, cell integrity, and honest reporting of failure. The list is data —
`INVARIANTS` in `modes.mjs` — and `adaptive/policies/boundaries.md` is the text injected with
every active mode. Declaring a mode is **not** an authorization.

## Modules

| Module | Responsibility |
|---|---|
| `modes.mjs` | the registry, the alias vocabulary, `INVARIANTS`, `ADAPTABLE`. Pure. |
| `schema.mjs` | strict validators for both files, structured errors, no throws. Pure. |
| `validity.mjs` | standing and effective mode. Pure — `now` is a parameter. |
| `transitions.mjs` | `declare` and `reset`: what to store, or nothing at all. Pure. |
| `context.mjs` | the compact block an agent receives: boundaries + the active policy, capped. Pure. |
| `io.mjs` | the only module that touches a disk. Confined, tolerant, atomic. |
| `commands.mjs` | one function per command; returns lines and an exit code, reads no clock. |
| `errors.mjs` | the three exit codes and the error that carries one. |
| `main.mjs` / `cli.mjs` | usage, arguments, dispatch and entry point; the only reader of the clock and the environment. |
| `types.mjs` | the typedefs. No runtime code. |

Who may change a mode is **the human**. The CLI is reached from a terminal you are sitting
at, and it records `source: 'cli'` on every write so that a declaration nobody made is
visible afterwards. An agent is instructed never to run it; that instruction is not
enforceable here, which is precisely why the provenance is recorded.
