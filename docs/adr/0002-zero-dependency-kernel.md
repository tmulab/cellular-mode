# ADR 0002 — A zero-dependency kernel, reimplementing the concepts

- **Status:** **Accepted — approved by Hudson A. R. Bonomo, 2026-10-02**, for the
  current implementation. The approval was given as a **design preference, not a
  permanent prohibition** against dependencies that provide demonstrable value.
- **Date:** 2026-10-02
- **Deciders:** Hudson A. R. Bonomo (approver), with the implementation agent as
  proposer
- **Scope:** `eip/sdk`, `eip/kernel`, and the decision not to depend on an
  external plugin framework

## Context

The "Everything Is a Plugin" architecture in this repository is a reimplementation
of concepts the author developed in earlier, private work: a manifest whose name
**is** the key it provides, sibling capabilities resolved through `inject` while
infrastructure arrives as **ports**, declared permissions that gate what the
composition may hand over, consequential capabilities that require a human
verdict, and registration as a reversible effect.

Several mature plugin frameworks and dependency-injection containers exist, and
any of them would have provided wiring. The question was whether to depend on
one, port the author's earlier code, or restate the concepts in new code.

Three constraints shaped the answer. The repository is published under
Apache-2.0 with **zero runtime and development dependencies** and Node built-ins
only. Every hand-written source file is capped at 200 lines, which means the
runtime must be small enough to read in one sitting. And the earlier private
sources could not be copied: only the ideas are available for reuse, so the code
here is written from the concepts, not transcribed.

## Decision

Reimplement the concepts in this repository, with no external framework.

1. **The SDK is the floor** (`eip/sdk`): the manifest contract, a deliberately
   tiny JSON-Schema subset, the closed list of error codes and permissions. It
   imports nothing.
2. **The kernel imports the SDK only** (`eip/kernel`): register, load, dispose,
   execute, get, list, on. Each member justified in a comment; no domain
   behaviour, no logging policy, no I/O, no transport. It is not a privileged
   core — anything a plugin could do, the kernel does not do.
3. **The schema subset is intentionally incomplete.** `type`, `properties`,
   `required`, `additionalProperties:false`, `items`, `enum`, `minLength`,
   `maxLength`, `minimum`, `maximum`, `maxItems` — nothing else, and an
   unsupported keyword is itself a contract error. Every keyword is a way for two
   plugins to disagree about a shape, so the vocabulary is finite and readable.
4. **No code is copied from the earlier private work**, and nothing in the runtime
   names a private system. Concepts are credited in `NOTICE` and
   `THIRD_PARTY_NOTICES.md`; implementation is new.

## Consequences

**Positive.** The whole runtime can be read and audited in an afternoon; supply
chain risk is zero; `npm install` is not a prerequisite for `npm test`. Every
behaviour exists because a test demanded it, which kept the kernel at the size the
concepts actually need. Security properties (least privilege on ports,
fail-closed approval, no stack on the wire) are enforced by code we own, so they
cannot be weakened by an upstream release.

**Negative.** Features a mature framework gives away are absent: `pattern` in
schemas, `$ref`, hot reload, a process supervisor, a plugin marketplace. Some of
those absences have already cost something concrete — `text.report` validates its
report name in code because the subset has no `pattern`, and the kernel contains
the resulting named error as `PLUGIN_ERROR` with the code in `details`. Bugs are
ours to find; there is no community finding them first. Maintenance is ours
forever.

**Neutral.** The 200-line rule forces many small modules, which reads as more
files but less code per decision. The subset is extensible if a concrete need
appears, and the extension would be one keyword plus its tests, not an upgrade.

**Neutral — the scope of the approval.** Zero dependencies is a **design
preference for the current implementation, not a permanent prohibition against
dependencies that provide demonstrable value.** A future dependency is therefore
a decision to argue on its merits (value, audit cost, supply-chain risk), not a
rule violation; it would need its own ADR and `policy/allowed-dependencies.json`
entry, and it would not retroactively invalidate this one.

## Alternatives considered

- **Depend on an external plugin framework or DI container (rejected).** It would
  break the zero-dependency property, import semantics we do not control, and make
  the architecture's claims conditional on someone else's roadmap. The runtime is
  the thing being taught here; a dependency would hide exactly the part a reader
  needs to see.
- **Port the author's earlier implementation verbatim (not available).** The
  earlier sources are private and were read for concepts only; copying was never
  an option, which is also why the licence story here is clean.
- **A full JSON-Schema validator, hand-written (rejected).** Hundreds of lines
  reimplementing a specification, for keywords no plugin in this repository needs.
  The subset is a feature: it bounds what two plugins can argue about.
- **No contract validation at all, trusting plugins (rejected).** A contract that
  is not checked is a comment. Fail-closed validation at both ends is the premise
  the rest of the architecture rests on.
