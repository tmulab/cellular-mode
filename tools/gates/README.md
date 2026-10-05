# Gates

Automated enforcement for the Mandatory Engineering Constitution. Zero dependencies, every module
under 200 lines, pure rules separated from the modules that read disk.

```
npm run typecheck    # tsc -p jsconfig.json AND apps/observer/jsconfig.json - 0 errors
npm run gates        # size, secrets, deps, boundaries - exit 2 on any finding
npm run trilateral   # typecheck, build, tests - three lines, exit 0 only if green (--evidence: record it)
npm test             # node --test, which also runs the gates' own tests
check-all.mjs --release   # also exit 2 on a PENDING exception or open relaxation
npm run verify:final # Article 8: fingerprint, full suite, fingerprint again, record evidence
npm run rehearse:adaptive-removal   # also rehearse:builder-removal: delete the module in a temp copy, run it all
```

## Shape

`scan.mjs` and `git-head.mjs` are the only modules here that read the filesystem. The exclusion
list is DATA in `exclusions.mjs` — `node_modules`, `.git`, `.cellular` and the two hash-pinned
three.js artefacts ([`VENDOR-EXCLUSION.md`](VENDOR-EXCLUSION.md)) — shared with the host's
repository read port, or the auditor would answer PASS where a gate answers FAIL. Every gate is a
pure function over `[{ path, text }]` tuples plus a parsed policy, returning findings — never a
count. Gates are testable on fixtures; one that reads disk proves only today's green.

`check-all.mjs`, `trilateral.mjs`, `verify-final.mjs`, `authorization.mjs` and
`removal-rehearsal.mjs` are the disk-reading shells and the only files here with executable
top-level statements — how the module-load gate recognises an entry point. `types.mjs` holds the
two shapes every gate speaks; `typecheck.mjs` runs the checker for both shells, once.

## The gates

### size.mjs — the 200-line rule

**Proves:** no handwritten source or documentation file exceeds 200 lines, unless a complete entry
in `policy/size-exceptions.json` raises the limit for that exact path.

The previous flat tolerance of 210 lines — a silent exception granted to every file at once — is
gone. An entry needs `path`, `limit`, `rationale` and `approvedBy`; one missing any is a finding.

**Scope, decided here.** IN: `.mjs` `.js` `.ts` `.md` anywhere — tests, tools, docs, templates,
examples. OUT: `node_modules/`, `.git/` and `.cellular/` (not ours, or generated — see
`exclusions.mjs`); `LICENSE`, `NOTICE` and any extensionless file (upstream text, out by type
rather than by exception); anything under a `vault/state/` directory, because those are append-only
memory records that grow by design — a cap would mean deleting history to pass a gate.

**Does not prove:** that a 200-line file is well designed. Length is a proxy for reviewability.

### secrets.mjs — secret-exposure scan

**Proves:** eight well-known credential shapes are absent from every text file: private key
blocks, cloud access key ids and secret-key assignments, code-forge tokens (classic and
fine-grained), model-provider API keys, chat-platform tokens, and a credential-ish name assigned a
quoted literal of eight characters or more.

It moved out of `tests/leaks.test.mjs` so the CLI and the hygiene test enforce ONE set of shapes;
the test imports the gate. Privacy shapes stayed there.

Every detector source is assembled from fragments at runtime, so the file holds no literal match
and never flags itself: a scanner that trips on its own rule book teaches people to add exclusions.
Exceptions go in `policy/secrets-allowlist.json` and need `path`, `rule`, `rationale`, `approvedBy`;
one without a rationale is reported and **not** honoured. **The allowlist is empty** — each of its
four entries measured zero findings (`policy/secrets-review.md`).

**Does not prove — read this twice:** static analysis is not proof of security. The gate proves
these shapes are absent from the text it read. An unusual shape, a skipped file type, a build
artefact, a credential already in history: all pass. Permissions and injection are not checked.

### deps.mjs — dependency integrity

**Proves** both halves of the zero-dependency claim:

1. **manifest** — `dependencies`, `devDependencies`, `peerDependencies` and
   `optionalDependencies` in `package.json` contain nothing that is not listed in
   `policy/allowed-dependencies.json` with a rationale and an approver (list empty).
2. **code** — every import specifier in a `.mjs`/`.js` file is relative or a `node:` built-in.
   Unprefixed built-ins (`fs`, `path`) count as bare and are rejected, so the project cannot
   drift into a style where a bare specifier looks normal.

Checking only (1) would miss a bare import that resolves through a hoisted `node_modules` on one
machine; only (2) would miss a declared dependency nobody imports yet. Together they are proof.

**Lockfile:** `package-lock.json` is expected — two devDependencies are installed, so the tree is
pinned; a test asserts it holds exactly those two plus one transitive package, both ranges exact.
**It needs no exclusion from any gate and got none:** `.json` is out of the size gate's scope by
extension, and the secret scan reports nothing on it. Measured, not assumed.

**Vulnerability scanning:** `npm audit` reported **0 vulnerabilities** for the installed tree on
2026-10-02. It is not wired into a gate: it needs network, and the tree is three declaration-only
packages that never reach a runtime. The surface is the Node runtime — the operator's concern.

**Does not prove:** anything about a dynamic `import()` computed at runtime — unreadable statically.

### boundaries.mjs — import direction

**Proves** the arrows of the "Everything Is a Plugin" layout, as data rather than prose.
Each rule has an id, a reason for whoever has to fix the finding, and an allow or deny list:

| Rule | Direction |
|---|---|
| `sdk-depends-on-nothing` | `eip/sdk/` → only `eip/sdk/` |
| `kernel-imports-sdk-only` | `eip/kernel/` → `eip/sdk/`, itself |
| `plugin-imports-sdk-and-own-dir` | `eip/plugins/<p>/` → `eip/sdk/`, its own directory, `examples/text-stats/src/`; never kernel internals, host, orchestration, or a sibling plugin |
| `observer-plugin-imports-only-named-pure-modules` | `eip/plugins/observer-*/` → `eip/sdk/`, its own directory, **and the explicit list `OBSERVER_PURE_IMPORTS`**: the pure modules of `tools/cellmode` (`cell-file`, `check`, `deps`, `fields`, `index-table`, `log`, `projections`, `slug`, `types`) and the pure gate rules (`boundaries`, `deps`, `evidence`, `exclusions`, `release`, `secrets`, `size`, `types`). Never `state.mjs` (the only module that touches vault files), `paths.mjs` (builds absolute paths — the read port owns paths), `clock.mjs`, the CLI modules, `tools/gates/scan.mjs`, `check-all.mjs` or `trilateral.mjs`. The observer reads a vault; a second parser of that vault would be a second truth. Named modules, never a prefix |
| `orchestration-uses-kernel-public-entry` | `eip/orchestration/` → `eip/kernel/index.mjs`, `eip/sdk/`, itself |
| `host-composes-everything` | `eip/host/` → anything in `eip/`, **plus the three named leaves in `HOST_GATE_IMPORTS`** (`tools/gates/evidence.mjs`, `exclusions.mjs`, `git-head.mjs`): composition is the one layer allowed to know all the parts, and those three are facts about this repository that the host's read ports and the gates must agree on exactly. Nothing else in `tools/` |
| `kernel-and-sdk-are-transport-free` | `eip/sdk/` and `eip/kernel/` may not reach `eip/host/` or `node:http`/`https`/`http2`/`net`/`tls`/`dgram` |
| `cellular-mode-is-runtime-independent` | `tools/cellmode/`, `skills/`, `docs/`, `adapters/`, `templates/` may not import `eip/` |

`node:` built-ins pass every allow rule — the standard library is not a layering concern; a deny
rule may still name one, which is how the transport rule works. Two violated rules, two findings.

`eip/` may be absent: no files matched means nothing to say, not a failure — a gate failing on an
absent directory would block the cell building it, and Cellular Mode must run without a runtime.

**Does not prove:** anything about `.md` files — the gate reads executable modules only, so a code
sample in a document is not a finding. Runtime coupling through a string key, a global or an
injected object is invisible too: the kernel's contract validation covers that.

### trilateral.mjs — Trilateral Verification

Three independent gates after every significant change, three lines, counts included, pre-existing
failures documented rather than absorbed. The name and semantics are the original rule; only what
each leg can honestly report changes here.

- **typecheck** — REAL since R-1 was withdrawn: `tsc --noEmit -p jsconfig.json` with `checkJs`,
  `strict` and the four strengthenings, reported with the ERROR COUNT, never "clean" alone.
  `typecheck.mjs` resolves `node_modules/typescript/bin/tsc` and runs it with THIS Node — no PATH
  lookup, no `.cmd` shim — falling back to `tsc` on PATH; with neither, `⚠️ UNAVAILABLE (UNKNOWN)`.
- **build** — no build step, so: module-load gate. Every non-test `.mjs` whose top level holds
  declarations only is imported, proving it parses and resolves. Entry points are excluded and
  **counted**, so the number never quietly shrinks.
- **tests** — `node --test`, reporting its own pass/fail/total counts.

`--evidence` also writes `.cellular/evidence/trilateral.json`, the record a reader that cannot
spawn a process relies on: [`EVIDENCE.md`](EVIDENCE.md).

**How "entry point" is decided** (`top-level.mjs`): a module is importable when its top level
holds only declarations. An executable statement there makes it an entry point, because importing
it would *run* it — the CLI would set the exit code. The brace-tracking heuristic is conservative
on purpose: a false "entry point" only skips the load gate and still gets the syntax check.

**Exit code:** 0 when build and tests are green and typecheck is not a failure. A non-zero error
count fails the leg and the run. `UNAVAILABLE` keeps the code at 0 but the line stays a warning.

### release.mjs — release readiness

**Proves:** no exception is honoured with `approvedBy` still `PENDING`, and no relaxation sits in a
status other than `APPROVED` or `WITHDRAWN`. Pending entries stay honoured day to day but every run
prints the count, and `--release` turns them into exit 2 — "release-ready" is a command, not an
opinion. **Fails closed:** an unrecognised status blocks. **Does not prove** that an approval was
informed: a signature is not a review.

### removal-rehearsal.mjs — the OPTIONAL module, deleted for real

**Proves** AD29 (`tools/adaptive/ACCEPTANCE-INTEGRATION.md`): `node --test` and `check-all.mjs`
both pass with **Cellular Adaptive deleted**. It copies the repository into a fresh `mkdtemp`
directory under `os.tmpdir()` (`.git` and `.cellular` skipped, `node_modules` linked), removes the
documented `ADAPTIVE_PATHS` there, runs both, and removes **only** that directory — printed first,
then re-checked by realpath and name prefix. A documented path already absent fails the run: a
stale entry is a silent hole. Out of `npm test` because it costs minutes; the fast half is
`tests/optional-module-imports.test.mjs`, which names any STATIC import of the optional module.
**Does not prove** that the deleted list is the whole module: it is handwritten.

### verify-final.mjs — Article 8, verification at the FINAL state

**Proves** that the mandatory suite passed on the state **as it stands**: fingerprint the controlled
set (what `git ls-files` would commit), run the four checks, fingerprint again, authorize only if
nothing moved, and append the evidence OUTSIDE the verified state. `.githooks/` and
`check-all --require-authorized` (off by default — the suite runs `check-all` itself) ask
`authorization.mjs` the same question. **Does not prove** that `--no-verify` was not used: that
stays possible, hence auditable. Mechanism, record shape and the six limitations:
[`FINAL-VERIFICATION.md`](FINAL-VERIFICATION.md).

## Automated vs human review

| Constitutional requirement | Status | Where |
|---|---|---|
| 200 lines per handwritten file | automated | `size.mjs` |
| Exceptions justified and approved | automated (shape), human (judgement) | `policy/size-exceptions.json` |
| No credential shapes in the repository | automated | `secrets.mjs` |
| Security by design | **human review** | static analysis is not proof of security |
| Zero RUNTIME dependencies, manifest and code | automated | `deps.mjs` |
| Dependency vulnerability scan | **manual** | `npm audit`: 0 advisories, 3 packages |
| Modularity and import direction | automated | `boundaries.mjs` |
| Contracts honoured at runtime | automated elsewhere | SDK validators + their tests |
| Type correctness | automated | `typecheck.mjs` · `jsconfig.json` · 0 errors |
| Build / module resolution | automated | `trilateral.mjs` |
| Tests pass; counts reported | automated | `trilateral.mjs` |
| Acceptance criteria written before code | **human review** | cell contracts in `vault/` |
| Never claim unexecuted results | partly automated | `--evidence` + `observer.audit` (UNAVAILABLE) |
| Lint / formatting | **not automated** | no zero-dependency formatter exists; style is reviewed |
| Epistemic labels used correctly | **human review** | the label is a claim about knowledge |
| Persistent memory and accountability | partly automated | the Cellular Mode CLI and its integrity test |
| Relaxations explicit and approved | automated (status), human (approval) | `release.mjs` · `--release` |
| An optional module really is optional | automated | `removal-rehearsal.mjs` + the static-import test |
| Completion verified at the FINAL state | automated | `verify-final.mjs` · `.githooks/` · Article 8 |
| A hook bypass was not used | **human review / audit** | `authorization.mjs audit <range>` |

The remaining **human review** rows are the honest answer to "is this project verified?": no, it is
*checked*. Security, intent and judgement are not automatable; a gate pretending so is worse.
