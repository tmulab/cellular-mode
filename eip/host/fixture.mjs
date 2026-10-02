// Harness for the host suite: a real server on a real socket, port 0 so the OS
// picks a free one and the tests can run in parallel with anything else.
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import textReport from '../plugins/text-report/index.mjs';
import textStats from '../plugins/text-stats/index.mjs';
import { createHost } from './index.mjs';

export { textReport, textStats };

/** One response, parsed: the JSON envelope when the body was JSON, else raw text.
 * @typedef {{ status: number, headers: Headers, body: unknown, text: string }} Answer */

/** The JSON envelope, as `api/openapi.json` describes every JSON answer. The cast IS
 * the contract being asserted: `openapi.test.mjs` validates real responses against the
 * document, and these tests read the fields that document promises.
 * @typedef {{ ok: boolean, value?: Record<string, unknown>,
 *   error?: { code: string, message: string,
 *     details?: Array<{ path: string, message: string }> } }} Envelope */

/** @type {(answer: Answer) => Envelope} */
export const envelope = (answer) => /** @type {Envelope} */ (answer.body);

/** A header value as a string: `Headers.get` answers `null` for an absent header, and
 * an assertion on `null` reads better as an assertion on the empty string.
 * @type {(answer: Answer, name: string) => string} */
export const header = (answer, name) => answer.headers.get(name) ?? '';

/**
 * A started host plus a `call` helper and a cleanup that closes the socket, drops
 * the plugins and removes the temporary reports directory.
 * @param {{ devUi?: boolean,
 *   approver?: import('../kernel/types.mjs').Approver,
 *   approvals?: unknown[] }} [options]
 */
export async function startHost({ devUi = false, approver, approvals = [] } = {}) {
  const reportsDir = await mkdtemp(join(tmpdir(), 'eip-host-'));
  const host = await createHost({
    plugins: [textStats, textReport],
    reportsDir,
    devUi,
    ...(approver === undefined ? {} : {
      approver: (request) => { approvals.push(request); return approver(request); },
    }),
  });
  const { url } = await host.listen(0);

  return {
    host, url, reportsDir, approvals,
    /** fetch + parse, returning status, headers and body in one object.
     * @param {string} path @param {RequestInit} [init] */
    async call(path, init = {}) {
      const response = await fetch(`${url}${path}`, init);
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text; // an HTML page or an asset: handed back raw
      }
      return { status: response.status, headers: response.headers, body, text };
    },
    /** POST a capability call with the canonical envelope.
     * @param {string} path @param {unknown} payload */
    post(path, payload) {
      return this.call(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    async cleanup() {
      await host.close();
      await rm(reportsDir, { recursive: true, force: true });
    },
  };
}

export const CAPABILITY = '/api/v1/plugins/text.stats/capabilities/count-words';
export const SAVE_REPORT = '/api/v1/plugins/text.report/capabilities/save-report';
