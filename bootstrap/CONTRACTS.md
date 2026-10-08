# Cellular Bootstrap & Adoption — contracts (v1)

Status: written in cell `bootstrap-audit` (Stage 7, Cell 1); BS1–BS4 approved by the human on
2026-10-06; implemented by Cells 2–8. **Purpose:** install a **coherent, selected subset** of Cellular Mode into another directory — a new project
or an existing repository of any language — without the human choosing files by hand. Optional,
deterministic in its mandatory path, reversible, auditable, model-independent. It never copies
the whole repository and never changes the target application's behaviour to install the method.

## Approved decisions (2026-10-06, human)

| ID | Decision |
|---|---|
| BS1 | Separate CLI `node tools/bootstrap/cli.mjs <new\|existing\|status\|uninstall>` (`npm run bootstrap`). `tools/cellmode` never imports it; `cellmode init` is untouched. Module tests use the `bootstrap-` prefix (the existing `tests/bootstrap.test.mjs` is unrelated and unchanged). |
| BS2 | The installation record is `vault/install-manifest.json` in the target — authoritative, versioned project history. Plans, drafts and reports in progress live in git-ignored `vault/bootstrap/`. `.cellular/` stays local evidence. No secrets, tokens, machine metadata or absolute personal paths in the manifest. |
| BS3 | One Article 8 implementation, generalized: `tools/gates/verify-final.mjs` reads an optional project-local verification contract `vault/verification.json`. Absent ⇒ this repository's current suite, unchanged. Commands are argv arrays, never shell strings. Only VERIFIED or explicitly human-approved checks may be mandatory. |

## Layout

- `tools/bootstrap/` — code (`.mjs`, JSDoc, ≤200 lines/file, tests `bootstrap-*.test.mjs` colocated).
- `bootstrap/components/<id>.json` — versioned component manifests (data, not code).
- `bootstrap/templates/` — templates for GENERATE artifacts (e.g. target `AGENTS.md`).
- `docs/12-bootstrap.md` (onboarding) · `BOOTSTRAP_REPORT.md` (stage report).

Disk writes into a target go through one confined writer module; process execution (git, and
human-approved verification commands only) goes through one `exec.mjs` using `spawn` with
`shell: false`, an argv array and a timeout. Everything else is pure.

## Import boundary

`tools/bootstrap/**` MAY import `node:*` and pure `tools/cellmode/` modules. It MUST NOT import
`eip/**`, `tools/adaptive/**` or `tools/gates/**` (gate files are COPIED as data, never imported).
The Prompt Builder is optional and is **never imported** (BS4, human decision 2026-10-06, no gate
relaxation): `compose-builder.mjs` runs the Builder's own CLI as a subprocess through `exec.mjs`
and decides on its documented exit codes only. Bootstrap works when it is absent. No network module anywhere;
`node:child_process` only in `exec.mjs`. Nothing outside `tools/bootstrap/` imports it.

## Component manifest — `cellular-mode/component-manifest`, version 1

```json
{ "schema": "cellular-mode/component-manifest", "version": 1,
  "id": "kebab-id", "componentVersion": "semver", "description": "one sentence",
  "files": [ { "source": "repo-relative path or dir/", "target": "relative path",
               "mode": "copy|generate|reference", "template": "for generate only" } ],
  "exclude": [ "glob-like suffixes, e.g. .test.mjs, fixtures/" ],
  "dependsOn": [], "optionalDependsOn": [], "conflicts": [],
  "host": { "requires": ["git"] },
  "config": [ "vault/verification.json" ],
  "verify": [ { "id": "...", "argv": ["node", "tools/cellmode/cli.mjs", "check"] } ],
  "uninstall": "remove-owned|keep|manual" }
```

Closed key set; validated by a hand-written pure validator (style of `tools/adaptive/schema.mjs`).
`source` and `target` are relative, `..`-free, NUL-free and never absolute. `verify` entries are
argv arrays executed only at an approved verification stage. A manifest is **data**: nothing in it
is executed during analysis or planning.

**Self-checks (tested):** every runtime file a component copies is owned by exactly one component;
the copied set of each profile is **import-closed** (every relative import of every copied `.mjs`
resolves inside the same profile); no test, fixture, report, evidence or scratch file is copied.

### Components (initial)

| id | contents | mode | depends on |
|---|---|---|---|
| `method-core` | `AGENTS.md`, `skills/cell`, `skills/pause`, empty `vault/state/` | generate / copy / generate | — |
| `engineering-skills` | `skills/{verify,protect,harden,sanity,coverage,port,decisions}` | copy | method-core |
| `cellmode-cli` | `tools/cellmode/` non-test modules | copy | method-core |
| `verification` | `vault/verification.json` (verification contract) | generate | method-core |
| `article-8` | the import-closed subset of `tools/gates/` for final verification, `.githooks/` | copy | cellmode-cli, verification |
| `claude-code-adapter` | `.claude/skills/<pointer>` for installed skills only | generate | method-core |
| `cursor-adapter` | `.cursor/rules/cellular-mode.mdc` | copy | method-core |
| `adaptive` | `adaptive/`, `tools/adaptive/`, `skills/mode`, mode pointers | copy | cellmode-cli |
| `prompt-builder` | `tools/prompt-builder/` (non-test), `skills/builder`, pointers | copy | cellmode-cli |
| `upp` | `eip/sdk`, `eip/kernel`, `eip/upp`, `eip/upp-host`, `upp/schemas` | copy | — |
| `observer` | `apps/observer`, `eip/plugins/observer-*`, `eip/host` composition subset | copy | upp, cellmode-cli |

Exact file sets are derived from the source tree by the manifest rules at plan time and frozen
into the plan; the self-checks fail if they drift.

Cell 1 findings (VERIFIED by the closure test): minimal 46, standard 111, full 227 copied files (43/108/224 before BS3),
each profile import-closed. `article-8` is thirteen self-contained gate modules (three added by BS3) plus `.githooks/`; its
one gap is a *command*, not an import — the current suite runs `check-all.mjs`, which is not
copied (closed by BS3 in Cell 5). The EIP halves of Adaptive (`eip/plugins/adaptive-preferences`,
`eip/host/adaptive-read-port.mjs`) belong to `observer` (with `optionalDependsOn: adaptive`),
because they need `eip/sdk`. The Observer's audit plugin is not installed in targets (it imports
this repository's own gates); its view reports itself unavailable there.

### Profiles

| profile | components |
|---|---|
| `minimal` | method-core, engineering-skills, cellmode-cli, verification (+ article-8 when the target is a git repository and the human approves hooks) |
| `standard` | minimal + adaptive + prompt-builder |
| `full` | standard + upp + observer |
| `custom` | any selection; dependencies are added and **shown** before approval; conflicts refuse |

Adapters are offered when the target already uses that tool (`CLAUDE.md`, `.claude/`, `.cursor/`)
or when the human asks. Bootstrap never forces npm scripts or a `package.json` on a project.

## Installation plan

`plan(analysis, selection)` is pure and deterministic: profile, resolved components (with the
reason each one is present), files to **create**, files to **modify** (managed block, with
proposed text), files left untouched, conflicts, integrations (hooks, CI, verification),
commands proposed, approvals required, verification plan. `--dry-run` renders it and writes
nothing controlled (tested by hashing the target before and after).

## Copy vs generate vs reference

- **copy** — byte-identical upstream method assets; post-install hash recorded.
- **generate** — project-specific (`AGENTS.md`, `vault/state/`, `vault/verification.json`,
  `vault/install-manifest.json`, adapter pointers); never claims to be an upstream copy.
- **reference** — an existing authoritative file is pointed to, not duplicated (e.g. an approved
  `vault/project-contract.json`, an existing CI workflow, existing project docs).

Never copied: evidence, `.cellular/`, `vault/builder/`, `vault/bootstrap/`, `node_modules/`,
tests, fixtures, reports, examples, personal configuration, credentials, history, absolute paths.

## Safe modification of existing files

Bootstrap never replaces an existing file. It may only **append a managed block** to a text file
it understands (`AGENTS.md`, `CLAUDE.md`, `.gitignore`), delimited by
`cellular-mode:begin <component>` / `cellular-mode:end <component>` markers in the file's comment
syntax, after showing the block and receiving `--confirm`. Anything else — `package.json`,
CI workflows, build files, hook configuration, README — is a **proposed patch** for human review,
never applied automatically. Unprovable merges stop with exit 5 and a manual plan.

## Hooks, CI and verification adapters

- **Hooks:** detect native `.git/hooks`, `core.hooksPath`, Husky, Lefthook, pre-commit and unknown
  machinery. Only when no hook machinery exists may Bootstrap propose `core.hooksPath=.githooks`,
  applied with `--confirm`. Otherwise it writes a composition plan and installs no hook.
- **CI:** detect GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, Bitbucket, Jenkins. Never
  replace or edit a workflow; at most propose an additive workflow file (least permissions,
  actions pinned by SHA, no secrets), created only with explicit approval.
- **Verification contract** `cellular-mode/verification` v1 in `vault/verification.json`:
  `checks: [{ id, argv: string[], status: VERIFIED|INFERRED|PROPOSED|UNKNOWN, basis,
  mandatory: boolean, approval: { by: "human", at } | null, timeoutSeconds? }], notes? }`.
  `mandatory` is valid only for a VERIFIED check or one with a human approval (`--mandatory id`
  with `--confirm`). Discovered commands start as INFERRED; a command that passed an approved
  baseline run becomes VERIFIED. Commands parsed from CI lines are recorded as `notes`, never as
  checks. One validator only: `tools/gates/verification-contract.mjs`; shell wrappers (`sh -c`,
  `cmd /c`, …) are refused. Contract present ⇒ `verify-final` runs its mandatory checks plus
  `cell-state`; invalid, unreadable or zero mandatory checks ⇒ fail closed. Absent ⇒ the built-in
  suite, unchanged. Hooks are activated only when all hold: article-8 installed, no hook machinery,
  `core.hooksPath` unset, a git work tree, approval `hooks`, `--confirm`.

## Existing projects — analysis first

`existing --analyze` reads (never executes) the repository and writes nothing controlled. It
produces the **Adoption Compatibility Report**: detected facts (VERIFIED, with relative evidence
paths), inferred conventions, proposed integrations, conflicts, unknowns, approvals required.
The **Adoption Baseline** (`vault/adoption-baseline.json`, written at install) records commit and
tree, cleanliness, languages, build/test/type/lint commands with labels, CI, hooks, instruction
files, and — only if the human approves running checks — their pre-existing results. A failure
found at baseline is recorded as **pre-existing**; Bootstrap never fixes unrelated defects.

## Install manifest — `cellular-mode/install-manifest`, version 1 (`vault/install-manifest.json`)

`source { name, version, revision }`, `profile`, `components [{ id, componentVersion }]`,
`installedAt`, `target { name }` (directory basename only), `files [{ path, mode, created,
sha256Before | null, sha256After, block? }]`, `integrations [{ kind, status, detail }]`,
`approvals [{ action, at }]`, `host { languages, buildSystems, ci, hooks }`, `limitations []`.
Validated on write and read; publication-checked (no secret, contact or absolute path).

## Existing installation, drift and uninstall

- A present manifest makes `new`/`existing` refuse, naming its state; `status` reports version,
  components, files (healthy / missing / modified / extra-unowned / evolved), blocks and integrations, classifies the install as
  **healthy, drift, partial or uninstalled-with-residue** and the next action as **none, repair, upgrade or repair-or-upgrade** — never a silent reinstall.
  Ownership classes (H3, a frozen path rule, no schema field): only *immutable* assets drift or go partial; *evolving* (`vault/state/**`, `vault/verification.json`) is changed by using the method, so it is reported as **evolved (expected)**, listed for audit (`--verbose` uncaps), and never drift, partial or repair; *user/referenced* is never drift. A manifest kept by a finished uninstall is residue — read from that uninstall's own report in `vault/bootstrap/`, exit 0, with the kept paths and both safe next steps.
- If anything is kept, the manifest is kept untouched and `vault/bootstrap/uninstall-report.json`
  lists what remains. Limitation: when nothing is kept the manifest is removed, so a
  `--force-modified` deletion is then recorded only in the command output.
- `uninstall --dry-run` first. A file is removed only if Bootstrap created it and its hash still
  equals `sha256After`; a managed block is removed only if it is byte-intact; anything else is
  kept and reported with a reverse patch for human review. Directories are removed only when
  empty. Deleting modified files needs `--confirm` per file. Git history is never touched.

## Prompt Builder and Adaptive (both optional)

`new` detects `vault/project-contract.json`; when the Prompt Builder is installed in the source
it validates it and can propose the first cell with it, otherwise the contract is REFERENCED
with validity UNKNOWN. The first cell is created **planned** (📋) only with `--confirm`, and is
never activated. Adaptive: `--mode` changes wording only; files, checks, approvals and
verification are identical in every mode (tested). No state is ever inferred.

## Security

Target and specifications are untrusted. All writes are confined to the target (resolve +
real-path check, no symlink following, refuse NUL, absolute or `..` segments); the target may not
overlap the source. Analysis never runs project commands. Filenames and text shown to the human
are sanitized; secret-shaped content is never copied or recorded. No network access.

## Exit codes

`0` ok · `1` usage or bad arguments · `2` validation, drift or analysis findings · `3` refused
because of existing state (installation present, overlap) · `5` human confirmation required.
