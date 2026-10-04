# `examples/upp-cpp` — the UPP reference plugin in C++17 · **NOT EXECUTED**

> **This source has never been compiled or run on the machine that wrote it.**
> There is no C++ compiler here. Read every claim about it as a **PROPOSAL**, and expect the
> first person with a compiler to have something to fix. `docs/upp/CONFORMANCE.md` records it
> as `UNEXECUTED`, and the conformance runner refuses to report anything else for it — an
> unexecuted implementation that showed up as green would be the worst kind of false green.

Three files, no dependency: `plugin.cpp` with `json.hpp` (the value and the writer) and
`jsonparse.hpp` (the reader) beside it. The C++ standard library has no JSON, and adding
nlohmann or RapidJSON would make the "no dependency" claim false, so the codec is
hand-written; it is split in two the way `examples/upp-rust` splits its own, so that no file
passes the project's 200-line limit.

## Building it (unverified)

```
g++   -std=c++17 -O2 -o upp-plugin plugin.cpp
clang -std=c++17 -O2 -o upp-plugin plugin.cpp -lstdc++
cl /std:c++17 /EHsc /Fe:upp-plugin.exe plugin.cpp
./upp-plugin ../../upp/conformance/manifest.json
```

Then add a `prepare()` for it in `IMPLEMENTATIONS` (`eip/upp-host/conformance-impl.mjs`) that
probes the compiler, builds into `os.tmpdir()` the way the Rust row does, and returns the argv.
Until that exists and has been run, the row stays `UNEXECUTED`.

## Known gaps, besides being unexecuted

- `\uXXXX` escapes are **not decoded**: `jsonparse.hpp` skips four hex digits and substitutes `?`.
  The corpus has no such escape, which is exactly why this gap would survive a green run
  elsewhere, and it is written down here instead.
- Numbers are `double`, printed as integers when integral; precision beyond `double` is lost.
- Duplicate keys: the first one is returned by `get`.
- No depth limit, so a deeply nested hostile input would recurse.

## The corpus

Eleven cases, in [`upp/conformance/`](../../upp/conformance/README.md). The manifest this
implementation serves is `upp/conformance/manifest.json` and its path arrives as `argv[1]`;
the host pins the canonical SHA-256 of that manifest, so answering a different one is refused
at `upp.initialize`.

## Limits of this example

It is a conformance implementation, not a library. It has no logging policy, no configuration,
no concurrency, no back-pressure and no health model beyond a constant `ok`. It answers one
message at a time, in order, which is all the corpus asks of it.
