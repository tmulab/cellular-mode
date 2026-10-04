# UPP_REPORT — stage 5: the Universal Plugin Protocol and independent CI

**What this file is.** The closing account of stage 5, written in its last cell. Every claim
carries a label: **VERIFIED** (a command was run in this stage, output quoted), **INFERRED**
(stated from what, and why), **PROPOSED** (designed, not built), **UNKNOWN** (not established).
Nothing here is a result that was not executed.

Specification: [`docs/upp/SPEC.md`](docs/upp/SPEC.md) · messages:
[`SPEC-MESSAGES.md`](docs/upp/SPEC-MESSAGES.md) · audit: [`AUDIT.md`](docs/upp/AUDIT.md) ·
criteria: [`ACCEPTANCE.md`](docs/upp/ACCEPTANCE.md) · interop:
[`CONFORMANCE.md`](docs/upp/CONFORMANCE.md) · applications:
[`APPLICATIONS.md`](docs/upp/APPLICATIONS.md) · security:
[`SECURITY-REVIEW.md`](docs/upp/SECURITY-REVIEW.md) · decision:
[ADR 0005](docs/adr/0005-universal-plugin-protocol.md), approved by the author 2026-10-04.

## 1 · What was reused

The stage began with a read-only audit of the existing runtime
([`AUDIT.md`](docs/upp/AUDIT.md): **EXISTS 14 · BUILD 13 · OUT 3** over 30 capabilities), and
the audit is the reason the stage is small. Reused **unchanged, through the same code path**:

- **The kernel.** `register` / `load` / `dispose` / `execute` / events. An external plugin is registered as an ordinary `definePlugin` manifest whose service proxies the transport, so input validation, the approval gate, the deadline, cancellation, output validation, `DEPENDENCY_MISSING`, `DEPENDENCY_CYCLE` and `onDispose` are the kernel's, not a copy. **There is no second runtime and no second registry.**
- **The SDK as the contract floor.** `KEY_PATTERN`, `CAPABILITY_ID_PATTERN`, the semver pattern, the 11-keyword schema subset, the closed `CODES` list, `PASSTHROUGH_CODES`, `definePlugin`. The UPP validator *imports* these; it restates none of them.
- **The host's authority boundaries.** The approver, the refusal of a caller-supplied `approval`, the loopback bind, the no-CORS rule, the 64 KiB body cap.
- **The gate framework.** **Five** new layering rules are **data** in `tools/gates/rules.mjs` (three for `eip/upp`, two for `eip/upp-host`); the 200-line rule, the secrets and deps legs and the removal rehearsal are untouched.
- **One spawn site.** Application supervision reuses `eip/upp-host/channel.mjs` rather than calling `spawn` a second time, so `shell: false` and the minimal environment have one home.

Exactly one SDK change was needed: `SEMVER_PATTERN` is now **exported** (`eip/sdk/manifest.mjs`) so the protocol layer reuses one definition instead of writing a second regular expression.
VERIFIED additive: `git diff --stat b92c7c8 -- tools/cellmode eip/kernel eip/sdk eip/plugins
tools/adaptive adaptive apps/observer skills` = **4 files**, and `tools/cellmode` is untouched.

## 2 · What was implemented

| Part | Where | What it is |
|---|---|---|
| The protocol as **pure rules** | `eip/upp/` (9 modules, 6 test files) | manifest validation, security-sensitive sections, version negotiation, JSON-RPC envelopes and error mapping, NDJSON framing, the compat layer. No socket, no disk, no kernel — enforced by three gate rules |
| Published schemas | `upp/schemas/` | `manifest.schema.json`, `message.schema.json` + generator; committed files are asserted to equal the generator's output |
| Transports and the host seam | `eip/upp-host/` (22 modules, 12 test files) | operator config and the manifest pin, the NDJSON child-process channel, the HTTP client transport, the in-process endpoint, the kernel adapter, application registry and health, the conformance runner |
| Conformance corpus | `upp/conformance/` | **11** language-independent JSON cases + a pinned reference manifest, replayed by one runner against every implementation present |
| Example plugins | `examples/upp-{node,python,java,rust,cpp}/`, `examples/upp-app-nextjs/` | five capability plugins in five languages, standard library only; one application-plugin contract example (markdown + manifest + config snippet, no toolchain) |
| Independent CI | `.github/workflows/verify.yml`, `tools/gates/{ci-trailer,ci-summary,test-counts,rules}.mjs`, `tools/gates/CI.md` | a clean-checkout re-run of the mandatory suite plus the Article-8 `Verified-State` trailer check |
| Documents | `docs/upp/` (9 files), ADR 0005, the ADR 0001 amendment | specification, audit, criteria, verdicts, interop record, security review |

## 3 · What was deliberately deferred

Each line is **PROPOSED — not built**, and each says what it would cost:

| Deferred | Why, in one line |
|---|---|
| **gRPC transport** | a code generator and a dependency in every language, against [ADR 0002](docs/adr/0002-zero-dependency-kernel.md) ([`SPEC.md`](docs/upp/SPEC.md) §12) |
| **WASM transport** | the only candidate that would be a *real* sandbox; its host API surface is a design project of its own |
| **MCP bridge** | MCP exposes tools to a *model*, UPP governs a *host's* lifecycle over a plugin. A bridge plugin is a separate decision, not a duplication |
| **OS-level sandbox** | the prerequisite for untrusted plugins, and the largest gap in the architecture ([`SECURITY-REVIEW.md`](docs/upp/SECURITY-REVIEW.md) §3) |
| **Ports for external plugins** | a port is an in-process function; a serialised port is a new contract, so v1 grants **none** and says so in code |
| **Sibling calls from external plugins** | `dependencies` become `inject`, so composition is still checked, but `ctx.get` is unreachable from the far side of a pipe |
| **C++ execution** | no C++ compiler on this machine. The source is committed and labelled **UNEXECUTED**; nothing about it is claimed |
| **A third remote CI run** | it requires a push, which requires human authorization (`RELEASE_CHECKLIST.md` items 46, 48) |
| **Branch protection on `main`** | a repository setting, recommended in [`CI.md`](tools/gates/CI.md); **no setting was changed** |

## 4 · Which language integrations were tested

**VERIFIED — `npm run upp:conformance`, re-run in this closing cell on win32, Node 24.19.0.**
11 cases per row, output quoted verbatim:

| Row | Verdict | Cases | Toolchain version reported by the probe |
|---|---|---|---|
| `in-process` | **PASS** | 11/11 | `node v24.19.0` |
| `node` | **PASS** | 11/11 | `node v24.19.0` |
| `python` | **PASS** | 11/11 | `Python 3.13.14` |
| `java` | **PASS** | 11/11 | `openjdk version "21.0.10" 2026-01-20 LTS (via JAVA_HOME)` |
| `rust` | **PASS** | 11/11 | `rustc 1.91.1 (ed61e7d7e 2025-11-07)` |
| `cpp` | **UNEXECUTED** | — | this machine has no C++ compiler; the source has never been compiled or run here |

`UNEXECUTED` is not a pass, not a failure and not a skip: nothing was measured. On a machine
missing a toolchain the row becomes `SKIPPED` with the version that *was* found, and one guard
protects the word *polyglot* itself — `polyglot · at least two languages were actually
executed` fails if only JavaScript ran. What a green row does and does not prove is set out in
[`CONFORMANCE.md`](docs/upp/CONFORMANCE.md); the three hand-written JSON codecs (Java, Rust,
C++) have documented gaps in their own READMEs.

## 5 · Which transports are operational

| Transport | State | Tests that hold it up |
|---|---|---|
| **in-process (compat)** | operational | `upp compat ·` 9 tests (every repository plugin maps, nothing is lost) · `U10 · an ordinary definePlugin plugin projects the reference capability contract` · the `in-process` conformance row, served over JSON-RPC through `kernel.execute` |
| **process (NDJSON over stdio)** | operational | `eip/upp-host/process.test.mjs`, `failures.test.mjs`, `lines.test.mjs`, `end-to-end.test.mjs` — full lifecycle, minimal env, deadline propagation, `upp.cancel`, 1 MiB frame cap both ways, malformed line `-32700`, crash `-32003`, exactly one restart, no orphan child |
| **http (POST `<baseUrl>/upp`)** | operational | `eip/upp-host/http.test.mjs` — a full execute on loopback, pin refusal at `initialize`, `-32002` on no version overlap, `redirect: 'error'`, non-200/204 `-32003`, a non-loopback URL needing `allowRemote` and a token **name** |

**VERIFIED:** the stage-5 suites are **259 tests, 259 pass, 0 fail, 0 skipped** (`node --test`
over `eip/upp/`, `eip/upp-host/`, `tests/upp-*`, `tests/gates-upp*`, `tests/ci-workflow*`,
`tests/gates-ci-trailer*`, `tests/gates-test-counts`), inside a whole-suite `npm test` that is
now **1028 tests, 1028 pass, 0 fail, 0 skipped**, 48 suites, exit 0 on Node 24.19.0 **and** on
Node 22.13.1 — the 2026-10-04 run quoted in `RELEASE_CHECKLIST.md`.

## 6 · Experimental capabilities

Everything in this stage is **minimal and experimental**, local development only. Three parts
deserve the label twice over, because they are new *kinds* of thing rather than new code:

- **Application plugins** (`type: "application"`). Registration is **identity**, never execution: the kernel never loads one, never proxies its frontend and gives it no service and no port; it reaches the system as a **client of the HTTP API**. The `examples/upp-app-nextjs/` contract is markdown and JSON — no framework entered the repository (criterion U32). The ADR 0001 amendment that names this kind was approved by the author, 2026-10-04.
- **Managed supervision.** The host may start and stop an application when the operator wrote
  `supervision: "managed"`; `"external"` is health-only, because a deployment the host does not
  own is not its to control. At most **one** automatic restart, ever.
- **The polyglot story.** Five languages answer the corpus today; that is interop evidence on
  *this* machine, not a support commitment for any of them.

## 7 · Compatibility with existing plugins

**VERIFIED, and this is the compatibility claim that matters: no existing plugin was changed.**
All **six** plugins in the repository — `text.stats`, `text.report`, `observer.state`,
`observer.audit`, `observer.advisor` (a factory, instantiated with its own fixture adapter) and
the optional `adaptive.preferences` — map to a valid UPP manifest through the pure compat layer
(`toUppManifest`), with identity, version, description, capability schemas, the `consequential`
flag, `dependencies`, `permissions` and `config` all surviving exactly; `compatBreaches` reports
nothing for a faithful mapping and names a drift when one is injected
(`tests/upp-compat.test.mjs`, 9 tests). The list is checked against the real plugin directories,
so a new plugin cannot silently escape the claim. The `wordcount` fixture — an ordinary
`definePlugin` plugin that knows nothing about UPP — answers all 11 conformance cases as the
`in-process` row, through the kernel's own gates.

## 8 · Security limitations

The full review — nine boundaries (operator config, manifest pin, spawn, NDJSON framing,
stderr, HTTP, application health, the application → host direction, CI), each with its threat,
its control as `file:function`, the test that proves it and its residual risk, plus what
untrusted third-party plugins would additionally need — is
**[`docs/upp/SECURITY-REVIEW.md`](docs/upp/SECURITY-REVIEW.md)**. The lines that must not be
read anywhere else: **in-process plugins remain TRUSTED-LOCAL-ONLY**; **a separate process is
failure isolation, not a security sandbox**; **there is no marketplace**; **a plugin or an agent
never approves its own consequential operation**; **plugin output is untrusted data**.

## 9 · CI verification results

**Local structural validation — VERIFIED.** The three `tests/ci-workflow*.test.mjs` files assert
the workflow's shape: `permissions: contents: read` and nothing else, no secret,
`persist-credentials: false`, the plain `pull_request` trigger and never `pull_request_target`,
every action pinned to a full commit SHA, the real head commit with full history, the pinned
`ubuntu-24.04` image, the Node `22`/`24` matrix equal to `engines.node`, a build step that runs
the build legs ONLY, a `tests` step piping the spec reporter under `pipefail`, and **no mention
of the local evidence directory or `verify:final`**.

**Local trailer run — VERIFIED.** `node tools/gates/ci-trailer.mjs HEAD`: **1 MATCH**
(`b92c7c8`, whose trailer names the tree the commit records) and **9 PRE_ARTICLE_8** (an absent
trailer is excused before Article 8 and **never written retroactively**; a malformed, doubled or
mismatching one fails at any age). The checkout's fingerprint differs, as expected with
uncommitted work — the tree id is the binding check.

**The first remote run FAILED, and that is what it is for — VERIFIED (run `37185128292`,
`ubuntu-24.04`, Node 22.23.3): `989 passed, 2 failed, 993 total` from a step called `build`, no
test name in the log.** Three defects: one step running three legs; a count parser blind to
`cancelled`, so 989 + 2 never had to reach 993; and an `unref`'d advisor deadline timer that
left a promise unable to settle, on Node 22 only. All three corrected.

**The second remote run also FAILED — VERIFIED (run `37188606487`, `ubuntu-24.04`, Node 22
*and* 24): the same two tests failed on both jobs**, so neither was version-specific. Both were
platform defects of this repository: a test that spelled `\` into a path (a legal filename
character on Linux, so the fixture wrote one oddly named file), and a documented byte count
measured on a CRLF working copy of files committed as LF. The second is the serious one — it
means `npm run verify:final` had been running the suite over bytes no commit would contain — so
it is fixed as a MECHANISM: the policy loader normalises CRLF to LF, `verify:final` refuses
before the suite whenever a controlled file's working bytes differ from the bytes git would
commit, and authorization now requires `equivalent: true`, so older records authorize nothing
([`tools/gates/BYTE-EQUIVALENCE.md`](tools/gates/BYTE-EQUIVALENCE.md)). The twice-corrected
workflow has **not run remotely**: that result is UNKNOWN and nothing here may quote it.
Detail: [`tools/gates/CI.md`](tools/gates/CI.md).

## 10 · Final verification evidence

*The authoritative Article-8 record for stage 5 is produced by the lead's `npm run verify:final`
after this cell's last write; this paragraph is a pointer and is not edited to quote it.* The
record lives **outside the verified state**, by design: it is appended to the **gitignored,
local, per machine, self-attested** `.cellular/evidence/final-verification.jsonl`, fingerprints
the controlled set *as it stood when the command ran* — and, since 2026-10-04, records that
those bytes were the bytes git would commit — so any later write, including a line added to
this report, invalidates it. That is why §9 exists: the server-side re-run is the half of
Article 8 a local file cannot provide. Mechanism and limits:
[`tools/gates/FINAL-VERIFICATION.md`](tools/gates/FINAL-VERIFICATION.md).

**Three verification lessons stage 5 paid for, recorded so they are not re-learned.**
(1) Cell 4's *first* final verification **FAILED** twice over: an observer proxy test whose
300 ms upstream deadline answered `504` under suite load, and a toolchain probe that found the
Windows `WindowsApps` `python` shim — an executable that exists and runs nothing. Both were
defects in the *verification*, not in the feature, and both were fixed. (2) A green leg with no
number behind it is unauditable, so the record carries **real test counts** and lists skipped
tests with their reasons. (3) Counts must ADD UP and name every outcome: `989 + 2 = 993` passed
review for a whole stage, and the two results it hid were CANCELLED tests
(`tools/gates/test-counts.mjs`, §9).

## 11 · Remaining technical work — PROPOSED cells, with done criteria

| Proposed cell | Done criterion (binary) |
|---|---|
| **Remote CI third run** | the twice-corrected workflow runs on GitHub; both matrix legs (node 22, node 24) conclude and the trailer verdict is quoted here from the job summary, not predicted |
| **Branch protection** | `main` requires the `verify` check; the setting is recorded as a human decision in `RELEASE_CHECKLIST.md` item 47 |
| **Streamed body caps** | the HTTP transport and the application probe refuse a response **while reading**, with a test that a 4 MiB body never reaches `response.text()` |
| **TLS required for remote `baseUrl`** | `config.mjs` refuses a non-loopback `http://` endpoint, or an explicit operator opt-in records the cleartext-token risk; one red test per branch |
| **Diagnostic sanitisation at the sink** | the host's log port escapes control characters in a `plugin` stderr event; a test asserts a `\r`-bearing line cannot overwrite a record |
| **MCP bridge plugin** | an MCP client reaches a UPP capability through one bridge plugin, with the approval gate still host-side; ADR recorded before any code |
| **C++ row executed** | `npm run upp:conformance -- --impl cpp` reports 11/11 on a machine with a compiler, and `CONFORMANCE.md` loses its `UNEXEC` column |
| **Ports across the seam** | a design ADR exists *before* code, naming what a serialised port may and may not carry; until then external plugins keep receiving none |
