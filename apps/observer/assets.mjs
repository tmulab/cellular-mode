// assets.mjs — the static allowlist, as DATA.
//
// The whole security story of the static half of this server is one sentence: a URL is
// either a key of the map below or it is a 404. There is no path join from request text,
// no directory walk, no extension sniffing, no index resolution. Traversal, encoded
// traversal, backslashes, absolute paths and symlink tricks are not defended against one
// by one — they simply have no code path to reach (criterion D2).
//
// The cost is that adding a file means adding a line here. That is the feature: the set
// of bytes this process will hand out is reviewable in one screen.

/** @typedef {{ file: string, type: string }} Asset */

const HTML = 'text/html; charset=utf-8';
const CSS = 'text/css; charset=utf-8';
const JS = 'text/javascript; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';

/** Browser modules, served from `web/`. */
const WEB_MODULES = [
  'main.mjs', 'data-client.mjs', 'dom.mjs', 'project-area.mjs', 'cells-table.mjs',
  'cell-detail.mjs', 'timeline-list.mjs', 'graph-view.mjs', 'zoom-2d.mjs',
  'interaction-2d.mjs', 'scene-3d.mjs', 'camera-3d.mjs', 'orbit.mjs', 'labels.mjs',
  'audit-area.mjs', 'advisor-area.mjs', 'advisor-rows.mjs', 'mode-badge.mjs',
];

/** DOM-free modules shared by the browser and the node tests, served from `view/`. */
const VIEW_MODULES = [
  'tokens.mjs', 'fields.mjs', 'view-model.mjs', 'selection.mjs', 'svg-2d.mjs', 'fit-2d.mjs',
  'availability.mjs', 'audit-view.mjs', 'advisor-view.mjs', 'advisor-presence.mjs',
  'mode-view.mjs',
];

/** The vendored three.js build. Both files: the module only re-exports from the core. */
const VENDOR_DIR = 'vendor/three@0.180.0';

/** Deterministic fixtures of the `observer.state` contract. Served so the interface can
 * be exercised — and the 500-node case reviewed — without a vault; the page labels them
 * as fixtures, loudly, because unlabelled sample data is a lie about a real project. */
const FIXTURES = ['observer-state.json', 'observer-state-500.json'];

/** The complete set of URLs this server answers with a file.
 * @type {Readonly<Record<string, Asset>>} */
export const ASSETS = Object.freeze({
  '/': { file: 'web/index.html', type: HTML },
  '/index.html': { file: 'web/index.html', type: HTML },
  '/web/app.css': { file: 'web/app.css', type: CSS },
  ...Object.fromEntries(WEB_MODULES.map((name) => [`/web/${name}`, { file: `web/${name}`, type: JS }])),
  ...Object.fromEntries(VIEW_MODULES.map((name) => [`/view/${name}`, { file: `view/${name}`, type: JS }])),
  ...Object.fromEntries(FIXTURES.map((name) => [`/fixtures/${name}`, { file: `fixtures/${name}`, type: JSON_TYPE }])),
  [`/${VENDOR_DIR}/three.module.min.js`]: { file: `${VENDOR_DIR}/three.module.min.js`, type: JS },
  [`/${VENDOR_DIR}/three.core.min.js`]: { file: `${VENDOR_DIR}/three.core.min.js`, type: JS },
  [`/${VENDOR_DIR}/LICENSE`]: { file: `${VENDOR_DIR}/LICENSE`, type: TEXT },
});

/** PURE. The asset for a request path, or `null`. The path is compared, never combined:
 * `pathname` is the decoded path with the query already removed by the caller.
 * @param {unknown} pathname @returns {Asset | null} */
export function assetFor(pathname) {
  if (typeof pathname !== 'string') return null;
  const found = Object.prototype.hasOwnProperty.call(ASSETS, pathname) ? ASSETS[pathname] : undefined;
  return found ?? null;
}

/** PURE. Request target → `{ pathname, query }`, or `null` when the target is malformed.
 * A bad percent-escape is not a path and gets no second chance at interpretation.
 * @param {unknown} target @returns {{ pathname: string, query: string } | null} */
export function splitTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return null;
  const hash = target.indexOf('#');
  const withoutHash = hash === -1 ? target : target.slice(0, hash);
  const mark = withoutHash.indexOf('?');
  const rawPath = mark === -1 ? withoutHash : withoutHash.slice(0, mark);
  const query = mark === -1 ? '' : withoutHash.slice(mark + 1);
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  // A NUL byte in a decoded path is never legitimate and is a classic truncation trick.
  if (pathname.includes('\u0000')) return null;
  return { pathname, query };
}
