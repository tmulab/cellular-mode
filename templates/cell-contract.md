# Cell contract: <name>

> Written **before** any code. Copy to `vault/state/cells/<slug>.md` (short form), or
> keep the full worked form here for a cell whose verification deserves it.
> Delete every section you have nothing to put in — an empty heading is noise.

## Header

```
**ID:** <slug>
**Area:** <package or topic>
**Opened:** <YYYY-MM-DD> · **Status:** 📋 | 🔵 | ⏸ | ✔
**Objective:** <one sentence>
**Boundary:** in: <...> | NOT in: <...>
**Inputs:** <what already exists and may be used, exact paths>
**Outputs:** <what is finished and usable at the end>
**Allowed operations:** <...> · **Prohibited operations:** <...>
**Dependencies:** <other cells, services, data>
**Done criterion (binary):** <gates green + behavior X observable>
**Last fact:** <with exact file path>
**Build/typecheck:** green | red (<one-line error>)
**Decisions:** <short list — never re-argued without a new fact>
**Open issues:** <...>
**Minimal context (≤5 lines):** <only what is needed to reconnect>
```

## ➜ NEXT STEP (doable in <5 min, without thinking)

<ONE concrete action. Good: "run `npm test` and read the first error."
Bad: "continue the refactor.">

---

# The worked contract

For cells where "did it work?" is a real question, the sections below turn the cell into
a verifiable claim. Fill them in **before** writing code
(rationale: `docs/05-engineering-rules.md` §1).

## The question

> *<The human question this cell exists to answer, in one sentence — even if it is not
> machine-testable. Example: "can a tired person look at this page and know where they
> are in ten seconds?">*

State plainly which part of that question is **not** testable by machine, and what the
**necessary condition** is that this contract actually covers. A cell that confuses the
human question with its mechanical proxy will declare victory too early.

## Pre-committed decisions (not to be reopened during the cell)

1. *<decision — and the one-line reason, so it is not re-argued>*
2. *<decision>*
3. *<decision>*

These are settled. If a new fact appears that genuinely challenges one, say so
explicitly, name the decision, and ask — do not quietly re-decide.

## The fixture (realistic data)

Path: `<path to the fixture>`

Describe what makes it look like production rather than `foo`/`bar`: the awkward shapes
it includes on purpose, the traps it reproduces from the real input (more than one table,
both linked and unlinked rows, accents, hyphenation, a success status carrying an error
in the body), and the variant used for the degraded case.

## Declared expected scope — written BEFORE running

| What | Expected value |
|---|---|
| *<items parsed>* | *<exact number>* |
| *<counts per category>* | *<exact values>* |
| *<a string that must appear>* | *<the exact string>* |
| *<response status / content type>* | *<exact>* |
| *<events per write>* | *<exactly 1>* |
| *<writes to the target>* | *<0 bytes, 0 files>* |

Exact values where the result is deterministic; ranges and invariants where it is not. If
you cannot fill this table, you do not understand the feature yet.

## Acceptance criteria (mechanical)

### C1 · <short name>

```
<the assertion, as close to runnable as possible>
```

**Red without the fix:** *<the mutation that makes this criterion fail, and the failure
that is observed — "parser stops at the first table → returns 3 instead of 6".>*

### C2 · <short name>

```
<assertion>
```

**Red without the fix:** *<mutation → observed failure>*

*(Repeat per criterion. Each one needs its own mutation; a criterion that has never been
red verifies nothing. The mutation must **remove** the mechanism, not merely weaken it —
weakening often still passes green, which is a false proof.)*

## File split (respecting the line limit)

| File | Responsibility | Criteria covered |
|---|---|---|
| `<path>` | *<one responsibility>* | C1 |
| `<path>` | *<one responsibility>* | C2–C5 |
| `<path>` | tests, fixture, red-proof | C1–C6 |

---

# Verdict — <date>, cell closed ✔ | ⏸

**Works:** *<"I ran [the real function] over [the realistic data]; the output fell inside
the declared scope above; and I proved each criterion goes red without its fix." Say what
was mocked, and why it was genuinely external.>*

**Gates:** *<typecheck · build · tests, with real numbers>*

**Proofs of red (one mutation per criterion, restored afterwards):**

| | Mutation | Red observed |
|---|---|---|
| C1 | *<mutation>* | *<observed failure>* |
| C2 | *<mutation>* | *<observed failure>* |

**Findings:** *<what the cell taught that was not expected — including mutations that
turned out to be too weak to prove anything, and defects only the real run exposed.>*

**Declared choices (not hidden debt):** *<what was deliberately left out, and what is
implemented but not covered by any criterion.>*
