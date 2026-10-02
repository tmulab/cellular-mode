---
name: sanity
description: >
  Static structural checks that read the source without running it, plus the two
  gate-reach checks and the interface-level accessibility and smoke checks. Use after a
  migration, a large refactor, a rename across packages, or any batch of new routes or
  pages; when a gate passes but something feels unverified; when adding a new package or
  workspace member; and when the human says "sanity check", "did I break a link",
  "is anything missing", "run the static checks".
---

# Sanity — checks that find the mistake no unit test looks for

These checks read the source **without executing it**. They catch the stupid, expensive
mistakes that unit tests and the build both accept: a link to a page that does not exist,
an asset that was never committed, a handler nobody wrote. They run in seconds, they take
no database and no server, and they belong **in the test suite** — a check that lives in a
checklist is a check that gets skipped.

## 1. Structural checks

Adapt the list to the stack; the shape is always "scan the source, assert the target
exists".

1. **Broken internal links.** Scan every navigation target — markup links, programmatic
   navigation, redirects — and assert the destination exists as a real page or route.
2. **Referenced assets that are missing.** Scan image and file references and assert each
   one exists on disk.
3. **Text in the wrong language.** Scan user-facing labels and buttons for strings in a
   language the product does not ship (a stray "Loading…" in a localized interface).
4. **Interface calls with no handler.** Scan client-side calls to the project's own API and
   assert a matching handler exists.
5. **Client-only code in server-only modules.** Scan server modules for browser APIs and
   client-side state hooks.
6. **Deprecated framework constructs.** Scan for classes, props or utilities removed in the
   framework version actually installed.

## 2. Does the gate REACH the code? (two checks that find absent gates)

Both of these describe a gate that is **silently not running**. There is no error to read:
the command exits zero, because it did exactly what it was told.

### 2.1 Does the type check reach the tests?

An **exclude** pattern filters the *program*, not just the emitted output. An
`exclude` of test files, added to keep the suite out of the build artifact, removes those
files from type checking **as well**, in silence. **Runtime green is not type green:** the
suite passes, the type checker passes, and not one line of the tests was ever typed.

*Why it bites:* a badly typed test tests something else. In a real case, a configuration
table written with a bare number where the type wanted an object made every fusion test
run with the weights `undefined` — so weighted fusion, the actual subject of the tests,
**was never exercised**. The tests passed. Six type errors were hiding across nine
packages, and the template's own comment claimed, wrongly, that the tests were typed.

**Detection, thirty seconds, any typed repository:**

```
# append a DELIBERATE type error inside a test file
echo 'const WRONG: number = "text"' >> src/something.test.ts
npm run typecheck
# no error reported => the tests are outside the program
```

**Fix:** give the suites their own type-check target (emit nothing, non-composite, include
the test files) and run it in the gate beside the production type check. The package's
`exclude` keeps doing what it was for; it stops doing what nobody asked for.

**Generalization:** every exclude answers two questions at once — *what not to emit* and
*what not to check* — and almost always only the first was intended. The same check applies
to skipping library checks, to allowing untyped sources, and to any narrow include list:
**what the gate does not reach, the gate does not guarantee.**

### 2.2 Does the gate find members by itself, or depend on a LIST?

A gate that walks a **hand-written list** — project references, a runner's project array, a
manually written workspace list, an enumerated CI matrix — fails **silently** for anything
left off it. A gate that walks a **glob** finds the new member on its own and has no such
failure mode.

*Real case:* one package sat outside the root reference list for three batches. The
project-wide type check never typed it and exited green. Every other gate in the same
repository — tests, suite type check, import checker — discovered targets by glob and never
complained: **the only list-driven gate was the only one with a hole.**

**The rule:**

1. **Prefer a glob.** If the gate can discover the target from disk, let it.
2. **Where a list is unavoidable** — build-order references are a legitimate case, because
   the list also declares order — write a **test comparing the list to disk, in both
   directions**: nothing on disk missing from the list, nothing in the list without a
   matching directory. Ten lines, and "someone forgot to add it" turns from a silent bug
   into a named red.

**Detection, one question:** *if I create a new member right now and edit nothing else,
which gate complains?* If the answer is "none", the list is running the gate.

**The process corollary: a request in a report is not a gate.** In the real case, three
successive agents wrote "please add the line to the references" in their own delivery
reports. It was documented, it was visible, and the hole still lasted three batches —
because when the fourth agent forgot to ask, nothing but the asking remained. **A finding
that becomes a line in a report comes back; a finding that becomes a test does not.**

## 3. Where there is a user interface

Generic, framework-independent checks; run them with the project's ordinary test runner
wherever possible, so they need no database and no development server.

- **Accessibility.** Render each public page and assert against an accessibility rule set:
  critical and serious violations fail. Typical catches: controls with no accessible name,
  images with no alternative text, links with no text, form fields with no label, touch
  targets below the minimum size.
- **Smoke navigation.** For every public route: a success status, real content rather than
  an error page, no placeholder artefacts rendered as visible text (a stringified object,
  the word "undefined"), no permanent loading state, and icons rendering as graphics rather
  than as their own names.

Both are the declared coverage for work the full-system rung does not apply to — a UI
shell, a navigable mock, a pure design system (`skills/coverage/SKILL.md`).
