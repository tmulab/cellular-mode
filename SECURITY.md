# Security policy

## Supported scope

Pre-1.0. This repository is supported for **local development use only**. There is no
supported deployment, no security-release cadence and no API freeze. The methodology
(`skills/`, `tools/cellmode/`) writes Markdown files and runs no server; the security
surface discussed here is the **Everything Is a Plugin** runtime under `eip/`.

Versions in scope: the current `main` state. No backports.

## Threat model

The authoritative table — asset, threat, control that exists, residual risk — is
[`docs/09-architecture.md`](docs/09-architecture.md) §9, with the authority boundaries in
§8 and the PROPOSED gaps in §4. Summary: plugins run **in-process** with the full
privileges of the Node process; the host binds loopback only and has **no authentication
and no rate limiting**; approval of consequential acts is interactive-only through a TTY;
the agent audit trail is in memory and dies with the process.

> ## ⚠️ TRUSTED LOCAL PLUGINS ONLY
>
> **The runtime is approved for trusted local plugins only.** Capability contracts and
> declared permissions are a **least-privilege wiring contract — they are NOT a security
> sandbox.** A plugin runs in the host process and can `import('node:fs')`, open sockets
> or spawn processes while ignoring every port it was granted.
>
> **Treat plugin code as trusted first-party code, reviewed like any other file in this
> repository. Do not load a plugin you would not read.** Third-party or untrusted plugin
> execution **must not be enabled** without appropriate isolation (see *Before untrusted
> plugins* below). — Approved scope, Hudson A. R. Bonomo, 2026-10-02.

## What IS enforced (VERIFIED — `npm test`, `eip/*/ACCEPTANCE.md`)

- **Approval fails closed.** A capability marked `consequential` cannot run without a
  verdict from a human approver the **host** supplies. No approver ⇒ `APPROVAL_REQUIRED`
  and the body never runs; a refusing or throwing approver ⇒ `APPROVAL_DENIED`.
  `--approve-interactive` prompts `y/N` with default **N**; no TTY means no human.
- **No caller approves itself.** An `approval` field in an HTTP request body is refused
  with `403 APPROVAL_REQUIRED` *before* the kernel is reached; the agent gateway **drops**
  `opts.approval` and forwards provenance only.
- **Permission-filtered ports.** A plugin receives only the ports whose `permission` it
  declared. An undeclared port is **invisible** — there is no handle to misuse. An unknown
  permission is `PERMISSION_DENIED` at load.
- **Path-confined write port.** The host's `writeFile` port takes a **name**, not a path;
  absolute names, separators, `..`, NUL bytes and symlinked targets are
  `PERMISSION_DENIED`, and the return value is the relative name, so the API never
  publishes the filesystem layout. The plugin validates the name independently — two
  guards, neither trusting the other. (The symlink case is **VERIFIED** on win32 via a
  directory junction — a file symlink needs privileges; POSIX symlinks are UNKNOWN here.)
- **Localhost binding.** The host binds `127.0.0.1` only. The loopback bind *is* the
  access control.
- **Body limits and content type.** JSON only (`415` otherwise), 64 KB body cap enforced
  on the stream as well as on `Content-Length` (`413`), malformed JSON `400`.
- **CSP on the dev UI.** Diagnostics pages are off by default (`--dev-ui`), capped at
  64 KB, and served under a CSP with no `'unsafe-inline'` and no third-party origin.
- **No CORS headers at all.** A browser application must call the API from its own
  server, which is where it holds credentials — [ADR 0001](docs/adr/0001-frontend-exception.md).
- **No stacks on the wire.** Results carry `{code, message, details?}`; stacks travel only
  on the in-memory `error` event.
- **Contract validation at both ends.** Manifests, config, input and output are validated
  against a deliberately small schema subset; an unsupported keyword is itself an error.

## What is NOT enforced

None of the following exists in code anywhere in this repository (VERIFIED by inspection
of `eip/`):

- **Process isolation.** No worker, no child process, no VM context. Plugins share the
  host's event loop, heap, environment variables and file descriptors.
- **CPU or memory limits.** No budget per call. A busy loop blocks the event loop for
  every caller; `AbortSignal` cancels cooperatively, it does not preempt.
- **Filesystem or network isolation of plugin code.** The ports are the *sanctioned*
  path, not the only one. Nothing prevents direct `node:fs`, `node:net` or `node:child_process` use.
- **Supply-chain verification of plugins.** No signing, no checksum pinning, no manifest
  provenance. Composition is a hand-written list in `eip/host/cli.mjs` — reviewable, but
  trusted entirely.
- **Authentication, authorization or rate limiting on the HTTP surface.** Anything on the
  machine can call the port. Exposing it beyond loopback is a deployment defect.
- **Durable audit.** The gateway trail is in memory. There is no record of who approved
  what, surviving a restart.
- **Secrets management.** No secret store, no redaction layer; `tools/gates/secrets.mjs`
  scans the repository, which is hygiene, not a runtime control.

## Before untrusted plugins — PROPOSED, all of it

Every requirement below is **PROPOSED and not built**. Until all of them are satisfied
and reviewed, untrusted plugin execution stays off:

1. **An isolation boundary** — a separate process, a worker thread or an OS-level sandbox
   — with ports and `inject` crossing a serialisation seam the contract does not have today.
2. **Resource limits** per call: CPU time, memory ceiling, wall-clock deadline, enforced
   by the boundary rather than requested from the plugin.
3. **Signed and pinned plugins**, with provenance checked before load.
4. **A threat-model review** of the new boundary, written down like §9 of `docs/09`.
5. **Explicit human approval** recorded as an ADR, naming the residual risk that remains.

## Reporting a vulnerability

Report privately, not through a public issue: e-mail **security@tmulab.org**
(TMU-LAB — The Machine Unconscious Lab, <https://tmulab.org>). This is a role address,
not a personal one.

Please include what you ran, what you expected and what happened. There is no bounty, and
no commitment to a response window pre-1.0. Findings about the documented gaps above are
not vulnerabilities — they are the known scope; a way to break a control that §9 claims
*is* enforced, is.
