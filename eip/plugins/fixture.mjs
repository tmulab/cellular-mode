// Composition helpers for the plugin suite. NOT a plugin and not a test file:
// it builds a kernel, which is exactly what a plugin may never do. That is why it
// lives here, one level above `eip/plugins/<name>/`, and why the plugin
// directories themselves stay free of any kernel import.
import { createKernel } from '../kernel/index.mjs';
import textStats from './text-stats/index.mjs';
import textReport from './text-report/index.mjs';

export { textStats, textReport };

/** A write port that records instead of writing, and returns the relative path.
 * @param {string} [permission] */
export function recordingPort(permission = 'fs.write') {
  /** @type {Array<{ path: unknown, body: unknown }>} */
  const written = [];
  /** @type {(path: unknown, body: unknown) => Promise<unknown>} */
  const fn = async (path, body) => { written.push({ path, body }); return path; };
  return { written, ports: { writeFile: { permission, fn } } };
}

/** An approver that says yes to everything, and logs what it was asked.
 * @param {unknown[]} [log] */
export function sayYes(log = []) {
  /** @type {import('../kernel/types.mjs').Approver} */
  const approver = (request) => { log.push(request); return { approved: true, by: 'test-human' }; };
  return { log, approver };
}

/** Both plugins registered. Loading is left to the test: load order is a claim.
 * @param {Parameters<typeof createKernel>[0]} [options] */
export function registerBoth(options = {}) {
  const kernel = createKernel(options);
  kernel.register(textStats);
  kernel.register(textReport);
  return kernel;
}

/** The usual composition: provider, then consumer with its write port.
 * @param {Parameters<typeof createKernel>[0]} [options] */
export async function loadBoth(options = {}) {
  const kernel = registerBoth(options);
  const writer = recordingPort();
  await kernel.load('text.stats', {});
  await kernel.load('text.report', { ports: writer.ports });
  return { kernel, writer };
}

/** A 69-word paragraph: realistic input, countable by hand. */
export const PARAGRAPH = [
  'The composition is the only place that knows every part, and that is precisely',
  'what keeps the other parts independent of one another. A plugin declares what it',
  'provides, what it needs from a sibling, and which permissions it expects; the',
  'host decides whether any of that will actually be granted today. Nothing here is',
  'a privileged core, because a core nobody can replace is a core nobody audits.',
].join(' ');
