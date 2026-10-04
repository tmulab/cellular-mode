# `examples/upp-python` — the UPP reference plugin in Python 3

Standard library only: `json` and `sys`. Nothing is installed, no virtual environment, no
`requirements.txt`.

```
python plugin.py ../../upp/conformance/manifest.json
npm run upp:conformance -- --impl python        # from the repository root
```

Two details that are not cosmetic:

- **Bytes, not text.** Input and output go through `sys.stdin.buffer` / `sys.stdout.buffer`
  with explicit UTF-8. The console encoding of whoever started the process is not part of the
  protocol, and on Windows it is not UTF-8.
- **Flush after every message.** A block-buffered stdout makes a correct plugin look like one
  that never answers, which is a timeout nobody can explain.

Measured with Python 3.13 (`python --version`). Any Python 3 should work; the runner reports
`SKIPPED` with the reason when `python` is absent, and never counts that as a pass.

## The corpus

Eleven cases, in [`upp/conformance/`](../../upp/conformance/README.md). The manifest this
implementation serves is `upp/conformance/manifest.json` and its path arrives as `argv[1]`;
the host pins the canonical SHA-256 of that manifest, so answering a different one is refused
at `upp.initialize`.

## Limits of this example

It is a conformance implementation, not a library. It has no logging policy, no configuration,
no concurrency, no back-pressure and no health model beyond a constant `ok`. It answers one
message at a time, in order, which is all the corpus asks of it.
