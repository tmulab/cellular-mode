# Final verification — Article 8, as a mechanism

> A development cell must never be considered complete on the basis of verification results
> obtained **before its final modification**.

Given by the responsible human on 2026-10-03. The text is
[`docs/00-constitution.md`](../../docs/00-constitution.md), Article 8. This file is the
mechanism: what is measured, what blocks, and what it cannot do.

## Why it exists

Commit `523cb44` of this repository was pushed with a **failing test**. Nothing was lied about:
the suite had been green when it ran. Then a vault entry was written, the state moved, and the
green belonged to a state that no longer existed
([`policy/relaxations.md`](../../policy/relaxations.md), R-4). The defect was the **order**, so
the order is now checked — and, since 2026-10-04, so is the identity of the bytes.

## The eight steps, and who does which

| Step | Who | Mechanism |
|---|---|---|
| 1 complete the implementation | human + agent | — |
| 2 update documentation and vault records | human + agent | `cellmode complete` prints "RECORDED — not yet authorized" |
| 3 prepare for final verification | human + agent | stop writing; stage what you changed |
| 4 fingerprint the controlled state | mechanism | `fingerprint.mjs`, then `byte-equivalence.mjs` |
| 5 run the complete mandatory suite | mechanism | `verify-final.mjs`, `MANDATORY_SUITE` |
| 6 confirm the state did not change | mechanism | second fingerprint, compared |
| 7 record the evidence separately | mechanism | `.cellular/evidence/final-verification.jsonl` |
| 8 authorize completion | mechanism | `authorization.mjs status`, the hooks |

Steps 1 to 3 cannot be automated and are not pretended to be. Steps 4 to 8 are not opinions.

## The controlled set

Exactly the files **git would include**: `git ls-files --cached --others --exclude-standard`,
restricted to paths that exist on disk. So `.gitignore` decides the boundary — `node_modules/`
and `.cellular/` are outside it; source, tests, docs, configuration, manifests, cell contracts,
`vault/state/**` and release checklists are inside.

The **fingerprint** is `sha256` over the sorted `path \0 sha256(bytes)` lines, prefixed by a
schema string. Content is hashed as bytes (a line-ending change counts), paths are hashed too
(a rename counts), and a deleted file simply drops out of the list (a deletion counts).

The **tree id** is git's own name for the same working state, computed with a throwaway index
in the system temporary directory (`GIT_INDEX_FILE`), so the real index, HEAD and working tree
are untouched; the only side effect is content-addressed objects git garbage-collects.

## Byte equivalence — what was verified is what will be committed

The fingerprint hashes the WORKING bytes; a commit records the FILTERED bytes
(`.gitattributes`, `core.autocrlf`). Binding one to the other without checking that they are
the same content is a **false equivalence**, and on 2026-10-04 it was real here: sixteen
working copies carried CRLF while their committed blobs carried LF, so a green suite certified
bytes no commit would ever contain, and CI failed two tests that passed locally. Since then
`verify-final` compares the two blob ids for every controlled path BEFORE running the suite
and refuses by name if any differ, `equivalent: true` is necessary for authorization, and a
record without that field authorizes nothing. The whole chain, the remedy, the compatibility
policy and the clean-worktree alternative that was assessed and not chosen:
[`BYTE-EQUIVALENCE.md`](BYTE-EQUIVALENCE.md).

## The mandatory suite

Data, in `verify-final.mjs`:

| Check | Command |
|---|---|
| `typecheck` | `npm run typecheck` (both configurations) |
| `tests` | `node --test` |
| `gates-release` | `node tools/gates/check-all.mjs --release` |
| `cell-state` | `node tools/cellmode/cli.mjs check` |

Adding a check adds it to the rule. **Removing one is a relaxation** and needs the explicit,
justified, documented, human-approved exception the constitution describes.

### A project-local suite — `vault/verification.json`

Absent in THIS repository, and absent means exactly the four checks above (asserted by
`tests/gates-verification-suite.test.mjs`). An adopting project supplies its own instead
(`cellular-mode/verification` v1, decision BS3): `checks: [{ id, argv, status, basis, mandatory,
approval, timeoutSeconds? }]`. `argv` is an argument ARRAY run with `shell: false` — a `;` in it
is text — and a shell WRAPPER (`sh -c`, `cmd /c`, `powershell -Command`) is refused by name.
`mandatory: true` needs status VERIFIED or `approval: { by: "human", at }`: nothing merely
INFERRED may block a commit. `cell-state` is added by the gate and cannot be approved away. FAIL
CLOSED three ways — unreadable, invalid, or nothing mandatory — each producing an EMPTY suite, a
printed reason and a non-zero exit, never a pass.

## The verdict

PASS requires **three** things: the working bytes are the bytes git would commit, every check
exited 0, **and** the fingerprint taken before the suite is identical to the one taken after
it. A state that moved mid-run is reported with the changed, added and removed paths — never
summarised as "something changed". One record is appended per run (`npm run verify:final`),
failures included:

```json
{"schema":"cellular-final-verification/1","at":"...","fingerprint":"<64 hex>",
 "tree":"<40 hex>","head":"<40 hex|null>",
 "checks":[{"name":"typecheck","exit":0,"summary":"..."},
   {"name":"tests","exit":0,"summary":"719 tests · 719 pass · 0 fail · 0 skipped",
    "counts":{"tests":719,"pass":719,"fail":0,"skipped":0},"skips":["..."]}],
 "ok":true,"reason":"...","equivalent":true}
```

`summary` is sanitised: a machine-local absolute path never reaches the file (the repository's
own leak gate scans it like any other file). `counts` and `skips` are OPTIONAL and present
only for a check that actually printed `node --test` numbers: "exit 0" with no count is a
green nobody can audit ([`test-counts.mjs`](test-counts.mjs)). A SKIPPED test is listed, never
failed and never counted as a pass. `drifted` appears beside `equivalent: false`.

## No circularity

The evidence cannot live inside the state it certifies — writing it would change the
fingerprint it claims. So it lives in `.cellular/`, which is gitignored and therefore outside
the controlled set, and is bound back to the state by the fingerprint, the tree id **and** the
equivalence result. `verify-final.mjs` asserts this on every run (`assertEvidenceOutside`)
rather than trusting `.gitignore` to stay as it is.

For the same reason `check-all --release` does **not** require the evidence by default: the
mandatory suite runs it, so demanding it there would make the gate depend on its own result.
`--require-authorized` is the explicit, opt-in form, used by the push hook and a release run.

## Git enforcement

A rule enforced only by a model's instructions is a rule a tired session skips. So git asks
too (`npm run hooks:install` sets `core.hooksPath`; `npm run hooks:uninstall` unsets it):

| Hook | Asks | Blocks when |
|---|---|---|
| `pre-commit` | `authorization.mjs commit` | the **staged** tree has no passing, byte-equivalent record |
| `commit-msg` | `authorization.mjs trailer` | appends `Verified-State: sha256:<fp> tree:<id>`, idempotent |
| `pre-push` | `authorization.mjs push` | any commit not yet on the remote has an unverified tree |

The staged tree is what a commit would actually record, which is why **partial staging is
refused**: verifying everything and committing half of it is the same defect in a different
costume. `pre-commit` computes it with `git write-tree` on the real index — that writes only
content-addressed objects and refreshes the cache-tree; no file, ref or status changes. Hooks
honour `CELLULAR_NODE` to pin the node binary; otherwise `PATH` decides.

## Limitations — read these

1. **`--no-verify` bypasses the hooks.** Nothing client-side can prevent that; what remains is
   detection — an unverified commit has **no record for its tree**, so
   `node tools/gates/authorization.mjs audit <rev-range>` lists it and the missing
   `Verified-State` trailer shows in `git log`. Unbypassable enforcement belongs on the server;
   the workflow has run twice and failed twice ([`CI.md`](CI.md)) and no branch protection is
   configured, so today this limitation stands in full.
2. **Git is required.** Without a git work tree there is no controlled set to fingerprint and
   no filter to compare against; `fingerprint.mjs` raises an error rather than answering,
   because a gate that cannot run is UNKNOWN, never green.
3. **The exec bit.** On a POSIX checkout git only runs a hook that is executable; committing
   from a filesystem without mode bits can store `100644`, and `chmod +x .githooks/*` (or
   `git update-index --chmod=+x`) fixes it. `npm run hooks:install` only sets the config key —
   an installer that ran something else would be a `postinstall` in disguise.
4. **Evidence is local and per machine.** `.cellular/` is not committed, so a collaborator, a
   reviewer or GitHub cannot inspect it, it dies with the machine or a `clean`, and it is
   self-attested by the machine that made the change: never a third-party attestation.
5. **The suite proves the suite**, and only on that exact state — not that the change is
   correct, proportionate or well designed (human review items, `tools/gates/README.md`).
6. **Timestamps are not evidence.** Only the fingerprint is: a record whose `at` is recent but
   whose `fingerprint` does not match authorizes nothing.
7. **Equivalence is checked, never enforced.** The check refuses; it does not rewrite a working
   file. Restoring the bytes stays the human's act, by design.

## Future work

- **Independent CI verification — RAN TWICE, FAILED TWICE, CORRECTED TWICE, NOT RE-RUN.**
  [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml) re-runs the whole
  mandatory suite on a clean server-side checkout and then compares each commit's
  `Verified-State` trailer with `git rev-parse <commit>^{tree}` ([`ci-trailer.mjs`](ci-trailer.mjs)).
  Run 1 found a deadline timer that could not fire on Node 22 and two reporting defects; run 2
  found a Windows-only test path and the CRLF drift documented above. Every finding is
  corrected and the structure is VERIFIED by the three `tests/ci-workflow*.test.mjs` files, but
  the result of the CORRECTED workflow is **UNKNOWN** until the third remote run. Branch
  protection remains a documented RECOMMENDATION; no repository setting was changed. Rationale,
  the PRE-ARTICLE-8 policy and the limits: [`CI.md`](CI.md).

## Module map

| Module | Responsibility |
|---|---|
| `fingerprint.mjs` | the controlled set, the fingerprint, the tree ids (pure core + git shell) |
| `byte-equivalence.mjs` | are the working bytes the bytes git would commit? (pure core + two git calls) |
| `final-evidence.mjs` | the record shape, the verdict, the authorization lookup (pure) |
| `sanitize.mjs` | a record never carries a machine-local path (pure) |
| `commit-range.mjs` | which commits a hook is being asked about |
| `verify-final.mjs` | the ordered procedure and the `npm run verify:final` CLI |
| `verification-contract.mjs` | the project-local suite as data: schema, validator, mandatory rule (pure) |
| `verification-argv.mjs` | an argument array, or a shell string wearing one? the wrapper refusal (pure) |
| `verification-suite.mjs` | which suite runs — built-in or contract — and the one spawner |
| `authorization.mjs` | "is this state authorized?", for the hooks, the CLI and the release gate |
| `test-counts.mjs` | how many tests ran, parsed from what `node --test` printed; the six counts must ADD UP, and a CANCELLED test is a failure (pure) |
| `ci-trailer.mjs` | does a commit's trailer name the tree it records? (pure core + git shell) |
| `ci-summary.mjs` | how a CI run reports what it established (pure + one append) |

Tests: `tests/gates-final-verification.test.mjs` (the state rules, including the R-4
regression), `tests/gates-byte-equivalence.test.mjs` (the CRLF regression) and
`tests/gates-final-hooks.test.mjs` (the hooks) — all in throwaway repositories created by
`tests/git-fixture.mjs`, never in this one.
