// The declared type vocabulary of the SDK: typedefs only, no runtime code.
//
// Why a module with no statements in it: the contract shapes (`Manifest`,
// `PluginContext`, `Capability`) are referenced by the kernel, the host, the
// orchestration layer and every plugin. Writing them once here keeps each of those
// files honest about the SAME shape, and keeps the files that implement behaviour
// short enough to read in one sitting. It is the contract, spelled out, and nothing
// else — exactly the split the architecture asks for elsewhere.
//
// Nothing imports this at runtime. Types are referenced with
// `import('../sdk/types.mjs').Manifest`, which the type checker reads and the
// JavaScript loader never sees, so no layer gains a runtime dependency.

/** @typedef {import('./schema.mjs').Schema} Schema */
/** @typedef {import('./schema.mjs').SchemaError} SchemaError */

/** @typedef {Record<string, unknown>} Raw an object before validation says what it is. */

/** @typedef {Record<string, unknown>} Config a plugin config, shape declared by its own schema. */

/** @typedef {(...args: unknown[]) => unknown} PortFn an outside-world function a host hands over. */

/** @typedef {{ consequential: boolean, description: string, input: Schema, output: Schema }} Capability */

/**
 * What a plugin's `apply` receives. Assembled by the kernel at load time; declared
 * here because the SDK is the only module a plugin is allowed to import.
 * @typedef {{ key: string, config: Config, ports: Record<string, PortFn>,
 *   get: (depKey: string) => unknown, onDispose: <T extends () => unknown>(fn: T) => T,
 *   emit: (detail: unknown) => void }} PluginContext
 */

/**
 * A manifest that has passed `validateManifest`. `apply` returns the service object
 * (or a promise of one); the kernel refuses anything else.
 * @typedef {{ name: string, version: string, sdk: string, description: string,
 *   inject?: Record<string, { required: boolean }>, permissions?: string[],
 *   config?: Schema, capabilities: Record<string, Capability>,
 *   apply: (ctx: PluginContext, config: Config) => unknown,
 *   devUi?: { title: string, html: string } }} Manifest
 */

/** The same manifest without the executable and without the dev-UI body.
 * @typedef {Omit<Manifest, 'apply' | 'devUi'> & { devUi?: { title: string } }} ManifestDescription
 */

/** The wire shape of a failure: a code, a message, and structure — never a stack.
 * @typedef {{ code: string, message: string, details?: ReadonlyArray<SchemaError> }} ErrorShape
 */

/** What `execute` returns instead of throwing. Discriminated on `ok`.
 * @typedef {{ ok: true, value: unknown }} Ok
 * @typedef {{ ok: false, error: ErrorShape }} Err
 * @typedef {Ok | Err} Result
 */

/**
 * One observability event. `code` and `ok` are written as `| undefined` on purpose:
 * under `exactOptionalPropertyTypes` a caller that passes `code: undefined`
 * explicitly — which the executor does on success — must be allowed to say so.
 * @typedef {{ type: string, key?: string, cap?: string, ok?: boolean,
 *   code?: string | undefined, ms?: number, at?: string, by?: string | null,
 *   detail?: unknown, stack?: string | null,
 *   grantedPorts?: string[], deniedPorts?: string[] }} KernelEvent
 */

/** An approval verdict, after `readVerdict` has made its shape safe to trust.
 * @typedef {{ approved: boolean, by: string | null, reason: string | null }} Verdict
 */

export {};
