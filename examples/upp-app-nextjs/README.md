# A Next.js application plugin — contract sketch

**Status: UNTESTED, and deliberately so.** This repository installs no framework (zero
runtime dependencies, [ADR 0002](../../docs/adr/0002-zero-dependency-kernel.md)), so Next.js
is not present and **none of the TypeScript below has been executed**. What *is* verified
lives elsewhere: the manifest in this directory validates, its pin is real, and the
registration, supervision, health and authorization rules are tested against a runnable
fixture app (`eip/upp-host/fixtures/app-server.mjs`). Read
[`docs/upp/APPLICATIONS.md`](../../docs/upp/APPLICATIONS.md) for the enforced contract.

Everything here is the *application author's* side of that contract.

## Files

| File | What it is |
|---|---|
| [`manifest.json`](manifest.json) | the UPP manifest of the app — **VERIFIED**: validates, and its digest is the pin below |
| [`upp.config.snippet.json`](upp.config.snippet.json) | what the **operator** adds to `upp.config.json` to authorise it |
| this README | the route-handler sketches: server-side calls, sessions, CSRF, CORS, exposure |

The pin in the snippet is the real digest of `manifest.json`:

```
266e6318eeb13e9a54d5b587d7c57cd461ae46f47c3fee46d15120c7524a1721
```

Recompute it after any edit to the manifest — a mismatch is refused, and that is the feature:

```bash
node -e "import('./eip/upp-host/canonical.mjs').then(async (m) => \
  console.log(m.manifestDigest(JSON.parse(await (await import('node:fs/promises')).readFile(
    'examples/upp-app-nextjs/manifest.json', 'utf8')))))"
```

## 1 · The browser never calls the kernel

The host binds `127.0.0.1` and sends **no CORS headers**. That is not an inconvenience to
work around; it is the boundary. Every call to `/api/v1` happens in the Next.js **server**:
a route handler or a server component, where the app holds its own credentials.

```ts
// app/api/cells/route.ts — UNTESTED SKETCH
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const HOST_API = process.env.UPP_HOST_API; // e.g. http://127.0.0.1:4000 — server-only

export async function GET() {
  const session = await requireSession(cookies());      // the APP's session, not the host's
  if (session === null) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // A read capability: no approval needed, and still an ordinary client call.
  const answer = await fetch(`${HOST_API}/api/v1/plugins/text.stats/capabilities/count-words`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { text: session.draft } }),
    cache: 'no-store',
  });
  // Pass the kernel's envelope through unchanged: `{ ok, value }` / `{ ok, error }`.
  return NextResponse.json(await answer.json(), { status: answer.status });
}
```

`UPP_HOST_API` must be a **server** variable (never `NEXT_PUBLIC_*`): the moment the base URL
reaches the browser, someone will call the kernel from it.

## 2 · Sessions: `auth: "host-session"`

The manifest declares `auth: "host-session"`, which means exactly this: **the Next.js server
holds the session; the browser never sees host credentials.** The host has no session concept
of its own — it is loopback and unauthenticated — so authentication is the app's, and the
cookie is the app's.

```ts
// lib/session.ts — UNTESTED SKETCH
export const SESSION_COOKIE = {
  name: 'app_session',
  httpOnly: true,      // no script reads it
  sameSite: 'lax',     // 'strict' for admin surfaces
  secure: true,        // always, once anything is not loopback
  path: '/',
  maxAge: 60 * 60 * 8,
};
// The value is a signed, opaque id (SESSION_SECRET from the environment) — never a token
// for the host API, because there is no such token: the app IS the privileged caller.
```

Consequence worth stating: anyone who can reach the host's loopback port can call the API
without a session. The app's authentication protects the app's users, not the kernel. Keep
the port loopback.

## 3 · CSRF on state-changing routes

A consequential capability is one human decision away from happening, so a cross-site POST
must not be able to reach it through the app.

```ts
// app/api/reports/route.ts — UNTESTED SKETCH
const ALLOWED_ORIGINS = new Set(['https://ui.example']); // exact origins, as in the manifest

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== null && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'cross-origin request refused' }, { status: 403 });
  }
  const session = await requireSession(cookies());
  if (session === null) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const answer = await fetch(`${HOST_API}/api/v1/plugins/text.report/capabilities/save-report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // NO `approval` field: consent is not something a caller asserts about itself. With no
    // approver configured the host answers 403 APPROVAL_REQUIRED — fail closed, by design.
    body: JSON.stringify({ input: await request.json() }),
  });
  return NextResponse.json(await answer.json(), { status: answer.status });
}
```

`SameSite` cookies plus this `Origin` check are the two halves: the cookie stops the request
from being *authenticated*, the check stops it from being *accepted*.

## 4 · CORS: none needed

`cors.allowedOrigins` is `[]` in the manifest and that is the correct value for this app: all
calls are server-side, so no browser ever needs a cross-origin grant. The field exists for
apps that genuinely serve another origin, and the rules are strict — exact origins only,
never `*`, declared explicitly even when empty. The host itself still sends no CORS header,
whatever an application declares.

## 5 · Deployment security

1. **Local by default.** `--hostname 127.0.0.1` in the snippet's argv, and a loopback
   `baseUrl` in the manifest. Both the host API and the app stay off the network.
2. **Non-loopback is a decision.** The operator must set `allowRemote: true`, and
   — *documented, not enforced* — put **TLS and authentication** in front of the app first.
   `allowRemote` changes a refusal into permission; it adds no transport security.
3. **The kernel is never exposed.** Only the app is reachable; `/api/v1` stays on loopback.
   A reverse proxy must not forward to it.
4. **Secrets by name.** The operator lists variable *names* (`env`), so a managed app sees a
   minimal environment and nothing the operator did not grant.
5. **No automatic restart loop.** `restart: false` here; even `true` buys exactly one
   restart. A crash loop must be seen, not absorbed.
6. **The pin is the review.** Changing the manifest changes the digest, and the host refuses
   until a human updates the operator file.
