# Acceptance criteria — UPP 1.0 (stage 5, cells 2–7)

Declared **before** the implementation exists, as Article 4 requires. The verification
question is not "does it run" but **"how would we know the protocol really holds?"**

A UPP implementation "works" when five promises hold:

1. an external plugin obtains **the same gates** as an in-process one — nothing is softened
   by crossing a process boundary;
2. **every existing JS plugin still works, untouched**, and is mappable to a UPP manifest;
3. **the ugly paths are specified behaviour**, not luck: crash, timeout, cancel, malformed
   frame, oversized payload, unauthorised capability, dependency failure;
4. **the same fixtures pass in every language present**, and a missing toolchain is reported
   as UNKNOWN rather than green;
5. **nothing existing regresses** — gates, Article 8, the published API, and the optional
   modules' deletability.

Every criterion below names the cell that owns it, the test that will prove it, and what goes
red if the guard is removed. A criterion with no red is not a criterion.

**Status.** Written in cell 1, which produced documents only. Cells 2, 3 and 4 are
**VERIFIED** (see the verdicts below); U10, which cell 3 did not build, was built and
verified by cell 4. Cells 5–7 remain **PROPOSED** obligations until the cell that owns each
one records a run. Per the constitution each cell also records **≥ 3 mutation proofs** and the
Trilateral record (typecheck · build · tests, with real counts).

## Cell 2 — manifests and message contracts (`eip/upp/`, `upp/schemas/*.json`)

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U1 | Unknown keys are rejected everywhere except `extensions` | a manifest with a stray top-level key, a stray key inside `permissions`, `runtime` and `entry`, and a stray key inside `extensions`: the first four are `{path,message}` breaches, the fifth validates | a typo in a security-sensitive section is silently ignored |
| U2 | Identity rules are **imported**, never restated | the UPP validator's key/capability/semver checks are asserted to be `KEY_PATTERN`, `CAPABILITY_ID_PATTERN` and the SDK's semver — the same constants, by reference | two key formats drift apart; `domain.name` means two things |
| U3 | Capability schemas use the SDK subset only | a capability declaring `pattern` is itself a contract error, with the path pointing at the keyword | an unsupported keyword passes and two implementations disagree about a shape |
| U4 | Version negotiation fails closed | host offers `["1.0"]`, plugin answers `"2.0"` ⇒ `-32002` **and** the plugin is absent from `kernel.list()` | a half-wired plugin is registered and answers calls |
| U5 | The published JSON schemas and the JS validator agree **at shape level**, and the committed files never drift | `tests/upp-schemas.test.mjs`: committed bytes equal `renderSchemaFile(document())`; 13 shape cases get the same verdict from `validateValue(MANIFEST_SCHEMA)` and `validateUppManifest`; 12 CONDITIONAL cases are asserted to pass the schema and fail the validator — the subset has no `oneOf`/`pattern`, so that asymmetry is pinned rather than described | `upp/schemas/*.json` becomes decorative, or drifts silently, and other languages validate against nothing |
| U6 | Every existing JS plugin maps without loss | `toUppManifest` over every manifest in `eip/plugins/*`: output valid per U1–U3, and `id`/`version`/capability ids/`consequential`/`input`/`output`/`dependencies`/`permissions` equal the source | the compat claim is untested and the first mapped plugin loses a flag |
| U7 | Envelope parsing is strict | missing `jsonrpc` ⇒ `-32600`; a request without `id` ⇒ `-32600`; a notification with `id` ⇒ `-32600`; a batch array ⇒ `-32600` | a malformed envelope is interpreted generously and correlation breaks |
| U8 | The error mapping is **total** | every row of the table in `SPEC-MESSAGES.md` §8 maps to a member of the SDK's `CODES`, and an unassigned in-range code maps to `PLUGIN_ERROR` with the raw integer recorded | a new code silently defaults and a caller branches on a lie |
| U9 | Approval codes cannot cross the wire | for every code in `CODES` outside `PASSTHROUGH_CODES`, a plugin error claiming it yields `PLUGIN_ERROR`; `NOT_FOUND`/`INPUT_INVALID` keep code, message and `details` | a remote plugin forges `APPROVAL_DENIED` or `PERMISSION_DENIED` |

## Cell 3 — transports (in-process, process NDJSON, HTTP)

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U10 | In-process compat is behaviour-identical | `text.stats` and `text.report` executed through the UPP path and the direct path give byte-identical results for the same inputs, including both error cases | the compat layer is a second semantics |
| U11 | A process plugin completes the full lifecycle | spawn → `initialize` → `capabilities` → `execute` → `shutdown` → `exit`, with the child confirmed gone afterwards | the protocol works only in the happy middle |
| U12 | Spawning is argv-only and minimally scoped | the spawn call is asserted `shell: false` with an array `command`; the child's visible env excludes a canary variable set in the host's env | a shell metacharacter in a config becomes command execution; a host secret leaks into a plugin |
| U13 | The 1 MiB cap holds in both directions | an oversized outbound message fails `-32006` **with nothing written to stdin**; an oversized inbound line yields `-32006` and marks the plugin unhealthy | an unbounded read; memory exhaustion from a hostile or buggy plugin |
| U14 | A malformed frame is a protocol violation | a non-JSON line ⇒ `-32700`, pending requests fail `-32003`, state is `unhealthy`, the process is stopped; a line written to **stderr** changes nothing | stderr is parsed as protocol, or a desynchronised stream keeps being read |
| U15 | A crash is contained and bounded | the plugin exits mid-request ⇒ pending requests get kernel `PLUGIN_ERROR`; exactly **one** restart is attempted when enabled, and a second exit is terminal | a request hangs forever; a restart loop hides the defect |
| U16 | Timeouts are enforced host-side | a plugin that never answers ⇒ `TIMEOUT` (never `CANCELLED`), the id is retired, and a late response for it is discarded | the host waits on a peer's goodwill; a retired id resolves a settled call |
| U17 | `deadlineMs` is propagated | the fixture plugin echoes the received `deadlineMs`; it equals the host's effective deadline | the plugin burns work it could have abandoned |
| U18 | Cancellation reaches the plugin, and does not depend on it | aborting mid-call sends `upp.cancel` with the right id **and** the caller gets `CANCELLED` even with a plugin that deliberately ignores the notification | cancellation becomes a claim about a third party's behaviour |
| U19 | Startup and shutdown deadlines leave no residue | a plugin that never answers `initialize` is **not registered**; one that ignores `shutdown` is terminated after `shutdownTimeoutMs`; no orphan process survives either case | zombie children; a half-registered key |
| U20 | Approval runs before the transport | a consequential capability on a host with no approver ⇒ `APPROVAL_REQUIRED` and **zero bytes written** to the transport (asserted on a recording stream) | the side effect happens and the refusal arrives afterwards |
| U21 | An external plugin gets no ports | a `process` manifest declaring `fs.write` with a `writeFile` port offered by the host: the adapter grants nothing, and the plugin's `ctx.ports` is empty | a declared permission silently becomes a grant across a seam that cannot carry it |
| U22 | An unauthorised capability never leaves the host | a capability absent from the pinned manifest, and an `id` absent from `upp.config.json` ⇒ `PERMISSION_DENIED` / refusal **before** spawn or send | the operator's authorisation file is advisory |
| U23 | The manifest pin is enforced | a manifest whose `sha256` differs from `manifestSha256` ⇒ refused at `initialized`, plugin not registered | a swapped plugin binary is loaded under a reviewed identity |
| U24 | Dependency failure is unchanged for external plugins | a required dependency registered but not loaded ⇒ `DEPENDENCY_MISSING` at call time; a required cycle through an external manifest ⇒ `DEPENDENCY_CYCLE` at load | the external path bypasses the composition checks |
| U25 | HTTP transport is loopback by default | `POST <baseUrl>/upp` on `127.0.0.1` completes a full `execute`; a non-loopback `baseUrl` is refused without explicit operator configuration; a non-`200`/`204` status becomes `-32003` | a plugin endpoint reachable from the network by default |
| U26 | Events and diagnostics are observable | `execute`, `error` and `plugin` events carry `{key, cap?, ok, code?, ms, at}`; captured stderr arrives as a `plugin` event; **no stack appears in any result** | silence is blindness, or a stack leaks into an API response |

## Cell 4 — polyglot conformance (`upp/conformance/`)

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U27 | The fixtures are language-independent data | each case is a JSON request plus an expected response; one runner replays the whole corpus against every implementation present | the "protocol" is whatever the JS implementation happens to do |
| U28 | Python and Java 21 pass the same corpus | the stdlib-only Python plugin and the single-file Java 21 plugin both answer every case, including `-32002`, `-32001`, `-32602` and a cancel | polyglot is a claim, not a result |
| U29 | A missing toolchain is UNKNOWN, never green | with a language absent, the runner reports **SKIPPED/UNKNOWN** and the suite does not count it as a pass; the Rust and C++ examples are labelled unexecuted where they are | an absent toolchain reads as a passing implementation |

## Cell 5 — application plugins

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U30 | An application manifest validates as its own type | `type:"application"` requires `application:{baseUrl, healthPath, routes, auth, cors}`; `auth` is enum-checked; `cors.allowedOrigins` defaults to **empty**; a `capability` manifest carrying `application` is a breach | an application is registered as a capability provider, or ships permissive CORS by default |
| U31 | Registering an application changes nothing on the host API | `ROUTE_TABLE` and `api/openapi.json` are unchanged, and `openapi.test.mjs` still passes | the published contract moves under an application's feet |
| U32 | No toolchain enters the runtime | `tools/gates/deps.mjs` stays green and `npm test` still runs with no install step beyond the two dev dependencies | [ADR 0002](../adr/0002-zero-dependency-kernel.md) is lost to a framework arriving through a plugin kind |

## Cell 6 — CI

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U33 | The trailer check is real | `tools/gates/ci-trailer.mjs` parses `Verified-State: sha256:<fp> tree:<id>` and compares its tree with `git rev-parse HEAD^{tree}`; a mismatch exits non-zero | a commit claims a verification belonging to another state (the R-4 defect, by hand) |
| U34 | Pre-Article-8 history is documented, never fabricated | a commit older than the policy boundary is matched by the written **PRE-ARTICLE-8** rule and reported as such; the tool never synthesises a trailer | history is retro-signed and the record stops being evidence |
| U35 | The workflow is structurally safe | `on: [push, pull_request]` with **no** `pull_request_target`; `permissions: contents: read`; every `uses:` pinned to a full 40-character SHA | a fork PR runs with write permissions, or a moving tag changes what CI executes |
| U36 | The CI claim is honest about not having run | the workflow is validated by structure tests locally and labelled **"not yet run on GitHub"** until a push exists | an unexecuted pipeline is reported as a passing gate |

## Cell 7 — security review, regression, docs

| # | Criterion | The test that proves it | Red without it |
|---|---|---|---|
| U37 | No existing test regresses | the full `npm test` count is ≥ the pre-stage baseline with zero failures, and every `eip/plugins/*` still registers, loads and answers | UPP buys language reach by breaking what worked |
| U38 | The new layer has a boundary rule | a named rule in `tools/gates/boundaries.mjs` governs `eip/upp/` (SDK, own directory, kernel public entry at most), proven on in-memory fixtures | the new arrows are documented instead of checked |
| U39 | The 200-line rule holds with no new exception | `npm run gates` is green and `policy/size-exceptions.json` gains no entry for UPP | the limit is kept by exception rather than by design |
| U40 | Cellular Adaptive stays decoupled | no file under `eip/upp/` or `upp/` imports `tools/adaptive/`, and `npm run rehearse:adaptive-removal` is green with UPP present | an optional module becomes load-bearing — the failure [ADR 0004](../adr/0004-cellular-adaptive.md) exists to prevent |
| U41 | The security claims match the code | the threat-model rows added for UPP name a control that a test exercises, and every unbuilt control is labelled **PROPOSED** | the documentation grants a guarantee the code does not have |

## False-green watch

Three ways this suite could pass while the protocol is broken, each one the reason a
criterion above is phrased the way it is:

- **Asserting "it failed" instead of "it failed *this* way."** Every row names an exact
  `error.code` or JSON-RPC integer. A bare rejection proves nothing — U4, U8, U9, U16 and U22
  exist precisely because `TIMEOUT`, `CANCELLED`, `PLUGIN_ERROR` and `PERMISSION_DENIED` are
  different facts with the same shape.
- **Testing the adapter against a mock that is also ours.** U27–U29 replay the same JSON at a
  Python and a Java process; U10 compares the UPP path against the direct path. A mock cannot
  satisfy either.
- **Proving a refusal by its message instead of by its silence.** U13, U20 and U22 assert that
  **nothing was written** — on a recording stream, before a spawn. A refusal that arrives after
  the side effect is not a refusal.

## Cell 2 verdict — VERIFIED (2026-10-03)

Trilateral, run after the last write of the cell:
**typecheck** `tsc -p jsconfig.json && tsc -p apps/observer/jsconfig.json` — 0 errors ·
**gates/build** `npm run gates` — 501 files, 278 modules, 0 findings (size · secrets · deps ·
boundaries); `node tools/gates/check-all.mjs --release` — 0 pending exceptions ·
**tests** `npm test` — counts recorded in the cell log; the UPP subset alone is 82 tests, 82 pass.

Delivered: `eip/upp/{version,errors,manifest,sections,schemas,messages,framing,compat,index}.mjs`
(pure, SDK-only imports), `upp/schemas/{manifest,message}.schema.json` + `generate.mjs`, three
boundary rules in `tools/gates/boundaries.mjs`, and `SEMVER_PATTERN` newly exported from
`eip/sdk` so U2's "imported, never restated" is literally true.

| # | Criterion | Evidence |
|---|---|---|
| U1 | unknown keys rejected, tolerated only in `extensions` | `eip/upp/manifest.test.mjs` · three U1 tests; `sections.mjs:closedObject` is the one shared rule |
| U2 | identity rules imported | `manifest.test.mjs` · "U2 identity rules are the SDK constants"; `manifest.mjs` imports `KEY_PATTERN`, `CAPABILITY_ID_PATTERN`, `SEMVER_PATTERN`, `PERMISSIONS` |
| U3 | capability schemas use the SDK subset | `manifest.test.mjs` · "U3 … checked with the SDK subset" (`pattern`, `$ref` are breaches) |
| U4 | negotiation fails closed | `version.test.mjs` · six tests, incl. a shared MAJOR with no shared MINOR still `-32002` |
| U5 | published schemas, no drift | `tests/upp-schemas.test.mjs` · six tests (see the refined row above) |
| U6 | every JS plugin maps without loss | `tests/upp-compat.test.mjs` · nine tests over all **six** plugin manifests, including a directory-count guard so a seventh plugin cannot silently escape the claim |
| U7 | envelope parsing is strict | `messages.test.mjs` (14 tests) + `framing.test.mjs` (9) |
| U8 | the error mapping is total | `errors.test.mjs` · both directions asserted over `CODES`, plus the unassigned-in-range default |
| U9 | authority cannot cross the wire | `errors.test.mjs` · three tests, driven from `CODES` so a new code is covered the day it is added |

### Mutation proofs (five applied, each reverted, suite returned green)

| Guard | Mutation | Observed red |
|---|---|---|
| U5 | one byte appended to `upp/schemas/manifest.schema.json` | 2 fails — "the committed files are exactly what the generator produces", "each published file is valid JSON" |
| U9 | `remoteToResult` drops the `REMOTE_FORBIDDEN_CODES` guard in both places | 1 fail — "U9 the host-side -32010 cannot be borrowed by a plugin". **Finding about the code, not the test:** `passthroughOf` already blocks a claimed `data.code`, so only the INTEGER path needed the extra guard. The redundancy is deliberate and now measured |
| U1/entry | `checkCommand` accepts a string as argv | 3 fails — "the process entry is an argv ARRAY", "every breach is reported at once", and the U5 conditional-case test |
| U7 | `validateMessage` stops refusing an `id` on a notification | 1 fail — "U7 a request needs an id and a notification must not have one" |
| U6 | `toUppManifest` flattens `consequential` to `false` | 2 fails — "every capability keeps its … consequential flag", "the one consequential capability … stays consequential" |

**False-green watch, specific to this cell.** The schema test imports **nothing that writes**:
loading `upp/schemas/generate.mjs` would have regenerated the files it checks, so the pure
halves (`PUBLISHED_SCHEMAS`, `renderSchemaFile`) live in `eip/upp/schemas.mjs` and the writer
does nothing on import. The defect was real and was caught by running the mutation.

## Cell 3 verdict — VERIFIED (2026-10-03), U10 excepted

Recorded in [ACCEPTANCE-CELL3.md](ACCEPTANCE-CELL3.md): the Trilateral counts, one evidence
row per criterion U10–U26, and nine mutation proofs. It lives in its own file because this
one is at the 200-line limit and a verdict is a record, which is appended and never rewritten.

## Cell 4 verdict — VERIFIED (2026-10-03), including U10

Recorded in [CONFORMANCE.md](CONFORMANCE.md): the 11 × 6 matrix, the exact command and
toolchain version behind every row, what a green row does and does not prove, and the verdict
for U10, U27, U28 and U29. Five implementations were executed (in-process JS, Node, Python 3.13,
Java 21, Rust 1.91) at 11/11 cases each; C++ is **UNEXECUTED** because this machine has no
compiler, and the runner refuses to report anything else for it.

## Cell 5 verdict — VERIFIED (2026-10-03)

Recorded in [ACCEPTANCE-CELL5.md](ACCEPTANCE-CELL5.md): the Trilateral counts, one evidence
row per criterion U30–U32, six mutation proofs, and the false-green watch for this cell —
including the real defect the first lifecycle run found (a probe during startup must not
declare an app unhealthy before its deadline).
