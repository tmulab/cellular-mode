# Cellular Observer — install, start, inspect, stop, remove

A local, read-only dashboard over a Cellular Mode vault: counts, the active cell, the cells table, a cell
detail panel, a timeline, a dependency graph in 2D with an optional 3D view, a deterministic AUDIT area and an
optional, disabled-by-default ADVISOR area. The graph arrives **framed** — the same deterministic fit the
`fit` control applies — and its labels keep a readable size at any zoom, while above 160 cells the labels
step aside and the shapes remain. It is an **independent application** served by its own loopback
server with an `/api/v1` reverse proxy to the EIP host — [ADR 0003](../../docs/adr/0003-observer-frontend.md).
Full stage-3 account: [`OBSERVER_REPORT.md`](../../OBSERVER_REPORT.md) · criteria:
[`ACCEPTANCE.md`](ACCEPTANCE.md) · the part only a human can check: [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md).

It never writes to the project it reads, and it binds `127.0.0.1` with no option to bind anything else.

## 1 · Install

**There is nothing to download and nothing to build.** The application ships in this repository: plain HTML,
CSS and ES modules, plus one vendored library (`vendor/three@0.180.0/`, MIT, SHA-256 pinned). Requirements:

- **Node ≥ 18** — that is all the launcher needs. Zero runtime dependencies.
- `npm install` is needed only for `npm run typecheck` (two dev-only packages: `typescript`, `@types/node`).
  The app itself runs without `node_modules`.

Verify the copy you have, from the repository root:

```
npm test            # whole suite, including this app's tests and the three.js hash pin
npm run typecheck   # two configurations: node code, and the browser code with lib DOM
npm run gates       # size · secrets · deps · import boundaries
```

## 2 · Start

```
node apps/observer/cli.mjs --root <path-to-a-project-with-a-vault>
node apps/observer/cli.mjs --root . --advisor fixture        # with the ADVISOR area live
node apps/observer/cli.mjs --root . --adaptive               # show a mode the human declared
node apps/observer/cli.mjs --root examples/observer-demo --port 0   # 0 = any free port
node apps/observer/cli.mjs --fixture                         # recorded fixtures, no vault, no host
node apps/observer/cli.mjs --help
```

Every option the launcher has, and no others (`--help` prints the same list):

| Option | Meaning |
|---|---|
| `--root <dir>` | the project whose `vault/state` is read. Required unless `--fixture` |
| `--port <n>` | port for the app on `127.0.0.1`. Default `3200`; `0` picks any free port |
| `--advisor <id>` | load the advisor plugin with this model adapter. Default: **not loaded**. The only id this build offers is `fixture` |
| `--adaptive` | load the optional `adaptive.preferences` reader, so the header can show a mode **the human declared** in `.cellular/adaptive/`. Default: **not loaded**, and then nothing on the page changes. Requires `tools/adaptive/` to be present in the checkout |
| `--fixture` | serve the interface against the recorded contract fixtures, with no host and no vault — for reviewing the UI, never for reading a project |
| `--help` | print the usage and exit 0 |

An unknown argument, a bad `--port`, a missing `--root`, an unknown `--advisor` id, or `--adaptive` in a
checkout with no adaptive module, exits **2** with a sentence (for example
`unknown advisor adapter "nope"; this build offers "fixture"`) and loads nothing.

### What `--adaptive` changes, and what it can never change

With the flag, the header shows a small **read-only** badge — `declared mode · mode: tired · declared 13:26 ·
until 17:26 · declared by you` — and the areas adjust **presentation only**: `tired` puts verdicts (`FAIL`,
`WARNING`) and security findings first and in full, and defers the tail of what is merely
informative behind a `show all` control;
`focus` orders the active cell's items first and narrows the timeline to it by default; `explore` opens the
advisor's alternatives; `ready` is today's behaviour, exactly. An **expired** or **unreadable** declaration
is shown too, with the reason, because something changed with nobody doing anything.

**Every `FAIL` and every security finding (`secrets`, `deps`, `import-boundaries`) is rendered in full under
every mode** — that is an invariant with its own test file (`tests/mode-invariant.test.mjs`), proved against a
500-finding list. There is **no mode selector**: a mode is declared by the human at their own terminal or with
their own command (`node tools/adaptive/cli.mjs set tired`), never by this dashboard, which has no capability
to write one. Writing a mode from the Observer is recorded as **future work** and is deliberately not built.

On success it prints the URL, the vault it is reading (or `RECORDED FIXTURES — no vault is being read`), the
capability keys that were loaded, and how many allowlisted files it will serve. Open the URL in a browser.
Fixture mode: append `?source=fixture` to the URL, and `&size=500` for the 500-cell demo.

## 3 · Inspect what is running

Against the app's own port — the `/api/v1` proxy forwards to the host, so one port is enough:

```
curl -s http://127.0.0.1:3200/api/v1/health
# {"ok":true,"value":{"status":"ok","sdk":"1","devUi":false,
#  "plugins":["observer.audit","observer.state"]}}

curl -s http://127.0.0.1:3200/api/v1/plugins          # every manifest, with its capabilities

curl -s -X POST http://127.0.0.1:3200/api/v1/plugins/observer.advisor/capabilities/status \
  -H 'content-type: application/json' -d '{"input":{}}'
# started WITHOUT --advisor:  404 {"ok":false,"error":{"code":"NOT_FOUND",…}}   <- disabled, not broken
# started WITH --advisor fixture: 200 {"ok":true,"value":{"enabled":true,
#   "adapter":{"id":"fixture","network":false,…},"calls":{"used":0,"remaining":20},…}}
```

The `plugins` list in `health` is the honest answer to "what is loaded": if `observer.audit` is absent, the
AUDIT area of the page says `not available in this build` rather than inventing numbers.

## 4 · Stop

**Ctrl+C** in the terminal that started it. The launcher handles `SIGINT` and `SIGTERM`, closes the app server
and then the host, and exits 0. Nothing is left listening and nothing was written to the project.

## 5 · Disable

- **Disable the observer:** do not start it. It is not a service, there is nothing to switch off, and the
  runtime (`node eip/host/cli.mjs`) does not load any `observer.*` plugin.
- **Disable the advisor:** omit `--advisor`. It is disabled by default, which here means *not in the plugin
  list*: the key does not exist and a call answers `404 NOT_FOUND`. The page does not make that call — it
  reads `health.plugins` first, sees no `observer.advisor`, and the ADVISOR area then states exactly
  `Advisor disabled (optional). Observer and Auditor work without it.` with its controls disabled and **no
  diagnostic**: a documented default is not a fault. An advisor that IS listed and then refuses still shows
  its error, because that one is real ([ACCEPTANCE.md](ACCEPTANCE.md) D23).
- **Disable the 3D view:** it is already off. 2D is the default and the three.js modules are imported only
  when the `show 3D` toggle asks for them.

## 6 · Remove it completely

Delete these, and the observer is gone:

```
apps/observer/                                  # this application, including the vendored three.js
eip/plugins/observer-state/  observer-audit/  observer-advisor/
eip/plugins/observer-*.mjs                      # the plugin tests and their fixtures
eip/host/observer-composition.mjs               # the composition
eip/host/read-port.mjs  eip/host/repo-read-port.mjs  (+ their *.test.mjs)
examples/observer-demo/                         # the demo vault, OBSERVER_REPORT.md
```

To keep the suite and the gates green after that, also drop the references to what you deleted:
`tests/gates-evidence.test.mjs`, the `x-observer-*` blocks of `api/openapi.json`, `OBSERVER_PURE_IMPORTS` and
`HOST_GATE_IMPORTS` in `tools/gates/allowlists.mjs` with the `observer-plugin-imports-only-named-pure-modules`
rule in `boundaries.mjs`, the `apps/observer` entries in `jsconfig.json`, and the second configuration in the
`typecheck` script of `package.json`. Then `npm test && npm run typecheck && npm run gates`.

**Cellular Mode and your vault are unaffected, structurally.** The method — `AGENTS.md`, `skills/`, `docs/`,
`templates/`, `tools/cellmode/` and `vault/state/` — contains no import of `eip/` at all, and cannot: the
import gate rule `cellular-mode-is-runtime-independent` in `tools/gates/boundaries.mjs` is a hard deny, run on
every `npm run gates`. The arrow only ever pointed the other way, so deleting the reader cannot reach the
record. After the deletions, `node tools/cellmode/cli.mjs check` still passes and your vault is byte-identical
— the observer only ever read it.
