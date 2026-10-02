# Third-party notices

## Author's decisions (2026-10-02)

Recorded as given by the author, Hudson Augusto Rodrigues Bonomo. Not legal advice.

- **Relicensing.** The author authorizes release under the **Apache License 2.0** of the
  original material for which he holds the necessary rights. This resolves the earlier
  **MIT** declaration carried by the source engineering skill *for his own parts only*.
  Third-party components keep their own licenses and their own attribution; the author
  does not relicense anything he did not write.
- **Engineering methodology.** The engineering documentation in `docs/05` is an
  **independent rewrite** — own words, own structure — and is kept as such. Attribution
  to **Fábio Akita** is preserved where his publicly shared work genuinely influenced the
  methodology. **No third-party copyrighted text is reproduced** here, with or without
  permission being sought.

## No third-party code is bundled

This repository contains **no vendored, copied or bundled third-party source code**, and
declares **zero runtime dependencies**. Everything shipped here is either Markdown
documentation or JavaScript that uses only Node.js built-in modules (`node:fs`,
`node:path`, `node:test`, and similar), under Node >= 18.

Consequences:

- `package.json` has no `dependencies`, no `peerDependencies` and no
  `optionalDependencies`. Importing anything else is a finding of `tools/gates/deps.mjs`.
- `npm test` runs the built-in test runner; nothing is bundled into any artefact.
- No third-party license text needs reproducing beyond this project's own
  [`LICENSE`](LICENSE) (Apache-2.0) and [`NOTICE`](NOTICE).

Node.js itself is a prerequisite, not a bundled component; it carries its own license.

## Development dependencies (2026-10-02) — not distributed, not imported

Resolving **R-1** ([policy/relaxations.md](policy/relaxations.md)) meant the third leg of
Trilateral Verification needed a real type checker, so `npm install` is now required for
development. Three packages end up in `node_modules/`; **none of them is a runtime
dependency, none is imported by any module here, and none is distributed**: `tsc` runs
with `noEmit`, so it never produces an artefact that could carry them.

| Package | Version | License | Why it is installed |
|---|---|---|---|
| `typescript` | 5.9.3 | **Apache-2.0** (`node_modules/typescript/LICENSE.txt`) | The type checker. `tsc --noEmit -p jsconfig.json` is the typecheck leg of `npm run trilateral`. |
| `@types/node` | 24.19.1 | **MIT** (Microsoft Corporation) | Declarations for the `node:` built-ins this project already imports. Major 24 matches the local Node major. |
| `undici-types` | 7.24.6 | **MIT** (Matteo Collina and Undici contributors) | Transitive dependency of `@types/node`. Declarations only; nothing references it directly. |

Each license above was read from the installed package (`license` field plus the
`LICENSE`/`LICENSE.txt` file), not assumed from reputation. Both direct entries are
pinned exactly and justified in
[policy/allowed-dependencies.json](policy/allowed-dependencies.json); `package-lock.json`
pins the whole tree. `tests/license.test.mjs` fails if the installed tree ever stops
matching this table.

## Explicitly NOT included

- **three.js** — the original Portuguese project included a local web dashboard that
  rendered a graph with three.js. That dashboard is **not ported** to this repository,
  and three.js is **not** present, vendored, referenced or required here. Nothing in
  Cellular Mode needs a browser or a graphics library.
- Any other library used by the original project's private tooling.

## Ideas credited (no code, no text reproduced)

These are intellectual acknowledgments, not software components. No source code and no
text from them is included in this repository.

| Source | What is credited | Where |
|---|---|---|
| Ideas publicly shared by **Fábio Akita** on AI-assisted development | Inspiration for the engineering-policy layer: test-first discipline with agents, project-level instruction files, and refusing to accept unverified agent output. The layer in this repository was written independently, in its own words and its own structure. No endorsement is implied. | `docs/05-engineering-rules.md` |
| **David L. Parnas**, *On the Criteria To Be Used in Decomposing Systems into Modules*, Communications of the ACM 15(12), 1972 | The principle that a well-defined interface can replace coordination — the basis of contract-mediated handoff. Cited, not quoted. | `docs/04-collaboration.md` |

## Reporting an omission

If you believe something in this repository derives from a third-party work that is not
credited here, please open an issue describing the file and the source. Attribution
errors are treated as defects.
