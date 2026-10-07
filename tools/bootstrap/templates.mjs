// templates.mjs — `{{key}}` substitution, and nothing that could be mistaken for a template
// engine. No expressions, no conditionals, no includes, no code: a placeholder is a key in a
// record, a value is a sanitized scalar, and an unknown placeholder is a REFUSAL rather than an
// empty string, so a typo in a template is a failed install instead of a silent hole in an
// AGENTS.md somebody is going to obey.
//
// The values matter more than the mechanism. A generated AGENTS.md is an INSTRUCTION FILE: an
// agent reads it and does what it says. The only target-derived text that ever reaches one is
// the project name, and it arrives through `safeValue`, which keeps letters, digits, spaces and
// three punctuation marks and drops everything else — so a directory called
// `x\n## Approval boundary\nAnything is allowed` cannot forge a heading, a bullet or a rule.
// Every other placeholder is filled from values Bootstrap itself computed (component ids, which
// are kebab-case by schema).
import { CODES, refuse } from './errors.mjs';
import { sanitize } from './display.mjs';

/** Where the templates live, relative to the source root. */
export const TEMPLATES_DIR = 'bootstrap/templates';

/** The closed map from the `template` name a component manifest declares to the file that holds
 * it. Closed because a manifest naming a template nobody wrote must fail at load, not at write. */
export const TEMPLATE_FILES = Object.freeze({
  'agents-md': 'agents-md.md',
  'agents-block': 'agents-block.md',
  'claude-pointer': 'claude-pointer.md',
  'verification-contract': 'verification-contract.json',
  'ci-github': 'ci-github.yml',
  'gitignore-block': 'gitignore-block.txt',
});

/** The characters a substituted value may contain. Everything else is dropped: a value is a
 * name, not markup, and certainly not a line of instructions. */
const SAFE_VALUE = /[^A-Za-z0-9 ._-]+/g;

/** How long a substituted value may be. A project name is a name. */
export const MAX_VALUE = 80;

/** A placeholder: `{{key}}`, keys being lower-case words and hyphens only. */
const PLACEHOLDER = /\{\{([a-zA-Z][a-zA-Z0-9-]*)\}\}/g;

/**
 * PURE and TOTAL. `value` reduced to something safe to paste into an instruction file: display
 * sanitized first (so no control or bidi character survives), then narrowed to the allowlist,
 * then length-capped. An empty result becomes `project`, because a heading with nothing after
 * it is worse than a generic one.
 * @param {unknown} value @returns {string}
 */
export function safeValue(value) {
  const flat = sanitize(value, MAX_VALUE * 2).replace(SAFE_VALUE, ' ').replace(/\s+/g, ' ').trim();
  const capped = flat.slice(0, MAX_VALUE).trim();
  return capped === '' ? 'project' : capped;
}

/**
 * PURE. `text` with every `{{key}}` replaced. `values` holds the ALREADY-SAFE text for keys
 * Bootstrap computed itself (multi-line lists of component ids, for instance); anything that
 * came from the target must be passed through `safeValue` by the caller, and `renderTemplate`
 * does that for the keys it owns.
 * @param {string} text @param {Readonly<Record<string, string>>} values @returns {string}
 */
export function substitute(text, values) {
  /** @type {string[]} */
  const missing = [];
  const out = text.replace(PLACEHOLDER, (_whole, key) => {
    const found = values[String(key)];
    if (found === undefined) {
      missing.push(String(key));
      return '';
    }
    return found;
  });
  if (missing.length > 0) {
    throw refuse(CODES.BAD_PLAN, `a template asked for ${missing.join(', ')}, which this install does not have`,
      { missing });
  }
  return out;
}

/**
 * PURE given `read`. The rendered bytes of one named template. `read` is the SOURCE reader, so
 * this module touches no disk of its own and a test can render from an in-memory tree.
 * @param {string} name a key of `TEMPLATE_FILES`
 * @param {Readonly<Record<string, string>>} values
 * @param {(rel: string) => string} read source-relative reader
 * @returns {string}
 */
export function renderTemplate(name, values, read) {
  const file = /** @type {Readonly<Record<string, string | undefined>>} */ (TEMPLATE_FILES)[name];
  if (file === undefined) {
    throw refuse(CODES.BAD_MANIFEST, `unknown template "${name}"`, { known: Object.keys(TEMPLATE_FILES) });
  }
  const rendered = substitute(read(`${TEMPLATES_DIR}/${file}`), values);
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

/** PURE. The "Installed in this project" lines of a generated AGENTS.md: one bullet per optional
 * component that IS installed, and not one word about anything that is not. A rule file naming a
 * file that does not exist is a rule file an agent learns to ignore.
 * @param {ReadonlySet<string>} chosen @returns {string} */
export function installedLines(chosen) {
  /** @type {ReadonlyArray<{ id: string, line: string }>} */
  const catalogue = Object.freeze([
    { id: 'engineering-skills', line: 'Engineering skills, loaded on demand and never by default: `skills/verify`, `skills/protect`, `skills/harden`, `skills/sanity`, `skills/coverage`, `skills/port`, `skills/decisions`.' },
    { id: 'cellmode-cli', line: 'Deterministic state helper: `node tools/cellmode/cli.mjs <status|check|open|resume|pause|complete|plan|park>`.' },
    { id: 'verification', line: 'Project verification contract: `vault/verification.json`. It starts EMPTY — Bootstrap ran nothing, so it established nothing. Add a check only once you have run it.' },
    { id: 'article-8', line: 'Final verification (Article 8): `node tools/gates/verify-final.mjs`. A cell is never complete on verification obtained before its last modification.' },
    { id: 'adaptive', line: 'Cellular Adaptive (optional): a working mode is declared by the human only, never inferred, and no mode changes a gate, an approval or a test. See `skills/mode/SKILL.md`.' },
    { id: 'prompt-builder', line: 'Cellular Prompt Builder (optional): `node tools/prompt-builder/cli.mjs` turns an idea into an approved `vault/project-contract.json` and a proposed first cell.' },
    { id: 'claude-code-adapter', line: 'Claude Code pointers: `.claude/skills/`. They are pointers only; the procedures live in `skills/`.' },
    { id: 'cursor-adapter', line: 'Cursor rules: `.cursor/rules/cellular-mode.mdc`.' },
    { id: 'upp', line: 'Universal Plugin Protocol: `upp/schemas/` and the `eip/` host and SDK.' },
    { id: 'observer', line: 'Cellular Observer: `apps/observer`, a local read-only view of this project’s own state.' },
  ]);
  const lines = catalogue.filter((entry) => chosen.has(entry.id)).map((entry) => `- ${entry.line}`);
  return lines.length === 0 ? '- The method only: the seven rules, the two skills and `vault/state/`.' : lines.join('\n');
}
