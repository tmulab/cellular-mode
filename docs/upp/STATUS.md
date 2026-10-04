# UPP 1.0 — what is verified, what is unverified, what is only proposed

One table, three labels, no overlap. **VERIFIED** means a command was run and its output
recorded; **UNVERIFIED** means the artefact exists and nothing about its behaviour was measured;
**PROPOSED** means designed or recommended and *not built*. Nothing here is a plan presented as
a result.

Full account: [`UPP_REPORT.md`](../../UPP_REPORT.md) · interop rows and toolchain versions:
[`CONFORMANCE.md`](CONFORMANCE.md) · CI history: [`CI.md`](../../tools/gates/CI.md) ·
residual security risks: [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md).

## VERIFIED — locally (win32) **and** in CI (`ubuntu-24.04`, Node 22 + Node 24)

CI evidence is run [`37194084612`](https://github.com/tmulab/cellular-mode/actions/runs/37194084612),
conclusion `success`, commit `5c18401`, both matrix jobs, every step success,
**1028 tests · 1028 pass · 0 fail · 0 skipped · 0 cancelled · 0 todo** per job.

| Thing | What was executed |
|---|---|
| The UPP contracts (manifest, messages, version negotiation, error mapping, NDJSON framing, the compat layer) | the pure-rule suites in `eip/upp/`, inside the whole-suite run above, on both Node lines and both operating systems |
| The **process** transport (NDJSON over stdio) | full lifecycle, minimal env, deadline propagation, `upp.cancel`, the 1 MiB frame cap both ways, `-32700`, crash `-32003`, exactly one restart, no orphan child |
| The **http** transport (POST `<baseUrl>/upp`) | a full execute on loopback, pin refusal at `initialize`, `-32002` on no version overlap, `redirect: 'error'`, non-200/204 `-32003`, remote URL refused without `allowRemote` + a token *name* |
| Application-plugin **registration** (`type: "application"`) | registration as identity, health probing, managed supervision with at most one restart; the kernel never loads or proxies an application |
| Conformance in **five** implementations | 11/11 cases each for `in-process`, `node`, `python`, `java`, `rust` — locally, and again in CI under `--require python,java,rust`, so a skip there exits 1 |
| **Article 8** final verification, including byte equivalence | the fingerprint-run-refingerprint sequence, the CRLF/LF refusal before the suite, and `equivalent: true` required for authorization |
| The **CI workflow** itself | its structure by `tests/ci-workflow*.test.mjs`; its *behaviour* by three real remote runs — two that failed and found real defects, one green |

## UNVERIFIED — committed, never executed, nothing claimed

| Thing | Exactly what is missing |
|---|---|
| The **C++ example plugin** (`examples/upp-cpp/`) | this suite never builds or runs it, locally or in CI, by design. The conformance row is `UNEXECUTED`, which is not a pass, not a failure and not a skip. This says nothing about whether any particular machine has a C++ toolchain |
| The **Next.js application example** (`examples/upp-app-nextjs/`) | a contract, not an app: markdown, a manifest and a config snippet. The code inside the markdown has never been typechecked, built or run, and no framework entered the repository |

## PROPOSED — designed or recommended, not built

| Thing | Why it is not here |
|---|---|
| **gRPC transport** | a code generator and a dependency in every language, against [ADR 0002](../adr/0002-zero-dependency-kernel.md) |
| **WASM transport** | the only candidate that would be a *real* sandbox; its host API surface is a design project of its own |
| **MCP bridge** | MCP exposes tools to a *model*; UPP governs a *host's* lifecycle over a plugin. A separate decision, with an ADR before any code |
| **OS-level sandbox for untrusted plugins** | the prerequisite for running code the operator does not trust, and the largest gap in the architecture ([`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) §3) |
| **Ports for external plugins** | a port is an in-process function; a serialised port is a new contract, so v1 grants **none** and says so in code |
| **Sibling calls from external plugins** | `dependencies` become `inject`, so composition is still checked, but `ctx.get` is unreachable from the far side of a pipe |
| **Branch protection on `main`** | a repository setting and a human decision. It is a **recommendation only** ([`CI.md`](../../tools/gates/CI.md)); no setting was changed by this work, so until someone enables it the workflow reports and does not block |
