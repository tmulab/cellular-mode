# 12 · Cellular Bootstrap — putting the method into your project

**Status: OPTIONAL.** Cellular Mode works unchanged without it. Delete `tools/bootstrap/` and `bootstrap/` and the
method, the CLI, the gates, the runtime and the Observer behave exactly as before — that is a gate, not a hope
(`tests/gates-bootstrap-boundary.test.mjs`). If you have never read anything else in this repository, you can read
this page first.

## What it is

You have a project — one you are about to start, or one with ten years of history — and you want to work in cells in it. Bootstrap
installs a **coherent, selected subset** of Cellular Mode into that directory. It never copies the whole repository, does not
intentionally modify application or runtime behaviour during adoption, and never decides for you what to install. It is an ordinary
Node.js program: **no network**, **no language model**, no external runtime dependencies (git where required), and the same project
with the same flags gives the same plan and the same files every time. It writes only inside the directory you point at, never replaces
a file that is already there, and every consequential step needs both an approval **id** and `--confirm`.

```
node tools/bootstrap/cli.mjs <new|existing|status|uninstall> <target-dir> [options]
npm run -s bootstrap -- <command> <target-dir> [options]
node tools/bootstrap/cli.mjs help     # the full flag list, which is the contract
```

The target directory **must already exist**: Bootstrap never creates the root.

## "I already have a project"

Four steps, and you can stop after any of them. Nothing before step 3 writes anything.

```
node tools/bootstrap/cli.mjs existing ../my-app --analyze         # 1 · look, and only look
node tools/bootstrap/cli.mjs existing ../my-app --profile minimal --dry-run   # 2 · the plan
node tools/bootstrap/cli.mjs existing ../my-app --profile minimal --confirm \
  --approve agents-block,gitignore-block,hooks,first-cell         # 3 · install, step by step
node tools/bootstrap/cli.mjs status ../my-app                     # 4 · check what landed
```

Step 1 executes none of your project's commands and prints the **Adoption Compatibility Report**: what was detected,
what was inferred, what would be proposed, what conflicts, what is unknown, and which approvals the install would
need. Read it — it is the document your consent is formed from; `--json` gives the same report as data. Step 3 writes
only what step 2 showed. An approval id you leave out is not refused: the step is recorded as *proposed* and skipped,
with the exact command or text printed so you can do it yourself. An id you misspell **is** refused — a typo must not
look like consent withheld.

Then start working. The first cell is created **planned** (📋) and never activated; you open it yourself —
`node tools/cellmode/cli.mjs --root ../my-app open <cell-name>`, and the same CLI's `status` prints the ≤5-line
reconnection. In an agent with the skills installed, `/cell` does the same by reading `AGENTS.md`.

## "I'm starting a new project"

Optionally shape the idea first with the **Prompt Builder** ([`docs/11-prompt-builder.md`](11-prompt-builder.md)): it
writes `vault/project-contract.json`, which `new` finds, validates through the Builder's own CLI, and can propose the
first cell from. Without the Builder the contract is merely *referenced* and its validity stays UNKNOWN; the install
is otherwise identical. Create the directory yourself, then dry-run and confirm:

```
node tools/bootstrap/cli.mjs new ../my-idea --profile standard --dry-run
node tools/bootstrap/cli.mjs new ../my-idea --profile standard --confirm --approve hooks,first-cell
```

`new` discovers nothing and runs nothing, so `--mandatory` is refused there (see below).

## Profiles — nothing is installed by default

`--profile` is required; a forgotten flag prints the list and exits 1 rather than guessing.

| profile | what it installs |
|---|---|
| `minimal` | the method and nothing else: `AGENTS.md`, `skills/cell`, `skills/pause`, the seven engineering skills, the `cellmode` CLI, an empty `vault/state/`, the verification contract |
| `standard` | minimal **+** Cellular Adaptive **+** the Prompt Builder |
| `full` | standard **+** the Universal Plugin Protocol **+** the local Observer |
| `custom` | exactly the components you name with `--components a,b`; dependencies are added and **shown** before approval, conflicts refuse |

**Article 8 rides along conditionally.** The `article-8` component (final verification and the git hooks) joins every
profile *only when the target is a git repository*, because its whole mechanism is a commit trailer and three hooks.
When the condition is unmet the component is dropped and the plan **says so**; it never silently degrades. `--dry-run`
renders the full plan and writes nothing at all — not a scratch file, not a log; the claim is tested by hashing the
whole target tree before and after (`bootstrap-idempotence.test.mjs`). Without `--confirm` an install stops at the
plan, exit 5.

## The report and the baseline

The **Adoption Compatibility Report** (`existing --analyze`) labels detected facts VERIFIED with a relative evidence
path, guessed conventions INFERRED, integrations PROPOSED, and the rest UNKNOWN. **Analysis never executes a command
it found.** The **Adoption Baseline** (`vault/adoption-baseline.json`, written at install) records commit, tree,
cleanliness, languages, build systems, the build/test/typecheck/lint commands with a label on each, CI, hooks and
instruction files. Those commands **run only** if you approve `baseline-checks` — the single approval that causes a
program to start — and only once. A check that fails there is recorded as **pre-existing**: Bootstrap never fixes an
unrelated defect and never counts your red test as its own. `invariants` is written empty by construction — what must
never change about a system is a human's statement.

## What gets written, and where

Three modes. **copy** — byte-identical method assets, post-install hash recorded. **generate** — project-specific
files written from a template plus established facts (`AGENTS.md`, `vault/state/`, `vault/verification.json`,
`vault/install-manifest.json`, adapter pointers); they never claim to be an upstream copy. **reference** — an
authoritative file that already exists is pointed at, not duplicated. Never copied: tests, fixtures, evidence,
reports, examples, `node_modules/`, personal configuration, credentials, history, or anything carrying an absolute
path.

**Managed blocks are the only edit to a file you own.** Bootstrap never replaces an existing file. For exactly three
files it understands — `AGENTS.md`, `CLAUDE.md`, `.gitignore` — it may **append one delimited block**, between
`cellular-mode:begin <component>` and `cellular-mode:end <component>` markers in that file's comment syntax, after
showing you the text and receiving the right approval (`agents-block` or `gitignore-block`) **and** `--confirm`. Your
instruction file and your ignore rules are two different decisions, so they are two different ids. Anything else —
`package.json`, a CI workflow, a build file, a README, another tool's hook configuration — is a **proposed patch**
printed for you to apply. An unprovable merge stops with exit 5 and a manual plan.

**The install manifest** `vault/install-manifest.json` is the authoritative record: source name, version and revision,
profile, components with their versions, the instant, the target's **basename only**, every file with its mode and
hashes, integrations, approvals, host facts, limitations. It is meant to be committed, so it is publication-checked:
no secret, no contact address, no absolute path, no machine metadata. Work in progress — plans, drafts, saved reports
(`--save-report`), the uninstall report — goes to `vault/bootstrap/`, which is scratch and git-ignored.

## The verification contract, and Article 8 made configurable

`vault/verification.json` (schema `cellular-mode/verification`, v1) tells final verification which commands *your*
project runs. Each check is `{ id, argv, status, basis, mandatory, approval }`. `argv` is an argument **array**
executed with `shell: false` — a `;` in it is text — and a shell wrapper (`sh -c`, `cmd /c`, `powershell -Command`) is
refused by name. A command found in your `package.json` or build files is **INFERRED** — nobody ran it. One that ran
and passed under an approved `baseline-checks` becomes **VERIFIED**. Commands parsed out of a CI file are recorded as
**notes**, never as checks. `mandatory: true` is valid only for a VERIFIED check or one carrying a recorded human
approval (`--mandatory <ids>`, which also needs `--confirm`, `existing` only).

**Fail closed — and this is your next step after installing.** A contract that is unreadable, invalid, or has **zero
mandatory checks** makes final verification refuse; it never passes by default, and a fresh install is exactly that
case. Read the file, decide which of your own checks really proves what its id claims, and approve one. Until then
final verification stays red on purpose. (A project with no contract at all gets the built-in suite, unchanged.)

## Hooks and CI

**Hooks** are activated only when five conditions hold at once: `article-8` is installed, no hook machinery exists
(Husky, Lefthook, pre-commit, native hooks or anything unrecognised), `core.hooksPath` is unset, the target is a git
work tree, and you gave `--approve hooks` with `--confirm`. The one action is `git config core.hooksPath .githooks`,
local, never `--global`. Any condition missing and you get the exact command plus a **composition plan** in words —
Bootstrap never writes into another tool's hook configuration. **CI**: GitHub Actions, GitLab CI, CircleCI, Azure
Pipelines, Bitbucket and Jenkins are detected, and no workflow is ever read for merging, edited or replaced. The only
file Bootstrap may create is `.github/workflows/cellular-verify.yml`, when that exact path is absent, `ci-workflow` is
approved and `--confirm` is given: additive, least permissions, actions pinned by commit SHA, no secret, no `${{ … }}`
expression. For every other provider the output is **text you apply yourself**.

## Status and drift

`status <dir>` writes nothing and reports the installed version, the components, every recorded file as healthy /
missing / modified / referenced, the blocks, the integrations, and a verdict:

| classification | meaning | next action |
|---|---|---|
| `healthy` | everything Bootstrap owns still hashes to what was recorded | `none` |
| `drift` | something Bootstrap owns was **changed** | `repair`, or `repair-or-upgrade` |
| `partial` | a file Bootstrap created is **gone** | `repair`, or `upgrade` with a newer source |

A file somebody else owns is never drift. The next action is **detection only**: there is no repair and no upgrade
automation, and a re-run never silently reinstalls — an existing manifest makes `new` and `existing` refuse with exit
3 and zero writes. Exit 0 healthy · 2 drift or partial.

## Uninstall — `uninstall <dir> --dry-run` first, then `--confirm`

**The default is to keep.** A file is deleted only if Bootstrap created it *and* its hash still equals what the
manifest recorded, re-hashed immediately before the unlink; a managed block only if it is byte-intact. Everything else
is kept and reported **with the reason**, plus a reverse patch for review. Directories go only when empty, and git
history is never touched. If anything under `vault/state/` was added or changed, the **whole** directory is kept —
that is your project's memory. Deleting a modified file needs `--force-modified <paths>` together with `--confirm`. If
anything at all is kept, the manifest is kept untouched and `vault/bootstrap/uninstall-report.json` lists the rest.

## Optional components are optional here too

Cellular Adaptive and the Prompt Builder may be absent from this checkout. If a profile you asked for names a
component whose source is not here, the profile is refused **whole**, with `COMPONENT_UNAVAILABLE` (exit 2), naming
the component and the missing path, and suggesting `--profile custom` without it: installing less than a profile
promises would be the worse failure. Components you did not select being absent changes nothing, and `status` and
`uninstall` need no component source at all — they work from the manifest in the target. The Prompt Builder is reached
through its **own CLI as a subprocess**, never imported.

## What Bootstrap never does on its own

Create the target directory · replace an existing file · edit or delete a CI workflow · write into another tool's hook
configuration · set anything `--global` · run a command it merely discovered · mark a check mandatory · activate a
cell · touch git history · open a network connection · install a smaller profile than the one you named · repair,
upgrade or reinstall · fix a pre-existing failure.

**Exit codes:** `0` ok · `1` usage or bad arguments · `2` validation, drift or analysis findings · `3` refused because
of state that already exists (an install is present, or the target overlaps the source) · `5` confirmation required.

**Removing Bootstrap itself:** `npm run rehearse:bootstrap-removal` copies this repository, deletes the whole Bootstrap
file set and runs the suite and the gates there. Nothing outside `tools/bootstrap/` imports it, so the method survives
its removal — claim **BS1**, rehearsed rather than asserted.

## What is VERIFIED on this page, and what is not

The design is language-neutral, but VERIFIED coverage is what the fixtures exercise: Node/JavaScript/TypeScript, Python, Rust, Java, Go
and polyglot combinations; other languages are not claimed. VERIFIED by the deterministic suite: path confinement and symlink refusal,
that a dry run writes nothing, that an install touches nothing outside the target, that a second install refuses, that no filename ever
reaches a command line, that no shell is ever used, that no network module is imported, that an uninstall deletes only unchanged
recorded files, that every profile is import-closed, and that no secret or absolute path reaches a generated artefact — the threat
model names the test behind each ([`bootstrap/THREAT-MODEL.md`](../bootstrap/THREAT-MODEL.md)). NOT verified: how any particular
language model behaves with the installed skills; large real-world repositories; adoption on macOS or Linux by hand. On Windows a
`.cmd` command (such as `npm`) cannot be started without a shell, and a shell is refused — such a check is recorded as **not-runnable**
with the reason, never as a pass. A clean scan is not safety.

Design detail and decisions BS1–BS4: [`bootstrap/CONTRACTS.md`](../bootstrap/CONTRACTS.md). Stage report: [`BOOTSTRAP_REPORT.md`](../BOOTSTRAP_REPORT.md).
