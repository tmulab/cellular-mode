"""The UPP 1.0 conformance reference plugin, in Python 3, standard library only.

A translation of examples/upp-node/plugin.mjs. It imports nothing outside the standard
library (json, sys) and nothing at all from this repository: an implementation that shared
code with the host testing it would prove the two agree with themselves.

Usage:  python plugin.py <path-to-upp/conformance/manifest.json>
Protocol: NDJSON on stdin/stdout, one JSON-RPC 2.0 message per line. Bytes are read and
written through the binary buffers and encoded as UTF-8 explicitly, because the console
encoding of the host is not part of the protocol and on Windows it is not UTF-8.
"""

import json
import sys

PROTOCOL = "1.0"
MAX_TEXT = 4096


def send(message):
    """Write one framed message. stdout is protocol only."""
    data = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(data + b"\n")
    sys.stdout.buffer.flush()


def ok(ident, result):
    send({"jsonrpc": "2.0", "id": ident, "result": result})


def bad(ident, code, kernel_code, message):
    send({
        "jsonrpc": "2.0",
        "id": ident,
        "error": {"code": code, "message": message, "data": {"code": kernel_code}},
    })


def count_words(text):
    """Words are runs of non-whitespace."""
    return len(text.split())


def breach_of(value):
    """The declared input contract, checked by hand. Returns the breach, or None."""
    if not isinstance(value, dict):
        return "input must be an object"
    extra = sorted(k for k in value if k != "text")
    if extra:
        return "unknown input field(s): " + ", ".join(extra)
    text = value.get("text")
    if not isinstance(text, str):
        return "input.text is required and must be a string"
    if len(text) > MAX_TEXT:
        return "input.text must be at most %d characters" % MAX_TEXT
    return None


def execute(ident, params, manifest):
    capability = params.get("capability")
    if capability != "wordcount":
        return bad(ident, -32001, "NOT_FOUND", 'no capability "%s"' % (capability,))
    breach = breach_of(params.get("input"))
    if breach is not None:
        return bad(ident, -32602, "INPUT_INVALID", breach)
    return ok(ident, {"output": {"words": count_words(params["input"]["text"])}})


def dispatch(message, manifest):
    ident = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}
    if method == "upp.cancel":
        return None                      # a notification is never answered
    if method == "upp.exit":
        sys.exit(0)
    if method == "upp.initialize":
        offered = params.get("protocolVersions")
        offered = offered if isinstance(offered, list) else []
        if PROTOCOL not in offered:
            return bad(ident, -32002, "CONTRACT_INVALID",
                       "this plugin speaks %s; the host offered [%s]"
                       % (PROTOCOL, ", ".join(str(v) for v in offered)))
        return ok(ident, {"protocolVersion": PROTOCOL, "manifest": manifest})
    if method == "upp.capabilities":
        return ok(ident, {"capabilities": manifest["capabilities"]})
    if method == "upp.execute":
        return execute(ident, params, manifest)
    if method == "upp.health":
        return ok(ident, {"status": "ok"})
    if method == "upp.shutdown":
        return ok(ident, {})
    return bad(ident, -32601, "CONTRACT_INVALID", 'unknown method "%s"' % (method,))


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: python plugin.py <manifest.json>\n")
        return 2
    with open(argv[1], "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    for raw in sys.stdin.buffer:
        line = raw.decode("utf-8", "replace").strip()
        if line == "":
            continue
        try:
            message = json.loads(line)
        except ValueError:
            # The id could not be read, which is the one case JSON-RPC reserves a null id for.
            bad(None, -32700, "PLUGIN_ERROR", "the line is not valid JSON")
            continue
        dispatch(message, manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
