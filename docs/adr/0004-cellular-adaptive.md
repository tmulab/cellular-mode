# ADR 0004 — Cellular Adaptive is an optional module of declared-only modes, with an invariant floor

- **Status:** **Accepted — APPROVED by Hudson A. R. Bonomo on 2026-10-03.**
- **Date:** 2026-10-03 (proposed and approved the same day)
- **Deciders:** Hudson A. R. Bonomo (author, approving); implementation agent (proposer)
- **Scope:** `tools/adaptive/`, `adaptive/policies/`, `.cellular/adaptive/`, and the
  optional hooks and Observer integration that later cells add
- **Relates to:** [ADR 0002](0002-zero-dependency-kernel.md) (zero runtime dependencies),
  [ADR 0003](0003-observer-frontend.md) (an optional reader never becomes load-bearing),
  `docs/07-adaptation.md` (the profile layer, and why no diagnosis is involved)

## Context

The method already assumes variable energy, non-linear focus and interruptions that arrive
without warning (`docs/07-adaptation.md`). What it does not have is a way for the human to
say, mid-session and in one word, *how they want to be worked with right now* — and to have
that honoured without re-explaining it every time.

The risk is obvious and it is the reason this needs a decision rather than a feature. A
system that adapts to a person is one short step away from a system that *judges* a person:
an observation becomes a trait, a trait becomes an identity, and a convenience setting
becomes a stored fact about somebody. The MDAA research programme names that exact failure
mode and spends most of its length blocking it; `docs/10-adaptive.md` maps which of its
principles we borrowed, with the explicit label that transferring them from education to
software engineering is **ours**, **INFERRED** and **experimental**.

A second risk is structural: an "adaptive" layer that becomes load-bearing would make the
method itself untestable, because every behaviour would depend on an invisible setting.

## Decision

1. **An optional module.** `tools/adaptive/` and `adaptive/policies/` can be deleted with
   no effect on the method, the CLI, the gates, the runtime or the Observer. The import
   direction is a gate rule (`adaptive-is-optional-and-isolated`), not a convention.
2. **Declared-only modes.** Four modes — `ready` (default), `tired`, `focus`, `explore` —
   each with Portuguese aliases. A mode is set **only** by an explicit human command. There
   is no detection, no scoring, no classification and no code path that picks a mode from
   observed behaviour; the prohibition is itself a test (AD26).
3. **An invariant floor, as data.** `INVARIANTS` lists what no mode changes: gates,
   security findings, approvals, tests and acceptance criteria, evidence and epistemic
   labels, least privilege, cell integrity, honest reporting of failure. `ADAPTABLE` lists
   what a mode may change: presentation and granularity. Neither list has a per-mode
   override.
4. **State outside the vault.** `.cellular/adaptive/` (already git-ignored), never
   `vault/`: the authoritative cell log must not carry a temporary preference. Preferences
   may never contain a mode or any condition key — the validator refuses them by name.
5. **A declared TTL, default 4 hours** (bounds 0.5–12), evaluated on read, displayed with
   the mode, and frozen before use. Expiry returns to `ready` with a one-line notice. The
   window is declared, never estimated from anything.
6. **Hooks are opt-in.** The Claude Code integration ships as a documented settings file an
   adopter installs deliberately, because a hook runs commands automatically; cloning this
   repository must never enable that silently.
7. **No classification, ever.** Nothing about a person is stored, no history is kept,
   returning to `ready` deletes the session file, and `clear` removes everything.

## Options considered and rejected

### A · Infer the mode from signals (rejected, on principle)

Session length, error rate, typing cadence, time of day. Cheap to implement and the single
most dangerous thing this module could do: it would turn an observation into a trait, store
it, and act on it — without the person ever saying anything. It also fails on its own terms,
since none of those signals identifies the thing it would claim to measure. Rejected
outright, and the rejection is enforced by a test rather than remembered.

### B · Put the mode in `vault/profile.md` or `vault/state/` (rejected)

The vault is the authoritative, append-only record of the work. A declaration that is true
for one afternoon does not belong in the file that must still be true next year, and a
profile is exactly where a temporary state would quietly become a permanent label. Hence a
separate, git-ignored directory, and a preference validator that refuses condition keys.

### C · One policy document for all modes (rejected)

Simpler to write, worse to use: injecting all four descriptions costs context on every
session and tells the agent about three modes that are not active. Only the active policy
plus the boundaries file is ever loaded.

### D · Let the agent set the mode when it seems appropriate (rejected)

This is option A wearing a different hat. The system may know what it would suggest and
still lack the standing to act on it; the human declares, the system honours. What the agent
*may* do is offer `/pause` or mention that a mode is available.

### E · A mode that relaxes a rule "when the human is tired" (rejected)

The feature everyone eventually asks for, and the one that destroys the module's value. A
tired human needs the gates **more**, not less. Fatigue is a reason for smaller steps, not
for weaker verification, and `tired` says nothing about anyone's ability.

## Consequences

- Two new top-level surfaces (`adaptive/`, `tools/adaptive/`), both optional, both
  zero-dependency, both inside the 200-line rule.
- The boundary gate gains one rule, and `eip/plugins/adaptive-*` is left outside it so that
  cell 5 can grant a **named** allowlist in one place. Until then such a plugin is still
  refused by the ordinary plugin rule — the exception is fail-closed.
- Whether an agent *actually* follows a policy text is model-dependent and not enforceable
  here. The module records the `source` of every mode change so the question is auditable
  after the fact; `docs/10-adaptive.md` states this as a limit, not as a guarantee.
- The MDAA debt is conceptual only. No formalism, no code and no figure is reproduced, and
  no empirical claim is made in anyone's name.

## What this does NOT decide (PROPOSED only)

A writable mode selector in the Observer, a history of declarations, per-project policy
overrides, and any adjustment of the policies *by* the system (the MDAA layer-6 question).
None exists. The last one would need its own ADR and, by the programme's own standard, a
derivation a person can read in one sentence — which is not available today.
