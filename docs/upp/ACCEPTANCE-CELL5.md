# Cell 5 verdict — application plugins (U30, U31, U32)

The evidence record for cell 5 of stage 5. It lives in its own file for the reason cell 3's
does: [ACCEPTANCE.md](ACCEPTANCE.md) is at the 200-line limit, and a verdict is a record —
appended, never rewritten.

## Verdict — VERIFIED (2026-10-03)

Trilateral, run after the last write of the cell:
**typecheck** `tsc -p jsconfig.json && tsc -p apps/observer/jsconfig.json` — 0 errors ·
**gates/build** `npm run gates` — 583 files, 322 modules, 0 findings (size · secrets · deps ·
boundaries); `node tools/gates/check-all.mjs --release` — 0 pending exceptions, no blockers ·
**tests** `npm test` — counts in the cell record; the application subset is 22 tests, 22 pass.

Delivered: the `application` section tightened in `eip/upp/{sections,manifest}.mjs`
(relative paths, exact origins, `capabilities: {}`), `eip/upp-host/{entry-rules,app-config,
app-health,applications}.mjs` + `authorizeApplication`, an adapter that **throws** on an
application manifest, an optional `applications` projection on `GET /api/v1/plugins`
(OpenAPI updated additively), a runnable fixture app, [APPLICATIONS.md](APPLICATIONS.md) and
[examples/upp-app-nextjs](../../examples/upp-app-nextjs/) (Next.js code UNTESTED, labelled).

| # | Criterion | Evidence |
|---|---|---|
| U30 | an application manifest validates as its own type | `eip/upp/sections.test.mjs` · 5 tests: `healthPath` relative (`//evil.example` refused), routes by the same rule, exact origins (`*`, path, credentials, query refused), `cors` empty by default, `capabilities: {}` required — and `eip/upp-host/applications.test.mjs` · "an application gets no kernel service": the adapter throws, `kernel.list()` has no key for it |
| U31 | registering an application changes nothing on the host API | `eip/host/applications.test.mjs` · 4 tests: `ROUTE_TABLE` is the same three routes, `applications` is documented but NOT required, a host with no application answers `['plugins']` and nothing else, a registered one validates against `ApplicationDescription`, `/api/v1/applications` is 404, and the fixture app's own consequential call still answers `APPROVAL_REQUIRED` with no approver asked. `openapi.test.mjs` green |
| U32 | no toolchain enters the runtime | `npm run gates` green (deps leg included); the Next.js example is markdown only — no `package.json`, no import of a framework anywhere in the repository |

### Mutation proofs (six applied, each reverted, suites returned green)

| Guard | Mutation | Observed red |
|---|---|---|
| U30 paths | `isRelativePath` relaxed to `startsWith('/')` | 3 fails — the `healthPath`, the routes and the health-URL origin tests |
| U30 origins | the `isExactOrigin` branch disabled in `checkCors` | 1 fail — "allowedOrigins are EXACT origins" |
| U30 no service | the adapter's `type === 'application'` throw disabled | 1 fail — "an application gets no kernel service: the adapter refuses it" |
| exposure | the loopback/`allowRemote` refusal disabled in `register` | 1 fail — "a non-loopback baseUrl … is refused, nothing contacted" |
| restart cap | `MAX_RESTARTS` raised to 3 | 2 fails — the declared cap and "exactly ONE restart … a second exit is terminal" |
| U31 additive | the `applications` key emitted unconditionally | 1 fail — "a host with no applications answers exactly as before" |

**False-green watch, specific to this cell.** Three refusals are asserted as *silence*: the
registry is handed a recording `fetch`, and an unauthorised id, a non-loopback `baseUrl` and
an unregistered application all produce **zero requests**. The supervision tests use a real
child process on a real socket — the health transitions are a killed PID and a port that
stops answering, not a stubbed probe. The first run of the lifecycle test went red and found
a real defect: a failed probe *during startup* was marking the app `unhealthy` before its
server had finished binding, so `starting` now owns its deadline.
