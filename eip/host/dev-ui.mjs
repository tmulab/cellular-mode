// The dev-UI SHELL. The plugin ships a markup fragment; the host owns the
// document, the policy and the one script — so no plugin can introduce an inline
// handler, an inline style or a third-party URL into a page the host serves.
//
// The CSP below is the reason the script and the stylesheet are separate routes.
// `'unsafe-inline'` appears nowhere: with it, a CSP is a comment.
export const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const DEV_SCRIPT_PATH = '/dev/assets/dev-ui.js';
export const DEV_STYLE_PATH = '/dev/assets/dev-ui.css';

/** @type {(text: unknown) => string} */
const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The document shell around a plugin fragment. No script, no style, no URL inline.
 * @param {{ key: string, title: string, fragment: string }} page */
export function renderDevPage({ key, title, fragment }) {
  const safeKey = escapeHtml(key);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — ${safeKey}</title>
<link rel="stylesheet" href="${DEV_STYLE_PATH}">
</head>
<body data-key="${safeKey}" data-api="/api/v1/plugins/${encodeURIComponent(key)}/capabilities">
<header>
<h1>${escapeHtml(title)}</h1>
<p class="hint">Local diagnostics for <code>${safeKey}</code>. Not a production UI:
a production frontend is an independent application consuming the OpenAPI contract.</p>
</header>
<main>
${fragment}
</main>
<script src="${DEV_SCRIPT_PATH}"></script>
</body>
</html>
`;
}

export const DEV_CSS = `:root { color-scheme: light dark; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 46rem; padding: 2rem 1rem; }
h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
h2 { font-size: 1.1rem; margin: 0 0 .25rem; }
.hint { color: #666; font-size: .85rem; margin: 0 0 1rem; }
.card { border: 1px solid #8884; border-radius: .5rem; margin-bottom: 1.5rem; padding: 1rem; }
label { display: block; font-size: .85rem; font-weight: 600; margin: .75rem 0 .25rem; }
textarea, input { border: 1px solid #8886; border-radius: .25rem; font: inherit; padding: .4rem; width: 100%; }
button { border: 0; border-radius: .25rem; cursor: pointer; font: inherit; margin-top: .75rem; padding: .5rem 1rem; }
pre { background: #8881; border-radius: .25rem; margin: .75rem 0 0; overflow-x: auto; padding: .75rem; }
code { font-size: .9em; }
`;

// One generic script for every plugin fragment: it reads the contract from data
// attributes, so the host never learns a plugin's domain and the plugin never
// ships behaviour. Relative URLs only — same origin, by construction.
export const DEV_SCRIPT = `'use strict';
document.querySelectorAll('form[data-cap]').forEach(function (form) {
  var out = form.parentElement.querySelector('[data-out]');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var input = {};
    form.querySelectorAll('[name][data-type]').forEach(function (field) {
      var raw = field.value.trim();
      if (raw === '' && field.hasAttribute('data-optional')) return;
      input[field.name] = field.getAttribute('data-type') === 'integer' ? Number(raw) : raw;
    });
    var url = document.body.getAttribute('data-api') + '/' + encodeURIComponent(form.getAttribute('data-cap'));
    out.textContent = 'calling ' + url + ' …';
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: input }),
    }).then(function (response) {
      return response.json().then(function (payload) {
        out.textContent = response.status + ' ' + JSON.stringify(payload, null, 2);
      });
    }).catch(function (cause) {
      out.textContent = 'request failed: ' + cause.message;
    });
  });
});
`;
