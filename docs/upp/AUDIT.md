# UPP · Architecture audit — what already EXISTS, what must be BUILT

Stage 5, cell 1. **Read-only audit** of the `eip/` runtime against the Universal Plugin
Protocol (UPP 1.0, [SPEC.md](SPEC.md), [ADR 0005](../adr/0005-universal-plugin-protocol.md)).

The question this file answers is deliberately narrow: *before writing a single line of
protocol code, which guarantee is already implemented and testable, and which one is only
a sentence in a plan?* Every row carries `file:line` evidence read in this cell
(**VERIFIED** by inspection of the named lines at `HEAD b92c7c8`); nothing here is
inferred from a README alone.

## Verdict vocabulary

| Tag | Meaning |
|---|---|
| **EXISTS** | implemented and already covered by a test; UPP reuses it unchanged, through the same code path |
| **BUILD** | a gap. UPP needs new code (usually an adapter over an EXISTS row), with its own acceptance criterion in [ACCEPTANCE.md](ACCEPTANCE.md) |
| **OUT** | deliberately out of scope for UPP 1.0, with the reason stated |

Counts (this file, VERIFIED by counting the verdict column): **EXISTS 14 · BUILD 13 ·
OUT 3**, across 30 capabilities.

## 1 · Contract floor and registration

| # | Capability | Evidence | What EXISTS today | UPP mapping / what must be BUILT | V |
|---|---|---|---|---|---|
| 1 | Registration | `eip/kernel/registry.mjs:58`, `eip/kernel/index.mjs:40` | `register(manifest)` validates then records; one key one owner (`registry.mjs:70`, `DUPLICATE_KEY`) | reused as-is. An external plugin enters through an **adapter manifest** and this same `register`. **No parallel registry.** | EXISTS |
| 2 | Key format | `eip/sdk/manifest.mjs:9-11` | `KEY_PATTERN` `domain.capability-key`, `CAPABILITY_ID_PATTERN`, `SEMVER` | reused as-is → UPP `manifest.id`, `manifest.version`, capability ids. The UPP validator **imports** these constants, never restates them | EXISTS |
| 3 | Unknown-field rejection | `eip/sdk/manifest.mjs:20-23,150-154` | `MANIFEST_FIELDS` is a closed list; an unknown field is a `{path,message}` breach | mapped to the UPP manifest field list. **BUILD:** the `extensions` object is the one place unknown keys are ignored; `permissions`/`runtime`/`entry` reject them absolutely | BUILD |
| 4 | Capability schemas | `eip/sdk/manifest.mjs:92-120`, `eip/sdk/schema.mjs:11-18` | `input`/`output`/`consequential`/`description` all required per capability; schema subset is 11 keywords, anything else is itself a contract error | reused as-is → UPP `capabilities.<id>`. **BUILD:** publish the subset + the message shapes as JSON files under `upp/schemas/` so Python/Java/Rust can consume them (cell 2) | BUILD |
| 5 | Schema validation | `eip/sdk/schema.mjs:44,174,196` | `validateSchema` (is the schema legal) and `validate`/`check` (does the value fit) — pure, no I/O, no deps | reused as-is, host-side, for every UPP message and every capability input/output | EXISTS |
| 6 | Config schema | `eip/sdk/manifest.mjs:158`, `eip/kernel/lifecycle.mjs:98-105` | declared `config` schema validated at `load`; failure is `INPUT_INVALID` with every path prefixed `config.` | reused as-is. **BUILD:** the validated config must reach an out-of-process plugin — specified as an OPTIONAL `config` member of `upp.initialize` params (SPEC.md §6, approved as a design call in this cell) | BUILD |
| 7 | Frozen declaration | `eip/sdk/define.mjs:21-38` | `definePlugin` validates at module load and deep-freezes; a declaration that can change later is not a contract | reused as-is for the in-process compat layer. An external manifest is JSON, so freezing happens after parse, in the adapter | EXISTS |
| 8 | `devUi` fragment | `eip/sdk/manifest.mjs:18,123-137` | optional `{title, html}`, ≤ 64 KiB, served only with `--dev-ui` (`eip/host/router.mjs:109-118`) | **OUT.** A UPP manifest has no `devUi`: shipping markup as a string across a process boundary adds an injection surface for zero gain. Interfaces are `type:"application"` (cell 5) and [ADR 0001](../adr/0001-frontend-exception.md) | OUT |

## 2 · Dependencies, ports and permissions

| # | Capability | Evidence | What EXISTS today | UPP mapping / what must be BUILT | V |
|---|---|---|---|---|---|
| 9 | `inject` declaration | `eip/sdk/manifest.mjs:53-71` | `{key: {required: boolean}}`, sibling keys only, self-injection refused, no extra members allowed | mapped to UPP `dependencies:{key:{required}}` — same shape, renamed because "inject" names a mechanism an external plugin does not have | EXISTS |
| 10 | Call-time resolution | `eip/kernel/lifecycle.mjs:43-62,74` | `ctx.get(key)` resolves at **call** time; undeclared access is `DEPENDENCY_MISSING`; required-and-unloaded fails loud; optional returns `undefined` | reused as-is. **BUILD:** an external plugin cannot hold a live sibling reference, so the adapter exposes dependencies only as host-side re-entry (`kernel.execute`) — or not at all in v1 | BUILD |
| 11 | Missing required at load | `eip/kernel/lifecycle.mjs:106-113` | unregistered required keys ⇒ `DEPENDENCY_MISSING` listing each | reused as-is; adapter manifests go through the identical `load` path | EXISTS |
| 12 | Cycle detection | `eip/kernel/registry.mjs:14-42`, `eip/kernel/lifecycle.mjs:114-121` | pure DFS over **required** edges only; `DEPENDENCY_CYCLE` naming the path; optional edges are degradations, never knots | reused as-is. A cycle through an external plugin is caught by the same function, because the adapter manifest declares the same edges | EXISTS |
| 13 | Permissions list | `eip/sdk/manifest.mjs:14-16` | closed list of 6: `fs.read` `fs.write` `net.outbound` `process.spawn` `clock` `random`; unknown ⇒ breach; duplicates ⇒ breach | reused as-is → UPP `permissions:[…]`, same closed list, for declaration and audit | EXISTS |
| 14 | Port granting | `eip/kernel/ports.mjs:19-41` | a plugin sees only ports whose `permission` it declared; an undeclared port is **invisible**, not refused; an unknown permission is `PERMISSION_DENIED` at load | reused as-is for in-process plugins. **BUILD:** the adapter grants **no ports at all** to a `process`/`http` plugin — ports are in-process functions and a serialisation seam does not exist. The refusal must be explicit code, not an omission | BUILD |
| 15 | Port isolation claim | `eip/sdk/README.md:65-72`, `SECURITY.md:25-35` | documented, VERIFIED: permissions are a wiring contract, **not** a sandbox; plugins run in-process with full Node privileges | carried into SPEC.md §12 unchanged and strengthened, not weakened: a separate process is **failure isolation**, still not a sandbox | EXISTS |

## 3 · Execution, authority and bounds

| # | Capability | Evidence | What EXISTS today | UPP mapping / what must be BUILT | V |
|---|---|---|---|---|---|
| 16 | Gate order | `eip/kernel/execute.mjs:1-4,132-187` | found → input valid → approved → deadline → output valid; a later gate never compensates for an earlier one; `execute` **returns**, never throws | reused as-is. UPP adds exactly one step **inside** the "run" slot: the transport call. Every gate stays host-side | EXISTS |
| 17 | Input / output validation | `eip/kernel/execute.mjs:139-144,181-186` | `INPUT_INVALID` / `OUTPUT_INVALID` with structured `{path,message}` | reused as-is. **Decision:** the host validates both ends even though the plugin may validate too — two guards, neither trusting the other | EXISTS |
| 18 | Consequential + approval | `eip/kernel/execute.mjs:86-110,145-148`; host `eip/host/index.mjs:42-45`; HTTP refusal `eip/host/router.mjs:101-103` | fail-closed: no approver ⇒ `APPROVAL_REQUIRED` and the body never runs; refusing or throwing approver ⇒ `APPROVAL_DENIED`; an HTTP caller cannot carry its own consent | reused as-is, and this is the single most important reuse: the approval gate runs **before the first byte reaches the transport**. **BUILD:** the adapter must prove no bytes are written on a denied call | BUILD |
| 19 | Timeouts | `eip/kernel/execute.mjs:46-74,150`; `eip/kernel/index.mjs:35` | `runWithDeadline` with `defaultTimeoutMs`; `TIMEOUT` kept distinct from `CANCELLED` | reused as-is. **BUILD:** deadline **propagation** — `upp.execute.params.deadlineMs` so the plugin can stop on its own; the host's deadline remains authoritative | BUILD |
| 20 | Cancellation | `eip/kernel/execute.mjs:47-52,154` | `AbortSignal` threaded into the capability as `fn(input, {signal, key, cap})`; aborted-before-start ⇒ `CANCELLED` | reused as-is. **BUILD:** bridge `signal` → `upp.cancel` notification. **Best effort only**: a plugin that ignores it still gets `CANCELLED` from the host, and the process may keep working — stated, never claimed away | BUILD |
| 21 | Error codes | `eip/sdk/errors.mjs:5-22` | closed list of 14 `CODES`; `KernelError.toResult()` ⇒ `{code,message,details?}`, **never a stack** | reused as-is. **BUILD:** the JSON-RPC ↔ `CODES` mapping (`-32000..-32099`, SPEC.md §9). **No new kernel code is added** — `CODES` stays closed, so `PLUGIN_UNAVAILABLE` maps onto `PLUGIN_ERROR` | BUILD |
| 22 | Fault containment | `eip/kernel/execute.mjs:162-178`; `eip/sdk/errors.mjs:77-88` | a throwing plugin ⇒ `PLUGIN_ERROR`; stack only on the in-memory `error` event; `PASSTHROUGH_CODES = ['NOT_FOUND','INPUT_INVALID']` are the **only** codes a plugin may claim, because authority is never a plugin's to forge | reused as-is, and extended across the wire unchanged: an external plugin's `error.data.code` is honoured **only** for those two codes; anything else, including a forged `APPROVAL_DENIED`, becomes `PLUGIN_ERROR` | EXISTS |
| 23 | Dispose / zero residue | `eip/kernel/lifecycle.mjs:152-191` | inverses run in **reverse** order; `DEPENDENCY_IN_USE` refuses while a required dependent is loaded; residue is cleaned even on a failed `apply` (`lifecycle.mjs:130`) | reused as-is. **BUILD:** the adapter registers an `onDispose` that performs `upp.shutdown` → `upp.exit` → kill after `lifecycle.shutdownTimeoutMs`, so "no orphan process" is a structural property and not a habit | BUILD |

## 4 · Observability, transport and the host edge

| # | Capability | Evidence | What EXISTS today | UPP mapping / what must be BUILT | V |
|---|---|---|---|---|---|
| 24 | Events | `eip/kernel/events.mjs:10-12,43-56,59` | 7 types (`register load dispose execute error approval plugin`), `{type,key,cap?,ok,code?,ms,at}`, in-memory, **silent by default**, a throwing listener is isolated and recorded | reused as-is. **BUILD:** transport diagnostics — a plugin's `stderr` is captured and surfaced as a `plugin` event, **never parsed as protocol** | BUILD |
| 25 | HTTP host API | `eip/host/router.mjs:24,65-69`; `eip/host/errors.mjs:25-40`; `eip/host/body.mjs:15`; `api/openapi.json` (3 paths, OpenAPI 3.1) | 3 routes under `/api/v1`, code→status map, 64 KiB body cap, JSON only, no CORS, loopback bind (`eip/host/index.mjs:17`) | **unchanged.** UPP's `http` transport is a *different direction*: the host is the **client** of `<baseUrl>/upp`. Nothing is added to `api/openapi.json`, so the published contract does not move | EXISTS |
| 26 | Agent gateway | `eip/orchestration/README.md:37-56` | allow-list is the whole authority; `opts.approval` is **dropped**; every attempt audited | reused as-is and transport-blind: an agent calls `key#cap` and never learns whether the plugin is in-process, a child process or an HTTP service | EXISTS |
| 27 | Observer composition | `eip/host/observer-composition.mjs:27,30-39,54` | `OBSERVER_PLUGINS`; repository and adaptive read ports created **only** when the plugin that needs them is in the list; `adaptiveParts()` uses dynamic imports so an absent module is a legible `null` | **OUT** for UPP 1.0: the Observer stays an in-process reader of a local vault. Its plugins remain ordinary `definePlugin` manifests and are only *mappable* by the compat layer | OUT |
| 28 | Cellular Adaptive | `docs/10-adaptive.md:1-6`; gate rule `tools/gates/boundaries.mjs:129-133` | optional and isolated by a **gate**: nothing in the method, the Observer or the runtime may import `tools/adaptive/` | **OUT, and must stay out.** No UPP module may import `tools/adaptive/`; the removal rehearsal (`npm run rehearse:adaptive-removal`) must remain green with UPP present (criterion U31) | OUT |
| 29 | Gates | `tools/gates/size.mjs:30`; `tools/gates/boundaries.mjs:58-134`; `tools/gates/allowlists.mjs` | 200-line default limit with named exceptions only; 12 import-direction rules as **data**; three hand-checked allowlists | **BUILD:** a named boundary rule for `eip/upp/` (SDK + own directory + the kernel public entry at most), so the new layer's arrows are checked and not merely described | BUILD |
| 30 | Article 8 / hooks | `docs/00-constitution.md:194`; `tools/gates/FINAL-VERIFICATION.md:110,151` | `commit-msg` hook appends `Verified-State: sha256:<fp> tree:<id>`; a server-side re-check is registered as future work | **BUILD** (cell 6): `tools/gates/ci-trailer.mjs` parses the trailer and compares its tree with `git rev-parse HEAD^{tree}`; commits predating Article 8 are matched by a documented **PRE-ARTICLE-8** policy and never fabricated | BUILD |

## What the audit changed about the plan

Three findings worth stating, because each one removes work rather than adding it:

1. **No new error code is needed.** `CODES` is closed on purpose (`eip/sdk/errors.mjs:5`),
   and every UPP failure already has a home in it. `PLUGIN_UNAVAILABLE` is a *transport*
   fact and maps to `PLUGIN_ERROR`; it never becomes a 15th architecture code.
2. **`PASSTHROUGH_CODES` already answers the hardest wire question.** The rule that a
   plugin may claim `NOT_FOUND` and `INPUT_INVALID` and nothing else was decided for
   in-process throws (`eip/kernel/ACCEPTANCE.md`, K14). It transfers to a remote
   `error.data.code` verbatim, which is why a remote plugin cannot forge an approval.
3. **The host's published API does not move.** UPP is host↔plugin. `api/openapi.json`
   stays a three-route document, so no existing consumer is affected by any of cells 2–7.

One residual **UNKNOWN**, recorded rather than resolved: whether the existing
`eip/plugins/*` manifests map to UPP manifests *without loss* is asserted here as a
**criterion** (U6), not as a result. It has not been executed in this cell — this cell
wrote documents only.
