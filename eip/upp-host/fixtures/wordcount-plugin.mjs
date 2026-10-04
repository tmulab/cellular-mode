// The conformance reference capability, written as an ORDINARY in-process plugin.
//
// Nothing about this file knows that UPP exists: it is a plain `definePlugin` manifest, of the
// kind the kernel has always loaded, and it would work identically with `eip/upp` deleted.
// That is the whole value of it for U10 — the in-process endpoint maps THIS manifest with the
// pure compat layer and answers the same corpus, so "an existing JS plugin satisfies UPP" is a
// measurement rather than a hope.
//
// The two schemas and the description are deliberately character-identical to
// `upp/conformance/manifest.json`, and a test asserts the projection is deep-equal to the
// reference manifest's `capabilities`. If one of them drifts, that test is the one that says so.
import { SDK_VERSION, definePlugin } from '../../sdk/index.mjs';

/** Words are runs of non-whitespace. Stated once, here, because every implementation in every
 * language has to agree on it for case 04 to be meaningful.
 * @param {string} text @returns {number} */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export const WORDCOUNT_INPUT = Object.freeze({
  type: 'object',
  properties: { text: { type: 'string', maxLength: 4096 } },
  required: ['text'],
  additionalProperties: false,
});

export const WORDCOUNT_OUTPUT = Object.freeze({
  type: 'object',
  properties: { words: { type: 'integer', minimum: 0 } },
  required: ['words'],
  additionalProperties: false,
});

export const wordcountPlugin = definePlugin({
  name: 'text.wordcount',
  version: '1.0.0',
  sdk: SDK_VERSION,
  description: 'Count the words in a text. The conformance reference capability, in-process.',
  config: { type: 'object', additionalProperties: false },
  capabilities: {
    wordcount: {
      description: 'Count the words in a text. Words are runs of non-whitespace.',
      consequential: false,
      input: WORDCOUNT_INPUT,
      output: WORDCOUNT_OUTPUT,
    },
  },
  apply: () => ({
    /** @param {unknown} input @returns {{ words: number }} */
    wordcount: (input) => ({ words: countWords(String(/** @type {{ text: unknown }} */ (input).text)) }),
  }),
});
