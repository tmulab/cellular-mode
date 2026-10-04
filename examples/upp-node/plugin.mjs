// The UPP 1.0 conformance reference plugin, in JavaScript, as a CHILD PROCESS.
//
// It imports nothing from this repository. That is deliberate: a conformance implementation
// that shared code with the host testing it would prove the two agree with themselves. Every
// other implementation under `examples/upp-*` is a translation of THIS file, so the five of
// them can be read side by side.
//
// Usage:  node plugin.mjs <path-to-upp/conformance/manifest.json>
// Protocol: NDJSON on stdin/stdout, one JSON-RPC 2.0 message per line. stdout is protocol
// only; anything diagnostic goes to stderr and is never parsed by the host.
import { readFileSync } from 'node:fs';

const MANIFEST_PATH = process.argv[2];
if (MANIFEST_PATH === undefined) {
  process.stderr.write('usage: node plugin.mjs <manifest.json>\n');
  process.exit(2);
}
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const PROTOCOL = '1.0';
const MAX_TEXT = 4096;

/** @param {Record<string, unknown>} message */
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
/** @param {unknown} id @param {Record<string, unknown>} result */
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
/** @param {unknown} id @param {number} code @param {string} kernelCode @param {string} message */
const bad = (id, code, kernelCode, message) => send({
  jsonrpc: '2.0', id: id ?? null, error: { code, message, data: { code: kernelCode } },
});

/** Words are runs of non-whitespace. @param {string} text @returns {number} */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** The declared input contract, checked by hand so the answer is the plugin's own.
 * @param {unknown} input @returns {string | null} the breach, or null */
function breachOf(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'input must be an object';
  const keys = Object.keys(input);
  const extra = keys.filter((key) => key !== 'text');
  if (extra.length > 0) return `unknown input field(s): ${extra.join(', ')}`;
  const { text } = /** @type {{ text?: unknown }} */ (input);
  if (typeof text !== 'string') return 'input.text is required and must be a string';
  if (text.length > MAX_TEXT) return `input.text must be at most ${MAX_TEXT} characters`;
  return null;
}

/** @param {unknown} id @param {Record<string, unknown>} params */
function execute(id, params) {
  if (params.capability !== 'wordcount') {
    return bad(id, -32001, 'NOT_FOUND', `no capability "${String(params.capability)}"`);
  }
  const breach = breachOf(params.input);
  if (breach !== null) return bad(id, -32602, 'INPUT_INVALID', breach);
  const { text } = /** @type {{ text: string }} */ (params.input);
  return ok(id, { output: { words: countWords(text) } });
}

/** @param {Record<string, unknown>} message */
function dispatch(message) {
  const { id, method } = message;
  const params = /** @type {Record<string, unknown>} */ (message.params ?? {});
  if (method === 'upp.cancel') return undefined; // a notification is never answered
  if (method === 'upp.exit') return process.exit(0);
  if (method === 'upp.initialize') {
    const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
    if (!offered.includes(PROTOCOL)) {
      return bad(id, -32002, 'CONTRACT_INVALID',
        `this plugin speaks ${PROTOCOL}; the host offered [${offered.join(', ')}]`);
    }
    return ok(id, { protocolVersion: PROTOCOL, manifest: MANIFEST });
  }
  if (method === 'upp.capabilities') return ok(id, { capabilities: MANIFEST.capabilities });
  if (method === 'upp.execute') return execute(id, params);
  if (method === 'upp.health') return ok(id, { status: 'ok' });
  if (method === 'upp.shutdown') return ok(id, {});
  return bad(id, -32601, 'CONTRACT_INVALID', `unknown method "${String(method)}"`);
}

let held = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  held += chunk;
  for (;;) {
    const at = held.indexOf('\n');
    if (at === -1) break;
    const line = held.slice(0, at);
    held = held.slice(at + 1);
    if (line.trim() === '') continue;
    try {
      dispatch(JSON.parse(line));
    } catch {
      // The id could not be read, which is the one case JSON-RPC reserves a null id for.
      bad(null, -32700, 'PLUGIN_ERROR', 'the line is not valid JSON');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
