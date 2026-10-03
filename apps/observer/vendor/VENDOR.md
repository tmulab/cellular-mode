# Vendored runtime code — pinned local copy, no CDN

> Rule in this repository: a runtime dependency of a local application enters as a
> **versioned local copy**, never as a remote `<script src>`. The observer must start
> with no network at all. Criterion **D6** in `../ACCEPTANCE.md` checks that no served
> asset contains an external URL, and **D1** checks these hashes.

This is the ONLY vendored directory in the repository. `tests/license.test.mjs` states
the rule that way — "no vendored code except the hash-pinned three.js directory" — so the
exception is a named fact a reader can audit, not a hole in a gate.

## three@0.180.0

| | |
|---|---|
| **Version** | `0.180.0` (r180) |
| **Origin** | `npm pack three@0.180.0` → `https://registry.npmjs.org/three/-/three-0.180.0.tgz` |
| **Copied** | 2026-08-25 (carried forward unchanged on 2026-10-02) |
| **Licence** | MIT — full text in `three@0.180.0/LICENSE` |
| **Upstream files** | `three.module.min.js` (331 KB) · `three.core.min.js` (372 KB) |

**SHA-256** (byte for byte the files from the npm package):

```
e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6  three.module.min.js
61ba0df005b05991361d040d8ff670e1aadfd0ce7aeebd1fdb0725957a8957de  three.core.min.js
```

### The hash has to match on any machine

`.gitattributes` marks `apps/observer/vendor/** -text`. Without it, `core.autocrlf=true`
would hand these files to a Windows clone with CRLF line endings, the hashes above would
stop matching in the working tree, and the audit they exist to permit would be gone.

### Why two files

In r180 the build is split: `three.module.min.js` only re-exports from
`three.core.min.js`. Vendoring one without the other leaves a broken import. It is always
both.

### Why the minified build

1959 KB of readable source against 703 KB minified, for a blob nobody reads line by line.
The auditability comes from the SHA-256 above — anyone can prove the bytes are the npm
artefact — not from the file being readable.

### Why `OrbitControls` is NOT vendored

`examples/jsm/controls/OrbitControls.js` imports from the **bare specifier `'three'`**,
which would require an import map on the page. An import map can only be delivered inline
(browsers do not support external import maps), and the page forbids inline script under
its own CSP. The file also lives in `examples/`, the directory upstream reorganises
between versions. Two shape-dependencies for features the cell does not ask for.

**Decision:** an own orbit controller (`../web/orbit.mjs`, about 90 lines) — drag rotates,
wheel zooms, right-drag pans. `three.module.min.js` is imported by path, with no import
map.

### The one handwritten file in here

`three@0.180.0/three.module.min.d.ts` is **ours**, not upstream: a hand-written
declaration of the small subset of three.js the 3D view uses, so the browser code can be
type-checked (criterion D16) without adding an `@types/three` dependency. It is not part
of the hash pin — the pin covers exactly the two upstream builds — and `VENDOR.md` says so
out loud rather than letting a reader assume the whole directory is upstream.

## How to update

Raising the version is a cell of its own: replace both files, recompute both hashes,
update this table, re-run the gates and re-read `../MANUAL-CHECKS.md` end to end.
