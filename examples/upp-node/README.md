# `examples/upp-node` — the UPP reference plugin in JavaScript

`plugin.mjs` is the plugin every other implementation is a translation of. It is the one to read
first, and the one to change first if the protocol changes.

```
node plugin.mjs ../../upp/conformance/manifest.json
npm run upp:conformance -- --impl node          # from the repository root
```

It imports **nothing from this repository** — only `node:fs`. That is deliberate: an
implementation that shared code with the host testing it would prove the two agree with
themselves, not that either follows the protocol.

Note that this is a *child process* implementation. The same corpus also runs with no process
at all, against an ordinary `definePlugin` plugin, through
`eip/upp-host/in-process-endpoint.mjs` — that is the `in-process` row of the matrix, and it is
what makes "an existing JS plugin satisfies UPP" a measurement.

## The corpus

Eleven cases, in [`upp/conformance/`](../../upp/conformance/README.md). The manifest this
implementation serves is `upp/conformance/manifest.json` and its path arrives as `argv[1]`;
the host pins the canonical SHA-256 of that manifest, so answering a different one is refused
at `upp.initialize`.

## Limits of this example

It is a conformance implementation, not a library. It has no logging policy, no configuration,
no concurrency, no back-pressure and no health model beyond a constant `ok`. It answers one
message at a time, in order, which is all the corpus asks of it.
