---
name: operation
description: >
  Open, monitor, amend or close an OPERATION in Cellular Mode — the human's unit of
  attention, inside which several cells may be active at once. Use whenever the human
  says "open an operation", "let's run a swarm", "several cells in parallel", "what is
  the operation doing", "close the operation", or the Portuguese equivalents ("abrir
  uma operação", "rodar em paralelo", "fechar a operação"). Use it BEFORE opening a
  second active cell: outside an operation there is only one.
---

# Open, monitor, amend or close an operation

One operation is ACTIVE at a time; inside it several cells may be 🔵, each a task with
its own boundary, done criterion and budget (`skills/cell/SKILL.md`). Outside one: one
🔵 cell — small projects never need this layer.

## 1. Opening — four declarations, asked ONE AT A TIME

Never as a wall of questions, and never filled in by you:

1. **Finish line** — what "finished" means, **frozen at opening** and fingerprinted.
   Discoveries go to `vault/state/parking-lot.md`; moving the line is a recorded
   decision. Resuming a ⏸ operation may not move it: a different fingerprint for the
   same slug is a refusal, not a new opening.
2. **Authorization pack** — closed vocabulary, below.
3. **Quality bar** — the ruler for what is otherwise subjective, written once.
4. **Planned cells** — the cells you may open on your own.

```
node tools/cellmode/cli.mjs op open "<name>" \
    --finish-line "a; b" --pack "..." --bar "..." --cells "<a>, <b>"
```

All four flags are required; this writes `vault/state/operations/<slug>.md`, the opening
log entry and the `CURRENT-CELL.md` header (VERIFIED 2026-10-24 by the cell that built
the `op` family, `tools/cellmode/README.md`; not re-run here).

## 2. The pack vocabulary is closed — six keys

`spend ceiling:` · `publisher:` · `batches:` (each `op → limit`; one with no limit is
rejected) · `requires-yes:` · `denied:` · `max-active-cells:`. Any other key is a
refusal carrying its own name (`PACK_UNKNOWN_GRANT`), not a warning. A pack **can**
grant, within the limits it states: the batches it names, the spend ceiling, and
publishing to the publisher it names. It can **never** grant: a destructive operation ·
mutating a protected resource · skipping a gate or a test · a ✔ on a cell · moving the
finish line · opening a cell it did not plan. Those are refused outright
(`PACK_FORBIDDEN_GRANT`): not authorizations, and a pack cannot make them ones. The
pack **expires with the operation**. Unestablished ⇒ UNKNOWN ⇒ ask.

## 3. Naming the conflicts before each parallel opening

Mandatory, at two levels, and the sentence belongs in the log entry of the opening:

- **Mechanical:** cross the candidate's boundary, dependencies and inputs/outputs
  against every 🔵 cell and the shared resources the pack names. The same file in two
  boundaries is a refusal; a shared resource is a warning to declare.
- **Semantic:** read both cell files and name what no crossing sees — "A rewrites the
  JSON that B reads" — or say **"none"**. Saying nothing is not an option.
- The mechanical crossing is **PROPOSED** (not built): until it lands, both are by hand.

## 4. Amendments

A cell outside `Planned cells` is not yours to open: it needs the human's yes, recorded
as a pack amendment.

```
node tools/cellmode/cli.mjs open "<new cell>" --in "..." --out "..." \
    --next "..." --amend-pack --confirm
```

`--amend-pack` without `--confirm` is refused (exit 5): the flag is the human's "yes",
never your judgement. The amendment adds the slug to `Planned cells` and **never**
touches the finish line or its fingerprint. Raising the ceiling or widening the pack is
the same move: ask, then record. `resume` takes the same two flags.

## 5. Monitoring and closing

```
node tools/cellmode/cli.mjs op status   # finish line, fingerprint, pack, spend/ceiling, cells
node tools/cellmode/cli.mjs status      # the 🔵 cells themselves
node tools/cellmode/cli.mjs op pause [name] --facts "..." --next "..."
node tools/cellmode/cli.mjs op complete [name] --facts "..." --confirm
```

Report in a few lines and nothing else: finish line, cells 🔵 of the ceiling, spend of
the ceiling, one next step per cell.

`op pause` and `op complete` **refuse while any cell of the operation is 🔵** (exit 3):
no cascade — a pause nobody wrote is fiction, so each cell is paused first with its own
facts and next step (`skills/pause/SKILL.md`). `op complete` needs the human's explicit
confirmation, like a ✔ on a cell. Opening, pause, completion and amendment each append
a log entry; an operation with no entry does not exist next session.

## Never

- Never open a second operation, and never widen the finish line, ceiling or pack alone.
- Never infer a declaration from context — an unasked declaration is UNKNOWN.
- Never let a pack stand in for a human yes it cannot grant.
- Never ask a worker for what the pack denied (`skills/worker/SKILL.md`).
