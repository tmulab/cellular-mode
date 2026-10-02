# key-audit

Audits a markdown **key map** against the source code that is supposed to
implement it. Zero dependencies, Node built-ins only.
Status: **optional tool**, ported from the original Modo Celular toolkit.

## The three-bucket principle

An ad-hoc scan for `name: 'key'` undercounts, and the temptation is to fold the
near-misses into the implemented count. This tool refuses to. Three buckets:

1. **named** — a literal `name: 'key'` (or `'key:variant'`) exists in a source
   file. A verifiable fact, reported with the matched text as evidence.
2. **proseOnly** — the key appears in the sources, but only in prose or
   comments. **Requires human reading**; *never* counted as implemented.
3. **absent** — the key appears nowhere, and is listed by name.

The result has **no `total` field**, by design: whoever wants a single number
must choose which one and own the choice. A count that rounds in its own favour
is worse than no count, because it looks like an audit.

## Map format

The audit reads the backticked first column of markdown table rows. Keys are
`domain.name`; a first cell with no dot (package rows, `domain-name`) is ignored.

```markdown
| Key            | Provides     | Owner |
| -------------- | ------------ | ----- |
| `shop.cart`    | cart service | shop  |
| `shop.pricing` | price rules  | shop  |
| `shop-package` | `shop.cart`  |       |
```

`keysFromMap`, `classify` and `report` in `key-audit.mjs` are pure (text, not
paths); disk access lives only in `cli.mjs`.

## Usage

```sh
node tools/key-audit/cli.mjs [--root dir] [--map path] [--src glob-ish dir] \
                             [--ext .ts,.js] [--prefix regex]
```

- `--root` (default: current directory) — project root; other paths are relative to it.
- `--map` (default: `contracts/key-map.md`) — the key map markdown.
- `--src` (default: `packages/*/src/**`) — source dirs; `*` = one segment, `**` = any depth.
- `--ext` (default: `.ts`) — comma-separated file extensions to read.
- `--prefix` (default: `[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*`) — **regex source**, not a
  literal string, for a declared key: narrow the audit with e.g. `(?:shop|billing)\.[a-z-]+`.

## Exit codes

- `0` — every declared key has a named implementation
- `1` — usage or I/O error (clear message, never a raw stack)
- `2` — at least one key is prose-only or absent

Exit `2` is a **change from the original**, which always exited `0`. It makes the
audit usable as a CI gate; run it with `|| true` if you only want the report.
Tests: `node --test tools/key-audit/*.test.mjs`
