# Observer report — stage 3 (Cellular Observer)

Scope: `eip/plugins/observer-{state,audit,advisor}/`, `apps/observer/`,
`eip/host/{read-port,repo-read-port,observer-composition}.mjs`, `examples/observer-demo/`,
[ADR 0003](docs/adr/0003-observer-frontend.md). Stage 2: [`ARCHITECTURE_REPORT.md`](ARCHITECTURE_REPORT.md) ·
stage 1: [`MIGRATION_REPORT.md`](MIGRATION_REPORT.md) · the map: [`docs/09-architecture.md`](docs/09-architecture.md).
Labels: **VERIFIED** (run in this cell, output in §10) · **INFERRED** (stating what from) · **PROPOSED**
(not built) · **UNKNOWN** (not established, never rounded up to green).

## 1 · Reused from the original dashboard

The original is the Portuguese `tools/painel/` of *Modo Celular*, a private project, read only: **nothing
outside this repository was written** (the stage-3 hash baseline is in `vault/state/log.md`). The port is a
rewrite in English with the same mechanics, not a copy of its text.

| Original file | Here | What carried over |
|---|---|---|
| `grafo3d.mjs` (the layout, one for both views) | `eip/plugins/observer-state/layout.mjs` | **"the scene computes nothing"**: positions are arithmetic, computed once, consumed by both views |
| `svg2d.mjs` | `apps/observer/view/svg-2d.mjs` | the 2D view as a *projection* of the same model with `z` discarded — not a second drawing |
| `selecao.mjs` | `apps/observer/view/selection.mjs` | one selection state machine, two paintings (neighbours, focus, clear) |
| `cena3d.mjs`, `camera3d.mjs`, `orbita.mjs`, `rotulos.mjs` | `apps/observer/web/{scene-3d,camera-3d,orbit,labels}.mjs` | the three.js scene as geometry only, camera fit, the own orbit controller (`OrbitControls` is still not vendored — `vendor/VENDOR.md`), constant-size labels with a level-of-detail threshold |
| `zoom2d.mjs`, `interacao2d.mjs` | `apps/observer/web/{zoom-2d,interaction-2d}.mjs` | zoom/pan state outside the DOM; pointer gestures, and "a click after a drag is not a selection" |
| `estilo.mjs` | `apps/observer/view/tokens.mjs` + `web/app.css` | one source of colour; contrast computed by a test, not eyeballed |
| `pagina.mjs` | `apps/observer/web/index.html` | the self-contained page: no CDN, no build |
| `painel.mjs` | `apps/observer/{server,proxy,headers,assets,cli}.mjs` | a tiny local server that never writes to the project it reads |
| `vendor/three@0.180.0/` | `apps/observer/vendor/three@0.180.0/` | the two build files, **byte-identical**, SHA-256 pinned, MIT licence beside them |
| `CONTRATO-PAINEL.md`, `-V2A.md`, `-V2B.md` | `apps/observer/{ACCEPTANCE,MANUAL-CHECKS}.md`, ADR 0003 | criteria before code, and the human-review list kept visible instead of implied |

## 2 · Modified, and why

- **The layout moved to the server** and its meaning changed. `grafo3d.mjs` ran in the page and drew a radial
  constellation of *packages*; `layout.mjs` runs in the plugin and ships `x/y/z` in the `graph` payload, with
  **column = status** (always all four protocol statuses, so a column never moves when a cell changes
  status), **layer** = longest declared dependency path and **rank** = `INDEX.md` order.
- **The parser was not ported** — a second parser of the vault is a second truth, so `observer-state/model.mjs`
  reuses the `tools/cellmode` **pure** modules instead of `parse.mjs`, with the bytes arriving through a host
  read port. `grafo.mjs` was dropped outright: it read a private project's key map, with no equivalent here.
- **2D is the default, 3D optional** (D17), loaded only when the toggle asks. **No SSE:** every capability
  re-reads the vault per call, so no cache can go stale. **The page is a file, not a generated string**, which
  is what makes "no inline script" checkable. **No original test was ported:** several were hard-wired to a
  private project's names and counts, so every test here was written fresh against an `ACCEPTANCE.md`.

## 3 · Newly implemented

- **`observer.state`** — `overview`, `cells`, `cell-detail`, `graph`, `timeline` (O1–O18). **`observer.audit`**
  — `run-audit`, `findings` over eight deterministic rules (A1–A20), vocabulary
  `PASS | FAIL | WARNING | UNAVAILABLE | NOT_APPLICABLE`. **`observer.advisor`** — `advise`,
  `recommendations`, `status` (V1–V23): bounded context, strict parsing, grounding, limits, fixture adapter.
- **The Trilateral evidence record** (`trilateral.mjs --evidence` writes `.cellular/evidence/trilateral.json`,
  gitignored; `tools/gates/EVIDENCE.md` is its contract) and the **host read ports** `read-port.mjs` (vault)
  and `repo-read-port.mjs` (repository, evidence, git head), both path-confined and read-only.
- **`apps/observer/`** — allowlist server, `/api/v1` proxy, launcher, pure view layer, browser modules,
  hand-written three.js type subset, fixtures, second typecheck config · **`examples/observer-demo/`**, a
  public reproducible vault (4 cells, one deliberately dangling dependency) · `cellmode open|plan --deps` ·
  `tools/gates/VENDOR-EXCLUSION.md` and `allowlists.mjs`.

## 4 · Kernel and host integration

**Plugins.** Three ordinary manifests on the existing SDK and kernel; no kernel feature was added for them.
`observer.state` declares `permissions: ['fs.read']`; `observer.audit` declares `fs.read` plus
`inject: { 'observer.state': required }`; `observer.advisor` declares **`permissions: []`** and injects both siblings. Every capability is `consequential: false`.

**Ports.** Read only, path-confined by construction. `readVault(relName)` takes a closed set of names under
`<root>/vault/state` (`INDEX.md`, `CURRENT-CELL.md`, `log.md`, `parking-lot.md`, `cells/<slug>.md`), plus
`listCells()`; the auditor adds `readRepoFile(rel)`, `listRepoFiles()`, `readEvidence()` (exactly one path)
and `readHead()`. Separators, `..`, absolute and drive-letter forms, NUL and symlink/junction escapes are refused with `PERMISSION_DENIED`. **No write port exists in the composition at all** — `observerComposition` omits `reportsDir`, so the privilege was never created rather than withheld.

**Composition.** `eip/host/observer-composition.mjs` is the only module that knows an "observer" exists; the
host stays generic. `OBSERVER_PLUGINS` holds `observer.state` alone, the auditor is appended when its module
is present, the repository ports are built **only** when the auditor is in the list, and the advisor is built by `advisorPlugin({ id })`, which resolves the adapter id against a registry the host owns and otherwise throws, naming the ids that exist.

**Kernel extension (the one that was needed).** `PASSTHROUGH_CODES` lets a plugin's own `NOT_FOUND` and
`INPUT_INVALID` travel with their code, message and `details`; every other throw is still contained as
`PLUGIN_ERROR`, so a plugin cannot forge `APPROVAL_*` or `PERMISSION_DENIED` — authority codes stay the
kernel's (`eip/kernel/containment.test.mjs`, K14).

**Boundary allowlists.** `tools/gates/allowlists.mjs` holds two hand-checked lists as data:
`OBSERVER_PURE_IMPORTS` (17 named pure modules of `tools/cellmode` and `tools/gates` an `observer-*` plugin
may import — never `state.mjs`, `paths.mjs`, `clock.mjs`, the CLI, `scan.mjs`, `git-head.mjs` or a spawning shell) and `HOST_GATE_IMPORTS` (`exclusions.mjs`, `evidence.mjs`, `git-head.mjs`). The reverse arrow is still a hard deny: **`tools/cellmode` may not import `eip/`**.

## 5 · How the frontend runs

`node apps/observer/cli.mjs --root <project> [--port 3200] [--advisor fixture] [--fixture]` starts the host
composition on a free **127.0.0.1** port, starts the application server on the port asked for, prints the URL
and the capability keys, and stops both on Ctrl+C. Lifecycle: [`apps/observer/README.md`](apps/observer/README.md).

- **Allowlist static server.** `assets.mjs` lists every file that can ever be served (31 in this build); a path is looked up in that table, never joined onto a directory, and unknown paths, `..`, encoded `..`, backslashes and directory paths all answer 404 with no listing.
- **Reverse proxy.** `/api/v1/...` is forwarded to the host with method and JSON body intact; any other
  `/api/...` path is 404 with no upstream request, an oversized body 413, a silent upstream 504.
- **One origin, so no CORS.** The CSP is plain `'self'` with no `unsafe-*` — `default-src`, `script-src`, `style-src`, `img-src`, `font-src` and `connect-src` all `'self'`, `object-src`/`base-uri`/`frame-ancestors`/`form-action` all `'none'` (exact string asserted by D3) — plus `nosniff`, `no-referrer` and `DENY`, and no `Access-Control-Allow-*` header anywhere.
- **Loopback only, with no flag to change it**, because the process reads a whole vault. **No build step, no
  network:** what is served is what is in the repository, and no served asset holds an external URL (D6).

## 6 · Optional capabilities

Delete `apps/observer/`, `eip/plugins/observer-*` and the host's observer modules, and the method, the CLI, the gates and the runtime are untouched.

| Layer | Default | How to turn it on |
|---|---|---|
| `observer.state` | loaded by the observer composition | implied by starting the app |
| `observer.audit` | loaded when its module is present | implied; absent ⇒ the AUDIT area says `not available in this build` |
| `observer.advisor` | **not loaded** | `--advisor fixture`; without it the key is absent and a call answers 404 `NOT_FOUND` |
| 3D view | off (2D is the default) | the `show 3D` toggle, which lazily imports the 3D modules |
| Repository read ports | not created | created only when `observer.audit` is in the plugin list |

## 7 · Operational model integrations

There is **no model integration in operation**. The only adapter that ships is `fixture`: deterministic canned
answers keyed by a hash of the question and the context ids — no weights, no network, no randomness (VERIFIED:
`status` reports `fixture · network: false`). **Local small model — PENDING:** not built; it needs a weight
file, a licence review and a decision about where weights live, none of which was in this cell. **Remote
provider — PROPOSED, refused by default:** no provider SDK, no endpoint and no token exists anywhere in this
repository; the registry refuses any adapter whose `describe().network` is `true` unless a human passes
`allowNetwork`, and the plugin refuses to be created with one. Advisor output is **data**: parsed strictly,
stripped to the five declared fields, grounded against the evidence ids it was given (an ungrounded
`VERIFIED`/`INFERRED` claim is downgraded to `UNKNOWN`), rendered with `textContent` — never executed, never a
command, a capability call or an approval.

## 8 · Experimental

The runtime is still **minimal and experimental (API v1, not frozen)** and the observer inherits that; **ADR
0003 was approved by Hudson A. R. Bonomo on 2026-10-03** (independent local app, no Next.js in this version).
The advisor is the most experimental part: one fixture adapter, no real model, deliberately conservative
grounding. `observer.audit`'s `acceptance-criteria` rule judges one convention (GFM checkboxes) and answers
`NOT_APPLICABLE` when it finds none — it does not measure whether criteria hold. **Browser checks were run on
2026-10-03** (headless Edge 154 over the DevTools protocol, real WebGL; results per item in `MANUAL-CHECKS.md`).
They found and fixed five UI defects, worst an infinite recursion on every cell selection that no unit test
had caught. Items needing human judgement (perceived contrast, screen reader, feel) remain open there.
Known minor: a completed cell's logged next step "—" (none, by protocol) renders as "not recorded".

## 9 · Security limitations

| Limitation | Label |
|---|---|
| Plugins run **in-process with full Node privileges**. Permissions and ports are a least-privilege *contract*, **not a sandbox**: a plugin can `import('node:fs')` and ignore every port it was given. Trusted local plugins only (`SECURITY.md`, `docs/09-architecture.md` §9) | VERIFIED by inspection: `eip/` contains no isolation mechanism |
| The repository read ports are granted by **permission**, not per plugin: with `observer.audit` loaded, `readRepoFile`/`listRepoFiles` are visible to `observer.state` too, since both declare `fs.read`. They are read-only and exclusion-filtered, so the exposure is "may read more of the repository than it needs", never "may write" | VERIFIED by reading `observerComposition` and the kernel's port grant |
| The advisor's bounded context comes from the vault and the last audit, so a vault holding hostile prose puts that prose in a model prompt. The defence is that the answer is untrusted data, not that the input is clean | INFERRED from the context builder and the validation suite |
| **No authentication, no rate limiting.** The loopback bind is the whole access control for both the host and the app; anything on the machine can call either | VERIFIED |
| Symlink-escape refusal is verified on win32 through a directory junction; POSIX symlink behaviour is untested here | VERIFIED (win32) / UNKNOWN (POSIX) |
| Automated browser checks passed headless; perceived contrast, screen-reader output and "feel" are still human items | VERIFIED (automated items) / open (human items) |
| No Trojan Source gate exists: literal invisible/bidi characters were found in three files this stage and replaced by escapes **by hand**, and nothing stops the next one. Mutation verdicts are likewise hand-applied, never re-run by a gate | VERIFIED (both facts) / the gate is PROPOSED |

## 10 · Verification — executed in this cell, 2026-10-03

```
npm run typecheck  -> tsc -p jsconfig.json && tsc -p apps/observer/jsconfig.json (exit 0, no output)
npm test           -> tests 491 · suites 36 · pass 491 · fail 0 · skipped 0 · todo 0
npm run gates      -> scanned 361 files (200 modules)
                      size · secrets · deps · boundaries — no findings; pending exceptions: 0
node tools/gates/trilateral.mjs --evidence   (exit 0)
                   -> typecheck: tsc --noEmit -p jsconfig.json — 0 error(s)
                      build: no build step — module-load gate: 119 modules imported (81 skipped)
                      tests: 491 passed, 0 failed, 491 total (node --test)
                      evidence: wrote .cellular/evidence/trilateral.json (gitignored)
node tools/gates/check-all.mjs --release
  -> release: no blockers — every exception approved, every relaxation resolved (exit 0)
node tools/cellmode/cli.mjs check
  -> Integrity check passed · 1 active · 0 paused · 0 planned · 25 done · 26 log entries
node examples/text-stats/reproduce.mjs    -> vault reproduced: 8 files identical, 9 commands, check exit 0
node examples/observer-demo/reproduce.mjs -> vault reproduced: 9 files identical, 9 commands, check exit 0
```

Live smoke, `node apps/observer/cli.mjs --root examples/observer-demo --port 3287` — started, exercised over HTTP, then stopped:

```
launcher  capabilities: observer.state, observer.audit · serving 31 allowlisted files
GET  /api/v1/health  200 {"status":"ok","sdk":"1","devUi":false,"plugins":["observer.audit","observer.state"]}
POST overview        200 counts {total:4, planned:1, active:1, paused:1, done:1} · active tag-filter ·
                          warnings 1 · integrity.ok true · recent 2
POST graph           200 nodes 4 · edges 4 (markdown-parser->note-storage, search-index->markdown-parser,
                          tag-filter->note-storage, tag-filter->markdown-parser) · dangling 1
                          (search-index->full-text-engine) · layers 3
POST cell-detail {id:"no-such-cell"} 404 NOT_FOUND · {id:"../../etc/passwd"} 400 INPUT_INVALID
POST observer.advisor/status (no --advisor flag)  404 NOT_FOUND
GET  /../package.json · /%2e%2e/package.json · /web/ · /api/v2/health  404 · 404 · 404 · 404
GET  /               200 CSP default-src 'self'; … object-src 'none'; base-uri 'none'
```

Second smoke, `--root . --advisor fixture` (this repository, same lifecycle): `run-audit` →
`{PASS: 11, FAIL: 0, WARNING: 1, UNAVAILABLE: 0, NOT_APPLICABLE: 1}` over 13 findings — the WARNING is
`cell-contract` (the active cell records no next step, a real finding), the NOT_APPLICABLE is
`acceptance-criteria`; `advisor/status` → 200, `enabled: true`, adapter `fixture`, `network: false`,
`calls 0/20`. Both servers were stopped. Not executed here and therefore not claimed: anything a browser does
(§9), POSIX symlink behaviour, and any mutation verdict (the recorded tables were not re-applied here).

## 11 · Remaining technical work

Each is one cell, sized for one session, with a binary done criterion. **None is started.**

| Proposed cell | Done when |
|---|---|
| **Observer human checks** | the LEFT FOR HUMAN items in `apps/observer/MANUAL-CHECKS.md` are performed by a person and recorded |
| **Trojan Source gate** (parking lot) | a gate fails on a fixture holding a literal U+200B–200F / 202A–202E / 2066–2069 / FEFF character and passes on the escaped form; removing the rule turns the test red |
| **Done-cell next step wording** | the timeline renders a completed cell's logged "—" as "none (cell done)", not "not recorded" |
| **Per-plugin port grants** | `observer.state` cannot see `readRepoFile`/`listRepoFiles` with the auditor loaded, proved by asking from inside the plugin |
| **POSIX symlink verification** | both read ports' symlink refusals run on Linux or macOS with the output recorded, and removing the guard goes red there |
| **Stage-3 commit** (human) | the stage-3 tree is committed with explicit authorization; until then `RELEASE_CHECKLIST.md` records it as pending |
| **Local small-model adapter** (PENDING) | a local adapter passes the full validation and grounding suite with no network, and the weight licence and location decision is recorded in an ADR |
