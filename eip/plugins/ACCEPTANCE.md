# Acceptance criteria — EIP plugins + dev UI (S2-6)

Declared BEFORE the implementation existed. The question is **"how do we verify
a plugin is really a plugin?"** — not "does the function return a number?".

A plugin "works" when four things hold: it provides exactly the key and the
contract it declares, an impossible composition refuses to load, unloading
leaves nothing behind, and the domain answer is right on realistic text. A
consequential capability adds a fifth: it cannot happen without a human
decision.

Two plugins are delivered: `text.stats` (two non-consequential capabilities,
plus a dev UI fragment) and `text.report` (requires `text.stats`, writes through
a host `writeFile` **port**, `save-report` is consequential).

**Where the tests live.** `eip/plugins/<name>/` may import only the SDK, its own
directory and `examples/text-stats/src/` (boundary gate). A contract test needs
a kernel, so it is a **composition**, not a plugin: it lives one level up, in
`eip/plugins/*.test.mjs`, which the plugin rule does not govern. The plugin
directories stay importable by any host, with no test-only kernel edge.

| # | Criterion | Expected result | Proven by | Red without the fix |
|---|---|---|---|---|
| T1 | P1 — the plugin provides the key it declares | after `load`, `execute` answers both `text.stats` capabilities; `list()` shows `inject` exactly `{}` for `text.stats` and `{'text.stats':{required:true}}` for `text.report`; `permissions` exactly `['fs.write']` | `contract.test.mjs` · "T1" | inject/permission drift; a capability declared but not implemented ⇒ `CONTRACT_INVALID` |
| T2 | P2 — an impossible composition fails LOUD at load | `text.report` without the `writeFile` port ⇒ `load` throws `PLUGIN_ERROR` naming `writeFile`, and `isLoaded('text.report')` stays `false`; a port offered under `fs.read` is **invisible** and fails the same way; `defaultWpm: 5000` ⇒ `INPUT_INVALID` with path `config.defaultWpm` | `contract.test.mjs` · "T2" | a writer loads with no writer: `save-report` would accept work and write nothing |
| T3 | P3 — unloading leaves zero residue | `dispose('text.stats')` runs the inverse (the memo cache is empty afterwards, observed through the retained service handle); reload works and still answers; disposing the CONSUMER leaves `text.stats` loaded and callable; disposing the provider first ⇒ `DEPENDENCY_IN_USE` | `contract.test.mjs` · "T3" | leftover cache; a reload that throws `DUPLICATE_KEY`; a consumer left holding a disposed provider |
| T4 | The sibling is reached by CONTRACT, at call time | `text.report` loaded BEFORE `text.stats` still works; with `text.stats` registered but not loaded, `save-report` fails `PLUGIN_ERROR` whose `details[0].path` is `DEPENDENCY_MISSING`, and nothing is written | `contract.test.mjs` · "T4" | eager resolution ⇒ load order becomes significant |
| T5 | Domain results are right on realistic text | a 69-word paragraph ⇒ `{words: 69}`; `reading-time` at `wpm: 50` ⇒ 2 minutes, default 200 ⇒ 1; empty text ⇒ 0 words and 0 minutes; `maxLength` 100000 and `wpm` 50..1000 are enforced as `INPUT_INVALID` | `domain.test.mjs` · "T5" | an off-by-one in rounding; an unbounded input |
| T6 | `save-report` cannot happen without a human decision | no approver ⇒ `APPROVAL_REQUIRED` **and the file does not exist**; approver returning `{approved:false}` ⇒ `APPROVAL_DENIED`, still no file; with approval ⇒ `{path:'<name>.json', words, minutes}` and the file holds that JSON | `domain.test.mjs` · "T6" | a report written without consent |
| T7 | A name that is not pattern-safe never reaches the filesystem | `../escape`, `a/b`, `UPPER` ⇒ `PLUGIN_ERROR` with `details[0].path === 'INPUT_INVALID'`, before the port is called (the port log stays empty) | `domain.test.mjs` · "T7" | path traversal reaches the port and depends on the host to catch it |
| T8 | The dev UI is static, same-origin and free of inline handlers | the fragment contains no `<script`, no `on*=` attribute, no `http://`/`https://` URL and no `javascript:`; every `fetch` target is a relative `/api/v1/...` path | `domain.test.mjs` · "T8" | a third-party script or an inline handler in a page served with a strict CSP |

`pattern` is **not** in the SDK schema subset (T7), by design: the subset is the
whole contract vocabulary. So `save-report` validates the name itself and raises
a named `KernelError('INPUT_INVALID')`, which the kernel contains as
`PLUGIN_ERROR` carrying the code in `details[0].path` — a plugin may not forge a
kernel-level code. The host's path-confined port rejects traversal independently
(S2-7): two guards, neither trusting the other.

## Verdict (mutation proof)

Each row: the guard was broken, the suite was run, the red was observed, the
code was restored, the suite returned green. Baseline: **17 tests, 17 pass**;
every mutation below was reverted and the suite returned to 17/17.

| Criterion | Mutation applied | Observed red (17 tests) |
|---|---|---|
| T7 | `text-report/index.mjs` · the `assertSafeName(name)` call commented out | 1 fail — `T7 a name that is not pattern-safe never reaches the port`: `"../escape" should be refused` (the call returned `ok:true` and the port log held `../escape.json`) |
| T3 | `text-stats/index.mjs` · the `ctx.onDispose(() => cache.clear())` registration removed | 1 fail — `T3 P3 — dispose runs the inverse, leaves zero residue, and reload works`: `the inverse effect must clear the cache` (cache size 1 after dispose) |
| T2 | `text-report/index.mjs` · the mandatory-port guard in `apply` removed | 2 fails — `T2 P2 — a missing write port fails loud at load…` and `T2 P2 — a port offered under an undeclared permission is invisible`, both `Missing expected rejection` (a writer with no writer loaded happily) |
| T4 | `text-report/index.mjs` · `ctx.get('text.stats')` moved into `apply` and cached in a closure | 2 fails — `T4 the sibling is resolved at CALL time, not at apply` and `T4 a required sibling that is registered but not loaded fails by code, writing nothing` (load order became significant again) |

False-green watch: every negative assertion names the exact `error.code` (and,
where the kernel contains a named plugin error, `details[0].path`), so no
mutation can pass by "it threw something". `APPROVAL_REQUIRED` and
`APPROVAL_DENIED` are kept apart for the same reason.
