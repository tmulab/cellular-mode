# Cell 3 verdict — UPP transports and external processes

The record for cell 3 of stage 5, split out of
[ACCEPTANCE.md](ACCEPTANCE.md) only because that file is at the 200-line limit. The
criteria U10–U26 themselves are declared there, before this implementation existed.

## Verdict — VERIFIED (2026-10-03), U10 excepted

Trilateral, after the last write: **typecheck** `npm run typecheck` (both configurations) — 0
errors · **gates/build** `npm run gates` — 529 files, 302 modules, 0 findings; `check-all
--release` — 0 blockers · **tests** `npm test` — 890 tests, 890 pass, 0 fail (the
`eip/upp-host` subset is 58, plus 10 repository-level tests under `tests/`).

Delivered `eip/upp-host/`: `config.mjs` (operator authorisation, pure) · `canonical.mjs`
(canonical JSON + SHA-256 pin) · `operator.mjs` (the only disk reader; minimal env) ·
`handshake.mjs` (version **and** identity) · `lines.mjs` · `correlate.mjs` · `channel.mjs`
(the single spawn site) · `process-transport.mjs` · `http-transport.mjs` · `adapter.mjs`
(external plugin → normal kernel plugin) · `types.mjs` · `index.mjs` · `README.md` ·
`fixtures/` (a deliberately misbehaving Node plugin, two manifests, an operator-config
harness). Two boundary rules added; the rules table moved to `tools/gates/rules.mjs` so no
file needed a size exception.

| # | Criterion | Evidence |
|---|---|---|
| U10 | in-process compat behaviour-identical | **PROPOSED — not built.** Cell 3's scope was the `process` and `http` transports; no in-process UPP transport exists, so there is no second execution path to compare. `toUppManifest` (cell 2, U6) maps in-process manifests, and `COMPAT_RUNTIME` is `in-process` for that mapping only. Claiming U10 green here would be claiming a result for code that does not exist |
| U11 | full process lifecycle, child gone | `process.test.mjs` · "the full lifecycle, and the child is gone afterwards" (initialize → capabilities → execute → health → shutdown → exit, then `process.kill(pid, 0)` throws) |
| U12 | argv only, minimal env | `tests/upp-host-no-shell.test.mjs` (4 tests: no shell form anywhere in `eip/`, the single spawn site pinned, `shell: false`, argv array) + `process.test.mjs` · the CHILD reports `sawEnvCanary: false` for a host variable and `true` only when the operator named it |
| U13 | the 1 MiB cap, both directions | `failures.test.mjs` · outbound over the cap ⇒ `INPUT_INVALID` with `counters().sent` unchanged (nothing written); inbound ⇒ `lastBreach().code === -32006`, result `PLUGIN_ERROR`, state `unhealthy`. `lines.test.mjs` adds the byte-level cases (exactly at the limit, one byte over, a split multi-byte character, a stream ending mid-frame) |
| U14 | a malformed frame is a protocol violation | `failures.test.mjs` · `lastBreach().code === -32700`, the pending call fails, state `unhealthy`, the next call is refused; `process.test.mjs` · a forged JSON-RPC frame written to **stderr** resolves nothing and the next `echo` answers normally |
| U15 | a crash is contained and bounded | `failures.test.mjs` · the pending call gets `PLUGIN_ERROR` carrying `exited (code 7…)`; `restarts() === 0` by default; with `restart: true` exactly one restart revives the plugin and a second exit is terminal |
| U16 | timeouts are host-side | `end-to-end.test.mjs` · `kernel.execute(…, {timeoutMs})` ⇒ `TIMEOUT`, never `CANCELLED`, `upp.cancel` observed at the plugin, `counters().discardedLate === 0`. `failures.test.mjs` adds the transport's own `requestMs` backstop |
| U17 | `deadlineMs` is propagated | `process.test.mjs` · the fixture echoes it: `1234` from the operator's `requestMs`, `777` from an explicit per-call deadline |
| U18 | cancellation reaches the plugin and does not depend on it | `failures.test.mjs` + `end-to-end.test.mjs` · the caller gets `CANCELLED` while the fixture **ignores** the notification; the notice is observed on the plugin's stderr with the right id |
| U19 | startup/shutdown deadlines leave no residue | `process.test.mjs` · a plugin that never answers `initialize` is `-32004` and not registered; one that ignores `shutdown` is terminated after `shutdownTimeoutMs`; neither leaves a live pid |
| U20 | approval runs before the transport | `adapter.test.mjs` (spy transport: `calls` stays `[]` for `APPROVAL_REQUIRED` and for `APPROVAL_DENIED`) + `end-to-end.test.mjs` (live transport: `counters().sent` unchanged) |
| U21 | an external plugin gets no ports | `adapter.test.mjs` · a `fs.write` manifest with a `writeFile` port offered: `grantedPorts()` is `['writeFile']` (the kernel did its normal job) and `forwardedPorts` is `NO_PORTS`, empty |
| U22 | an unauthorised capability never leaves the host | `config.test.mjs` · an unlisted id is `-32010`/`PERMISSION_DENIED` from `authorizePlugin`; `failures.test.mjs` · a **spy on `createChannel`** records 0 spawns for that id, and a capability absent from the pinned manifest is refused with `counters().sent` unchanged |
| U23 | the manifest pin is enforced | `config.test.mjs` · a wrong `manifestSha256` is refused with the computed and pinned digests in `details`; `process.test.mjs` / `http.test.mjs` · a plugin answering a different manifest at `initialize` is refused and never registered |
| U24 | dependency failure unchanged for external plugins | `adapter.test.mjs` · an unregistered required key ⇒ `DEPENDENCY_MISSING` at load; a required cycle through the external manifest ⇒ `DEPENDENCY_CYCLE`. **Correction to the row as written:** the kernel resolves siblings LAZILY, so "registered but not loaded" does not fail at load, and an external plugin never makes the call that would fail — recorded in `eip/upp-host/README.md` as the v1 limit rather than papered over |
| U25 | HTTP is loopback by default | `http.test.mjs` · a real `node:http` server on `127.0.0.1:0`: a full `execute` over `POST /upp`, no `authorization` header on loopback, `503` ⇒ `PLUGIN_ERROR` + `unhealthy`, a `302` refused rather than followed, `protocolVersion: "2.0"` ⇒ `-32002`. `config.test.mjs` · a non-loopback `baseUrl` needs `allowRemote` **and** `bearerTokenEnv`, and no refusal ever carries the token value |
| U26 | events and diagnostics are observable | `adapter.test.mjs` · the `execute` event's keys are exactly `{at, cap, code, key, ms, ok, type}`, the stack is in the `error` event and not in the result; `process.test.mjs` / `end-to-end.test.mjs` · captured stderr arrives as a `plugin` event through `ctx.emit`, carrying the plugin's key |

### Mutation proofs (nine applied, each reverted, suite returned green)

| Guard | Mutation | Observed red |
|---|---|---|
| U12 | `shell: false` → `shell: true` in `channel.mjs` | 1 fail — `tests/upp-host-no-shell.test.mjs` "the runtime contains no shell execution of any form" |
| U23 | `operator.mjs` stops comparing the pin | 1 fail — `config.test.mjs` "a pin mismatch is refused and nothing is authorised" |
| U23 | `handshake.mjs` stops comparing the answered manifest | 1 fail — `http.test.mjs` "a service answering a different manifest is refused at initialize" |
| U22 | `process-transport.mjs` drops the capability check | 1 fail — `failures.test.mjs` "a capability absent from the pinned manifest costs zero bytes" |
| U13 | `lines.mjs` stops capping a frame that arrives whole | 1 fail — `lines.test.mjs` "a line exactly at the limit is accepted; one byte more is not". **This one was a real defect first:** the reader extracted a line before measuring it, so a 9-byte frame passed an 8-byte cap. The test was written, went red, and the fix followed |
| U15 | the restart budget is raised from 1 to 5 | 1 fail — `failures.test.mjs` "with restart enabled, exactly ONE restart is attempted" |
| U16/U18 | `upp.cancel` is never sent | 2 fails — `end-to-end.test.mjs` "the kernel deadline is TIMEOUT…" and "an aborted call is CANCELLED…" |
| U21 | the adapter forwards the granted ports | 1 fail — `adapter.test.mjs` "an external plugin declares permissions and receives no ports" |
| U20 | the adapter flattens `consequential` to `false` | 2 fails — `adapter.test.mjs` "a consequential capability with no approver never reaches the transport" and "a denied approval also stops before the transport" |

**False-green watch, specific to this cell.** (1) *A refusal proved by its message rather than
by its silence* — U13, U20 and U22 assert `counters().sent` is **unchanged** and that
`createChannel` ran zero times. (2) *A failure path that never runs* — every ugly case is a
named fixture capability (`crash`, `garbage`, `oversize`, `slow`, `boom`, `badout`), so a green
run means the path executed; a cooperative mock would prove nothing. (3) *One integer meaning
two things* — `-32006` is both a caller's oversized request and a peer's oversized line, so
the channel records the inbound breach separately and the transport maps the two to
`INPUT_INVALID` and `PLUGIN_ERROR`, each asserted.
