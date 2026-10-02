# Example: `text-stats`

A 45-line, zero-dependency library built over three days and **three cells** — one of
them interrupted half-way. The library is deliberately boring; what the example shows is
the *trail it leaves*: `vault/state/` is the real output of the real CLI, replayable
command by command.

```
src/text-stats.mjs          countWords, readingTime
test/*.test.mjs             the criteria each cell was closed against
contracts/reading-time.md   the worked contract for cell 2
vault/state/                the example's own memory — generated, never hand-edited
reproduce.mjs               replays the command sequence that produced vault/state/
```

## Cell 1 — "Word count" ✔ (2026-03-02)

**Human:** *"Let's start a cell: counting words in a string. Nothing else."*

The boundary is the interesting part of that sentence, and `open` records it:

```
cellmode open "Word count" --area examples/text-stats/src/text-stats.mjs \
  --objective "Count the words in a string, Unicode whitespace included." \
  --in  "countWords() in src/text-stats.mjs + test/word-count.test.mjs" \
  --out "reading time, sentence count, language detection, a CLI"
```

On disk: `vault/state/cells/word-count.md` appears, a 🔵 row lands in `INDEX.md`, and
`CURRENT-CELL.md` becomes a copy of the cell file. **No log entry** — an opening is not a
closure, and the log only records what happened.

Then the work: `countWords()` in `src/text-stats.mjs`, five criteria in
`test/word-count.test.mjs`. The human asks the closing question and answers it, which is
the only way a cell becomes ✔ — `complete` without `--confirm` exits 5, "human
confirmation required":

```
cellmode complete --facts "..." --build green --decisions "..." --confirm
```

The first log entry is appended; `INDEX.md` flips to ✔ with next step `—`; the cell file
is kept, because a done cell is history, not clutter.

## Cell 2 — "Reading time" ⏸ then ✔ (2026-03-03 → 2026-03-04)

**Human:** *"New cell: minutes of reading. Write the contract first."*

So `contracts/reading-time.md` came before the code, in the worked form: the question,
five pre-committed decisions, a table of inputs → expected minutes written *before*
`readingTime()` existed, and four acceptance criteria each with its own "red without the
fix". Then the tests, from the table. The code: not yet.

Mid-cell, a divergence — **Human:** *"Hold on, what about Chinese? There are no spaces."*
A real question, outside this cell's boundary. It is neither argued nor absorbed:

```
cellmode park "Support CJK character counting (reading speed in Chinese/Japanese
  is characters per minute, not words per minute)"
```

One line in `vault/state/parking-lot.md`, tagged with the cell it came from. Nothing
lost, nothing derailed.

**Human:** *"I'm done for today."* — a stop signal, so the pause ritual runs: facts, not
intentions, and one concrete next step.

```
cellmode pause \
  --facts "Wrote contracts/reading-time.md and test/reading-time.test.mjs.
           readingTime() is not implemented yet in src/text-stats.mjs." \
  --build "red (TypeError: readingTime is not a function)" \
  --next  'run `node --test "examples/text-stats/test/reading-time.test.mjs"`
           and read the first error'
```

On disk: a second log entry (`**Status:** ⏸`), the cell file rewritten, the INDEX row ⏸
with the date, `CURRENT-CELL.md` reset to the "no active cell" form. The red build is
recorded as red — the tool never claims green on your behalf, and here red *is* the
bookmark.

**Next morning.** `cellmode resume "Reading time"` prints the five-line reconnection
(cell, last fact, build, next step) and asks "Shall we continue?". The next step is
runnable in under five minutes without thinking — that is its whole specification. Forty
words of `readingTime()` later the four criteria are green, each proved red by one
mutation (verdict table in the contract), and the human confirms with `complete`.

## Cell 3 — "Sentence count" 📋 (planned, never opened)

**Human:** *"Sentence counting is next, but not today."*

```
cellmode plan "Sentence count" --area examples/text-stats/src/text-stats.mjs \
  --objective "Count sentences, handling abbreviations and ellipses."
```

A 📋 row and a mostly empty cell file — **and no log entry**, because the cell never ran
and inventing one would be fiction in an append-only record. That is also why its next
step is `—`: a next step is a promise made by a cell that has been worked on.

We left it 📋 rather than opening-and-pausing it, on purpose. An opened cell carries an
obligation (a next step, a recorded build); a planned cell carries only an intention, and
nothing has happened yet to resume. The backlog stays honest: `src/text-stats.mjs` has no
`sentenceCount()`, and `INDEX.md` says so out loud.

## Reproducing the vault

`vault/state/` is **generated**. `reproduce.mjs` creates a fresh temp directory, replays
the nine commands above with fixed `CELLMODE_NOW` timestamps, runs `cellmode check` on
the result and asserts exit 0, then compares the replayed state with the committed one.

```
node examples/text-stats/reproduce.mjs           # 0 identical, 1 drifted (prints the first diff)
node examples/text-stats/reproduce.mjs --write   # regenerate the committed vault
```

Line endings are normalized first, so a CRLF checkout on Windows is not reported as
drift. Hand-edit anything under `vault/state/` and `test/reproduce.test.mjs` goes red:
the example cannot quietly stop being true.

## Running the tests

```
npm test                                             # whole repo, this example included
node --test "examples/text-stats/test/*.test.mjs"    # this example only
```

Positional arguments to `node --test` are globs, not directories — quote the pattern.
