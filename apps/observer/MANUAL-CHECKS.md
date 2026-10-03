# Manual checks — the part no gate can perform

**Status: PERFORMED BY AUTOMATION on 2026-10-03**, driving a real browser over the Chrome
DevTools Protocol: **Microsoft Edge headless `Edg/154.0.4258.48` (HeadlessChrome/154.0.0.0)**,
viewport 1280×900 unless stated, WebGL available (ANGLE, NVIDIA RTX 4070 Laptop, D3D11). Every
PASSED line was observed in a screenshot or read out of live DOM state; nothing is ticked on
the strength of the code alone. What needs a human eye, ear or a physically disconnected
network is **LEFT FOR HUMAN**, with the steps. Screenshots live in the session scratch
directory (`…\scratchpad\visual\`), outside the repository. Nine defects were found and fixed
across two passes, listed at the end; lines re-run by the second pass say so where they are.
How to start it: README §2; fixture mode reads no vault and says so in a banner, worded
`RECORDED FIXTURE — … No vault is being read.` (`09-500-overview.png`).

## 1 · The project area — `--root examples/observer-demo`

- [x] Counts match the table; the active cell is the largest thing; paused zero quiet and
      non-zero prominent. PASSED: tiles 1/1/1/1 vs 4 rows (demo), 1 active + 26 done vs 27
      rows (`--root .`); `Tag filter` 25.6 px vs 16 px quiet tiles; demo `paused: 1` → 25.6
      px `tile strong`, repository `paused: 0` → 16 px `tile quiet`. `01-project-area.png`,
      `01-paused-zero-quiet.png`.
- [x] Warnings carry code and cell; activity newest first; integrity read. PASSED:
      `dangling-dependency … — search-index`, `2026-04-07 09:30` above `2026-04-06 10:20`,
      `integrity: ok` in both vaults.

## 2 · The cells table (the one view that must never break)

- [x] Every cell, all seven columns. PASSED: 4 rows × `id · name · area · status · last
      visit · next step · dependencies`; 500 rows in the 500-cell fixture.
- [x] `not recorded`, italic; Tab reaches each row and Enter opens it. PASSED: 4 absent
      cells computed `italic` / `rgb(107,116,144)`; a real Tab walk reached all four rows,
      Enter opened `search-index`, `aria-current="true"` set. `02-detail-search-index.png`.

## 3 · The cell detail panel

- [x] Every contract field, including the empty ones, with the unrecorded ones lighter and
      italic, `unavailable` listed separately, and `close` returning focus sensibly. PASSED:
      18 fields + 3 evidence rows; 13 names under `unavailable: … — the host could not read
      these`; focus returns to the row that opened the panel (was `<body>`), caption →
      `overview`. `02-detail-search-index.png`.
- [x] A cell id that does not exist. PASSED: the 500-cell fixture records no details, so
      the panel shows `NOT_FOUND … no detail for "demo-cell-001"`. `03-detail-failure.png`.

## 4 · The 2D graph

- [x] Each status is a different SHAPE. PASSED: done hexagon, paused diamond, planned square,
      active circle, unknown dashed triangle, repeated as text. `04-greyscale-shapes.png`.
- [x] Drag moves; wheel zooms towards the cursor; `fit` returns. PASSED, **re-run after the
      framing change**: the initial view IS the fit (`translate(73.5px,41.34px) scale(.806)`);
      drag → `+160,+90`; wheel → `scale(.887)` anchored; `fit` and `0` return to that string.
- [x] Labels are legible without touching a control. PASSED **after a fix**: node-name size in
      CSS px, demo vault — **4.00 → 11.97 px** at 1280×900, 1280×1500 and 1280×2000 (panel
      758×426 in all three) and **1.34 → 11.91 px** at 320×640; it holds at every zoom and in
      a focused subgraph. `m-before-` vs `m-after-demo-1280x900.png`.
- [x] Clicking a node dims non-neighbours and lights its edges, and a click after a DRAG
      does not select. PASSED on hover (`search-index`: `note-storage`/`tag-filter` dimmed,
      shared edge lit); a CLICK redraws the focused SUBGRAPH; after a 160 px drag the panel
      stayed hidden. `04-hover-dimming.png`, `04-graph-focused.png`, `p-graph-focused.png`.
- [x] Arrows pan, `+`/`-` zoom, `0` fits, `Esc` clears — no pointer. PASSED, re-run:
      `ArrowLeft` → `+60px` in x; `0` → the fit string; `Esc` from inside the graph closed
      the panel and the caption returned to `overview`, now re-framed rather than left at
      the magnification of the cell just closed.
- [x] Tab reaches the node shapes; Enter selects. PASSED, re-run: node groups take focus with
      a 2 px accent outline (`2px solid` on the `<g>`), Enter opened `Note storage`.
      `04-node-focus-ring.png`, `p-node-focus-ring.png`.
- [x] A dangling dependency is not drawn; the caption counts it. PASSED: 4 edges drawn,
      `data-dangling="1"`, caption `… 1 dangling (listed as warnings, not drawn)`.

## 5 · The 3D view (optional)

- [x] `show 3D` loads the scene; `show 2D` returns. PASSED, re-run: canvas 756×424 (it follows
      the panel's new aspect ratio), four labelled prisms, and back to 2D restores the SVG at
      the fitted transform. `p-3d-after-fit.png`, `p-back-to-2d.png`.
- [x] Drag rotates, right-drag pans, wheel zooms, `R` resets, arrows rotate with no pointer.
      PASSED: every gesture moved every chip; `R` restored the start positions
      (`05-3d-b/-c/-d…`, `05-3d-e-arrow-rotate`, `05-3d-f-R-reset`).
- [x] The two views agree on the arrangement, labels crisp and constant. PASSED: the same
      chain `Search index → Tag filter → Markdown parser → Note storage`; a chip on the
      canvas edge is clipped.
- [x] three.js blocked → 2D and the table still work. PASSED **after a fix**: the caption
      reads `3D is not available here (TypeError: …) — showing 2D`, nothing is uncaught and
      the table still opens cells. `05-3d-blocked.png`.

## 6 · The AUDIT and ADVISOR areas

Started WITHOUT `--advisor` (`--root examples/observer-demo`):

- [x] AUDIT works. PASSED: `run audit` → 16 findings, tiles 0/4/5/1/6, each with evidence,
      explanation and action. `06-noadvisor-after-run.png`.
- [x] ADVISOR says the disabled sentence, controls disabled not absent. PASSED, **re-run
      after the neutral-state change**: `health.plugins` is `["observer.audit",
      "observer.state"]`, the area is `data-state="absent"`, the headline is exactly
      `Advisor disabled (optional). Observer and Auditor work without it.` — no
      `NOT_FOUND`, no error box, three disabled controls, and **zero requests to
      `observer.advisor`**. `p-advisor-disabled.png`.

Started WITH `--advisor fixture` (`--root .`):

- [x] A different KIND of panel, naming its adapter, doing nothing until `ask the advisor`.
      PASSED, re-run with the plugin LISTED: `data-origin="ai"`, dashed border and badge
      `AI-GENERATED`, `data-state="available"`, `adapter: fixture — deterministic test
      adapter · no network`, headline `Nothing has been asked yet…`, controls enabled, and
      `status` still the only call on load. `06-advisor-answered.png`, `p-advisor-enabled.png`.
- [x] Label badge, uncertainty, references; a `cell:` reference opens that cell. PASSED:
      `[~] INFERRED` / `[>] PROPOSED`, meanings in `title`, `cell:stage-3-final-validation`
      opening it. `06-advisor-cell-ref.png`.
- [x] Asking twice within two seconds is refused with a sentence, and nothing reads as a
      measurement. PASSED: `INPUT_INVALID: the advisor accepts one call every 2000 ms;
      1151 ms left to wait`, no spinner, no tile, no verdict chip, no number but the
      adapter's call budget.

## 7 · 320 px (viewport 320 × 640)

- [x] No horizontal page scrolling; the table scrolls on its own axis. PASSED, re-run after
      the panel got an aspect ratio: `scrollWidth 305 ≤ innerWidth 320`, panel 255×192, no
      control past the right edge, label 11.91 px. `p-320-graph.png`.
- [x] Every control reachable, nothing clipped, and the detail panel docks to the bottom.
      PASSED: nine controls, none zero-sized; `position: fixed`, full width,
      `max-height: 460.8px`, scrollable. `07-320-detail.png`.

## 8 · Contrast and legibility

- [ ] Readable after a long day, at full and at low brightness, with one accent colour
      noticeable and nothing competing. **LEFT FOR HUMAN**: open it tired, at full and at
      minimum brightness. D15 checks the palette; the judgement is not checkable.
- [x] `not recorded` reads as an absence. PASSED mechanically (italic + `--tertiary`);
      whether it *reads* as absence is the human half of the line.

## 9 · 500 cells (`--fixture`, `?source=fixture&size=500`)

- [x] First paint not slow; the table complete. PASSED: `loadEventEnd` 90–97 ms, 500 rows
      and 500 node shapes. `09-500-overview.png`.
- [x] Labels gone, shapes remain. PASSED, re-run: `data-labels="false"`,
      `data-label-chars="0"`, 0 names, 500 node groups — the level of detail is untouched by
      the new framing, which only pulls the field 26 px clear of the edge (2 px before).
      `m-after-500-1280x900.png`.
- [x] Panning and zooming stay responsive (mechanically; the FEEL is LEFT FOR HUMAN), and
      clicking a node reduces the view and brings the labels back. PASSED: 3 nodes, 2 edges,
      `data-labels="true"`, caption `focused on demo-cell-451`. `09-500-focused.png`.

## 10 · Offline

- [x] No external request and no CSP violation. PASSED, re-run: 31 requests, all to
      `127.0.0.1`; no `Log` entry with source `security`; CSP header exactly the D3 string.
      The **only** non-200 is now `/favicon.ico` (the browser's own) — the advisor's
      by-design `404 NOT_FOUND` is gone: an unlisted capability is not called at all.
- [ ] Everything still works with the network physically disconnected. **LEFT FOR HUMAN**:
      turn off Wi-Fi, unplug the cable, reload, open 3D, run the audit.

## The AUDIT area (D18, D19)

- [x] `auditing…` with the button disabled while it waits. PASSED, observed mid-flight;
      the five tiles keep the previous counts under the headline.
- [x] PASS and UNAVAILABLE told apart in greyscale. PASSED: different word and glyph
      (`[+] PASS` / `[?] UNAVAILABLE`), dashed against solid. `06-greyscale-pass-vs-
      unavailable.png`.
- [x] Both filters set and clear, and no evidence record → the three legs are UNAVAILABLE
      with nothing reading as green. PASSED: 16 → 5 (UNAVAILABLE) → 16, scope 12 → 16; on
      the demo vault typecheck, build and tests are each `UNAVAILABLE` with the evidence
      `.cellular/evidence/trilateral.json is absent`, and that tile is the loud one.
- [x] A build without the audit plugin says so and shows no numbers. PASSED through the same
      code path, in fixture mode: `not available in this build — the plugin is not
      installed`, no tiles. The rename on disk was not done, LEFT FOR HUMAN.

## Left for a human, in full

1. Contrast and legibility (§8) — tired eyes, two brightness levels, accent dominance.
2. A screen reader: row and column announced, a node shape as `<name> — <status>`?
3. The physical-network test (§10).  4. 500 cells by HAND: does panning FEEL responsive?
5. 3D label collisions at other poses, chips clipped at the canvas edge, and renaming
   `eip/plugins/observer-audit/` away for the literal check.  6. The node GLYPHS at the
   fitted scale (~6 px): big enough to read as a field, or too quiet beside their labels?

## Defects found and fixed in the first pass (2026-10-03)

1. **Infinite recursion on selecting a cell** — the selection was mirrored back into the
   view, which re-entered `show`. Fixed with a `notify` flag (`tests/selection.test.mjs`).
2. **3D failure emptied the panel** — fixed with a guarded import falling back to 2D (D17).
3. **The advisor called its own adapter "unknown"** — fixed with `statusMeta` (V23).
4. **No gap between a cell name and its facts** in recent activity. Fixed in `app.css`.
5. Focus was dropped on `<body>` when the panel closed; it now returns to the opener.

## Defects found and fixed in the UI-polish pass (D22, D23)

6. **Node labels were four pixels tall** on arrival and stayed that way — the server spaces
   cells 600 user units apart while a label is authored at 26, so `preserveAspectRatio`
   alone scaled a 4920×960 box into a 758 px panel by 0.154. `fit` could not help: it reset
   to the identity, which WAS the initial state. Fixed with the deterministic fit and the
   counter-scaled label group of `view/fit-2d.mjs` (4.00 → 11.97 px, `tests/fit-2d.test.mjs`).
7. **Labels at the edge were sliced off** by the outer `<svg>`, which clips at its viewBox
   while a label is drawn BESIDE its node. Fixed by reserving room for the longest name in
   the fit and letting the SVG overflow into it (the panel still clips).
8. **The disabled advisor reported itself as missing.** Fixed by reading `health.plugins`
   first (`tests/advisor-presence.test.mjs`).
9. Found while fixing 6: an aspect ratio on the panel made it 341 px wide in a 320 px
   viewport. Caught by re-running §7, fixed with an explicit `width: 100%`.

Observed and NOT changed (human item 6): at the fitted scale the node GLYPHS are ~6 px
across — the server's spacing-to-glyph ratio is what it is, the labels carry the reading, and
enlarging the shapes needs a second clamp that would spoil the 500-cell texture.
After the fixes: `npm test` 534/534 · `npm run gates` green · `npm run typecheck` clean.
