# 01 · Philosophy

## In five lines

1. Work happens in **cells**: small units with an explicit boundary and a contract.
2. Stopping is not failing — it is the natural end of a cell. The protocol absorbs it.
3. Everything that matters becomes a record: **resumable ⟺ recorded**.
4. The path may be non-linear; the record is what makes the result converge anyway.
5. The agent holds global coherence so the human spends energy only on focus.

## The problem this solves

Agent-assisted development fails in three recurring ways, and all three are about
*continuity*, not about intelligence.

**Continuity across interruptions, sessions and agents.** Real work is interrupted:
a meeting, fatigue, a context window that compacts, a laptop that reboots, a different
tool opened tomorrow. When the only record of what was happening lives in the chat
transcript, every interruption costs a full re-explanation — and some of it is simply
lost. Cellular Mode moves the thread out of the conversation and into files: a session
can end at any moment, and the next session (possibly with a different agent, possibly
with a different human) reconnects from the same five lines.

**Cognitive load.** The usual way to "give context" to an agent is to dump everything:
the whole architecture, the whole backlog, the whole list of what is missing. That dump
is expensive for the model and paralysing for the person. The method inverts it: one
active cell, one boundary, one next step. Context is loaded in levels, on demand
(see `06-context-engineering.md`).

**Scope creep.** Agents are eager. Asked for X, they deliver X plus Y plus Z, each
plausible, none agreed. Reviewing that is harder than writing it. A cell makes the
boundary explicit and negative as well as positive — *in: A, B; NOT in: C* — so
expansion becomes a visible event that needs a human decision, not an accident.

## Principles

- **A boundary is cheaper than a correction.** Stating what is *not* in the cell costs
  one line and prevents an afternoon of rework.
- **Facts, not intentions.** The record holds what was actually done, with exact file
  paths, and the real error message — never an optimistic paraphrase.
- **The log is truth.** Everything else is a projection of it and can be rebuilt.
- **Closing is the valuable act.** The pause ritual is what makes the next start cheap;
  it is never treated as overhead to be skipped when tired.
- **Settled decisions stay settled.** A recorded decision is not re-argued without a
  new fact. This protects the human's attention more than any speed-up.
- **Verification beats assertion.** "The tests pass" is not an answer to "does it work?"
  (see `05-engineering-rules.md`).
- **Human authority at the boundaries.** Done, destructive, batch, and direction are
  human decisions. The agent prepares and waits.
- **Accessibility is structural, not a feature.** Variable energy, non-linear focus and
  interruption-friendliness are assumed as normal working conditions, for everyone. No
  diagnosis is involved, requested, or relevant (see `07-adaptation.md`).

## Methodology vs runtime architecture

Two different things carry the word "cellular", and conflating them has historically
caused confusion. This repository keeps them apart deliberately.

**The methodology** (what this repository *is*): a way of organizing work — cells, a
lifecycle, recorded state, two procedures, an approval boundary. It is implemented as
prose plus plain Markdown files, plus one small optional CLI that writes those files
deterministically. It has no server, no scheduler, no orchestration, no daemon.

**A runtime architecture** (what the methodology is *not*): an executable system in
which units of behavior are loaded, wired and composed at run time. The original
project that produced this method was built as an all-plugins application, and in that
project a cell of work happened to map one-to-one onto a plugin of the product.

That coincidence is the origin of the slogan **"Everything Is a Plugin"** — a bias toward
small units with declared interfaces, replaceable one at a time. This repository also
ships a **separate, optional, minimal plugin runtime** under `eip/` (see
[09-architecture.md](09-architecture.md)), for systems built *with* the method. The
methodology never requires it: cells, state and skills work with no runtime at all, and
the gates forbid Cellular Mode code from importing `eip/`. The runtime is for trusted
local plugins only and is not a security sandbox (see [SECURITY.md](../SECURITY.md)).

## A cell is not …

- **… a plugin.** A cell is a unit of *work*; a plugin is a unit of *software*. They may
  coincide in a given project (it is a pleasant alignment when they do), but the method
  works identically in a monolith, a notebook, a book manuscript or a Terraform module.
- **… an agent.** A cell has no behavior. It does not decide, run, or hold permissions.
  It is a boundary plus a record. Agents (and humans) *work inside* a cell; several
  different agents may work the same cell on different days.
- **… a psychoanalytic concept.** The method was created by someone who also works in
  another field, and some vocabulary travelled; the travel stops here. "Cell", "cut",
  "boundary" and "pause" are used in this repository in their plain engineering sense,
  with no therapeutic or theoretical claim attached. Keeping the concepts distinct is part
  of the method: borrowed metaphors should not smuggle in authority.

## Origins

The method was developed in Portuguese as **"Modo Celular"**, in production use on
research and software projects, and generalized into this English, project-agnostic
form. It comes out of **TMU-LAB — The Machine Unconscious Lab** (<https://tmulab.org>).

Two separable layers existed from the start and are still separable here: the **mode**
(cells, state, resumption, pacing — `02`, `03`, `06`, `07`) and an **engineering policy**
(gates, verification, data protection — `05`). The second is configurable and can be
replaced wholesale by your own house rules; the first is what makes the method a method.
Credits for ideas that influenced the policy layer are in `README.md` and
`THIRD_PARTY_NOTICES.md`.
