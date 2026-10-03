// O16 / O17 — the `**Dependencies:**` field and the `--deps` option.
//
// Two layers, on purpose: the normalisation is a pure function and is tested as one
// (no disk, every edge case cheap), and the CLI is tested through the real process,
// because "the option exists" and "the option reaches the file" are different claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NONE, parseDependencies, renderDependencies } from './deps.mjs';
import { parseCellFile } from './cell-file.mjs';
import { cellText, freshRoot, run } from './helpers.mjs';

/** The field value as the cell file on disk carries it.
 * @type {(root: string, slug: string) => string} */
const depsField = (root, slug) => String(parseCellFile(cellText(root, slug))?.dependencies);

// ------------------------------------------------------------------- pure --------
test('O16 deps · a list of names normalises to slugs, de-duplicated, order kept', () => {
  assert.deepEqual(parseDependencies('Reading time, word-count'), ['reading-time', 'word-count']);
  assert.deepEqual(parseDependencies('  B ;  a  '), ['b', 'a'], 'semicolons separate too');
  assert.deepEqual(parseDependencies('Word count, word-count, WORD COUNT'), ['word-count']);
  assert.deepEqual(parseDependencies('Índice de células'), ['indice-de-celulas'],
    'accents are folded by slugify, so one cell has one id');
  assert.equal(renderDependencies('Reading time, word-count'), 'reading-time, word-count');
  assert.equal(renderDependencies(['Reading time', 'reading-time']), 'reading-time');
});

test('O16 deps · nothing to declare is the empty field, never an invented entry', () => {
  for (const empty of [undefined, null, '', '   ', NONE, ',,;', ' — , — ', '!!!', '· ·']) {
    assert.deepEqual(parseDependencies(empty), [], `"${String(empty)}" must be empty`);
    assert.equal(renderDependencies(empty), NONE);
  }
  assert.equal(renderDependencies([]), NONE);
});

// -------------------------------------------------------------------- CLI --------
test('O16 deps · `plan --deps` writes the field as slugs', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['plan', 'Graph view', '--area', 'apps/observer', '--deps', 'Word count, reading-time']);
  assert.equal(depsField(root, 'graph-view'), 'word-count, reading-time');
  // No log entry: a planned cell never ran, and --deps does not change that.
  run(root, ['check']);
});

test('O16 deps · `open --deps` writes the field, and a dangling name is kept verbatim', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Graph view', '--area', 'apps/observer', '--deps', 'No such cell']);
  assert.equal(depsField(root, 'graph-view'), 'no-such-cell',
    'a dependency on a cell that does not exist is recorded, never invented into existence');
  assert.match(cellText(root, 'graph-view'), /\*\*Dependencies:\*\* no-such-cell/);
});

test('O17 deps · omitting --deps on a re-open never erases the field; --deps "" clears it', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['plan', 'Graph view', '--area', 'apps/observer', '--deps', 'word-count']);
  run(root, ['open', 'Graph view']);
  assert.equal(depsField(root, 'graph-view'), 'word-count', 'an absent option is not an empty one');
  run(root, ['pause', '--facts', 'f', '--next', 'n']);
  run(root, ['resume', 'Graph view']);
  assert.equal(depsField(root, 'graph-view'), 'word-count', 'resume carries the field forward');
  run(root, ['pause', '--facts', 'f', '--next', 'n']);
  assert.equal(depsField(root, 'graph-view'), 'word-count', 'pause carries the field forward');
  // `--deps ""` is an explicit declaration that there is nothing to declare, and a
  // 📋 -> 🔵 promotion is where a human can still say so.
  const root2 = freshRoot();
  run(root2, ['init']);
  run(root2, ['plan', 'Graph view', '--area', 'a', '--deps', 'word-count']);
  run(root2, ['open', 'Graph view', '--deps', '']);
  assert.equal(depsField(root2, 'graph-view'), NONE);
});

test('O17 deps · --deps is refused on every command that does not declare it', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'A', '--area', 'x']);
  for (const args of [['status'], ['check'], ['park', 'an idea'],
    ['pause', '--facts', 'f', '--next', 'n'], ['init']]) {
    const result = run(root, [...args, '--deps', 'b'], { expect: 1 });
    assert.match(result.stderr, /unknown option --deps/, `\`${args[0]}\` must refuse --deps`);
  }
  // `complete` and `resume` too — they take no dependency declaration either.
  assert.match(run(root, ['resume', 'A', '--deps', 'b'], { expect: 1 }).stderr, /unknown option --deps/);
  assert.match(run(root, ['complete', '--facts', 'f', '--confirm', '--deps', 'b'], { expect: 1 }).stderr,
    /unknown option --deps/);
});

test('O16 deps · the option needs a value, and the usage text names it', () => {
  const root = freshRoot();
  run(root, ['init']);
  assert.match(run(root, ['plan', 'A', '--area', 'x', '--deps'], { expect: 1 }).stderr,
    /option --deps needs a value/);
  assert.match(run(root, ['help']).stdout, /--deps "a, b"/);
});
