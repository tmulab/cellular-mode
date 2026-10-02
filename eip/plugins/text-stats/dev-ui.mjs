// The dev-UI FRAGMENT for text.stats.
//
// It is a fragment, not a document: the host owns the shell (doctype, CSP, the
// stylesheet and the one script), so a plugin can never introduce an inline
// handler, an inline style or a third-party URL into a page served under a strict
// `default-src 'self'` policy. Everything here is markup plus data attributes.
//
// The contract with the host script (eip/host/dev-ui.mjs):
//   form[data-cap="<capability id>"] ....... one capability per form
//   [name][data-type="string|integer"] ..... one field per input property
//   [data-optional] ........................ left out of the request when empty
//   [data-out] ............................. where the JSON answer is written
//
// This is for local testing and diagnostics only. A production UI is an
// independent application consuming api/openapi.json — see docs/adr/0001.
export const DEV_UI_HTML = `<section class="card">
  <h2>Count words</h2>
  <p class="hint">POST /api/v1/plugins/text.stats/capabilities/count-words</p>
  <form data-cap="count-words">
    <label for="cw-text">Text</label>
    <textarea id="cw-text" name="text" data-type="string" rows="5"
      placeholder="Paste a paragraph…"></textarea>
    <button type="submit">Count</button>
  </form>
  <pre data-out>&mdash;</pre>
</section>
<section class="card">
  <h2>Reading time</h2>
  <p class="hint">POST /api/v1/plugins/text.stats/capabilities/reading-time</p>
  <form data-cap="reading-time">
    <label for="rt-text">Text</label>
    <textarea id="rt-text" name="text" data-type="string" rows="5"
      placeholder="Paste a paragraph…"></textarea>
    <label for="rt-wpm">Words per minute (50&ndash;1000, optional)</label>
    <input id="rt-wpm" name="wpm" data-type="integer" data-optional
      type="number" min="50" max="1000" step="10">
    <button type="submit">Estimate</button>
  </form>
  <pre data-out>&mdash;</pre>
</section>`;
