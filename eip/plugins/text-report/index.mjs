// text.report — the second slice: a CONSUMER with a consequential capability.
//
// Two lines of this file carry the architecture:
//   `inject` brings a sibling CAPABILITY (text.stats), resolved at call time;
//   `ports` brings the OUTSIDE WORLD (writeFile), handed over by the host.
// Keys degrade, ports fail loud — so a missing sibling could be survivable, but a
// missing writer makes `apply` refuse to load: a writer that accepts work and
// writes nothing is worse than one that says no.
//
// `save-report` is consequential: it leaves a file behind. The kernel will not run
// it without a verdict from a human approver the HOST supplied.
import { KernelError, definePlugin } from '../../sdk/index.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('../../sdk/types.mjs').Config} Config */

/** The sibling contract `text.stats` publishes, stated once instead of at each call.
 * `ctx.get` returns `unknown` by design: a sibling is known by contract, not by import.
 * @typedef {{ 'count-words': (input: { text: string }) => { words: number },
 *   'reading-time': (input: { text: string, wpm?: unknown }) => { minutes: number } }} TextStats
 */

/** Pattern-safe report name: a single path segment, nothing to interpret. */
export const NAME_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_TEXT = 100000;
/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/**
 * The SDK schema subset has no `pattern` keyword — on purpose: the subset is the
 * entire vocabulary two plugins may disagree in. So the charset is checked here,
 * as a NAMED error. The plugin cannot forge a kernel-level code: the kernel
 * contains this as `PLUGIN_ERROR` and keeps `INPUT_INVALID` in `details[0].path`.
 */
/** @param {string} name @returns {void} */
export function assertSafeName(name) {
  if (!NAME_PATTERN.test(name)) {
    throw new KernelError('INPUT_INVALID', 'report name must match ^[a-z0-9-]{1,40}$', [
      { path: 'name', message: 'lower-case letters, digits and dashes only' },
    ]);
  }
}

export default definePlugin({
  name: 'text.report',
  version: '1.0.0',
  sdk: '1',
  description: 'Saves a text measurement report through a host-provided write port.',
  inject: { 'text.stats': { required: true } },
  permissions: ['fs.write'],
  config: obj({ wpm: { type: 'integer', minimum: 50, maximum: 1000 } }, []),
  capabilities: {
    'save-report': {
      description: 'Measure the text and persist the report. Consequential: it leaves a file.',
      consequential: true,
      input: obj({
        name: { type: 'string', minLength: 1, maxLength: 40 },
        text: { type: 'string', maxLength: MAX_TEXT },
      }, ['name', 'text']),
      output: obj({
        path: { type: 'string', minLength: 1 },
        words: { type: 'integer', minimum: 0 },
        minutes: { type: 'integer', minimum: 0 },
      }, ['path', 'words', 'minutes']),
    },
  },
  /** @param {PluginContext} ctx @param {Config} config */
  apply(ctx, config) {
    // The mandatory port is checked HERE, at load. An undeclared or undelivered
    // port is invisible (least privilege by construction), so this is also what
    // catches a host that offers the port under the wrong permission.
    const writeFile = ctx.ports.writeFile;
    if (typeof writeFile !== 'function') {
      throw new Error('port "writeFile" (permission fs.write) is mandatory for text.report');
    }
    return {
      /** @param {{ name: string, text: string }} input */
      async 'save-report'({ name, text }) {
        assertSafeName(name);
        // Resolved at CALL time: load order is irrelevant and nobody holds a
        // stale handle. Required-and-absent raises DEPENDENCY_MISSING here.
        const stats = /** @type {TextStats} */ (ctx.get('text.stats'));
        const { words } = stats['count-words']({ text });
        const { minutes } = stats['reading-time']({ text, wpm: config.wpm });
        const report = {
          name, words, minutes, characters: text.length, generatedBy: ctx.key,
        };
        // The port returns the path RELATIVE to the host's reports directory: the
        // API must not publish where the filesystem keeps things.
        const path = await writeFile(`${name}.json`, JSON.stringify(report, null, 2));
        return { path, words, minutes };
      },
    };
  },
});
