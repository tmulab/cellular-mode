# `eip/upp-host` — UPP transports and external processes

**Status: VERIFIED** (typecheck, `node --test`, gates — see the cell record).
`eip/upp` is the Universal Plugin Protocol as pure rules over data. This directory is the
only place that turns those rules into a child process, an HTTP request and a pinned
manifest on disk. One layer may import it — composition (`eip/host`) — and a gate rule
(`upp-host-is-imported-by-the-host-only`) refuses everything else by name.

## There is no second runtime

An external plugin is registered **into the existing kernel** through
`registerUppPlugin(kernel, transport)`, which builds a normal `definePlugin` manifest whose
service methods happen to be a transport call. Input validation, output validation, the
consequential-approval gate, deadlines, cancellation, events, `inject` resolution and
`dispose` are the kernel's existing paths, unchanged, on the same code the in-process
plugins use. Nothing in this directory re-implements any of them.

Two consequences, both deliberate and both tested:

- **Approval happens before the transport.** A consequential capability on a kernel with no
  approver is refused with `APPROVAL_REQUIRED` and **zero bytes written** — the side effect
  cannot already have happened (`end-to-end.test.mjs`).
- **Ports are never forwarded.** A port is an in-process function; there is no honest way to
  hand one across a pipe. The manifest's `permissions` are *declared* (an operator can read
  what the plugin wants) and the kernel may well grant the matching ports to the adapter, but
  the external plugin receives `{}` — `NO_PORTS`. A serialised proxy would be a lie with
  latency (`adapter.test.mjs`).

## The operator's file: `upp.config.json`

Authority flows from the host operator, downward. A plugin absent from `plugins` is **never
spawned and never contacted**: there is no discovery, no directory scan, no default.

```json
{
  "upp": "1.0",
  "plugins": [
    {
      "id": "acme.indexer",
      "runtime": "process",
      "command": ["/usr/bin/node", "plugins/indexer/main.mjs"],
      "manifestPath": "plugins/indexer/upp.manifest.json",
      "manifestSha256": "<64 hex characters>",
      "cwd": "plugins/indexer",
      "env": ["TZ"],
      "allowNetwork": false,
      "restart": false,
      "timeouts": { "startupMs": 10000, "requestMs": 30000, "shutdownMs": 5000 }
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | the plugin key. Must equal the pinned manifest's `id`. Duplicates are refused. |
| `runtime` | `process` or `http`. A `process` entry has `command` and no `baseUrl`; an `http` entry the reverse. |
| `command` | an **argv array** `[executable, ...args]`. A string is refused by shape — that is how a configuration value becomes command execution. |
| `manifestPath` | the reviewed UPP manifest, resolved against the config file's directory. |
| `manifestSha256` | the **pin**: SHA-256 of the manifest's canonical JSON (sorted keys, no whitespace). A mismatch is refused and nothing starts. |
| `cwd` | the directory a process is confined to. Default: the manifest's directory. |
| `env` | a list of variable **NAMES** to pass through, never a map of values. Anything not listed is invisible to the child. |
| `allowNetwork` | must be `false`. `true` is refused as **NOT IMPLEMENTED**: a process is not a sandbox, so the host cannot grant or deny network access and will not pretend to. |
| `allowRemote`, `bearerTokenEnv` | required together for a non-loopback `baseUrl`. The token is read from the named environment variable; its value never appears in a log, an error or a file written here. |
| `restart` | opt-in. **At most one** automatic restart, then the plugin stays down. |
| `timeouts` | `startupMs` / `requestMs` / `shutdownMs`. Defaults in `DEFAULT_TIMEOUTS`. |

Unknown keys anywhere in this file are a breach, not a forward-compatible addition.

## Security model: a process is isolation, not a sandbox

A child plugin runs **with the host user's privileges** and can read whatever that user can
read. Separate process buys **failure isolation** — a crash, a hang or a memory leak stays on
its own side — and nothing more. Untrusted third-party plugins need OS-level sandboxing
(containers, `seccomp`, Job Objects, AppContainer); that is **PROPOSED**, not built.

**Enforced here, with a test behind each line**

- Only an authorised `id` is ever started or contacted (`PERMISSION_DENIED` otherwise).
- `shell: false`, argv array, no shell anywhere in `eip/` (`tests/upp-host-no-shell.test.mjs`
  reads every runtime module and pins the single spawn site).
- Minimal environment: `PATH` (plus `SystemRoot`, `COMSPEC`, `PATHEXT`, `TEMP`, `TMP` on
  Windows — a Node child cannot start without them) and the names the operator listed.
- `cwd` confined to the plugin's directory.
- The manifest pin is checked twice: against the file on disk, and against the manifest the
  plugin answers at `upp.initialize`. A mismatch means not registered.
- Protocol version negotiated from the host's list; no overlap is `-32002` and no registration.
- Only the capabilities in the **pinned** manifest can be invoked; an unknown id costs zero
  bytes on the wire.
- 1 MiB per frame, both directions. An oversized outbound request is refused with nothing
  written; an oversized or malformed inbound line is `-32006` / `-32700`, fails every pending
  request, and marks the plugin unhealthy.
- stdout is protocol only; **stderr is captured, truncated and never parsed**, arriving as a
  `plugin` kernel event.
- Per-request deadline, `upp.cancel` on timeout and on abort (best effort), ids retired so a
  late answer cannot resolve a settled call.
- Graceful shutdown: `upp.shutdown` → `upp.exit` → wait `shutdownTimeoutMs` → kill. No orphan
  survives, including a plugin that ignores both.
- HTTP: loopback by default, `POST <baseUrl>/upp`, redirects **not** followed, body capped,
  only `200`/`204` accepted.
- A remote peer may never name an authority code: a plugin answering `APPROVAL_DENIED` or
  `PERMISSION_DENIED` is downgraded to `PLUGIN_ERROR`.

**NOT enforced — read this as the list of things you are trusting the plugin with**

- Filesystem, network and subprocess access of the child (no sandbox).
- CPU and memory limits.
- Exactly-once execution: a crash after a side effect and before its answer is
  indistinguishable from a crash before it. UPP 1.0 makes no exactly-once claim.
- Cancellation actually stopping work: `upp.cancel` is a notification, and a plugin is free
  to ignore it. The host's own deadline is what protects the caller.
- An HTTP service's lifecycle: the host did not start it and cannot stop it.
- TLS beyond what `fetch` does, and any authorisation stronger than one bearer token.

## What an external plugin cannot do in UPP 1.0

`dependencies` map to kernel `inject`, so the composition checks still run —
`DEPENDENCY_MISSING` for an unregistered required key, `DEPENDENCY_CYCLE` for a required
cycle. But an external plugin **cannot call a sibling**: it has no ports and no re-entry into
the kernel, so `ctx.get` is unreachable from the far side of a pipe. The declaration is
enforced; the use is **PROPOSED**. A host-side callback channel would need its own
authorisation model and is deliberately out of scope for 1.0.

## Application plugins are registered, never loaded

An application plugin (`type: "application"`) is an independently executed app. The kernel
never loads it, never proxies it and never gives it a service or a port — `adapter.mjs`
**throws** on an application manifest, so no kernel key for one can exist. What this
directory does is register a pinned identity, probe its health, and — only for
`supervision: "managed"` — start and stop it through the one existing spawn site. The app
reaches the system as a **client of `/api/v1`**, where the approval gate is unchanged. The
whole contract, enforced-versus-documented, is in
[`docs/upp/APPLICATIONS.md`](../../docs/upp/APPLICATIONS.md).

## The modules

| Module | Responsibility |
|---|---|
| `config.mjs` | `upp.config.json` validated as strictly as a manifest. Pure. |
| `entry-rules.mjs` | the rules EVERY operator entry obeys — argv, env, timeouts, pin, loopback — stated once for `plugins` and `applications`. Pure. |
| `app-config.mjs` | the `applications` list: supervision mode, and who owns the process. Pure. |
| `app-health.mjs` | one `GET baseUrl + healthPath`, no redirects, origin-locked. |
| `applications.mjs` | the application registry and its supervision state machine. |
| `canonical.mjs` | canonical JSON + SHA-256: the two operations a pin is made of. Pure. |
| `operator.mjs` | the only module that reads disk: config, pinned manifests, minimal env. |
| `handshake.mjs` | `upp.initialize` judged on version **and** identity. Pure. |
| `lines.mjs` | NDJSON assembly as a state machine over byte chunks. Pure. |
| `correlate.mjs` | one answer per id, exactly once, then retired. Pure. |
| `channel.mjs` | one child process: spawn, the two streams, the byte caps. |
| `process-transport.mjs` | lifecycle, health, restart policy, shutdown sequence. |
| `http-transport.mjs` | JSON-RPC over `POST <baseUrl>/upp`. |
| `adapter.mjs` | the external plugin as a normal kernel plugin. |
| `fixtures/` | a deliberately misbehaving Node plugin, a runnable application (`app-server.mjs`), their manifests, and the operator-config harness. |
