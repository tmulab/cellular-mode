# Changelog

All notable changes to this repository.

## 2.0.0 — 2026-10-25

**The operation layer.** v1 governed one active cell; v2 puts an **operation** above the cell — the
human's unit of attention — and lets several cells run inside it at once, each with a declared
boundary, done criterion and budget, opened only after its conflicts with the others are named.
The method text, the CLI, the Observer, the gates, the skills and the adoption tooling all moved
together. Final state: 1604 tests (from 1478), typecheck 0 errors, gates no findings; CI green on
Node 22 and Node 24 on every push of the revision.

### What changed, by rule

- **Rule 1 — one active *operation*.** Inside it several cells may be active, each with a boundary,
  a done criterion and a budget, opened only after naming its conflicts with the others. Outside an
  operation the v1 rule still holds: one active cell, paused cells coexist. Neither an operation nor
  a cell may be widened on the agent's own initiative (cell `R1`, `ab1fa0e`).
- **Rule 2 — recorded.** Every **operation** closure, like every cell closure, appends to the log;
  dashboards are *generated* from the log and never written beside it (`R1`, `R7`).
- **Rule 3 — small units.** A cell inside an operation is **one task** (`R1`).
- **Rule 4 — gates green first.** A project may add a lighter commit-time gate, but it must reach
  the tests that read **every data file it touches**; what the light gate cannot reach, the full gate
  must, before any delivery (`R1`, `R9`).
- **Rule 5 — approval.** An operation's **authorization pack**, given by the human at opening and
  recorded, counts as explicit approval for the batch operations, spend ceiling and publishing it
  names, within its limits, and for nothing else. It never grants a destructive operation, a
  protected-resource mutation or the skipping of a gate or test; it expires with the operation
  (`R1`, `R2`).
- **Rule 6 — divergence.** The operation's finish line is **frozen at opening**; any later
  discovery, from agent or human, goes to the parking lot by default, and moving the finish line is
  a recorded decision, not an update (`R1`, `R5`).
- **Rule 7 — stopping** is unchanged.

### What changed, by component

- **Operation file model** — `operations/<slug>.md` with a closed authorization-pack vocabulary, a
  deny-list checked first, and a finish-line fingerprint; old cell files still render byte-identically
  (cell `R2`, `0a47339`).
- **CLI `op open|pause|complete|status`** — writes the operation file and its log entry, refuses a
  second active operation, refuses completion while a cell is active (`R3`, `e38eab3`).
- **Cells inside an operation** — `open` requires the `--in`/`--out` boundary, writes `Operation:`,
  `Base commit:` and `Spend:`, honours the pack's `max-active-cells`, and refuses an unplanned cell
  without `--amend-pack --confirm`, which appends a pack amendment without moving the fingerprint
  (`R4a`, `85d4095`).
- **Conflict crossing** — `cellmode conflicts <cell>` crosses boundary paths, holes, dependencies and
  pack batches against every other active cell; `open` runs it before any write: an overlap refuses
  unless the human confirms, a shared resource warns, every verdict is recorded as `**Conflicts:**`.
  The SEMANTIC conflicts stay the orchestrator's sentence (`R4b`, `1e56c17`).
- **Six new `check` findings** — `finish-line-moved`, `pack-missing`, `pack-grants-forbidden`,
  `spend-over-ceiling`, `cell-stale`, `merge-unrecorded`; `two-active` now applies only outside an
  operation. Without git, or outside a work tree, the last two print an UNKNOWN notice and are never
  a pass (`R5`, `ffa34ea`; rationale `74b06e6`).
- **Skills** — new `skills/operation` and `skills/worker` (a worker never touches the vault and
  cannot launder a permission); `skills/cell` and `skills/pause` revised for cells inside an
  operation (`R6`, `3643f81`).
- **Generated map** — `cellmode report` draws `vault/state/map.svg` from `log.md`, `INDEX.md` and
  `operations/` alone, deterministically (same vault, same bytes), plus the `map-stale` finding,
  which is reported and never refuses a transition (`R7`, `9d0f3ba`).
- **Observer** — shows the active operation and its active cells; `api/openapi.json` gains
  `operation` and `activeCells` **additively** (info version 1.0.0 → 1.1.0) (`R8`, `0f39733`).
- **Data-aware light gate** — `examples/gates/related-with-data.mjs`, a worked example that maps
  staged data files to the tests that read them and fails closed with no reader (`R9`, `3643f81`).
- **Swarm rehearsal** — an executed end-to-end test of the whole operation layer in a temporary git
  repository: ceiling, overlap refusal, amendment, stale worker, deterministic report (`R10`,
  `2aa9b0c`).
- **Adoption** — `bootstrap upgrade` (dry-run, confirm, verbose) brings an existing installation to
  the current method, and `--keep-modified` keeps the files the adopter changed instead of refusing
  the whole run (`R10b`, `3643f81`, `c96448c`); the generated `AGENTS.md` template now renders the v2
  rules (`d015a7f`).
- **Field pilot** — the v2 method was installed on a real external project through `upgrade`, with
  every write approved step by step; that project's typecheck, unit tests, build, final verification
  and CI are green (`R11`, `95bd256`).

### Stable in v2.0.0

Everything listed as stable in 1.0.0, unchanged in contract, plus: the operation file model and its
closed authorization pack · `op open|pause|complete|status` · cells inside an operation with declared
boundaries, `max-active-cells` and recorded pack amendments · `cellmode conflicts` · the six
operation findings of `check` · `cellmode report` and the generated map · the `operation` and
`worker` skills · `bootstrap upgrade` with `--keep-modified`.

### Breaking for adopters

- **Rule 1 is reworded.** "One active cell" becomes "one active **operation**, several cells inside
  it"; the one-active-cell rule now applies only *outside* an operation. A project that quotes rule 1
  in its own documents must update that wording.
- **An already-generated `AGENTS.md` is not re-rendered by `upgrade`.** The template produces the v2
  rules for new installations; an existing project's `AGENTS.md` must be **edited by hand**.
- **`upgrade` refuses the whole run when an installed immutable file was changed by the adopter**,
  unless `--keep-modified` is given, in which case those files are kept byte-identical, recorded as
  the project's own, and never receive method updates afterwards.

### Release boundary — what v2.0.0 does NOT imply

Not built, not promised, and not implied by this version number: **a distributed lock** — several
active cells are a *recorded convention* checked by `check` and by the conflict crossing, never
mutual exclusion, and nothing prevents two agents writing the same file · **automatic detection of
semantic conflicts** — the crossing is textual (paths, holes, dependencies, batches); whether two
cells contradict each other in meaning stays the orchestrator's sentence · sandboxing of untrusted
plugins · a plugin marketplace · automatic plugin discovery · hot reload · CPU or memory quotas ·
authentication on the HTTP surface · rate limiting · durable audit · an updater or repair automation
· Multi-Model support · a graphical onboarding experience · validated human usability · validation
on macOS.

**No frozen public API for the experimental subsystems**, exactly as in 1.0.0: the EIP and UPP
runtime surfaces and the Adaptive module may change without a major-version ceremony, except where
their own documentation guarantees otherwise — **UPP 1.0 remains a versioned protocol
specification** ([`docs/upp/SPEC.md`](docs/upp/SPEC.md) §5), and the `openapi.json` change of this
release is additive within that rule. Security scope is unchanged: [`SECURITY.md`](SECURITY.md).

### Limits of the evidence

The field pilot is **one project, one maintainer, one day** — evidence that the upgrade path and the
operation layer work on real code, not a usability study. The swarm rehearsal is an automated replay
of a real session, not a multi-human trial. Nothing here is evidence of proven human usability,
reduced cognitive load, productivity gains or statistical validation.

### Known limitations

Not published to npm (`private: true` is deliberate) · branch protection on `main` is not enabled ·
the Trojan Source gate is not built · mutation verdicts are hand-applied · the v1.0.0 guides and
preprints describe 1.0.0 and have not yet been revised for v2 · `vault/state/map.svg` is generated on
demand and is not committed here.

## Post-release documentation — 2026-10-08

- `CITATION.cff` added on `main`.
- English technical preprint — DOI [10.5281/zenodo.23240653](https://doi.org/10.5281/zenodo.23240653).
- Portuguese translation of the technical preprint — DOI [10.5281/zenodo.23244321](https://doi.org/10.5281/zenodo.23244321).
- English User Guide — DOI [10.5281/zenodo.23246099](https://doi.org/10.5281/zenodo.23246099).
- Portuguese User Guide — DOI [10.5281/zenodo.23246221](https://doi.org/10.5281/zenodo.23246221).

These publications do not change the v1.0.0 software artifact or move the v1.0.0 tag.
Canonical map, with concept DOIs and relations: [`docs/PUBLISHED-ARTIFACTS.md`](docs/PUBLISHED-ARTIFACTS.md).

## 1.0.0 — 2026-10-08

First released version. The method, its state protocol, the engineering layer and the optional modules are complete and verified at their final state: release commit `1070dcd`, GitHub Actions run [`37777098948`](https://github.com/tmulab/cellular-mode/actions/runs/37777098948) green on Node 22 (v22.23.3) and Node 24 (v24.21.0) — typecheck 0 errors, 287 modules, **1478 tests discovered · 1477 passed · 0 failed · 1 skipped** (a Windows-only runtime test, skipped on Linux by design), gates no findings, release gate no blockers, vault integrity 82 completed cells · 85 log entries, Article-8 `Verified-State` trailer MATCH, CI fingerprint MATCH.
UPP conformance PASS 11/11 in-process, Node, Python, Java and Rust; the C++ example ships
as source and is **UNEXECUTED**. The Stage 8 implementation commit was `45c69dd`, with its own
CI run `37771618776`. Status summary: [`README.md`](README.md) · decision
history: [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

### Stable in v1.0.0

The cell lifecycle (open · pause · resume · complete) and the `cellmode` CLI · the
persistent vault and its append-only log · pause and resume as procedures · the state
integrity guard · the engineering constitution and its epistemic labels · the automated
gates (size · secrets · deps · import boundaries) and the release gate · Article 8 final
verification · the Cellular Prompt Builder · Cellular Bootstrap, with new-project and
existing-project adoption, `status`, expected evolution, drift detection and safe
uninstall · Cellular Adaptive (optional, **experimental**) · Cellular Observer (optional) ·
Everything Is a Plugin · **UPP 1.0** with its executed conformance implementations.

### Release boundary — what v1.0.0 does NOT imply

Not built, not promised, and not implied by this version number: sandboxing of untrusted
plugins · a plugin marketplace · automatic plugin discovery · hot reload · CPU or memory
quotas · authentication on the HTTP surface · rate limiting · durable audit · an updater
or repair automation · Multi-Model support · a graphical onboarding experience · validated
human usability · validation on macOS.

**No frozen public API for the experimental subsystems.** The EIP and UPP runtime surfaces
and the Adaptive module may change without a major-version ceremony, except where their own
documentation already guarantees otherwise: **UPP 1.0 is a versioned protocol
specification** — a MAJOR mismatch is rejected and MINOR changes are additive only
([`docs/upp/SPEC.md`](docs/upp/SPEC.md) §5). That guarantee covers the wire contract, not
the modules implementing it. Security scope: [`SECURITY.md`](SECURITY.md).

### Limits of the adoption evidence

The adoption trials were **walkthroughs performed by an AI agent acting as a technically
competent newcomer** — not a human user study. Nothing here is evidence of proven human
usability, reduced cognitive load, productivity gains or statistical validation.

### Historical UNKNOWNs, preserved

- The isolated Stage 7 `PB3` rehearsal failure is **UNKNOWN**.
- The first Stage 8 closing run of `verify:final` reported 1477/1478 and is **UNKNOWN —
  not reproduced under bounded investigation**. The deterministic `PB3` test defect found
  later in Stage 8 was a separate fault and does not explain the Stage 7 event.

### Known limitations

Not published to npm (`private: true` is deliberate) · branch protection on `main` is not enabled · "one active cell" is a convention checked
after the fact, not a lock · the Trojan Source gate is not built · mutation verdicts are
hand-applied, not re-run automatically.

Historical note on the tag: this entry was written with the release-alignment commit, which
preceded creation of the public `v1.0.0` tag and GitHub Release. Both now exist and point to
release commit `1070dcdb3d64442593a3f7540cd5ed86d8092e54`.
