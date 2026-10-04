# ADR 0005 — UPP: JSON-RPC 2.0 over NDJSON, adapted into the existing kernel

- **Status:** **Accepted — approved by Hudson A. R. Bonomo, 2026-10-04.** Implemented in
  Stage 5 cells 2–7; results and limits in `UPP_REPORT.md`.
- **Date:** 2026-10-03
- **Deciders:** implementation agent (proposer); Hudson A. R. Bonomo (confirmation pending)
- **Scope:** the host↔plugin protocol — `docs/upp/`, `eip/upp/`, `upp/schemas/`,
  `upp/conformance/`, and the transports a host may use to reach a plugin
- **Relates to:** [ADR 0001](0001-frontend-exception.md) (complex UIs are not plugins),
  [ADR 0002](0002-zero-dependency-kernel.md) (zero dependencies, a schema subset we own),
  [ADR 0003](0003-observer-frontend.md) (which recorded an application-plugin kind as
  PROPOSED), [ADR 0004](0004-cellular-adaptive.md) (an optional module stays optional)

## Context

"Everything is a plugin" is currently true only for JavaScript. A plugin is a frozen
`definePlugin` manifest plus a service object living in the host's process
(`eip/sdk/define.mjs`, `eip/kernel/lifecycle.mjs`), so a capability written in Python, Java
or Rust cannot participate at all — not because the *concepts* are language-bound, but
because the only expression of them is a JS object with a function in it.

The audit in [`docs/upp/AUDIT.md`](../upp/AUDIT.md) measured what a language-neutral protocol
would actually have to add. The answer was smaller than expected: of 30 capabilities,
**14 already exist and are reused unchanged**, 13 need new code — nearly all of it an
adapter over something that exists — and 3 are deliberately out of scope. Specifically,
registration, key format, dependency and cycle checking, input/output validation, the
approval gate, the deadline, the `AbortSignal`, the closed error list, the containment rule
and the dispose contract are all already implemented, tested and mutation-proven
(`eip/kernel/ACCEPTANCE.md`, 14 criteria).

That measurement is what makes this decision a *protocol* decision rather than a *runtime*
decision. The guarantees do not need to be rebuilt. They need a wire format and one adapter.

## Decision

1. **Messages are JSON-RPC 2.0.** Request/response with host-assigned `id` correlation,
   notifications for `upp.cancel` and `upp.exit`, the five standard error codes, and
   UPP-specific errors in the reserved `-32000..-32099` server-error range.
2. **The error vocabulary stays the kernel's.** `error.data.code` carries a code from the
   closed `CODES` list (`eip/sdk/errors.mjs:5-22`); **no new architecture code is added.**
   The integer belongs to the transport, the name belongs to the architecture, and
   `PASSTHROUGH_CODES` — `NOT_FOUND`, `INPUT_INVALID` — remain the only codes a plugin may
   claim, so a remote plugin can no more forge an approval than a local one can.
3. **Schemas are the existing SDK subset**, published as JSON files under `upp/schemas/` so
   another language can consume the same contract instead of a translation of it.
4. **Framing over stdio is NDJSON**, one UTF-8 JSON value per line, 1 MiB maximum; `stdout`
   is protocol only and `stderr` is diagnostics that are **never parsed**.
5. **An adapter, not a parallel runtime.** An external plugin is registered into the existing
   kernel as an ordinary `definePlugin` manifest whose service proxies each capability to the
   transport. Approval, validation, timeouts, cancellation, events, dispose: all the existing
   code paths, unmodified. External plugins receive **no kernel ports** in v1 — ports are
   in-process functions and the contract has no serialisation seam for them.
6. **Existing JS plugins are untouched.** A pure `toUppManifest(manifest)` maps them for
   documentation and conformance; no file under `eip/plugins/` changes, and
   `api/openapi.json` does not move.
7. **Operator-authorised execution.** A `process` plugin is spawned only if a human-written
   `upp.config.json` lists it with its argv array and a `manifestSha256` that matches, with
   `shell: false`, a confined `cwd` and a minimal environment. A separate process is failure
   isolation, **not** a sandbox.

Full normative text: [`docs/upp/SPEC.md`](../upp/SPEC.md) and
[`docs/upp/SPEC-MESSAGES.md`](../upp/SPEC-MESSAGES.md). Criteria:
[`docs/upp/ACCEPTANCE.md`](../upp/ACCEPTANCE.md).

## Alternatives rejected

### A · gRPC now (rejected)

The obvious industrial answer, and genuinely better at several things: a schema-first IDL,
streaming, deadlines in the protocol itself, and mature tooling in every target language.

It fails this repository's constraints on contact. gRPC needs **protoc** and a generated stub
per language — a build step and a dependency where [ADR 0002](0002-zero-dependency-kernel.md)
has zero of both, and `tools/gates/deps.mjs` enforces it. Generated code is not hand-written,
so the 200-line rule would need a blanket exclusion wide enough to park anything in. The wire
format is binary, so a failing message cannot be read in a log or replayed with `cat`, which
is most of how the conformance fixtures in cell 4 are supposed to work. And the protobuf
schema would become a **second** schema language beside the subset the SDK already validates
both ends with — two vocabularies, one of them unowned.

Recorded as a **PROPOSED future transport** (SPEC.md §12), reachable as an additive MINOR
change: a new `runtime` value and a new `entry` shape. Choosing NDJSON now costs nothing
later, because the *messages* are the contract and the framing is not.

### B · MCP as the plugin protocol (rejected)

MCP is the protocol everyone will ask about, so the reason is worth stating precisely rather
than dismissively. MCP answers *"what may a model call, and how is that exposed to it"*: tool
listing, tool invocation, resources, prompts. UPP answers *"how does a host own a plugin's
life"*: spawn, version handshake, validated config, health, drain, exit, deadline
propagation, cancellation, and — the one that matters most here — a **fail-closed human
approval gate on consequential capabilities** that no caller, including the model, can
satisfy on its own behalf (`eip/kernel/execute.mjs:86-110`).

Adopting MCP for this layer would mean either stretching it to carry lifecycle and authority
concepts it does not have, or accepting that a host cannot state when a plugin is ready to be
called. It would also create a second answer to "what may be invoked" beside the agent
gateway's allow-list (`eip/orchestration/README.md`), which is the one place authority is
supposed to live. The two protocols are complementary, not competing: an **MCP bridge** — one
UPP plugin exposing selected capabilities as MCP tools, still behind the gateway and still
behind the approval gate — is recorded as PROPOSED and is the right place for the question.

### C · A custom binary framing (rejected)

A length-prefixed binary envelope would be faster and would make the 1 MiB cap trivially
enforceable before parsing. It would also be a format with exactly one implementation, one
specification, and one set of bugs — ours — in a project whose premise is that the whole
runtime can be read in an afternoon. The polyglot goal makes it worse, not better: every new
language would need the framing written by hand before a single capability could run, and a
mis-framed message would be unreadable precisely when someone is trying to debug it.
Performance is not a stated problem here, and inventing a format to solve a problem nobody
measured is how a protocol acquires a maintenance burden with no counterpart.

### D · LSP-style `Content-Length` header framing (rejected)

Tempting, because UPP's method set is openly modelled on LSP's lifecycle and LSP has proven
this framing over stdio for a decade. The headers buy one real thing: an explicit byte length,
so a reader never has to scan for a delimiter and a binary or embedded-newline payload is
expressible.

Neither benefit applies. UPP payloads are JSON, and JSON cannot contain an unescaped newline
inside a string, so the delimiter is already unambiguous — NDJSON is self-synchronising for
*this* payload type in a way it would not be for an arbitrary one. What the headers would
cost is concrete: a two-phase reader (parse headers, then read exactly N bytes) in every
target language, where the whole point of cell 4 is that a Python or Java plugin should be a
readable file written with the standard library and no framing library. `print(json.dumps(x),
flush=True)` and `for line in stdin` are the entire implementation; a header parser is not.
NDJSON also stays greppable in a log and replayable from a fixture file, which is the
mechanism the conformance suite is built on.

The lifecycle *shape* is borrowed from LSP, which is the part worth borrowing. The framing is
not, and the two were never the same decision.

### E · Extend the SDK manifest in place, with no separate protocol (rejected)

Add `runtime` and `entry` to `eip/sdk/manifest.mjs` and let the kernel spawn processes. It
would be fewer files. It would also put process spawning, a wire format and a child-process
supervisor inside the contract floor — the module that today imports nothing and is the
reason the contract is independently usable (`sdk-depends-on-nothing`,
`tools/gates/boundaries.mjs:59-64`). The SDK would stop being readable as "what a plugin may
declare" and become "what a plugin may declare, plus how one kind of plugin is launched". UPP
lives in its own layer with its own boundary rule for exactly that reason.

## Consequences

**Positive.** A capability can be written in any language that can read a line and write a
line. Every security and correctness guarantee is reused rather than re-implemented, so there
is no second place for them to drift: one approval gate, one validator, one error list, one
dispose contract. Failure isolation arrives as a side effect of the `process` transport — a
crashing plugin stops taking the host with it, which the in-process runtime cannot offer at
all. The messages are human-readable, which makes the polyglot conformance suite a set of
JSON files rather than a test harness per language. Zero dependencies survive intact.

**Negative.** A serialisation seam appears where none existed, and it is not free: ports do
not cross it (so an external plugin cannot write a file through the host's path-confined
write port), a live sibling reference does not cross it, and every input and output is now
JSON-round-tripped. Spawning processes is new attack surface and new operational surface —
orphan processes, zombie children, a `upp.config.json` that can be wrong. Cancellation
becomes genuinely best-effort rather than merely cooperative. There are now two manifest
shapes to keep in agreement, and `toUppManifest` is the only thing stopping them from
diverging. And a protocol, once a third party has written against it, is a compatibility
obligation in a way an internal interface is not.

**Neutral.** The protocol is versioned from day one (`"MAJOR.MINOR"`), so the additive path
for gRPC, WASM, progress notifications or server-initiated requests is specified rather than
improvised. The `extensions` object is the single declared place where an unknown key is
tolerated; everywhere else, including every security-sensitive section, it is rejected.

**Out of scope, deliberately.** Not MCP, not a sandbox, not a marketplace, no exactly-once,
no disk discovery, no hot reload, no `devUi` across the wire. Cellular Adaptive stays
decoupled: no UPP module may import `tools/adaptive/`, and the removal rehearsal must remain
green with UPP present.

## What this does NOT decide (PROPOSED only)

The gRPC and WASM transports; progress notifications and server-initiated requests; an MCP
bridge; ports across the serialisation seam; signed plugins and provenance; OS-level
sandboxing of untrusted plugins ([`SECURITY.md`](../../SECURITY.md), "Before untrusted
plugins"); and the detailed application-plugin contract, which is cell 5's deliverable and is
only summarised in SPEC.md §10. None of these exists in code.
