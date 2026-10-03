// The demo vault, as a COMMAND SEQUENCE. Data, not prose.
//
// `vault/state/` in this directory is not hand-written: it is the output of replaying
// this script with `cellmode` under a fixed clock (see `reproduce.mjs`). The observer
// test suite replays the same script into a temporary directory, so the example and
// the tests are looking at one project and not at two similar ones.
//
// The project is invented and public: a small note-taking library. It deliberately
// contains every state the observer has to render —
//   ✔ done ...... `note-storage`, finished in one sitting
//   ⏸ paused .... `markdown-parser`, opened from 📋 and interrupted
//   📋 planned ... `search-index`, never opened, so it has NO log entry
//   🔵 active .... `tag-filter`
// — a dependency chain three layers deep, a cell with two dependencies, and ONE
// DANGLING dependency (`search-index` declares `full-text-engine`, which is not a
// cell of this project). The dangling edge is the point: a declared dependency on
// something that does not exist must be reported, never invented into existence.

const STORAGE = 'src/storage.mjs';
const PARSER = 'src/parser.mjs';

/** [fixed clock, ...cellmode arguments] @type {Array<[string, string[]]>} */
export const SCRIPT = [
  ['2026-04-06 09:00', ['init']],

  // ✔ A cell opened and finished in one sitting. It declares no dependency, which is
  // what makes it layer 0 of the graph.
  ['2026-04-06 09:05', ['open', 'Note storage',
    '--area', STORAGE,
    '--objective', 'Save and load notes as files, one note per file.',
    '--in', 'saveNote()/loadNote() in src/storage.mjs',
    '--out', 'search, tags, synchronisation, a database',
    '--done', 'a saved note loads back byte-identical']],
  ['2026-04-06 10:20', ['complete',
    '--facts', 'saveNote() and loadNote() implemented; 6 criteria green.',
    '--decisions', 'One file per note, named by id: a single file would turn every '
      + 'write into a rewrite of the whole library.',
    '--build', 'green',
    '--confirm']],

  // 📋 -> 🔵 -> ⏸. Planned WITH its dependency declared, so the field survives the
  // promotion untouched (an omitted --deps never erases what the cell file holds).
  ['2026-04-07 08:00', ['plan', 'Markdown parser',
    '--area', PARSER,
    '--objective', 'Turn a stored note into a heading/paragraph/list tree.',
    '--deps', 'Note storage']],
  ['2026-04-07 08:10', ['open', 'Markdown parser']],
  ['2026-04-07 09:30', ['pause',
    '--facts', 'Headings and paragraphs parse; lists are not implemented yet.',
    '--decisions', 'A linear line scan, not a regex over the whole document: two '
      + 'clever regexes once dropped rows in silence.',
    '--build', 'red (3 list criteria failing)',
    '--next', 'run the parser test file and read the first list failure',
    '--note', 'Stopping with the tests already red is the cheapest bookmark there is.']],

  // 📋 and nothing else: a planned cell never ran, so it has no log entry. One of its
  // two declared dependencies does not exist — the dangling case.
  ['2026-04-07 09:35', ['plan', 'Search index',
    '--area', 'src/search.mjs',
    '--objective', 'Answer "which notes contain this word" without reading every note.',
    '--deps', 'Markdown parser, Full-text engine']],
  ['2026-04-07 09:40', ['park', 'Rank search results by recency as well as by match count']],

  // 🔵 The active cell, with two dependencies: the graph has a node of in-degree two.
  ['2026-04-08 07:45', ['open', 'Tag filter',
    '--area', 'src/tags.mjs',
    '--objective', 'List the notes carrying a given tag.',
    '--in', 'filterByTag() over the parsed tree',
    '--out', 'tag renaming, tag hierarchies, a tag UI',
    '--done', 'a note with two tags is found by either one',
    '--deps', 'Note storage, markdown-parser']],
];

/** The clock used for the final integrity check of a replay. */
export const CHECK_AT = '2026-04-08 07:50';

/** What the replayed vault must contain. Asserted by the example's own test and by
 * the observer suite: a fixture whose shape nobody states is a fixture nobody can
 * trust. `null` dependencies mean "declares none", not "unknown". */
export const EXPECTED = Object.freeze({
  counts: { total: 4, planned: 1, active: 1, paused: 1, done: 1 },
  activeId: 'tag-filter',
  logEntries: 2,
  dependencies: {
    'note-storage': [],
    'markdown-parser': ['note-storage'],
    'search-index': ['markdown-parser', 'full-text-engine'],
    'tag-filter': ['note-storage', 'markdown-parser'],
  },
  dangling: [{ from: 'search-index', to: 'full-text-engine' }],
  layers: 3,
});
