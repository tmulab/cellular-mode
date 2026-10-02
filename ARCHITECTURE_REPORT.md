# Architecture report — stage 2

What was decided, what was built, what was actually executed, and what is still unknown.
Scope: the TMU-LAB engineering integration (`docs/00`, `docs/05`, seven skills,
`tools/gates/`, `policy/`) and the "Everything Is a Plugin" runtime (`eip/`,
`api/openapi.json`, `examples/api-client/`). The architecture itself is
[`docs/09-architecture.md`](docs/09-architecture.md) · stage 1 is
[`MIGRATION_REPORT.md`](MIGRATION_REPORT.md) · the method's origins are [`METODO_TMULAB_INTEGRATION.md`](METODO_TMULAB_INTEGRATION.md).

Every claim carries an epistemic label: **VERIFIED** (a command was run in this cell and its
output is quoted) · **INFERRED** (stating what from) · **PROPOSED** (not built) · **UNKNOWN**
(we do not know, and that is reported rather than rounded up).

## 1 · Decisions

Recorded as ADRs, both **Accepted — approved by Hudson A. R. Bonomo, 2026-10-02** (§5 states
the scope of each approval, which is narrower than the decision text):

| ADR | Decision | Consequence that is already load-bearing |
|---|---|---|
| [0001](docs/adr/0001-frontend-exception.md) | a production UI is an **independent application**, never a plugin; it consumes `api/openapi.json` from its own server | the host binds `127.0.0.1` and sends no CORS headers at all; `devUi` is a ≤64 KB static fragment for diagnostics, served only with `--dev-ui` |
| [0002](docs/adr/0002-zero-dependency-kernel.md) | **reimplement** the plugin concepts in zero-dependency Node rather than depend on a framework or port earlier private code | no RUNTIME dependency exists and the whole contract is readable in `eip/sdk/`; the two devDependencies added on 2026-10-02 are the type checker and its node declarations, which resolved R-1 |

Design choices decided inside the acceptance files, each with its rationale there:

- **Load-time vs call-time** (`eip/kernel/ACCEPTANCE.md`). A required sibling is *registered*
  at load, *loaded* at call time: load order is irrelevant, yet a composition missing a
  contract fails at boot rather than in production.
- **Dispose refuses, never cascades.** Disposing a provider with a loaded required dependent
  throws `DEPENDENCY_IN_USE` and lists them; cascading would tear down services nobody named.
- **Undeclared ports are invisible, not refused** — least privilege by construction: no
  handle to misuse, and no error to discover at 3 a.m. And **`execute` returns while
  `register`/`load`/`dispose` throw**: the call path is driven by an edge (HTTP, agent
  gateway) and must answer without a `try`/`catch`, while composition mistakes should interrupt.
- **`pattern` is deliberately absent from the schema subset** (`eip/plugins/ACCEPTANCE.md`).
  The subset is the whole contract vocabulary, so `save-report` validates the file name
  itself *and* the host's port rejects traversal independently — two guards, neither
  trusting the other.
- **`CANCELLED` → 503, `TIMEOUT` → 504, 405 carries `INPUT_INVALID`**
  (`eip/host/ACCEPTANCE.md`). One error vocabulary, the kernel's closed list, mapped to
  HTTP in exactly one file. `499` is not an IANA status and a second vocabulary would be
  worse than a slightly blunt one.
- **`approval-required` is a distinct audit decision from `denied`**
  (`eip/orchestration/ACCEPTANCE.md`). "No human has decided yet" and "this agent may not"
  are different facts, and an audit that conflates them cannot answer the question audits
  are read for.

## 2 · Implemented capabilities

| Area | What exists | Evidence |
|---|---|---|
| Constitution & policy | seven articles (`docs/00`), the configurable policy layer (`docs/05`), the relaxation register (`policy/relaxations.md`), size exceptions, dependency allowlist, secrets allowlist | `docs/00-constitution.md`, `policy/` |
| Engineering skills | `verify`, `protect`, `harden`, `sanity`, `coverage`, `port`, `decisions` — Level 2, loaded one at a time, never as a set | `skills/`, `docs/06` level table |
| Gates | **size** (200-line rule with declared exceptions) · **secrets** · **deps** (zero-dependency integrity) · **boundaries** (import direction, rules as data) · **trilateral** (three honest lines) | `tools/gates/README.md`, §3 below |
| Plugin contract | manifest validation, `inject` vs ports, closed permission list, the schema subset, closed error codes, frozen manifests | `eip/sdk/README.md`, `eip/sdk/*.test.mjs` |
| Kernel | register · load (lazy inject, least-privilege ports) · dispose (reverse-order inverses, refuses while in use) · execute (input/output validation, approval gate, `AbortSignal`, contained plugin faults) · events | `eip/kernel/ACCEPTANCE.md` — 14 criteria, 5 mutations applied and reverted |
| Plugins | `text.stats` (`count-words`, `reading-time`, non-consequential, dev-UI fragment) and `text.report` (`save-report`, consequential, writes through a host port) | `eip/plugins/ACCEPTANCE.md` — 8 criteria, 4 mutations |
| Host | loopback HTTP, JSON-only, 64 KB cap, security headers, no CORS, code→status map, path-confined write port, opt-in dev UI under a strict CSP, interactive approver | `eip/host/ACCEPTANCE.md` — 12 criteria, 4 mutations |
| Published contract | hand-written OpenAPI 3.1, validated against real responses in both directions | `api/openapi.json`, `eip/host/openapi.test.mjs` |
| Orchestration | `createAgentGateway` — allow-list authority, host-supplied approver, dropped self-approval, append-only in-memory audit | `eip/orchestration/ACCEPTANCE.md` — 7 criteria, 3 mutations, **one false green found and fixed** |
| Defect fixed in stage 2 | an **asynchronous** approval verdict was read synchronously and therefore always denied — fail-closed, but a gate that can never open is not a gate. `execute.mjs` now awaits the approver; three tests in `approval.test.mjs` pin it | `eip/kernel/ACCEPTANCE.md` §Design choices |

## 3 · Validation — executed in this cell

All commands run from the repository root. Output quoted verbatim, trimmed to the lines
that carry the verdict. **VERIFIED.**

```
$ npm test                                   (final run before the first commit, 2026-10-02)
ℹ tests 265  ·  ℹ pass 265  ·  ℹ fail 0  ·  skipped 0

$ npm run trilateral
✅ typecheck: tsc --noEmit -p jsconfig.json — 0 error(s)    (typescript 5.9.3, checkJs, 4 strict flags)
✅ build: no build step — module-load gate: 58 modules imported (43 skipped: 34 tests, 9 entry points)
✅ tests: 265 passed, 0 failed, 265 total (node --test)

$ npm run gates
✅ size · ✅ secrets · ✅ deps · ✅ boundaries — no findings
✅ pending exceptions: 0

$ node tools/gates/check-all.mjs --release
✅ release: no blockers — every exception approved, every relaxation resolved   (exit 0)

$ node tools/cellmode/cli.mjs check
Integrity check passed · 0 active · 0 paused · 1 planned · 20 done · 20 log entries   (exit 0)

$ node examples/text-stats/reproduce.mjs
vault reproduced: 8 files identical, 9 commands, check exit 0   (exit 0)
```

Host smoke test, run against the real CLI on an OS-assigned free port
(`node eip/host/cli.mjs --port 0 --dev-ui --reports-dir <temp>`), one process, then stopped:

```
eip host listening on http://127.0.0.1:53283
  approvals: none — consequential calls answer 403 APPROVAL_REQUIRED

GET  /api/v1/health   -> 200 {"ok":true,"value":{"status":"ok","sdk":"1","devUi":true,
                             "plugins":["text.report","text.stats"]}}
GET  /api/v1/plugins  -> 200 keys=text.stats,text.report  apply=false
                             devUi=[{"title":"Text statistics"},null]
POST text.stats#count-words  {"input":{"text":"one two three four five"}}
                      -> 200 {"ok":true,"value":{"words":5}}
POST text.report#save-report {"input":{"name":"smoke","text":"one two three"}}
                      -> 403 {"ok":false,"error":{"code":"APPROVAL_REQUIRED","message":
                             "\"text.report#save-report\" is consequential and this kernel
                             has no approver"}}
POST text.report#save-report with a forged "approval" field in the body
                      -> 403 {"ok":false,"error":{"code":"APPROVAL_REQUIRED","message":
                             "an HTTP caller cannot supply its own approval","details":
                             [{"path":"approval","message":"approval is issued by the
                             host approver, never by the caller"}]}}
GET  /dev/plugins/text.stats -> 200  content-type=text/html; charset=utf-8
     content-security-policy: default-src 'self'; script-src 'self'; style-src 'self';
       connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none';
       form-action 'none'; frame-ancestors 'none'
     inline <script> body present: false | inline on*= handler: false

reports dir after the two refused calls: <dir absent>   (nothing was written)
```

The last line is worth reading twice: the reports directory was never even created, so `APPROVAL_REQUIRED` is a closed door and not a late rollback.

## 4 · Limitations

1. **Plugins are not sandboxed.** They run in-process with the full privileges of the Node
   process. Permissions and ports are a *contract* and a least-privilege mechanism for what the
   composition hands over; a plugin can `import('node:fs')` and ignore them. Treat plugin code
   as trusted first-party code. (VERIFIED by inspection: no isolation mechanism exists in
   `eip/`.) Approved scope is **trusted local plugins only** — [`SECURITY.md`](SECURITY.md).
2. **`typecheck` is real since 2026-10-02.** `tsc --noEmit -p jsconfig.json` with `checkJs`
   and four strict flags, 0 errors over 100 modules including the tests; R-1 is WITHDRAWN. What
   it still does not prove: a `/** @type */` cast is a human claim, not a machine one.
3. **The symlink-escape guard is VERIFIED on win32 only.** A file symlink is `EPERM` for an
   unprivileged account, so the write-port test falls back to a directory **junction**, which
   `lstat` reports as a symbolic link; deleting the guard goes red. POSIX symlink: UNKNOWN.
4. **No linter and no formatter.** Style is held by review and the size gate; static analysis beyond the four gates is absent.
5. **Adapters other than Claude Code are untested.** For Claude Code, discovery *and*
   invocation are VERIFIED for `cell`; the other ten pointer skills were not invoked.
6. **Approval is interactive only, through a TTY.** No queue, no signed grant, no durable
   record of who consented. No TTY means no human, which means no.
7. **No authentication and no rate limiting on the host.** The loopback bind *is* the access
   control; the in-memory audit dies with the process.
8. **Mutation testing is manual and recorded, not automated.** The verdict tables are an
   honest log of mutations applied and reverted by hand; nothing re-runs them.

## 5 · Human decisions — 2026-10-02 (Hudson A. R. Bonomo)

| # | Decision | Where | State |
|---|---|---|---|
| ADR 0001 | frontend separation **APPROVED**: complex production interfaces remain independent applications communicating through defined APIs; simple plugin interfaces remain optional | `docs/adr/0001-frontend-exception.md` | **Accepted** |
| ADR 0002 | dependency-free kernel **APPROVED for the current implementation** — a design preference, **not** a permanent prohibition against dependencies that provide demonstrable value | `docs/adr/0002-zero-dependency-kernel.md` | **Accepted** |
| Plugin security | the runtime is approved for **TRUSTED LOCAL PLUGINS ONLY**. Capability contracts and permissions are **not** a security sandbox; third-party or untrusted plugin execution must not be enabled without appropriate isolation | [`SECURITY.md`](SECURITY.md), `docs/09` §9 | **Accepted scope** |
| R-1 | the typecheck proposal **APPROVED and carried out**: `typescript` + `@types/node` as pinned devDependencies, `jsconfig.json` with `checkJs` and four strict flags, 1038 first-run errors all fixed, 0 remaining | `policy/relaxations.md`, `policy/typecheck-proposal.md` | **WITHDRAWN** |
| R-2 | the secret-allowlist entries were **measured unnecessary** and all four deleted; the allowlist is `[]` | `policy/relaxations.md`, `policy/secrets-review.md` | **WITHDRAWN** |

Release consequence: `node tools/gates/check-all.mjs --release` now exits **0** with zero
blockers — both R-1 ids are clear. What is left is human authorization only: item by item,
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## 6 · Stage-1 regression check

Method: a stage-1 snapshot of 98 SHA-256 file digests was replayed against the working tree,
and the stage-1 `vault/state/log.md` digest was searched for among the prefixes of the
current log. **VERIFIED.** No snapshot file is missing; 15 changed, every change intended:

| Changed | Why, and by which stage-2 cell |
|---|---|
| `AGENTS.md` | +6 lines: the constitution summary and the engineering-skills pointer (S2-2) |
| `README.md` | three domains, EIP quickstart, engineering pointers, status table, gate commands (S2-9) |
| `docs/05-engineering-rules.md` | aligned with the constitution and the gates (S2-2/S2-3) |
| `docs/06-context-engineering.md` | engineering skills at Level 2; runtime docs at Level 4 (S2-2, S2-9) |
| `docs/08-agent-integration.md`, `adapters/README.md` | per-adapter honesty statement (S2-9) |
| `templates/project-policy.md` | gate commands and the relaxation procedure (S2-2/S2-3) |
| `package.json` | two scripts added: `gates`, `trilateral` (S2-3). No dependency added |
| `tests/{bootstrap,leaks,license,size}.test.mjs` | widened to cover `eip/`, `policy/`, the new docs and the eleven skills (S2-3) |
| `NOTICE`, `THIRD_PARTY_NOTICES.md`, `MIGRATION_REPORT.md` | licensing decisions of 2026-10-02, plus the stage-2 pointer line (S2-9) |
| `CONTEXT_AUDIT.md` | re-measured bootstrap (S2-9) |
| `vault/state/{INDEX.md,log.md}` | CLI appends as cells closed |

**Append-only held.** The stage-1 `log.md` digest `f841e147…78bdaf6` matches exactly the first
**4,941 bytes** of the current 10,081-byte log, so the stage-1 record is a byte-for-byte prefix
and nothing earlier was rewritten. The boundary falls cleanly between two entries
(`…Build: green / Next step: —`, then `## 2026-10-02 14:28 · Cell: Stage 2 inspection`).
Everything else in the tree is a *new* file, which 98 digests cannot regress.

## 7 · Recommended next cells

Each is sized for one focus session, with a binary done criterion. None is started.

| Cell | Objective | Done when |
|---|---|---|
| **Cellular Observer** (next stage, PROPOSED — not started) | the first substantial *optional* plugin: port the original 3D dashboard (Modo Celular's painel) as an observation surface, then deterministic auditing, then AI-assisted advisory capabilities | the ported panel observes real vault state through the API; **note:** the original vendors three.js r180 under MIT, so the port requires a `THIRD_PARTY_NOTICES.md` update and the vendoring discipline |
| **Approval provenance** | replace the TTY-only approver with a verdict record: who approved, when, which key#cap, carried into the kernel and the audit | a consequential call produces a durable approval record; a test proves a call with no record is refused |
| **Durable audit** | append the gateway audit to a file through a host port, append-only like the cell log | the audit survives a restart; a mutation that rewrites history goes red |
| **Host authentication** | a single shared-secret header checked before routing, documented in `api/openapi.json` | an unauthenticated request gets 401 with the standard envelope; the OpenAPI test still passes both directions |
| **Adapter live runs** | one real session per adapter (Cursor first), rewriting the honesty statement from findings | at least two adapters move from UNTESTED to VERIFIED, with the evidence named |
| **Automated mutation gate** | a runner that applies the recorded mutations and asserts each goes red | `npm run mutate` reproduces every verdict table without hand edits |
| **Workflow orchestration spike** | acceptance criteria *before* code for multi-step workflows: partial failure, compensation, per-step approval | an ACCEPTANCE file exists and is reviewed; no implementation yet |
| **Plugin discovery** | decide and document whether manifests may be loaded from disk, and under whose authority | an ADR is written and confirmed, or the direction is recorded as rejected |
