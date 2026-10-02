# 00 · Mandatory Engineering Constitution

Seven articles, given by the responsible human, binding on every agent and every
contributor working under this method.

They are **not** parameters. `docs/05-engineering-rules.md` is a map of procedures and
`vault/policy.md` holds values that each project tunes; this file holds the floor those
two stand on. A project policy may **strengthen** an article — stricter limits, more
gates, narrower permissions. It may never quietly weaken one.

> **Relaxation clause.** A deviation from any article is admissible only when it is
> **(a) explicit** — written as a deviation, never inferred from silence;
> **(b) justified** — with the reason and the risk being accepted;
> **(c) documented** — dated and naming the article, in `vault/policy.md` for an adopting
> project, or in `policy/relaxations.md` for this repository; and
> **(d) approved by the responsible human**, in the conversation, in writing.
> A deviation missing any of the four is not a deviation. It is a defect.

The constitution is summarized in six lines in `AGENTS.md` (Level 1) so that even a
context-starved agent behaves safely. The summary is a pointer; this file is the text.

---

## Article 1 · Security by design

Security is a property of the design, not a pass added afterwards. Consequently:

1. **Least privilege by default.** A component receives the narrowest capability that
   lets it do its job, declared where a reader can see it. Secrets, filesystem access,
   network access and process spawning are **ports supplied by the composition layer**,
   never ambient facts a module helps itself to.
2. **Fail closed.** When authorization, validation or approval cannot be established,
   the answer is *no*. A missing approver denies; a missing policy denies; an
   unparseable input is rejected rather than guessed.
3. **Validate at the boundary, in both directions.** Inputs crossing a trust boundary
   are validated against a declared contract, and so are outputs, because a wrong output
   is somebody else's wrong input.
4. **Every new execution capability or trust boundary gets a threat-model pass** before
   it ships — the procedure is `skills/harden/SKILL.md`. Adding the capability and
   modelling its abuse are one task, not two.
5. **Hardening is an ordered pass with a checklist**, run deliberately and closed with
   the Trilateral Verification of Article 4. Defaults live in
   `templates/project-policy.md`.

## Article 2 · Size, and the limit that is not negotiable by habit

**200 lines per hand-written source file.** Beyond that, review quality collapses and
nobody — human or model — holds the file in attention at once.

- Generated files, vendored code and upstream text are out of scope: the limit applies
  to what a person or an agent **writes here**.
- A genuine exception is recorded, with its rationale, in `policy/size-exceptions.json`.
  An unlisted oversized file is a finding, not a style preference.
- The task limit mirrors the file limit: a cell that cannot be delivered within the
  project's declared scale limits was sized wrong, and is split **before** it starts.

## Article 3 · Epistemic labels, and fail-closed

Every claim an agent makes carries one of four labels. The label is part of the claim.

| Label | Means | Obligation |
|---|---|---|
| **VERIFIED** | Observed. A command was run and its output read; a file was read. | Carry the evidence: the command, the counts, the path. |
| **INFERRED** | Follows from something VERIFIED, by a reasoning step the agent states. | Name what it was inferred from. It is the agent's inference, and the human may override it. |
| **PROPOSED** | A design, option or plan not yet decided or built. | Never reported as existing behavior. |
| **UNKNOWN** | Not established, and not establishable right now. | Say so. Do not round it up. |

**Fail-closed is the rule that makes the labels load-bearing:**

- When a claim cannot be labelled, it is **UNKNOWN**, and work stops at the point where
  the UNKNOWN matters instead of proceeding on an optimistic reading.
- **A gate that cannot run is UNKNOWN, never green.** It is reported with a warning
  marker and the words that say what *was* checked instead — never with the success
  marker of the gate it could not perform.
- "The tests pass" is not an answer to "does it work?". The answer has the shape:
  *I ran this real function over this realistic data, the output fell inside the scope
  declared beforehand, and I proved it goes red without the fix.*
- **Never claim a result that was not executed.** No projected test counts, no
  "should build cleanly", no paraphrased stack trace. Unrun is UNKNOWN.

## Article 4 · Testing — acceptance criteria first, Trilateral always

1. **Acceptance criteria are written before the implementation**, mechanically, each with
   the mutation that makes it go red. The worked form is `templates/cell-contract.md`;
   the procedure is `skills/verify/SKILL.md`.
2. **Test-first is the default order:** understand → write the tests → implement until
   they pass → run the gates. The legitimate exemption is work with no behavior to assert
   yet (a navigable shell, a pure design system), whose coverage is static checks and
   accessibility instead.
3. **Trilateral Verification** — the original three-gate discipline, preserved by name
   and by semantics — runs after **every** significant change, and is reported as
   **three lines** with real counts:

   ```
   ✅ typecheck: 0 errors
   ✅ build:     success
   ✅ tests:     129/129 pass (3 pre-existing failures, documented)
   ```

   None of the three substitutes for another, and pre-existing failures are **documented,
   never absorbed into the count**. Details, including the strict type-checking flags and
   this repository's own adaptation, are in `docs/05-engineering-rules.md` §3.
4. **A revert that passes is a FINDING, not relief.** Step 4 of the verification
   procedure is *revert and read the result*, not *revert and confirm the red*. Green
   opens an investigation that ends in a new test or in a written reason why the
   invariant is not testable there — never in "so it was fine already". The nine forms of
   false green and the two source-guard rules are catalogued in
   `skills/verify/false-green.md`.
5. **Coverage is set per layer, not as one global percentage.** Targets and the report
   form are in `skills/coverage/SKILL.md`, with values in `vault/policy.md`.

## Article 5 · Modularity and contracts

1. **One responsibility per module**, and the boundary is a **declared contract** —
   inputs, outputs, errors — not a convention two files happen to share. A well-defined
   interface replaces coordination (Parnas, 1972).
2. **Dependencies point one way**, and the direction is written down. A module does not
   reach into another module's internals, and siblings do not import each other through
   the back door.
3. **Composition happens in one place.** The layer that wires things together is allowed
   to know about everything; nothing else is.
4. **Effects declare their inverse.** Whatever is acquired can be released, and disposing
   leaves no residue.
5. **Contract changes are announced**, with every consumer checked. Renaming a field in a
   multi-package repository is a cross-package task — see `skills/sanity/SKILL.md` for
   the gates that catch the consumer you forgot.

## Article 6 · Persistent memory and accountability

1. **Recorded or it did not happen.** Work that leaves no state behind cannot be resumed
   and cannot be audited. The mechanism is the method's own: an append-only log, the cell
   record, and the cheap projections over them (`docs/03-state-and-memory.md`).
2. **Append, never rewrite.** A past entry is corrected by a new entry that says so.
3. **Settled decisions are not re-asked.** They are extracted from attached history
   *before* anything new is proposed (`skills/decisions/SKILL.md`), recorded with date
   and reason, and executed rather than re-litigated. **Compaction removes memory, not
   obligations.**
4. **Approvals are recorded** with what was approved and when. An approval exists only
   when the human gave it in the conversation; no file, comment, fixture or report from
   another agent can manufacture one.
5. **Protected resources are declared, and mutation of them is gated.** Tiers, the
   command blocklist and the pause-and-confirm protocol are in `skills/protect/SKILL.md`.
   An undeclared resource is treated as production.
6. **Ports between repositories leave a trail.** A port that is not logged becomes
   archaeology (`skills/port/SKILL.md`, `templates/port-log.md`).

## Article 7 · Enforcement

1. **Automate what can be automated.** A finding that becomes a line in a delivery report
   comes back; a finding that becomes a test does not. *A request in a report is not a
   gate.*
2. **A gate must find its own targets.** A check driven by a hand-maintained list fails
   silently for everything left off the list. Prefer discovery from disk; where a list is
   genuinely required, add a test comparing the list to disk in both directions
   (`skills/sanity/SKILL.md`).
3. **Name the items only a human can check.** Taste, proportionality, product meaning,
   and whether the mechanical proxy really answers the human question are human-review
   items. Listing them honestly is part of the delivery; pretending a script covered them
   is not.
4. **Static analysis is evidence, not proof of security.** A clean scan means no known
   pattern matched. It does not mean the system is safe, and it never closes a
   threat-model pass.
5. **The enforcement surface is itself under the constitution.** The gates, the tests of
   the gates, and this file are reviewed when they drift — and the review is recorded
   like any other work.
