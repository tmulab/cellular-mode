# UPP · Security review of the stage-5 boundaries

Stage 5, cell 7. This file reviews **only what stage 5 added**: the operator authorisation
file, the manifest pin, the spawn site, the NDJSON framing, stderr capture, the HTTP
transport, application supervision and health, the direction an application plugin may talk
back in, and the CI workflow. The runtime-wide model it sits under is unchanged and
authoritative: [`SECURITY.md`](../../SECURITY.md) and [`docs/09-architecture.md`](../09-architecture.md) §8–§9.

Evidence rule for this file: every "control" cell names `file:function` read in this cell, and
every "test" cell names a test that exists and was executed by `npm test` in this cell
(**VERIFIED**). Anything not built says **PROPOSED**; anything not measured says **UNKNOWN**.

## 1 · Five statements that do not move

1. **In-process plugins remain TRUSTED-LOCAL-ONLY.** Nothing in stage 5 changed that, and the
   box in `SECURITY.md` is unamended. A plugin loaded into the host process can
   `import('node:fs')` and ignore every port it was granted.
2. **A separate process is failure isolation, NOT a security sandbox.** It bounds a crash, a
   leak and a busy loop. It does not confine the filesystem, the network or the process table:
   the child runs with the operator's own privileges (`eip/upp-host/process-transport.mjs:3-7`).
3. **There is no marketplace.** No registry, no discovery, no directory scan, no signing
   service, no version resolution. A plugin absent from `upp.config.json` is never spawned and
   never contacted (`eip/upp-host/config.mjs:authorizationFor`).
4. **A plugin or an agent never approves its own consequential operation.** The approval gate
   is the kernel's and runs before the transport is touched — VERIFIED by
   `adapter · a consequential capability with no approver never reaches the transport`,
   `adapter · a denied approval also stops before the transport`,
   `end to end · a consequential capability with no approver writes nothing`,
   `H6 an HTTP caller can never approve itself`, `G3 the agent cannot approve its own act`,
   `U31 the application calls the API as a client, and approval is still required`.
5. **Plugin output is untrusted data.** It is validated by the host even when the plugin
   validated it too, and a remote `error.data.code` may claim only `NOT_FOUND` or
   `INPUT_INVALID` — VERIFIED by `adapter · an output that breaks the contract is
   OUTPUT_INVALID, not a pass` and `failures · a remote error claiming host authority is
   downgraded`.

## 2 · The boundaries stage 5 added

### B1 · Operator configuration (`upp.config.json`)

| | |
|---|---|
| **Threat** | an entry that authorises more than a reviewer thinks it does: a shell string read as a command, secrets passed as env *values*, a sandbox promise the host cannot keep, two entries for one id |
| **Control** | `eip/upp-host/config.mjs:validateUppConfig` + `entry-rules.mjs:checkArgv/checkEnv/checkPin/checkTimeouts` — a closed field list (`CONFIG_FIELDS`, `PLUGIN_FIELDS`), argv must be a non-empty array, `env` is a list of NAMES, `allowNetwork:true` is **refused** because the host cannot enforce it, duplicate ids are a breach, every breach is reported at once |
| **Test** | `config · a command must be argv, never a shell string` · `config · env is a list of NAMES, never a map of values` · `config · allowNetwork:true is refused, because the host cannot enforce it` · `config · unknown keys, a bad pin and a duplicate id are each a breach` · `operator · an unreadable or invalid config is a structured refusal, never a throw` |
| **Residual** | the file is trusted entirely once valid. It is not signed and its permissions are not checked: **whoever can write `upp.config.json` can run a program as the host user.** It must be reviewed like source and protected like a key |

### B2 · The manifest pin

| | |
|---|---|
| **Threat** | a swapped artefact under a reviewed identity — a plugin that describes itself one way on disk and another way at runtime, or widens its own capability set |
| **Control** | `operator.mjs:provePinnedManifest` (validate → id must match the authorisation → `sha256` of the canonical form must equal `manifestSha256`), `canonical.mjs:canonicalJson/manifestDigest` (key order and whitespace cannot change a digest; a cycle or a non-finite number is refused, never coerced), `handshake.mjs:admit` (the manifest answered by `upp.initialize` must have the *same* digest), `handshake.mjs:authorizedCapabilities` (the pinned manifest is the authorisation; `upp.capabilities` cannot widen it) |
| **Test** | `operator · a pin mismatch is refused and nothing is authorised` · `process · a manifest that differs from the pin is refused at initialize` · `http · a service answering a different manifest is refused at initialize` · `failures · a capability absent from the pinned manifest costs zero bytes` · `canonical JSON · key order and whitespace do not change the digest` |
| **Residual** | the pin covers the **manifest**, not the program: `manifestSha256` says nothing about the bytes of the executable. Code integrity is the operating system's job here, and signed plugins are **PROPOSED** (§3) |

### B3 · The spawn site

| | |
|---|---|
| **Threat** | argv injection (a quote or `&&` inside a configuration value becoming a second command), leakage of the host's environment — `AWS_*`, tokens, `GITHUB_TOKEN` — into a child, a child started outside its directory |
| **Control** | **one** spawn site: `channel.mjs:createChannel`, `spawn(command[0], rest, { shell: false, cwd, env, windowsHide: true })`. `operator.mjs:minimalEnv` builds the child environment from a NAMED base (`PATH`, and on win32 the few variables a program needs to start) plus the names the operator listed — nothing is inherited |
| **Test** | `upp-host · the runtime contains no shell execution of any form` · `upp-host · only the two named MODULES execute a program, both argv-only` · `upp-host · no test file hands a shell to a spawn either` · `minimalEnv · a host variable the operator did not name is not in the child env` · `process · the child sees a minimal env and no host canary` · `process · an operator-named env variable DOES reach the child` · `failures · an id the operator never listed is never spawned` |
| **Residual** | `shell: false` is not a sandbox: the child may read every file the operator can read and open any socket. On Windows, authorising a `.bat`/`.cmd` would reintroduce a shell — Node refuses it without `shell: true`, so the refusal is the runtime's, not this layer's, and it is **UNKNOWN** on every Node older than the fix. Authorise executables, not scripts |

### B4 · NDJSON over stdin/stdout

| | |
|---|---|
| **Threat** | a peer that desynchronises the stream, an unbounded line that exhausts memory before it is judged, a late answer accepted for a retired id, a partial outbound write that corrupts the peer's stream |
| **Control** | `lines.mjs:createLineReader` enforces the byte cap **before a line exists** and discards the frame rather than repairing it; the limit cannot be raised above `MAX_MESSAGE_BYTES` (1 MiB). `channel.mjs:ingest` makes a malformed line `-32700`, fails every pending call and ends the conversation; `channel.mjs:write` refuses an oversized outbound frame with **nothing written**; `correlate.mjs` retires an id on timeout and on abort |
| **Test** | `lines · a line exactly at the limit is accepted; one byte more is not` · `lines · the limit cannot be raised above the protocol cap` · `lines · an oversized line is reported by its byte count and discarded, not repaired` · `lines · a stream ending mid-frame is a breach, not a last message` · `failures · an inbound line over the cap is -32006 and the plugin is unhealthy` · `failures · an outbound frame over the cap is refused with nothing written` · `failures · a malformed line is -32700, the call fails, the plugin is unhealthy` |
| **Residual** | the cap is per **message**, not per conversation: a plugin may emit valid 1 MiB frames as fast as the host reads them. There is no rate limit and no total-bytes budget — **UNKNOWN** under an adversarial peer, which is a reason untrusted plugins stay out of scope |

### B5 · stderr

| | |
|---|---|
| **Threat** | a plugin answering a request by printing (authority through a side channel), and log injection — a forged line that reads like a host record |
| **Control** | `channel.mjs` reads stderr as text, splits it on `\n`, truncates each line to `MAX_STDERR_LINE` (2048) and hands it to `onStderr`; it is **never parsed as protocol**. `process-transport.mjs:emit` turns it into a `{plugin, stream: 'stderr', line}` kernel event through `ctx.emit` — the only emitter a plugin has — so it arrives as *data under this plugin's key*, never as a result and never as another event type |
| **Test** | `process · stderr is a diagnostic event and never an answer` · `adapter · events carry the kernel shape and no stack ever reaches a result` |
| **Residual** | the text is **not sanitised**: a line may contain `\r`, ANSI escapes or text shaped like another log record. The host's own sink is silent by default and in memory, so nothing is written to a terminal or a file by this layer — but **a consumer that prints a diagnostic event unescaped owns that risk.** Treat the field as untrusted bytes; this is recorded, not fixed, because sanitising for an unknown sink would be guesswork |

### B6 · The HTTP transport

| | |
|---|---|
| **Threat** | the host being redirected to another endpoint, a token leaking into a log or a URL, an unbounded response body, a non-loopback endpoint reached by accident |
| **Control** | `http-transport.mjs:post` sends `redirect: 'error'`, accepts only 200/204, bounds the body at `MAX_MESSAGE_BYTES` and validates the envelope against the request id and method (`eip/upp/messages.mjs:validateResponse`). `http-transport.mjs:endpointOf` refuses a non-loopback `baseUrl` without `allowRemote:true` and reads the bearer token from the environment variable **NAME** the operator gave; the value is never logged, never put in an error and never written to disk. `config.mjs:checkRuntime` requires both decisions at validation time |
| **Test** | `http · a redirect is refused, not followed` · `http · a status outside 200/204 is -32003` · `endpoint · a non-loopback baseUrl needs allowRemote and a token NAME, never a token` · `config · an http authorisation is loopback unless the operator says otherwise` · `http · a version the host does not support is -32002 and nothing is registered` |
| **Residual** | **TLS is not enforced.** An `http://` non-loopback `baseUrl` with `allowRemote:true` sends the bearer token in cleartext; nothing in the code requires `https:`. The cap is checked after `response.text()` has buffered the body, so a hostile service can make the host allocate before the refusal. Both are documented limits of UPP 1.0 (`SPEC.md` §11) — exposing a plugin endpoint to a network is a deployment decision with its own threat model |

### B7 · Application health checks

| | |
|---|---|
| **Threat** | a probe that leaves the application's origin (`//evil.example/health`), a redirect followed to a third party, a health body parsed into authority |
| **Control** | `app-health.mjs:healthUrlOf` requires a **relative** `healthPath` and re-checks the resolved origin *after* resolution; `probeApplication` sends `redirect: 'error'`, bounds the body at `MAX_HEALTH_BODY_BYTES` (16 KiB) and treats it as text to log — the verdict comes from the status code alone |
| **Test** | `applications · a health URL may never leave the application origin` · `applications · a non-loopback baseUrl without allowRemote is refused, nothing contacted` · `applications · the same baseUrl is accepted once the operator allows it explicitly` |
| **Residual** | a 200 proves an endpoint answered, not that the application is correct. The truncation happens after `text()`, as in B6 |

### B8 · Application → host, and only in that direction

| | |
|---|---|
| **Threat** | an application acquiring a second door into the runtime — a kernel service, a port, a proxied frontend, or consent it is not entitled to give |
| **Control** | `adapter.mjs:uppPluginManifest` **throws** `INPUT_INVALID` for `type: "application"`, so no key can ever be registered for one; `applications.mjs` contains no kernel, no `definePlugin`, no port and no capability — registration is identity. `applications.mjs:publicly` publishes no command, cwd, env or pin. An application reaches the system only as a **client of the HTTP API**, under the host's existing boundaries, where an `approval` field in a body is refused before the kernel is reached |
| **Test** | `applications · U30 an application gets no kernel service: the adapter refuses it` · `applications · a capability manifest is never supervised as an application` · `U31 the application calls the API as a client, and approval is still required` · `applications · an id absent from the operator file is never started and never contacted` · `applications · exactly ONE restart is attempted, and a second exit is terminal` · `applications · stop() ends a managed process and leaves no residue` |
| **Residual** | a managed application is spawned through B3 and inherits every residual risk there. `auth: "none-local"` means exactly what it says: on a loopback deployment the bind is the access control, and `cors.allowedOrigins` defaults to empty because a browser must call its own server |

### B9 · The CI workflow

| | |
|---|---|
| **Threat** | a workflow that can write to the repository, run fork code with a token, or drift to a mutable action tag; a fabricated `Verified-State` trailer |
| **Control** | `.github/workflows/verify.yml` — `permissions: contents: read`, no secret, `persist-credentials: false`, `pull_request` and never `pull_request_target`, every action pinned to a full commit SHA. `tools/gates/ci-trailer.mjs` compares each trailer with `git rev-parse <commit>^{tree}` and fails closed; pre-Article-8 commits are matched by a documented boundary and a trailer is never written retroactively (`tools/gates/CI.md`) |
| **Test** | `tests/ci-workflow.test.mjs` (13 tests, structure) · `tests/ci-workflow-pipefail.test.mjs` · `tests/gates-ci-trailer.test.mjs` · `tests/gates-ci-trailer-git.test.mjs` |
| **Residual** | **the workflow has never run on GitHub** — its behaviour there is UNKNOWN until the first push after authorisation. Branch protection is a RECOMMENDATION only; no repository setting was changed, so today a push can still land without a passing run |

## 3 · What untrusted third-party plugins would additionally need — PROPOSED, none of it built

Stage 5 does **not** move the "trusted local plugins only" line. These are the prerequisites,
and the list is deliberately the same one `SECURITY.md` already holds, now priced per boundary:

| Requirement | Why the stage-5 boundaries do not provide it |
|---|---|
| **An OS-level sandbox** (container, jail, seccomp/AppContainer, or a WASM runtime) | B3 chooses *which* program runs; it cannot stop that program reading `~/.ssh`. Failure isolation ≠ confinement |
| **Resource limits per call and per plugin** — CPU, memory, file descriptors, total bytes | B4's residual: the cap is per message, deadlines are wall-clock, and `upp.cancel` is cooperative. A limit must be enforced by the boundary, not requested from the peer |
| **Signed manifests and signed artefacts**, with provenance checked before spawn | B2 pins the manifest, not the executable (its residual row) |
| **Network isolation** — deny by default, allow-list per plugin | `allowNetwork:true` is refused *precisely because* the host cannot enforce it (`config.mjs:checkPlugin`). A child opens any socket the user can open |
| **A reviewed threat model of the new boundary**, written like §2 here | each of the four above changes the boundary, so the review has to be redone, not inherited |
| **Explicit human approval recorded as an ADR**, naming the residual risk that remains | the approval boundary is a human's, and that has not changed |

## 4 · One real gap found in this cell, and fixed

**VERIFIED red, then green.** `npm run rehearse:adaptive-removal` (AD29 — the claim
[`AUDIT.md`](AUDIT.md) row 28 states as "the removal rehearsal must remain green with UPP
present") **failed**: `tests/upp-compat.test.mjs` statically imported
`eip/plugins/adaptive-preferences/index.mjs`, a module the rehearsal deletes, so the optional
module's absence became a crashed test file — `tests 817, pass 816, fail 1`. The fast guard
`tests/optional-module-imports.test.mjs` had not seen it because its scope did not include
`tests/`. Fixed in that order: the scope was widened (the guard went red, naming exactly one
offender), then the compat suite was changed to load the optional plugin **dynamically, only
when it is present**, and to expect the keys that are present. Now green: the guard, the suite,
and `AD29 VERIFIED: the suite and the gates pass with the adaptive module deleted`.

It is a *verification* gap rather than a runtime one — no shipped code path changed — and it is
recorded here because it is the only failing boundary this review found.

## 5 · Verdict

The stage-5 boundaries are **fail-closed where they decide anything**: nothing is spawned,
contacted, registered or executed that an operator did not list, pin and authorise, and the
approval gate still runs before the first byte. The scope of the runtime is **unchanged**:
local development, trusted first-party plugins, loopback. Four residual risks are the ones a
reviewer should attack first — who may write `upp.config.json` (B1), the unpinned executable
(B2), cleartext tokens to a remote `baseUrl` (B6), and the unsanitised stderr field (B5).
