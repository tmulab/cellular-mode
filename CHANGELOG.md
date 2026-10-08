# Changelog

All notable changes to this repository.

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
