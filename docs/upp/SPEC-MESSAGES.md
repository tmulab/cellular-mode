# UPP 1.0 — message catalogue and error codes

Normative. Part of [SPEC.md](SPEC.md), split out only because of the 200-line rule.
**Status: PROPOSED** — nothing here is implemented yet; cells 2–3 build it.

## 1 · Envelope

Every message is a **JSON-RPC 2.0** object. `"jsonrpc": "2.0"` is mandatory in both
directions; an envelope without it is `-32600`.

- **Request** `{"jsonrpc":"2.0","id":<int|string>,"method":"upp.…","params":{…}}`
- **Response** `{"jsonrpc":"2.0","id":<same>,"result":{…}}` **or**
  `{"jsonrpc":"2.0","id":<same>,"error":{"code":<int>,"message":"…","data":{…}}}`
- **Notification** `{"jsonrpc":"2.0","method":"upp.…","params":{…}}` — **no `id`**, no answer.
  `upp.cancel` and `upp.exit` are the only notifications in 1.0.

`id` is assigned by the **host** and MUST be unique among that connection's in-flight
requests. The host MAY reuse an id after the request has settled or been retired. Batch
arrays are **not** supported in 1.0: a batch has no useful meaning for a lifecycle, and
partial-failure semantics for one would be a specification of its own. A plugin receiving an
array MUST answer `-32600`.

Direction: the **host is the JSON-RPC client**, the **plugin is the server**. The plugin
initiates nothing in 1.0 — no server-to-client requests, no progress notifications
(**PROPOSED** for a later MINOR, which §5 of SPEC.md permits as additive).

## 2 · `upp.initialize` — request/response, once, first

The first message on every connection. Anything else before it is `-32007 NOT_INITIALIZED`.

```json
{"jsonrpc":"2.0","id":1,"method":"upp.initialize","params":{
  "protocolVersions":["1.0"],
  "host":{"name":"eip-host","version":"0.1.0","capabilities":{"cancel":true}},
  "config":{"prefix":"daily"},
  "extensions":{}
}}
```

| Param | Req. | Meaning |
|---|---|---|
| `protocolVersions` | **yes** | non-empty array of `"MAJOR.MINOR"` strings, newest first — what the **host** supports |
| `host` | **yes** | `{name, version, capabilities?}`; `capabilities` announces optional host behaviour the plugin may rely on (`cancel` in 1.0) |
| `config` | no | the operator's configuration, **already validated** by the host against the manifest's `config` schema. Approved as a design call in cell 1; the one addition to the stage plan's parameter list (SPEC.md §6) |
| `extensions` | no | the only tolerant container |

```json
{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"1.0",
  "manifest":{"upp":"1.0","id":"text.stats","version":"1.0.0","type":"capability",
    "runtime":"process","entry":{"command":["python","plugin.py"]},
    "description":"Counts words.",
    "capabilities":{"count-words":{"description":"Count words in a text.",
      "consequential":false,
      "input":{"type":"object","properties":{"text":{"type":"string"}},
        "required":["text"],"additionalProperties":false},
      "output":{"type":"object","properties":{"words":{"type":"integer"}},
        "required":["words"],"additionalProperties":false}}}}
}}
```

`protocolVersion` MUST be one of the offered versions. `manifest` MUST satisfy SPEC.md §4.
The host then validates the manifest, compares its `sha256` with the operator pin, and only
then registers the adapter. Errors: `-32002` (no shared MAJOR), `-32602` (malformed params),
`-32603` (the plugin could not start).

## 3 · `upp.capabilities` — request/response

```json
{"jsonrpc":"2.0","id":2,"method":"upp.capabilities","params":{}}
{"jsonrpc":"2.0","id":2,"result":{"capabilities":{"count-words":{…}}}}
```

The same shape as `manifest.capabilities`. It exists separately so a host can re-read the
set without re-initializing, and so a conformance runner can compare the two answers. The
host MUST treat a `capabilities` set that is not a subset of the initialize manifest's as a
protocol violation: the pinned manifest is the authority, not a later message.

## 4 · `upp.execute` — request/response

```json
{"jsonrpc":"2.0","id":3,"method":"upp.execute","params":{
  "capability":"count-words",
  "input":{"text":"one two three"},
  "deadlineMs":2000
}}
{"jsonrpc":"2.0","id":3,"result":{"output":{"words":3}}}
```

| Param | Req. | Meaning |
|---|---|---|
| `capability` | **yes** | a capability id present in the pinned manifest |
| `input` | **yes** | already validated host-side against the capability's `input` schema |
| `deadlineMs` | no | integer ≥ 0, advisory (SPEC.md §8). Absent means "no deadline was propagated", never "no deadline exists" |

What the host has **already** done before this message exists: located the capability,
validated `input`, and — if `consequential` — obtained a human verdict. A denied
consequential call produces **no message at all**; that is the observable property
(`ACCEPTANCE.md` U20). On the response the host validates `output` against the declared
schema, so `OUTPUT_INVALID` remains possible even for a perfectly framed answer.

Error example, and the containment rule in one object:

```json
{"jsonrpc":"2.0","id":3,"error":{"code":-32001,
  "message":"no document with id \"x\"",
  "data":{"code":"NOT_FOUND","details":[{"path":"id","message":"unknown"}]}}}
```

`data.code` is honoured **only** when it is `NOT_FOUND` or `INPUT_INVALID`
(`PASSTHROUGH_CODES`, `eip/sdk/errors.mjs:77`). Any other value is discarded and the caller
sees `PLUGIN_ERROR`. `data.details` MUST be an array of `{path, message}`. A stack MUST NOT
appear anywhere in the object.

## 5 · `upp.cancel` — notification

```json
{"jsonrpc":"2.0","method":"upp.cancel","params":{"id":3}}
```

Best effort, no answer, no acknowledgement. The plugin SHOULD stop and answer the cancelled
request with `-32005 CANCELLED`; it MAY answer normally if the work already finished; it MAY
ignore the notification entirely. The caller's result does not depend on which: the host
answers `CANCELLED` and retires the id. Cancelling an unknown or settled id is a no-op, not
an error — a race between a cancel and a response is normal, not a fault.

## 6 · `upp.health` — request/response

```json
{"jsonrpc":"2.0","id":4,"method":"upp.health","params":{}}
{"jsonrpc":"2.0","id":4,"result":{"status":"ok","detail":"optional, human-readable"}}
```

`status` ∈ `"ok"` · `"degraded"` · `"unhealthy"`. `degraded` and `unhealthy` both move the
plugin to the **unhealthy** state (SPEC.md §6): the distinction is for the operator's log,
not for dispatch, because "partly broken" is not a safe basis for choosing to call something.
A probe that times out counts as `unhealthy`. For `runtime: "http"` the host MAY use
`GET <baseUrl><health.path>` instead; the body is the same `{status, detail?}` object.

## 7 · `upp.shutdown` — request/response · `upp.exit` — notification

```json
{"jsonrpc":"2.0","id":5,"method":"upp.shutdown","params":{}}
{"jsonrpc":"2.0","id":5,"result":{}}
{"jsonrpc":"2.0","method":"upp.exit"}
```

`upp.shutdown` moves the plugin to **draining**: in-flight requests may finish, a new
`upp.execute` answers `-32008 SHUTTING_DOWN`. After the response — or after
`lifecycle.shutdownTimeoutMs`, whichever comes first — the host sends `upp.exit` and the
plugin MUST exit with status 0 without writing another message. Two steps rather than one
because a plugin that exits inside its own response handler cannot report that it failed to
clean up, and the inverse of a registration is the thing that must not be silent. If the
process is still alive after `shutdownTimeoutMs`, the host terminates it (`SIGTERM`, then
kill) so the kernel's `dispose` leaves zero residue.

## 8 · Error codes

JSON-RPC standard codes keep their meaning; UPP codes live in the reserved server-error range
`-32000..-32099`. Every row carries `error.data.code`, a **kernel `CODE`** from the closed
list in `eip/sdk/errors.mjs:5-22` — **no new architecture code is introduced**, which is why
`PLUGIN_UNAVAILABLE` is a transport fact mapped onto `PLUGIN_ERROR` rather than a 15th code.

| JSON-RPC | Name | `data.code` | Raised when |
|---|---|---|---|
| `-32700` | Parse error | `PLUGIN_ERROR` | a line is not valid JSON (either direction) |
| `-32600` | Invalid request | `CONTRACT_INVALID` | not a JSON-RPC 2.0 object; or a batch array |
| `-32601` | Method not found | `CONTRACT_INVALID` | an unknown `upp.*` method |
| `-32602` | Invalid params | `INPUT_INVALID` | params fail the method's schema |
| `-32603` | Internal error | `PLUGIN_ERROR` | an uncontained fault inside the plugin |
| `-32000` | PLUGIN_FAULT | `PLUGIN_ERROR` | the capability threw |
| `-32001` | CAPABILITY_NOT_FOUND | `NOT_FOUND` | no such capability id |
| `-32002` | UNSUPPORTED_PROTOCOL_VERSION | `CONTRACT_INVALID` | no shared MAJOR (SPEC.md §5) |
| `-32003` | PLUGIN_UNAVAILABLE | `PLUGIN_ERROR` | transport dead, crashed, unreachable, or the id was retired |
| `-32004` | TIMEOUT | `TIMEOUT` | the plugin hit `deadlineMs` first |
| `-32005` | CANCELLED | `CANCELLED` | the plugin honoured `upp.cancel` |
| `-32006` | PAYLOAD_TOO_LARGE | `INPUT_INVALID` | a message exceeds the limit (SPEC.md §9) |
| `-32007` | NOT_INITIALIZED | `CONTRACT_INVALID` | a method arrived before `upp.initialize` |
| `-32008` | SHUTTING_DOWN | `CANCELLED` | an `execute` arrived while draining |
| `-32010` | CAPABILITY_NOT_AUTHORIZED | `PERMISSION_DENIED` | **host-side**: the capability is absent from the pinned manifest or the operator config |

`-32009` and the rest of `-32011..-32099` are **unassigned** and reserved for a later MINOR.
A host receiving an unassigned code in range MUST treat it as `PLUGIN_ERROR` rather than
guessing, and MUST record the raw integer on the `error` event so the gap is visible.

## 9 · Transport framing, in one place

| Transport | Framing | Notes |
|---|---|---|
| `in-process` | none — the message objects are passed directly | the compat path for existing `definePlugin` plugins; no serialisation, no 1 MiB limit, and no new failure mode |
| `process` | **NDJSON** on stdin/stdout: one UTF-8 JSON value per line, `\n` terminated, ≤ 1 MiB per line | `stdout` is **protocol only** — a plugin that prints anything else has violated the protocol. `stderr` is diagnostics only and is never parsed |
| `http` | one JSON-RPC object per `POST <baseUrl>/upp`, `Content-Type: application/json` | a notification is answered `204` with an empty body; a request is answered `200` with the response object, including when it carries `error`. Transport-level status codes other than `200`/`204` become `-32003` |
