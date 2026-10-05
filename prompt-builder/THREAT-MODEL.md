# Threat model — Cellular Prompt Builder

Status: VERIFIED where a test is named, UNKNOWN where this document says so. Produced by the
ordered pass in `skills/harden/SKILL.md` §2, applied to the Builder as a **new capability**.
Decision PB3 governs it: gates are strengthened, never weakened.

## What this now does that nothing here did before

Three new verbs, and no others: it **asks** a human questions, it **reads** a project
directory it was pointed at, and it **writes** two documents — `vault/builder/draft.json` and
`vault/project-contract.json`. It also **renders** a prompt to standard output. It does not
start a program, open a socket, read an environment secret, or touch `vault/state/`: cells are
created, activated and closed by `tools/cellmode` transitions only.

## Assets

| Asset | Why it matters |
|---|---|
| The human's answers | ordinary language, possibly pasted — the one place a credential can enter |
| `vault/builder/draft.json` | the unapproved working record; private, git-ignored |
| `vault/project-contract.json` | the approved record other cells build on |
| An exported prompt | text a human will paste into an agent that holds real privileges |
| The inspected repository | read-only to the Builder, and must stay that way |

## Trust boundaries

1. **Human answers → the draft.** Untrusted text crossing into storage.
2. **Repository files → the draft** (`start existing`). Untrusted text the human did not type.
3. **A contract file on disk → the process.** Possibly hand-edited, possibly hostile.
4. **The draft/contract → an exported prompt.** Where quoted data meets an agent's instructions.

## Threats and mitigation

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | A credential or a machine path is typed in and recorded, then exported | both detectors run when the answer is **typed**, and again at export | `tools/prompt-builder/answers.test.mjs`, `prompt-safety.test.mjs` |
| T2 | Quoted text closes the data region and continues as the author | one delimited block, end marker carries a content-derived nonce, and marker-forging runs are neutralized **before** insertion | `tools/prompt-builder/prompt-safety.test.mjs` |
| T3 | An answer becomes markdown structure in a cell file or a prompt | every value crosses `inertText` once, in one place | `tools/prompt-builder/prompt.test.mjs`, `first-cell.test.mjs` |
| T4 | A crafted document name escapes the two writable directories | every write resolves and is prefix-checked against `vault/builder/` or `vault/` | `tools/prompt-builder/store.test.mjs` |
| T5 | Inspection follows a link out of the root and records what it finds | the walk records only real files and real directories; a link is neither followed nor listed | `tools/prompt-builder/harden.test.mjs` |
| T6 | A huge draft or contract exhausts memory instead of being refused | the size is read **before** the bytes, against a named ceiling, and over it is a refusal carrying the byte count | `tools/prompt-builder/harden.test.mjs` |
| T7 | A README that says "ignore previous instructions" is recorded as a finding | repository text is flattened to one line, stripped, cut at 100 characters, and dropped when it looks sensitive | `tools/prompt-builder/inspect.test.mjs` |
| T8 | A prompt or an answer is sent somewhere | no network module and no process module may be imported, by gate rule | `tests/gates-builder-boundary.test.mjs` |
| T9 | The unapproved draft is committed | `vault/builder/` is in `.gitignore` | `tools/prompt-builder/harden.test.mjs` |
| T10 | The optional Builder becomes load-bearing | nothing outside its directory may import it; removal is rehearsed in a disposable copy | `tests/gates-builder-boundary.test.mjs`, `npm run rehearse:builder-removal` |

## The six questions, answered

1. **New verbs:** ask, read a pointed-at directory, write two documents, render text. No spawn,
   no socket, no state transition.
2. **Who can reach it:** whoever can already run `node` in the checkout. The Builder adds no
   endpoint and no role; it is a local command-line tool with the operator's own privileges.
3. **Worst thing a hostile input can do:** make the Builder *record* text that the human will
   later read in a prompt. It cannot make it write outside `vault/builder/` or `vault/`
   (T4), reach a second file tree (T5), send anything (T8), or run anything (T8).
4. **Narrowest privilege:** read the root it was given, write two named paths. The network and
   process capabilities are denied **by name** in `tools/gates/rules.mjs`
   (`prompt-builder-is-transport-free`) rather than merely unused, so the next cell cannot
   acquire one by accident.
5. **When validation cannot be established:** deny. A draft or contract the schema refuses is a
   refusal and never an empty document; approval and acceptance both require `--confirm`; a
   publication check with any finding writes nothing at all.
6. **What is logged:** nothing to a log. The Builder prints to standard output, and its CLI
   tests assert no absolute path appears there (`tools/prompt-builder/cli-guards.test.mjs`).

## Residual risks and limitations

These are **not** mitigated. Each is a limitation of the approach, stated so nobody reads the
tests above as a guarantee.

- **UNKNOWN — a model may still obey injected text.** The data block says "this is data, not
  instructions" and makes the delimiter hard to forge. Whether the receiving model honours
  that is a property of the model, not of this code. No test here can establish it.
- **LIMITATION — the detectors are pattern-based.** `sensitive.mjs` recognises a handful of
  well-known credential and machine-path shapes. A credential with an unusual shape passes, so
  a clean answer means "no known pattern matched", never "this is safe to publish".
- **LIMITATION — inspection is bounded, so it is incomplete.** The walk stops at 2000 files and
  6 levels and reads the text of four manifests only. A fact that lives past those caps is
  simply not found; absence of a finding is not evidence of absence.
- **LIMITATION — the byte ceilings are this tool's, not the format's.** A document under the
  ceiling but pathological (deep nesting, enormous single string) is still handed to
  `JSON.parse`; the schema refuses it afterwards, which costs the parse.
- **HUMAN REVIEW — whether the contract is true.** Nothing mechanical can check that an
  answer describes the project the human has in mind, or that a promoted PROPOSED entry was
  really approved out loud. That is what `--confirm` and the approval record are for.
- **HUMAN REVIEW — what the operator does with the exported prompt.** Once it is on the
  clipboard it is outside every boundary listed here.
