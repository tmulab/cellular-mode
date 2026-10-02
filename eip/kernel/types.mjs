// The kernel's internal type vocabulary: typedefs only, no runtime code.
//
// Each shape is derived from the factory that produces it with `ReturnType`, so the
// type cannot drift from the implementation — there is one definition, not two. The
// contract shapes the kernel shares with hosts and plugins live in `../sdk/types.mjs`
// instead, because the SDK is the layer everybody is allowed to know about.
//
// Nothing imports this at runtime; `import('./types.mjs').Registry` is read by the
// type checker and never by the module loader.

/** @typedef {ReturnType<typeof import('./registry.mjs').createRegistry>} Registry */
/** @typedef {ReturnType<typeof import('./events.mjs').createEvents>} Events */
/** @typedef {ReturnType<typeof import('./lifecycle.mjs').createLifecycle>} Lifecycle */
/** @typedef {ReturnType<typeof import('./index.mjs').createKernel>} Kernel */

/** One loaded plugin, as the lifecycle records it.
 * @typedef {{ key: string, manifest: import('../sdk/types.mjs').Manifest,
 *   config: import('../sdk/types.mjs').Config, service: Record<string, unknown>,
 *   disposers: Array<() => unknown>,
 *   ports: Record<string, import('../sdk/types.mjs').PortFn> }} Instance
 */

/** The capability `execute` found, ready to run. No `ok` field: that is what marks a
 * failure, so `'ok' in found` is the discriminant.
 * @typedef {{ cap: import('../sdk/types.mjs').Capability, fn: CapabilityFn,
 *   service: Record<string, unknown> }} Located
 */

/** A capability implementation, as the service object exposes it.
 * @typedef {(this: unknown, input: unknown,
 *   meta: { signal: AbortSignal, key: string, cap: string }) => unknown} CapabilityFn
 */

/** What an approver is asked, and what it may answer. A malformed answer is not consent.
 * @typedef {{ key: string, cap: string, input: unknown, consequential: boolean,
 *   approval?: unknown }} ApprovalRequest
 * @typedef {(request: ApprovalRequest) => unknown} Approver
 */

export {};
