# Acceptance criteria — agent gateway (S2-8)

Declared BEFORE the implementation existed. The verification question is
**"what can an agent do that nobody allowed?"**

An agent is not a plugin and not a user: it is a caller with a role, a narrow
allow-list, and no authority to consent to anything. The gateway is the only
door between an agent and the kernel, so three properties must hold absolutely:
nothing outside the allow-list reaches a capability, the agent cannot approve its
own consequential call, and every attempt — allowed or denied — is on the record.

| # | Criterion | Expected result | Proven by | Red without the fix |
|---|---|---|---|---|
| G1 | The allow-list is the whole authority | a capability not listed as `key#cap` ⇒ `{ok:false,error:{code:'PERMISSION_DENIED'}}`, and the kernel is **never** called (an injected spy counts zero); an empty/absent `allow` denies everything | `gateway.test.mjs` · "G1" | an agent reaching a capability nobody granted |
| G2 | Allowed calls pass through unchanged | a listed capability returns the kernel's own result (`{ok:true,value}`), with input and `signal` forwarded | `gateway.test.mjs` · "G2" | the gateway rewriting domain answers |
| G3 | The agent cannot approve its own act | `call(..., {approval})` ⇒ the kernel receives `approval: undefined`; with no gateway approver a consequential call ends `APPROVAL_REQUIRED`; the forged object never appears in the kernel options | `gateway.test.mjs` · "G3" | forged consent: the agent signs its own permission slip |
| G4 | Consent comes from the gateway's human approver | with `approver` supplied by the host, the consequential call succeeds and the approver receives `{key, cap, agentId, role}`; a refusal ⇒ `APPROVAL_DENIED` | `gateway.test.mjs` · "G4" | an approver that cannot tell which agent is asking |
| G5 | The audit is complete and append-only | one entry per call with `{agentId, role, key, cap, decision, code?, at}`; `decision` is `allowed` / `denied` / `approval-required`; `audit()` returns a **copy** (mutating it does not change the record); `at` is an ISO timestamp | `gateway.test.mjs` · "G5" | an untraceable call; a caller editing history |
| G6 | A malformed gateway cannot exist | a missing kernel, a missing `agentId`/`role`, or an `allow` entry that is not `key#cap` ⇒ `TypeError` at construction | `gateway.test.mjs` · "G6" | a gateway whose allow-list silently matches nothing |
| G7 | Unknown keys stay the kernel's verdict | an allowed-but-unregistered `key#cap` ⇒ `NOT_FOUND` from the kernel, recorded as `denied` with that code | `gateway.test.mjs` · "G7" | the gateway inventing its own answer for a missing plugin |

`approval-required` is recorded as its own decision, distinct from `denied`: "a
human has not decided yet" and "this agent may not do this" are different facts,
and an audit that conflates them cannot answer the only question an audit is read
for.

## Verdict (mutation proof)

Baseline: **10 tests, 10 pass**. Each mutation was reverted and the suite
returned to 10/10.

| Criterion | Mutation applied | Observed red (10 tests) |
|---|---|---|
| G1 | `gateway.mjs` · the `allow` check skipped (every call forwarded) | 3 fails — `G1 only an allowed capability reaches the kernel`, `G1 an empty allow-list denies everything`, `G5 every call is recorded, and the audit is append-only` (a denied call ran and was recorded as allowed) |
| G5 | `gateway.mjs` · `audit()` returns the live array instead of a copy | 1 fail — `G5 every call is recorded, and the audit is append-only`: `the audit is append-only: a caller cannot edit history` (length 4 after a caller pushed an entry) |
| G3 | `gateway.mjs` · the agent's `opts.approval` forwarded in the kernel options | 1 fail — `G3 an agent approval object never reaches the kernel, not even on a harmless call` |

**A false green, found and fixed.** The first run of the G3 mutation stayed
**green**: forwarding `opts.approval` was invisible because the consequential path
overwrites the field after the human gate, and a non-consequential capability
ignores approval entirely. That is a finding about the test, not a pass — the
guarantee claimed is "the field is dropped", not "the field is harmless today". A
test was added asserting that `'approval' in options` is `false` for an allowed
non-consequential call; the mutation then went red, and the stricter claim now
also protects the next consequential capability from inheriting a forged field.
