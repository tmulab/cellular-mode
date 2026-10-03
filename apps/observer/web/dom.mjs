// dom.mjs — runs in the BROWSER. The three DOM chores every other module would otherwise
// repeat: find a required element, build one, replace the children of one.
//
// Everything here builds nodes and sets `textContent`. No module in this application
// assigns `innerHTML` from data — not because the CSP would stop a script (it would), but
// because a cell name is text and rendering text as markup is how a vault entry becomes
// an execution. The only markup produced from a string is the SVG in `view/svg-2d.mjs`,
// which escapes every value it writes and is tested for it.

/** Finds an element the page is required to contain. A missing one is a packaging fault,
 * raised loudly rather than silently skipping a whole area.
 * @param {string} id @returns {HTMLElement} */
export function must(id) {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the page is missing #${id}`);
  return found;
}

/**
 * @param {string} tag
 * @param {{ class?: string, text?: string, attrs?: Record<string, string> }} [spec]
 * @param {ReadonlyArray<Node>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, spec = {}, children = []) {
  const node = document.createElement(tag);
  if (spec.class !== undefined) node.className = spec.class;
  if (spec.text !== undefined) node.textContent = spec.text;
  for (const [name, value] of Object.entries(spec.attrs ?? {})) node.setAttribute(name, value);
  for (const child of children) node.appendChild(child);
  return node;
}

/** A field value, carrying its own "is this recorded" styling so an absence is visible
 * as an absence rather than reading as a value.
 * @param {{ text: string, recorded: boolean }} value @param {string} [tag] @returns {HTMLElement} */
export function fieldNode(value, tag = 'span') {
  return el(tag, { class: value.recorded ? 'value' : 'value absent', text: value.text });
}

/** @param {HTMLElement} host @param {ReadonlyArray<Node>} children */
export function replace(host, children) {
  host.replaceChildren(...children);
}

/** A labelled failure, shown in place of an area that could not load. The code is kept:
 * a reader who reports "it said UPSTREAM_UNAVAILABLE" is reporting a fact.
 * @param {string} code @param {string} message @returns {HTMLElement} */
export function errorNode(code, message) {
  return el('p', { class: 'failure' }, [
    el('b', { text: code }),
    el('span', { text: ` ${message}` }),
  ]);
}
