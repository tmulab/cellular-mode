# Cell: <name>

> Handoff package. Save as `handoffs/<cell-slug>.md`. An agent can generate this from a
> logged cell on request — everything below already exists in the cell file and the log.
> Keep it short: if it does not fit, the cell is too big and should be split along an
> interface (`docs/04-collaboration.md`).

## Contract

- **Provides:** <what is finished and usable at the end>
- **Consumes:** <what already exists and may be used, with exact paths>
- **Does NOT touch:** <the negative boundary — what must not be changed>

## Done criterion (binary)

- [ ] build + typecheck green
- [ ] <verifiable behavior 1>
- [ ] <verifiable behavior 2>

## Minimal context (≤10 lines)

<Only what the receiver needs in order to start. Exact paths. Links to docs instead of
prose summaries of them. Write it for a stranger: whatever lives only in a conversation
does not exist for them.>

## Suggested first step (<5 min)

<The same reconnection bait used inside the team: one concrete action, doable without
deciding anything first.>

## Settled decisions

<Short list, so they are not re-argued. Each one with its reason in a few words.>

## Protected resources this cell comes near

<Resources in `vault/policy.md` whose mutation requires explicit approval, and who gives
it. Reading is free; mutation and destruction are not.>

---

**Rules of engagement.** Questions about the *inside* of the cell are decided by whoever
is doing it. Questions about the **contract** are asked in writing and the answer is
recorded here. Never two people in the same cell. Integration happens when the done
criterion passes and the contract was respected — not by line-by-line review.

**Reporting back.** Reply in the same shape the method records: facts (files with exact
paths), decisions, gate status, next step. That report becomes the log entry when the
cell is closed.
