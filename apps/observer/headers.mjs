// headers.mjs — the response headers, as one PURE value.
//
// The policy is restrictive by construction rather than by configuration: there is no
// option to loosen it, because an option to loosen it is the thing that gets loosened.
//
// Why each directive, so a future reader can tell a rule from a ritual:
//   default-src 'self'    nothing may be fetched from anywhere but this origin;
//   script-src  'self'    no inline script, no eval — the page carries no inline script
//                         and no inline style, which is why this needs no 'unsafe-*';
//   style-src   'self'    the stylesheet is a file, not an attribute;
//   img-src     'self'    no `data:` is needed — the status glyphs are SVG shapes, not
//                         images, so the loophole stays shut;
//   connect-src 'self'    `fetch` may only reach this server's own /api proxy;
//   object-src  'none'    no plugins, ever;
//   base-uri    'none'    a `<base>` injection cannot re-point relative URLs;
//   frame-ancestors 'none' this page cannot be framed (with X-Frame-Options for old UAs);
//   form-action 'none'    there is no form to submit and no destination to submit to.
//
// There is deliberately NO Access-Control-Allow-* header anywhere: the app and the API
// proxy are the same origin, so CORS has nothing to permit. A test asserts the absence.

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

/** Sent with every response, success or refusal.
 * @type {Readonly<Record<string, string>>} */
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
});

/** PURE. The full header set for one response.
 * @param {string} contentType @param {Record<string, string>} [extra]
 * @returns {Record<string, string>} */
export function headersFor(contentType, extra = {}) {
  return { ...SECURITY_HEADERS, 'Content-Type': contentType, ...extra };
}
