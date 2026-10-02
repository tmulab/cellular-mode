# Cell contract: Reading time

Worked form (`templates/cell-contract.md`). Everything above the verdict was written
**before** `readingTime()` existed — that is the whole point: the expected values are a
prediction, not a description of whatever the code happened to return.

## Header

```
**ID:** reading-time
**Area:** examples/text-stats/src/text-stats.mjs
**Opened:** 2026-03-03 · **Status:** ✔
**Objective:** Turn a word count into minutes of reading, rounded up.
**Boundary:** in: readingTime() in src/text-stats.mjs + contracts/reading-time.md
              | NOT in: CJK character counting, sentence splitting, HTML stripping
**Inputs:** countWords() from src/text-stats.mjs (cell "Word count", ✔)
**Outputs:** readingTime(text, {wpm}) exported from src/text-stats.mjs
**Dependencies:** cell "Word count" (✔) — nothing else
**Done criterion (binary):** node --test green + every row of the table below matches
**Build/typecheck:** green
```

## The question

> *"If a reader sees '3 min read' at the top of this page, will the number be honest
> enough that they trust the next one?"*

Trust is not machine-testable, and nor is the 200 wpm figure: real reading speed depends
on the reader, the font and the hour of the day. What this contract covers is the
**necessary condition** — that the arithmetic is never *under*-stated, never off by one
at a boundary, and never 1 minute for an empty page. A label that says 1 min for an empty
article destroys trust faster than any imprecision in wpm. Declaring that split now is
what stops the cell from claiming it solved the human question.

## Pre-committed decisions (not to be reopened during the cell)

1. **Round up (`Math.ceil`), never to nearest.** A started minute is a whole minute of
   someone's attention; rounding 201 words down to "1 min" is the dishonest direction.
2. **0 words → 0 minutes, not 1.** Empty input is a real case (a draft, a failed fetch),
   and "1 min read" on nothing is a visible lie.
3. **Default `wpm = 200`, caller-overridable.** A plausible silent-reading average; the
   option exists so the number can be tuned without touching this function.
4. **A non-positive or non-finite `wpm` throws.** `Infinity` minutes rendered in a page
   header is worse than an exception in a test.
5. **Words, not characters.** CJK counting was raised during the cell and parked
   (`vault/state/parking-lot.md`, 2026-03-03) rather than absorbed.

## The fixture (realistic data)

Built in `test/reading-time.test.mjs` by `words(n)` — `w0 w1 … w(n-1)`. Realistic
*where it matters for this function*: `readingTime` only ever sees a word count, so the
awkward shapes that matter are the counts around the boundaries, not prose. The awkward
text shapes (non-breaking space, ideographic space, hyphenation, punctuation) were the
fixture of cell "Word count" and are already covered in `test/word-count.test.mjs`;
re-testing them here would prove nothing new about this cell.

## Declared expected scope — written BEFORE running

| Input | Words | wpm | Expected minutes |
|---|---|---|---|
| `""` | 0 | 200 | **0** |
| `"   \n\t "` | 0 | 200 | **0** |
| `words(1)` | 1 | 200 | **1** |
| `words(200)` | 200 | 200 | **1** |
| `words(201)` | 201 | 200 | **2** |
| `words(400)` | 400 | 200 | **2** |
| `words(401)` | 401 | 200 | **3** |
| `words(100)` | 100 | 50 | **2** |
| `words(100)` | 100 | 1000 | **1** |
| `words(100)` | 100 | 0 / −5 / NaN / ∞ | **throws `RangeError`** |

Invariant, for any text: `readingTime(t, {wpm}) === 0` if and only if
`countWords(t) === 0`; otherwise the result is `>= 1` and monotonic in the word count.

## Acceptance criteria (mechanical)

### C1 · no words means no minutes

```
assert.equal(readingTime(''), 0)
assert.equal(readingTime('   \n '), 0)
```

**Red without the fix:** remove the `trimmed === ''` early return from `countWords`
— `''.split(SPACE)` is `['']`, length 1, so `readingTime('')` returns **1 instead of 0**.

### C2 · a started minute counts as a whole minute

```
assert.equal(readingTime(words(201)), 2)
```

**Red without the fix:** replace `Math.ceil` with `Math.round` — `201/200 = 1.005`
rounds to 1, so the assertion sees **1 instead of 2**. (`Math.floor` would be caught
too, but `round` is the mutation worth proving: it is the plausible mistake.)

### C3 · wpm is honoured

```
assert.equal(readingTime(words(100), { wpm: 50 }), 2)
```

**Red without the fix:** ignore the options object and divide by the literal `200`
— **1 instead of 2**. Note that the default-value test alone (`wpm: 200`) stays green
under this mutation: it is the non-default row that proves the option is wired.

### C4 · a non-positive wpm is refused, not divided by

```
assert.throws(() => readingTime('hello', { wpm: 0 }), RangeError)
```

**Red without the fix:** delete the guard — `1/0` gives **`Infinity` instead of a
throw**, and `{wpm: NaN}` gives `NaN`. Weakening the guard to `wpm < 0` is *not* an
acceptable mutation here: it still leaves `wpm: 0` returning `Infinity`, which is the
case C4 exists for.

## File split (respecting the line limit)

| File | Responsibility | Criteria |
|---|---|---|
| `src/text-stats.mjs` | `readingTime()` — rounding + the wpm guard | C1–C4 |
| `test/reading-time.test.mjs` | the four criteria, one test each | C1–C4 |

---

# Verdict — 2026-03-04, cell closed ✔

**Works:** I ran the real `readingTime()` over every row of the declared table; all ten
rows matched the values predicted above, including the three boundary rows. Nothing was
mocked — the function has no collaborators besides `countWords()`, which is real code
from a ✔ cell.

**Gates:** no typecheck or build step in this example (plain ESM, zero deps) — reported
as *n/a*, not as green. Tests, the two library files as they stood at closing time —
`node --test "examples/text-stats/test/word-count.test.mjs" \
"examples/text-stats/test/reading-time.test.mjs"` → 9 pass, 0 fail.

**Proofs of red (one mutation per criterion, restored afterwards):**

| | Mutation | Red observed |
|---|---|---|
| C1 | dropped the `trimmed === ''` return | `readingTime('')` → 1, expected 0 |
| C2 | `Math.ceil` → `Math.round` | `readingTime(words(201))` → 1, expected 2 |
| C3 | ignored `options`, divided by `200` | `{wpm: 50}` → 1, expected 2 |
| C4 | deleted the wpm guard | `{wpm: 0}` → `Infinity`, expected a throw |

**Findings:** the first mutation tried for C3 was *changing the default* from 200 to 250.
C3 stayed green under it — the only failure it produced was C2's `words(201)` row, for an
unrelated reason. A weakening, not a removal, and therefore no proof for C3. Replacing
the option with the literal `200` is the mutation that actually removes the mechanism.
Also: C1's red turned out to live in `countWords`, not in `readingTime` — the
cheap-looking early return from the *previous* cell is what carries it.

**Declared choices (not hidden debt):** no upper bound on `wpm` (10 000 wpm is absurd but
harmless); no locale handling; CJK character counting parked, not implemented; the 200 wpm
default is a convention, not a measurement, and this contract does not pretend otherwise.
