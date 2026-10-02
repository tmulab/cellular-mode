# Acceptance criteria — EIP kernel (S2-5)

Declared BEFORE the implementation existed. The verification question is
**"how do we verify the kernel really works?"** — not "does it run?".

A kernel "works" when four promises hold: a broken contract never loads, a
registration is a reversible effect, a dependency is assembled at CALL time,
and a consequential act cannot happen without a human decision. Everything
below is one of those four, made executable. Each criterion names the test
that proves it and what goes red if the guard is removed.

| # | Criterion | Expected result | Proven by | Red without the fix |
|---|---|---|---|---|
| K1 | A manifest that breaks the contract never enters the registry | `register` throws `CONTRACT_INVALID` with structured `{path,message}` details; `list()` stays empty | `registry.test.mjs` · "register refuses…" | manifest accepted ⇒ `list()` length 1 |
| K2 | One key, one owner | second `register` of the same key throws `DUPLICATE_KEY`; first manifest survives | `registry.test.mjs` · "duplicate key" | silent overwrite ⇒ version assertion fails |
| K3 | Required-inject cycles are impossible | `load` throws `DEPENDENCY_CYCLE` naming the path | `registry.test.mjs` · "cycle" | infinite recursion / load succeeds |
| K4 | P1 — the plugin provides the key it declares | after `load`, the service answers; `list()` shows the declared `inject` map exactly | `lifecycle.test.mjs` · "P1" | missing capability or inject map drift |
| K5 | P2 — impossible composition fails LOUD at load | invalid required config ⇒ `INPUT_INVALID`, and the key is NOT provided afterwards | `lifecycle.test.mjs` · "P2" | plugin loads half-built; `get` returns a service |
| K6 | P3 — unloading leaves zero residue | inverse effects run in REVERSE registration order; key gone; reload works; sibling untouched | `lifecycle.test.mjs` · "P3" | leftover timer/handler, wrong order, dead reload |
| K7 | A dependency in use cannot be pulled out | `dispose` of a provider with a loaded required dependent throws `DEPENDENCY_IN_USE` listing the dependents | `lifecycle.test.mjs` · "dispose refuses" | consumer left holding a disposed service |
| K8 | Least privilege on ports | plugin sees only ports whose `permission` it declared; an undeclared port is invisible (`undefined`) | `lifecycle.test.mjs` · "ports" | plugin can call a port it never declared |
| K9 | Assembled at CALL time, never at apply | provider loaded AFTER the consumer is visible via `ctx.get`; required-not-loaded throws `DEPENDENCY_MISSING` at call time; optional returns `undefined` and the consumer degrades | `lifecycle.test.mjs` · "lazy" | load order becomes significant; eager resolution |
| K10 | Consequential acts are fail-closed | no approver ⇒ `APPROVAL_REQUIRED`; approver returning `false` or throwing ⇒ `APPROVAL_DENIED`; the capability body never runs | `execute.test.mjs` · "approval" | side effect performed without a decision |
| K11 | Contract at both ends | bad input ⇒ `INPUT_INVALID`; a capability returning the wrong shape ⇒ `OUTPUT_INVALID`, both with `{path,message}` | `execute.test.mjs` · "input"/"output" | invalid data crosses the seam |
| K12 | Cancellation and timeout are real | aborted signal ⇒ `CANCELLED`; slow capability ⇒ `TIMEOUT`; no unhandled rejection, no leaked timer | `execute.test.mjs` · "cancel"/"timeout" | call hangs; process stays alive |
| K13 | Plugin faults are contained, not leaked | a throwing capability ⇒ `{ok:false,error:{code:'PLUGIN_ERROR'}}` with NO `stack` in the result; the stack appears only on the `error` event | `execute.test.mjs` · "plugin error" | stack in the API result (information leak) |
| K14 | Observability without noise | events `register/load/dispose/execute/error/approval` carry `{key,ok,ms,at}`; `list()` omits `apply` and `devUi.html`; nothing is written to stdout/stderr by default | `events.test.mjs` | console output appears; secrets/handlers in `list()` |

SDK criteria (same cell, S2-4) are pinned by `schema.test.mjs`,
`manifest.test.mjs` and `define.test.mjs`: the schema validator accepts only
the declared keyword subset (a schema with an unsupported keyword is itself a
contract error), key format / semver / sdk / permissions come from a fixed
list, and `definePlugin` returns a FROZEN manifest or throws.

## Verdict (mutation proof)

Each row: the guard was deliberately broken, the suite was run, the red was
observed, the code was restored and the suite returned green. A mutation that
stays GREEN is a finding about the test, not a pass.

Baseline: 77 tests, 77 pass (SDK + kernel, after the S2-7 approval fix below).
Every mutation below was reverted and the suite
returned to 74/74.

| Criterion | Mutation applied | Observed red (74 tests) |
|---|---|---|
| K8 | `lifecycle.mjs` · `grantPorts` grants every host port instead of only declared permissions | 3 fails — `K8 ports — a plugin sees only ports whose permission it declared`, `K8 ports — an undeclared port is invisible` (got `[Function: fn]`, expected `undefined`), `K14 load event reports granted/withheld` |
| K6 | `lifecycle.mjs` · `runDisposers` iterates in registration order, `.reverse()` removed | 1 fail — `K6 P3 inverse effects run in REVERSE order` (teardown log came back in registration order) |
| K9 | `lifecycle.mjs` · `ctx.get` reads an eager snapshot taken at apply time | 4 fails — all three K9 tests plus `K7 an OPTIONAL dependent never blocks dispose`, because a stale snapshot kept answering after dispose |
| K10 | `execute.mjs` · a missing approver returns "approved" instead of `APPROVAL_REQUIRED` | 1 fail — `K10 approval — no approver is a closed door, and the body never runs` (the call succeeded and the write port was used) |
| K13 | `execute.mjs` · the `PLUGIN_ERROR` result carries `error.stack` | 2 fails — `K13 plugin error — no stack leaks into the result` (`'stack' in result.error` became true) and `K9 required dependency not loaded`, which pins the named code in `details` |

False-green watch: the approval and dependency tests assert the exact
`error.code` (never a bare rejection), so a mutation cannot hide behind "it
threw something". `TIMEOUT` and `CANCELLED` are distinguished by code for the
same reason.

## Design choices, decided here and documented

- **Load-time vs call-time.** A required dependency must be REGISTERED at load
  (checked, plus the cycle check) and LOADED at call time (K9). Load order is
  therefore irrelevant, and a composition with a missing contract still fails at
  boot rather than in production.
- **Dispose policy: refuse, never cascade.** `dispose` of a provider with a
  loaded required dependent throws `DEPENDENCY_IN_USE` and lists them (K7).
  Cascading would make one explicit act tear down services nobody named; the
  caller disposes the dependents first. Optional dependents never block: they
  degrade, which is what "optional" was declared to mean.
- **Ports.** Undeclared ports are INVISIBLE, not refused — least privilege by
  construction, with no handle to misuse and no error to discover at 3 a.m. A
  mandatory port is the plugin's own guard in `apply`: keys degrade, ports fail
  loud. A port naming an unknown permission is `PERMISSION_DENIED` at load.
- **Invalid config at load** reports `INPUT_INVALID` with every path prefixed
  `config.`; the key is never provided half-built.
- **An approval verdict may be asynchronous** (defect found while building the
  host, S2-7; fixed here, failing test first). A human decision takes time — a TTY
  prompt, a queue, a message — so an interactive approver can only answer with a
  promise. `decide` read the verdict synchronously, so every such approver was
  treated as a "malformed verdict" and denied: fail-closed, but a gate that can
  never open is not a gate, and `--approve-interactive` could not have existed.
  `execute.mjs` now `await`s the approver; synchronous approvers are unaffected.
  Pinned by three tests in `approval.test.mjs` (granted / refused / rejected).
- **`execute` returns, `register`/`load`/`dispose` throw.** The call path is the
  one an edge (HTTP, agent gateway) drives, and it must answer without a
  try/catch; composition is programmer error and should interrupt.
