// main.mjs — runs in the BROWSER. The composition of the page: it wires the data client to
// the areas and owns nothing else. Every decision about WHAT to show is in the pure
// view-model; every decision about HOW to reach the host is in the data client.
import { must } from './dom.mjs';
import {
  ADVISOR_KEY, AUDIT_KEY, STATE_KEY, createApiClient, createFixtureClient, fixtureUrlFrom, sourceFrom,
} from './data-client.mjs';
import { renderOverview, renderOverviewFailure } from './project-area.mjs';
import { markSelectedRow, renderCellsTable } from './cells-table.mjs';
import { hideCellDetail, renderCellDetail, renderDetailFailure } from './cell-detail.mjs';
import { renderTimeline } from './timeline-list.mjs';
import { createGraphView } from './graph-view.mjs';
import { renderAuditArea } from './audit-area.mjs';
import { renderAdvisorArea } from './advisor-area.mjs';
import { errorNode, replace } from './dom.mjs';

const VIEW_KEY = 'cellular-observer-view';

/** @param {unknown} answer @returns {answer is { ok: true, value: unknown }} */
const ok = (answer) => /** @type {{ ok?: unknown }} */ (answer).ok === true;

async function start() {
  const source = sourceFrom(location.search);
  const state = source === 'fixture'
    ? createFixtureClient(fixtureUrlFrom(location.search))
    : createApiClient(STATE_KEY);
  must('fixture-banner').hidden = source !== 'fixture';

  const detailHost = must('detail');
  const cellsHost = must('cells');
  const graph = createGraphView({
    flat: must('graph-flat'),
    deep: must('graph-deep'),
    caption: must('graph-caption'),
    onSelect: (id) => { void openCell(id); },
    onClear: () => closeCell(),
  });

  // What had the keyboard before the panel took it. The panel moves focus to its `close`
  // button, so closing has to give it back: dropping focus on `<body>` sends a keyboard
  // reader back to the top of the page every time they look at a cell.
  /** @type {HTMLElement | null} */
  let opener = null;

  /** @param {string} id */
  async function openCell(id) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !detailHost.contains(active)) opener = active;
    markSelectedRow(cellsHost, id);
    graph.setFocus(id);
    const answer = await state.call('cell-detail', { id });
    if (ok(answer)) renderCellDetail(detailHost, answer.value, closeCell);
    else renderDetailFailure(detailHost, /** @type {{ error: { code: string, message: string } }} */ (answer).error);
  }

  function closeCell() {
    // Only when the panel itself holds the keyboard: Escape pressed inside the graph also
    // closes the panel, and that reader must keep their place in the graph.
    const fromPanel = detailHost.contains(document.activeElement);
    hideCellDetail(detailHost);
    markSelectedRow(cellsHost, null);
    graph.setFocus(null);
    graph.clearSelection();
    if (fromPanel && opener !== null && opener.isConnected) opener.focus();
  }

  const [overview, cells, graphValue, timeline] = await Promise.all([
    state.call('overview', {}),
    state.call('cells', {}),
    state.call('graph', {}),
    state.call('timeline', { limit: 100 }),
  ]);

  if (ok(overview)) {
    renderOverview({
      tiles: must('tiles'),
      active: must('active-cell'),
      warnings: must('warnings'),
      activity: must('activity'),
      integrity: must('integrity'),
    }, overview.value);
  } else {
    renderOverviewFailure(must('tiles'), /** @type {{ error: { code: string, message: string } }} */ (overview).error);
  }

  if (ok(cells)) {
    const value = /** @type {Record<string, unknown>} */ (cells.value ?? {});
    renderCellsTable(cellsHost, value['cells'], (id) => { void openCell(id); });
  } else {
    const failure = /** @type {{ error: { code: string, message: string } }} */ (cells).error;
    replace(cellsHost, [errorNode(failure.code, failure.message)]);
  }

  if (ok(graphValue)) graph.setGraph(graphValue.value);
  else must('graph-caption').textContent = 'the graph could not be read';

  if (ok(timeline)) renderTimeline(must('timeline'), timeline.value);
  else {
    const failure = /** @type {{ error: { code: string, message: string } }} */ (timeline).error;
    replace(must('timeline'), [errorNode(failure.code, failure.message)]);
  }

  // --- the graph panel's controls ---------------------------------------------------
  const toggle = /** @type {HTMLButtonElement} */ (must('view-toggle'));
  const applyMode = async (/** @type {'2d' | '3d'} */ next) => {
    await graph.setMode(next);
    // What the button says follows what is ACTUALLY on screen: asking for 3D on a machine
    // that cannot draw it returns 2D, and the label has to tell the truth about that.
    const shown = graph.mode();
    toggle.textContent = shown === '3d' ? 'show 2D' : 'show 3D';
    toggle.setAttribute('aria-pressed', shown === '3d' ? 'true' : 'false');
    must('help-3d').hidden = shown !== '3d';
    localStorage.setItem(VIEW_KEY, shown);
  };
  toggle.addEventListener('click', () => { void applyMode(graph.mode() === '3d' ? '2d' : '3d'); });
  must('fit').addEventListener('click', () => graph.fit());
  must('graph-panel').addEventListener('keydown', (event) => {
    if (graph.handleKey(event.key)) event.preventDefault();
  });
  // 2D is the default and the proven view; 3D is only restored when it was chosen before.
  await applyMode(localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d');

  // --- the AUDIT area, and the ADVISOR area whose plugin is a later cell -------------
  const auditClient = source === 'fixture'
    ? createFixtureClient(fixtureUrlFrom(location.search))
    : createApiClient(AUDIT_KEY);
  const advisorClient = source === 'fixture'
    ? createFixtureClient(fixtureUrlFrom(location.search))
    : createApiClient(ADVISOR_KEY);
  // The auditor exists now (Cell 2), so this area is real. When the plugin is not in the
  // build the area says exactly that, through the same `describeProbe` wording the advisor
  // area uses: an empty panel that could mean either teaches a reader nothing.
  await renderAuditArea({ host: must('audit'), key: AUDIT_KEY, client: auditClient });
  // The advisor exists too (Cell 3) but is DISABLED unless the launcher was given
  // `--advisor <id>`, so this area's first job is to say which of those two worlds it is in.
  await renderAdvisorArea({
    host: must('advisor'),
    key: ADVISOR_KEY,
    origin: 'ai',
    client: advisorClient,
    onSelect: (id) => { void openCell(id); },
  });
}

start().catch((cause) => {
  const host = document.getElementById('tiles');
  if (host !== null) replace(host, [errorNode('STARTUP_FAILED', String(cause))]);
});
