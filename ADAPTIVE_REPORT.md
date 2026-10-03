# Cellular Adaptive — stage-4 report

What stage 4 built, what it borrows from the MDAA research programme, and what is actually verified. Every command under *Test and verification results* was executed while writing this file,
2026-10-03, win32, Node ≥ 18. Labels: **VERIFIED** (ran it) · **INFERRED** (derived, says from what) · **PROPOSED** (not built) · **UNKNOWN** (not established — never green). Design:
[`docs/10-adaptive.md`](docs/10-adaptive.md) · decision: [ADR 0004](docs/adr/0004-cellular-adaptive.md) · criteria: `tools/adaptive/ACCEPTANCE.md` (AD1–AD26), `ACCEPTANCE-INTEGRATION.md`
(AD27–AD32), `eip/plugins/adaptive-preferences/ACCEPTANCE.md` (P1–P8, Q1–Q5).

## What was implemented

Four modes — `ready` (the default, stores nothing), `tired`, `focus`, `explore` — as ten source modules and ten test files under `tools/adaptive/`, with zero runtime dependencies added.

| Piece | Where | Status |
|---|---|---|
| Registry, aliases, `INVARIANTS` / `ADAPTABLE` as data · strict validators · standing · transitions · the capped context block — all pure — plus the one disk-touching module (confined, tolerant, atomic) | `modes.mjs`, `schema.mjs`, `validity.mjs`, `transitions.mjs`, `context.mjs`, `io.mjs` | VERIFIED by test |
| CLI `status set reset enable disable clear context hook help`, and the Claude Code `SessionStart` / `UserPromptSubmit` handler | `cli.mjs`, `main.mjs`, `commands.mjs`, `errors.mjs`, `hook.mjs` | VERIFIED |
| Five policy texts (≤ 25 lines each) + the 12-line invariant floor · agent-neutral procedure · eight Claude mode skills, all `disable-model-invocation: true` · an opt-in hook snippet **not** installed by cloning | `adaptive/policies/`, `skills/mode/SKILL.md`, `.claude/skills/`, `adapters/claude-code/{.claude/skills,settings.adaptive.json}` | VERIFIED (8 of 8) |
| Read-only Observer plugin + path-confined host read port; presentation and a read-only badge | `eip/plugins/adaptive-preferences/`, `eip/host/adaptive-read-port.mjs`, `apps/observer/view/mode-view.mjs`, `web/mode-badge.mjs` | VERIFIED by test |
| Optionality as an import gate, not a promise | `tools/gates/boundaries.mjs` (`adaptive-is-optional-and-isolated`), `allowlists.mjs` (`ADAPTIVE_PURE_IMPORTS`), `tests/gates-adaptive-boundary.test.mjs` | VERIFIED |

## MDAA principles adapted

**Inspired by** the author's MDAA programme (*Modelo Dinâmico de Acessibilidade à Aprendizagem*). Three facts from the MDAA material frame the table: **6 of 8** planned layers have a written
artefact (Value and Collective do not exist); several papers state in their own cover notes that **no empirical results are claimed**, and one declares its bench written but not run; and **every
stated domain is education and learning — no MDAA source authorises or discusses transfer to software engineering.** The transfer is therefore **OURS, INFERRED, experimental**; paraphrase with
citation only, no formalism, figure or bench code reproduced.

| Principle | MDAA source | How it is applied here | Label |
|---|---|---|---|
| A declared condition **scopes** a claim; it is not a trait | Paper 1 §2.3; Paper 2 §1 | A mode scopes how this session is conducted; it never becomes a property of the human | MDAA: VERIFIED in source · transfer: OURS, INFERRED |
| **Declared ≠ observed ≠ inferred** are distinct epistemic objects | Paper 1 §5.1; interpretation contract | Only an exact human command sets a mode; no code path derives one from behaviour (AD26) | MDAA: VERIFIED · our rule: VERIFIED by test · transfer: OURS, INFERRED |
| The **meaning of a declared condition belongs to the person** | Working doc §5; Paper 5 §5 | The module never interprets what `tired` means; it loads a text about form | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Standing is declared, frozen before use, displayed — never estimated** | Paper 5 §4, §6 | One declared TTL (4 h default, 0.5–12), evaluated on read, shown with the mode | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **The system offers, the person decides; silence does not confirm** | Working doc §2–§3; Paper 4 §5.1 | No agent sets a mode; absence of a declaration *is* `ready` and is assumed to mean nothing | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Declaration ≠ authorization** (estimate ≠ evidence ≠ warrant ≠ action) | Paper 4 abstract, §1, §5.1 | `INVARIANTS`: a mode grants nothing — gates, approvals, security reporting untouched | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Provenance is stamped by whoever writes**, not claimed by the reporter | Working doc §9; Paper 6 §4 | `session.json` records `source` (`cli` / `claude-hook` / `skill`) and the command as typed | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **The normal state of an adaptive layer is not to adjust — and to say so** | Paper 6 architecture note §2 | `ready` is the default, stores nothing, injects nothing; expiry is announced, never silent | MDAA: VERIFIED · transfer: OURS, INFERRED |
| **Map, not label** — an observation must not become an identity | Theory note §14; Paper 1 §8; Paper 2 | No profile, no classification, no history file, nothing retained after a mode ends | MDAA: VERIFIED · transfer: OURS, INFERRED |

**On "consent":** it is **not** a named MDAA principle — the word does not appear in the material surveyed. What exists are *functional analogues* — person-authority over review status, "silence
does not confirm", refusal-as-data, the authorized pause — and this module implements those; it does **not** claim MDAA has a consent model. **Not claimed:** no state vector, no four-valued
standing calculus, no replication threshold, no policy-adjustment layer; nothing from the MDAA bench is copied, imported or relicensed.

## What remains experimental

**The transfer itself** — an education-domain construct applied to developer interaction; no source validates it. **Whether a model's behaviour changes per mode** — INFERRED from one session (see
below). **The policy texts as texts** — whether the four files describe the right adaptations is a human judgement not yet exercised against real work. **Observer integration** — mechanically
VERIFIED, usefulness unevaluated. **ADR 0004** — *Accepted, approved by the author on 2026-10-03*.

## How modes are activated

Three doors, all the human's. The word is matched **exactly** (case-insensitive, with or without one leading slash); nothing else in a prompt is read.

| Door | How | `source` |
|---|---|---|
| Claude Code skill | `/tired` `/ready` `/focus` `/explore` · `/modocansado` `/modoestoubem` `/modofoco` `/modoexplorar` — all eight carry `disable-model-invocation: true`, so the model cannot invoke them | `skill` |
| Claude Code hook (opt-in) | `UserPromptSubmit` sees the literal prompt; a trimmed prompt equal to one of the twelve commands sets the mode and prints the block | `claude-hook` |
| CLI, your own terminal | `node tools/adaptive/cli.mjs set <mode\|alias>` | `cli` |

Portuguese aliases also work slashless (`cansado`, `estoubem`, `foco`, `explorar`), and `ready` returns to the default. On Git Bash a bare `/tired` becomes a Windows path by shell expansion — use
`set tired` or `MSYS_NO_PATHCONV=1`.

## How preferences are stored

`<root>/.cellular/adaptive/` — git-ignored (`.gitignore:15`, `.cellular/`), deliberately **outside `vault/`** so an afternoon's preference never mixes with the authoritative, append-only cell
log. `session.json` holds the declaration (mode, `declaredBy`, `source`, the command as typed, `activatedAt`, `expiresAt`, `scope`); `preferences.json` holds `enabled`, `ttlHours` and an optional
`communication` level — and **can never hold a mode or a condition key** (`FORBIDDEN_PREFERENCE_KEYS` in `schema.mjs`), so a temporary declaration cannot become permanent. Writes are atomic (temp
file + rename); paths resolve under that directory or the write is refused. **Local only:** no network, no telemetry, no external URL; **no history** of past declarations, by design. `reset` /
`set ready` **deletes** `session.json`; `disable` keeps the file but honours and injects nothing; `clear` deletes both files with **no backup** — it is your data.

## How temporal validity is handled

A declaration carries its own window: **4 hours by default**, bounds **0.5–12** via `ttlHours`. It is *declared, never estimated* — nothing here measures how long anyone should feel anything.
Expiry is evaluated **on read** and the interval is **half-open**: at exactly `expiresAt` the declaration is already over. Five standings stay distinguishable, because collapsing any two would
state something untrue: `none` (silent — an absence is not an event), `active` (silent), `expired` (**one line** naming what expired and when), `invalid` (one line naming the file and the reason;
never repaired, deleted or read as an absence), `disabled` (silent). Expiry is **never silent** and **never persistent**: the notice prints once per change and the effective mode returns to
`ready`.

## How agents retrieve and apply policies

`node tools/adaptive/cli.mjs context` prints one header line (mode, when declared, until when, through which door), then `adaptive/policies/boundaries.md`, then **only the active mode's** policy.
Titles and blank lines are dropped; nothing is reflowed, reordered or summarised — three of the four mode policies are never loaded. The budget is 2048 bytes and going over is an **error, not a
truncation**: half an instruction block still looks authoritative. `ready`, `none` and `disabled` print **nothing**. Agent-neutral path: `skills/cell/SKILL.md` tells any agent to run `context`
when opening or resuming a cell. In Claude Code the hook does it at `SessionStart` and, on `UserPromptSubmit`, **only** when the effective mode changed (hash in `injected.json`) or expired — so
an unchanged mode costs **0 bytes**. The hook always exits 0, never blocks.

## Deterministic vs model-dependent

**Deterministic, and tested:** resolving a command to a mode; validating and writing both files; expiry on read; which policy files are read and the exact bytes assembled; setting a mode from a
prompt **only** on an exact match of one of the twelve commands; `source` on every write; exit codes; the import boundary; and the Observer's read-only rendering, with the invariant that **no
mode hides a `FAIL` or a security finding** — proved for all four modes, mixed and 500-finding lists.

**Model-dependent, and NOT enforceable here:** whether an agent behaves the way the active policy text describes, and whether it refrains from running `set` on its own initiative. **There is no
compliance guarantee.** Two mitigations, honest about their limit: the eight Claude skills cannot be model-invoked, and every write records its `source` — **auditability, not prevention**. So the
behavioural question is **UNKNOWN**, checked by a human procedure, not a test: [`tools/adaptive/MANUAL-VALIDATION.md`](tools/adaptive/MANUAL-VALIDATION.md) — **PERFORMED once on 2026-10-03**
(below). The honest claim: *the mechanism is VERIFIED, the behavioural effect is INFERRED from one session.*

## Privacy and security limitations

- **Hooks are opt-in, and that is a security decision.** Claude Code project hooks run commands **with no trust prompt**, so
  `settings.adaptive.json` ships as a snippet an adopter installs deliberately. Cloning this repository enables nothing.
- **An agent running `cli.mjs set` is a policy violation that is auditable, not preventable.** The state records `source`, so
  a declaration nobody made is visible afterwards; nothing here can stop a process that can already run commands.
- **Skill-vs-builtin command precedence is UNKNOWN** — whether a harness routes `/focus` (or another colliding name) to one
  of these skills rather than a built-in was not established. If it collides, use the slashless or Portuguese spelling.
- **The Observer plugin runs in-process, not in a sandbox.** Permissions and the path-confined read port are a least-privilege
  *contract*; plugin code is trusted first-party code. There is no write port in that composition at all, and the read port
  is created only when the plugin loads ([`SECURITY.md`](SECURITY.md)).
- **No diagnosis, classification or inference** of a condition, a mood or fatigue — a test asserts the *absence* of such a
  code path rather than trusting it.

## Test and verification results

Run fresh in this cell, 2026-10-03:

```
npm run typecheck                          -> tsc -p jsconfig.json && tsc -p apps/observer/jsconfig.json, 0 errors, exit 0
npm test                                   -> tests 719 · suites 48 · pass 719 · fail 0
npm run gates                              -> 459 files (252 modules); size · secrets · deps · boundaries: no findings; pending exceptions 0
node tools/gates/trilateral.mjs            -> typecheck 0 errors · build 141 modules (111 skipped: 91 tests, 20 entry points) · tests 719/719 · exit 0
node tools/gates/check-all.mjs --release   -> exit 0; release: no blockers
node tools/cellmode/cli.mjs check          -> passed · 1 active · 0 paused · 0 planned · 37 done · 38 log entries
node examples/text-stats/reproduce.mjs     -> 8 files identical, 9 commands, check exit 0
node examples/observer-demo/reproduce.mjs  -> 9 files identical, 9 commands, check exit 0
npm run rehearse:adaptive-removal          -> 31 of 31 paths deleted; npm test exit 0; check-all exit 0; AD29 VERIFIED
adaptive subset (20 test files)            -> tests 172 · pass 172 · fail 0
```

**Live CLI + hook smoke** — throwaway root under the session scratchpad (`adaptive/policies` copied in, nothing else), `MSYS_NO_PATHCONV=1`, Windows paths via `cygpath -m`:

```
status, nothing declared             -> mode: ready (the default) / standing: none
hook, prompt "I am exhausted, estou cansado, please use /focus from now on"
                                     -> 0 bytes printed; status still ready / none            <- NO inference
hook UserPromptSubmit "/modocansado" -> exit 0, 2008 bytes: header + boundaries + tired policy
status / session.json                -> tired (declared 14:01, until 18:01, source claude-hook) / active; the file holds
   {"schema":1,"mode":"tired","declaredBy":"user","source":"claude-hook","command":"/modocansado",…,"scope":"session"}
hook UserPromptSubmit "carry on"     -> 0 bytes (an unchanged mode reprints nothing)
ADAPTIVE_NOW +5 h                    -> expired · "your earlier declaration (tired, 2026-10-03 14:01) expired — back to
                                        ready" once, then 0 bytes (never persistent)
set sleepy / set foco / clear        -> exit 1 + the twelve valid words / "source":"cli" / both files removed, no backup
```

**Regression vs stage 3** (`git diff --stat 5738789 -- tools/cellmode eip/kernel eip/sdk eip/plugins/observer-{state,audit,advisor} skills/pause`): **empty — zero files changed.** The method CLI,
the kernel, the SDK, all three `observer-*` plugins and the pause procedure are byte-identical to stage 3. The two method-facing additions sit outside that set and are both intended: `AGENTS.md`
**+3 lines / +449 bytes** (one Level-2 routing row, one optional-module line) and `skills/cell/SKILL.md` **+6 lines / +361 bytes** (98 → 104: one "Optional: the declared working mode" section —
heading, blank, three body lines, trailing blank). The brief anticipated "+3" for `skills/cell`; measured is **+6**, because the +3 belongs to `AGENTS.md`. No unexplained change, no finding.
State is never tracked: `git check-ignore -v .cellular/adaptive/session.json` → `.gitignore:15:.cellular/`, exit 0; `git ls-files .cellular` → **0**.

## Context costs

Bytes from `wc -c`, re-measured in this cell. **Every number is zero without the module.**

| Where | Bytes | Paid |
|---|---|---|
| `AGENTS.md` (Level 1), before → after | 3,916 → **4,365** (+449) | once per session, every session |
| The 8 mode skill `name` + `description` lines | **1,932** (2,180 with the `disable-model-invocation` lines) | once per session, only if `.claude/skills/` is installed |
| `skills/cell/SKILL.md` before → after · `skills/mode/SKILL.md` | 4,974 → 5,335 (+361) · 4,708 | when a cell is opened or resumed · when a mode is declared or asked about |
| Injected block, per turn, **unchanged mode** | **0** | asserted by `hook.test.mjs`, re-measured above |
| Injected block, on a change | `tired` 1,999 · `explore` 1,963 · `focus` 1,878 · `ready` 0 | once, on the turn the mode changes |

Blocks measure 2,000 / 1,964 / 1,879 with `wc -c`; the table excludes the trailing newline, as `tools/adaptive/README.md` does. **No token counts appear anywhere:** no tokenizer is available
here, and a remembered ratio would be fabricated data.

## Resolved decision — the pause trigger is explicit only

**Decided by Hudson A. R. Bonomo on 2026-10-03 and applied in this cell.** The stage-1 `skills/pause/SKILL.md` `description` also fired the ritual on an inferred state — exactly what stage 4
forbids, since a mode exists only because the human declared it. That clause was **removed** from the skill, both Claude Code pointers, `AGENTS.md` rule 7, `README.md`, `adapters/README.md`,
`templates/user-profile.md` and `docs/07-adaptation.md`. Explicit stop requests, `/pause` and `/pausar` still run the ritual; a declared condition now earns one short offer — *"Want me to pause
and record the cell?"* — and never an automatic pause or a mode change. `tests/pause-triggers.test.mjs` enforces it, and `MIGRATION_REPORT.md` section 5 preserves the history. Also
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) item 40.

## Defect found and fixed, and the validation that found AD32

**AD29 was claimed, never run — and it was false.** It said `npm test`, the gates and the Observer pass with the module deleted, citing "the cell-6 deletion rehearsal"; no rehearsal had been run.
A real one **failed 15 tests** (`eip/host` http/openapi/transport, the observer audit and advisor HTTP and contract tests, the Observer CLI): `eip/host/index.mjs` re-exported
`createAdaptiveReadPorts` and `eip/host/observer-composition.mjs` imported it statically, so every importer of the host failed to RESOLVE once `adaptive-read-port.mjs` was gone — the plugin was
already dynamic, its port was not. **Fixed:** the re-export is gone and `adaptiveParts()` loads plugin and port in ONE guarded dynamic `import()` behind `--adaptive`, answering `null` when absent
(reported as "the adaptive module is not installed"), while `observerComposition` refuses the plugin without its port factory. Generic tests now degrade instead of breaking:
`tests/links.test.mjs` exempts a pointer into the module only while it is absent, and the mode-skill test in `tests/pause-triggers.test.mjs` is conditional on `adaptive/policies/` and asserts the
skills are GONE when it is. **Now mechanical, not prose:** `npm run rehearse:adaptive-removal` deletes the 31 documented paths in an `os.tmpdir()` copy and runs both gates there, and
`tests/optional-module-imports.test.mjs` fails on any static import of the module from the host, the Observer, the method CLI or an `observer-*` plugin (3 mutations observed red). **VERIFIED
2026-10-03:** `31 of 31 documented paths` deleted · `npm test — exit 0` · `check-all.mjs — exit 0` · `AD29 VERIFIED`.

**Behavioural validation PERFORMED once, 2026-10-03** — `claude-opus-5-5`, CLI 2.1.283, Node 24.19.0, win32, a sandbox copy, 18 non-interactive runs, **n = 1 per scenario**
([`VALIDATION-RESULTS-2026-10-03.md`](tools/adaptive/VALIDATION-RESULTS-2026-10-03.md)). **13 checks passed:** the three invariants held in every mode, the no-inference promise held 7 for 7, the
vault hash was identical before and after every scenario, and no model turn wrote a file. **Six deviations recorded** — `ready` once produced a factually wrong report; the `source: 'skill'` path
was never exercised, so it stays **UNKNOWN**; `tired` and `ready` differed in structure rather than step size on the one shared prompt; a three-option menu under `tired`; a looser `Bash`
allow-list than written; one navigation slip. Deviation 1 was a real gap, fixed as **AD32**: `hook.mjs` prints `READY_NOTICE` once when the human returns to `ready` or a block already given stops
applying, then falls silent, so the 0-byte steady state holds (`tools/adaptive/hook-ready.test.mjs`; red before the fix, two mutations red). **Re-run the same day:** `/tired` → `/ready` → *"which
mode is active?"* answered correctly, quoting the notice.

## Recommended future improvements (all PROPOSED, none built)

1. **A mode selector in the Observer** — the badge is read-only and the capability has no setter; writing from a dashboard would need a consequential capability, a write port and an approval path.
2. **A hook installer** (`cli.mjs install-hooks`) merging `settings.adaptive.json` into a project's
   `.claude/settings.json` after showing the exact diff and asking.
3. **POSIX verification** — every measurement here is win32; path confinement, atomic rename and symlink behaviour on Linux and macOS are **UNKNOWN**.
4. **Repeat the behavioural validation** — one run, one model, one day is not variance; and the `source: 'skill'` path is still UNKNOWN in a live session.
