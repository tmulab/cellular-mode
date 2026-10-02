// text.stats — the first vertical slice: a plugin over an existing library.
//
// The domain code is NOT rewritten here. `examples/text-stats/src/text-stats.mjs`
// already counts words and estimates reading time, with its own tests; this file
// is the CONTRACT around it: schemas at both ends, a key, a dev-UI fragment and a
// reversible memo cache. A plugin is a seam, not a second implementation.
//
// It imports the SDK and shared domain code only. Never the kernel (the kernel is
// not privileged), never a sibling plugin, never the host.
import { definePlugin } from '../../sdk/index.mjs';
import { countWords, readingTime } from '../../../examples/text-stats/src/text-stats.mjs';
import { DEV_UI_HTML } from './dev-ui.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('../../sdk/types.mjs').Config} Config */

/** Big enough for a long article, small enough that nobody can post a book. */
export const MAX_TEXT = 100000;
const DEFAULT_WPM = 200;
/** Entries kept before the oldest is dropped. A cache with no bound is a leak. */
const CACHE_LIMIT = 50;

/** @type {Schema} */
const TEXT = { type: 'string', maxLength: MAX_TEXT };
/** @type {Schema} */
const WPM = { type: 'integer', minimum: 50, maximum: 1000 };
/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

export default definePlugin({
  name: 'text.stats',
  version: '1.0.0',
  sdk: '1',
  description: 'Counts words and estimates reading time for a piece of text.',
  // No inject: this plugin is a Definition+Provider, it owes nothing to a sibling.
  // No permissions: it touches no port. Counting words is not an act in the world.
  config: obj({ defaultWpm: WPM }, []),
  capabilities: {
    'count-words': {
      description: 'Number of whitespace-separated words, Unicode-aware.',
      consequential: false,
      input: obj({ text: TEXT }, ['text']),
      output: obj({ words: { type: 'integer', minimum: 0 } }, ['words']),
    },
    'reading-time': {
      description: 'Minutes needed to read the text, rounded up; zero words is zero minutes.',
      consequential: false,
      input: obj({ text: TEXT, wpm: WPM }, ['text']),
      output: obj({ minutes: { type: 'integer', minimum: 0 } }, ['minutes']),
    },
  },
  /** @param {PluginContext} ctx @param {Config} config */
  apply(ctx, config) {
    // `reading-time` counts the same text `count-words` just counted, so the count
    // is memoised. The cache is an EFFECT, therefore it has an inverse: the plugin
    // must be able to leave the composition without leaving memory behind.
    /** @type {Map<string, number>} */
    const cache = new Map();
    ctx.onDispose(() => cache.clear());
    // `config` is a bag of `unknown`; the config schema above declares `defaultWpm`
    // as an integer, so that declaration is restated once here, not at each call.
    const configuredWpm = () => /** @type {number | undefined} */ (config.defaultWpm);

    /** @type {(text: string) => number} */
    const words = (text) => {
      const hit = cache.get(text);
      if (hit !== undefined) return hit;
      const value = countWords(text);
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(text, value);
      return value;
    };

    return {
      /** @param {{ text: string }} input */
      'count-words': ({ text }) => ({ words: words(text) }),
      /** @param {{ text: string, wpm?: number }} input */
      'reading-time': ({ text, wpm }) => ({
        minutes: readingTime(text, { wpm: wpm ?? configuredWpm() ?? DEFAULT_WPM }),
      }),
      /** Sibling-facing contract method (not a capability): used through `inject`.
       * @type {(text: string, wpm?: number) => { words: number, minutes: number }} */
      measure: (text, wpm) => ({
        words: words(text),
        minutes: readingTime(text, { wpm: wpm ?? configuredWpm() ?? DEFAULT_WPM }),
      }),
      /** Diagnostic: lets a test observe that the inverse effect really ran. */
      cacheSize: () => cache.size,
    };
  },
  devUi: { title: 'Text statistics', html: DEV_UI_HTML },
});
