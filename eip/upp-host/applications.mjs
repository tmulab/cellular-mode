// The application REGISTRY: what the host knows, watches and — only when the operator said
// so — starts and stops. It is the narrowest layer in this directory on purpose.
//
// What an application plugin is NOT, stated as code rather than as prose: there is no
// `kernel` in this file, no `definePlugin`, no service, no port, no capability. The kernel
// never loads an application, so an application can never receive a kernel service, and the
// host never proxies its frontend. Registration is IDENTITY; it is not execution.
//
// What the host does: REGISTER an authorised, pinned, loopback-or-explicitly-remote app ·
// SUPERVISE it — "managed": start/stop through the one existing spawn site (`channel.mjs`),
// at most ONE automatic restart, as for a process plugin; "external": health only, because a
// deployment the host does not own is not its to control · REPORT a state a human can read,
// so "registered" is never mistaken for "up".
//
// The app talks back to the system ONLY through the HTTP API, as a client, under the host's
// own authorization boundaries: a consequential capability still needs the host's approver.
// Nothing here widens that — there is no second door for an application.
import { JSONRPC_CODES, UPP_CODES, uppError } from '../upp/index.mjs';
import { isLoopbackUrl } from './config.mjs';
import { minimalEnv } from './operator.mjs';
import { createChannel } from './channel.mjs';
import { probeApplication } from './app-health.mjs';

/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {import('./types.mjs').ApplicationAuthorization} ApplicationAuthorization */
/** @typedef {import('./types.mjs').ApplicationRecord} ApplicationRecord */

/** The whole lifecycle, in order. `registered` is not `healthy`, and `stopped` is a decision
 * someone took — an unexpected exit lands on `unhealthy`, where it is visible. */
export const APPLICATION_STATES = Object.freeze(['registered', 'starting', 'healthy', 'unhealthy', 'stopped']);

export const MAX_RESTARTS = 1;
const POLL_MS = 50;

/** @type {(code: number, message: string, detail: string) => { ok: false, error: UppError }} */
const refuse = (code, message, detail) => Object.freeze({
  ok: false, error: uppError(code, message, [{ path: 'applications', message: detail }]),
});

/** What `GET /api/v1/plugins` may show about an application: no command, no cwd, no
 * environment, no pin — an operator's authorisation file is not part of the API.
 * @type {(record: ApplicationRecord) => Readonly<Record<string, unknown>>} */
const publicly = (record) => Object.freeze({
  id: record.id, kind: record.kind, supervision: record.supervision, state: record.state,
  baseUrl: record.baseUrl, routes: [...record.routes], auth: record.auth, restarts: record.restarts,
});

/**
 * @param {{ fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv,
 *   onEvent?: (event: Raw) => void }} [wiring]
 */
export function createApplicationRegistry(wiring = {}) {
  const { fetchImpl, env = process.env } = wiring;
  /** @type {Map<string, ApplicationRecord>} */
  const apps = new Map();
  /** @type {Map<string, ReturnType<typeof createChannel>>} */
  const channels = new Map();

  /** @type {(record: ApplicationRecord, state: string, detail?: string) => void} */
  function move(record, state, detail = '') {
    record.state = state;
    record.detail = detail;
    wiring.onEvent?.({ type: 'application', id: record.id, state, detail, at: new Date().toISOString() });
  }

  /** @type {(id: string) => ApplicationRecord | null} */
  const get = (id) => apps.get(id) ?? null;

  /** Register an authorised application. Refuses — before anything is started or contacted —
   * a manifest that is not an application, a duplicate id, and a non-loopback `baseUrl` the
   * operator did not explicitly allow. @param {ApplicationAuthorization} authorization
   * @returns {{ ok: true, value: ApplicationRecord } | { ok: false, error: UppError }} */
  function register(authorization) {
    const { entry, manifest, digest, dir, timeouts } = authorization;
    const id = String(manifest.id);
    const application = /** @type {Raw} */ (manifest.application ?? {});
    const baseUrl = String(application.baseUrl ?? '');
    if (manifest.type !== 'application') {
      return refuse(JSONRPC_CODES.INVALID_PARAMS,
        `"${id}" is not an application manifest — nothing was registered`, 'type must be "application"');
    }
    if (apps.has(id)) return refuse(JSONRPC_CODES.INVALID_PARAMS, `"${id}" is registered twice`, 'one per id');
    if (!isLoopbackUrl(baseUrl) && entry.allowRemote !== true) {
      return refuse(UPP_CODES.CAPABILITY_NOT_AUTHORIZED,
        `"${id}" names a non-loopback baseUrl without allowRemote:true — refused`,
        'nothing was started and nothing was contacted');
    }
    /** @type {ApplicationRecord} */
    const record = {
      id, kind: 'application', supervision: String(entry.supervision), baseUrl, digest, dir,
      timeouts, entry, state: 'registered', detail: 'registered, not started',
      healthPath: String(application.healthPath ?? '/'),
      routes: Object.freeze([...(Array.isArray(application.routes) ? application.routes : [])].map(String)),
      auth: String(application.auth ?? 'none-local'),
      restarts: 0, pid: null,
    };
    apps.set(id, record);
    return Object.freeze({ ok: true, value: record });
  }

  /** Spawn a MANAGED application through the one existing spawn site: argv array,
   * `shell: false`, confined cwd, minimal env. An application is not a UPP conversation
   * partner, so its stdout is not protocol. @param {ApplicationRecord} record */
  function spawnManaged(record) {
    const command = /** @type {string[]} */ (record.entry.command ?? []).map(String);
    const channel = createChannel({
      command,
      cwd: record.dir,
      env: minimalEnv(/** @type {string[]} */ (record.entry.env ?? []), env),
      onStderr: (line) => wiring.onEvent?.({ type: 'application', id: record.id, stderr: line }),
      onBreach: () => undefined,
      onExit: (code, signal) => {
        channels.delete(record.id);
        record.pid = null;
        if (record.state === 'stopped') return;
        if (record.entry.restart === true && record.restarts < MAX_RESTARTS) {
          record.restarts += 1;
          move(record, 'starting', `restart ${record.restarts} after exit (code ${String(code)})`);
          spawnManaged(record);
          return;
        }
        move(record, 'unhealthy', `exited (code ${String(code)}, signal ${String(signal)})`);
      },
    });
    channels.set(record.id, channel);
    record.pid = channel.pid;
  }

  /** One health probe, applied to the state machine. @param {string} id */
  async function check(id) {
    const record = get(id);
    if (record === null) {
      return refuse(UPP_CODES.CAPABILITY_NOT_AUTHORIZED, `"${id}" is not registered`, 'nothing was contacted');
    }
    const probed = await probeApplication({
      baseUrl: record.baseUrl,
      healthPath: record.healthPath,
      timeoutMs: record.timeouts.requestMs,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
    if (!probed.ok) {
      // A failed probe WHILE STARTING is not a verdict: an app that is still binding its
      // port has not failed yet, and `start` owns the deadline that decides it has.
      if (record.state !== 'stopped' && record.state !== 'starting') {
        move(record, 'unhealthy', probed.error.message);
      } else record.detail = probed.error.message;
      return Object.freeze({ ok: false, error: probed.error });
    }
    move(record, 'healthy', `HTTP ${probed.status}`);
    return Object.freeze({ ok: true, value: record });
  }

  /** Start a registered application: spawn it when managed, then wait for health until
   * `startupMs`. An external application is never spawned — it is only probed.
   * @param {string} id */
  async function start(id) {
    const record = get(id);
    if (record === null) {
      return refuse(UPP_CODES.CAPABILITY_NOT_AUTHORIZED, `"${id}" is not registered`, 'nothing was started');
    }
    if (record.supervision === 'managed' && !channels.has(id)) spawnManaged(record);
    move(record, 'starting', record.supervision === 'managed' ? 'spawned' : 'probing an external deployment');
    const deadline = Date.now() + record.timeouts.startupMs;
    /** @type {{ ok: boolean, error?: UppError }} */
    let last = { ok: false };
    while (Date.now() < deadline && record.state === 'starting') {
      last = await check(id);
      if (last.ok) return Object.freeze({ ok: true, value: record });
      await new Promise((resolve) => { setTimeout(resolve, POLL_MS); });
    }
    const error = last.error ?? uppError(UPP_CODES.TIMEOUT, `"${id}" never became healthy`);
    if (record.state === 'starting') move(record, 'unhealthy', error.message);
    return Object.freeze({ ok: false, error });
  }

  /** Stop a MANAGED application. An external one is not the host's to stop, so the honest
   * action is to stop watching it. @param {string} id */
  async function stop(id) {
    const record = get(id);
    if (record === null) return;
    move(record, 'stopped', record.supervision === 'managed' ? 'stopped by the host' : 'no longer watched');
    const channel = channels.get(id);
    if (channel !== undefined) await channel.kill();
    channels.delete(id);
    record.pid = null;
  }

  return Object.freeze({
    register,
    start,
    check,
    stop,
    stopAll: async () => { for (const id of [...apps.keys()]) await stop(id); },
    get,
    ids: () => [...apps.keys()],
    describe: () => [...apps.values()].map(publicly),
  });
}
