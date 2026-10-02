---
name: decisions
description: >
  Extract and honour settled decisions before proposing anything new. Use whenever the
  human attaches history — a transcript, an old plan, a long conversation, a prior
  session's notes — at the start of a session; after a context compaction; before asking
  any question that might already be answered; and when the human says "we already
  decided this", "I told you that", "stop asking me again".
---

# Decisions — inventory first, proposals second

When the human attaches history, the natural move is to read it "to understand context".
That is the wrong goal and it produces the worst failure of a long project: **late
vibecoding**, where an agent reopens a dozen closed questions because its own context was
summarized.

> **Read the history to EXTRACT DECISIONS, not to understand context.**

## 1. The procedure

1. Scan the attached material for **decision markers** (§2).
2. Build a **numbered list** of the settled decisions, each with what was decided and —
   when the source says it — when, by whom, and why.
3. Show the list **before** proposing anything new, and state plainly which decisions are
   still open.
4. Treat everything on the list as **non-negotiable**: never ask again, never offer an
   alternative, just execute.
5. Append anything genuinely new to the project's settled-decision table in
   `vault/policy.md` as it closes.

## 2. Decision markers to look for

- `[DECISION]`
- a heading of the form `## Decision`
- "we decided that…"
- "settled:"
- "confirmed:"
- and the informal equivalents: "let's go with X", "X it is", "do it the X way"

Also treat as settled: anything already recorded in the project's settled-decision table,
anything in an architecture decision record, and anything in a closed cell's **Decisions**
field (`docs/03-state-and-memory.md`).

## 3. The anti-pattern, and the correct shape

Wrong — the human attaches 800 lines containing twelve settled decisions, and the agent
answers:

```
Before starting I need to decide six things: A, B, C, D, E, F.
```

…where three of the six were settled in the attached text. Six questions at once also
means planning was skipped (`docs/05-engineering-rules.md` §10).

Right:

```
Read the history. Decisions already settled, which I will follow:
 1. <decision>
 2. <decision>
 ... 12. <decision>
Still open, and I need you for them: A, B.
```

## 4. Revisiting a settled decision

Allowed, but only **explicitly**, and only with a new fact:

> Decision 7 was settled on <date>, per <source>. I see a new problem: <problem>. Worth
> revisiting?

Never by pretending not to remember. And never silently: quietly re-deciding is the same
defect wearing a politer face.

## 5. The epistemic error behind all of this

**"A context compaction is permission to re-decide."** False.

> **Compaction removes memory, not obligations.**

A decision recorded in the log is exactly as binding after a compaction as before it. When
citing a prior decision, **cite the source** ("per the log entry of <date>"); with no
citable source, label the claim INFERRED or UNKNOWN and ask
(`docs/00-constitution.md`, Article 3).

## 6. When a decision deserves its own record

Most decisions belong in the project's settled-decision table — one row, one line. A
decision that shapes the architecture, that future contributors will question, or that
excludes a plausible alternative deserves a standalone record with its context,
consequences and the options rejected: `templates/adr.md`.
