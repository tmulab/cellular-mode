# R-1 proposal — the minimum needed to make the typecheck leg real

**Status: IMPLEMENTED 2026-10-02** — `typescript@5.9.3` and `@types/node@24.19.1`,
both pinned exactly, plus `jsconfig.json`. R-1 is **WITHDRAWN**: the typecheck leg is
`tsc --noEmit -p jsconfig.json` with `checkJs` and the four strict flags, and it
reports **0 errors** over 100 modules, tests included. `npm run typecheck` runs it
directly; `tools/gates/typecheck.mjs` resolves the compiler from `node_modules`
(not merely from PATH) for `npm run trilateral` and for the `--release` probe.

What the document below PROPOSED is now what the repository DOES, with three
differences, all recorded rather than quietly absorbed:

1. **Versions.** TypeScript **5.9.3**, not the current `latest` (7.0.2): every type
   here is JSDoc on `.mjs`, TypeScript 7 is a new native rewrite, and a verification
   gate is the wrong place to be an early adopter. `@types/node` **24.19.1**, major
   matched to the local Node (v24.19.0). One transitive package comes along,
   `undici-types` (MIT), recorded in `THIRD_PARTY_NOTICES.md`.
2. **`skipLibCheck: false`**, not `true` as proposed. It was tried strict first and it
   passes, so there was no reason to skip anything — including the `.d.ts` files of
   the two dependencies.
3. **`include` is `**/*.mjs` + `**/*.js` + `**/*.cjs`**, not a list of four
   directories. A list can be dodged by adding a directory; a glob cannot.

The migration cost, measured rather than estimated: **1038 errors on the first run**,
every one fixed with JSDoc, a narrowing guard or a named type. The clusters the
"expected effort" section below guessed at were the right ones; the one it missed was
the biggest, `TS7006` (538 of the 1038) — a function parameter with no `@param`.

## The two packages, and nothing else

| Package | Where | Version | Why |
|---|---|---|---|
| `typescript` | `devDependencies`, pinned exact | **UNKNOWN** | the only type checker that can check JS with `checkJs`; `tsc --noEmit` is the command `trilateral.mjs` already looks for |
| `@types/node` | `devDependencies`, pinned exact | **UNKNOWN** | every module imports `node:` built-ins; without these declarations `node:fs/promises`, `process` and `URL` are errors, and the run would be noise instead of signal |

**UNKNOWN is deliberate.** This work ran with no network access, so the current
published versions cannot be verified and stating a number would be inventing one.
The human picks both, pinned exactly (no `^`, no `~`) so a type error can never
arrive from a background upgrade; `@types/node` should match the supported Node
major line (`engines.node: ">=18"`).

**Why nothing else.** A linter and a formatter are a different question from type
correctness and neither is needed for `tsc --noEmit` to run; adding them here would
smuggle a style decision into a verification decision. No test framework
(`node --test` is built in), no build tool (`noEmit`), no `ts-node`, no bundler, no
plugin: the proposal is exactly what the gate probes for.

## Proposed config — `jsconfig.json`

Not created by this cell, on purpose: the file's mere existence changes gate
behaviour. `trilateral.mjs` treats `tsconfig.json`/`jsconfig.json` **plus** a
resolvable `tsc` as the signal to run the real check; committing the config before
the package is installed would leave the probe half-true and the leg still UNKNOWN.
`jsconfig.json` is the honest name for a JavaScript project.

```json
{
  "compilerOptions": {
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["tools/**/*.mjs", "tests/**/*.mjs", "eip/**/*.mjs", "examples/**/*.mjs"],
  "exclude": ["node_modules", "**/vault/state/**"]
}
```

`module: NodeNext` is not cosmetic: it makes `node:` specifiers, ESM-only `.mjs`
and top-level `await` resolve the way Node resolves them. `skipLibCheck` applies
to `@types/node`, not to this project's code.

## Expected migration effort

**INFERRED, unmeasured** — no type checker has been run here, so every number
would be fiction. What can be said structurally:

- The code is already annotated where it matters: the pure gates and the SDK carry
  JSDoc with parameter and return descriptions, which `checkJs` reads.
- The likely clusters of work are (a) `catch` blocks, where `error` is `unknown`
  under `strict`; (b) `JSON.parse` results, which are `any` and flow into policy
  objects that want a shape; (c) `noUncheckedIndexedAccess` on the many
  `split('\n')[i]` and `exec(...)[1]` accesses in the gates and parsers;
  (d) object literals built field by field, under `exactOptionalPropertyTypes`.
- The fix in each case is a JSDoc `@param`/`@returns`/`@type` or an explicit guard,
  never an assertion and never `// @ts-ignore`: a line that cannot be typed
  honestly is a design finding, not a suppression. Treat the first run as a
  measurement, not a gate — record the real error count under R-1 before editing.

## How the gate re-enables itself

No edit to `trilateral.mjs` is required, and that is the point — the relaxation was
written to expire on its own. `typecheckLeg()` already probes
`exists('tsconfig.json') || exists('jsconfig.json')` and `tsc --version`; when both
answer, it runs `tsc --noEmit -p .` and reports `✅ … clean` or `❌ … FAILED` with
the compiler output. Until then it prints the `UNAVAILABLE … (UNKNOWN)` warning
plus the `node --check` syntax pass, named as what it is. `check-all.mjs
--release` runs the same probe and lists `release:typecheck-unavailable` as a
blocker while it fails.

## What `policy/allowed-dependencies.json` must say

The deps gate enforces both halves of the zero-dependency claim, so the manifest
and the policy have to land together or `npm run gates` goes red — correctly.
**Do not add these entries now:** installing needs network and human approval.

```json
{ "name": "typescript", "version": "<exact>", "scope": "devDependencies", "approvedBy": "<name> <date>",
  "rationale": "Type checker for the Trilateral typecheck leg; resolves R-1. No runtime code depends on it; noEmit means it never produces an artefact." }
{ "name": "@types/node", "version": "<exact>", "scope": "devDependencies", "approvedBy": "<name> <date>",
  "rationale": "Declarations for the node: built-ins the project already imports; without them the leg is noise, not signal." }
```

The README's "zero dependencies" claim then needs one honest sentence: zero
**runtime** dependencies, two development ones, both for verification. A claim
that quietly becomes false is worse than one narrowed out loud.

## Rollback

Cheap and total, which is the strongest argument for trying it:

1. Delete `jsconfig.json` — the probe fails and the leg returns to `UNAVAILABLE`.
2. Remove both entries from `package.json` and from
   `policy/allowed-dependencies.json`; delete `node_modules` and any lockfile.
3. `npm run gates` and `npm run trilateral` return to their pre-proposal output,
   and the attempt is recorded under R-1 with its reason.

No source file needs reverting: every change this proposal implies is either a
JSDoc comment (a net gain, which stays) or a deleted config file.
