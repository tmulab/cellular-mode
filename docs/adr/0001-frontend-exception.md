# ADR 0001 — The frontend exception: complex UIs are not plugins

- **Status:** **Accepted — approved by Hudson A. R. Bonomo, 2026-10-02.** The
  approval states the rule as: complex production interfaces remain independent
  applications communicating through defined APIs; simple plugin interfaces
  remain optional.
- **Amended 2026-10-03; amendment approved by Hudson A. R. Bonomo, 2026-10-04:** see
  *Amendment — application plugins* at the end. The decision below is unchanged;
  the amendment only names a way to REGISTER an independent frontend.
- **Date:** 2026-10-02
- **Deciders:** Hudson A. R. Bonomo (approver), with the implementation agent as
  proposer
- **Scope:** `eip/` runtime and any application built on it

## Context

"Everything is a plugin" is a claim about **capabilities**: a unit declares what
it provides, what it needs, which permissions it expects, and the composition
wires it. The claim holds beautifully for domain logic. It breaks down for
production user interfaces, and pretending otherwise would cost more than it
saves.

A real UI brings its own build system, its own routing, its own rendering model,
its own dependency tree, its own release cadence and — decisively — its own
**authentication and session handling**. Expressing that as a plugin manifest
would mean either smuggling a toolchain into the runtime (destroying the
zero-dependency property and the 200-line rule) or inventing a second, weaker
plugin kind whose contract nobody could validate. Both make the architecture less
honest, not more uniform.

At the same time, a plugin that cannot be exercised by hand is hard to trust
during development, and a diagnostics form is a genuinely useful thing to ship
next to a capability.

## Decision

1. **A production UI is an independent application**, not a plugin. It may live
   in the same monorepo. It consumes the runtime exclusively through
   `api/openapi.json` over HTTP.
2. **The browser never calls the runtime directly.** The host binds `127.0.0.1`
   and sends no CORS headers. The UI application calls the API **from its own
   server** (for example a Next.js route handler), which is where it holds
   credentials, authenticates its users and decides what the browser may ask for.
   See `examples/api-client/`.
3. **`devUi` stays, with a narrow mandate:** static HTML/CSS fragments for local
   testing, diagnostics and simple administration. Capped at 64 KB, served only
   when the host is started with `--dev-ui`, wrapped by the host in a document
   with a CSP that permits no inline script, no inline style and no third-party
   origin. The plugin ships markup; the host owns the document and the one
   same-origin script.
4. **The contract is hand-written.** `api/openapi.json` is reviewed like source
   code, and a test validates real responses against it, so an independent
   frontend is built against something that has been checked rather than
   described.

## Consequences

**Positive.** The runtime keeps zero dependencies and stays auditable. Frontend
and runtime version independently. Authentication lands where sessions already
live, instead of being reinvented inside a plugin kernel. The attack surface of
the runtime is one loopback socket. Any stack can integrate, because the contract
is a document, not a package.

**Negative.** Two deployables instead of one, and a second hop for every call.
The OpenAPI document must be maintained by hand — accepted deliberately, and
mitigated by the contract test. UI developers cannot reach capabilities that are
not exposed over HTTP; adding a route is a conscious act, which is the point.
Type sharing across the seam is manual: there is no generated client in the
repository.

**Neutral.** A plugin's own simple interface stays **optional**: the decision
separates complex production UIs from the runtime, it does not forbid a plugin
from shipping a small diagnostics fragment.

**Neutral.** `devUi` pages are not part of the API contract and are not
documented in `api/openapi.json`, on purpose: documenting them would invite
production use of a diagnostics surface.

## Alternatives considered

- **UI as a plugin (rejected).** Would require a build toolchain, dependencies
  and a second contract kind inside the runtime; plugin boundaries would end up
  carrying session state.
- **Server-side rendering inside the host (rejected).** The host would acquire a
  templating engine and a view layer — a privileged core by another name, and far
  more than 200 lines per file could honestly hold.
- **CORS enabled so the browser calls the runtime directly (rejected).** The
  runtime would become an unauthenticated public API, and a consequential
  capability would be one XSS away from a human-less approval.
- **A generated client committed as runtime code (rejected).** A dependency
  nobody reads. A hand-written example client plus a validated contract gives the
  same integration path with none of the opacity.

## Amendment — application plugins (2026-10-03, PENDING human confirmation)

UPP 1.0 adds a plugin **kind** for this exact case, and it does not weaken the
decision above. An independent frontend **MAY** optionally be registered as an
application plugin (`type: "application"`, `docs/upp/APPLICATIONS.md`).

**Registration is identity, not in-process execution.** The kernel never loads an
application, never proxies its frontend, never gives it a service, a port or a
capability. What registration adds is a reviewed name: a pinned manifest, an
operator authorisation, a health state, and a line in `GET /api/v1/plugins`. The
app still runs on its own, still brings its own build and routing, and still
reaches the runtime **only** through `api/openapi.json` over HTTP, from its own
server — points 1–4 of the decision stand word for word.

What this buys: "everything is a plugin" becomes true for interfaces without a
toolchain entering the runtime (ADR 0002 intact, measured by U32), and an
operator can see the UI in the same inventory as everything else instead of in a
deployment script nobody reads.

What it deliberately does **not** buy: no CORS by default, no kernel port, no
session handling in the host, no frontend code in `eip/`, no new route. An app
that also wants to *provide* capabilities ships a second, ordinary capability
manifest — so identity never implies execution.

Registration stays **optional**: an independent frontend that is never listed in
`upp.config.json` keeps working exactly as this ADR describes.
