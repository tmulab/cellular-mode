# ADR 0003 — The observer frontend is an independent local app, not a plugin UI and not Next.js

- **Status:** **Accepted — approved by Hudson A. R. Bonomo, 2026-10-03.** Implemented in
  `apps/observer/`: an independent local web application, without Next.js in this version.
  This does not prevent future Next.js applications from registering as application-type plugins.
- **Date:** 2026-10-02
- **Deciders:** implementation agent (proposer); Hudson A. R. Bonomo (confirmation pending)
- **Scope:** `apps/observer/`, and any future user interface over the `eip/` runtime
- **Extends:** [ADR 0001](0001-frontend-exception.md) (complex UIs are not plugins),
  [ADR 0002](0002-zero-dependency-kernel.md) (zero runtime dependencies)

## Context

The observer has to show a vault: counts, the active cell, warnings, a cells table, a cell
detail panel, a timeline, and a graph of declared dependencies in 2D with an optional 3D
view. That graph is the reason this is a real interface and not a form — it needs a canvas,
a camera, pointer gestures, keyboard equivalents and a vendored WebGL library.

Three options were available, and the existing architecture already rules on two of them.

## Options considered

### A · A plugin `devUi` fragment (rejected)

`eip/host/dev-ui.mjs` renders a diagnostics page for a plugin: a title, an HTML fragment,
one shared script and one shared stylesheet, under a strict CSP. It is deliberately small —
a form to exercise a capability by hand.

It cannot carry this. The fragment is a string in a manifest, so there is no module
boundary, no per-view stylesheet, no vendored library and no place for 15 browser modules.
Pushing it there would mean either smuggling a toolchain into the runtime or weakening the
dev UI's CSP for everyone. **ADR 0001 already decided this**: complex production interfaces
stay independent applications that talk over a defined API; simple plugin interfaces stay
optional. This is the first case where that rule has teeth, and following it costs nothing.

### B · A Next.js application (rejected)

Next.js would give routing, a component model and a build pipeline. It would also give, on
day one: a `package.json` with hundreds of transitive runtime dependencies, a build step, a
`node_modules` tree bigger than this entire repository, a framework upgrade cadence that
does not belong to this project, and a second definition of "how a page gets to a browser".

Each of those contradicts something already decided and tested:

- **ADR 0002 / `tools/gates/deps.mjs`:** zero runtime dependencies, enforced. React alone
  would end that property, and `tests/license.test.mjs` would have to be rewritten from "no
  vendored code" to "a tree nobody audits".
- **The 200-line rule:** generated framework code is not handwritten, so it would need a
  blanket exclusion — a hole wide enough to park anything in.
- **`npm test` with no install step:** the suite runs on a clone with two dev dependencies.
  A framework would make the test leg depend on a successful install of hundreds of packages.
- **"Offline, no external URL":** a framework's default is a CDN font and a telemetry ping.
  Proving the absence of both, release after release, is work this cell does not need to
  take on.

The whole observer is one HTML file, one stylesheet, twenty small modules and one vendored
library. A framework would be larger than the thing it framed.

### C · An independent static app with its own tiny server (chosen)

`apps/observer/` is plain HTML, CSS and ES modules, served by `apps/observer/server.mjs`:
an explicit allowlist of files (no directory listing, no path built from a URL) plus a
reverse proxy that forwards `/api/v1/` to the host and nothing else. `apps/observer/cli.mjs`
starts the host composition on a free loopback port, starts the app, prints the URL, and
stops both on Ctrl+C.

What that buys, concretely:

- **One origin.** Because `/api` is proxied, the page and the API share an origin, so the
  CSP can be `default-src 'self'` with no `unsafe-*`, there is no CORS header anywhere, and
  the host never needs a cross-origin surface.
- **Loopback only, with no flag to change it.** The process reads a whole vault; a flag that
  could expose it to a network is a flag someone will eventually set.
- **No build step.** What is served is what is in the repository, so the offline property
  and the "no external URL" test are checks over files, not over build output.
- **The runtime stays untouched.** The kernel does not know this exists. No plugin gains a
  permission. The observer plugins get read ports and no write port at all.
- **One vendored dependency, pinned.** `three@0.180.0`, byte-identical to the npm artefact,
  SHA-256 pinned, MIT licence beside it, hashes asserted on every `npm test`
  (`apps/observer/vendor/VENDOR.md`, `tools/gates/VENDOR-EXCLUSION.md`).

### Cost, stated plainly

No framework means writing the pieces a framework would have given: a small DOM helper, an
explicit re-render per area, a hand-written type declaration for the three.js subset in use,
and a second type-check configuration with `lib: DOM`. That is roughly 200 lines of
scaffolding. It is also 200 lines that can be read in one sitting, and it is why the browser
code is type-checked as strictly as the server code.

## Decision

The observer frontend is an independent local application in `apps/observer/`, served by its
own loopback server with an `/api/v1/` reverse proxy to the host, using no framework and no
build step. Rendering logic that can be pure is pure (`apps/observer/view/`) and tested in
node; the DOM modules stay thin and are covered by `apps/observer/MANUAL-CHECKS.md`.

## Consequences

- The "no vendored third-party code" rule becomes "no vendored third-party code except the
  hash-pinned three.js directory", stated in `tests/license.test.mjs` and in
  `THIRD_PARTY_NOTICES.md` rather than quietly becoming false.
- `npm run typecheck` runs two configurations. A browser module that reaches for `process`
  fails, because the browser configuration declares no node types.
- Browser rendering is explicitly outside machine verification, and the checks a human must
  perform are written down and currently marked NOT YET PERFORMED.
- The observer can be deleted without touching the method, the CLI or the runtime. That is
  the test of whether it was really independent.

## What this does NOT decide (PROPOSED only)

A future production interface — multi-user, authenticated, deployed — could register as an
**application-type plugin**: a manifest that declares a UI surface and the capabilities it
consumes, while its build, routing and session handling stay entirely its own. That would be
the natural place for Next.js, and it would make "everything is a plugin" true for
interfaces without smuggling a toolchain into the kernel. Nothing of the sort exists: there
is no application-plugin kind in the SDK, no contract for it and no test. It is recorded
here as a direction, labelled **PROPOSED**, so a later cell can pick it up or reject it on
purpose rather than reinventing the question.
