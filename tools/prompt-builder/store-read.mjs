// store-read.mjs — the Builder's CAPPED reads, and the ceilings themselves.
//
// `store.mjs` is the one module that touches the filesystem; this is the part of it that reads
// bytes somebody else may have written. It lives apart for two reasons: `store.mjs` is at the
// 200-line rule, and a ceiling is a decision a reviewer should be able to find without reading
// a walker.
//
// EVERY read here is bounded BEFORE the bytes are loaded. `JSON.parse` on an unbounded file is
// how a 2 GB document becomes an out-of-memory crash instead of a refusal, and a refusal is the
// only outcome this tool is allowed to have: the Builder interviews a human, so a file it
// cannot handle must produce a sentence that person can act on.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BuilderError } from './errors.mjs';

/**
 * The ceiling on one of OUR documents — the draft and the approved contract.
 *
 * Both are records of a conversation: a few dozen entries of a few hundred characters, which is
 * kilobytes. One megabyte is therefore a thousandfold allowance over anything the Builder has
 * ever written, chosen so that no real session can meet it and no hand-edited file can make the
 * process die instead of answering. It is a limit on THIS TOOL, not a statement about JSON.
 */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;

/** The ceiling on a manifest read from the project under inspection. Smaller than the one
 * above because the Builder reads only four of them and parses one field of one. */
export const MAX_MANIFEST_BYTES = 64 * 1024;

/** The only files whose CONTENT is read during inspection. */
export const MANIFEST_FILES = Object.freeze(['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']);

/**
 * Parses one of our documents, or refuses — with the size asked FIRST, so the refusal for an
 * oversized file says so instead of arriving as a parse failure or not arriving at all. An
 * unreadable file and an unparseable one are the same answer on purpose: either way the honest
 * instruction is to move it aside.
 * @param {string} file @param {string} code @param {string} label @returns {unknown}
 */
export function readDocument(file, code, label) {
  /** @type {number} */
  let size;
  try {
    size = statSync(file).size;
  } catch {
    throw new BuilderError(code, `${label} cannot be read — move it aside to start over`);
  }
  if (size > MAX_DOCUMENT_BYTES) {
    throw new BuilderError(
      code,
      `${label} is ${size} bytes, past the ${MAX_DOCUMENT_BYTES}-byte ceiling for a Builder `
      + 'document — move it aside to start over',
      { bytes: size, limit: MAX_DOCUMENT_BYTES },
    );
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new BuilderError(code, `${label} is not valid JSON — move it aside to start over`);
  }
}

/** The text of one manifest in `dir`, or `undefined`: not a manifest, too big, or unreadable.
 * Never a partial read — a truncated manifest would be parsed as a different document.
 * @param {string} dir @param {string} name @returns {string | undefined} */
export function manifestText(dir, name) {
  if (!MANIFEST_FILES.includes(name)) return undefined;
  try {
    const full = join(dir, name);
    if (statSync(full).size > MAX_MANIFEST_BYTES) return undefined;
    return readFileSync(full, 'utf8');
  } catch {
    return undefined;
  }
}
