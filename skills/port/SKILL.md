---
name: port
description: >
  Port a module from a legacy repository or directory into a new one while the legacy
  stays in production. Use when the human says "bring this over from the old repo",
  "port module X", "migrate this feature to the new codebase", "we are rebuilding this";
  whenever two sibling repositories or directories coexist as legacy and new; and before
  marking anything in the legacy as deprecated.
---

# Port — repository to repository, while the old one keeps running

Rebuilding beside a running legacy is a **standard** workflow, not an exception. Solo
researchers, small teams keeping production alive while rebuilding, projects in
architectural transition — all live with the old and the new coexisting for months or
years. The protocol below is what keeps that from turning into archaeology.

Applies whenever there is a legacy repository (or directory) holding code in production
and a new one receiving the rebuild.

## 1. Read-only inventory of the legacy — before porting anything

Write the inventory **in the new repository**, never in the legacy:

```markdown
## Inventory of <module X> in the legacy

### Relevant files
- <legacy path>/file1 — 340 lines — purpose
- <legacy path>/file2 — 180 lines — purpose

### Classification
- Clean (port directly): <list>
- Cruft (discard): <list, each with a reason: dead, duplicated, abandoned experiment>
- To decide (ask): <list, each with the question>

### Cross dependencies
- file1 imports <legacy lib> — does the new repository need an equivalent?
```

The three buckets are the point. "Clean / Cruft / To decide" forces a decision per file
instead of a wholesale copy, and the "to decide" bucket is what the human is actually
needed for.

## 2. Read-only over the legacy is absolute

The agent **never** writes in the legacy. Never installs dependencies there. Never
modifies a file there. Reading is free; writing is not.

Single exception, and only with explicit approval: a non-destructive deprecation comment
— `// deprecated: ported to <new path> on <date>` — which is an **addition**, not a
modification.

## 3. The port follows the NEW architecture

Do not copy one-to-one. Decide by category:

- **From the new repository:** tokens and design system, naming conventions, build system,
  interface structure, layouts, primitives, type generation.
- **From the legacy:** business logic, validation rules, regular expressions, domain
  rules, and the hard-won fixes nobody remembers the reason for.

When the two conflict, **the new architecture wins** and the old logic adapts to it. A
port that drags the old structure along is not a port, it is a copy with extra steps.

## 4. A port-log entry is mandatory

Every port produces an entry in `PORT_LOG.md` in the **new** repository. Template:
`templates/port-log.md`. Sections:

```markdown
## <date> — <module X>

### Source
- <legacy path>/file1 (commit <hash>)

### Destination
- <new path>/feature-x
- <new path>/feature-x.test

### What came over clean
- validation logic Y
- expression Z (preserves the encoding fix from legacy commit <hash>)

### What was discarded
- obsolete function W (unused)
- duplicated cache setup (redone per the new architecture)

### What changed
- hand-written types -> generated from the contract
- class component -> function component

### Not ported yet (slot)
- export feature — depends on a service the new repository does not have yet
```

Without it, the refactor becomes archaeology. With it, anyone — including the agent in a
later session — can reconstruct what came from where, and why.

## 5. The legacy is deprecated only after the new code has proved itself in use

Criteria, all of them:

- Trilateral Verification green in the new repository (`skills/verify/SKILL.md`).
- Static sanity and accessibility green in the new repository
  (`skills/sanity/SKILL.md`).
- Where applicable, the full-system rung green in the new repository.
- **A minimum period of parallel use**, agreed with the human. Default recommendation:
  two weeks.

Until all four hold, the legacy stays untouched and in production. Deprecating early is
how a rebuild loses the only working version of the product.
