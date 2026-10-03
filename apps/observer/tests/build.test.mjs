// D6, D14, D15, D16, D17 — properties of the built application: offline, one palette, legible,
// type-checked, and honest about the areas whose plugins do not exist yet.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../assets.mjs';
import { CONTRAST_TIERS, CSS_VARIABLES, BASE, contrastRatio, rgbOf, tokenValue } from '../view/tokens.mjs';
import { describeProbe } from '../view/availability.mjs';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = read('web/app.css');
const HTML = read('web/index.html');

describe('D6 · offline for real', () => {
  // XML namespace URIs are identifiers, not fetches: `xmlns="http://www.w3.org/2000/svg"`
  // and three.js's `createElementNS("http://www.w3.org/1999/xhtml", …)` never open a
  // connection. They are the ONLY allowed occurrence, and they are allowed by exact value.
  const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml'];

  test('no served asset contains a URL that could be fetched', () => {
    // Two shapes, because they are two different mistakes: an absolute URL with a scheme,
    // and a protocol-relative reference in a position a browser would actually load from
    // (an attribute, an import specifier, a CSS url()). Matching a bare `//` everywhere
    // would flag a regular-expression literal in the minified vendor build and prove
    // nothing.
    const ABSOLUTE = /https?:\/\/[^\s"'`)]+/g;
    const RELATIVE = /(?:(?:src|href)\s*=\s*["']|from\s*["']|import\s*\(\s*["']|url\(\s*["']?)\/\//g;
    /** @type {string[]} */
    const offenders = [];
    for (const asset of Object.values(ASSETS)) {
      const text = readFileSync(new URL(`../${asset.file}`, import.meta.url), 'utf8');
      for (const match of text.matchAll(ABSOLUTE)) {
        const url = match[0];
        if (NAMESPACES.some((allowed) => url.startsWith(allowed))) continue;
        offenders.push(`${asset.file}: ${url.slice(0, 60)}`);
      }
      for (const match of text.matchAll(RELATIVE)) {
        offenders.push(`${asset.file}: protocol-relative ${match[0]}`);
      }
    }
    assert.deepEqual(offenders, [], `external URLs in served assets:\n  ${offenders.join('\n  ')}`);
    // Proof the scan is not vacuous: both shapes are caught where they would matter.
    assert.match('<img src="https://cdn.example/x.png">', ABSOLUTE);
    assert.match('<script src="//cdn.example/x.js">', RELATIVE);
  });

  test('the document fetches nothing from outside', () => {
    for (const attribute of ['src="http', "src='http", 'href="http', "href='http", 'src="//', 'href="//']) {
      assert.ok(!HTML.includes(attribute), `the page reaches outside: ${attribute}`);
    }
    assert.match(HTML, /<link rel="stylesheet" href="\/web\/app\.css">/);
    assert.match(HTML, /<script type="module" src="\/web\/main\.mjs"><\/script>/);
  });

  test('every browser module parses, which is the only machine check browser code admits', () => {
    for (const asset of Object.values(ASSETS)) {
      if (!asset.file.endsWith('.mjs')) continue;
      execFileSync(process.execPath, ['--check', `${APP_DIR}${asset.file}`], { timeout: 20_000 });
    }
  });
});

describe('D15 · one source of colour, and it is legible', () => {
  test('the stylesheet declares exactly the tokens of view/tokens.mjs, value for value', () => {
    const root = /:root\s*\{([^}]*)\}/.exec(CSS);
    assert.ok(root !== null && root[1] !== undefined, 'app.css must declare :root');
    /** @type {Record<string, string>} */
    const declared = {};
    for (const match of root[1].matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
      declared[match[1] ?? ''] = (match[2] ?? '').trim();
    }
    assert.deepEqual(declared, { ...CSS_VARIABLES }, 'the stylesheet and the token module must agree');
  });

  test('no colour literal exists in the stylesheet outside that block', () => {
    const body = CSS.replace(/:root\s*\{[^}]*\}/, '');
    const literals = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)].map((match) => match[0]);
    assert.deepEqual(literals, [], `a second palette started here: ${literals.join(', ')}`);
  });

  test('every token clears its contrast tier against the background (computed, not guessed)', () => {
    /** @type {string[]} */
    const failures = [];
    for (const [name, minimum] of CONTRAST_TIERS) {
      const ratio = contrastRatio(tokenValue(name), BASE['background'] ?? '#000000');
      if (ratio < minimum) failures.push(`${name}: ${ratio.toFixed(2)}:1 < ${minimum}:1`);
    }
    assert.deepEqual(failures, [], `contrast failures:\n  ${failures.join('\n  ')}`);
    // Proof the computation is not vacuous: a grey that looks fine fails the text tier.
    assert.ok(contrastRatio('#4a4f5e', BASE['background'] ?? '#000') < 4.5);
    assert.ok(contrastRatio('#ffffff', '#000000') > 20);
  });

  test('exactly one accent hue outside the status palette and the neutrals', () => {
    const saturated = Object.entries(BASE).filter(([, hex]) => {
      const [r = 0, g = 0, b = 0] = rgbOf(hex).map((value) => value / 255);
      return Math.max(r, g, b) - Math.min(r, g, b) > 0.2;
    });
    assert.deepEqual(saturated.map(([name]) => name), ['accent'], 'one accent, not a fairground');
  });
});

describe('D14 · the later cells are declared, not faked', () => {
  test('both areas exist in the document and name no invented content', () => {
    assert.match(HTML, /id="audit"/);
    assert.match(HTML, /id="advisor"/);
  });

  test('the placeholder states "not available in this build" for a missing plugin', () => {
    assert.deepEqual(describeProbe({ ok: false, error: { code: 'NOT_FOUND' } }), {
      state: 'absent', text: 'not available in this build — the plugin is not installed',
    });
    assert.equal(describeProbe({ ok: false, error: { code: 'UPSTREAM_UNAVAILABLE' } }).state, 'unknown');
    assert.equal(describeProbe({ ok: true }).state, 'available');
  });

  test('each area names the capability key it will consume, and the AI area is labelled', () => {
    const main = read('web/main.mjs');
    assert.match(main, /key: AUDIT_KEY/);
    assert.match(main, /key: ADVISOR_KEY/);
    assert.match(main, /origin: 'ai'/);
    const client = read('web/data-client.mjs');
    assert.match(client, /AUDIT_KEY = 'observer\.audit'/);
    assert.match(client, /ADVISOR_KEY = 'observer\.advisor'/);
    // The two origins differ in SHAPE, not only in colour.
    assert.match(CSS, /\[data-origin="ai"\][^{]*\{[^}]*border-style: dashed/);
  });
});

describe('D16 · both type-check configurations run', () => {
  test('npm run typecheck covers the repository config and the browser config', () => {
    const pkg = JSON.parse(readFileSync(`${REPO}package.json`, 'utf8'));
    const script = String(pkg.scripts.typecheck);
    assert.match(script, /-p jsconfig\.json/);
    assert.match(script, /-p apps\/observer\/jsconfig\.json/);
  });

  test('the browser config has lib DOM and the same four strengthenings', () => {
    const config = JSON.parse(read('jsconfig.json'));
    const options = config.compilerOptions;
    assert.ok(options.lib.includes('DOM') && options.lib.includes('ES2023'));
    assert.deepEqual(options.types, [], 'node globals must not be visible to browser code');
    for (const flag of ['strict', 'checkJs', 'noUncheckedIndexedAccess',
      'exactOptionalPropertyTypes', 'noImplicitOverride', 'noFallthroughCasesInSwitch']) {
      assert.equal(options[flag], true, `${flag} must be on`);
    }
  });

  test('no suppression comment was used to get there', () => {
    for (const asset of Object.values(ASSETS)) {
      if (!asset.file.endsWith('.mjs')) continue;
      const text = readFileSync(new URL(`../${asset.file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(text, /@ts-(ignore|nocheck|expect-error)/, `${asset.file} suppresses the checker`);
    }
  });
});

describe('D17 · 3D is optional and secondary', () => {
  test('2D is the default and 3D is restored only when it was chosen before', () => {
    assert.match(read('web/main.mjs'), /localStorage\.getItem\(VIEW_KEY\) === '3d' \? '3d' : '2d'/);
  });

  test('three.js is loaded only when the 3D view is asked for', () => {
    assert.match(read('web/graph-view.mjs'), /await import\('\.\/scene-3d\.mjs'\)/);
    for (const name of ['main.mjs', 'graph-view.mjs']) {
      assert.doesNotMatch(read(`web/${name}`), /^import .*three\.module/m, `${name} must not import three statically`);
    }
  });

  // Observed in a browser with the vendored three.js blocked: the toggle hid the 2D
  // projection, the 3D import failed, and the panel was left empty with an uncaught
  // rejection. The optional view failing must never take the proven one with it.
  test('a 3D view that cannot load falls back to 2D instead of emptying the panel', () => {
    const view = read('web/graph-view.mjs');
    assert.match(view, /try \{[\s\S]{0,400}await import\('\.\/scene-3d\.mjs'\)[\s\S]{0,400}\} catch/,
      'the lazy import must be guarded');
    assert.match(view, /catch[\s\S]{0,500}mode = '2d'/, 'the failure must return the view to 2D');
    assert.match(view, /catch[\s\S]{0,600}paint2d\(\)/, 'the 2D projection must be repainted');
    // And the label follows what is ACTUALLY shown, not what was asked for.
    assert.match(read('web/main.mjs'), /graph\.mode\(\)/);
  });

  test('no 3D module computes a node position', () => {
    for (const name of ['scene-3d.mjs', 'labels.mjs']) {
      const text = read(`web/${name}`);
      assert.match(text, /node\.x[\s\S]{0,60}node\.y[\s\S]{0,60}node\.z/,
        `${name} must read the server's own coordinates for each node`);
      assert.doesNotMatch(text, /\* SECTOR|layer \*|column \*/, `${name} must not derive a position`);
    }
  });
});
