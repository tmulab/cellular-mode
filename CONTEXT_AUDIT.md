# Context audit

What an agent is forced to read before it can do anything useful, measured rather than
estimated. The method's central claim is that attention is the scarce resource; this file
is the evidence for or against that claim in this repository.

## 1. The four-level strategy

| Level | Files | Loaded |
|---|---|---|
| **1 · Bootstrap** | `AGENTS.md` | Always, unconditionally, by every agent |
| **2 · Procedures** | `skills/cell/SKILL.md`, `skills/pause/SKILL.md` | At the edges of a session: opening, resuming, pausing, completing |
| **2 · Procedures** | the seven engineering skills (`skills/{verify,protect,harden,sanity,coverage,port,decisions}`) | Only the one a task triggers, never as a set |
| **3 · Live state** | `vault/state/CURRENT-CELL.md`, then the one cell file it names | While working inside a cell |
| **4 · Reference** | `docs/*`, `vault/policy.md`, `vault/profile.md`, `handoffs/*` | Only when the topic is actually relevant, one file at a time |
| **4 · Reference** | the runtime documents: `docs/09-architecture.md`, `eip/*/README.md`, `eip/*/ACCEPTANCE.md`, `api/openapi.json`, `docs/adr/*`, `tools/gates/README.md`, `policy/relaxations.md` | Only when the cell is about the runtime, the gates or the architecture. **Never at bootstrap** |

Level 1 is a *router*, not a manual: the seven rules (so a context-starved agent still
behaves safely), where state lives, which procedure to follow when, and nothing else.
Level 4 is never loaded wholesale — "read `docs/`" is not an instruction anyone gives,
and `tests/bootstrap.test.mjs` fails if a skill ever starts giving it.

## 2. What is permanently loaded

- **`AGENTS.md`** — in every tool, by convention or by an adapter pointer. This is the
  only file the method requires to be always resident.
- **`CLAUDE.md`** — additionally, in Claude Code only, because that tool auto-loads it at
  session start. It is a 10-line pointer whose body is `@AGENTS.md` plus three sentences;
  it holds no rules of its own, so the two files together are still one bootstrap.
- **Skill front-matter descriptions** — Claude Code preloads the `name` and `description`
  of each discovered skill so it can match trigger phrases without opening the file. There
  are now **eleven** skills: the four lifecycle pointers (`cell`, `pause`, `celula`,
  `pausar`) and the seven engineering ones (`verify`, `protect`, `harden`, `sanity`,
  `coverage`, `port`, `decisions`). Only their one-line descriptions sit in context, never
  their bodies. VERIFIED in a live session: the harness listed all eleven by name and
  description. This is the only line item that grew in stage 2.
- **Nothing else.** No profile, no policy, no document, no state file is loaded until a
  procedure asks for it by name.

**No runtime or engineering document is in the bootstrap.** Stage 2 added the engineering
method (`docs/00`, `docs/05`, seven skills, `tools/gates/`, `policy/`) and the whole
"Everything Is a Plugin" runtime (`eip/`, `api/openapi.json`, `docs/09`, `docs/adr/`) — a
combined **2,464 lines / 150,276 bytes**, and **none of it loads at session start**. The only
trace it leaves in Level 1 is the six-line constitution summary that took `AGENTS.md` from 42
to 48 lines; the rest is Level 4, opened by name. The numbers below are the evidence.

## 3. Measured counts

### Method

All numbers below are **lines / words / bytes**, from `wc -lwc` (GNU coreutils) run at the root of each tree. Commands, verbatim:

```
# this repository
wc -lwc AGENTS.md CLAUDE.md
wc -lwc skills/cell/SKILL.md skills/pause/SKILL.md
wc -lwc vault/state/CURRENT-CELL.md vault/state/INDEX.md vault/state/cells/*.md
sed -n '/^description:/p' .claude/skills/*/SKILL.md | wc -lwc
ls -d .claude/skills/*/ | wc -l
wc -lwc docs/*.md docs/adr/*.md skills/*/SKILL.md
wc -lwc eip/*/README.md eip/*/ACCEPTANCE.md api/openapi.json tools/gates/README.md policy/relaxations.md

# the original private source tree (read-only, not part of this repository)
wc -lwc AGENTS.md CLAUDE.md vault/00-perfil.md SKILL-METODO-TMULAB.md
wc -lwc .claude/skills/celula/SKILL.md .claude/skills/pausar/SKILL.md
```

### Original always-loaded bootstrap

| File | Lines | Words | Bytes |
|---|---|---|---|
| `AGENTS.md` | 9 | 70 | 458 |
| `CLAUDE.md` | 58 | 435 | 3,035 |
| **Bootstrap subtotal** | **67** | **505** | **3,493** |

The original `CLAUDE.md` then **mandates two further reads**, so they are part of the
real cost of starting a session, not of Level 4:

| Mandated by the source bootstrap | When | Lines | Words | Bytes |
|---|---|---|---|---|
| `vault/00-perfil.md` ("read before the first task of each session") | every session | 43 | 333 | 2,124 |
| `SKILL-METODO-TMULAB.md` ("read and follow before any code task") | every code task | 1,085 | 7,508 | 50,442 |
| **Original effective per code session** | | **1,195** | **8,346** | **56,059** |

Adding the source's own two skills (`celula` 64/543/3,560 and `pausar` 45/363/2,516),
which were full procedures rather than pointers, the original worst case before a single
line of project code is read is **1,304 lines / 9,252 words / 62,135 bytes**.

### New always-loaded bootstrap — stage 2, re-measured

| File | Lines | Words | Bytes | Stage 1 |
|---|---|---|---|---|
| `AGENTS.md` | 48 | 566 | 3,916 | 42 / 425 / 2,865 |
| `CLAUDE.md` (Claude Code only) | 10 | 52 | 329 | unchanged |
| **Bootstrap subtotal** | **58** | **618** | **4,245** | 52 / 477 / 3,194 |
| + eleven skill `description` lines (Claude Code preload) | 11 | 380 | 2,610 | 4 / 135 / 929 |
| **New effective always-loaded** | **69** | **998** | **6,855** | 56 / 612 / 4,123 |

The `AGENTS.md` growth is exactly the six-line constitution summary plus the pointer to the
engineering skills — still a router, not a manual. The larger delta is the seven extra skill
descriptions: a Claude Code cost, not a method cost, and the reason the engineering skills are
pointers whose bodies stay on demand. On a tool with no skill mechanism the always-loaded
figure is the 58-line bootstrap.

### New per-task loads

| Level | Files | Lines | Words | Bytes |
|---|---|---|---|---|
| 2 | `skills/cell/SKILL.md` | 94 | 771 | 4,694 |
| 2 | `skills/pause/SKILL.md` | 80 | 617 | 4,039 |
| 2 | **both procedures** | **174** | **1,388** | **8,733** |
| 3 | `vault/state/CURRENT-CELL.md`, active-cell projection | 18 | 86 | 677 |
| 3 | the same file in its "no active cell" form (as committed here) | 5 | 17 | 85 |
| 3 | largest cell file in this repository | 18 | 232 | 1,738 |
| 3 | `vault/state/INDEX.md` (only when choosing a cell) | 13 | 119 | 779 |
| 2 | the seven engineering skills **in total** (never loaded together) | 672 | 5,257 | 32,681 |
| 4 | `skills/verify/false-green.md` (the catalogue behind one skill) | 199 | 1,955 | 11,670 |
| 4 | the ten `docs/*` files **in total** (never loaded together) | 1,363 | 12,816 | 82,019 |
| 4 | largest single document, `docs/05-engineering-rules.md` | 200 | 1,926 | 12,659 |
| 4 | `docs/09-architecture.md` (the runtime map) | 190 | 2,272 | 15,524 |
| 4 | the two ADRs | 171 | 1,429 | 9,385 |
| 4 | the runtime reference set: `eip/*/README.md`, `eip/*/ACCEPTANCE.md`, `api/openapi.json`, `tools/gates/README.md`, `policy/relaxations.md` | 974 | 9,291 | 63,781 |
| 4 | `templates/project-policy.md` → `vault/policy.md` | 199 | 1,446 | 9,091 |
| 4 | `templates/user-profile.md` → `vault/profile.md` | 90 | 703 | 4,392 |

### Comparison

| Measure | Original | Stage 1 | Stage 2 (now) | Change vs original |
|---|---|---|---|---|
| Always loaded (bootstrap only) | 67 / 505 / 3,493 | 52 / 477 / 3,194 | 58 / 618 / 4,245 | ≈ same size, but a router instead of a manual |
| Always loaded incl. skill descriptions | 67 / 505 / 3,493 | 56 / 612 / 4,123 | 69 / 998 / 6,855 | +2 lines / +3,362 bytes, for eleven procedures instead of two |
| Forced before a code task | 1,195 / 8,346 / 56,059 | 56 / 612 / 4,123 | 69 / 998 / 6,855 | **−94.2% lines, −87.8% bytes** |
| Worst case incl. procedures and live state | 1,304 / 9,252 / 62,135 | 266 / 2,318 / 15,271 | 279 / 2,704 / 18,003 | **−78.6% lines, −71.0% bytes** |
| Level 4 reference **available** but never auto-loaded | 0 (it was mandatory) | 1,204 / 9,372 / 62,743 | 2,996 / 27,640 / 180,338 | the whole stage-2 addition landed here |

The last row is the result worth stating plainly: stage 2 grew Level 4 by **1,792 lines**
(plus 672 lines of on-demand engineering procedures at Level 2) and left the bootstrap
essentially flat. Thirteen extra always-loaded lines bought a mandatory constitution, four
automated gates, an engineering skill set and a complete plugin runtime. That is the claim
the four-level strategy makes, measured rather than asserted.

The whole reduction comes from one change: the engineering law is no longer mandatory
reading. It became Level 4 (`docs/05-engineering-rules.md`, 200 lines) plus a per-project
parameter file, read when the topic is engineering policy and not before.

### A note on tokens

**No token counts appear in this document.** No tokenizer for the relevant models is
available in this offline environment, and a tokens-per-byte ratio copied from memory
would be a fabricated measurement presented as data. Bytes, words and lines are what
`wc` can prove. If you need tokens, run the measurement with the real tokenizer of your
model against the byte counts above.

## 4. Circular references

**The original had one.** `AGENTS.md` said "read `CLAUDE.md` in full — it is the canonical
entry file", while `CLAUDE.md` was itself the file the tool auto-loaded. An agent arriving
through `AGENTS.md` was sent to a file it already had, and an agent arriving through
`CLAUDE.md` had no reason to open `AGENTS.md` at all. The seven rules therefore lived in
`CLAUDE.md` and `AGENTS.md` was a stub — the tool-specific file had become the canonical
one, which is the opposite of agent neutrality.

**The new graph is acyclic.** `CLAUDE.md` → `AGENTS.md` → (`skills/*`, `vault/state/*`,
`docs/*`, `vault/policy.md`). `AGENTS.md` does not mention `CLAUDE.md`, or any other
tool's config file, and never will: `tests/bootstrap.test.mjs` asserts the absence of the
string. Stage 2 added no cycle: `docs/09-architecture.md` points at `eip/*/README.md` and
the ADRs, and nothing under `eip/` points back into the method. Every adapter is a leaf pointing inward, never pointed at. Duplication is bounded
by the same test: adapter files are capped at 15 lines, so no adapter can restate a rule,
and the root `.claude/skills/` tree is compared byte-for-byte against
`adapters/claude-code/.claude/skills/` so the two copies cannot drift.

## 5. Recovery after compaction or a new session

The protocol is designed so that losing the conversation costs almost nothing, because
the conversation was never the state. The recovery path is fixed and short:

1. `AGENTS.md` (always already there, or re-read — 48 lines).
2. The `cell` procedure, `skills/cell/SKILL.md` (94 lines).
3. The integrity guard, then `vault/state/CURRENT-CELL.md` (18 lines).
4. The one cell file it names (18 lines) → five lines of reconnection: cell, last fact,
   build status, NEXT STEP.
5. Execute the next step. Project source code enters context only because the next step
   names the file to open.

That is **178 lines of method and state** to be fully oriented, with the exact next
action in hand — and not one line of runtime, gate or architecture documentation. `node tools/cellmode/cli.mjs status` prints steps 3–4 in one command, and
`check` proves, before anything is trusted, that the log and its projections agree.

Two properties make this work, and both are enforced rather than hoped for:

- **The log is append-only** (`fs.appendFileSync`, proven by a mutation test), so a
  compacted or confused session can never shrink the record it is recovering from.
- **The next step is a <5-minute concrete action**, written while the context was still
  warm. "Run `npm test` and read the first error" survives compaction; "continue the
  refactor" does not.

The failure mode this guards against is the one the method was built for: a session that
ends without a record. The guard reports `log-shrunk`, refuses to continue, and asks for
the missing entries to be reconstructed and marked as such.
