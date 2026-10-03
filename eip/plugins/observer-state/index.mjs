// observer.state — the vault, as structured data. READ-ONLY, by construction.
//
// The whole observer is an OPTIONAL plugin on the existing runtime: delete this
// directory and Cellular Mode is unchanged, because the method never imports it (the
// arrow is checked by `tools/gates/boundaries.mjs`). It declares exactly one
// permission, `fs.read`, so the host hands it two confined readers and nothing else;
// a `writeFile` port the host happens to offer is INVISIBLE here — there is no handle
// to misuse.
//
// Three things it deliberately does NOT do:
//   it does not parse the vault (the `tools/cellmode` pure modules do);
//   it does not build a path (the read port does, inside one directory);
//   it does not return a path, a file's raw text, or anything absolute.
import { KernelError, definePlugin } from '../../sdk/index.mjs';
import { CELL_ID, readModel } from './model.mjs';
import { buildGraph } from './layout.mjs';
import { CAPABILITIES, DEFAULT_TIMELINE_LIMIT } from './schemas.mjs';
import { cellDetail, cells, overview, timeline } from './views.mjs';

/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('./types.mjs').Model} Model */

/**
 * The SDK schema subset has no `pattern` keyword, on purpose: the subset is the entire
 * vocabulary two plugins may disagree in. So the charset half of the id contract is
 * checked here, as a NAMED error. `INPUT_INVALID` is one of the SDK's
 * `PASSTHROUGH_CODES`, so the kernel answers it with that code and this message:
 * a client error is the plugin's own answer to give. Authority codes are not - a
 * plugin cannot throw `APPROVAL_*` or `PERMISSION_DENIED` and be believed.
 * @param {string} id @returns {string}
 */
export function assertCellId(id) {
  if (!CELL_ID.test(id)) {
    throw new KernelError('INPUT_INVALID', `a cell id must match ${CELL_ID.source}`, [
      { path: 'id', message: 'lower-case letters, digits and dashes, 1..80 characters' },
    ]);
  }
  return id;
}

export default definePlugin({
  name: 'observer.state',
  version: '1.0.0',
  sdk: '1',
  description: 'Reads a Cellular Mode vault and publishes it as structured, validated, read-only data.',
  // No inject: observer.state is the floor of the observer. The auditor and the
  // advisor inject IT, never the other way round.
  permissions: ['fs.read'],
  config: {
    type: 'object', properties: {}, required: [], additionalProperties: false,
  },
  capabilities: CAPABILITIES,
  /** @param {PluginContext} ctx */
  apply(ctx) {
    // Mandatory ports are checked HERE, at load. A reader that accepts work and
    // answers from nothing is worse than one that refuses to exist. This is also what
    // catches a host offering the ports under the wrong permission: an undeclared
    // port is invisible, so `typeof` is the only honest test.
    const readVault = ctx.ports.readVault;
    const listCells = ctx.ports.listCells;
    if (typeof readVault !== 'function' || typeof listCells !== 'function') {
      throw new Error('ports "readVault" and "listCells" (permission fs.read) are mandatory for observer.state');
    }
    /** @type {(name: string) => Promise<string | null>} */
    const read = async (name) => {
      const text = await readVault(name);
      return typeof text === 'string' ? text : null;
    };
    /** @type {() => Promise<string[]>} */
    const list = async () => {
      const slugs = await listCells();
      return Array.isArray(slugs) ? slugs.filter((s) => typeof s === 'string') : [];
    };

    // The one effect this plugin has, and it has an inverse: a per-capability call
    // count, in memory, for diagnostics. Observability must not mean residue.
    /** @type {Map<string, number>} */
    const calls = new Map();
    ctx.onDispose(() => calls.clear());
    /** @type {(cap: string) => Promise<Model>} */
    const model = async (cap) => {
      calls.set(cap, (calls.get(cap) ?? 0) + 1);
      // Read fresh on every call: the vault is a handful of small Markdown files, and
      // a dashboard that shows a cached project is a dashboard that lies quietly.
      return readModel(read, list);
    };

    return {
      overview: async () => overview(await model('overview')),
      cells: async () => cells(await model('cells')),
      /** @param {{ id: string }} input */
      'cell-detail': async ({ id }) => {
        assertCellId(id);
        const detail = cellDetail(await model('cell-detail'), id);
        if (detail === null) {
          throw new KernelError('NOT_FOUND', `no cell with id "${id}" in INDEX.md`, [
            { path: 'id', message: 'not a cell of this vault' },
          ]);
        }
        return detail;
      },
      graph: async () => {
        const { nodes, edges, dangling, layout } = buildGraph(await model('graph'));
        return { nodes, edges, dangling, layout };
      },
      /** @param {{ limit?: number, cell?: string }} [input] */
      timeline: async (input = {}) => {
        if (input.cell !== undefined) assertCellId(input.cell);
        return timeline(await model('timeline'), {
          limit: input.limit ?? DEFAULT_TIMELINE_LIMIT,
          ...(input.cell === undefined ? {} : { cell: input.cell }),
        });
      },
      /** Sibling-facing contract method (not a capability): the auditor injects
       * `observer.state` and asks for the model rather than re-reading the vault.
       * @type {() => Promise<Model>} */
      model: () => model('model'),
      /** Diagnostic: lets a test observe that the inverse effect really ran. */
      callCounts: () => calls.size,
      /** Diagnostic: what the outside world actually looks like from in here. A port
       * the plugin did not declare is INVISIBLE, and this is how a test sees that. */
      portNames: () => Object.keys(ctx.ports).sort(),
    };
  },
});
