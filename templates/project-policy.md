# Project policy — <project name>

> The configurable layer of Cellular Mode. Copy this file into your project as
> `vault/policy.md` — the Level 4 policy path `AGENTS.md` points at — and fill in the
> values. Rationale: `docs/05-engineering-rules.md`; procedures: the engineering skills it
> maps. Everything here is a parameter — **except** that a project policy may only
> **strengthen** `docs/00-constitution.md`, never weaken it. A relaxation must be written
> here explicitly, justified, dated, and approved by the responsible human.

## Scale limits

| Parameter | Value |
|---|---|
| Lines per file (hand-written; exceptions in `policy/size-exceptions.json`) | 200 |
| Lines per task / cell | 200 |
| Lines written per session | 800–1200 |
| New files per session | 15–20 |
| Open decisions per prompt | 1 (hard max 3) |

Exceeding a limit means the cell was sized wrong: split it **before** starting.

## Gates

The three gates, with this project's exact commands:

| Gate | Command |
|---|---|
| Typecheck | `<e.g. npm run typecheck>` |
| Build | `<e.g. npm run build>` |
| Tests | `<e.g. npm test>` |
| Static sanity | `<command, or "none yet">` |
| Accessibility | `<command, or "not applicable">` |
| End-to-end | `<command and prerequisites, or "not applicable">` |

Three lines, real numbers; a gate that cannot run is **UNKNOWN**, never green. Strict
type-checking flags in use: `<list>`.

## Verification

- Verification question answered before the first test: **yes** *(default)*
- Realistic fixtures · scope declared before running · red-without-the-fix proof: **yes**
  *(the mutation must remove the mechanism, not weaken it)*
- Worked contract (`templates/cell-contract.md`) required for: `<e.g. any cell touching
  parsing, money, auth, or data migration>`

## Protected resources

| Resource | Tier | Prohibited without explicit approval |
|---|---|---|
| `<the production database>` | Protected | schema changes, migrations, deletes, bulk writes, resets |
| `<the vector / search index>` | Protected | drop, full re-index, bulk writes |
| `<secrets, keys, certificates>` | Protected | reading into logs, rotation, deletion |
| `vault/state/log.md` | Protected | editing or deleting past entries (append-only) |
| `<production config / deploy scripts>` | Production | any write without a backup or branch |
| `<local dev database, fixtures, seeds>` | Development | nothing — reset and reseed freely |
| `<build output, caches, dependency dirs>` | Derived | nothing — always regenerable |

**Default when a resource is not listed: treat it as Production.** Reading is always
free; protection covers mutation and destruction.

### Command blocklist for the top tier

Never without a **per-operation** approval (`skills/protect/SKILL.md`):

1. `DROP`, `TRUNCATE`, `DELETE` without a specific, approved filter.
2. Schema migrations of any kind.
3. History rewriting or force-pushing on a branch that touches protected data.
4. Bulk vector or index operations — mass re-embedding, full re-index, ingestion of more
   than **10** documents at once *(configurable threshold)*.
5. Editing this project's method, skill or policy files.
6. Anything run against a remote production environment.
7. Recursive deletion over any path that might contain protected data.
8. In this project also: `<list, or "none">`

### Pause-and-confirm — five steps

1. **Stop** before executing; preparing is allowed, running is not.
2. **Show the exact command**, verbatim.
3. **Say what it would do, in words** — rows, files, environment, what is unrecoverable.
4. **Ask for explicit confirmation**, naming the tier.
5. **Execute only after an affirmative answer**, then record the approval in the cell log.

## Security hardening defaults

The ordered pass is `skills/harden/SKILL.md`. Values for this project:

| Step | Parameter | Default | This project |
|---|---|---|---|
| 1 · Injection | string-built queries allowed | never | `<...>` |
| 2 · Rate limits | authentication | 10 req/min per IP | `<...>` |
| | general API | 30 req/min per user | `<...>` |
| | upload | 5 req/min per user | `<...>` |
| 3 · Secrets | minimum length | 32 characters | `<...>` |
| | known-default values | rejected at startup | `<...>` |
| 4 · Headers | content security policy · frame denial · strict transport security · referrer policy · no content-type sniffing | all present | `<...>` |
| 5 · Input | per-field character limit · prompt-injection patterns screened where a language model is called | `<n>` · yes | `<...>` |
| 6 · Audit log | structured, non-blocking, own module | yes | `<...>` |
| 7 · Close | Trilateral Verification | mandatory | mandatory |

Threat-model pass (`skills/harden/SKILL.md` §2) required for: `<e.g. any new endpoint,
role or upload path; anything that executes, writes files or calls the network>`

## Coverage targets

Per layer, never one global percentage (`skills/coverage/SKILL.md`). Defaults:

| Layer | Target | This project |
|---|---|---|
| Trilateral gates | 100%, always green | `<...>` |
| Static sanity | 100% of routes scanned | `<...>` |
| Exported server-side actions | 100% | `<...>` |
| Utilities | 80% | `<...>` |
| Authentication flows | 100% | `<...>` |
| Role × route permissions | 100% of combinations | `<...>` |
| Create/read/update/delete modules | 100% of modules | `<...>` |
| Listed critical flows | 100% of the flows named in the last row | `<...>` |
| Pure presentational components · static pages · UI shells · stylesheets · third-party code | ~0% unit (smoke + accessibility instead) | `<...>` |
| **Critical flows needing an end-to-end test** | `<flow — roles involved>` · `<flow>` | `<...>` |

Report after each session or at cell closure, with real numbers (an unmeasured layer is
**UNKNOWN**, never 100%):

```
COVERAGE
  Trilateral:      OK 100% (0 errors across typecheck + build + tests)
  Static sanity:   OK 100% (<n> routes scanned, 0 broken links)
  Server actions:  OK 100% (<n>/<n>)   Utilities: OK <n>% (<n>/<n>)
  Auth flows:      OK 100% (<n>/<n>)
  Permissions:     OK 100% (<r> roles x <n> routes = <n> combinations)
  CRUD modules:    -- <n>%  (<which module and which path is missing>)
  Critical flows:  -- <n>%  (<which listed flow is uncovered>)
```

> **Below target on a mandatory layer ⇒ write the missing tests BEFORE the next feature.**
> Not "noted as debt", not "next sprint". Before.

## Checkpoint proportionality

Blocking human-in-the-loop checkpoints are central, and proportional: too many exhaust the
human, too few produce guesswork.

| Kind of decision | Form of the checkpoint |
|---|---|
| Macro architecture (stack, repository shape, layout system) | Written proposals + an explicit wait |
| Visual layout of a screen | ASCII wireframe + wait |
| Implementation detail (a variable, a local helper) | Decide, then report it in the record |
| Critical bug found mid-task | Stop everything + alert + wait |
| Adjust per project | `<e.g. also wait before any change to the public API>` |

## Approvals required from the human

Always (from `AGENTS.md`): batch or destructive operations · mutation of any protected
resource · marking a cell **✔ done** · switching the active cell · direction after a scope
divergence.

Additionally, in this project: `<e.g. adding a dependency>` · `<e.g. changing the public
API>` · `<e.g. anything touching authentication or permissions>`

Needing no approval: `<e.g. formatting, test files, documentation typos>`

## Commit policy

- **One commit per closed cell**, with the cell name in the message. Legitimate exception:
  two cells genuinely touching the same files, one commit naming both. The record governs
  the rule, never the reverse.
- Message format: `<e.g. "cell: feed-parser — normalize records">` · Branching:
  `<one branch per cell, or trunk>` · Who commits: `<agent after gates green / human only>`

## Settled decisions

Numbered, dated, never re-asked (`skills/decisions/SKILL.md`). Architecture-shaping ones
get their own record: `templates/adr.md`.

| # | Decision | Date | Reason |
|---|---|---|---|
| 1 | `<decision>` | `<date>` | `<reason>` |

## Agent epistemic errors observed in this project

Record each as Manifestation / Cause / Guard (six canonical ones:
`docs/05-engineering-rules.md` §8). Domain-side errors are optional and separate:
`templates/epistemic-spec.md`.

### <name>
- **Manifestation:** `<what happened>` · **Cause:** `<why the agent fell into it>`
- **Guard:** `<corrective behavior from now on>` · **Detected:** `<date, context>`

## Sources of truth that are literal

Design tokens, approved copy and product vocabulary are a contract, not a suggestion: copy
values literally, adapt structure only.

- Visual source of truth: `<path, or "none">` · Approved copy: `<path, or "none">`
- Product vocabulary that must not be translated or normalized: `<list, or "none">`

## Style of the house

- `<e.g. exact paths always; small complete diffs; real error messages, literal>`
- `<e.g. a new file justifies in one line why it did not fit in an existing one>`
