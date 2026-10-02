---
name: harden
description: >
  Run the ordered security-hardening pass, or threat-model a new capability. Use when the
  human says "security pass", "harden this", "we are about to deploy", "audit the
  security", "add rate limiting", "check for injection"; and ALWAYS when a change
  introduces a new execution capability (running commands, writing files, calling out to
  the network, executing user-supplied templates) or a new trust boundary (a new endpoint,
  a new role, a new external integration, a new upload path).
---

# Harden — the ordered pass, and the threat-model prompt

Security is a property of the design (`docs/00-constitution.md`, Article 1). This skill is
the deliberate **pass**: ordered, finite, and closed with the three gates. It is not a
substitute for designing securely in the first place, and a clean static scan is evidence,
never proof.

## 1. The ordered checklist

Work the steps **in order** — each one assumes the previous is done. Defaults live in
`vault/policy.md`; the numbers below are the shipped ones.

1. **Injection.** Audit every raw or string-built query. Convert to parameterized
   statements or a safe template API. Dynamic set-membership clauses are the classic
   escape hatch: use the data layer's own join helper, never string concatenation. The
   same applies to shell commands, file paths, template rendering and anything else that
   turns data into instructions.
2. **Rate limits**, per route class. Defaults: **authentication 10 requests/minute per IP ·
   general API 30/minute per user · upload 5/minute per user.** Implement with a sliding
   window or a token bucket; make the limit observable in the response.
3. **Secrets validated at startup.** Refuse to boot when a secret is missing, weak, or a
   known default. Defaults: **minimum 32 characters**, and an explicit rejection list of
   well-known placeholder values. Failing at startup is the point — a weak secret must not
   survive to serve a request.
4. **Security headers.** A restrictive content security policy; frame embedding denied;
   strict transport security; a referrer policy no looser than
   `strict-origin-when-cross-origin`; content-type sniffing disabled.
5. **Input sanitization.** A character limit per field; escaping or sanitizing free text
   that will be rendered; and, where the project calls a language model,
   **prompt-injection patterns** treated as hostile input rather than as content.
6. **Audit log.** Who did what, when, with what result. Structured records,
   fire-and-forget so a request is never blocked by logging, in a module of its own. No
   secrets, no raw payloads.
7. **Close with Trilateral Verification** (`skills/verify/SKILL.md`): typecheck, build and
   tests, reported as three lines. A hardening pass that ends without the gates is an
   unverified claim.

## 2. Threat model for a new capability or trust boundary

Before shipping a new execution capability or a new boundary, answer these in writing —
six lines is enough, and the answers go in the cell record:

1. **What can this now do that it could not do before?** Name the new verbs, not the new
   feature.
2. **Who can reach it**, and through which path — unauthenticated, any user, one role, the
   composition layer only?
3. **What is the worst thing a hostile input can make it do?** Be concrete: which file,
   which row, which outbound call, how much money.
4. **Which privilege does it hold, and is that the narrowest one?** Capabilities are
   granted as explicit ports with declared permissions, not taken ambiently.
5. **What does it do when authorization or validation cannot be established?** The answer
   must be *deny* (fail closed).
6. **What gets logged**, and does the log leak anything it should not?

If any answer is UNKNOWN, that is the finding — report it and stop, rather than shipping on
an optimistic reading.

## 3. Honesty rules for this pass

- **A clean scan is not safety.** It means no known pattern matched. Say that, not "the
  system is secure".
- **Never report an unrun check.** An unavailable scanner is UNKNOWN, never green.
- **Name the human-review items** this pass could not mechanize — business authorization
  rules, whether a role boundary matches the product's intent, whether an audit record is
  actually readable by the person who needs it.
- **A finding that becomes a line in this report comes back.** Where a finding can be a
  test, make it a test (`skills/sanity/SKILL.md`).
