// A REAL application plugin, small enough to read: its own server, its own routes, its own
// idea of a page. Nothing here imports the kernel, the SDK or the protocol — an application
// plugin is an app, and the only thing it shares with the system is the HTTP API.
//
// It exists so the application tests can assert the three facts that matter and cannot be
// mocked: the host can supervise a process it did not write, a health endpoint is a real
// socket answering a real GET, and the app reaches the system as a CLIENT — server-side,
// with the host's own authorization boundaries in force (a consequential capability still
// needs the host's approver, and the answer is `APPROVAL_REQUIRED` when there is none).
//
// Usage: node app-server.mjs --port <n>
//   env UPP_HOST_API   the base URL of the host API, e.g. http://127.0.0.1:1234
//   env UPP_APP_CALL   the capability path to POST, e.g. /api/v1/plugins/x/capabilities/y
//
// stdout is kept SILENT on purpose: a supervised application is not a UPP conversation
// partner, so anything it printed on stdout would be noise in the host's protocol reader.
// Diagnostics go to stderr.
import { createServer } from 'node:http';

const ADDRESS = '127.0.0.1';
const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const PORT = portAt === -1 ? 0 : Number(args[portAt + 1]);
const HOST_API = process.env.UPP_HOST_API ?? '';
const CALL_PATH = process.env.UPP_APP_CALL ?? '';

/** What the app learned from the system at startup. One call, server-side, as a client.
 * @type {{ reached: boolean, plugins: string[], detail: string }} */
const system = { reached: false, plugins: [], detail: 'not attempted' };

/** @type {(res: import('node:http').ServerResponse, status: number, body: unknown) => void} */
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`${JSON.stringify(body)}\n`);
};

/** The client direction, proved once at startup: the APP calls the system, never the
 * other way round, and it does so from its server — the browser sees none of this. */
async function readSystem() {
  if (HOST_API === '') return;
  try {
    const response = await fetch(`${HOST_API}/api/v1/plugins`);
    const body = /** @type {{ value?: { plugins?: Array<{ name?: string }> } }} */ (await response.json());
    system.reached = response.ok;
    system.plugins = (body.value?.plugins ?? []).map((plugin) => String(plugin.name));
    system.detail = `HTTP ${response.status}`;
  } catch (cause) {
    system.detail = `unreachable: ${String(cause)}`;
  }
}

/** A consequential capability, called server-side. The app has no authority of its own: the
 * host's approver decides, and with no approver the honest answer is a refusal.
 * @returns {Promise<{ status: number, body: unknown }>} */
async function callCapability() {
  if (HOST_API === '' || CALL_PATH === '') return { status: 503, body: { ok: false, error: 'not configured' } };
  const response = await fetch(`${HOST_API}${CALL_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // No `approval` field: consent is not something a caller may assert about itself.
    body: JSON.stringify({ input: { name: 'from-the-app', text: 'two words' } }),
  });
  return { status: response.status, body: await response.json() };
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path === '/healthz') return json(res, 200, { status: 'ok', system: system.detail });
  if (path === '/system') return json(res, 200, system);
  if (path === '/call') {
    callCapability()
      .then((answer) => json(res, 200, answer))
      .catch((cause) => json(res, 502, { status: 0, body: { error: String(cause) } }));
    return undefined;
  }
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>fixture app</title><p>An independently executed app.</p>\n');
  }
  return json(res, 404, { error: 'no route' });
});

await readSystem();
server.listen(PORT, ADDRESS, () => {
  process.stderr.write(`app-server listening on ${ADDRESS}:${PORT}\n`);
});
