# UPP 1.0 interop record

**VERIFIED 2026-10-03** by `npm run upp:conformance` on win32 (Windows 11), Node 24.19.0.
Nothing below is claimed that was not executed in this cell. The one row that was not executed
says so in capitals.

The corpus, the matchers and the cases are described in
[`upp/conformance/README.md`](../../upp/conformance/README.md); the criteria they answer
(U27–U29, and U10) are declared in [`ACCEPTANCE.md`](ACCEPTANCE.md).

## Matrix — 11 cases × 6 implementations

| Case | in-process | node | python | java | rust | cpp |
|---|---|---|---|---|---|---|
| `01-initialize-version-ok` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `02-initialize-version-mismatch` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `03-capabilities` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `04-execute-ok` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `05-execute-input-invalid-type` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `06-execute-input-missing-field` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `07-execute-unknown-capability` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `08-unknown-method` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `09-malformed-line` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `10-cancel-is-a-notification` | PASS | PASS | PASS | PASS | PASS | UNEXEC |
| `11-health-then-shutdown-and-exit` | PASS | PASS | PASS | PASS | PASS | UNEXEC |

`UNEXEC` = the source exists and was never executed on this machine. It is **not** a pass, it
is not a failure, and it is not a skip: nothing was measured.

## Toolchains and exact commands

Paths are shown repository-relative; the runner uses absolute ones. The manifest argument is
always `upp/conformance/manifest.json` and arrives as `argv[1]`.

| Row | Language | Status | Cases | Toolchain version reported by the probe | Command |
|---|---|---|---|---|---|
| `in-process` | JavaScript, no child process | **PASS** | 11/11 | `node v24.19.0` | none — `eip/upp-host/in-process-endpoint.mjs` over a kernel-loaded `definePlugin` plugin |
| `node` | JavaScript, child process | **PASS** | 11/11 | `node v24.19.0` | `node examples/upp-node/plugin.mjs <manifest>` |
| `python` | Python 3, stdlib only | **PASS** | 11/11 | `Python 3.13.14` | `python examples/upp-python/plugin.py <manifest>` |
| `java` | Java 21, single-file source launch | **PASS** | 11/11 | `openjdk version "21.0.10" 2026-01-20 LTS` (resolved via `JAVA_HOME`) | `java examples/upp-java/Plugin.java <manifest>` |
| `rust` | Rust, `std` only | **PASS** | 11/11 | `rustc 1.91.1 (ed61e7d7e 2025-11-07)` | `rustc --edition 2021 -o <tmp>/upp-plugin examples/upp-rust/plugin.rs` then `<tmp>/upp-plugin <manifest>` |
| `cpp` | C++17 | **UNEXECUTED** | — | none: this machine has no C++ compiler | would be `g++ -std=c++17 -O2 -o upp-plugin plugin.cpp` — see [`examples/upp-cpp/README.md`](../../examples/upp-cpp/README.md) |

Nothing was installed, downloaded or fetched to produce this table: Python used only its
standard library, Java only `java.base` with no build tool, Rust only `std` with no `cargo` and
no crate. The Rust binary is built into a fresh `os.tmpdir()` directory and nothing is written
into the repository.

## How to reproduce it

```
npm run upp:conformance                 # every implementation whose toolchain is present
npm run upp:conformance -- --impl rust  # one row
node --test eip/upp-host/polyglot.test.mjs
```

On a machine without a JDK, the `java` row becomes `SKIPPED` with the version that *was* found,
and the suite stays green **without counting it** — `node --test` records it as skipped, not
passed. The same holds for Python and Rust. One guard protects the word "polyglot" itself:
`polyglot · at least two languages were actually executed` fails if only JavaScript ran.

## What a green row does and does not prove

**Does.** The implementation serves the pinned manifest byte-for-byte as canonical JSON;
negotiates the protocol version and refuses when there is no overlap (`-32002`); answers
`capabilities`, `execute`, `health` and `shutdown`; produces the *same* word count; and returns
the exact integers `-32602` (bad input type and missing field), `-32001` (undeclared
capability), `-32601` (unknown method) and `-32700` (a line that is not JSON, with a `null`
id). It answers `upp.cancel` and `upp.exit` with **silence**. All of it over NDJSON through the
host's real process transport, with the real 1 MiB frame cap and the real stderr handling.

**Does not.** The corpus is eleven cases, not a proof. It does not exercise concurrency,
back-pressure, cancellation of work actually in flight, oversized frames from the plugin side,
non-BMP text, numbers beyond IEEE-754 double, or a hostile peer. The three hand-written JSON
codecs (Java, Rust, C++) have documented gaps in exactly those areas, listed in their own
READMEs rather than discovered later: surrogate pairs, duplicate keys, depth limits. Treating
`PASS` here as "production-ready in that language" would be the mistake this file exists to
prevent.

## The in-process row, and why it is in the same table (U10)

`in-process` is not a sixth plugin. It is `eip/upp-host/fixtures/wordcount-plugin.mjs` — an
ordinary `definePlugin` plugin that knows nothing about UPP — mapped by the pure compat layer
(`toUppManifest`) and served over JSON-RPC by `eip/upp-host/in-process-endpoint.mjs`. Its
`upp.execute` goes through `kernel.execute`, so the kernel's own input, approval, deadline and
output gates all still run, and no plugin was migrated to make the row green.

Its manifest PIN is its own: a mapped manifest honestly declares `runtime: "in-process"` and an
`entry.module`, where the reference manifest declares `runtime: "process"` and a placeholder
`entry.command`. What is asserted to be identical is the thing that matters — the capability
contract. `conformance.test.mjs` compares `toUppManifest(wordcountPlugin).capabilities` with
`upp/conformance/manifest.json`'s `capabilities` by deep equality, so a drift in either is a
failing test rather than a footnote.

## Mutation proofs (eleven applied, each reverted, suite returned green)

A corpus is only worth what its matchers refuse. Each row below was a real edit to the code,
run, observed red, and reverted.

| Guard | Mutation | Observed red |
|---|---|---|
| exact error integers | `matchExpectation` stops checking `code` | `matchers · a code expectation refuses the wrong integer and a success` |
| silence is asserted | `none` stops asserting silence | `matchers · silence is asserted, and a reply breaks it` |
| the manifest pin | the pin is no longer compared | `matchers · the manifest pin is compared, and a near miss fails` |
| **skip ≠ pass** | a refused `prepare` is reported as `PASS` | 2 fails — `a refused prepare is SKIPPED with zero cases` and `C++ is UNEXECUTED` |
| an absent toolchain | `probe` assumes a version when the executable will not start | `an absent executable is a REASON, never an exception` |
| notifications | the in-process endpoint answers `upp.cancel` | `in-process answers all 11 conformance cases` (case 10) |
| the error mapping | the in-process endpoint flattens every kernel code to `-32603` | `in-process answers all 11 conformance cases` (cases 05–07) |
| U10 equivalence | the in-process plugin's output schema drops `minimum: 0` | `U10 · an ordinary definePlugin plugin projects the reference capability contract` |
| one word count | Python splits on a single space instead of whitespace runs | `python answers all 11 conformance cases` (case 04) |
| corpus integrity | a case is renamed out of its declared order | `corpus · eleven declared cases, each with a reason and matching counts` |
| the null id | the Node plugin answers `-32700` with id `0` | `node answers all 11 conformance cases` (case 09) |

**Two mutations were UNREACHABLE, which is itself a finding.** Making the in-process endpoint
answer a generic notification, and making it dispatch `upp.frobnicate` to `initialize`, both
left the suite green — because `upp.cancel`/`upp.exit` are handled before the generic
notification branch, and because `validateMessage` has already refused an unknown method by
then. Those two lines are defence in depth, not live logic, and are recorded as such rather
than counted as proofs.

## Status of each criterion

| # | Criterion | Verdict |
|---|---|---|
| U10 | in-process compat is behaviour-identical | **VERIFIED** — the same 11 cases, same matchers, same corpus; plus the capability deep-equality assertion above |
| U27 | the fixtures are language-independent data | **VERIFIED** — JSON cases, one pure runner (`eip/upp-host/conformance.mjs`), replayed against all present implementations |
| U28 | Python and Java 21 pass the same corpus | **VERIFIED** — 11/11 each, including `-32002`, `-32001`, `-32602` and the cancel notification |
| U29 | a missing toolchain is UNKNOWN, never green | **VERIFIED** — `SKIPPED` with a reason and no assertion run; `cpp` is `UNEXECUTED` and the runner refuses to report anything else for it |
