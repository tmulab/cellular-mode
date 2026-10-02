---
name: verify
description: >
  Prove that a change really works — the verification question, the test-first loop and
  Trilateral Verification. Use when about to implement or change behavior, when asked
  "does it work?", "is it done?", "are the tests passing?", "verify this", "prove it",
  before claiming any gate is green, and whenever a revert that was supposed to go red
  comes back green.
---

# Verify — the verification question, the loop, the three gates

## 1. Answer the question before writing the first test

> **How can we verify that this really works?**

An answer counts only if it includes a **verification test** with five parts:

1. **Realistic data.** A fixture shaped like production, not `foo`/`bar`: real accents and
   hyphenation, plausible identifiers, the shape the upstream provider actually returns —
   including its ugly cases, such as a success status code carrying an error in the body.
   Incoherent data only proves the code tolerates incoherence.
2. **Expected scope declared *before* running.** Write the envelope of a correct answer
   first: exact values where the result is deterministic, ranges and invariants where it is
   not ("between 3 and 5 citations, each present in the source text, none from page 0").
   *If you cannot state the expected scope, you do not understand the feature yet — go back
   to step one of the loop.*
3. **Run the real function over that data.** The production path end-to-end across the
   slice under test: real parser, real pipeline, real process. Mock only what is genuinely
   external (network, GPU, a paid API) — never the thing being verified.
4. **Prove it is red without the fix.** Revert, run, **read the result**, restore. See §4.
5. **Report on delivery:** the scenario, the data used, the declared scope, the observed
   result, and the red-without-the-fix evidence.

The ladder, and where this sits on it:

| Rung | What it proves | Cost |
|---|---|---|
| Unit test with mocks | the internal logic decides correctly | low |
| **Verification test** | **the contract holds over realistic data** | low–medium |
| Trilateral (§3) | types, build and regressions are intact | low |
| Full-system test, real storage and real UI | the whole system works | high |

The verification test runs on **every** task — including the ones the top rung does not
apply to. The worked form is `templates/cell-contract.md`.

## 2. The loop

Understand the feature (ask if needed) → write the tests, unit and integration, with mocks
for dependencies that do not exist yet → **only then** implement until they pass → run the
Trilateral → fix any failing layer **before** moving on.

Asked to "just implement X" with no mention of tests: offer to write the tests first. If
the human insists, state the risk once and comply. **No feature without a test; no test
without an adequate mock.**

Legitimate exemption: work with no behavior to assert yet — a UI shell, a navigable mock,
a pure design system. Its coverage is `skills/sanity/SKILL.md` instead; the full-system
rung does not apply to it either, and inflating it there burns time for nothing.

## 3. Trilateral Verification

Three independent gates after **every** significant change, reported as **three lines**
with real counts:

```
✅ typecheck: 0 errors
✅ build:     success
✅ tests:     129/129 pass (3 pre-existing failures, documented)
```

- **Why three.** Type checking catches wrong types that mock-heavy tests paper over; the
  build catches packaging and server-rendering errors the type checker accepts; tests catch
  logic that compiles and returns the wrong answer. Together they are *categorically*
  stronger than any one alone.
- **Pre-existing failures are documented, never absorbed** into the success count.
- **A gate that cannot run is UNKNOWN, never green.** Report it with a warning marker, say
  what *was* checked instead, and never give it the success marker.
- **Strict type checking in full.** For TypeScript the floor is `strict: true` **plus**
  `noUncheckedIndexedAccess` (array and dictionary access bugs),
  `exactOptionalPropertyTypes` (an explicit undefined where only optionality was meant) and
  `noImplicitOverride` (an override that no longer overrides). `strict: true` alone is not
  enough. Other languages: enable every strict mode the toolchain offers.
- **Check that the gates reach their targets** — `skills/sanity/SKILL.md`. A gate that does
  not include the file, or does not know the package exists, is silently absent.
- Commands are per project: see `vault/policy.md`.

## 4. A revert that passes is a FINDING, not relief

Step four is **revert and read the result**, not "revert and confirm the red".

- **Red** confirms the test holds the invariant you think it holds. Restore and move on.
- **Green** means the test holds **something else**. It opens an investigation that ends in
  a **new test** or in a **written reason** why the invariant is not testable at that
  point. It never ends in "so it was fine already".

Nine forms of false green have been catalogued, with their detection heuristics, plus two
rules for writing a source guard that cannot lie: `skills/verify/false-green.md`. Open it
whenever a revert comes back green — and whenever you are about to write a guard that reads
a file or a flag.

Beware a **weak mutation**: merely *weakening* a mechanism (a debounce of 0 instead of
80 ms) can still pass green. The mutation must *remove* the mechanism.

## 5. How to answer "does it work?"

Never "the tests pass". The shape of a real answer:

> *It works: I ran `<the real function>` over `<the realistic data>` and the output fell
> inside the scope declared beforehand, `<X>`; and I proved the test goes red without the
> fix `<mutation → observed failure>`.*

Everything not in that shape is INFERRED or UNKNOWN, and is labelled as such
(`docs/00-constitution.md`, Article 3).
