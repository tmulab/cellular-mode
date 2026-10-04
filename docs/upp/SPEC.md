# UPP 1.0 — Universal Plugin Protocol

**Status:** normative specification, **PROPOSED** — no implementation exists at the time of
writing; cells 2–7 build it. Decided in stage 5, cell 1. **MUST**, **MUST NOT**, **SHOULD**,
**MAY** are RFC 2119. Companions: [AUDIT.md](AUDIT.md) ·
[SPEC-MESSAGES.md](SPEC-MESSAGES.md) (messages and error codes, also normative) ·
[ACCEPTANCE.md](ACCEPTANCE.md) · [ADR 0005](../adr/0005-universal-plugin-protocol.md).

## 1 · What UPP is

UPP is the **host↔plugin** contract of the "Everything Is a Plugin" runtime, written so a
plugin in another language obtains exactly the guarantees an in-process plugin has today: a
validated manifest, validated input and output, a fail-closed approval gate on consequential
acts, a deadline, cancellation, a closed error vocabulary and a reversible lifecycle. One
protocol, **three transports** (in-process, process, HTTP), and **no second runtime**: an
external plugin is registered into the existing kernel through an adapter that produces an
ordinary `definePlugin` manifest whose service proxies each capability to the transport.

## 2 · Non-goals

| Non-goal | Why not |
|---|---|
| **Not MCP** | MCP exposes tools to a *model*; UPP governs a *host's* lifecycle over a plugin — spawn, initialize, health, shutdown, approval, deadline. They do not overlap, and duplicating MCP would mean two answers to "what may this model call". An MCP **bridge** plugin is **PROPOSED**, nothing more |
| **Not a sandbox** | A separate process gives **failure isolation** (crash, leak, busy loop). It does not confine the filesystem, the network or the process table — §11 |
| **Not a marketplace** | No registry, no discovery, no signing service, no version resolution. Composition stays an explicit operator-reviewed list |
| **No exactly-once** | `upp.execute` is at-most-once *as observed by the host*: a request that fails with a transport error MAY have been fully executed. The host MUST NOT retry automatically, and no idempotency is claimed |
| **No restart loop** | At most one restart per plugin per host lifetime (§9) |
| **No disk discovery, no hot reload** | Already refused for the in-process runtime (`docs/09-architecture.md` §4); UPP does not reopen it |

## 3 · Standards reused, and why each one

| Standard | Used for | Why this one |
|---|---|---|
| **JSON-RPC 2.0** | every message | The smallest complete answer to the three things a lifecycle protocol needs: id correlation, notifications, errors. One page to read, a reserved error range, and available in every target language's standard library or in twenty lines of it. A bespoke envelope would be a worse one to teach |
| **The SDK JSON-schema subset** | manifest, config, capability `input`/`output` | 11 keywords (`eip/sdk/schema.mjs:15-18`), already language-neutral JSON, already validated at both ends by code we own. Full JSON Schema would import a specification and a dependency per language for keywords nothing here needs ([ADR 0002](../adr/0002-zero-dependency-kernel.md)) |
| **NDJSON** over stdio | `process` framing | One UTF-8 JSON value per line, `\n` delimited. Writable as `print(json.dumps(x), flush=True)`, readable as `for line in stdin`, debuggable with `cat`, greppable in a log, and self-synchronising — the delimiter cannot appear unescaped inside a JSON string |
| **HTTP POST, `application/json`** | `http` transport | The plugin is already a service; one endpoint, one method, one content type, and no bespoke socket protocol to specify |
| **OpenAPI 3.1** | the *host's* public API | Unchanged. `api/openapi.json` is the contract for callers **of the host**; UPP is the opposite direction and adds nothing to it |
| **semver** | `manifest.version` | Already the SDK's rule (`eip/sdk/manifest.mjs:11`) |

### The four UPP-specific extensions, and why each exists

| Extension | Why it has to exist |
|---|---|
| **`protocolVersion` negotiation** in `upp.initialize` (§5) | JSON-RPC has no handshake. Without one, an incompatible plugin fails as a mysterious `-32601` |
| **`deadlineMs`** on `upp.execute` (§8) | JSON-RPC has no deadline. The host's timeout is authoritative anyway; propagating it lets the plugin stop useless work and makes a cooperative cancel possible at all |
| **`error.data.code`** carrying a kernel `CODE` | JSON-RPC codes are integers, the architecture's vocabulary is a closed list of names (`eip/sdk/errors.mjs:5-22`). Two vocabularies would be two lists to keep in agreement, so the integer belongs to the transport and the name to the architecture, in one object |
| **`extensions`** on the manifest and on `initialize` (§4) | The *only* place an unknown key is ignored. With no declared junk drawer, every forward-compatible addition breaks compatibility; with one anywhere, a typo in a security field becomes silent |

## 4 · The manifest

One JSON object. `type` and `runtime` decide which members are required.

| Field | Req. | Type | Rule |
|---|---|---|---|
| `upp` | **yes** | string | exactly `"1.0"` for this specification |
| `id` | **yes** | string | `KEY_PATTERN` — `domain.capability-key`, the SDK's key format (`eip/sdk/manifest.mjs:9`). The id **is** the key the plugin provides |
| `version` | **yes** | string | semver |
| `description` | **yes** | string | non-empty |
| `type` | **yes** | enum | `"capability"` \| `"application"` |
| `runtime` | **yes** | enum | `"in-process"` \| `"process"` \| `"http"` — **security-sensitive**: unknown keys rejected |
| `entry` | **yes** | object | **security-sensitive**, unknown keys rejected. `process` → `{command: [exe, ...args]}`, an **argv array**, never a shell string · `http` → `{baseUrl}` · `in-process` → `{module}` |
| `capabilities` | **yes** | object | ≥ 1 entry, `{<id>: {input, output, consequential, description}}`; ids match `CAPABILITY_ID_PATTERN`; schemas in the SDK subset |
| `permissions` | no | string[] | **security-sensitive**, unknown keys rejected. From the closed list `fs.read` `fs.write` `net.outbound` `process.spawn` `clock` `random`, no duplicates. For `process`/`http` it is a **declaration for audit only** — §11 |
| `dependencies` | no | object | `{<key>: {required: boolean}}`, sibling keys only, self-reference refused. Maps to the kernel's `inject` |
| `config` | no | schema | SDK subset; the host validates the operator's config against it before `initialize` |
| `health` | no | object | `{method?: "upp.health", path?: string, intervalMs?: integer}`; `path` applies to `http` only |
| `lifecycle` | no | object | `{startupTimeoutMs?: integer, shutdownTimeoutMs?: integer}`, defaults 5000 and 2000 |
| `application` | type=application | object | `{baseUrl, healthPath, routes[], auth, cors}` — §10 |
| `extensions` | no | object | the one tolerant container: unknown keys MUST be ignored here and MUST be rejected everywhere else |

A manifest that fails any rule MUST be rejected with **every** breach reported at once as
`{path, message}`, as `validateManifest` does today: a contract error is only fixable in one
pass if the report is complete.

## 5 · Version negotiation and compatibility

The version is `"MAJOR.MINOR"`, a **string**, not a number (`"1.10" > "1.9"`).

1. The host sends `upp.initialize` with `protocolVersions` — **its** list, newest first.
2. The plugin picks **one member of that list** and echoes it as `protocolVersion`.
3. A plugin sharing no MAJOR with the host MUST fail with **`-32002
   UNSUPPORTED_PROTOCOL_VERSION`**, and the host **MUST NOT register it**: fail closed.
4. A plugin answering a version the host did not offer is a protocol violation, handled as 3.

**MAJOR** mismatch rejects. **MINOR** is additive only: it MAY add optional members, optional
methods and new error codes; it MUST NOT remove a member, change a type, change a default, or
make an optional member required. A host MUST NOT send a member introduced after the negotiated
MINOR. Unknown members are ignored **only** inside `extensions`.

## 6 · Lifecycle state machine

```
  ·  ──spawn/connect──▶ spawned ──upp.initialize──▶ initialized ──upp.capabilities──▶ ready
                          │                             │                              │
            startupTimeout│              protocol error │                  upp.execute ⟲
                          ▼                             ▼                              │
                       stopped ◀──────────────────── stopped        upp.shutdown        │
                          ▲                                                │            ▼
                          └── exit · crash · kill after shutdownTimeout ──┴───────  draining

  ready ⇄ unhealthy   (upp.health answers degraded/unhealthy, or N probes fail)
  any state ──crash──▶ stopped   (pending requests fail -32003, §9)
```

| State | Rule |
|---|---|
| **spawned** | only `upp.initialize` is legal; anything else MUST answer `-32007 NOT_INITIALIZED` |
| **initialized** | version agreed, manifest received. The host validates it and compares its `sha256` with the operator pin (§11) **before** going further |
| **ready** | the only state in which `upp.execute` is legal |
| **unhealthy** | still registered, no new `execute` dispatched; callers get `DEPENDENCY_MISSING`. A passing probe MAY return the plugin to **ready** |
| **draining** | in-flight requests may finish until `shutdownTimeoutMs`; a new `execute` answers `-32008 SHUTTING_DOWN` |
| **stopped** | terminal. The kernel's `dispose` has run its inverses, so there is zero residue (`eip/kernel/lifecycle.mjs:152-191`) — including no orphan child process |

`config`, when declared, travels as an OPTIONAL `config` member of `upp.initialize` params —
**approved as a design call in stage 5, cell 1**. Without it an out-of-process plugin could
never receive its validated configuration (`AUDIT.md` row 6).

## 7 · Messages and error codes

The catalogue — `upp.initialize`, `upp.capabilities`, `upp.execute`, `upp.cancel`,
`upp.health`, `upp.shutdown`, `upp.exit` — with request/response/error shapes, worked examples,
and the full error-code table (JSON-RPC standard codes plus `-32000..-32099` UPP codes mapped
onto the kernel's closed `CODES` list), is **[SPEC-MESSAGES.md](SPEC-MESSAGES.md)**.

## 8 · Timeouts and cancellation

The **host's** deadline is authoritative: `options.timeoutMs`, else the kernel's
`defaultTimeoutMs` (`eip/kernel/index.mjs:35`). It is propagated as `deadlineMs`, and a plugin
SHOULD stop and answer `-32004 TIMEOUT` — but the host does not wait to find out: on its own
deadline the call answers `TIMEOUT`, `upp.cancel` is sent, and the request id is retired. A
late response for a retired id MUST be discarded.

**Cancellation is best effort.** `upp.cancel` is a notification: no acknowledgement, no
guarantee. The caller gets `CANCELLED`; the plugin may still be working. UPP makes no claim
that an effect was *not* performed, and no exactly-once claim anywhere (§2). A deadline is also
not a resource limit — there is no CPU or memory budget per call (`SECURITY.md`, "What is NOT
enforced").

## 9 · Payload limits, crashes, malformed input

**1 MiB per message**, every transport, by default; configurable **downward** only, and a value
above 1 MiB MUST be refused. Independent of the host API's 64 KiB body cap (`eip/host/body.mjs:15`).

| Situation | Host behaviour |
|---|---|
| **Oversized** outbound message | the call fails `-32006` and nothing is written |
| **Oversized** inbound line | `-32006`, the line is discarded, the plugin goes **unhealthy** |
| **Malformed** line (not JSON, or not a JSON-RPC 2.0 object) | `-32700`, and it is treated as a protocol violation: pending requests fail `-32003`, the plugin goes **unhealthy** and is stopped. Fail closed — a peer that cannot frame one message cannot be trusted to frame the next |
| **Crash or unexpected exit** | every pending request fails `-32003` (kernel `PLUGIN_ERROR`); the plugin is marked **unhealthy**; exit code and signal are recorded on a `plugin` event. **At most one restart** per plugin per host lifetime, and only if the operator config enables it; a second exit is terminal. No backoff loop — a restart loop hides the defect it reacts to |
| **Unresponsive** | the governing deadline applies (`startupTimeoutMs`, `shutdownTimeoutMs`, or the call's). After `shutdownTimeoutMs` the host terminates the process (`SIGTERM`, then kill) so `dispose` can leave zero residue |
| **stderr** | captured to the host log and surfaced as a `plugin` event; **never parsed as protocol**, under any circumstance |

## 10 · Application plugins (summary; the contract is `APPLICATIONS.md`)

`type: "application"` declares a *separately running* user interface, not a capability
provider: `application: {baseUrl, healthPath, routes: […], auth: "host-session" |
"none-local", cors: {allowedOrigins: []}}`. It brings its own build, routing and session
handling — exactly what [ADR 0001](../adr/0001-frontend-exception.md) requires of a production
UI — making "everything is a plugin" true for interfaces without smuggling a toolchain into the
kernel, the direction [ADR 0003](../adr/0003-observer-frontend.md) recorded as PROPOSED.
`cors.allowedOrigins` defaults to **empty**, `capabilities` is `{}`, and registration is
IDENTITY, never in-process execution: [APPLICATIONS.md](APPLICATIONS.md) holds the contract.

## 11 · Security model

**A separate process is failure isolation, not a sandbox.** It bounds a crash, a leak and a
busy loop. It does **not** confine the filesystem, the network or the process table: a spawned
plugin runs with the operator's own privileges. Untrusted third-party plugins still need
OS-level sandboxing, which does not exist here — **PROPOSED**, prerequisites in
[`SECURITY.md`](../../SECURITY.md).

**Execution is authorized by the operator, never by the manifest.** A separate
`upp.config.json` — written by a human, reviewed like source — lists each permitted plugin as
`{id, command: [argv…], manifestSha256, allowNetwork: false}`. The host MUST:

1. refuse to spawn any `process` plugin absent from that file;
2. spawn with **`shell: false`** and an **argv array** (never a shell string), a confined
   `cwd`, and a **minimal environment** — no inheritance of the host's variables by default,
   so a secret in the host's env never reaches a plugin that did not ask;
3. compute the manifest's `sha256` and **refuse if it differs** from `manifestSha256`;
4. grant **no kernel ports** to a `process` or `http` plugin — ports are in-process functions
   and the contract has no serialisation seam for them (`AUDIT.md` row 14). A `permissions`
   array on such a manifest is a **declaration for audit**, never a grant;
5. run the approval gate **before the first byte reaches the transport**, so a denied
   consequential call is observable as *nothing having been sent*.

**HTTP transport.** `127.0.0.1` by default. A non-loopback `baseUrl` requires explicit operator
configuration and, as a documented requirement, TLS and authentication; what is specified here
is a single bearer token read from the environment — the floor, not a solution. Exposing a
plugin endpoint to a network is a deployment decision with its own threat model.

## 12 · Future transports — PROPOSED only

**gRPC** (schema-first, streaming, mature polyglot tooling — rejected for 1.0: a code generator
and a dependency in every language) and **WASM** (the only candidate that would be a real
sandbox — rejected for 1.0: its host API surface is a design project of its own). Neither
exists. Both would be a new `runtime` value and a new `entry` shape — exactly the additive
MINOR change §5 permits.
