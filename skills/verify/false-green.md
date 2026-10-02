# Reference · The nine forms of false green

A Level 4 reference for step four of `skills/verify/SKILL.md`: you reverted the fix and the
suite stayed **green**. The impulse is to read that as good news. It is the opposite.

> **A green revert means investigating what the test actually holds. It never means
> proved.**

If the test still passes without the fix, it holds **something other** than the invariant
you believe. Nine forms have been observed, and all nine disguise themselves as success.
**The common pattern: the green was real and the proof was false.** A test can pass for a
different reason than the one you imagine, and the revert is the only moment that
difference becomes visible.

---

## 1 · The test moves with the code

The test compared the output against the **constant** that the revert changed. Both move
together and the green is a tautology.

**Detection:** an assertion whose expected value is imported from the module under test.
**Fix:** assert the **literal**; the constant gets a separate test of its own.

## 2 · The revert did not model the defect

You reverted to something that does not produce the real error, so the red that never came
says nothing about the invariant.

Two shapes seen: reverting to a *lazy copy on read* broke only one test, because **a lazy
copy is not duplication** — duplication is the program *storing* its own copy; and swapping
a `throw` for `if (false)` produced a **type** error rather than a red test, breaking the
compiler instead of the behavior. **Detection:** the revert compiles differently, or fails
for a reason unrelated to the behavior. **Fix:** harden the revert until it produces the
*real* defect, and only then read the result.

## 3 · The runtime already guaranteed the invariant, by accident

The test declared the invariant without verifying it, because the runtime satisfied it for
free in the chosen scenario.

Example: sorting by timestamp returned insertion order anyway, because **array sort has
been stable since ES2019**. Only a non-monotonic clock — time corrected by a network sync,
a restarted container — separates the two implementations. Same family in a typed language:
an "expect this to be a type error" annotation placed over a **literal** may be held by the
excess-property check rather than by the type invariant you wrote; the proof needs a
**widened variable**, which escapes that check. **Detection:** ask which language or
platform guarantee is doing the work for you. **Fix:** find the condition in which the
accidental guarantee does **not** hold, and test there.

## 4 · A different guard caught the error

The revert did break something — but what stopped it was a guard **other** than the one you
meant to prove, and the assertion cannot tell the two apart.

**An unpatterned `rejects`/`toThrow` is the most common form:** it passes with *any* error,
including one from a neighbouring validation you were not testing. Variants seen: an empty
default falling into the *next* guard; **two guards in series**, where an empty list died on
the non-empty check before ever reaching the arity rule the test wanted; and a validation
removed from one place that still threw because **a second component also validated** — the
real invariant was not "it throws", it was "validate *before* writing".

**Detection:** any assertion on failure that does not name the failure.
**Fix:** assert **which** guard caught it — the literal of the message, or the state only
that guard preserves. And distrust defence in depth: when two structures block the same
abuse, reverting one proves neither.

## 5 · The test blesses what it should prevent

The **name** asserts the invariant and the **behavior** violates it. It passes, and it
passes *because* the code does exactly the wrong thing the title promises to block.

**The other forms hide an absence of proof; this one proves the opposite.** It is the most
dangerous of the family, because the suite is not merely silent — it is *actively
misleading*. Anyone reading the list of green tests reads a guarantee that does not exist,
spelled out in full.

Example: a test named *"a real session with no events at all: everything empty, nothing
reconstructed"* passed because the layer read the phase from a **table** and answered
*"phase LEARNING, progress 0 of 3"* about a session it knew nothing about — **plausible
reconstruction**, the exact act that layer exists in order not to commit, blessed by a test
whose name said the contrary. It surfaced only when a contract decision cut access to the
table and the test broke: **it improved by breaking.**

**Detection, without waiting for luck:** distrust every test whose name contains a
**negation** — *never, no, nothing, empty, without* — and whose assertions only check the
**shape of a positive result**. If the title promises absence, the assertion must be about
the absence: `null`, an empty list, a nonexistent field, a named error. A well-formed
object never proves that nothing was invented.

**Fix:** assert the absence, and **preserve the trap** — keep the row deliberately seeded
in the table, because it is what proves the table is no longer read. Removing the data
together with the defect makes the test pass for lack of opportunity.

## 6 · Mass breakage is not proof of behavior

Making a field mandatory knocks over dozens of tests in other packages — and that proves
**only that boot requires the field**, nothing about the policy working.

> **Requiring configuration is not enforcing policy.**

**Detection:** if the only evidence for a guarantee is *"it broke N tests when I made it
mandatory"*, there is **no behavioral test**. Write them. **Distinction from forms 1–5:** those prove the wrong thing; **this one reads the wrong
signal** — and the bigger the red, the more convincing the illusion. A 65-test red looks
like the strongest proof there is and is the emptiest: it measures the coupling surface,
not the policy. In the case observed, 65 tests across nine packages fell, none exercised
the character ceiling, the rejected pattern or the mock applying the same rule, and all four
reverts passed **green**; twelve behavioral tests were needed to make them red.

## 7 · The signal never reached the code

The test exists and aims correctly, but **the absence it was supposed to deliver was cured
beforehand** — typically by a helper's default. A call like `build(x, undefined)` whose
parameter is declared `= DEFAULT` never passes the absence on: the test ends up verifying
the helper.

**Detection:** every test whose subject is **the missing argument** and which goes through a
helper with a default parameter. **Fix:** assemble the scenario by hand in that one test,
without the shortcut — three extra lines, and the difference between verifying the guard and
verifying the helper. Seen twice in one codebase; both times the test *"composition without X
does not start"* was **green by construction**.

## 8 · The proof does not travel with the pattern

Proving a mechanism in one consumer **does not prove it in the others** that use the same
pattern. **Every real consumer needs its own proof.**

**Distinction:** 1–5 are failures **of the test**; the 6th, of **reading**; the 7th, of a
**missing signal**. This one is **EXTRAPOLATION** — the test exists, is correct, and covers
**a different subject**. **Detection:** if the evidence for a guarantee is *"we proved that in cell X"* and the
subject of X is a **test double** or **another consumer**, there is no proof here. Observed
twice in one cell: a name-escaping helper written and never proved, in a project that already
had cross-site scripting recorded as debt; and a route inverse proved with a **test plugin**
and never with the real screens. Both reverts passed green.

## 9 · A guard that silently disarms

A guard can **stop verifying because of a change external to it** — the format of the source
it reads, new markup, a renamed field — and stay **green**. Or it can **be born that way**,
when the reference it compares against is **derived from the very data it checks**.

> **Absence of the reference is RED, not neutral.**

**Rule:** a guard that compares against a value **read from an external source** must
**fail when it cannot read it** — never fall back to something derived from the data it
verifies. A parser compared against `keys.size` is always green; a frame derived from the
positions of the items it frames is always "on the edge".

**Kinship with the 7th:** both are **absence supplied in silence**. In the 7th the supply
comes from the **test's** helper default; here it comes from a **fallback in the code**, and
the trigger is **external**. **Distinction from the rest:** 1–5 prove the wrong thing, the
6th reads the wrong signal, the 7th receives no signal, the 8th covers another subject.
**This one emits no signal at all** — there is no red to read, not even late: the guard
stays green for as long as it is not verifying.

**Detection:** every `??` or `||` between the reference and the data being checked; and
every reference computed from what it is supposed to audit. Two opposite instances in one
day: prose in a source document gained bold markup, the declared count parsed to `NaN` and
then `null`, and the guard fell back to `keys.size` — it **disarmed** after days of green;
and a criterion asserting "the label sits on the frame" was **born disarmed**, because the
frame was computed from the label positions, making the assertion true by construction.

**Companion rule from the same sweep — an empty loop is an empty assertion.** An assertion
inside a loop needs an assertion on the **size** of the loop. A `for` over the elements the
mutation makes disappear **does not iterate**, and the test passes without verifying
anything.

---

## How to WRITE a source guard — the instrument, not the signal

The nine forms say **how green lies**. These two say **how to write the guard so that it
does not lie**. Both come from a case where reverting a constant-time comparison passed
green against **two different guards**, one after the other.

**1 · A literal assertion beats a regex.** A regex has **two things to get wrong** — the
pattern, and the slice of the file it is applied to. A literal assertion —
`contains('return constantTimeEqual(x, y);')` — has **none**. In the case observed the
pattern was verified in isolation (it matched), the slice was verified in isolation (it
contained the bad line), **and the test still passed**; a literal assertion fixed in one line
what the regex had not fixed in two attempts. *A guard that does not catch costs more than
no guard, because it grants confidence.*

**2 · Never verify through a flag the module itself declares.**
`expect(x.isSecure).toBe(true)` is **self-attestation, not proof**: after mutating the
implementation the flag still reads `true`. It is an **instance of the 9th form** — the
reference is derived from the data being verified — and it is recorded separately because
the flag *looks* like an assertion about behavior and is one about a promise.

---

## Effect on step four

It stops being "revert and confirm the red" and becomes **"revert and read the result"**.
Red confirms. Green opens an investigation ending in a **new test** or in a **written
reason** why the invariant is not testable at that point — never in "so everything is
fine". **Anti-pattern:** answering *"the tests pass"* when the human asks *"does it
work?"*. The right answer: *"it works: I ran the real function over the coherent data, the
output fell inside the declared scope, and I proved the test fails without the fix."*
