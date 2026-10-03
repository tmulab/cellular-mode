# Acceptance criteria — Observer frontend (`apps/observer/`)

Written BEFORE the implementation, as the constitution requires. Each criterion names
the mechanism it protects and the mutation that must turn it red; a criterion with two
mechanisms gets two mutations (the lesson the original dashboard recorded: a red test
named after a criterion is not a red test on the mechanism).

Scope: the local application — static server, `/api` reverse proxy, launcher, pure
view-model and the browser modules ported from the original dashboard. The backend
plugin `observer.state` is a different cell; this app consumes the contract and nothing
else. Rendering by a real browser is NOT machine-verifiable here: it lives in
`MANUAL-CHECKS.md` and is declared NOT YET PERFORMED.

## Machine-verified

| # | Criterion | Mechanism |
|---|---|---|
| D1 | `three@0.180.0` is vendored byte-identically | SHA-256 of both builds equals the pin; `LICENSE` (MIT) sits beside them; the vendor directory holds exactly the four declared files |
| D2 | The static server serves an explicit allowlist and nothing else | unknown path → 404; `..`, encoded `..`, backslash and absolute-looking paths → 404; a directory path → 404 with no listing; no served path is produced by joining URL text onto a directory |
| D3 | Every response carries the same strict headers | exact CSP string (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, `img-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`); `nosniff`; `no-referrer`; `DENY`; **no** `Access-Control-Allow-*` header anywhere |
| D4 | The proxy forwards only the host API | `/api/v1/...` is forwarded with method and JSON body intact; any other `/api/...` path → 404 and no upstream request; a body over the limit → 413; a silent upstream → 504 |
| D5 | The app is loopback-only | the listener binds `127.0.0.1`; the module exports no option and the CLI no flag that can change the bind address |
| D6 | Offline for real | no served asset (HTML, CSS, module, fixture) contains an external URL |
| D7 | English only | no Portuguese prose anywhere under `apps/observer/` (repository heuristic) |
| D8 | The view-model never invents | `null` renders as the literal `not recorded`; a status maps to a `{shape, label}` pair so states differ by shape and text, not colour alone; an unknown status is reported as unknown, never defaulted to a known one |
| D9 | One selection state machine, two paintings | neighbours, focus, detail request and clear live in one DOM-free module that both the 2D and the 3D view import; neither view owns a second copy |
| D10 | The 2D projection draws the server's model | node positions come from the `graph` payload (no layout arithmetic in the browser); edges only from declared dependencies; dangling edges marked as dangling; above the level-of-detail threshold labels are dropped, nodes are not |
| D11 | The textual alternative is complete | the cells table carries every `CellSummary` field for every cell and is reachable by keyboard |
| D12 | The cell detail panel shows every contract field | all fields of `cell-detail`, with `not recorded` for each null, plus the `unavailable` list |
| D13 | The timeline is honest about what the protocol records | events render from the payload; the note `open/resume not recorded by the protocol` is always present |
| D14 | AUDIT and ADVISOR are declared, not faked | both areas exist, name their capability key (`observer.audit`, `observer.advisor`), and an area whose plugin is not in the build states `not available in this build`; neither renders invented content. **Stage 3 Cell 2:** the AUDIT area is real (D18, D19). **Stage 3 Cell 3:** the ADVISOR area is real too (D20) and, when the plugin is not in the composition, states `Advisor disabled (optional). Observer and Auditor work without it.` beside the probe's own wording — **superseded for the not-listed case by D23**, where the sentence stands alone because no probe is made |
| D18 | The AUDIT area renders verdicts, not a mood | one tile per status with every status present (a zero count is shown, not omitted); one row per finding carrying its evidence lines, its explanation and its suggested action; filters by status and by scope, both clearable; the area is labelled DETERMINISTIC in the markup |
| D19 | UNAVAILABLE is never rendered as PASS | the five verdicts differ in WORD, SYMBOL and tone, not in colour alone; UNAVAILABLE additionally carries a dashed outline; a status this build does not recognise is treated as unavailable, never as a pass; the `run audit` button calls the read-only `run-audit` capability and the auditor performs no suggested action |
| D20 | The ADVISOR area is visibly not a measurement | the area is `data-origin="ai"` before anything loads and carries the banner `AI-generated interpretation — not a verification`; each recommendation shows a LABEL badge (word + symbol + meaning), its uncertainty and its evidence references, with `cell:` references navigable and everything else shown as the address it is; an unrecognised label is treated as UNKNOWN, never as VERIFIED; a downgrade, a rejection, a removed reference and a dropped context item are each stated; the adapter is named with its network status; `status` is the only call made on load, and every statement is set with `textContent` |
| D21 | An intentionally empty next step reads as a fact, not as a gap | `nextStepState: 'none'` (a completed cell, or a logged completion) renders as `None — cell completed` and is marked RECORDED; `'not-recorded'` keeps the literal `not recorded` and the absent styling; the cells table, the detail panel and the timeline all read the same state, and a payload without the field is read exactly as before |
| D22 | The 2D graph is FRAMED on arrival, and a label is legible at every scale | the initial view is the SAME deterministic fit the `fit` control applies — bounds of the nodes **and their labels**, padding kept clear on every side, one aspect-correct scale, centred, never magnified past a maximum; a node label renders at a constant CSS size (12 px, never below the 11 px floor) whatever the drawing's scale is, and keeps a constant gap below its glyph; the level-of-detail threshold still drops every label above `LABEL_LIMIT`, so the 500-cell case is unchanged |
| D23 | An intentionally disabled advisor is a configuration fact, not a diagnostic | the host's own plugin list (`health.plugins`) decides: a key that is NOT listed is not called at all and the area renders only `Advisor disabled (optional). Observer and Auditor work without it.` — no probe, no error box, no `NOT_FOUND`; a key that IS listed and then refuses keeps its error exactly as before; a list that could not be read is UNKNOWN and is probed, never assumed empty. The not-listed case has its own state `disabled`, styled in neutral text (`.probe-disabled`), while a real failure (`absent`) keeps the alerting colour |
| D24 | An optional declared mode is presentation only, and never hides a verdict | the `--adaptive` flag is off by default: without it `adaptive.preferences` is not in the build, the host's plugin list does not name it, the page shows **no badge** and the `observer.*` answers are **byte-identical** with the flag and without it. With it: only an **active** declaration presents (expired, invalid, absent and disabled are all `ready`); the badge is **read-only** with no selector, no button and no form, because the capability has no setter at all; an answer this build cannot read is read as **no declaration**, which is today's behaviour exactly. **The invariant:** every `FAIL` and every finding of a named security rule (`secrets`, `deps`, `import-boundaries`) is shown in full, un-capped and not deferred, under **every** mode — proved for all four modes over a mixed list and over a 500-finding list. What is shown in full is a tested **superset** of that invariant: a `WARNING` is shown too, because something wrong that is not a gate breach is not the saving a tired reader needs. A mode may reorder, and may defer the tail of what is merely informative behind a `show all` control that states how many items it would add |
| D15 | One source of colour, and it is legible | the CSS custom properties equal `view/tokens.mjs` value for value; text and status colours reach 4.5:1 against the background and graphic tokens reach 3:1 (computed sRGB luminance, not estimated); exactly one accent hue outside the status palette and the neutrals |
| D16 | Browser code is type-checked | `npm run typecheck` runs both configurations; the browser configuration uses `lib: DOM + ES2023` with the same four strict flags; the three.js subset is declared by hand, with no `@types/three` dependency |
| D17 | 3D is optional and secondary | the 2D view is the default; the 3D modules are imported only when the toggle asks for them; no 3D module computes a node position |

## Mutations that must turn a specific criterion red

| Mutation | Must fail |
|---|---|
| allowlist lookup falls back to joining the URL onto the asset directory | D2 (traversal) |
| `object-src 'none'` removed from the CSP | D3 |
| proxy accepts any `/api/` prefix instead of `/api/v1/` | D4 |
| `notRecorded()` returns an empty string instead of `not recorded` | D8 |
| `nextStepField()` maps `'none'` back to `not recorded` | D21 |
| one byte of `three.core.min.js` changed | D1 |
| `statusMark()` falls back to the PASS mark for an unknown verdict | D19 |
| a summary tile whose count is zero is dropped from `summaryTiles()` | D18 |
| `labelMark()` falls back to the VERIFIED badge for an unrecognised label | D20 |
| the advisor area assigns a statement with `innerHTML` | D20 |
| `fitTransform()` returns the identity instead of the computed scale and offset | D22 |
| `labelTransform()` returns scale 1, so labels ride the drawing down | D22 |
| `advisorAreaState()` probes a capability the host does not list | D23 |
| `advisorAreaState()` hides a listed plugin's refusal inside the disabled state | D23 |
| `pluginKeys()` returns `[]` instead of `null` for an answer carrying no list | D23 |
| `.probe-disabled` styled with a status hue, or the not-listed case returned as `absent` (lead, 2026-10-03; both observed red) | D23 |
| `isAlwaysShown()` stops treating a security rule as mandatory (observed red, 2026-10-03) | D24 (invariant) |
| `capFindings()` caps the list without exempting the always-shown rows (observed red) | D24 (invariant) |
| `presentationMode()` honours an `expired` standing as if it were active (observed red) | D24 |
| `readCurrent()` accepts a mode this build does not know instead of answering NO_DECLARATION | D24 |
| `observerComposition()` creates the `.cellular/adaptive` port for every composition | AD31 (`tools/adaptive/ACCEPTANCE-INTEGRATION.md`) |

## Human review (declared, not hidden)

Everything a browser does: paint, hover, drag, orbit, label collision, 320 px layout,
contrast perceived by a tired eye, 500-node responsiveness. See `MANUAL-CHECKS.md`.
