// The SECURITY-SENSITIVE sections of a UPP manifest, each with its own CLOSED key list.
//
// They live apart from `manifest.mjs` because a rule and the places where a rule must be
// absolute are different things to review. Every checker here rejects an unknown key, and
// none has an `extensions` escape hatch — `entry` decides what gets executed, `application`
// decides what a browser may reach, and a tolerated typo in either is a hole rather than a
// forward-compatible addition. Pure: rules over data, no disk, no clock, no process.

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {Record<string, unknown>} Raw */

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @type {(path: string, message: string) => SchemaError} */
const err = (path, message) => ({ path, message });
/** @type {(v: unknown) => boolean} */
const isText = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('\0');

/** The one shared shape rule: an object whose keys are all named. No tolerance, by design.
 * @param {unknown} value @param {string} at @param {ReadonlyArray<string>} allowed
 * @param {SchemaError[]} out @returns {Raw | null} */
export function closedObject(value, at, allowed, out) {
  if (!isPlain(value)) {
    out.push(err(at, `${at} must be an object`));
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) out.push(err(`${at}.${key}`, `unknown key "${key}" in ${at}`));
  }
  return value;
}

export const RUNTIMES = Object.freeze(['in-process', 'process', 'http']);
export const AUTH_MODES = Object.freeze(['host-session', 'none-local']);
export const ENTRY_KEYS = Object.freeze({
  'in-process': Object.freeze(['module']),
  process: Object.freeze(['command']),
  http: Object.freeze(['baseUrl']),
});

/** @type {(value: unknown, at: string, out: SchemaError[]) => void} */
function checkCommand(value, at, out) {
  if (!Array.isArray(value) || value.length === 0) {
    // The whole point: an argv ARRAY is not a shell string, and a shell string is how a
    // configuration value becomes command execution.
    out.push(err(at, 'command must be a non-empty array [executable, ...args], never a string'));
    return;
  }
  value.forEach((part, index) => {
    if (isText(part)) return;
    out.push(err(`${at}.${index}`, 'every argv member must be a non-empty string with no NUL'));
  });
}

/** @type {(value: unknown, at: string, out: SchemaError[]) => void} */
export function checkBaseUrl(value, at, out) {
  if (!isText(value)) {
    out.push(err(at, 'baseUrl must be a non-empty string'));
    return;
  }
  let url;
  try {
    url = new URL(/** @type {string} */ (value));
  } catch {
    out.push(err(at, `baseUrl is not a URL: ${JSON.stringify(value)}`));
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    out.push(err(at, `baseUrl must be http(s), got "${url.protocol}"`));
  }
}

/** A RELATIVE path: one leading "/", no second leading slash, no backslash, no query, no
 * fragment. The second slash is the point — `//host/x` starts with "/" and is a
 * scheme-relative URL naming ANOTHER ORIGIN, so "starts with /" would let a `healthPath`
 * send the host's probe somewhere else. @param {unknown} value @returns {boolean} */
export function isRelativePath(value) {
  return typeof value === 'string' && /^\/[^/\\?#][^\\?#]*$/.test(value);
}

/** An EXACT origin: `scheme://host[:port]`, http(s), nothing else — no path (not even "/"),
 * no credentials, no query, no fragment. CORS compares origins by string equality, so
 * anything looser is a rule nobody can apply. @param {unknown} value @returns {boolean} */
export function isExactOrigin(value) {
  if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** `entry`, per `runtime`. A manifest declaring the wrong shape for its runtime is
 * refused: there is no default and no inference about how to reach a plugin.
 * @param {unknown} entry @param {unknown} runtime @param {SchemaError[]} out */
export function checkEntry(entry, runtime, out) {
  const keys = typeof runtime === 'string'
    ? /** @type {Record<string, ReadonlyArray<string> | undefined>} */ (ENTRY_KEYS)[runtime]
    : undefined;
  if (keys === undefined) return; // the runtime itself is already a reported breach
  const value = closedObject(entry, 'entry', keys, out);
  if (value === null) return;
  if (runtime === 'process') checkCommand(value.command, 'entry.command', out);
  if (runtime === 'http') checkBaseUrl(value.baseUrl, 'entry.baseUrl', out);
  if (runtime === 'in-process' && !isText(value.module)) {
    out.push(err('entry.module', 'module must be a non-empty module specifier'));
  }
}

/** @param {unknown} health @param {unknown} runtime @param {SchemaError[]} out */
export function checkHealth(health, runtime, out) {
  if (health === undefined) return;
  const value = closedObject(health, 'health', ['method', 'path', 'intervalMs'], out);
  if (value === null) return;
  if (value.method !== undefined && value.method !== 'upp.health') {
    out.push(err('health.method', 'the only health method is "upp.health"'));
  }
  if (value.path !== undefined) {
    if (runtime !== 'http') {
      out.push(err('health.path', 'health.path applies to the http runtime only'));
    } else if (typeof value.path !== 'string' || !value.path.startsWith('/')) {
      out.push(err('health.path', 'path must start with "/"'));
    }
  }
  if (value.intervalMs !== undefined
    && (!Number.isInteger(value.intervalMs) || Number(value.intervalMs) < 100)) {
    out.push(err('health.intervalMs', 'intervalMs must be an integer >= 100'));
  }
}

/** @param {unknown} lifecycle @param {SchemaError[]} out */
export function checkLifecycle(lifecycle, out) {
  if (lifecycle === undefined) return;
  const keys = ['startupTimeoutMs', 'shutdownTimeoutMs'];
  const value = closedObject(lifecycle, 'lifecycle', keys, out);
  if (value === null) return;
  for (const key of keys) {
    const given = value[key];
    if (given !== undefined && (!Number.isInteger(given) || Number(given) < 0)) {
      out.push(err(`lifecycle.${key}`, `${key} must be an integer >= 0`));
    }
  }
}

/** `application`: required when `type` is "application", refused otherwise. Specified in
 * `docs/upp/SPEC.md` §10 and `docs/upp/APPLICATIONS.md`; `cors.allowedOrigins` exists and
 * defaults to EMPTY. @param {unknown} application @param {unknown} type @param {SchemaError[]} out */
export function checkApplication(application, type, out) {
  if (type !== 'application') {
    if (application !== undefined) {
      out.push(err('application', 'only a manifest of type "application" may declare it'));
    }
    return;
  }
  if (application === undefined) {
    out.push(err('application', 'a manifest of type "application" must declare it'));
    return;
  }
  const keys = ['baseUrl', 'healthPath', 'routes', 'auth', 'cors'];
  const value = closedObject(application, 'application', keys, out);
  if (value === null) return;
  checkBaseUrl(value.baseUrl, 'application.baseUrl', out);
  if (!isRelativePath(value.healthPath)) {
    out.push(err('application.healthPath',
      'healthPath must be a relative path like "/healthz": one leading slash, no "//", no query, no fragment'));
  }
  if (!Array.isArray(value.routes) || value.routes.length === 0) {
    out.push(err('application.routes', 'routes must be a non-empty array of path templates'));
  } else {
    value.routes.forEach((route, i) => {
      if (route === '/' || isRelativePath(route)) return;
      out.push(err(`application.routes.${i}`, 'a route must be a relative path, e.g. "/" or "/cells"'));
    });
  }
  if (!AUTH_MODES.includes(/** @type {string} */ (value.auth))) {
    out.push(err('application.auth', `auth must be one of ${AUTH_MODES.join(', ')}`));
  }
  checkCors(value.cors, out);
}

/** @type {(cors: unknown, out: SchemaError[]) => void} */
function checkCors(cors, out) {
  if (cors === undefined) {
    out.push(err('application.cors', 'cors must be declared, even as {allowedOrigins: []}'));
    return;
  }
  const value = closedObject(cors, 'application.cors', ['allowedOrigins'], out);
  if (value === null) return;
  if (!Array.isArray(value.allowedOrigins)) {
    out.push(err('application.cors.allowedOrigins', 'allowedOrigins must be an array'));
    return;
  }
  value.allowedOrigins.forEach((origin, i) => {
    const at = `application.cors.allowedOrigins.${i}`;
    if (origin === '*') out.push(err(at, '"*" is never an allowed origin'));
    else if (!isExactOrigin(origin)) {
      out.push(err(at, `not an exact http(s) origin: ${JSON.stringify(origin)} — scheme://host[:port], nothing else`));
    }
  });
}
