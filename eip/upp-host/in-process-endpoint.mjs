// U10: the protocol, served by an ORDINARY in-process plugin, with no process anywhere.
//
// This exists to answer one question honestly: does an existing `definePlugin` plugin satisfy
// UPP, or only a plugin written for UPP? So it takes a plugin the kernel already has loaded,
// maps its manifest with the pure compat layer (`toUppManifest`), and answers the same eleven
// conformance cases from the same JSON corpus — same framing, same method set, same error
// integers. No plugin is migrated and no plugin learns that this exists.
//
// It is a mirror of the transports, not a third one. The parsing is `deserialize` +
// `validateMessage` from `eip/upp`, the error integers come from `rpcCodeFor`, and `execute`
// goes through `kernel.execute`, which means the kernel's own gates — input, approval, the
// deadline, output — all still run. An endpoint that validated anything itself would be a
// second semantics, which is exactly what U10 is here to rule out.
import {
  JSONRPC_CODES, SUPPORTED_PROTOCOL_VERSIONS, deserialize, errorResponse, negotiate, response,
  rpcCodeFor, toUppManifest, uppError, validateMessage,
} from '../upp/index.mjs';

/** @typedef {Record<string, unknown>} Raw */
/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @param {{ kernel: { execute: (key: string, cap: string, input: unknown,
 *     options?: { timeoutMs?: number }) => Promise<import('../sdk/types.mjs').Result>,
 *   isLoaded: (key: string) => boolean },
 *   manifest: Manifest, module?: string }} wiring
 * @returns {{ uppManifest: Raw, handle: (line: string) => Promise<string | null>,
 *   closed: () => boolean }}
 */
export function createInProcessEndpoint(wiring) {
  const { kernel, manifest } = wiring;
  const key = manifest.name;
  const uppManifest = toUppManifest(manifest,
    wiring.module === undefined ? {} : { module: wiring.module });
  const capabilities = isPlain(uppManifest.capabilities) ? uppManifest.capabilities : {};
  let closed = false;

  /** @type {(id: unknown, code: number, message: string) => string} */
  const refuse = (id, code, message) => JSON.stringify(
    errorResponse(id, uppError(code, message)));

  /** @param {unknown} id @param {Raw} params @returns {string} */
  function initialize(id, params) {
    const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
    // The PLUGIN picks from the host's list, which is why `negotiate` is called with the
    // offered list first here and with the host's own list on the host side: the same pure
    // function, read from the other end of the wire.
    const agreed = negotiate(/** @type {string[]} */ (offered), SUPPORTED_PROTOCOL_VERSIONS);
    if (!agreed.ok) return JSON.stringify(errorResponse(id, agreed.error));
    return JSON.stringify(response(id, { protocolVersion: agreed.version, manifest: uppManifest }));
  }

  /** @param {unknown} id @param {Raw} params @returns {Promise<string>} */
  async function execute(id, params) {
    const capability = String(params.capability);
    if (!Object.hasOwn(capabilities, capability)) {
      return refuse(id, rpcCodeFor('NOT_FOUND'), `no capability "${capability}"`);
    }
    const timeoutMs = typeof params.deadlineMs === 'number' ? params.deadlineMs : undefined;
    const result = await kernel.execute(key, capability, params.input,
      timeoutMs === undefined ? {} : { timeoutMs });
    if (result.ok) return JSON.stringify(response(id, { output: result.value }));
    return JSON.stringify(errorResponse(id,
      uppError(rpcCodeFor(result.error.code), result.error.message, result.error.details ?? [])));
  }

  /**
   * One line in, at most one line out. `null` means "this was a notification" — the single
   * most skipped rule of JSON-RPC, and the one case 10 of the corpus exists to check.
   * @param {string} line @returns {Promise<string | null>}
   */
  async function handle(line) {
    const parsed = deserialize(line);
    if (!parsed.ok) return JSON.stringify(errorResponse(null, parsed.error));
    const checked = validateMessage(parsed.value);
    if (!checked.ok) {
      const id = isPlain(parsed.value) ? parsed.value.id : null;
      return JSON.stringify(errorResponse(id ?? null, checked.error));
    }
    const { id, method, params, notification } = checked.value;
    if (method === 'upp.cancel') return null; // best effort, and nothing to cancel in-process
    if (method === 'upp.exit') {
      closed = true;
      return null;
    }
    if (notification) return null;
    if (closed) return refuse(id, JSONRPC_CODES.INTERNAL_ERROR, 'this endpoint has exited');
    if (method === 'upp.initialize') return initialize(id, params);
    if (method === 'upp.capabilities') return JSON.stringify(response(id, { capabilities }));
    if (method === 'upp.execute') return execute(id, params);
    if (method === 'upp.health') {
      return JSON.stringify(response(id, { status: kernel.isLoaded(key) ? 'ok' : 'unhealthy' }));
    }
    if (method === 'upp.shutdown') return JSON.stringify(response(id, {}));
    // Unreachable while `METHODS` and this dispatch agree; kept so a method added to the
    // protocol without an answer here is a refusal rather than a silence.
    return refuse(id, JSONRPC_CODES.METHOD_NOT_FOUND, `unhandled method "${method}"`);
  }

  return { uppManifest, handle, closed: () => closed };
}

/**
 * The endpoint as a `Conversation` for `replayCase`: lines in, lines out, no process.
 * @param {ReturnType<typeof createInProcessEndpoint>} endpoint
 * @returns {{ send: (line: string) => void, messages: () => unknown[], failures: () => string[] }}
 */
export function endpointConversation(endpoint) {
  /** @type {unknown[]} */
  const messages = [];
  /** @type {string[]} */
  const failures = [];
  /** @type {Promise<void>} */
  let queue = Promise.resolve();
  return {
    send(line) {
      // Serialised, because a conversation has an ORDER: answering request 3 before request 2
      // would make every positional expectation in the corpus meaningless.
      queue = queue.then(async () => {
        const answer = await endpoint.handle(line);
        if (answer === null) return;
        try {
          messages.push(JSON.parse(answer));
        } catch (cause) {
          failures.push(`the endpoint emitted a line that is not JSON: ${String(cause)}`);
        }
      });
    },
    messages: () => [...messages],
    failures: () => [...failures],
  };
}
