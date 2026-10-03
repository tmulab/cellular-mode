# Manual checks — the part no gate can perform

**Status: PERFORMED BY AUTOMATION on 2026-10-03**, driving a real browser over the Chrome
DevTools Protocol: **Microsoft Edge headless `Edg/154.0.4258.48` (HeadlessChrome/154.0.0.0)**,
viewport 1280×900 unless stated, WebGL available (ANGLE, NVIDIA RTX 4070 Laptop, D3D11). Every
PASSED line was observed in a screenshot or read out of live DOM state; nothing is ticked on
the strength of the code alone. What needs a human eye, a human ear or a physically
disconnected network is marked **LEFT FOR HUMAN** with the steps. Screenshots live in the
session scratch directory (`…\scratchpad\visual\`), outside the repository. Five defects were
found and fixed in this pass, listed at the end.

## How to start it

`node apps/observer/cli.mjs --root <a project with a vault>` — live; `--fixture` serves the
recorded fixtures, with `?source=fixture` (`&size=500` for the 500-cell demo). Fixture mode
reads no vault and says so in a banner — verified present, worded `RECORDED FIXTURE — … No
vault is being read.` (`09-500-overview.png`).

## 1 · The project area — `--root examples/observer-demo`

- [x] Counts match the table; the active cell is the largest thing. PASSED: tiles 1/1/1/1 vs
      4 rows (demo), 1 active + 26 done vs 27 rows (`--root .`); `Tag filter` at 25.6 px vs
      16 px quiet tiles. `01-project-area.png`, `01-paused-zero-quiet.png`.
- [x] Paused zero quiet, non-zero prominent. PASSED both ways: demo `paused: 1` →
      `tile strong` 25.6 px; repository vault `paused: 0` → `tile quiet` 16 px.
- [x] Warnings carry code and cell. PASSED: `dangling-dependency … — search-index`.
- [x] Recent activity newest first. PASSED: `2026-04-07 09:30` above `2026-04-06 10:20`.
- [x] Integrity. PASSED: reads `integrity: ok` in both vaults.

## 2 · The cells table (the one view that must never break)

- [x] Every cell, all seven columns. PASSED: 4 rows × `id · name · area · status · last
      visit · next step · dependencies`; 500 rows in the 500-cell fixture.
- [x] `not recorded`, italic. PASSED: 4 absent cells, computed `font-style: italic`,
      `rgb(107,116,144)` against the body text colour. `02-detail-search-index.png`.
- [x] Tab reaches each row; Enter/Space opens; the row is marked current. PASSED: a real
      Tab walk reached all four rows, Enter opened `search-index`, the row carried
      `aria-current="true"`. `08-tab1-skip-link.png`.

## 3 · The cell detail panel

- [x] Every contract field, including the empty ones. PASSED: 18 fields + 3 evidence rows,
      all 21 present. `02-detail-search-index.png`.
- [x] Unrecorded fields read `not recorded`, lighter and italic. PASSED (same shot).
- [x] `unavailable` listed separately with its explanation. PASSED: 13 names listed under
      `unavailable: … — the host could not read these, so they are not shown as values`.
- [x] `close` returns focus sensibly and clears the graph focus. PASSED **after a fix**:
      focus now returns to the row that opened the panel (was `<body>`); the caption
      returns to `overview` and the row selection is dropped.
- [x] A cell id that does not exist. PASSED: the 500-cell fixture records no details, so the
      panel shows `NOT_FOUND the fixture records no detail for "demo-cell-001"` — never
      blank, never an invented cell. `03-detail-failure.png`.

## 4 · The 2D graph

- [x] Each status is a different SHAPE. PASSED: done hexagon, paused diamond, planned
      square, active circle, unknown dashed triangle; the status column repeats the symbol
      as text (`04-greyscale-shapes.png`).
- [x] Drag moves; wheel zooms towards the cursor; `fit` returns. PASSED: drag →
      `translate(160px,90px)`; wheel → `scale(1.1)` + anchoring translate; `fit` → identity.
- [x] Clicking a node dims non-neighbours and lights its edges. PASSED on hover
      (`search-index`: `note-storage`/`tag-filter` dimmed, shared edge lit,
      `04-hover-dimming.png`); a CLICK redraws the focused SUBGRAPH, so non-neighbours are
      not drawn at all. `04-graph-focused.png`.
- [x] A click after a drag does NOT select. PASSED: after a 160 px drag the panel stayed
      hidden and nothing was dimmed.
- [x] Arrows pan, `+`/`-` zoom, `0` fits, `Esc` clears — no pointer. PASSED: arrows →
      `translate(-60px,-60px)`; `+` → `scale(1.2)`; `0` → identity; `Esc` closed the panel.
- [x] Tab reaches the node shapes; Enter selects. PASSED: all four node groups take focus
      with a 2 px accent outline, Enter opened `Note storage`. `04-node-focus-ring.png`.
- [x] A dangling dependency is not drawn, and the caption counts it. PASSED: 4 edges drawn,
      `data-dangling="1"`, caption `… 1 dangling (listed as warnings, not drawn)`.

## 5 · The 3D view (optional)

- [x] `show 3D` loads the scene; `show 2D` returns. PASSED: canvas 756×446, four labelled
      prisms; back to 2D restores the SVG. `05-3d-default.png`, `05-back-to-2d.png`.
- [x] Drag rotates, right-drag pans, wheel zooms, `R` resets. PASSED: each gesture moved
      every chip (`05-3d-b/-c/-d…`); `R` restored the start positions (`05-3d-f-R-reset`).
- [x] The two views agree on the arrangement. PASSED: the same left-to-right chain
      `Search index → Tag filter → Markdown parser → Note storage`.
- [x] Labels crisp and constant in size; no edge crosses the text. PASSED at the captured
      poses (unscaled HTML chips above the lines); a chip on the canvas edge is clipped.
- [x] Arrow keys rotate with no pointer. PASSED: `05-3d-e-arrow-rotate.png`.
- [x] three.js blocked → 2D and the table still work. PASSED **after a fix**: the panel
      keeps 2D, the caption reads `3D is not available here (TypeError: …) — showing 2D`,
      nothing is uncaught, the table still opens cells. `05-3d-blocked.png`.

## 6 · The AUDIT and ADVISOR areas

Started WITHOUT `--advisor` (`--root examples/observer-demo`):

- [x] AUDIT works. PASSED: `run audit` → 16 findings, tiles 0/4/5/1/6, each with evidence,
      explanation and suggested action. `06-noadvisor-after-run.png`.
- [x] ADVISOR says the disabled sentence, controls disabled not absent. PASSED: `Advisor
      disabled (optional). Observer and Auditor work without it. (not available in this
      build — the plugin is not installed)`; three disabled controls.

Started WITH `--advisor fixture` (`--root .`):

- [x] A different KIND of panel. PASSED: `data-origin="ai"`, dashed border on the area and
      on every recommendation, badge `AI-GENERATED`. `06-advisor-answered.png`.
- [x] It names the adapter. PASSED **after a fix**: on load it reads `adapter: fixture —
      deterministic test adapter · no network` (was `unknown adapter`).
- [x] Nothing happens until `ask the advisor`. PASSED: on load only `status` is called and
      the headline is `Nothing has been asked yet…`.
- [x] Label badge, uncertainty, references; a `cell:` reference opens that cell. PASSED:
      `[~] INFERRED` / `[>] PROPOSED` with meanings in `title`, an uncertainty line, and
      `cell:stage-3-final-validation` opening it. `06-advisor-cell-ref.png`.
- [x] Asking twice within two seconds is refused with a sentence. PASSED: `INPUT_INVALID:
      the advisor accepts one call every 2000 ms; 1151 ms left to wait`, no spinner.
- [x] Nothing readable as a measurement. PASSED: no tile, no verdict chip, no number but
      the adapter's own call budget.

## 7 · 320 px (viewport 320 × 640)

- [x] No horizontal page scrolling; the table scrolls on its own axis. PASSED: `scrollWidth
      305 ≤ innerWidth 320`, `.cells-host { overflow-x: auto }` around a 599 px table.
      `07-320-table.png`.
- [x] Every control reachable; nothing clipped. PASSED: nine controls, all inside the
      viewport, none zero-sized.
- [x] The detail panel docks to the bottom and closes. PASSED: `position: fixed`, full
      width, bottom = 640, `max-height: 460.8px`, scrollable. `07-320-detail.png`.

## 8 · Contrast and legibility

- [ ] Readable after a long day, at full and at low brightness. **LEFT FOR HUMAN**: open it
      tired, once at full and once at minimum screen brightness.
- [x] `not recorded` reads as an absence. PASSED mechanically (italic + `--tertiary`);
      whether it *reads* as absence is the human half of the line.
- [ ] One accent colour noticeable, nothing competing. **LEFT FOR HUMAN**: D15 checks the
      computed palette; the judgement is not checkable.

## 9 · 500 cells (`--fixture`, `?source=fixture&size=500`)

- [x] First paint not slow; the table complete. PASSED: `loadEventEnd` 90–97 ms, 500 rows,
      500 node shapes. `09-500-overview.png`.
- [x] Labels gone, shapes remain. PASSED: `data-labels="false"`, 0 names, 500 node groups.
- [x] Panning and zooming stay responsive. PASSED mechanically (the transform follows every
      gesture); the FEEL is LEFT FOR HUMAN.
- [x] Clicking a node reduces the view and the labels come back. PASSED: 3 nodes, 2 edges,
      `data-labels="true"`, caption `focused on demo-cell-451`. `09-500-focused.png`.

## 10 · Offline

- [x] No external request and no CSP violation. PASSED: 27 requests, all to `127.0.0.1`;
      zero `Log` entries with source `security`; CSP header exactly the D3 string. The only
      non-200s are `/favicon.ico` (the browser's own; the app serves no icon) and the
      advisor `status` probe answering `404 NOT_FOUND` by design when it is not loaded.
- [ ] Everything still works with the network physically disconnected. **LEFT FOR HUMAN**:
      turn off Wi-Fi and unplug the cable, reload, open 3D, run the audit.

## The AUDIT area (D18, D19)

- [x] `auditing…` with the button disabled while it waits. PASSED, observed mid-flight.
      Note: the five tiles keep the previous counts under the `auditing…` headline.
- [x] PASS and UNAVAILABLE told apart in greyscale. PASSED: different word and glyph
      (`[+] PASS` / `[?] UNAVAILABLE`), `dashed` against `solid`.
      `06-greyscale-pass-vs-unavailable.png`.
- [x] No evidence record → the three legs are UNAVAILABLE, nothing reads as green. PASSED
      on the demo vault: typecheck, build and tests each `UNAVAILABLE` with the evidence
      `.cellular/evidence/trilateral.json is absent`; that tile is the loud one (5,
      `tile strong`) and PASS is quiet.
- [x] Both filters set and clear. PASSED: 16 → 5 (UNAVAILABLE) → 16; scope → 12 → 16.
- [x] A build without the audit plugin says so and shows no numbers. PASSED through the
      same code path, in fixture mode: `not available in this build — the plugin is not
      installed`, no tiles. The literal rename on disk was not done (it mutates the
      checkout) — LEFT FOR HUMAN.

## Left for a human, in full

1. Contrast and legibility (§8) — tired eyes, two brightness levels, accent dominance.
2. A screen reader (NVDA/VoiceOver): does the table announce row and column, and a node
   shape announce `<name> — <status>`?
3. The physical-network test (§10).
4. 500 cells by HAND: does panning FEEL responsive, or merely measure as responsive?
5. 3D label collisions at poses other than the five captured, and chips clipped at the
   canvas edge; renaming `eip/plugins/observer-audit/` away, for the literal check.

## Defects found and fixed in this pass

1. **Infinite recursion on selecting a cell** (the serious one). The page opened the panel
   from the selection machine's `show`, then mirrored the selection back into the view,
   which called `show` again: `RangeError: Maximum call stack size exceeded`, one
   `cell-detail` request per frame (`ERR_INSUFFICIENT_RESOURCES`), and a panel that
   re-opened itself after `close`. Fixed with a `notify` flag: a mirrored selection paints
   and approaches but says nothing back. Test: `tests/selection.test.mjs`, "a selection
   that came from OUTSIDE is not echoed back".
2. **3D failure emptied the panel.** With three.js blocked the toggle hid the 2D projection
   and left an empty box plus an uncaught rejection. Fixed with a guarded import that falls
   back to 2D and says why. Test: `tests/build.test.mjs`, D17.
3. **The advisor called its own adapter "unknown"** before anything was asked (`status`
   nests the adapter, `advise` returns it flat). Fixed with a pure `statusMeta`. Test:
   `tests/advisor-view.test.mjs`, V23.
4. **No gap between a cell name and its facts** in recent activity, read as one word
   ("markdown-parserHeadings and paragraphs parse"). Fixed in `app.css`.
5. Focus was dropped on `<body>` when the panel closed; it now returns to the row that
   opened it (and stays in the graph when Escape closed it from there).

After the fixes: `npm test` 504/504 · `npm run gates` green · `tsc -p apps/observer` clean.
