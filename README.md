# Cellular Mode

**An agent-assisted development method.** Work in **cells** — small, bounded units with an
explicit contract — and keep their state recorded, so that stopping is cheap and resuming is
almost instant, whether the next session is tomorrow, in three weeks, or with another agent.

Plain Markdown. Zero runtime dependencies. No runtime required. Node 22 or 24 (the two lines CI verifies; `engines.node` is `^22 || ^24`). Apache-2.0.
**Not yet release-ready — see [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)** · security scope: [`SECURITY.md`](SECURITY.md).

## The problem

Agent-assisted development keeps failing in three ways, all about *continuity* rather than intelligence.
**Interruptions:** when the only record is the chat transcript, every pause — a meeting, fatigue, a compacted context
window, a new tool — costs a full re-explanation, and some is lost. **Cognitive load:** the usual way to give an agent context is to dump everything, expensive for the model and paralysing for the person. **Scope creep:** asked for X, an eager agent delivers X + Y + Z, each plausible, none agreed.

## Principles

1. Work happens in **cells**: small units with an explicit boundary and a contract.
2. Stopping is not failing — it is the natural end of a cell. The protocol absorbs it.
3. **Resumable ⟺ recorded.** Unrecorded work does not exist for the next session.
4. The path may be non-linear; the record makes the result converge anyway.
5. The agent holds global coherence so the human spends energy only on focus.
6. The **log is truth**; everything else is a projection and can be rebuilt.
7. Human authority at the boundaries: *done*, *destructive*, *batch* and *direction*.

Accessibility is structural: variable energy, non-linear focus and unannounced interruptions are ordinary working conditions, for everyone. No diagnosis is ever relevant.

## Three domains in one repository

**Independent on purpose** — take one, two or all three. Map: [`docs/09-architecture.md`](docs/09-architecture.md).

| | Domain | What it is | Where |
|---|---|---|---|
| **A** | **Cellular Mode** | the methodology: cells, recorded state, two procedures, one CLI | `AGENTS.md`, `skills/{cell,pause}`, `docs/01-04,06-08`, `tools/cellmode/` |
| **B** | **TMU-LAB Engineering Method** | how work is implemented and verified: constitution, policy layer, seven optional skills, automated gates | `docs/00`, `docs/05`, `skills/verify…`, `tools/gates/`, `policy/` |
| **C** | **Everything Is a Plugin** | an architecture foundation for systems *built with* the method: plugin contract, minimal kernel, host, agent gateway | `eip/`, `api/openapi.json` |

A **cell** is a unit of work; a **plugin** is a unit of capability; an **agent** is a caller with an allow-list
and no authority to consent. None of the three is a core, and the independence is enforced by an import gate:
Cellular Mode must keep working with no `eip/`.

## Adopt it in your project

Copy four things into your project root, plus the adapter for your tool (`adapters/`):

```
AGENTS.md                      # the canonical bootstrap — the only file always read
skills/cell/SKILL.md           # procedure: open / resume / choose a cell
skills/pause/SKILL.md          # procedure: close or complete a cell
templates/vault/state/  →  vault/state/     # the empty state skeleton
node tools/cellmode/cli.mjs init            # …or let the CLI create the skeleton
```

Both Level 4 configuration files are optional and read only if present: `templates/project-policy.md` → `vault/policy.md`, `templates/user-profile.md` → `vault/profile.md`.

## Create, pause, resume

Say `/cell`: the agent proposes a name, a boundary and a first step, you confirm, and it
writes the state. A cell fits one focus session, has ONE deliverable and a **binary** done
criterion, and its boundary states what is *not* in it. Say `/pause` — or "stop here", or
"note this down" — and the ritual collects the facts, appends to the append-only log, updates
the projections and records **one next step doable in under five minutes without thinking**.
The CLI does the same deterministically:

```
node tools/cellmode/cli.mjs open "feed parser" --area ingest --in "src/parse.js, tests" \
  --objective "parse the feed into normalized records" --done "gates green + 6 records"
node tools/cellmode/cli.mjs pause --facts "parser handles 6 records; src/parse.js" \
  --next "run npm test and read the first error" --build green
```

Next session: `/cell` gives five lines — cell, last fact, gate status, NEXT STEP — and then the next step is
*executed*, not re-discussed (`cli.mjs status` prints the same). Marking a cell ✔ done always requires your
explicit confirmation (`complete --confirm`).

## Engineering method and constitution

The method says how to *bound and record* work; the engineering layer says what counts as
*done*. Eight articles, enforced wherever a machine can enforce them
([`docs/00-constitution.md`](docs/00-constitution.md)): security by design · 200 lines per
hand-written file · epistemic labels **VERIFIED / INFERRED / PROPOSED / UNKNOWN**, fail-closed ·
acceptance criteria before implementation and Trilateral Verification after every change · one
responsibility behind a declared contract · recorded or it did not happen · automate the gate and name
the human-review items · **verification at the final state**, never on results obtained before the last modification — `npm run verify:final` ([`tools/gates/FINAL-VERIFICATION.md`](tools/gates/FINAL-VERIFICATION.md)). The configurable policy layer is
[`docs/05-engineering-rules.md`](docs/05-engineering-rules.md); seven optional skills (`verify`, `protect`,
`harden`, `sanity`, `coverage`, `port`, `decisions`) load only when a task calls for one, never as a set.
Weakening an article requires an entry in [`policy/relaxations.md`](policy/relaxations.md) — an empty list is the healthy state. Origins and a 48-row table: [`METODO_TMULAB_INTEGRATION.md`](METODO_TMULAB_INTEGRATION.md).

## Everything Is a Plugin — quickstart

A minimal, experimental runtime. A plugin declares the key it provides, the siblings it needs, the permissions
it expects and its capabilities; the kernel validates and wires; the **host** composes and owns the transport,
the filesystem port and the approver.

```
node eip/host/cli.mjs --dev-ui        # 127.0.0.1:3100, no CORS, dev pages on
curl -s http://127.0.0.1:3100/api/v1/health     # and /api/v1/plugins for the manifests
curl -s -X POST http://127.0.0.1:3100/api/v1/plugins/text.stats/capabilities/count-words \
  -H 'content-type: application/json' -d '{"input":{"text":"one two three four five"}}'
# -> 200 {"ok":true,"value":{"words":5}}
curl -s -X POST http://127.0.0.1:3100/api/v1/plugins/text.report/capabilities/save-report \
  -H 'content-type: application/json' -d '{"input":{"name":"demo","text":"a b c"}}'
# -> 403 {"ok":false,"error":{"code":"APPROVAL_REQUIRED",…}} — and nothing is written
```

**Approval fails closed.** `save-report` is *consequential*, so it cannot run without a verdict from a human
approver the host supplies (`--approve-interactive`, `y/N`, default **N**). A caller may never approve itself: an
`approval` field in a request body is refused before the kernel is reached, and an agent's forged approval is
dropped by the gateway.
⚠️ **TRUSTED LOCAL PLUGINS ONLY. Plugins run in-process with full Node privileges — permissions and ports are a
least-privilege contract, NOT a security sandbox.** Treat plugin code as trusted first-party code; untrusted
plugins need isolation this runtime does not have: [`SECURITY.md`](SECURITY.md).
Threat model: [`docs/09-architecture.md`](docs/09-architecture.md) §9 · contract: [`eip/sdk/README.md`](eip/sdk/README.md) · API: [`api/openapi.json`](api/openapi.json) · client: [`examples/api-client/`](examples/api-client/).

**Optional: the Cellular Observer.** A local, read-only dashboard over a vault — counts, cells table, cell
detail, timeline, a dependency graph in 2D with an optional 3D view, a deterministic audit area and a
disabled-by-default advisor. `node apps/observer/cli.mjs --root <project>`, loopback only, no build step, no
network: [`apps/observer/README.md`](apps/observer/README.md) · [`OBSERVER_REPORT.md`](OBSERVER_REPORT.md) · [ADR 0003](docs/adr/0003-observer-frontend.md).

**Optional: UPP — a plugin written in another language.** UPP 1.0 is the host↔plugin contract: JSON-RPC 2.0 over NDJSON on stdio, over HTTP POST, or in-process — one protocol, three transports, registered into the *same* kernel through an adapter, so manifest validation, the approval gate, deadlines, cancellation and events all stay exactly where they were. Node, Python 3, Java 21 and Rust pass the same conformance corpus (`npm run upp:conformance`, 11 cases each); the C++ example ships as source and is **UNEXECUTED**. A separate process is **failure isolation, not a sandbox** — the scope is still trusted local plugins: [`docs/upp/SPEC.md`](docs/upp/SPEC.md) · [`SECURITY-REVIEW.md`](docs/upp/SECURITY-REVIEW.md) · [`UPP_REPORT.md`](UPP_REPORT.md) · [ADR 0005](docs/adr/0005-universal-plugin-protocol.md).
**Independent CI — implemented, NOT yet run on GitHub.** [`.github/workflows/verify.yml`](.github/workflows/verify.yml) re-runs typecheck, module load, the suite, the gates, the release gate, the cell-state check and the polyglot conformance on a clean checkout, then compares each commit's Article-8 `Verified-State` trailer with the tree it records. `contents: read` only, no secret, every action pinned by commit SHA: [`tools/gates/CI.md`](tools/gates/CI.md).

## Cellular Adaptive (optional, experimental)

Say **how you want to work right now** — `/tired`, `/focus`, `/explore`, `/ready` (Portuguese aliases included) — and the
agent adjusts the *form* of the collaboration: detail, decisions per turn, step size, what is shown first. A mode is
**declared by the human only, never inferred**, and it changes **no** gate, approval, security report or test. Delete
`tools/adaptive/` and `adaptive/` and nothing else changes — an import gate proves it. The behavioural effect on a real
model is **UNKNOWN**, not yet validated: [`docs/10-adaptive.md`](docs/10-adaptive.md) ·
[`ADAPTIVE_REPORT.md`](ADAPTIVE_REPORT.md) · [ADR 0004](docs/adr/0004-cellular-adaptive.md).

## Use it with different agents

Agent-neutral: a tool needs only to read `AGENTS.md` and write under `vault/state/`. Adapters are thin pointers, never copies, so the method cannot drift between tools.

| | |
|---|---|
| Claude Code | `adapters/claude-code/` — eleven skills: `/cell`, `/pause` (`/celula`, `/pausar` aliases) and the seven engineering skills. Discovery and `cell` invocation **VERIFIED** live |
| Cursor | `adapters/cursor/` — an always-applied rule pointing at `AGENTS.md` |
| Codex CLI, Gemini CLI, Copilot, Aider, generic chat | the per-tool table in [`adapters/README.md`](adapters/README.md) |

**Honesty:** for Claude Code, skill **discovery** and **invocation** are VERIFIED live — all eleven skills were listed and `cell` was invoked through the pointer and followed (the other ten share the identical pointer shape but were not individually invoked). Every other adapter is **untested** — documented conventions only.

## Documentation

| | |
|---|---|
| [`docs/00-constitution.md`](docs/00-constitution.md) · [`05-engineering-rules.md`](docs/05-engineering-rules.md) | the seven engineering articles and the fail-closed rule · the configurable engineering policy layer |
| [`docs/01-philosophy.md`](docs/01-philosophy.md) · [`02-cell-lifecycle.md`](docs/02-cell-lifecycle.md) | principles, methodology vs runtime, what a cell is *not* · states, symbols, the full transition table, open issues |
| [`docs/03-state-and-memory.md`](docs/03-state-and-memory.md) · [`04-collaboration.md`](docs/04-collaboration.md) | the five state files, formats, projection principle, integrity guard · handoff contracts and the approval boundary |
| [`docs/06-context-engineering.md`](docs/06-context-engineering.md) · [`07-adaptation.md`](docs/07-adaptation.md) · [`08-agent-integration.md`](docs/08-agent-integration.md) | four context levels, recovery after compaction, injection stance · protocol vs profile and the adaptation test · integrating any agent |
| [`docs/09-architecture.md`](docs/09-architecture.md) | the three domains, layers, dependency direction, authority, threat model |
| [`docs/adr/`](docs/adr/) · [`docs/upp/`](docs/upp/SPEC.md) · [`SECURITY.md`](SECURITY.md) | five architecture decision records (all approved) · the language-neutral host↔plugin protocol, UPP 1.0, implemented and **experimental** · supported scope, threat model, what is and is not enforced |

Templates: [`templates/`](templates/) — user profile, cell contract (with the full worked form: question → pre-committed decisions → declared scope → mechanical criteria with red-proof → verdict), handoff package, project policy. **Example:** [`examples/text-stats/`](examples/text-stats/) — a small project built through three cells, with its vault, code, tests and a reproduce script. [`vault/state/`](vault/state/) here is *this* repository's own development record, written by the real CLI; adopters run `init` in their own project.
Reports: [`CONTEXT_AUDIT.md`](CONTEXT_AUDIT.md) · [`MIGRATION_REPORT.md`](MIGRATION_REPORT.md) · [`ARCHITECTURE_REPORT.md`](ARCHITECTURE_REPORT.md) · [`ADAPTIVE_REPORT.md`](ADAPTIVE_REPORT.md) · [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## Tests and gates

```
npm test                  # node --test — the whole suite
npm install && npm run typecheck   # tsc --noEmit -p jsconfig.json — checkJs, strict, 0 errors
npm run gates             # size · secrets · deps · import boundaries
npm run trilateral        # typecheck · build · tests — three honest lines with real counts
node tools/cellmode/cli.mjs check && node examples/text-stats/reproduce.mjs   # state guard; example
```

**Zero RUNTIME dependencies, two development ones** (`typescript`, `@types/node`, pinned exactly) so the typecheck leg is a measurement, not a label — R-1 WITHDRAWN ([`policy/relaxations.md`](policy/relaxations.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)). Without them it falls back to `node --check`, labelled **UNAVAILABLE (UNKNOWN)**: a gate that cannot run is not a pass.
**Contributing:** work in cells, write in English, include no personal data, run `npm test` — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Implemented vs experimental vs proposed

| Status | What |
|---|---|
| **Implemented** | The method documentation (`docs/`, `templates/`) and the two procedures as agent-neutral prose (`skills/`). The `cellmode` CLI — a deterministic implementation of the file protocol. The optional `key-audit` tool. The four gates and the Trilateral runner (`tools/gates/`). Tests, run with `npm test`. |
| **Implemented — minimal, experimental API (v1)** | The **Everything Is a Plugin** runtime: SDK contract and validators, kernel (register / load / dispose / execute / events), two example plugins, three optional `observer.*` plugins with the `apps/observer/` application, the HTTP host with `api/openapi.json`, the agent gateway, and **UPP 1.0** — the host↔plugin protocol with its three transports, its polyglot conformance corpus and the application-plugin kind. Each has acceptance criteria and a recorded mutation verdict (`eip/*/ACCEPTANCE.md`). **Local development only**, API not frozen: no authentication, no rate limiting, loopback-bound, **trusted local plugins only** ([`SECURITY.md`](SECURITY.md)). |
| **Experimental / untested** | Adapters for every tool other than Claude Code: Cursor, OpenAI Codex CLI, Gemini CLI, GitHub Copilot, Aider, generic chat — documented conventions, not live runs. For Claude Code, skill *invocation* (discovery is verified). |
| **Proposed — not built** | Workflow orchestration: multi-step workflows, planners, multi-agent delegation, durable audit (`eip/orchestration/README.md`). Plugin discovery from disk, hot reload, sandboxed execution of untrusted plugins — UPP's process transport is *failure* isolation, never confinement (`docs/09-architecture.md` §4, `docs/upp/SECURITY-REVIEW.md` §3); gRPC and WASM transports, an MCP bridge, ports and sibling calls for external plugins (`docs/upp/SPEC.md` §12). Multi-agent locking — "one active cell" is a convention checked after the fact, not a lock. |
| **Out of scope by decision** | A production frontend *inside* the runtime: complex UIs are independent applications consuming `api/openapi.json`, never plugins — [ADR 0001](docs/adr/0001-frontend-exception.md), [ADR 0003](docs/adr/0003-observer-frontend.md). No framework, no build step, no Next.js. |

## Authorship and origins

**Hudson A. R. Bonomo** (Hudson Augusto Rodrigues Bonomo) **· TMU-LAB — The Machine Unconscious Lab · <https://tmulab.org>**

Developed in production use and originally written in Portuguese as **"Modo Celular"**, then generalized into
this English, project-agnostic form. See [`NOTICE`](NOTICE).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).

## Acknowledgments

- The **engineering-policy layer** (`docs/05-engineering-rules.md`) was written independently for this repository, but is
  **inspired by ideas publicly shared by Fábio Akita** on AI-assisted development — in particular test-first discipline with agents, project-level instruction files, and refusing to accept unverified output. No text from that work is reproduced here, and no endorsement is implied.
- **David L. Parnas**, *On the Criteria To Be Used in Decomposing Systems into Modules* (1972) — the reason a declared interface can replace a meeting (`docs/04-collaboration.md`).

The method, the CLI, the gates and the runtime bundle **no third-party code** and declare zero runtime
dependencies. Exactly one directory is vendored: the hash-pinned `three@0.180.0` (MIT) used by the optional 3D
view of `apps/observer/`. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
