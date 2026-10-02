# Epistemic spec — <project name>

> **Optional.** This scaffold matters for projects whose *domain* can be got wrong in ways
> no type checker notices: a specialized vocabulary, operating modes that change what a
> correct answer even is, or a product whose meaning a generic paraphrase destroys. Most
> projects can ignore this file entirely. Delete it if it does not earn its place.
>
> Copy into your project (for example as `vault/epistemic-spec.md`) and fill in. Keep it
> next to the engineering policy, referenced from `vault/policy.md`, and load it only when
> the task actually touches the domain.
>
> Rationale: `docs/05-engineering-rules.md` §8. The agent-side counterpart — the agent's
> own working vices — lives in `vault/policy.md`, not here.

## Operating modes

Some systems behave in named modes, and the same code can be **semantically wrong** in one
mode while being right in another. List them, and say what each one changes.

| Mode | What it means | What changes in this mode |
|---|---|---|
| `<MODE_A>` | `<one sentence>` | `<which outputs, which vocabulary, which guards>` |
| `<MODE_B>` | `<one sentence>` | `<...>` |

**Obligation:** before implementing anything that produces domain output, state which mode
it operates in. If the answer is "all of them", say why that is safe.

## Semantic restrictions by context

Terms, patterns or framings that are **required** or **forbidden** in a given context.
These are not style preferences; they are correctness.

| Context | Required | Forbidden | Why |
|---|---|---|---|
| `<a surface, a persona, a document type>` | `<terms that must appear>` | `<terms that must not>` | `<what breaks otherwise>` |

**Obligation:** check every user-facing string against this table before delivery, not
after.

## Domain epistemic errors

These are **not bugs**. They are biases: ways a model reliably misreads this domain, so
that the code is correct and the output is still wrong. Record each one as
**Manifestation / Cause / Guard**, and add a guard in code wherever a guard is possible.

### Domain epistemic error: <descriptive name>

- **Manifestation:** `<what the output looks like when this happens>`
- **Cause:** `<why a model gets this wrong — what it is generalizing from>`
- **Guard:** `<the explicit check, prompt constraint, validation or test that prevents it>`
- **Detected:** `<date, brief context>`

*(Repeat per error. An entry without a Guard is an open issue, not a record.)*

## When to propose an update to this file

- You detect an error pattern that is **not technical** — the code does what it says and
  the result is still wrong for the domain.
- The human reports a bias, a plausible-sounding fabrication, or a flattening of meaning.
- A new mode, surface or vocabulary enters the product.

Propose the entry in the format above and wait for approval: this file is a statement about
the domain, which is the human's authority, not the agent's.

## What does NOT belong here

- Technical bugs and their regression tests — those are ordinary engineering.
- The agent's working vices (automatic agreement, inflated delivery, re-asking a settled
  decision) — those go in `vault/policy.md`.
- Settled product decisions — those go in the settled-decision table.
