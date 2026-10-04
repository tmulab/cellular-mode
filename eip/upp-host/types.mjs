// The shapes this layer passes around, in one place so a reader can learn the seam without
// reading three transports. Types only — nothing here runs.

/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {Record<string, unknown>} Raw */

/**
 * An operator authorisation that has been proved: the entry from `upp.config.json`, the
 * manifest it pins, that manifest's canonical digest, the directory a process is confined
 * to, and the effective deadlines.
 * @typedef {{ entry: Raw, manifest: Raw, digest: string, dir: string,
 *   timeouts: { startupMs: number, requestMs: number, shutdownMs: number } }} Authorization
 */

/**
 * An authorised APPLICATION: the same pinned manifest and proved digest as a plugin, plus
 * the one thing only the operator may decide — who owns the process (`supervision`).
 * @typedef {{ entry: Raw, manifest: Raw, digest: string, dir: string, supervision: string,
 *   timeouts: { startupMs: number, requestMs: number, shutdownMs: number } }} ApplicationAuthorization
 */

/**
 * The registry's record of one application. MUTABLE by design: `state`, `detail`, `pid` and
 * `restarts` are what supervision learns over time, and a frozen snapshot of them would be
 * a lie the moment the app changed. `describe()` returns the frozen public projection.
 * @typedef {{ id: string, kind: 'application', supervision: string, baseUrl: string,
 *   healthPath: string, routes: ReadonlyArray<string>, auth: string, digest: string,
 *   dir: string, timeouts: { startupMs: number, requestMs: number, shutdownMs: number },
 *   entry: Raw, state: string, detail: string, restarts: number,
 *   pid: number | null }} ApplicationRecord
 */

/**
 * What a transport offers the kernel adapter. Deliberately the same for `process` and
 * `http`: the adapter must not be able to tell them apart, or a capability's behaviour
 * would depend on where its plugin happens to run.
 *
 * `execute` RESOLVES to a kernel `Result` and never throws — the adapter turns a failure
 * into the throw the kernel expects, in one place.
 *
 * @typedef {{
 *   id: string,
 *   runtime: 'process' | 'http',
 *   manifest: Raw,
 *   digest: string,
 *   capabilities: ReadonlyArray<string>,
 *   protocolVersion: () => string,
 *   state: () => string,
 *   execute: (capability: string, input: unknown,
 *     options?: { signal?: AbortSignal | undefined, deadlineMs?: number }) => Promise<Result>,
 *   health: () => Promise<Result>,
 *   shutdown: () => Promise<void>,
 *   onDiagnostic?: ((fn: (detail: Raw) => void) => void) | undefined,
 * }} Transport
 */

/**
 * The process transport, with the four members only a child process can have. They exist for
 * the host's diagnostics and for the tests that have to distinguish a peer's protocol breach
 * from a caller's oversized request — two different events under the same wire integer.
 * @typedef {Transport & {
 *   pid: () => number | null,
 *   restarts: () => number,
 *   counters: () => Readonly<Record<string, number>> | null,
 *   lastBreach: () => import('../upp/errors.mjs').UppError | null,
 *   onDiagnostic: (fn: (detail: Raw) => void) => void,
 * }} ProcessTransport
 */

export {};
