// Port granting: least privilege on the outside world, as one pure decision.
//
// A port is a function the HOST owns and the plugin may be handed. The rule is that a
// plugin sees exactly the ports whose permission it declared — an undeclared port is
// not refused at call time, it is invisible: there is no handle to misuse. Keeping
// this out of `lifecycle.mjs` means the rule can be read, and tested, on its own.
import { KernelError, PERMISSIONS } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').PortFn} PortFn */

/**
 * Pure: the ports a plugin may SEE, given what it declared.
 * Least privilege by construction — an undeclared port is not refused at call
 * time, it is invisible: there is no handle to misuse.
 * @param {Record<string, unknown>} [ports] what the host offered, still untrusted
 * @param {string[]} [declared] the permissions the manifest declared
 * @returns {{ granted: Readonly<Record<string, PortFn>>, denied: string[] }}
 */
export function grantPorts(ports = {}, declared = []) {
  /** @type {Record<string, PortFn>} */
  const granted = {};
  /** @type {string[]} */
  const denied = [];
  for (const [name, raw] of Object.entries(ports)) {
    // The cast says what is about to be CHECKED, not what is already known: the two
    // `typeof` guards below are the proof, and nothing passes without them.
    const descriptor = /** @type {{ permission?: unknown, fn?: PortFn }} */ (raw);
    if (typeof descriptor.permission !== 'string' || typeof descriptor.fn !== 'function') {
      throw new KernelError('CONTRACT_INVALID', `port "${name}" must be {permission, fn}`, [
        { path: `ports.${name}`, message: 'expected {permission, fn}' },
      ]);
    }
    if (!PERMISSIONS.includes(descriptor.permission)) {
      throw new KernelError('PERMISSION_DENIED', `port "${name}" names an unknown permission`, [
        { path: `ports.${name}.permission`, message: `unknown permission "${descriptor.permission}"` },
      ]);
    }
    if (declared.includes(descriptor.permission)) granted[name] = descriptor.fn;
    else denied.push(name);
  }
  return { granted: Object.freeze(granted), denied };
}
