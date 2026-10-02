// Load and dispose. Two promises live here:
//   1. a registration is a reversible EFFECT — dispose leaves zero residue;
//   2. a sibling capability is assembled at CALL time, never at apply time, so
//      load order is irrelevant and nobody holds a stale reference.
//
// Port granting is the neighbouring rule and lives in `ports.mjs`: least privilege is
// one decision, taken once, and it is testable without a lifecycle around it.
import { KernelError, check, messageOf } from '../sdk/index.mjs';
import { grantPorts } from './ports.mjs';
import { findRequiredCycle, missingRequired } from './registry.mjs';

/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */
/** @typedef {import('../sdk/types.mjs').Config} Config */
/** @typedef {import('../sdk/types.mjs').PortFn} PortFn */
/** @typedef {import('../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('./types.mjs').Instance} Instance */

/**
 * @param {{ registry: import('./types.mjs').Registry,
 *   events: import('./types.mjs').Events }} wiring
 */
export function createLifecycle({ registry, events }) {
  /** @type {Map<string, Instance>} */
  const instances = new Map();

  /** @type {(key: string) => boolean} */
  const isLoaded = (key) => instances.has(key);
  /** @type {(key: string) => string[]} */
  const loadedDependents = (key) => registry.dependentsOf(key).filter(isLoaded);

  /** @param {string} key @returns {Record<string, unknown>} */
  function serviceOf(key) {
    const instance = instances.get(key);
    if (instance === undefined) {
      throw new KernelError('NOT_FOUND', `key "${key}" is registered but not loaded`);
    }
    return instance.service;
  }

  /** Lazy sibling lookup. Required-and-absent fails loud; optional degrades.
   * @param {Manifest} manifest @param {string} depKey @returns {unknown}
   */
  function resolve(manifest, depKey) {
    const spec = manifest.inject?.[depKey];
    if (spec === undefined) {
      throw new KernelError(
        'DEPENDENCY_MISSING',
        `"${manifest.name}" did not declare "${depKey}" in inject — undeclared access`,
        [{ path: `inject.${depKey}`, message: 'not declared' }],
      );
    }
    const instance = instances.get(depKey);
    if (instance !== undefined) return instance.service;
    if (spec.required) {
      throw new KernelError(
        'DEPENDENCY_MISSING',
        `required dependency "${depKey}" of "${manifest.name}" is not loaded`,
        [{ path: `inject.${depKey}`, message: 'registered but not loaded' }],
      );
    }
    return undefined; // optional: the consumer degrades on purpose
  }

  /**
   * @param {Manifest} manifest @param {Config} config
   * @param {Readonly<Record<string, PortFn>>} ports @param {Array<() => unknown>} disposers
   * @returns {PluginContext}
   */
  function makeContext(manifest, config, ports, disposers) {
    return Object.freeze({
      key: manifest.name,
      config,
      ports,
      get: (depKey) => resolve(manifest, depKey),
      /** @type {<T extends () => unknown>(fn: T) => T} */
      onDispose(fn) {
        if (typeof fn !== 'function') throw new TypeError('onDispose expects a function');
        disposers.push(fn);
        return fn;
      },
      // A plugin cannot forge a kernel event type: everything it emits is a
      // `plugin` event carrying its own key.
      emit: (detail) => events.emit({ type: 'plugin', key: manifest.name, detail }),
    });
  }

  /**
   * @param {string} key
   * @param {{ config?: Config, ports?: Record<string, unknown> }} [options]
   * @returns {Promise<Record<string, unknown>>} the service object `apply` returned
   */
  async function load(key, { config = {}, ports = {} } = {}) {
    const started = Date.now();
    const manifest = registry.get(key);
    if (instances.has(key)) {
      throw new KernelError('DUPLICATE_KEY', `key "${key}" is already loaded`);
    }
    const configCheck = check(manifest.config, config);
    if (!configCheck.ok) {
      throw new KernelError(
        'INPUT_INVALID',
        `config for "${key}" is invalid (${configCheck.errors.length} problem(s))`,
        configCheck.errors.map((e) => ({ path: `config${e.path ? `.${e.path}` : ''}`, message: e.message })),
      );
    }
    const absent = missingRequired(registry.manifests, manifest);
    if (absent.length > 0) {
      throw new KernelError(
        'DEPENDENCY_MISSING',
        `"${key}" requires unregistered key(s): ${absent.join(', ')}`,
        absent.map((dep) => ({ path: `inject.${dep}`, message: 'not registered' })),
      );
    }
    const cycle = findRequiredCycle(registry.manifests, key);
    if (cycle !== null) {
      throw new KernelError(
        'DEPENDENCY_CYCLE',
        `required inject cycle: ${cycle.join(' -> ')}`,
        [{ path: 'inject', message: cycle.join(' -> ') }],
      );
    }
    const { granted, denied } = grantPorts(ports, manifest.permissions ?? []);
    /** @type {Array<() => unknown>} */
    const disposers = [];
    const ctx = makeContext(manifest, config, granted, disposers);
    let service;
    try {
      service = await manifest.apply(ctx, config);
    } catch (cause) {
      await runDisposers(key, disposers); // zero residue even on a failed apply
      events.emit({ type: 'error', key, ok: false, code: 'PLUGIN_ERROR', ms: Date.now() - started });
      throw new KernelError('PLUGIN_ERROR', `apply of "${key}" failed: ${messageOf(cause)}`);
    }
    if (service === null || typeof service !== 'object') {
      await runDisposers(key, disposers);
      throw new KernelError('CONTRACT_INVALID', `apply of "${key}" must return a service object`, [
        { path: 'apply', message: 'expected an object implementing the declared capabilities' },
      ]);
    }
    // The two guards above proved `service` is a non-null object; the assertion
    // only records which kind of object the lifecycle keeps.
    const live = /** @type {Record<string, unknown>} */ (service);
    instances.set(key, { key, manifest, config, service: live, disposers, ports: granted });
    events.emit({ type: 'load', key, ms: Date.now() - started, grantedPorts: Object.keys(granted), deniedPorts: denied });
    return live;
  }

  /**
   * @param {string} key @param {Array<() => unknown>} disposers
   * @returns {Promise<string[]>} the message of every inverse that failed
   */
  async function runDisposers(key, disposers) {
    /** @type {string[]} */
    const failures = [];
    for (const fn of [...disposers].reverse()) {
      try {
        await fn();
      } catch (cause) {
        failures.push(messageOf(cause));
      }
    }
    disposers.length = 0;
    if (failures.length > 0) {
      events.emit({ type: 'error', key, ok: false, code: 'PLUGIN_ERROR' });
    }
    return failures;
  }

  /** @param {string} key @returns {Promise<void>} */
  async function dispose(key) {
    const started = Date.now();
    const instance = instances.get(key);
    if (instance === undefined) {
      throw new KernelError('NOT_FOUND', `key "${key}" is not loaded`);
    }
    const inUse = loadedDependents(key);
    if (inUse.length > 0) {
      throw new KernelError(
        'DEPENDENCY_IN_USE',
        `"${key}" is required by loaded plugin(s): ${inUse.join(', ')} — dispose them first`,
        inUse.map((dep) => ({ path: dep, message: 'declares this key as required' })),
      );
    }
    instances.delete(key); // removed first: the service is unreachable while unwinding
    const failures = await runDisposers(key, instance.disposers);
    events.emit({ type: 'dispose', key, ok: failures.length === 0, ms: Date.now() - started });
    if (failures.length > 0) {
      throw new KernelError('PLUGIN_ERROR', `dispose of "${key}" had ${failures.length} failing inverse(s)`,
        failures.map((message) => ({ path: 'onDispose', message })));
    }
  }

  return { load, dispose, isLoaded, serviceOf, instances, loadedDependents };
}
