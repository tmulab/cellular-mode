# Orchestration — agents reach capabilities through one door

A cell is not a plugin. A plugin is not an agent. This directory holds the
smallest thing that lets an agent use the runtime without becoming part of it:
`createAgentGateway`. It imports the kernel's **public entry** and the SDK, and
nothing else — the gateway is a *client* of the kernel, not a piece of it.

```js
import { createKernel } from '../kernel/index.mjs';
import { createAgentGateway } from './index.mjs';

const gateway = createAgentGateway(kernel, {
  agentId: 'summariser-1',
  role: 'reader',                              // what it is FOR
  allow: ['text.stats#count-words'],           // what it MAY DO
  approver: askTheHuman,                       // who may CONSENT (host-supplied)
});

await gateway.call('text.stats', 'count-words', { text });
gateway.audit(); // [{ agentId, role, key, cap, decision, code?, at }]
```

## Four words people use interchangeably, kept apart

| Term | What it is | Where it lives | Grants anything? |
|---|---|---|---|
| **Role** | what an agent is *for* — a label for humans reading an audit (`reader`, `archivist`) | gateway option, copied into every audit entry | **No.** A role is a description, never an authority |
| **Capability** | one callable contract, `key#cap`, with input/output schemas and a `consequential` flag | plugin manifest, enforced by the kernel | **Yes**, and only when the allow-list names it exactly |
| **Workflow coordination** | ordering several calls, retrying, branching, compensating | **nowhere** — PROPOSED | — |
| **Decision authority** | consenting to an act that leaves a trace in the world | a human approver the **host** supplies to the gateway | **Yes**, and never an agent |

The separation is the design. Roles are for accountability, not permission: two
agents with the same role and different allow-lists can do different things, and
an agent whose role sounds powerful can still do nothing. Authority is a list of
capabilities; consent is a human.

## What is implemented (VERIFIED)

- **Allow-list enforcement.** Anything not listed as `key#cap` returns
  `PERMISSION_DENIED` and never reaches the kernel. An empty list denies
  everything; a malformed entry is a `TypeError` at construction, so a typo is
  never a silent wall.
- **Consequential calls need a human.** The gateway reads the capability's
  `consequential` flag from the kernel's public metadata and asks its approver,
  passing `{key, cap, input, agentId, role}` so the person can see *who* is
  asking. No approver ⇒ `APPROVAL_REQUIRED`; a refusal or a throwing approver ⇒
  `APPROVAL_DENIED`. The call stops before the kernel in both cases.
- **The agent cannot approve itself.** An `approval` field in the agent's call
  options is dropped — not neutralised later, dropped — and what reaches the
  kernel is provenance only: `{requestedBy, role, approvedBy}`. The kernel's own
  approver (host policy) still decides.
- **A complete audit.** One entry per call, `decision` ∈
  `allowed` / `denied` / `approval-required`, with the error `code` when there is
  one. `audit()` returns a copy of frozen entries: an audit a caller can edit is
  not an audit. `approval-required` is kept distinct from `denied`, because "no
  human has decided yet" and "this agent may not" are different facts.

Criteria, tests and the mutation verdict: [ACCEPTANCE.md](ACCEPTANCE.md).

## What is NOT implemented (PROPOSED)

Named here so nobody mistakes an idea for a feature. None of this exists in code:

- **Multi-step workflows** — a declared sequence of capability calls with
  retries, compensation and partial failure semantics. The hard part is not the
  loop; it is that a workflow which half-ran must say exactly what it did, and
  every consequential step still needs its own human verdict.
- **Planners** — an agent deriving its own sequence of calls. The open question
  is authority: a plan is only as safe as the allow-list it is drawn from, and a
  planner that can widen its own allow-list is not a planner, it is an escalation.
- **Multi-agent coordination** — several agents sharing state, delegating,
  or negotiating. Delegation would need a way for one gateway to lend authority
  to another without creating a path that outlives the human who opened it.
- **Durable audit** — the trail is in memory and dies with the process. A real
  deployment needs it appended somewhere that survives a restart.

Until each of those is built with its own acceptance criteria and mutation
verdict, they are PROPOSED, and this file is the only place they exist.
