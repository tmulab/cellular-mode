// Test doubles for the kernel suite: three plugins that behave like real ones.
// Not a test file (the name does not match `node --test` discovery).
//
// `metrics.collector` is a Definition+Provider: it owns its key and holds state.
// `report.archive`    is a Consumer with a required sibling and a write PORT.
// `locale.formatter`  is a Consumer whose sibling is OPTIONAL — it degrades.
import { definePlugin } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('../sdk/types.mjs').Config} Config */

/** @type {Schema} */
const STRING = { type: 'string', minLength: 1 };
/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/**
 * The sibling contract these doubles agreed on. `ctx.get` returns `unknown` by
 * design — a sibling is known by contract, never by import — so the contract is
 * stated once, here, instead of being guessed at each call site.
 * @type {(ctx: PluginContext, key: string) => { total: () => number }}
 */
const sibling = (ctx, key) => /** @type {{ total: () => number }} */ (ctx.get(key));

/** Records the order in which inverse effects ran, per load. Shared, inspectable.
 * @type {string[]} */
export const teardownLog = [];

export const metricsCollector = definePlugin({
  name: 'metrics.collector',
  version: '1.2.0',
  sdk: '1',
  description: 'In-memory counters for the running composition.',
  config: obj({ label: STRING, windowMs: { type: 'integer', minimum: 1000 } }, ['label']),
  capabilities: {
    sample: {
      description: 'Record one observation and return the running count.',
      consequential: false,
      input: obj({ name: STRING, value: { type: 'number' } }, ['name', 'value']),
      output: obj({ name: STRING, count: { type: 'integer' }, label: STRING }, ['name', 'count', 'label']),
    },
    'flush-window': {
      description: 'Await the open window, then clear it. Honours cancellation.',
      consequential: false,
      input: obj({ delayMs: { type: 'integer', minimum: 0 } }, ['delayMs']),
      output: obj({ cleared: { type: 'integer' } }, ['cleared']),
    },
    'mis-shaped': {
      description: 'Declares a count but returns a string — an output-contract breach.',
      consequential: false,
      input: obj({}, []),
      output: obj({ count: { type: 'integer' } }, ['count']),
    },
  },
  /** @param {PluginContext} ctx @param {Config} config */
  apply(ctx, config) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    // Two effects, registered in this order; the inverses must run in reverse.
    ctx.onDispose(() => teardownLog.push('close-window'));
    ctx.onDispose(() => teardownLog.push('clear-counters'));
    return {
      /** @param {{ name: string }} input */
      sample({ name }) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        return { name, count: counts.get(name), label: config.label };
      },
      /** @param {{ delayMs: number }} input
       * @param {{ signal?: AbortSignal }} [meta] */
      async 'flush-window'({ delayMs }, { signal } = {}) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          }, { once: true });
        });
        const cleared = counts.size;
        counts.clear();
        return { cleared };
      },
      'mis-shaped': () => ({ count: 'not-a-number' }),
      /** Not a capability: a sibling-facing contract method, used through inject. */
      total: () => [...counts.values()].reduce((a, b) => a + b, 0),
    };
  },
});

export const reportArchive = definePlugin({
  name: 'report.archive',
  version: '0.4.1',
  sdk: '1',
  description: 'Writes metric snapshots through a host-provided write port.',
  inject: { 'metrics.collector': { required: true } },
  permissions: ['fs.write'],
  config: obj({ prefix: STRING }, ['prefix']),
  capabilities: {
    'store-snapshot': {
      description: 'Persist the current totals. Consequential: it leaves a file.',
      consequential: true,
      input: obj({ name: STRING }, ['name']),
      output: obj({ path: STRING, total: { type: 'integer' } }, ['path', 'total']),
    },
    'visible-ports': {
      description: 'Diagnostic: which ports this plugin can actually see.',
      consequential: false,
      input: obj({}, []),
      output: obj({ names: { type: 'array', items: STRING } }, ['names']),
    },
  },
  /** @param {PluginContext} ctx @param {Config} config */
  apply(ctx, config) {
    // The PORT does not degrade: a plugin that writes without a writer is worse
    // than one that refuses to load. Keys degrade, ports fail loud.
    const writeBlob = ctx.ports.writeBlob;
    if (typeof writeBlob !== 'function') {
      throw new Error('config port "writeBlob" is mandatory for report.archive');
    }
    return {
      /** @param {{ name: string }} input */
      async 'store-snapshot'({ name }) {
        const total = sibling(ctx, 'metrics.collector').total();
        const path = `${config.prefix}/${name}.json`;
        await writeBlob(path, JSON.stringify({ total }));
        return { path, total };
      },
      'visible-ports': () => ({ names: Object.keys(ctx.ports).sort() }),
    };
  },
});

export const localeFormatter = definePlugin({
  name: 'locale.formatter',
  version: '2.0.0',
  sdk: '1',
  description: 'Formats counts for display, with or without live metrics.',
  inject: { 'metrics.collector': { required: false } },
  capabilities: {
    'format-total': {
      description: 'Human-readable total; degrades to a placeholder when metrics are absent.',
      consequential: false,
      input: obj({}, []),
      output: obj({ text: STRING, degraded: { type: 'boolean' } }, ['text', 'degraded']),
    },
  },
  /** @param {PluginContext} ctx */
  apply(ctx) {
    return {
      'format-total': () => {
        // Assembled at CALL time: the sibling may arrive after this plugin loaded.
        const metrics = ctx.get('metrics.collector');
        if (metrics === undefined) return { text: 'no metrics available', degraded: true };
        return { text: `${sibling(ctx, 'metrics.collector').total()} observation(s)`, degraded: false };
      },
    };
  },
});

/** A host port descriptor plus the log of what it wrote. */
export function makeWritePort() {
  /** @type {Array<{ path: unknown, body: unknown }>} */
  const written = [];
  return {
    written,
    port: {
      permission: 'fs.write',
      /** @type {(path: unknown, body: unknown) => Promise<void>} */
      fn: async (path, body) => {
        written.push({ path, body });
      },
    },
  };
}

/** A port the doubles never declare a permission for — it must stay invisible. */
export const spawnPort = { permission: 'process.spawn', fn: () => 'never reachable' };
