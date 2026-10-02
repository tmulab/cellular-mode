# ADR <NNNN> — <short decision title>

> An **architecture decision record**: one decision, one file, never edited after it is
> accepted (superseded instead). Copy to `docs/adr/<NNNN>-<slug>.md`.
>
> Most decisions do not need one — a row in the settled-decision table of
> `vault/policy.md` is enough. Write an ADR when the decision shapes the architecture,
> when a future contributor will certainly question it, or when it excludes a plausible
> alternative that someone will propose again. Procedure:
> `skills/decisions/SKILL.md`.

- **Status:** proposed | accepted | superseded by ADR `<NNNN>`
- **Date:** `<YYYY-MM-DD>`
- **Decided by:** `<the responsible human>`
- **Scope:** `<what part of the system this governs>`

## Context

`<The forces at play, stated as facts rather than as a preference: the constraint, the
measurement, the failure that happened, the requirement that arrived. Label anything
uncertain — VERIFIED / INFERRED / PROPOSED / UNKNOWN — so a later reader can tell what was
known from what was assumed.>`

## Decision

`<One paragraph, in the imperative. "We will ..." — concrete enough that a reviewer can
tell whether a given change complies with it.>`

## Options considered

| Option | Trade-off | Verdict |
|---|---|---|
| `<the chosen one>` | `<cost accepted>` | chosen |
| `<a real alternative>` | `<why it was attractive>` | rejected — `<reason>` |
| `<another>` | `<...>` | rejected — `<reason>` |

Listing only one option is a sign this is not a decision but a rationalization. If there
genuinely was no alternative, say so explicitly and say why.

## Consequences

- **Follows from this:** `<what becomes easy, what becomes mandatory>`
- **Cost accepted:** `<what becomes harder, and the debt taken on knowingly>`
- **Affected:** `<modules, contracts, gates, documents that must change>`
- **Revisit when:** `<the concrete fact that would make this decision wrong>`

## Verification

`<How compliance is checked — a gate, a test, a static check, or "human review only",
named honestly. A decision with no check is a hope.>`
