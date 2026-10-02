# EIP host — composition, not a core

The host is the only module allowed to know every part: the kernel, the plugins,
the transport and the filesystem. That is precisely what keeps the other layers
independent — and it is why nothing here is privileged inside the runtime. The
host cannot soften a contract, grant a permission a plugin did not declare, or
run a consequential capability on its own authority.

> ⚠️ **TRUSTED LOCAL PLUGINS ONLY. The host does not isolate plugins.** It
> composes them into its own process, so they inherit its full Node privileges.
> Nothing here is a security sandbox: the ports are least privilege for what the
> host *hands over*, and the loopback bind is the only access control on the HTTP
> surface — there is no authentication and no rate limiting. Load only plugin
> code you would review yourself; untrusted plugins need isolation this runtime
> does not have. See [`SECURITY.md`](../../SECURITY.md).

```
node eip/host/cli.mjs [--port 3100] [--dev-ui] [--reports-dir ./reports] [--approve-interactive]
```

| Option | Default | Effect |
|---|---|---|
| `--port` | `3100` | bound on `127.0.0.1` only; `0` asks the OS for a free port |
| `--dev-ui` | off | serves `GET /dev/plugins/{key}` diagnostics pages |
| `--reports-dir` | `./reports` | the one directory the `writeFile` port may write into |
| `--approve-interactive` | off | asks `y/N` on this terminal before each consequential call |

## Three decisions live here

1. **Who may approve.** Consequential capabilities need a verdict from a human
   approver the host supplies. With no approver the kernel is a closed door:
   every such call answers `403 APPROVAL_REQUIRED`. `--approve-interactive`
   prompts the person at the terminal, per call, `y/N`, **default no**; no TTY
   means no human, which means no.
2. **What the filesystem looks like.** `createWritePort(reportsDir)` is a
   **path-confined** write port: it accepts one safe file name — not a path.
   Absolute names, separators, `..`, NUL bytes and symlinked targets are
   `PERMISSION_DENIED`, and the port answers with the name relative to the
   reports directory, so the API never publishes the layout. It confines the
   *port*, not the plugin: a plugin can still reach the filesystem directly.
3. **Whether diagnostics exist.** The dev UI is off by default. When on, the page
   is served under a CSP with no `'unsafe-inline'`: the plugin ships markup, the
   host owns the document, the stylesheet and the single same-origin script.

## An HTTP caller can never approve itself

This is the rule worth repeating, because the alternative looks convenient. The
request body is exactly `{"input": …}`. A body carrying `approval` is refused
with `403 APPROVAL_REQUIRED` **before** the kernel is called, and the approver is
not even consulted — a caller that issues its own consent has not produced
consent, it has produced a request. Approval enters the process through the
host's approver and through nothing else, so the accountable party is always a
person, never a socket.

## Transport rules

JSON only (`415` otherwise) · 64 KB body limit (`413`, enforced on the stream as
well as on `Content-Length`) · malformed JSON `400` · wrong method `405` with an
`Allow` header · unknown path `404` · security headers on every response
(`nosniff`, `no-referrer`, `DENY`, `no-store`) · **no CORS headers at all**: a
browser application consumes this API through its own server-side route handler
(see `examples/api-client/`), which is also where it adds authentication.

The error envelope is always `{ok:false,error:{code,message,details?}}`, with
`code` from the architecture's closed list and never a stack. The code → status
map lives in `eip/host/errors.mjs`; the contract is `api/openapi.json`, which
`openapi.test.mjs` validates against real responses.

Acceptance criteria and the mutation verdict: [ACCEPTANCE.md](ACCEPTANCE.md).
