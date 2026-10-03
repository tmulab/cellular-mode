# The vendored three.js exclusion

The single exception to "every gate sees every handwritten file", written out so it can be
audited rather than discovered. Pointed at from [`README.md`](README.md).

`tools/gates/exclusions.mjs` holds `VENDORED_PATHS` (re-exported by `scan.mjs`, and read by the
host's repository port too), and `readTuples` drops those paths before
any gate sees them. The list is two file names, written out in full, not a `vendor/**`
pattern — a pattern would silently cover the next directory somebody calls `vendor`:

```
apps/observer/vendor/three@0.180.0/three.core.min.js
apps/observer/vendor/three@0.180.0/three.module.min.js
```

**Rationale.** Both files come from `npm pack three@0.180.0` and are copied byte for byte.
Every gate in this directory asks a question about *handwritten* code — 200 lines, secret
shapes, import direction, English prose — and none of those questions has a meaning for
721 KB of generated, minified JavaScript. The secret scan is the concrete harm: minified
identifier soup produces false findings, and a gate that cries wolf is a gate people learn
to skip.

**What replaces the gate is stricter than the gate.** The bytes are pinned by SHA-256 in
`apps/observer/vendor/VENDOR.md`, and `tests/license.test.mjs` recomputes both hashes on
every `npm test`: one changed bit fails the suite. The same test asserts that the vendor
directory contains *exactly* the declared files, so new code cannot be parked behind the
exclusion. `tests/license.test.mjs` also states the licensing rule in its narrowed form —
"no vendored third-party code except the hash-pinned three.js directory" — rather than
keeping a claim that is no longer true.

**Not excluded, on purpose:** `VENDOR.md` and `three.module.min.d.ts` in that same
directory are *ours* (the provenance record and the hand-written type subset) and go
through every gate like any other file. `LICENSE` has no extension and was already out of
scope by type. `tests/leaks.test.mjs` imports the same `isVendored` predicate for the same
two paths, so the repository has one list and not two.

Typecheck follows the same split: the root `jsconfig.json` excludes the two artefacts, and
`apps/observer/jsconfig.json` type-checks the browser code against the hand-written three.js
declaration. `npm run typecheck` runs both configurations.

