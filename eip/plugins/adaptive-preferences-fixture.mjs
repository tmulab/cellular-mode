// Harness for the `adaptive.preferences` suite. Not a test file, so `node --test` skips it.
//
// The state under test is written with `writeFileSync` rather than by the adaptive CLI, for
// one reason: the CLI cannot write an INVALID file, an EXPIRED file or a file with an unknown
// key, and those are three of the five standings this plugin exists to report. The VALID
// cases are written in the exact shape `tools/adaptive/schema.mjs` validates, so a drift in
// the contract fails the suite instead of being papered over.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createKernel } from '../kernel/index.mjs';
import { createAdaptiveReadPorts } from '../host/adaptive-read-port.mjs';
import { createVaultReadPorts } from '../host/read-port.mjs';
import { createWritePort } from '../host/write-port.mjs';
import { createAdaptivePreferencesPlugin } from './adaptive-preferences/index.mjs';

export const KEY = 'adaptive.preferences';

/** The pinned clock. Every expectation in the suite is relative to this instant. */
export const NOW = '2026-10-03T13:26:00.000Z';

/** A declaration that is active at NOW: four hours from 13:26, the documented default TTL. */
export const ACTIVE_SESSION = Object.freeze({
  schema: 1,
  mode: 'tired',
  declaredBy: 'user',
  source: 'claude-hook',
  command: '/modocansado',
  activatedAt: '2026-10-03T13:26:00.000Z',
  expiresAt: '2026-10-03T17:26:00.000Z',
  scope: 'session',
});

/** The same declaration, read four hours and one minute later. */
export const EXPIRED_SESSION = Object.freeze({
  ...ACTIVE_SESSION,
  activatedAt: '2026-10-03T08:00:00.000Z',
  expiresAt: '2026-10-03T12:00:00.000Z',
});

/**
 * A kernel with `adaptive.preferences` loaded over a temporary project, plus — on purpose —
 * the vault read ports and a `writeFile` port it never declared, so that "the writer and the
 * vault are invisible" is a tested claim and not an arrangement.
 * @param {{ session?: unknown, preferences?: unknown, sessionText?: string,
 *   preferencesText?: string, now?: string, offerExtraPorts?: boolean }} [options]
 */
export async function loadAdaptive({
  session, preferences, sessionText, preferencesText, now = NOW, offerExtraPorts = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eip-adaptive-plugin-'));
  const dir = join(root, '.cellular', 'adaptive');
  mkdirSync(dir, { recursive: true });
  if (session !== undefined) writeFileSync(join(dir, 'session.json'), `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  if (sessionText !== undefined) writeFileSync(join(dir, 'session.json'), sessionText, 'utf8');
  if (preferences !== undefined) writeFileSync(join(dir, 'preferences.json'), `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  if (preferencesText !== undefined) writeFileSync(join(dir, 'preferences.json'), preferencesText, 'utf8');

  const manifest = createAdaptivePreferencesPlugin({ now: () => now });
  const kernel = createKernel();
  kernel.register(manifest);
  const ports = {
    ...createAdaptiveReadPorts(root),
    ...(offerExtraPorts
      ? { ...createVaultReadPorts(root), writeFile: createWritePort(join(root, 'reports')) }
      : {}),
  };
  await kernel.load(KEY, { ports });
  return {
    kernel,
    root,
    manifest,
    /** @type {(input?: unknown) => Promise<import('../sdk/types.mjs').Result>} */
    call: (input = {}) => kernel.execute(KEY, 'current', input),
    /** The live service object, for the diagnostics the manifest publishes. */
    service: () => /** @type {Record<string, unknown>} */ (kernel.get(KEY)),
    async cleanup() {
      if (kernel.isLoaded(KEY)) await kernel.dispose(KEY);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** The answer every non-active standing gives, with the standing and notice filled in.
 * @param {string} standing @param {{ enabled?: boolean, notice?: string | null }} [extra] */
export function readyAnswer(standing, { enabled = true, notice = null } = {}) {
  return {
    enabled,
    mode: 'ready',
    standing,
    declaredBy: null,
    source: null,
    activatedAt: null,
    expiresAt: null,
    notice,
  };
}
