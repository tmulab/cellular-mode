// adapters.mjs — one registry of export targets, each a POINTER and never a copy.
//
// docs/08-agent-integration.md states the rule this file obeys: "an adapter is the glue
// between a tool's convention and the canonical files… one canonical source, five pointers,
// zero drift". So an adapter here owns exactly two things — the sentences that say WHERE the
// method is written down for that tool, and the order the layers are assembled in. It receives
// already-built layer parts and cannot reach into a contract, which is what makes a contract
// adapter-independent: the same project data renders through any of them.
//
// WHAT IS NOT CLAIMED. Only `neutral` and `claude-code` are implemented. The other three are
// listed with `support: 'proposed'` and REFUSE to render, because the honest state of an
// integration nobody has run is "proposed", and a registry that silently renders something
// plausible for a tool it has never been tested against is how an untested claim ships. The
// entry exists so the interface is visible to whoever adds the real one.
//
// NO MODEL NAMES, NO CONTEXT SIZES, anywhere in this file or in what it produces: an adapter
// targets a TOOL's conventions, and a prompt that names a model or assumes a window expires
// the moment either changes. A test scans every adapter's output for a deny-list of them.
import { BuilderError, CODES } from './errors.mjs';

/** The already-built layers an adapter assembles. `header` is the one-line title (or the draft
 * warning); the other three are the method, project and cell layers.
 * @typedef {{ header: string, method: string, project: string, cell: string }} PromptParts */

/** @typedef {{ id: string, label: string, support: 'implemented' | 'proposed',
 *   pointer: ReadonlyArray<string>, render: (parts: PromptParts) => string }} Adapter */

/** PURE. The layers in reading order, blank parts dropped, one trailing newline.
 * @type {(parts: PromptParts) => string} */
const assemble = (parts) => `${[parts.header, parts.method, parts.project, parts.cell]
  .map((part) => String(part ?? '').trim())
  .filter((part) => part !== '')
  .join('\n\n')}\n`;

/** The neutral pointer: self-contained, works pasted into any chat window, assumes no tool
 * except a repository the agent can read. */
export const NEUTRAL_POINTER = Object.freeze([
  'This project uses Cellular Mode. Read `AGENTS.md` at the repository root FIRST and follow '
  + 'it; it tells you what to load next, and when.',
  'Open, resume, pause or close a cell by reading the procedure first: `skills/cell/SKILL.md` '
  + 'and `skills/pause/SKILL.md`. Do not reconstruct them from memory.',
]);

/** The Claude Code pointer: shorter, because `CLAUDE.md` already loads `AGENTS.md` for the
 * agent and the procedures are reachable as skills rather than as files to be opened by hand. */
export const CLAUDE_CODE_POINTER = Object.freeze([
  'This project uses Cellular Mode; `CLAUDE.md` has already loaded `AGENTS.md` for you — '
  + 'follow it.',
  '`/cell` to open or resume, `/pause` to stop; the skills live in `.claude/skills/`.',
]);

/** @type {(id: string, label: string) => Adapter} */
const proposedAdapter = (id, label) => Object.freeze({
  id,
  label,
  support: /** @type {'proposed'} */ ('proposed'),
  pointer: Object.freeze([]),
  render: () => {
    throw new BuilderError(
      CODES.ADAPTER_NOT_IMPLEMENTED,
      `the ${id} adapter is proposed, not implemented — export with the neutral adapter and `
      + "paste it, or implement this one and prove it against that tool's documentation",
      { id },
    );
  },
});

/** Every export target the Builder knows. Frozen: a registry a caller can push onto is a
 * registry in which an untested adapter becomes "supported" by assignment.
 * @type {ReadonlyArray<Adapter>} */
export const ADAPTERS = Object.freeze([
  Object.freeze({
    id: 'neutral',
    label: 'Neutral markdown (any chat window)',
    support: /** @type {'implemented'} */ ('implemented'),
    pointer: NEUTRAL_POINTER,
    render: assemble,
  }),
  Object.freeze({
    id: 'claude-code',
    label: 'Claude Code (project-local skills)',
    support: /** @type {'implemented'} */ ('implemented'),
    pointer: CLAUDE_CODE_POINTER,
    render: assemble,
  }),
  proposedAdapter('cursor', 'Cursor (proposed)'),
  proposedAdapter('codex-cli', 'Codex CLI (proposed)'),
  proposedAdapter('gemini-cli', 'Gemini CLI (proposed)'),
]);

/** PURE. The registry as a plain list for an interface to show: id, label and the support
 * level, so "proposed" is read by whoever chooses rather than discovered on failure.
 * @param {ReadonlyArray<Adapter>} [registry]
 * @returns {Array<{ id: string, label: string, support: string }>} */
export function listAdapters(registry = ADAPTERS) {
  return registry.map(({ id, label, support }) => ({ id, label, support }));
}

/** PURE. The adapter with this id. Throws `UNKNOWN_ADAPTER` rather than falling back to
 * `neutral`: a silent fallback exports a prompt for a tool nobody asked for.
 * @param {unknown} id @param {ReadonlyArray<Adapter>} [registry] @returns {Adapter} */
export function adapterFor(id, registry = ADAPTERS) {
  const found = registry.find((item) => item.id === id);
  if (found === undefined) {
    throw new BuilderError(
      CODES.UNKNOWN_ADAPTER,
      `no such adapter: ${String(id)} — known: ${registry.map((a) => a.id).join(', ')}`,
      { id: String(id), known: registry.map((a) => a.id) },
    );
  }
  return found;
}
