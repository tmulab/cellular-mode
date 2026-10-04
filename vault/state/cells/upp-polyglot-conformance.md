# Cell: UPP polyglot conformance
**ID:** upp-polyglot-conformance
**Area:** upp/conformance, examples/upp-python, examples/upp-java, examples/upp-rust, examples/upp-cpp
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Language-independent conformance fixtures replayed against real plugins in several languages, plus in-process JavaScript equivalence
**Boundary:** in: fixtures, one runner, Python and Java plugins executed, Rust std-only if feasible, C++ source unexecuted, in-process JS conformance (U10) | NOT in: installing toolchains, fetching crates, application plugins, CI
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** every executed implementation passes the same fixtures; unexecuted ones labelled; final verification authorized
**Last fact:** upp/conformance corpus (11 JSON cases + reference manifest text.wordcount); one runner through the existing single spawn site; matrix executed this cell: in-process JS (U10) 11/11, node 11/11, python 3.13 11/11, java 21 11/11, rust 1.91 std-only 11/11, cpp UNEXECUTED (no compiler, source only); skip-is-not-pass proven with a synthetic absent-toolchain row after two mutations came back false green; 11 mutations, 2 recorded as unreachable defence-in-depth; flaky 400 ms default deadline raised to 5 s; 914/914 tests
**Build/typecheck:** green
**Decisions:** no toolchain installed or package fetched; Java located via JAVA_HOME, never a hard-coded path
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
