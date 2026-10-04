# 09 · Architecture

This repository holds **three domains that do not depend on each other**. Reading them as
one system is the first mistake available, so they are named first and kept apart
everywhere else: in the directory layout, in the import gate, and in the tests.

## 1 · The three domains

| | Domain | What it is | Lives in | Depends on |
|---|---|---|---|---|
| **A** | **Cellular Mode** | a *methodology*: cells, recorded state, two procedures, one deterministic CLI | `AGENTS.md`, `skills/{cell,pause}`, `docs/01-04,06-08`, `tools/cellmode/`, `templates/`, `vault/state/` | nothing. Node built-ins for the optional CLI |
| **B** | **TMU-LAB Engineering Method** | *how* work is implemented and verified: the constitution, the engineering policy layer, seven optional skills, the automated gates | `docs/00-constitution.md`, `docs/05-engineering-rules.md`, `skills/{verify,protect,harden,sanity,coverage,port,decisions}`, `tools/gates/`, `policy/` | A (it records its results in cells); not the runtime |
| **C** | **Everything Is a Plugin** | an *architecture foundation* for systems built with the method: a plugin contract, a minimal kernel, a composition host, an agent gateway | `eip/`, `api/openapi.json`, `examples/api-client/` | B as a method, never A as code |

The independence is **mechanical**, not aspirational (VERIFIED by
`tools/gates/boundaries.mjs`, rule `cellular-mode-is-runtime-independent`, and by
`tests/`): Cellular Mode must keep working in a repository that has no `eip/` directory
at all, so no file under `tools/cellmode/`, `skills/`, `docs/`, `adapters/` or `templates/` may import the runtime.
Delete `eip/` and `api/` and the method is intact; delete `vault/state/` and the runtime still builds and tests.

Three vocabulary lines that prevent most confusion:

- A **cell** is a unit of *work*, with a human on the other side of it.
- A **plugin** is a unit of *capability*, with a contract on the other side of it.
- An **agent** is a *caller* with a role and an allow-list, and no authority to consent.

A cell is not a plugin. A plugin is not an agent. None of the three is a core.

## 2 · Layers

| Layer | Module | One responsibility |
|---|---|---|
| Methodology | `skills/`, `docs/01-04`, `tools/cellmode/` | bound the work and record it so resuming is cheap |
| Engineering & verification | `docs/00`, `docs/05`, `skills/verify…`, `tools/gates/` | decide what counts as *done*, and prove it mechanically |
| Contract floor | `eip/sdk/` | the manifest, the schema subset, the closed error list. Depends on nothing |
| Kernel | `eip/kernel/` | validate contracts, wire, grant ports, gate consequential acts, emit events |
| Plugins | `eip/plugins/<name>/` | one domain capability each, replaceable, SDK-only imports |
| Optional observation | `eip/plugins/observer-{state,audit,advisor}/` + `apps/observer/` | read a vault, audit it, interpret it — the first *optional* plugin set, deletable without touching anything else |
| Orchestration | `eip/orchestration/` | the single door an agent may use; allow-list + audit |
| Protocol & transports | `eip/upp/` (pure rules), `eip/upp-host/` (operator config, spawn, HTTP) | the language-neutral host↔plugin contract, and the only modules that start a program or open a client socket — imported by composition alone |
| Host / composition | `eip/host/` | the only module that knows every part: transport, ports, approver, dev UI |
| Published contract | `api/openapi.json` | what an independent application may rely on |
| External apps & UIs | outside this repository (`examples/api-client/` shows the shape) | own auth, own build, own release cadence |

## 3 · Dependency direction

Arrows point from the importer to the imported. Every arrow below is checked on every
`npm run gates` run; the rule ids are the ones in `tools/gates/boundaries.mjs`.

```
  independent UI app  (NOT a plugin — ADR 0001)        agent / LLM caller
          |                                                    |
          |  HTTP, contract = api/openapi.json                 |  createAgentGateway
          v                                                    v
  +---------------------------+                   +---------------------------+
  |        eip/host           |                   |    eip/orchestration      |
  |  node:http · dev UI ·     |                   |  allow-list · audit ·     |
  |  write port · approver    |                   |  human approver           |
  +----+--------+--------+----+                   +-------------+-------------+
       |        |        |                                      |
       |        |        |  host-composes-everything            | kernel PUBLIC entry only
       v        |        v                                      v
  +---------+   |   +-----------+                  +---------------------------+
  | text.   |   |   | text.     |                  |        eip/kernel         |
  | stats   |   |   | report    |                  | registry · lifecycle ·    |
  +----+----+   |   +-----+-----+                  | execute · events          |
       |        +---------+---------------------->  +------------+--------------+
       |                  |                                      |
       |  plugin-imports-sdk-and-own-dir                         | kernel-imports-sdk-only
       v                  v                                      v
  +-------------------------------------------------------------------------------+
  |     eip/sdk  —  manifest · schema subset · closed error codes · validators    |
  |                      sdk-depends-on-nothing                                   |
  +-------------------------------------------------------------------------------+

  Cellular Mode  (tools/cellmode · skills · docs · adapters · templates)
        --X-->  eip/        cellular-mode-is-runtime-independent  (hard deny)
  eip/sdk, eip/kernel  --X-->  node:http|https|net|tls|dgram, eip/host
                              kernel-and-sdk-are-transport-free  (hard deny)

  eip/host --> eip/upp-host --> eip/upp --> eip/sdk      upp-host-imports-protocol-kernel-entry-and-sdk
             (spawn · HTTP · pins)   (pure)              + the kernel PUBLIC entry, nothing else
  eip/upp  --X-->  eip/host, node:http|net|tls|fs|child_process     upp-is-transport-free  (hard deny)
  sdk · kernel · plugins · orchestration · Cellular Mode  --X-->  eip/upp, eip/upp-host  (hard deny)
```

Two arrows that are *absent* carry as much design as the ones that are present: a plugin never imports a sibling
plugin (siblings arrive as contracts through `inject`, resolved at call time), and nothing imports the host. Transport is a leaf, not a foundation.

## 4 · The kernel: what it does, and what it does not

**Implemented (VERIFIED — `eip/kernel/ACCEPTANCE.md`, 14 criteria, mutation verdict
recorded; `npm test` covers them).** Each responsibility is there because removing it
would move a guarantee into every plugin:

- `register(manifest)` — contract validation, one key one owner, named loud failures.
- `load(key, config, ports)` — config validated; **ports granted only for declared
  permissions**, an undeclared port is invisible rather than refused.
- `ctx.get(sibling)` — resolved at **call** time, so load order is irrelevant; required
  injects are checked for presence and cycles at load.
- `ctx.onDispose(fn)` — registration is a reversible effect; `dispose` runs the inverses
  in reverse order and refuses while a required dependent is loaded.
- `execute(key, cap, input, {signal, approval})` — validate input, require an approval
  issued by a **host-supplied approver** for consequential capabilities, run under an
  `AbortSignal`, validate output, return a structured `{ok}` result with no stack.
- `kernel.on('event')` — in-memory observability; silence is the default, nothing is
  written to stdout or stderr.

**Not implemented — PROPOSED, named here so nobody mistakes an idea for a feature.** None
of these exists in code anywhere in this repository:

| PROPOSED | Why it is not here yet |
|---|---|
| **Discovery from disk** — scanning a directory for manifests | loading code found on disk is an authority decision; composition is currently an explicit list in `eip/host/cli.mjs`, which is reviewable |
| **Hot reload** | `dispose` + `load` already give a reversible cycle; a *watcher* adds a second source of truth about what is running |
| **Sandboxed execution of untrusted plugins** | see §8 — this is the largest gap, and it is architectural, not an omission. UPP's process transport is **failure isolation, not confinement** ([`upp/SECURITY-REVIEW.md`](upp/SECURITY-REVIEW.md) §3) |
| **Worker isolation with ports across the seam** | UPP 1.0 crosses a process boundary by granting **no ports at all**; a *serialised* port is the design project the contract still does not have |
| **Workflow coordination, planners, multi-agent delegation** | `eip/orchestration/README.md` states each open question; a plan is only as safe as the allow-list it is drawn from |
| **Durable audit** | the gateway trail is in memory and dies with the process |

## 5 · The plugin contract

The authoritative summary is **[`eip/sdk/README.md`](../eip/sdk/README.md)**: manifest fields,
the `inject` vs **ports** distinction, the closed permission list, the schema subset, the error
codes and the public surface. Three lines shape the whole architecture: the plugin's `name`
**is** the key it provides; siblings arrive through `inject` while infrastructure, secrets and processes arrive as
**ports from the host**; and **keys degrade, ports fail loud**. The language-neutral host↔plugin protocol over this same contract is specified in [`docs/upp/`](upp/SPEC.md) — UPP 1.0, [ADR 0005](adr/0005-universal-plugin-protocol.md) — with its boundaries reviewed in [`docs/upp/SECURITY-REVIEW.md`](upp/SECURITY-REVIEW.md).

## 6 · API integration

[`api/openapi.json`](../api/openapi.json) is a hand-written OpenAPI 3.1 document and it
is **the** contract for anything outside this process. It is not documentation that
trails the code: `eip/host/openapi.test.mjs` asserts that every route the server answers
is documented, that every documented route is answered, that real response bodies
validate against the documented schemas with the SDK validator, and that the error `code`
enum equals the SDK's closed list. [`examples/api-client/`](../examples/api-client/) is a zero-dependency `fetch` client whose only purpose is to prove the document is enough. UPP does not touch it: the host is the *client* of a plugin endpoint, so the published three-route contract does not move.

## 7 · Frontend separation

Recorded in **[ADR 0001](adr/0001-frontend-exception.md)** (status: **Accepted — approved
by Hudson A. R. Bonomo, 2026-10-02**). A production UI is an
**independent application**, never a plugin: it brings its own build system, routing,
dependency tree, release cadence and — decisively — its own authentication. It consumes
the runtime only through `api/openapi.json`, and **the browser never calls the runtime
directly**: the host binds `127.0.0.1` and sends no CORS headers, so the UI application
calls the API from its own server, where it holds credentials and decides what the
browser may ask for. A plugin's `devUi` is a static fragment for local diagnostics and simple admin, capped at 64 KB and served only with `--dev-ui`. UPP's `type: "application"` **registers** such an application as a pinned identity the host may watch and, if the operator asks, start — it never loads it, proxies it or hands it a port ([ADR 0001](adr/0001-frontend-exception.md) amendment, [`docs/upp/APPLICATIONS.md`](upp/APPLICATIONS.md)).

**The first case with teeth — the Cellular Observer.** [ADR 0003](adr/0003-observer-frontend.md) (*Accepted,
approved by Hudson A. R. Bonomo, 2026-10-03*): three optional plugins on this same kernel —
`observer.state` (reads a vault), `observer.audit` (judges it against rules that already exist) and
`observer.advisor` (interprets it; **not loaded unless asked for**) — plus an **independent local
application**, `apps/observer/`, no framework and no build step, served by its own loopback server with an
`/api/v1` reverse proxy so page and API share one origin. The plugins get read ports and no write port at
all; the app has no flag that can bind off `127.0.0.1`. Delete all of it and the method, the CLI, the gates
and the kernel are untouched — [`OBSERVER_REPORT.md`](../OBSERVER_REPORT.md), [`apps/observer/README.md`](../apps/observer/README.md).

## 8 · Safety and authority boundaries

| Act | Who may authorise it | Fail-closed behaviour |
|---|---|---|
| Marking a cell ✔ done, switching the active cell | the human, explicitly | the CLI requires `complete --confirm`; an agent cannot self-certify |
| A batch or destructive operation | the human, explicitly | prepared and shown, never run; the agent waits |
| Mutating a protected resource | the human, per resource tier (`vault/policy.md`) | reading is free, mutation stops and asks |
| Relaxing a constitutional article | the human, documented in `policy/relaxations.md` | an undocumented relaxation is the failure mode the file exists to catch |
| Executing a **consequential** capability | a human approver the **host** supplies | no approver ⇒ `APPROVAL_REQUIRED`; a refusing or throwing approver ⇒ `APPROVAL_DENIED`; the body never runs |
| Approving over HTTP | **nobody** | an `approval` field in a request body ⇒ `403 APPROVAL_REQUIRED` *before* the kernel is called; the approver is not even consulted |
| An agent approving its own call | **nobody** | the gateway **drops** `opts.approval`; what reaches the kernel is provenance only |
| Granting a port to a plugin | the host, and only for a declared permission | an undeclared port is invisible; an unknown permission is `PERMISSION_DENIED` at load |
| Writing to the filesystem | the host, through one **path-confined** write port into one directory | absolute names, separators, `..`, NUL and symlinked targets ⇒ `PERMISSION_DENIED` |
| Serving diagnostics pages | the operator, with `--dev-ui` | off by default; `404` otherwise |
| A gate that cannot run | **nobody** — it is UNKNOWN | UNKNOWN is never green (`typecheck`, see `policy/relaxations.md` R-1) |

The shape repeats on purpose: **authority is a list, consent is a person.** A role is a
label for an audit, never a permission; an allow-list is authority; only a human
approves a consequential act.

## 9 · Threat model — the new execution capabilities

> **TRUSTED LOCAL PLUGINS ONLY.** Plugins run in-process, with the full privileges of the Node process.
> Permissions and ports are a *contract* and a *least-privilege* mechanism for what the composition hands
> over — **they are NOT a security sandbox.** A plugin can `import('node:fs')` directly and ignore every port
> it was given. Treat plugin code as trusted first-party code, reviewed like any other file in the repository.
> Do not load a plugin you would not read. **Third-party or untrusted plugin execution must not be enabled
> without appropriate isolation** — the prerequisites are PROPOSED and listed in [`SECURITY.md`](../SECURITY.md).
> (Approved scope, Hudson A. R. Bonomo, 2026-10-02. VERIFIED: there is no isolation mechanism in `eip/`.)

| Asset | Threat | Control that exists (VERIFIED) | Residual risk |
|---|---|---|---|
| The filesystem | a capability writes outside its directory | the host's `writeFile` port takes a **name**, not a path; traversal, absolute names, separators, NUL and symlink targets are refused; the plugin validates the name independently — two guards, neither trusting the other | **a plugin bypassing the port entirely** (in-process, see above). The symlink case is **VERIFIED on win32** through a directory junction (a file symlink is `EPERM` for an unprivileged account); POSIX symlink behaviour is UNKNOWN here |
| The world outside the process | a consequential act with nobody accountable | kernel is fail-closed with no approver; HTTP callers cannot supply approval; agents cannot either; `--approve-interactive` prompts `y/N`, default **N**, per call | approval is **interactive only, via a TTY**. No queue, no signed grant, no durable record of who said yes |
| The HTTP surface | an untrusted client drives the runtime | `127.0.0.1` only; no CORS headers at all; JSON only (415); 64 KB body cap enforced on the stream (413); method/path errors are 4xx with the JSON envelope | **there is no authentication and no rate limiting** — the loopback bind *is* the access control. Anything on the machine can call it. Exposing this port is a deployment defect |
| Information | a stack trace or an internal path on the wire | results never carry a stack; stacks travel only on the in-memory `error` event; the write port returns the **relative** name | error `message` strings are written for developers; review them before exposing an endpoint beyond loopback |
| The browser | a diagnostics page becomes an XSS vector | dev UI off by default; strict CSP with no `'unsafe-inline'`; the fragment is asserted to contain no `<script>` body, no `on*=` handler and no third-party URL; script and stylesheet are separate same-origin routes | a plugin author can still ship markup; the CSP is the enforcement, the test is the warning |
| Agent actions | an agent doing what nobody granted | allow-list is the whole authority; an empty list denies everything; a malformed entry is a `TypeError` at construction; every attempt is audited | the audit is **in memory** and dies with the process |
| Availability | a capability hangs or spins | `AbortSignal` with `CANCELLED` and `TIMEOUT` kept as distinct codes | no CPU or memory budget per call; a busy loop blocks the event loop for everyone (consequence of in-process execution) |

Static analysis is not proof of security, and this table is not an audit. It is the list of claims a reviewer
should try to break — and the four rows whose residual risk begins with "a plugin bypassing", "there is no
authentication", "interactive only" and "in memory" are the ones that decide whether this runtime may leave a developer's machine. Today the honest answer is: it may not. The boundaries UPP added — operator config, manifest pin, spawn, framing, stderr, HTTP, applications, CI — are reviewed on the same shape in [`docs/upp/SECURITY-REVIEW.md`](upp/SECURITY-REVIEW.md).
