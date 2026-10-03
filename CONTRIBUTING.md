# Contributing to Cellular Mode

Thank you for considering a contribution. The rules are short.

## Work in cells

Use the method on itself. One cell per change: an explicit boundary, a binary done
criterion, and a recorded closure. Start with `/cell` (or
`node tools/cellmode/cli.mjs open ...`) and finish with `/pause` or `complete --confirm`.
A pull request that corresponds to one closed cell is easy to review; one that mixes
three is not.

Keep files under ~200 lines. If a change does not fit, it is two cells.

## Gates

```
npm test             # node --test, no dependencies, no network
npm run typecheck    # both configurations, 0 errors
npm run gates        # size, secrets, deps, boundaries
npm run verify:final # LAST: the full suite on the exact state you are delivering
```

Everything must pass before you open a pull request.

**Run `npm run verify:final` last** (Article 8): it fingerprints the files git would commit, runs
the whole mandatory suite, checks that nothing changed while it ran, and records the evidence
outside the verified files. Any write afterwards — a doc line, a changelog, a vault entry —
invalidates it, and the fix is to run it again. `npm run hooks:install` lets git ask the same
question before a commit or a push; `node tools/gates/authorization.mjs status` answers it on
demand. Details: `tools/gates/FINAL-VERIFICATION.md`. New behavior needs a test that is
proven to go **red without the fix** — state the mutation you used and the failure you
observed (see `docs/05-engineering-rules.md` §1).

No new dependencies. Node >= 18 built-ins only.

## English only

All files are in English. The sole exceptions are the historical name "Modo Celular" and
the Portuguese-compatibility trigger phrases and aliases (`/celula`, `/pausar`), which
exist for continuity with the original method.

## No personal data

Do not add personal information of any kind: names beyond authorship credits, email
addresses, absolute filesystem paths, usernames, machine names, ports, private project
names, or anything about anyone's health. Examples must use generic placeholders
("the production database", `src/parse.js`).

## Licensing of contributions

This project is licensed under the Apache License 2.0. Per **section 5** of that license,
any contribution you intentionally submit for inclusion is licensed to the project under
the same terms, with no additional conditions. There is no CLA and no DCO sign-off to
add — opening the pull request is enough.

Only submit work you have the right to license this way. If a change derives from a
third-party source, say so in the pull request so it can be credited in
`THIRD_PARTY_NOTICES.md`.

## Pull requests

- Describe the cell: objective, boundary, done criterion.
- Report the gates with real numbers.
- Say what you deliberately left out. Declared choices are not hidden debt.
