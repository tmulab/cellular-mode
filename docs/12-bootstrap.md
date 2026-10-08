# 12 · Cellular Bootstrap — putting the method into your project

**Status: OPTIONAL.** Cellular Mode works unchanged without it. Delete `tools/bootstrap/` and `bootstrap/` and the
method, the CLI, the gates, the runtime and the Observer behave exactly as before — that is a gate, not a hope
(`tests/gates-bootstrap-boundary.test.mjs`). If you have never read anything else in this repository, you can read
this page first.

## Start here — eight steps, from an idea to a verified first cell

Never used any of this? Do these eight things in order, and stop whenever you like. Nothing before step 5 writes anything in your project except the Builder's own private draft. `<dir>` is a directory **you** created (Bootstrap never creates the root); `<cm>` is this repository's checkout. A brand-new project has no `package.json`, so use the `node …` forms everywhere — the `npm run` aliases exist only inside this repository.

**Step 0, and steps 7–8 do not work without it: make `<dir>` a git repository.** In `<dir>`, run `git init` (and set `user.name` / `user.email` if this machine has none) **before** step 4. Article 8 — final verification and the three hooks — is a *conditional* component: on a directory that is not a git work tree the plan drops it, `--approve hooks` has nothing to apply, `tools/gates/verify-final.mjs` is never installed, and step 8 cannot run. Bootstrap says so in the plan rather than degrading silently, but it will not create the repository for you.

| # | What you do | The command |
|---|---|---|
| 0 | **make it a git repository** | in `<dir>`: `git init` |
| 1 | **describe your project** | `node <cm>/tools/prompt-builder/cli.mjs start new --root <dir> --name "<project>"` |
| 2 | **answer the questions** | `… next --root <dir>` asks exactly one; `… answer <id> "<your words>" --root <dir>` records it. Repeat until `… status --root <dir>` says *ready*; `answer scope-out none` is a real answer |
| 3 | **approve the contract** | `… approve --root <dir>` prints readiness, conflicts and the publication check and exits 5; then `… approve --confirm --root <dir>` writes `vault/project-contract.json` |
| 4 | **review the installation plan** | `node <cm>/tools/bootstrap/cli.mjs new <dir> --profile standard --dry-run` |
| 5 | **approve the installation** | `node <cm>/tools/bootstrap/cli.mjs new <dir> --profile standard --confirm --approve hooks,first-cell` |
| 6 | **open the first cell** | `node <dir>/tools/cellmode/cli.mjs open "<the 📋 name in vault/state/INDEX.md>" --root <dir>` |
| 7 | **approve a verification check** | `node <cm>/tools/bootstrap/cli.mjs verification <dir> add tests --confirm -- node --test`, then `… run tests --confirm`, then `… mandatory tests --confirm` |
| 8 | **run final verification** | in `<dir>`: `node tools/gates/verify-final.mjs` — green, and only then, commit |

Only step 5 installs, and it writes only what step 4 showed. The Builder's `--root` goes **after** the command, never before it. `hooks` and `first-cell` are what step 4's *complete approval list* offers for an empty directory **that step 0 made a git repository** (`ci-workflow` is the third, optional one); without `git init` that same list holds only `first-cell` and `ci-workflow`, because `hooks` belongs to the dropped `article-8` component. An `AGENTS.md` and a `.gitignore` that do not exist yet are **generated**, so `agents-block` and `gitignore-block` are not on that list — they appear only when those files already exist. Step 5 creates `vault/state/` **and** the planned first cell, so do not run `cellmode init` or `builder cell --accept` before it. Internal vocabulary starts at step 6, where you act on a cell for the first time. Full Builder detail: [`docs/11-prompt-builder.md`](11-prompt-builder.md).

## What it is

You have a project — one you are about to start, or one with ten years of history — and you want to work in cells in it. Bootstrap installs a **coherent, selected subset** of Cellular Mode into that directory. It never copies the whole repository, does not intentionally modify application or runtime behaviour during adoption, and never decides for you what to install. It is an ordinary Node.js program: **no network**, **no language model**, no external runtime dependencies (git where required), and the same project with the same flags gives the same plan and the same files every time. It writes only inside the directory you point at, never replaces a file that is already there, and every consequential step needs both an approval **id** and `--confirm`.

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

Step 1 executes none of your project's commands and prints the **Adoption Compatibility Report**: what was detected, what was inferred, what would be proposed, what conflicts, what is unknown, and which approvals the install would need. Read it — it is the document your consent is formed from; `--json` gives the same report as data. **`--analyze` exits 2 whenever it has findings to report, and a clean report still has findings** (everything it detected is a finding), so 2 is the normal outcome there and is not an error: never chain it with `&&`, read it instead. Step 3 writes only what step 2 showed. An approval id you leave out is not refused: the step is recorded as *proposed* and skipped, with the exact command or text printed so you can do it yourself. An id you misspell **is** refused — a typo must not look like consent withheld.

Then start working. The first cell is created **planned** (📋) and never activated; you open it yourself — `node tools/cellmode/cli.mjs open "<cell-name>" --root ../my-app`, and the same CLI's `status` prints the ≤5-line reconnection. In an agent with the skills installed, `/cell` does the same by reading `AGENTS.md`.

## "I'm starting a new project"

**The eight steps at the top of this page are that path, in full** — `git init` in the target (step 0: Article 8 is conditional on a git work tree) → Builder (`start new` … `approve --confirm`) → `new --dry-run` → `new --confirm --approve hooks,first-cell` → `cellmode open` → `verification add / run / mandatory` → `node tools/gates/verify-final.mjs` → commit. [`docs/11-prompt-builder.md`](11-prompt-builder.md) describes the same order from the Builder's side; the two pages do not offer a second one. Do **not** start it with `cellmode init` or `builder cell --accept`: this install creates `vault/state/` and the planned first cell, and `init` refuses a vault that already exists.

The **Prompt Builder** is optional. With it, `vault/project-contract.json` is found, validated through the Builder's own CLI, and the first cell is proposed from it. Without it the contract is merely *referenced*, its validity stays UNKNOWN, and the install is otherwise identical.

**A draft is never authoritative, and never read (H1).** `new` tolerates the Builder's private `vault/builder/` in the target instead of refusing it, and it never reads it for planning, never copies it, never records it in the manifest, and never promotes it to an approved contract — a draft-only target installs *without* a contract and says so. Any **other** unexpected file (a `package.json`, your source tree) still makes `new` stop and name `existing --analyze` instead. **A draft stays private (H2):** the managed `.gitignore` block covers `vault/builder/`, a generated `.gitignore` carries that line too, and if a `.gitignore` already exists while a draft is present, the plan *and* the install output print one warning — the draft `MAY BECOME COMMITTABLE` without `--approve gitignore-block` — with the exact line to add yourself.

`new` discovers nothing and runs nothing, so the install-time `--mandatory` is refused there, and the generated verification contract holds no check at all. `verification <dir> add … / run … / mandatory …` is how a new project gets its first one — see below.

## Profiles — nothing is installed by default

`--profile` is required; a forgotten flag prints all four profiles with a one-line description each and exits 1 rather than guessing, and `node tools/bootstrap/cli.mjs help` lists the same four — you never have to come back to this table to find a name.

| profile | what it installs |
|---|---|
| `minimal` | the method and nothing else: `AGENTS.md`, `skills/cell`, `skills/pause`, the seven engineering skills, the `cellmode` CLI, an empty `vault/state/`, the verification contract |
| `standard` | minimal **+** Cellular Adaptive **+** the Prompt Builder |
| `full` | standard **+** the Universal Plugin Protocol **+** the local Observer |
| `custom` | exactly the components you name with `--components a,b`; dependencies are added and **shown** before approval, conflicts refuse |

**Article 8 rides along conditionally.** The `article-8` component (final verification and the git hooks) joins every profile *only when the target is a git repository*, because its whole mechanism is a commit trailer and three hooks. When the condition is unmet the component is dropped and the plan **says so**; it never silently degrades. Without `--confirm` an install stops at the plan, exit 5.

## The plan is the consent document — `--dry-run`

`--dry-run` renders the full plan and writes nothing at all — not a scratch file, not a log; the claim is tested by hashing the whole target tree before and after (`bootstrap-idempotence.test.mjs`). What the plan shows, in text and identically under `--json` (H5): the resolved components and why each is there, the files to create with their mode, the existing files it will not touch, conflicts, the integrations, every command it merely *proposes*, the warnings, **the exact text of every managed block, line by line, prefixed `+`** — you read the bytes before you approve them, not a description of them — and **one complete approval list**, the only one printed in that run, with a *why* under each id. There is no second, shorter list anywhere.

**`vault/state/` is one entry that expands.** In the file list the state skeleton appears as the single generated path `vault/state/`, not as its individual files, because it is created as a skeleton; the directory it expands to holds `log.md`, `INDEX.md`, `CURRENT-CELL.md`, `parking-lot.md` and `cells/`. A plan's file *count* therefore differs from the number of paths on disk afterwards by exactly that expansion, and the figure grows again as you work — that is `cellmode` writing, not drift. `--verbose` prints every path instead of a capped list.

## The report and the baseline

The **Adoption Compatibility Report** (`existing --analyze`) labels detected facts VERIFIED with a relative evidence path, guessed conventions INFERRED, integrations PROPOSED, and the rest UNKNOWN. **Analysis never executes a command it found.** The **Adoption Baseline** (`vault/adoption-baseline.json`, written at install) records commit, tree, cleanliness, languages, build systems, the build/test/typecheck/lint commands with a label on each, CI, hooks and instruction files. Those commands **run only** if you approve `baseline-checks` — the single approval that causes a program to start — and only once. A check that fails there is recorded as **pre-existing**: Bootstrap never fixes an unrelated defect and never counts your red test as its own. `invariants` is written empty by construction — what must never change about a system is a human's statement.

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
**notes**, never as checks. `mandatory: true` is valid only for a VERIFIED check or one carrying a recorded human approval — and **you never hand-edit this file** (H6): `node tools/bootstrap/cli.mjs verification <dir> <sub>` is the whole interface. `list` (also `--json`) prints every check *and*, for each one that cannot block a commit yet, why not and the exact next command; `add <id> -- <argv…>` records a check you authored as **PROPOSED**; `run <id>` executes it once, with no shell, and only an exit 0 makes it **VERIFIED**; `mandatory <id>` records `approval: { by: "human", at }` and sets the flag; `approve <id>` records the approval alone; `revoke <id>` withdraws both and leaves the label and basis intact. **Nothing but a passing `run` ever writes VERIFIED** — an approval is your decision, never evidence. Every subcommand but `list` needs `--confirm`; without it the exact change is printed and the exit is 5, and an unknown id exits 1.

**Fail closed — and this is your next step after installing.** A contract that is unreadable, invalid, or has **zero mandatory checks** makes final verification refuse; it never passes by default, and a fresh install is exactly that case. `verification <dir> list` names that state and the command that ends it. (A project with no contract at all gets the built-in suite, unchanged.) **Windows (H7):** a check whose `argv[0]` is exactly `npm` or `npx` is resolved to the Node script the shim wraps and run with no shell; if that script is absent the check is `not-runnable` and the message names `["node", …]` as the alternative — a shell is never used either way.

**A check that cannot start is `failed`, on purpose.** `verification run <id>` distinguishes the two outcomes and tells you which you got — `not-runnable` (the command could not be started: `ENOENT`, a `.cmd`, a shell builtin) leaves the label untouched, exactly like a failure, because only a passing run establishes VERIFIED. `node tools/gates/verify-final.mjs` then reports that same mandatory check as **`failed`**, with the reason on its own line (`could not run <cmd>: … ENOENT`), and refuses completion. That difference in wording is deliberate: *unestablished ⇒ UNKNOWN ⇒ fail closed*, and a suite that cannot run a mandatory check has not verified anything. Fix the command — usually by pointing it at a real argv — and run it again.

**Write a done criterion your tests can prove.** A criterion like "the page loads and the button works in my browser" cannot be evidence: nothing in the suite can decide it, so a cell carrying it can only ever be closed on a human's word, which Article 8 does not accept as verification. State it as something a command decides and then make that command the check: not "the list shows the new book" but "`node --test` passes, and `tests/list.test.mjs` asserts that a book added appears in the rendered list". A manual look may still be *useful* — keep it, label it as the manual review item it is, and keep it out of the done criterion. Beware the vacuous green while you are at it: `node --test` in a project that has no test file yet exits **0**, so `run` would record VERIFIED for a command that proved nothing — write the failing test first, watch it go red, and only then make the check mandatory. (Nothing Bootstrap installs ever joins that run: contract **H4** is that no installed file is discoverable by the host's own test patterns, and a gate checks it for every profile.)

## Hooks and CI

**Hooks** are activated only when five conditions hold at once: `article-8` is installed, no hook machinery exists
(Husky, Lefthook, pre-commit, native hooks or anything unrecognised), `core.hooksPath` is unset, the target is a git
work tree, and you gave `--approve hooks` with `--confirm`. The one action is `git config core.hooksPath .githooks`,
local, never `--global`; the copied hooks are written mode `0755`, because POSIX git silently SKIPS a hook that is not executable (on Windows there is no exec bit to write and git ignores the mode). Any condition missing and you get the exact command plus a **composition plan** in words —
Bootstrap never writes into another tool's hook configuration. **CI**: GitHub Actions, GitLab CI, CircleCI, Azure
Pipelines, Bitbucket and Jenkins are detected, and no workflow is ever read for merging, edited or replaced. The only
file Bootstrap may create is `.github/workflows/cellular-verify.yml`, when that exact path is absent, `ci-workflow` is
approved and `--confirm` is given: additive, least permissions, actions pinned by commit SHA, no secret, no `${{ … }}`
expression. For every other provider the output is **text you apply yourself**.

## Status, ownership and drift

`status <dir>` writes nothing and reports the installed version, the components, every recorded file as healthy / missing / modified / referenced / **evolved**, the blocks, the integrations and a verdict. `--verbose` lists every path instead of a capped sample.

| classification | meaning | next action |
|---|---|---|
| `healthy` | everything immutable Bootstrap owns still hashes to what was recorded | `none` |
| `drift` | something immutable Bootstrap owns was **changed** | `repair`, or `repair-or-upgrade` |
| `partial` | an immutable file Bootstrap created is **gone** | `repair`, or `upgrade` with a newer source |
| `uninstalled-with-residue` | a finished `uninstall` kept files, so the manifest left behind is residue | `none` — the kept paths and both safe next steps are printed |

**Three ownership classes (H3).** *immutable* — the copied and generated installation assets, judged exactly as above. *evolving* — `vault/state/**` and `vault/verification.json`: `cellmode` rewrites them by design and you approve checks in the contract with the `verification` command, so they are reported **evolved (expected)**, listed for audit (`--verbose` uncaps the list), and are never drift, partial or `repair`. *user/referenced* — a file somebody else owns is never drift.

The next action is **detection only**: there is no repair and no upgrade automation, and a re-run never silently reinstalls — an existing manifest makes `new` and `existing` refuse with exit 3 and zero writes. Exit 0 healthy or uninstalled-with-residue · 2 drift or partial.

## Uninstall — `uninstall <dir> --dry-run` first, then `--confirm`

**The default is to keep.** A file is deleted only if Bootstrap created it *and* its hash still equals what the manifest recorded, re-hashed immediately before the unlink; a managed block only if it is byte-intact. Everything else is kept and reported **with the reason**, plus a reverse patch for review. Directories go only when empty, and git history is never touched. If anything under `vault/state/` was added or changed, the **whole** directory is kept — that is your project's memory. Deleting a modified file needs `--force-modified <paths>` together with `--confirm`. If anything at all is kept, the manifest is kept untouched and `vault/bootstrap/uninstall-report.json` lists the rest.

**`--dry-run --verbose` lists every single action** — each deletion, each kept file with its reason, each directory candidate, each integration to undo — because a destructive plan you cannot read in full is not reviewable. Plain `--dry-run` groups and caps the long lists so the shape fits on a screen; add `--verbose` before you confirm.

**Afterwards, two scratch directories may remain, untracked.** `vault/bootstrap/` (plans, saved reports, the uninstall report) and `.cellular/` (local verification evidence) are working files Bootstrap never recorded as installed, so it never deletes them — and once the managed `.gitignore` block is gone, the rules that hid them are gone too, so `git status` starts showing them. Nothing reads them any more: delete them yourself if you want a clean tree.

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
