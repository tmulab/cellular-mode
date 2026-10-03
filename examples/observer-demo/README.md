# Example — a vault the observer can read

A small, invented, **public** project (a note-taking library) recorded with the
Cellular Mode protocol. It exists so the observer has something real to read that is
not anyone's private repository, and so its tests assert on a fixture whose shape is
written down.

Nothing here is hand-written. `vault/state/` is the output of replaying
[`script.mjs`](script.mjs) with the real CLI under a fixed clock:

```
node examples/observer-demo/reproduce.mjs           # verify: exit 0 identical, 1 drifted
node examples/observer-demo/reproduce.mjs --write   # regenerate the committed vault
```

## What it deliberately contains

| State | Cell | Why it is here |
|---|---|---|
| ✔ done | `note-storage` | Opened and finished in one sitting; declares no dependency, so it is layer 0 of the graph. |
| ⏸ paused | `markdown-parser` | Planned, promoted to 🔵, then interrupted with the tests red. |
| 📋 planned | `search-index` | Never opened, so it has **no log entry** — a planned cell never ran. |
| 🔵 active | `tag-filter` | The one active cell, with **two** declared dependencies. |

Declared dependencies (`**Dependencies:**`, written by `cellmode --deps`):

```
note-storage      -> (none)
markdown-parser   -> note-storage
search-index      -> markdown-parser, full-text-engine     <- dangling
tag-filter        -> note-storage, markdown-parser
```

`full-text-engine` is **not** a cell of this project. That is the point: a declared
dependency on something that does not exist is reported as *dangling* and is never
invented into existence as a node. Undeclared means no edge — nothing in this project
infers a relation between two cells from prose, an area name or a timestamp.

The resulting graph is three layers deep (`note-storage` → `markdown-parser` →
{`search-index`, `tag-filter`}), which is enough to see that the layer of a node is
the longest declared dependency path and not its position in a list.

## Reading it with the observer

`observer.state` is an optional plugin on the EIP host. Composed over this directory,
it publishes the vault as structured data:

```js
import { createHost } from '../../eip/host/index.mjs';
import { observerComposition } from '../../eip/host/observer-composition.mjs';

const host = await createHost(observerComposition({ root: 'examples/observer-demo' }));
const { url } = await host.listen(0);
// POST {url}/api/v1/plugins/observer.state/capabilities/overview  {"input":{}}
```

The plugin gets `fs.read` and nothing else, confined to `<root>/vault/state`. It never
writes, and no response carries a filesystem path. Delete the plugin and this example
is still a valid vault: the observer is a reader, not part of the method.
