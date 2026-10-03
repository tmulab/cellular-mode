# Migration report

From the original private Portuguese method ("Modo Celular", a single-project vault) to
this public, English, project-agnostic repository. Licensing resolved 2026-10-02 (§7).

## 1. Preserved

Semantics carried over unchanged; changing them would be a different method.

- **The seven rules**, same order, same force: one active cell; resumable ⟺ recorded;
  ~200 lines per file and per task; gates green before any claim; no batch or destructive
  operation without approval; divergence is method; stopping is a protocol signal.
- **The lifecycle and its symbols**: 📋 planned · 🔵 active · ⏸ paused · ✔ done — same
  transitions, same "an opening is not a resume", ✔ terminal, planned cells with no log entry.
- **The state protocol**: an append-only log as the single source of truth; index,
  current-cell and cell files are projections, and the log wins when they diverge.
- **The pause ritual**, all eight steps: "facts, not intentions", human confirmation before
  ✔, one next step doable in under five minutes, the parking lot, a one-line goodbye.
- **The cell-routing cases** (named; no name + active; no name + paused; nothing) and the
  "never" list with them. **The approval boundary**: reading protected resources is free,
  mutation is not — declare → prepare → show the exact action → wait → execute → log it.
- **Contract-mediated collaboration**: an interface replaces a meeting; the handoff
  package (Provides / Consumes / Does NOT touch / done criterion / minimal context /
  first step), and never two people in the same cell.

## 2. Translated

Portuguese → English, the originals recorded in `docs/03-state-and-memory.md` so
existing projects can migrate: `INDICE.md` → `INDEX.md`, `CELULA-ATUAL.md` →
`CURRENT-CELL.md`, `log-celulas.md` → `log.md`, `celulas/` → `cells/`,
`estacionamento.md` → `parking-lot.md`, `vault/estado/` → `vault/state/`.

Portuguese survives in three deliberate places: the historical name "Modo Celular"; the
alias skills `/celula` and `/pausar`, pointers to the English ones; and the Portuguese
trigger phrases shipped beside the English ones. `tests/language.test.mjs` enforces it.

## 3. Generalized

- **One project → any project.** Every reference to a specific stack, database, framework
  or repository became a parameter in `templates/project-policy.md`.
- **One agent → any agent.** The method left the tool-specific config file for `AGENTS.md`
  plus `skills/*/SKILL.md`; adapters became pointers, capped at 15 lines.
- **Hand-written state → an optional deterministic CLI.** `tools/cellmode/` executes the
  file protocol instead of remembering it; files stay plain, hand-editable Markdown.
- **The key auditor** (`auditoria-chaves`) became `tools/key-audit/`: configurable prefix
  and extensions, English messages, three buckets, still no total field.
- **One log format addition**: an explicit `**Status:** ⏸ | ✔` field, so `check` can
  compare log and index mechanically.

## 4. Made optional

Everything that was mandatory reading in the original and is now loaded on demand:

| Was | Is now |
|---|---|
| The engineering "law", read before any code task (1,085 lines) | `docs/05-engineering-rules.md` (Level 4) + `vault/policy.md` parameters |
| The personal profile, read every session | `vault/profile.md`, only if present, never requested |
| The protected-resources file | a table in `vault/policy.md`; absent means "treat everything mutable as production" |
| The vault's seven numbered documents | `docs/01`–`docs/08`, one file at a time, only when the topic is relevant |

Measured effect: **1,195 → 56 lines** forced before a code task. See `CONTEXT_AUDIT.md`.

## 5. Removed, and why

- **The dashboard** (`tools/painel/`, ~20 modules): Portuguese throughout, a vendored minified
  three.js copy, and five test blocks hardwired to a private project's data. Porting it meant
  rewriting it, and it is not part of the method.
- **The engineering law file** (`SKILL-METODO-TMULAB.md`, 50 KB): third-party-derived,
  redistribution rights unclear — see section 7. **The personal profile** (`vault/00-perfil.md`):
  one individual's preferences, replaced by a neutral template.
- **The health-condition framing.** The original declared that the method *is* its owner's cognitive
  architecture and named a diagnosis to justify it. `docs/07-adaptation.md` keeps the design assumptions
  (variable energy, non-linear focus, unannounced interruptions) as ordinary and universal, and says
  explicitly that no diagnosis is involved and an agent must never ask for or record one.
- **Rule 7's inferred-fatigue trigger**, the original's "any demonstration of tiredness": **removed** by the author's decision of 2026-10-03. Explicit stop requests still run the pause ritual; a declared condition only earns an offer.
- **The named addressee** of `vault/06-adaptacao.md` (a letter to one person): rewritten as
  `docs/07-adaptation.md`, addressed to any reader.
- **Private project names, the private key map, patient-data and production-stack mentions,
  absolute paths, the OS account name**: replaced by placeholders and by "the production database"
  — `tests/leaks.test.mjs` fails if any of them reappears.

## 6. Remains project-specific

Honest scope limits — not generalized; a reader should not expect them.

- **The dashboard** visualizes one project's cell graph; a general version needs a
  declared input format first.
- **Key-map workflows.** `tools/key-audit/` is general, but the *practice* it supports
  (a contract declaring every key of a domain, audited for real implementations) comes
  from one project's architecture — an example, not a rule.
- **The protected-resource list.** The original named real databases, buckets and
  branches. Only the tiers and the defaults ship; the list is yours.
- **The source's test recipes** assumed one framework and one runner. Here only the
  *gate* ships (typecheck + build + tests, three reported lines); each project declares
  its commands in `vault/policy.md`.

## 7. Licensing — resolved by the author on 2026-10-02

Resolved in writing by the author, Hudson Augusto Rodrigues Bonomo. Not legal advice.

1. **License.** The standard **Apache License 2.0** text stays unchanged in `LICENSE`
   (sha256-pinned by `tests/license.test.mjs`); copyright attribution lives in `NOTICE`,
   to *Hudson Augusto Rodrigues Bonomo* and *TMU-LAB — The Machine Unconscious Lab*.
2. **Relicensing.** The author authorizes Apache-2.0 release of the original material for
   which he holds the necessary rights, **resolving the source engineering skill's earlier
   MIT declaration for his own parts**. Third-party components keep their own licenses.
3. **Engineering methodology.** The independent rewrite `docs/05-engineering-rules.md` is
   **kept**, with attribution to **Fábio Akita** preserved where his work genuinely
   influenced the methodology; no third-party text is reproduced (see `THIRD_PARTY_NOTICES.md`).
4. **Original source.** The original *Modo Celular* project **stays unchanged**.
5. **Agent compatibility.** Codex, Cursor, Gemini, Copilot and Aider integrations remain
   **explicitly marked untested** until verified live (`adapters/README.md`, `README.md`).

Unchanged: **three.js r180 (MIT)** is **not bundled** (no `vendor/`, no `*.min.js`, both
asserted by the license test); **Parnas (1972)** is cited, never quoted. **Remaining item:**
courtesy contact with Fábio Akita is **optional, not a legal requirement** — *INFERRED.*

## 8. Implemented vs proposed

| Item | Status |
|---|---|
| Seven rules, lifecycle, state protocol, pause ritual, cell routing | Implemented |
| `AGENTS.md` Level 1 bootstrap + four-level loading; `skills/cell`, `skills/pause`; `docs/01`–`docs/08`; `templates/*` | Implemented |
| `tools/cellmode/` CLI (10 commands, documented exit codes) | Implemented, 33 tests |
| `tools/key-audit/` | Implemented, 13 tests |
| `examples/text-stats/` with a CLI-replayed vault | Implemented, 11 tests |
| Claude Code adapter | Implemented, and used by this repository |
| Cursor, Codex CLI, Gemini CLI, Copilot, Aider adapters | **Proposed** — written from public docs, never run live |
| Explicit `**Status:**` field in the log entry | Implemented (an addition to the original) |
| A cancelled/abandoned cell state | **Proposed** — absent from the original; recorded as an open issue in `vault/state/parking-lot.md`, not invented |
| Dashboard / cell-graph visualization | **Proposed** — needs a declared input format |
| `cellmode` as an installable package | **Proposed** |

## 9. Tested

Fresh `npm test` (`node --test`, Node 24, no network, zero deps): **81 tests, 81 pass, 0 fail**.

| Test file | Tests | Covers |
|---|---|---|
| `tools/cellmode/cli.test.mjs` | 13 | the real CLI in a child process against files on disk |
| `tools/cellmode/integrity.test.mjs` | 7 | the four integrity findings and the exit codes |
| `tools/cellmode/pure.test.mjs` | 13 | parsing/rendering of log, index, cell files, args |
| `tools/key-audit/key-audit.test.mjs` | 13 | three buckets, no total field, CLI exit codes |
| `examples/text-stats/test/word-count.test.mjs` | 5 | the example's first two cells |
| `.../reading-time.test.mjs` | 4 | the contract's binary done criterion |
| `examples/text-stats/test/reproduce.test.mjs` | 2 | the replayed vault matches the committed one |
| `tests/leaks.test.mjs` | 4 | no personal data, machine paths, private names or secrets |
| `tests/language.test.mjs` | 3 | public content is English (with a justified allowlist) |
| `tests/bootstrap.test.mjs` | 5 | Level 1 budget, tool neutrality, thin adapters, skill parity |
| `tests/links.test.mjs` | 3 | every relative markdown link resolves |
| `tests/license.test.mjs` | 6 | Apache-2.0 hash, author/origin consistency, nothing vendored |
| `tests/size.test.mjs` | 3 | no `.md`/`.mjs` file over 210 lines |

**Still requires manual verification — no automated test can replace it:**

- **Live adapter behavior.** Does Cursor load the rule? Does Codex CLI merge nested
  `AGENTS.md`? Does Copilot open a linked file? One session each, then fix `adapters/`.
- **Skill auto-triggering.** Whether "where did we stop" and "stop here, note this down"
  invoke the skills from their `description`, per tool and per language.
- **The human-facing adaptation test** (`docs/07-adaptation.md`): a second person adopts
  the method and reports whether reconnection after a week takes under five minutes with
  no re-explaining. The only test of the actual claim.

## 10. Readiness and what remains

**Stage 1 — the migration — is complete:** method, CLI, example, tests and licensing.
**Stage 2 is documented elsewhere, not here:** engineering-method integration in
[`METODO_TMULAB_INTEGRATION.md`](METODO_TMULAB_INTEGRATION.md) (48-row traceability); the runtime,
its validation and its limits in [`ARCHITECTURE_REPORT.md`](ARCHITECTURE_REPORT.md); the map in
[`docs/09-architecture.md`](docs/09-architecture.md). Still open after stage 1:

1. Decide the cancelled/abandoned question, or document the absence as final.
2. One live session per adapter (stage 2 VERIFIED Claude Code skill *discovery* only).
3. `cellmode` ergonomics: a `handoff` command, and an `INDEX.md` rebuild-from-log repair.
4. A non-code profile of the method (writing, research, planning), engineering layer off;
   multi-person state (two vaults integrating by contract, with a conflict story); a
   cell-graph visualization with a declared, project-agnostic input format; and a real
   tokenizer measurement of the context levels, to complement the byte counts.

## Appendix · every original file and where it went

| Original | New home / exclusion reason |
|---|---|
| `AGENTS.md` | `AGENTS.md` — rewritten from a 9-line stub into the real Level 1 router |
| `CLAUDE.md` | split: rules → `AGENTS.md`; tool glue → `CLAUDE.md` (10-line pointer). `LEIA-PRIMEIRO.md` → `README.md` |
| `SKILL-METODO-TMULAB.md` | **excluded** (third-party rights unclear); independently rewritten as `docs/05-engineering-rules.md` + `templates/project-policy.md` |
| `.claude/skills/{celula,pausar}/SKILL.md` | `skills/{cell,pause}/SKILL.md` + the four pointers in `adapters/claude-code/.claude/skills/` |
| `vault/00-perfil.md` | **excluded** (personal); neutral replacement `templates/user-profile.md` |
| `vault/01-celulas.md`, `vault/02-estado.md` | `docs/02-cell-lifecycle.md`, `docs/03-state-and-memory.md` |
| `vault/03-regras-codigo.md` | `docs/05-engineering-rules.md` (merged with the policy layer) |
| `vault/04-protecoes.md`, `vault/05-colaboracao.md` | `docs/04-collaboration.md` (approval boundary + handoff) + `templates/project-policy.md`, `templates/handoff.md`, `templates/cell-contract.md` |
| `vault/06-adaptacao.md` | `docs/07-adaptation.md` — de-personalized, addressee removed |
| `vault/estado/` — `INDICE.md`, `CELULA-ATUAL.md`, `log-celulas.md`, `celulas/LEIAME.md`, `estacionamento.md` | `templates/vault/state/` — `INDEX.md`, `CURRENT-CELL.md`, `log.md`, `cells/README.md`, `parking-lot.md`. Skeletons only: the private live history was not carried over |
| `tools/auditoria-chaves{,-cli,.test}.mjs` | `tools/key-audit/{key-audit,cli,key-audit.test}.mjs` — generalized, exit codes added, 13 tests |
| `tools/painel/*.mjs` (`painel`, `parse`, `grafo`, `grafo3d`, `cena3d`, `camera3d`, `orbita`, `estilo`, `pagina`, `rotulos`, `selecao`, `svg2d`, `zoom2d`, `interacao2d`) | **excluded** — Portuguese dashboard, not part of the method; see section 5 |
| `tools/painel/*.test.mjs` (`painel`, `grafo`, `grafo3d`, `constelacao`, `identidade`, `servidor3d`) | **excluded** — hardwired to a private project's data |
| `tools/painel/CONTRATO-{PAINEL,V2A,V2B}.md` | **excluded** (dashboard contracts); the contract *form* survives as `templates/cell-contract.md` and `examples/text-stats/contracts/reading-time.md` |
| `tools/painel/fixture/**` (3 mini-projects, 7 files) | **excluded**; replaced by the generated fixtures of `tools/cellmode/*.test.mjs` and by `examples/text-stats/` |
| `tools/painel/vendor/three@0.180.0/*` + `vendor/VENDOR.md` | **excluded** — no third-party code is bundled; noted in `THIRD_PARTY_NOTICES.md` |
| *(no equivalent)* | **new**: `tools/cellmode/` (16 modules, 33 tests), `docs/01`, `docs/06`, `docs/08`, `adapters/`, `examples/text-stats/`, `tests/`, `CONTEXT_AUDIT.md`, this report, `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md` |
