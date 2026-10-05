// sensitive.mjs — "may this text be recorded?", as pure detectors over a string.
//
// Discovery collects ordinary-language answers and stores them in a file; a later cell
// quotes the same answers inside an exported prompt. So the cheapest place to stop a
// credential or a machine-local path from being recorded is the moment it is typed. Both
// detectors are exported because the export step (Cell 5) must ask the SAME question again:
// two copies of these shapes would drift, and the one that drifts is the one nobody runs.
//
// Every detector source is assembled from fragments at runtime, exactly as
// tools/gates/secrets.mjs does it, so THIS FILE contains no literal match and never flags
// itself. A scanner that trips on its own rule book teaches people to add exclusions.
//
// WHAT THIS DOES NOT PROVE: nothing here proves an answer is safe. It proves that a handful
// of well-known credential shapes and machine-path shapes are absent. A credential with an
// unusual shape passes, which is why the refusal is a safeguard and not a guarantee.

/** @typedef {{ kind: string, re: RegExp, why: string }} Shape */
/** @typedef {{ kind: string, index: number, why: string }} Hit */

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

/** Credential shapes. `why` is written for the person who has to retype the answer.
 * @type {ReadonlyArray<Shape>} */
export const SECRET_SHAPES = Object.freeze([
  {
    kind: 'private-key',
    re: new RegExp(j('BEGIN ', '[A-Z ]*', 'PRIVATE KEY')),
    why: 'a private key block',
  },
  {
    kind: 'cloud-access-key-id',
    re: new RegExp(j('\\b', 'AKI', 'A', '[0-9A-Z]{16}', '\\b')),
    why: 'a cloud access key id',
  },
  {
    kind: 'forge-token',
    re: new RegExp(j('\\b', 'g', 'h', '[pousr]', '_', '[A-Za-z0-9]{16,}')),
    why: 'a code-forge access token',
  },
  {
    kind: 'forge-fine-grained-token',
    re: new RegExp(j('\\b', 'github', '_', 'pat', '_', '[A-Za-z0-9_]{16,}')),
    why: 'a code-forge fine-grained access token',
  },
  {
    kind: 'model-api-key',
    re: new RegExp(j('\\b', 's', 'k', '-', '(?:ant', '-)?', '[A-Za-z0-9_-]{16,}')),
    why: 'a model-provider API key',
  },
  {
    kind: 'chat-token',
    re: new RegExp(j('\\b', 'x', 'o', 'x', '[bapr]', '-', '[A-Za-z0-9-]{8,}')),
    why: 'a chat-platform token',
  },
  {
    kind: 'credential-assignment',
    re: new RegExp(
      j('\\b', '(?:pass', 'word|pass', 'wd|sec', 'ret|to', 'ken|api', '[_-]?', 'key)', '\\s*[:=]\\s*', '\\S{6,}'),
      'i',
    ),
    why: 'a credential-shaped name assigned a value',
  },
]);

/** Machine-local and personal path shapes. A project contract is meant to be readable on
 * somebody else's computer, and a home directory carries a person's name.
 * @type {ReadonlyArray<Shape>} */
export const PATH_SHAPES = Object.freeze([
  {
    kind: 'windows-path',
    re: new RegExp(j('\\b', '[A-Za-z]', ':', '[\\\\/]', '[^\\s]')),
    why: 'a drive-letter path, which only exists on one machine',
  },
  {
    kind: 'home-path',
    re: new RegExp(j('/', '(?:home|', 'Users', ')/', '[^\\s/]+')),
    why: 'a home directory, which carries a person and a machine',
  },
  {
    kind: 'home-shorthand',
    re: new RegExp(j('(?:^|\\s)', '~', '/')),
    why: 'a path relative to a home directory',
  },
]);

/** Contact shapes. A project contract describes a project, never a person: an address or a
 * telephone number inside one is somebody's personal data travelling into version control.
 * The telephone shapes are deliberately narrow (an international prefix, a bracketed area
 * code, or three groups separated by the usual punctuation) so that a version number, a
 * timestamp or a quantity is not mistaken for a person.
 * @type {ReadonlyArray<Shape>} */
export const CONTACT_SHAPES = Object.freeze([
  {
    kind: 'email-address',
    re: new RegExp(j('[A-Za-z0-9._%+-]+', '@', '[A-Za-z0-9.-]+', '\\.', '[A-Za-z]{2,}')),
    why: 'an e-mail address, which identifies a person',
  },
  {
    kind: 'phone-international',
    re: new RegExp(j('\\+', '[0-9]', '[0-9 ().-]{7,}', '[0-9]')),
    why: 'a telephone number with an international prefix',
  },
  {
    kind: 'phone-bracketed',
    re: new RegExp(j('\\(', '[0-9]{2,4}', '\\)', '[ .-]?', '[0-9]{3,5}', '[ .-]?', '[0-9]{3,5}')),
    why: 'a telephone number with a bracketed area code',
  },
  {
    kind: 'phone-grouped',
    re: new RegExp(j('\\b', '[0-9]{3}', '[ .-]', '[0-9]{3}', '[ .-]', '[0-9]{4}', '\\b')),
    why: 'a telephone number in three groups',
  },
]);

/** @type {(shapes: ReadonlyArray<Shape>, text: unknown) => Hit[]} */
function scan(shapes, text) {
  const haystack = String(text ?? '');
  /** @type {Hit[]} */
  const hits = [];
  for (const { kind, re, why } of shapes) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    for (const match of haystack.matchAll(new RegExp(re.source, flags))) {
      hits.push({ kind, index: match.index ?? 0, why });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** PURE. Every credential-shaped run in `text`, earliest first.
 * @param {unknown} text @returns {Hit[]} */
export function findSensitive(text) {
  return scan(SECRET_SHAPES, text);
}

/** PURE. Every absolute or personal filesystem path in `text`, earliest first.
 * @param {unknown} text @returns {Hit[]} */
export function findPersonalPaths(text) {
  return scan(PATH_SHAPES, text);
}

/** PURE. Every e-mail address or telephone number in `text`, earliest first.
 * @param {unknown} text @returns {Hit[]} */
export function findContacts(text) {
  return scan(CONTACT_SHAPES, text);
}
