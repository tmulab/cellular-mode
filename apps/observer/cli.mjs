#!/usr/bin/env node
// cli.mjs — the launcher. Two processes' worth of work in one process:
//
//   node apps/observer/cli.mjs --root <dir> [--port 3200] [--advisor fixture]
//                               [--adaptive] [--fixture]
//
// It starts the host composition on a free loopback port, starts the application server
// on the port you asked for, prints the local URL, and stops both on Ctrl+C. Nothing is
// written to the project: the observer reads a vault and renders it.
import { resolve } from 'node:path';
import { createAppServer } from './server.mjs';
import { composeObserverHost } from './host-adapter.mjs';

const FLAGS = new Set(['--adaptive', '--fixture', '--help']);
const VALUES = new Set(['--root', '--port', '--advisor']);

export const USAGE = `cellular observer — local dashboard for a vault

  --root <dir>       the project to read (required unless --fixture)
  --port <n>         port for the app on 127.0.0.1 (default 3200, 0 = any free port)
  --advisor <id>     load the advisor plugin with this model adapter (default: not loaded)
  --adaptive         load the optional adaptive.preferences reader, so the header can show a
                     mode the human declared (default: not loaded, and nothing changes)
  --fixture          serve the interface against the recorded contract fixtures, with no
                     host and no vault — for reviewing the UI, never for reading a project
  --help             print this and exit

The app binds 127.0.0.1 and has no option to bind anything else.
`;

/** PURE. Unknown arguments are an error: a typo must not silently change what runs.
 * @param {ReadonlyArray<string>} argv
 * @returns {{ root: string | null, port: number, advisor: string | null, adaptive: boolean,
 *   fixture: boolean, help: boolean }} */
export function parseArgs(argv) {
  /** @type {{ root: string | null, port: number, advisor: string | null, adaptive: boolean,
   *   fixture: boolean, help: boolean }} */
  const options = { root: null, port: 3200, advisor: null, adaptive: false, fixture: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (VALUES.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--port') {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(`--port must be 0..65535, got "${value}"`);
        }
        options.port = port;
      } else if (arg === '--root') {
        options.root = value;
      } else {
        options.advisor = value;
      }
      index += 1;
    } else if (FLAGS.has(arg)) {
      if (arg === '--adaptive') options.adaptive = true;
      if (arg === '--fixture') options.fixture = true;
      if (arg === '--help') options.help = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  if (!options.help && !options.fixture && options.root === null) {
    throw new Error('--root <dir> is required (or --fixture to review the interface alone)');
  }
  return options;
}

/** PURE. What the launcher prints once both halves are up. Separated from the printing so
 * the wording is testable and stays honest about which mode is running.
 * @param {{ url: string, assetCount: number, fixture: boolean, root: string | null, keys: string[] }} state
 * @returns {string} */
export function startupReport({ url, assetCount, fixture, root, keys }) {
  const lines = [`cellular observer on ${url}${fixture ? '?source=fixture' : ''}`];
  lines.push(fixture
    ? '  data: RECORDED FIXTURES — no vault is being read'
    : `  vault: ${resolve(root ?? '.')}`);
  lines.push(`  capabilities: ${keys.length === 0 ? 'none (fixture mode)' : keys.join(', ')}`);
  lines.push(`  serving ${assetCount} allowlisted files, and nothing else`);
  lines.push('  Ctrl+C stops the app and the host');
  return `${lines.join('\n')}\n`;
}

/** @param {ReadonlyArray<string>} argv @returns {Promise<number>} */
export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  /** @type {{ port: number, keys: string[], close: () => Promise<void> } | null} */
  let host = null;
  if (!options.fixture && options.root !== null) {
    host = await composeObserverHost({
      root: options.root,
      ...(options.advisor === null ? {} : { advisor: options.advisor }),
      ...(options.adaptive ? { adaptive: true } : {}),
    });
  }
  const app = createAppServer({ upstreamPort: host === null ? 1 : host.port });
  const { url } = await app.listen(options.port);
  process.stdout.write(startupReport({
    url,
    assetCount: app.assetCount,
    fixture: options.fixture,
    root: options.root,
    keys: host === null ? [] : host.keys,
  }));

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    app.close()
      .then(() => (host === null ? undefined : host.close()))
      .then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return 0;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('cli.mjs')) {
  main(process.argv.slice(2)).catch((cause) => {
    process.stderr.write(`cellular observer: ${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`);
    process.exitCode = 2;
  });
}
