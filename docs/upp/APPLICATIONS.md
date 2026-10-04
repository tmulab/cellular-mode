# UPP application plugins

**Status: VERIFIED** for what is marked *enforced* below (cell 5 of stage 5; the Trilateral
record and the evidence table are in [ACCEPTANCE.md](ACCEPTANCE.md)). Everything marked
*documented* is a requirement on a deployment, not a control this repository enforces — the
distinction is the point of §6.

An **application plugin** is an independently executed app: its own runtime, its own routes,
its own rendering, its own release cadence. It is the plugin kind that makes
*"everything is a plugin"* true for interfaces without smuggling a toolchain into the kernel,
which is exactly what [ADR 0001](../adr/0001-frontend-exception.md) refuses to do.

The one sentence that governs everything else:

> **Registration is identity, not execution.** The kernel never loads an application, never
> proxies its frontend, never gives it a kernel service, a port or a capability. The app
> reaches the system as a **client of the HTTP API**, under the host's own authorization
> boundaries.

## 1 · What a manifest declares

`type: "application"`, and then (`eip/upp/sections.mjs`, enforced):

| Field | Rule |
|---|---|
| `application.baseUrl` | http(s) URL. Loopback, unless the **operator** sets `allowRemote: true` |
| `application.healthPath` | a **relative path** — one leading slash, no `//`, no `\`, no query, no fragment. `//evil.example/h` starts with a slash and names another host |
| `application.routes` | non-empty list of relative paths. Documentation of the app's surface; the host routes none of them |
| `application.auth` | `"host-session"` or `"none-local"` — nothing else exists |
| `application.cors.allowedOrigins` | **exact** origins (`scheme://host[:port]`), never `*`, never a path. Declared even when empty, and **empty is the default** |
| `capabilities` | `{}`. An application that also provides capabilities ships a **second, ordinary capability manifest** — identity and in-process execution stay separate |

Unknown keys inside `application` are refused, like every other security-sensitive section.

## 2 · What the operator authorises

An application is known only if it is listed in `applications` of `upp.config.json`
(`eip/upp-host/app-config.mjs`, enforced). The author's manifest never grants execution.

```json
{
  "upp": "1.0",
  "plugins": [],
  "applications": [
    {
      "id": "observer.ui",
      "supervision": "managed",
      "command": ["node", "server.mjs", "--port", "3200"],
      "cwd": "./ui",
      "env": ["UPP_HOST_API"],
      "manifestPath": "./ui/upp-manifest.json",
      "manifestSha256": "<64 hex characters>",
      "timeouts": { "startupMs": 20000, "requestMs": 2000, "shutdownMs": 2000 },
      "restart": false
    }
  ]
}
```

* `command` is an **argv array**, never a shell string (same rule, same module, as a process
  plugin: `entry-rules.mjs`).
* `env` is a list of variable **names** to pass through; the app's environment is otherwise
  minimal, so a host secret it did not ask for was never there.
* `manifestSha256` pins the reviewed manifest; a mismatch is refused and nothing starts.

## 3 · Managed vs external

| | `managed` | `external` |
|---|---|---|
| Who deploys | the host, through the one existing spawn site (`channel.mjs`) | somebody else |
| `command` | required | **forbidden** — a reader can tell at a glance who is responsible |
| Start / stop | the host's | not the host's; `stop()` means *stop watching* |
| Restart | at most **one**, only with `restart: true`; a second exit is terminal | n/a |
| Health | the same probe | the same probe |

A managed application is spawned with `shell: false`, an argv array, a confined `cwd` and a
minimal environment. Its **stdout is not protocol**: an application is not a UPP conversation
partner, so stdout and stderr are diagnostics and nothing else.

## 4 · Lifecycle

```
registered ──start──▶ starting ──health 200──▶ healthy
                         │                        │
                         │ startup deadline       │ probe fails / process exits
                         ▼                        ▼
                     unhealthy ◀───────────── unhealthy ──restart (≤1, managed)──▶ starting
                         │
                       stop()
                         ▼
                      stopped
```

* `registered` is **not** `healthy`. Nothing is probed until someone starts it.
* A failed probe *while starting* is not a verdict: the startup deadline decides.
* `stopped` is a decision someone took. An unexpected exit lands on `unhealthy`, where it is
  visible, with the exit code in `detail`.
* Health is one `GET baseUrl + healthPath` under a deadline, redirects **not** followed, body
  read under a 16 KiB cap, and the resolved URL must keep the app's own origin
  (`eip/upp-host/app-health.mjs`).

## 5 · How the app talks to the system

Through `/api/v1` — the contract in [`api/openapi.json`](../../api/openapi.json) — **from its
own server**, never from the browser:

* the app is an ordinary client: no privileged header, no bypass, no kernel port;
* a **consequential** capability still needs the host's approver, and with no approver the
  answer is `APPROVAL_REQUIRED` (403). Registration grants identity, never authority;
* the request body cannot carry consent: an `approval` field in a call is not a decision;
* `GET /api/v1/plugins` gains an **optional** `applications` array (one entry per registered
  app: id, kind, supervision, state, baseUrl, routes, auth, restarts). The key appears only
  when a composition registered one, so an existing client sees what it always saw. No route
  was added; the host proxies nothing.

The public projection carries **no** command, cwd, environment or pin: an operator's
authorisation file is not part of the API.

## 6 · Security: enforced vs documented

**Enforced** (a test fails if it stops being true):

1. an application absent from `applications` is never started and never contacted;
2. a non-loopback `baseUrl` without `allowRemote: true` is refused **before any request**;
3. a manifest that does not match its pin, or declares another id or another `type`, is
   refused and nothing is registered;
4. the adapter **throws** on an application manifest: there is no key in the kernel for it,
   so no service and no port can exist;
5. the approval gate is unchanged for a call coming from an application;
6. `cors.allowedOrigins` defaults to empty and can never be `*`; `healthPath` and `routes`
   cannot leave the app's origin;
7. a managed app is spawned argv-only, `shell: false`, minimal env, at most one restart.

**Documented, not enforced** (the host cannot enforce these; a deployment must):

* **TLS and authentication** before any non-loopback exposure. `allowRemote: true` turns a
  refusal into permission; it does not add transport security. The host still sends no CORS
  header of its own.
* **Sessions.** `auth: "host-session"` means *the app's server holds the session* and the
  browser never sees host credentials. Nothing in the kernel verifies that claim.
* **CSRF.** `SameSite` cookies plus an `Origin` check on state-changing routes, inside the
  app. The host's API is loopback and unauthenticated by design; exposing it to a browser
  would be the real defect.
* **Isolation.** A separate process bounds a crash, not a filesystem: a managed application
  runs with the operator's privileges. OS-level sandboxing is **PROPOSED**, not built
  ([SECURITY.md](../../SECURITY.md)).
* **Deletability.** The host gains no import of `eip/upp-host`: `applications` is a function
  a composition passes in. Delete the UPP layer and the host still builds.

## 7 · Example

[`examples/upp-app-nextjs/`](../../examples/upp-app-nextjs/) — a Next.js application plugin:
manifest, operator-config snippet, and route-handler sketches for the session, CSRF and
server-side-call rules above. The Next.js code is **UNTESTED** and labelled as such: this
repository installs no framework, so it is a contract sketch, not a verified example.
