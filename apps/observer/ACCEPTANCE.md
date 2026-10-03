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
| D14 | AUDIT and ADVISOR are declared, not faked | both areas exist, name their capability key (`observer.audit`, `observer.advisor`), and an area whose plugin is not in the build states `not available in this build`; neither renders invented content. **Stage 3 Cell 2:** the AUDIT area is real (D18, D19). **Stage 3 Cell 3:** the ADVISOR area is real too (D20) and, when the plugin is not in the composition, states `Advisor disabled (optional). Observer and Auditor work without it.` beside the probe's own wording |
| D18 | The AUDIT area renders verdicts, not a mood | one tile per status with every status present (a zero count is shown, not omitted); one row per finding carrying its evidence lines, its explanation and its suggested action; filters by status and by scope, both clearable; the area is labelled DETERMINISTIC in the markup |
| D19 | UNAVAILABLE is never rendered as PASS | the five verdicts differ in WORD, SYMBOL and tone, not in colour alone; UNAVAILABLE additionally carries a dashed outline; a status this build does not recognise is treated as unavailable, never as a pass; the `run audit` button calls the read-only `run-audit` capability and the auditor performs no suggested action |
| D20 | The ADVISOR area is visibly not a measurement | the area is `data-origin="ai"` before anything loads and carries the banner `AI-generated interpretation — not a verification`; each recommendation shows a LABEL badge (word + symbol + meaning), its uncertainty and its evidence references, with `cell:` references navigable and everything else shown as the address it is; an unrecognised label is treated as UNKNOWN, never as VERIFIED; a downgrade, a rejection, a removed reference and a dropped context item are each stated; the adapter is named with its network status; `status` is the only call made on load, and every statement is set with `textContent` |
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
| one byte of `three.core.min.js` changed | D1 |
| `statusMark()` falls back to the PASS mark for an unknown verdict | D19 |
| a summary tile whose count is zero is dropped from `summaryTiles()` | D18 |
| `labelMark()` falls back to the VERIFIED badge for an unrecognised label | D20 |
| the advisor area assigns a statement with `innerHTML` | D20 |

## Human review (declared, not hidden)

Everything a browser does: paint, hover, drag, orbit, label collision, 320 px layout,
contrast perceived by a tired eye, 500-node responsiveness. See `MANUAL-CHECKS.md`.
