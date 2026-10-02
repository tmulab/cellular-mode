---
name: coverage
description: >
  Set and report test coverage per layer instead of one global percentage. Use when asked
  "what is our coverage", "is this well tested", "are we done testing"; at the end of a
  working session or a closed cell; and before starting a new feature, to check that no
  mandatory layer is below its target.
---

# Coverage — per layer, with a criterion each

A single global percentage rewards useless tests: asserting that a card renders its own
title raises the number and proves nothing. The target is set **per layer**, each with its
own criterion, because each layer catches a different class of defect.

## 1. Mandatory targets

| Layer | Target | Criterion | Why |
|---|---|---|---|
| Trilateral gates | **100%** — always run, always green | typecheck + build + tests, zero errors | If these break, nothing works |
| Static sanity | **100% of routes** scanned | every route and interface file checked | Static, fast, no excuse |
| Exported server-side actions | **100%** | every exported action has a test | Where logic regresses silently |
| Utilities | **80%** | every non-trivial helper has a test | Diminishing returns past this |
| Authentication flows | **100%** | registration, login, logout, redirect, error | Broken auth makes the whole product unreachable |
| Role × route permissions | **100% of combinations** | each role tested against each guarded route | A wrong permission exposes data or locks out an administrator |
| Create/read/update/delete modules | **100% of modules** | create, edit, delete, each verified in real storage | If it is not verified in storage, you do not know it saved |
| Listed critical flows | **100% of the listed flows** | every multi-actor flow in the policy has an end-to-end test | A partial flow is a broken feature for half the users |

Each project lists its own **critical flows** in `vault/policy.md`. A flow that is not
listed is not covered by this target — which is why the list, not the percentage, is the
real artefact.

## 2. What deliberately needs little or nothing

| Layer | Target | Why |
|---|---|---|
| Purely presentational components (cards, badges, layout wrappers) | **~0%** unit — covered by accessibility + smoke | Asserting that a card renders its title is theatre |
| Static pages | **smoke success status** is enough | Static content does not regress |
| UI shells and navigable mocks | **smoke + accessibility** only | There is no behavior to assert yet |
| Stylesheets and design tokens | **none for now** | Visual regression is a separate, later tool |
| Third-party component libraries | **0%** | Their maintainer's responsibility, not ours |

## 3. The report block

After each working session, or at cell closure, report coverage **by layer** with real
numbers — never a single aggregate:

```
COVERAGE
  Trilateral:        OK  100% (0 errors across typecheck + build + tests)
  Static sanity:     OK  100% (56 routes scanned, 0 broken links)
  Server actions:    OK  100% (22/22 covered)
  Utilities:         OK   86% (19/22)
  Auth flows:        OK  100% (7/7)
  Permissions:       OK  100% (5 roles x 12 routes = 60 combinations)
  CRUD modules:      --   80% (2 of 3 modules; the third lacks the edit path)
  Critical flows:    --   50% (1 of 2 listed flows covered)
```

Mark each line honestly. An unmeasured layer is **UNKNOWN**, not 100%.

## 4. The rule that gives the numbers their force

> **Below target on a mandatory layer means writing the missing tests BEFORE the next
> feature.** Not "noted as debt", not "next sprint". Before.

And the reason any of this exists:

> A mocked test proves the mock works. A real-system test proves the system works.
> If the answer to "does this work?" depends on "it works in the tests", the tests are
> wrong (`skills/verify/SKILL.md`).
