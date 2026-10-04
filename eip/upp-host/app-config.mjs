// `upp.config.json` -> `applications`: which independently executed apps this host may know.
//
// An APPLICATION plugin is not a capability provider. It is an app with its own runtime,
// routes, rendering and release cadence (ADR 0001), and the kernel never loads it, never
// proxies its frontend and never hands it a port. What the host does with it is narrow and
// stated here: it may KNOW it (a pinned manifest and a registered identity), it may WATCH it
// (health), and — only for `supervision: "managed"` — it may START and STOP it with the
// existing single spawn site.
//
// Two supervision modes, because deployment authority is not a detail:
//   · "managed"  — the operator gives an argv command; the host owns the process lifetime.
//   · "external" — it already runs somewhere else; the host MUST NOT be given a command, so
//     a reader of the file can tell at a glance who is responsible for the deployment.
//
// PURE: rules over parsed JSON. Nothing here reads disk, spawns, or opens a socket.
import { closedObject } from '../upp/sections.mjs';
import { checkArgv, checkEnv, checkPin, checkTimeouts, err, isText } from './entry-rules.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {Record<string, unknown>} Raw */

export const SUPERVISION_MODES = Object.freeze(['managed', 'external']);

export const APPLICATION_FIELDS = Object.freeze([
  'id', 'supervision', 'command', 'cwd', 'env', 'allowRemote', 'manifestPath',
  'manifestSha256', 'timeouts', 'restart',
]);

/** @type {(raw: unknown, index: number, out: SchemaError[]) => void} */
function checkApplication(raw, index, out) {
  const at = `applications.${index}`;
  const entry = closedObject(raw, at, APPLICATION_FIELDS, out);
  if (entry === null) return;
  if (!isText(entry.id)) out.push(err(`${at}.id`, 'id must be the application key, e.g. "observer.ui"'));
  checkPin(entry, at, out);
  if (entry.supervision === 'managed') {
    checkArgv(entry.command, `${at}.command`, out);
  } else if (entry.supervision === 'external') {
    if (entry.command !== undefined) {
      out.push(err(`${at}.command`,
        'an external application is not started by this host — remove the command, or declare supervision:"managed"'));
    }
  } else {
    out.push(err(`${at}.supervision`, `supervision must be one of ${SUPERVISION_MODES.join(', ')}`));
  }
  if (entry.cwd !== undefined && !isText(entry.cwd)) out.push(err(`${at}.cwd`, 'cwd must be a path'));
  if (entry.allowRemote !== undefined && typeof entry.allowRemote !== 'boolean') {
    out.push(err(`${at}.allowRemote`,
      'allowRemote must be a boolean: without it a non-loopback application baseUrl is refused'));
  }
  if (entry.restart !== undefined && typeof entry.restart !== 'boolean') {
    out.push(err(`${at}.restart`, 'restart must be a boolean: at most ONE automatic restart is ever attempted'));
  }
  checkEnv(entry, at, out);
  checkTimeouts(entry, at, out);
}

/**
 * Validate the `applications` array of a parsed `upp.config.json`. An ABSENT array is legal
 * and authorises nothing — which is also the safe default: a host that never mentions an
 * application never registers one.
 * @param {unknown} value @param {SchemaError[]} out
 */
export function checkApplications(value, out) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    out.push(err('applications', 'applications must be an array — an absent array authorises nothing'));
    return;
  }
  /** @type {Set<string>} */
  const seen = new Set();
  value.forEach((entry, index) => {
    checkApplication(entry, index, out);
    const id = /** @type {Raw} */ (entry ?? {}).id;
    if (typeof id === 'string') {
      if (seen.has(id)) {
        out.push(err(`applications.${index}.id`, `duplicate id "${id}": one authorisation per application`));
      }
      seen.add(id);
    }
  });
}

/** The entry authorising the application `id`, or `null`. The ONLY way the registry learns a
 * command or a directory: an id this returns `null` for is never started and never contacted.
 * @param {unknown} config a config that has passed `validateUppConfig`
 * @param {string} id @returns {Raw | null} */
export function applicationAuthorizationFor(config, id) {
  const applications = /** @type {Raw} */ (config ?? {}).applications;
  if (!Array.isArray(applications)) return null;
  const hit = applications.find((entry) => /** @type {Raw} */ (entry ?? {}).id === id);
  return hit === undefined ? null : /** @type {Raw} */ (hit);
}
