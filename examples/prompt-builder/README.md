# Example — the Cellular Prompt Builder, end to end

What a complete Builder session actually looks like, recorded from the real CLI. Nothing here is
hand-written output: [`transcript.md`](transcript.md) is the terminal, abridged only where it
says so, and the two artefacts next to it are the files the run produced.

| File | What it is |
|---|---|
| [`transcript.md`](transcript.md) | the session: a **new** project from idea to planned first cell, then a read-only pass over an **existing** repository |
| [`project-contract.json`](project-contract.json) | the approved contract the run wrote (`vault/project-contract.json` in that project) |
| [`prompt-neutral.md`](prompt-neutral.md) | the exported prompt, `--adapter neutral` — what you paste into any agent |

The invented project is a **household reading-list tracker**: one shared list of books, add a
book, mark it finished. No personal data, no real system.

## What to look for

- **One question at a time**, in plain words. Nothing is asked whose answer would not change
  the next step.
- **"I do not know" is recorded as UNKNOWN**, and where a sensible default exists the Builder
  adds a **PROPOSED** option beside it. It never promotes the proposal by itself: in the
  transcript, decision `D1` is what turns it into something the project may rely on.
- **`approve` without `--confirm` exits 5** and writes nothing. The same command with
  `--confirm` writes the contract — and says, in its own output, that approving is **not**
  authorization to commit the file.
- **The first cell is planned (📋), never activated.** Opening it is `node tools/cellmode/cli.mjs
  open …` or `/cell`, run by the human, in the normal ritual.
- **No absolute path anywhere**, in the transcript or in the exported prompt: the CLI scrubs the
  project root out of every line it prints, for the same reason the publication check exists.

## Reproducing it

The session was run against a throwaway directory, never against this repository — the draft
lives in `vault/builder/`, which is git-ignored, and a stray run would leave state behind.

```
tmp=$(mktemp -d)                                   # or any empty directory
node tools/cellmode/cli.mjs init --root "$tmp"
CELLMODE_NOW="2026-10-04 10:00" npm run -s builder -- start new --name "Household Reading List" --root "$tmp"
```

Then follow the transcript. `npm run -s builder -- <command>` and
`node tools/prompt-builder/cli.mjs <command>` are the same thing (argument forwarding through
`npm run --` is VERIFIED). Because `CELLMODE_NOW` is fixed and the prompt's data-block nonce is
derived from the content rather than random, the same answers produce the same bytes.

Onboarding, exit codes and the full explanation: [`docs/11-prompt-builder.md`](../../docs/11-prompt-builder.md).
