// The MINIMAL line-based reader for `.github/workflows/verify.yml`, shared by the two test
// files that assert properties of it. Not a test file: the name does not match the
// `node --test` discovery patterns.
//
// A YAML dependency is refused — zero runtime dependencies, and a dev one for a 90-line file
// is a supply-chain risk for nothing. In exchange the workflow must stay in the plain shape
// this reader understands, which is itself asserted in ci-workflow.test.mjs (two-space indent,
// no anchors, no flow mappings at the top level).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../tools/gates/scan.mjs';

/** The repository-relative path of the workflow under test. */
export const WORKFLOW = '.github/workflows/verify.yml';

export const text = readFileSync(join(ROOT, WORKFLOW), 'utf8');

export const lines = text.replace(/\r/g, '').split('\n');

export const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** The lines of a top-level block, without its key line and with the indent removed.
 * @param {string} key @returns {string[]} */
export function block(key) {
  const start = lines.findIndex((line) => line === `${key}:` || line.startsWith(`${key}: `));
  if (start === -1) return [];
  /** @type {string[]} */
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) break;
    out.push(line.trim());
  }
  return out;
}

/** Every `key: value` pair at any depth, as the values seen in file order.
 * @param {string} key @returns {string[]} */
export const valuesOf = (key) => lines
  .map((line) => new RegExp(`^\\s*(?:- )?${key}:\\s*(.*)$`).exec(line.replace(/\r/g, '')))
  .filter((match) => match !== null)
  .map((match) => (match[1] ?? '').trim());

/** The lines of every step whose `name:` starts with `label`, as one string per step.
 * @param {string} label @returns {string[]} */
export function stepsNamed(label) {
  /** @type {string[]} */
  const found = [];
  lines.forEach((line, at) => {
    if (!new RegExp(`^\\s*- name: ${label}\\b`).test(line)) return;
    /** @type {string[]} */
    const body = [];
    for (const next of lines.slice(at + 1)) {
      if (/^\s*- /.test(next)) break;
      body.push(next.trim());
    }
    found.push(body.join('\n'));
  });
  return found;
}
