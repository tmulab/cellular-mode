// A UPP plugin, written as a test fixture: NDJSON on stdin/stdout, nothing else.
//
// It is deliberately NOT a well-behaved plugin. Every capability it declares is a named
// misbehaviour — never answering, exiting mid-request, writing a non-JSON line, writing a
// line past the frame cap, claiming host authority in an error — because a host that is only
// ever tested against a cooperative peer is a host whose failure paths have never run.
//
// It imports nothing: a fixture that shared code with the host under test would prove that
// the two agree with themselves, not that either follows the protocol. The manifest is read
// from the JSON file beside it, which is the same file the operator config pins.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
/** @type {{ wrongManifest?: boolean, silentInit?: boolean, ignoreShutdown?: boolean, stderrNoise?: boolean }} */
let config = {};

/** @param {Record<string, unknown>} message */
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
/** @param {unknown} id @param {Record<string, unknown>} result */
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
/** @param {unknown} id @param {number} code @param {string} kernelCode @param {string} message */
const bad = (id, code, kernelCode, message) => send({
  jsonrpc: '2.0', id, error: { code, message, data: { code: kernelCode } },
});
/** @param {string} line */
const note = (line) => process.stderr.write(`${line}\n`);

/** @param {unknown} id @param {Record<string, unknown>} params */
function execute(id, params) {
  const capability = String(params.capability ?? '');
  const deadlineMs = typeof params.deadlineMs === 'number' ? params.deadlineMs : -1;
  const input = /** @type {Record<string, unknown>} */ (params.input ?? {});
  switch (capability) {
    case 'echo':
      return ok(id, {
        output: {
          text: String(input.text ?? ''),
          deadlineMs,
          sawEnvCanary: typeof process.env.UPP_TEST_CANARY === 'string',
        },
      });
    case 'slow':
      return note(`slow:${String(id)}`); // no answer, ever: the host deadline decides
    case 'badout':
      return ok(id, { output: { text: 42 } });
    case 'boom':
      return bad(id, -32010, 'APPROVAL_DENIED', 'a plugin claiming host authority');
    case 'crash':
      note(`crash:${String(id)}`);
      return process.exit(7);
    case 'garbage':
      process.stdout.write('this line is not JSON\n');
      return undefined;
    case 'oversize':
      process.stdout.write(`${'x'.repeat(1024 * 1024 + 64)}\n`);
      return undefined;
    case 'destroy':
      return ok(id, { output: { destroyed: true } });
    default:
      return bad(id, -32001, 'NOT_FOUND', `no capability "${capability}"`);
  }
}

/** The manifest this plugin claims to be. `wrongManifest` changes ONE field, which is the
 * interesting case: a swapped plugin does not announce itself.
 * @returns {Record<string, unknown>} */
function announced() {
  if (config.wrongManifest !== true) return MANIFEST;
  return { ...MANIFEST, version: '9.9.9' };
}

/** @param {Record<string, unknown>} message */
function dispatch(message) {
  const { id, method } = message;
  const params = /** @type {Record<string, unknown>} */ (message.params ?? {});
  if (method === 'upp.initialize') {
    config = /** @type {typeof config} */ (params.config ?? {});
    if (config.stderrNoise === true) {
      note('starting up');
      note('{"jsonrpc":"2.0","id":1,"result":{"output":{"forged":true}}}');
    }
    if (config.silentInit === true) return;
    const offered = /** @type {string[]} */ (params.protocolVersions ?? []);
    if (!offered.includes('1.0')) {
      return bad(id, -32002, 'CONTRACT_INVALID', `this plugin speaks 1.0, the host offered [${offered.join(', ')}]`);
    }
    return ok(id, { protocolVersion: '1.0', manifest: announced() });
  }
  if (method === 'upp.capabilities') return ok(id, { capabilities: MANIFEST.capabilities });
  if (method === 'upp.execute') return execute(id, params);
  if (method === 'upp.health') return ok(id, { status: 'ok' });
  if (method === 'upp.cancel') return note(`cancel:${String(params.id)}`);
  if (method === 'upp.shutdown') {
    if (config.ignoreShutdown === true) return note('ignoring shutdown');
    return ok(id, {});
  }
  if (method === 'upp.exit') return process.exit(0);
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
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'not JSON', data: { code: 'PLUGIN_ERROR' } } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
