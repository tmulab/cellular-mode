# Consuming the EIP host API from an independent frontend

The host serves JSON on `127.0.0.1` and sends **no CORS headers**. That is not an
omission: a browser must not talk to the runtime directly. A production UI is an
independent application that calls the API from its **own server**, where it can
hold credentials, apply its own authorization, and decide what the browser is
allowed to ask for. The architectural reason is recorded in
[docs/adr/0001-frontend-exception.md](../../docs/adr/0001-frontend-exception.md).

## The client

[`client.mjs`](client.mjs) is a zero-dependency `fetch` client — Node built-ins
only, no shared code with the runtime. It exists to prove that
[`api/openapi.json`](../../api/openapi.json) is enough to integrate.

```js
import { createClient } from './client.mjs';

const client = createClient('http://127.0.0.1:3100');
await client.health();                                            // { status: 200, ok: true, value: … }
await client.plugins();                                           // manifests, no executable
await client.call('text.stats', 'count-words', { text: 'a b c' }); // { status: 200, ok: true, value: { words: 3 } }
```

Run the demo against a host started with `node eip/host/cli.mjs`:

```
node examples/api-client/client.mjs http://127.0.0.1:3100
```

`save-report` is consequential, so it answers `403 APPROVAL_REQUIRED` unless the
host was started with `--approve-interactive` and a human says `y`. **An HTTP
caller can never approve its own call** — a body carrying `approval` is refused.

## A Next.js app would consume it through a route handler — UNTESTED

The code below is **UNTESTED**: Next.js is not installed in this repository and
no dependency will be added to it. It is shown because the shape of the
integration is the point, not the framework.

```ts
// app/api/text-stats/route.ts — a server-side route handler in the UI app.
// UNTESTED: illustrative only.
import { NextResponse } from 'next/server';

const EIP_BASE = process.env.EIP_BASE_URL ?? 'http://127.0.0.1:3100';

export async function POST(request: Request) {
  // 1. The UI app authenticates and authorizes its OWN user here. The runtime
  //    knows nothing about sessions; that is the frontend's responsibility.
  const session = await getSession();            // the app's own concern
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // 2. Shape the call. Only what this screen is allowed to ask for.
  const { text } = await request.json();
  const upstream = await fetch(
    `${EIP_BASE}/api/v1/plugins/text.stats/capabilities/count-words`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text } }),
      cache: 'no-store',
    },
  );

  // 3. Pass the envelope through. The error vocabulary is already closed and
  //    stack-free, so there is nothing to sanitise — only to map if the UI wants
  //    its own wording.
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}
```

```tsx
// app/page.tsx — the browser calls its own origin, never the runtime. UNTESTED.
'use client';
import { useState } from 'react';

export default function Page() {
  const [words, setWords] = useState<number | null>(null);
  async function count(text: string) {
    const response = await fetch('/api/text-stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const payload = await response.json();
    setWords(payload.ok ? payload.value.words : null);
  }
  return <button onClick={() => count('a b c')}>count {words}</button>;
}
```

Three properties survive this arrangement, which is why it is the recommended
one: the runtime stays on loopback; the UI app owns authentication and rate
limiting; and a consequential capability still cannot run without a human
verdict, because approval never travels in a request body.

## What NOT to do

- Do not add CORS headers to the host so a browser can call it directly: the
  runtime would become an unauthenticated public API.
- Do not build the production UI as a plugin `devUi`. That field is for local
  diagnostics and simple admin, capped at 64 KB, and it is served only when the
  host is started with `--dev-ui`.
- Do not generate a client from this document and commit it as runtime code: the
  contract is the document; a generated client is a convenience, and an
  unreviewed generated client is a dependency nobody reads.
