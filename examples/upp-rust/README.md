# `examples/upp-rust` — the UPP reference plugin in Rust

`std` only. No `cargo`, no `Cargo.toml`, no crate fetched, nothing from the network.

```
rustc --edition 2021 -o upp-plugin plugin.rs
./upp-plugin ../../upp/conformance/manifest.json
npm run upp:conformance -- --impl rust          # from the repository root
```

The runner compiles it with exactly that command (`RUSTC_FLAGS` in
`eip/upp-host/toolchains.mjs`, so the README and the runner cannot disagree) into a fresh
directory under `os.tmpdir()` at test time, and reports `SKIPPED` with the compiler's own
message if it fails. Nothing is written into the repository. Unoptimised on purpose: the corpus
measures conformance, not speed, and `-O` cost about forty seconds per run.

Two files, compiled as one crate: `plugin.rs` declares `mod json;` and `rustc` reads `json.rs`
from the same directory — a module split needs no build tool. The split exists so neither file
passes the project's 200-line limit.

## The hand-written JSON reader and writer (`json.rs`)

`std` has no JSON, and `serde_json` would make the "std only" claim false, so the codec is
written out. Complete enough for the corpus and no more. Known gaps:

- **surrogate pairs** are not recombined: `\uXXXX` is decoded one unit at a time, and a lone
  surrogate is rejected by `char::from_u32`;
- **numbers** are `f64`, printed as integers when integral; precision beyond `f64` is lost;
- **duplicate keys** are all kept, and `get` returns the first;
- **no depth limit**, so a deeply nested hostile input would recurse.

Use `serde_json` in production.

## The corpus

Eleven cases, in [`upp/conformance/`](../../upp/conformance/README.md). The manifest this
implementation serves is `upp/conformance/manifest.json` and its path arrives as `argv[1]`;
the host pins the canonical SHA-256 of that manifest, so answering a different one is refused
at `upp.initialize`.

## Limits of this example

It is a conformance implementation, not a library. It has no logging policy, no configuration,
no concurrency, no back-pressure and no health model beyond a constant `ok`. It answers one
message at a time, in order, which is all the corpus asks of it.
