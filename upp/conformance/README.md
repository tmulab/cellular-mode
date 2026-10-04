# UPP 1.0 conformance corpus

Language-independent JSON. An implementation in any language is conformant when it answers
every case in `cases/` exactly as the case declares, while serving `manifest.json`.

## The reference manifest

`manifest.json` declares one capability, `wordcount`: input `{text}` → output `{words}`.
Words are **runs of non-whitespace** — stated once, here, because every implementation has to
agree on it for case 04 to mean anything.

The host **pins** this manifest: it compares the SHA-256 of its *canonical* JSON (keys sorted,
no insignificant whitespace) with what the plugin returns from `upp.initialize`. Key order and
indentation are therefore free; a single changed character of content is a refusal.

`entry.command` is a placeholder (`["per-implementation", …]`) and has to be: the same pinned
manifest is served by five implementations in five languages, and the argv that starts each one
is the host **operator's** decision, recorded in `upp.config.json`, never the plugin's.

## A case

```json
{
  "name": "04-execute-ok",
  "why":  "why this case exists, and what a green run therefore proves",
  "requests": [ { "message": { "jsonrpc": "2.0", "id": 1, "method": "..." } },
                { "line": "a literal line, used to send something that is not valid JSON" } ],
  "expect":   [ { "id": 1, "result": { "output": { "words": 5 } } } ]
}
```

A **request** is `{message}` (serialised to one line) or `{line}` (sent verbatim).
An **expectation** is matched against the message received at the same position, and may carry:

| Matcher | Meaning |
|---|---|
| `id` | the response id, exactly; `null` is a legal value and is checked as one |
| `code` | the response carries `error.code` equal to this **exact** integer |
| `result` | `result` is deep-equal to this |
| `resultShape` | `result` **covers** this: declared keys match, arrays same length |
| `manifestPin` | `result.manifest` has the canonical digest the runner was given |
| `none: true` | **nothing** arrived at this position — silence, asserted after a settle window |

`code` is an exact integer on purpose. A matcher that only said "it failed" would pass for
`-32602`, `-32001` and `-32700` alike, and those are three different facts.

## The eleven cases

`initialize` (version agreed, and the manifest pinned) · `initialize` with no shared version
(`-32002`) · `capabilities` · `execute` happy path · `execute` with a wrong input type
(`-32602`) · `execute` with a missing required field (`-32602`) · `execute` of an undeclared
capability (`-32001`) · an unknown method (`-32601`) · a line that is not JSON (`-32700`, null
id) · `upp.cancel` answered with silence · `health` → `shutdown` → `exit`, with `exit`
answered with silence.

One fresh process **per case**. Three of the cases end the conversation, and a corpus whose
later cases depend on what an earlier one left behind passes for the wrong reason.

## Running it

```
npm run upp:conformance                 # every implementation whose toolchain is present
npm run upp:conformance -- --impl java  # one of: in-process node python java rust cpp
```

The runner spawns each implementation through the host's own process transport
(`eip/upp-host/channel.mjs` — the single spawn site in the runtime), so the corpus is replayed
over the same framing, the same byte caps and the same stderr handling that a real plugin gets.

**SKIPPED is not PASS.** An absent toolchain is reported as `SKIPPED` with the reason and is
counted as nothing. `examples/upp-cpp` is `UNEXECUTED`: the source is committed and has never
been compiled on this machine. The current results are recorded in
[`docs/upp/CONFORMANCE.md`](../../docs/upp/CONFORMANCE.md) with the command and toolchain
version used for each row.

## Adding an implementation

Translate `examples/upp-node/plugin.mjs`, read the manifest path from `argv[1]`, speak NDJSON
on stdin/stdout, keep stdout for protocol only, flush after every line, and add a row to
`IMPLEMENTATIONS` in `eip/upp-host/conformance-impl.mjs` with an availability probe that fails
with a reason rather than silently.
