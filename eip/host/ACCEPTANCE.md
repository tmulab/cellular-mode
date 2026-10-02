# Acceptance criteria — EIP host API + OpenAPI (S2-7)

Declared BEFORE the implementation existed. The host is **composition**, not a
plugin: it is the one place allowed to know every part, and therefore the one
place where a mistake is a security mistake. The verification question is
**"what can a caller make this process do?"**

Four promises: the transport refuses anything it does not understand; the error
vocabulary is the kernel's, mapped to HTTP once and in one place; a consequential
act over HTTP is impossible unless a human is at the keyboard; and the writable
surface of the filesystem is exactly one directory.

| # | Criterion | Expected result | Proven by | Red without the fix |
|---|---|---|---|---|
| H1 | Health is honest | `GET /api/v1/health` ⇒ 200 `{ok:true,value:{status:'ok',sdk:'1',plugins:[...],devUi:false}}` | `http.test.mjs` · "H1" | a health route that answers before the plugins are loaded |
| H2 | The composition is inspectable, the executable is not | `GET /api/v1/plugins` ⇒ 200, one entry per plugin, **no** `apply`, `devUi` reduced to `{title}`, `inject`/`permissions`/`capabilities` present | `http.test.mjs` · "H2" | the dev-UI body or a function leaks into the API |
| H3 | A capability call is a validated round trip | `POST /api/v1/plugins/text.stats/capabilities/count-words {"input":{"text":…}}` ⇒ 200 `{ok:true,value:{words:69}}` | `http.test.mjs` · "H3" | an unvalidated passthrough |
| H4 | One error vocabulary, one mapping | `INPUT_INVALID`→400, `NOT_FOUND`→404, `APPROVAL_REQUIRED`/`APPROVAL_DENIED`/`PERMISSION_DENIED`→403, `TIMEOUT`→504, `CANCELLED`→503, `PLUGIN_ERROR`/`OUTPUT_INVALID`→500, `DEPENDENCY_IN_USE`→409; body always `{ok:false,error:{code,message,details?}}`, **never** a stack | `http.test.mjs` · "H4", `errors.test.mjs` | a 500 for a client mistake; a stack trace on the wire |
| H5 | Consequential over HTTP is fail-closed | default host (no approver) ⇒ `save-report` 403 `APPROVAL_REQUIRED` **and no file on disk**; with an approver ⇒ 200 and the file exists under `reportsDir` | `http.test.mjs` · "H5" | an HTTP request writes to disk with nobody accountable |
| H6 | An HTTP caller can never self-approve | a body carrying `approval` ⇒ 403 `APPROVAL_REQUIRED`, the approver is **never called**, nothing written; unknown body fields ⇒ 400 | `http.test.mjs` · "H6" | forged consent: the caller approves its own act |
| H7 | The transport refuses what it does not understand | non-JSON content type ⇒ 415; body > 65536 bytes ⇒ 413 (and the body is not parsed); malformed JSON ⇒ 400; wrong method ⇒ 405 **with `Allow`**; unknown path ⇒ 404; all with the JSON envelope | `http.test.mjs` · "H7" | an unbounded read; a 500 where a 4xx belongs |
| H8 | Security headers, and no CORS | every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`; API responses `Cache-Control: no-store`; **no** `Access-Control-Allow-*` anywhere | `http.test.mjs` · "H8" | a browser on any origin drives the API |
| H9 | The dev UI is opt-in, same-origin and script-safe | default ⇒ `GET /dev/plugins/text.stats` 404; with `devUi:true` ⇒ 200 `text/html` + strict CSP, no inline `<script>…</script>` body and no inline handler; the script/stylesheet are separate same-origin routes; a plugin without `devUi` ⇒ 404 | `http.test.mjs` · "H9" | a diagnostics page exposed in production; CSP that allows inline script |
| H10 | The socket is local | the server listens on `127.0.0.1` only | `http.test.mjs` · "H10" | a dev host reachable from the network |
| H11 | The write port is path-confined, not a convenience | absolute paths, `..`, `/`, `\`, NUL, empty name and a symlinked target ⇒ `PERMISSION_DENIED` (nothing written); a safe name ⇒ written under `reportsDir`, return value is the **relative** name | `write-port.test.mjs` · "H11" | path traversal from a plugin; the API publishing filesystem layout |
| H12 | The OpenAPI document is the contract, not a brochure | every route the server answers is documented and every documented route is answered; real responses validate against the documented schemas with the SDK validator; the error `code` enum equals the SDK `CODES` | `openapi.test.mjs` · "H12" | documentation drift — an independent frontend built against a lie |

**CANCELLED → 503.** `499` is not an IANA status; a conformant client should not
have to learn a vendor code, and the honest statement is "the request did not
complete". `TIMEOUT` keeps its own code, `504`, because a deadline is a different
fact from an abort. **405 carries code `INPUT_INVALID`** with
`details[0].path === 'method'`: the path exists, the request is malformed against
the contract — and the alternative would be inventing a second error vocabulary
next to the kernel's closed list.

**Approval is a human act.** The kernel is fail-closed, so a host started
without `--approve-interactive` cannot execute a consequential capability at all.
When it IS started with it, the verdict comes from a TTY prompt (`y/N`, default
**N**), per call. There is no code path by which the request body can influence
the verdict: the `approval` field is refused at the edge (H6). Documented in
`eip/host/README.md` and in `api/openapi.json`.

## Verdict (mutation proof)

Baseline: **16 tests, 16 pass, 0 skipped.** Every mutation was reverted and the
suite returned to 16/16.

**The symlink guard is now VERIFIED** (2026-10-02, win32). It used to be the one
skipped test: an unprivileged account on this platform cannot create a *file*
symlink (`EPERM`, observed). A directory **junction** can be created without
privilege, and `lstat` reports a junction as a symbolic link — so the junction
exercises the same guard. The test now tries `symlink(…, 'file')` first, falls back
to `symlink(…, 'junction')`, and skips only if **both** are refused, printing both
error codes. On this machine it ran with a junction (`file: EPERM`), and the
assertion names the guard that answered, not merely the refusal.

| Criterion | Mutation applied | Observed red (16 tests) |
|---|---|---|
| H4 | `errors.mjs` · `INPUT_INVALID` mapped to 500 instead of 400 | 3 fails — `H3 a capability call is a validated round trip`, `H4 kernel codes map to statuses…`, `H12 real responses validate against the documented schemas` (a client mistake reported as a server fault, and the OpenAPI contract caught it too) |
| H6 | `body.mjs` · the `'approval' in payload` guard disabled | 2 fails — `H6 an HTTP caller can never approve itself` (the forged approval reached `execute`) and `H12 real responses validate…` (the documented 403 became a 200) |
| H11 | `write-port.mjs` · the `assertSafeSegment(name)` call removed | 1 fail — `H11 every escape attempt is PERMISSION_DENIED and writes nothing` (`"../outside.json" must be refused`) |
| H11 | `write-port.mjs` · the `existing.isSymbolicLink()` branch deleted | 1 fail — `H11 a symlinked target is refused` (the refusal message became `the target exists and is not a regular file`: the *fallback* guard answered). This mutation is why the test asserts `details[0].message` and not just the code — both link guards refuse a link, so a test checking only `PERMISSION_DENIED` would have stayed green with the symlink guard gone |
| H9 | `router.mjs` · the dev page served regardless of the `devUi` flag | 1 fail — `H9 the dev UI is opt-in, same-origin and script-safe` (`/dev/plugins/text.stats must not exist by default` answered 200) |

False-green watch: every error assertion names the exact `code` and, where it
carries one, `details[0].path`; the OpenAPI test validates the real body against
the documented schema, so a status that is "close enough" still fails.
