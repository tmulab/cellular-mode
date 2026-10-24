# Example · a data-aware light gate

A **light gate** is the fast check a project runs at commit time, when the full suite is too slow
to run on every save. Rule 4 of [`AGENTS.md`](../../AGENTS.md) allows one, with a floor: it must
reach **the tests that read every data file it touches**, and what it cannot reach, the full gate
must reach before delivery.

This folder is the worked example of that floor, plus the failure that made it a rule.

## The field failure, reproduced

2026-10-22, a real project: the commit-time gate selected tests from the changed **code** (the
`vitest related` shape — "which tests import this module?"). A staged `*.json` fixture is a leaf
nobody imports, so the selection was **empty** and the gate reported green; the test that *reads*
that fixture was already red, and the full gate found it a day later.

[`related-with-data.mjs`](related-with-data.mjs) keeps both gates side by side:

| Function | Selection on a staged, broken `data/users.json` | Verdict |
|---|---|---|
| `runRelatedOnlyGate` | nothing (data files import nothing) | 🟢 green — the hole |
| `runLightGate` | `test/users.test.mjs`, `test/roster.test.mjs`, `guard/smoke.test.mjs` | 🔴 red |

[`related-with-data.test.mjs`](related-with-data.test.mjs) runs both over a fixture repository
written to a temporary directory, and asserts the two verdicts in the same test — the
red-without-the-fix evidence is the control arm, not a reverted edit.

## The criterion: "a test that reads a data file"

Static, documented, deliberately generous. A test file `T` is a reader of data file `D` when the
source text of `T` holds a string literal whose value, normalised to `/` and stripped of a leading
`./` or `../`, is a **path-suffix of `D` at a segment boundary** — `users.json`,
`data/users.json` and `../data/users.json` all match `data/users.json`; `other-users.json` and
`data/users.json.bak` do not.

Each hit is classified by what precedes it — `import` / `from` → `import`, `require(` → `require`,
a callee matching `/read|load|open|fetch|parse|json/i` → `read`, anything else → `mention` — and
**all four classes select the test**. A selector should fail open toward running one test too many.

Data extensions: `.json` (the minimum the rule names), plus `.ndjson`, `.csv`, `.yaml`, `.yml`.

## What the heuristic cannot see — and the guard folder

Named rather than hidden: a path assembled from a variable or two literals
(`join(DATA_DIR, name + '.json')`), a path reached through a helper in another module, a glob, a
whole-directory read.

That is why **every test under a guard directory always runs**, whatever is staged — the floor the
heuristic cannot lower. A guard test is cheap and reads what the selector may miss ("every shipped
data file still parses"). An unrelated change therefore never selects zero tests.

## Wiring it into a project

```js
import { runLightGate } from './related-with-data.mjs';

const staged = /* `git diff --cached --name-only`, split on newlines */ [];
const { ok, selection, output } = runLightGate({ root: process.cwd(), staged, guardDirs: ['guard'] });
console.log(selection.reasons.join('\n'));          // why each test was chosen
if (!ok) { console.error(output); process.exit(1); }
```

This is an **example**, not a gate of this repository: `npm run gates` and `npm test` here run
everything. The procedure it illustrates is in [`skills/verify/SKILL.md`](../../skills/verify/SKILL.md)
§3 and [`docs/05-engineering-rules.md`](../../docs/05-engineering-rules.md) §3.
