# EIP SDK — the plugin contract

Everything is a plugin: there is **no privileged core**. The kernel is not a
master, it is the piece that checks contracts and does the wiring. Anything a
plugin could do, the kernel does not do.

A plugin imports **only** from this SDK. Never from `eip/kernel` (that would
invert the dependency), and never from a sibling plugin's implementation —
siblings are known by **contract**, through `inject`.

## The manifest

```js
import { definePlugin } from '../sdk/index.mjs';

export default definePlugin({
  name: 'report.archive',            // the name IS the key this plugin provides
  version: '0.4.1',                  // semver
  sdk: '1',                          // must equal SDK_VERSION
  description: 'Writes metric snapshots through a host-provided write port.',
  inject: { 'metrics.collector': { required: true } },  // SIBLING KEYS ONLY
  permissions: ['fs.write'],         // from the closed list below
  config: { type: 'object', properties: { prefix: { type: 'string' } },
            required: ['prefix'], additionalProperties: false },
  capabilities: {
    'store-snapshot': {
      description: 'Persist the current totals.',
      consequential: true,           // it leaves a trace in the world
      input:  { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      output: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  apply(ctx, config) { return { 'store-snapshot': async (input) => { /* ... */ } }; },
  devUi: { title: 'Archive', html: '<form>…</form>' },   // optional, ≤ 64KB
});
```

`definePlugin` validates at module load and returns a **frozen** manifest, or
throws `ContractError` (`code: 'CONTRACT_INVALID'`) with every breach listed as
`{path, message}`. A declaration that can change later is not a contract.

### inject vs. PORTS — the line that keeps plugins portable

| | What it is | How it arrives |
|---|---|---|
| `inject` | a **sibling capability key** in the same composition | resolved by the kernel, lazily |
| **port** | infrastructure, a secret, a process, the outside world | in `config`/`ports`, from the **host** |

A port never enters through `inject`. The plugin knows *how*; the composition
brings *what*. The practical consequence is a rule with teeth:
**keys degrade, ports fail loud.** An optional sibling that is absent means
`ctx.get` returns `undefined` and the plugin keeps working in a reduced mode; a
mandatory port that is absent means `apply` must refuse to load, because a
writer that accepts work and writes nothing is worse than one that says no.

### Permissions (closed list, least privilege)

`fs.read` · `fs.write` · `net.outbound` · `process.spawn` · `clock` · `random`

A host passes ports as `{ name: { permission, fn } }`. The plugin receives only
the ports whose `permission` it declared — an undeclared port is **invisible**,
not merely refused at call time: there is no handle to misuse. A port naming a
permission the architecture does not know is `PERMISSION_DENIED` at load.

> ⚠️ **TRUSTED LOCAL PLUGINS ONLY — permissions are a contract, not a security
> sandbox.** Plugins run in-process with the full privileges of the Node process.
> The permission list governs *what the composition hands over*; it cannot stop a
> plugin from calling `node:fs` directly and ignoring every port it was granted.
> Treat plugin code as trusted first-party code: do not load a plugin you would
> not read. Untrusted or third-party plugins must not be executed without
> appropriate isolation, which does not exist here — see
> [`SECURITY.md`](../../SECURITY.md) and `docs/09-architecture.md` §9.

## The context given to `apply(ctx, config)`

| Member | Meaning |
|---|---|
| `ctx.key` | this plugin's own key |
| `ctx.config` | the validated config |
| `ctx.ports` | frozen map of **granted** ports, `name -> fn` |
| `ctx.get(key)` | the sibling service, resolved at **CALL** time |
| `ctx.onDispose(fn)` | register the inverse of an effect |
| `ctx.emit(detail)` | a `plugin` event for the host's observability |

`apply` returns the service object implementing the declared capabilities (it
may be async). Every effect it creates must be registered with `onDispose`:
**registrations are reversible effects**, and teardown is a structural property,
not a matter of discipline.

Capabilities are called as `fn(input, { signal, key, cap })`. A long capability
should honour `signal` so cancellation and deadlines are real.

## Schema subset

`type` (`string` `number` `integer` `boolean` `object` `array` `null`) ·
`properties` · `required` · `additionalProperties: false` · `items` · `enum` ·
`minLength` · `maxLength` · `minimum` · `maximum` · `maxItems`.

Nothing else. A schema using any other keyword is itself a contract error, so
two plugins cannot disagree about a shape through a keyword only one of them
understands. Validation errors are always `{path, message}`.

## Error codes

`CONTRACT_INVALID` · `DUPLICATE_KEY` · `NOT_FOUND` · `DEPENDENCY_MISSING` ·
`DEPENDENCY_CYCLE` · `INPUT_INVALID` · `OUTPUT_INVALID` · `APPROVAL_REQUIRED` ·
`APPROVAL_DENIED` · `PERMISSION_DENIED` · `CANCELLED` · `TIMEOUT` ·
`PLUGIN_ERROR`, plus one kernel extension: **`DEPENDENCY_IN_USE`** (dispose is
refused while a loaded plugin declares the key as required).

`KernelError` carries `code` and structured `details`; `toResult()` gives
`{ok:false, error:{code, message, details?}}` — **never a stack**. A stack is
diagnostics for the host, and travels only on the `error` event.

### What a plugin may answer by throwing: `PASSTHROUGH_CODES`

A plugin that throws is normally CONTAINED: `execute` answers `PLUGIN_ERROR` and the
thrown code survives only as `details[0].path`. Two codes are exempt, and they are
declared as a closed set — `PASSTHROUGH_CODES = ['NOT_FOUND', 'INPUT_INVALID']`:

```js
throw new KernelError('NOT_FOUND', `no cell with id "${id}"`, [{ path: 'id', message: 'unknown' }]);
// -> execute(): {ok:false, error:{code:'NOT_FOUND', message:'no cell with id "x"', details:[...]}}
// -> host:      404  (INPUT_INVALID -> 400, by the existing STATUS_BY_CODE table)
```

Both are **client errors**: only the plugin knows whether an id names anything, so
answering an unknown id as `PLUGIN_ERROR` would make the server at fault for the
question the client asked. The message and `details` are preserved, no stack travels,
and no `error` event is raised — nothing faulted.

Everything else stays contained, *including a `KernelError` naming any other code*.
`APPROVAL_REQUIRED`, `APPROVAL_DENIED` and `PERMISSION_DENIED` are **authority**: the
host grants them, and a plugin that could throw them and be believed could claim a
human had decided something. `passthroughOf(cause)` is the pure predicate, and
`eip/kernel/containment.test.mjs` proves the forgery case for every other code in
`CODES`.

## Public surface

`SDK_VERSION` · `definePlugin` · `validateManifest` · `describeManifest` ·
`validateSchema` · `validateValue` · `check` · `KernelError` · `ContractError` ·
`isKernelError` · `CODES` · `PASSTHROUGH_CODES` · `passthroughOf` ·
`PERMISSIONS` · `KEY_PATTERN` ·
`CAPABILITY_ID_PATTERN` · `MAX_DEV_UI_BYTES` · `SCHEMA_KEYWORDS` ·
`SCHEMA_TYPES`.
