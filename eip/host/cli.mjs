#!/usr/bin/env node
// The host CLI: one process, loopback only, nothing enabled by default.
//
//   node eip/host/cli.mjs [--port 3100] [--dev-ui] [--reports-dir ./reports]
//                         [--approve-interactive]
//
// Without --approve-interactive there is NO approver, so every consequential
// capability answers 403 APPROVAL_REQUIRED. That is the default on purpose: a
// server that can act on the world while nobody is watching is not a safe default.
// With it, each consequential call stops the request and asks the person at the
// terminal. An HTTP caller can never approve itself (see eip/host/body.mjs).
import { createInterface } from 'node:readline/promises';
import { messageOf } from '../sdk/index.mjs';
import { resolve } from 'node:path';
import textReport from '../plugins/text-report/index.mjs';
import textStats from '../plugins/text-stats/index.mjs';
import { createHost } from './index.mjs';

const FLAGS = new Set(['--dev-ui', '--approve-interactive', '--help']);
const VALUES = new Set(['--port', '--reports-dir']);

/** PURE. Unknown arguments are an error: a typo must not silently disable a guard.
 * @param {string[]} argv */
export function parseArgs(argv) {
  const options = { port: 3100, devUi: false, reportsDir: './reports', approveInteractive: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue; // unreachable while `i < argv.length`, and said so
    if (VALUES.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--port') {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port must be 0..65535, got "${value}"`);
        options.port = port;
      } else {
        options.reportsDir = value;
      }
      i += 1;
    } else if (FLAGS.has(arg)) {
      if (arg === '--dev-ui') options.devUi = true;
      if (arg === '--approve-interactive') options.approveInteractive = true;
      if (arg === '--help') options.help = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  return options;
}

/** PURE. `y`/`yes` approve; everything else — including silence — refuses.
 * @param {unknown} answer @param {string} [by] */
export function readAnswer(answer, by = 'tty') {
  const normalised = String(answer ?? '').trim().toLowerCase();
  if (normalised === 'y' || normalised === 'yes') return { approved: true, by };
  return { approved: false, by, reason: `answer was "${normalised || 'empty'}" (default is no)` };
}

export const USAGE = `eip host — local composition of the plugin runtime

  --port <n>              port to bind on 127.0.0.1 (default 3100, 0 = any free port)
  --dev-ui                serve GET /dev/plugins/{key} diagnostics pages (default off)
  --reports-dir <path>    the only directory plugins may write into (default ./reports)
  --approve-interactive   ask on this terminal before every consequential call
  --help                  print this and exit

Without --approve-interactive, consequential capabilities answer 403 APPROVAL_REQUIRED.
`;

/** Asks the person at the terminal. No TTY means no human, which means no. */
function interactiveApprover() {
  /** @type {import('../kernel/types.mjs').Approver} */
  const ask = async ({ key, cap, input }) => {
    if (!process.stdin.isTTY) {
      return { approved: false, by: 'no-tty', reason: 'stdin is not a terminal, so nobody can approve' };
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const preview = JSON.stringify(input).slice(0, 200);
      const answer = await rl.question(`\nAPPROVE consequential call "${key}#${cap}"?\n  input: ${preview}\n  [y/N] `);
      return readAnswer(answer);
    } finally {
      rl.close();
    }
  };
  return ask;
}

/** @param {string[]} argv */
async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const host = await createHost({
    plugins: [textStats, textReport],
    devUi: options.devUi,
    reportsDir: options.reportsDir,
    ...(options.approveInteractive ? { approver: interactiveApprover() } : {}),
  });
  const { url } = await host.listen(options.port);
  process.stdout.write(`eip host listening on ${url}\n`);
  process.stdout.write(`  plugins: ${host.kernel.list().map((m) => m.name).join(', ')}\n`);
  process.stdout.write(`  reports dir: ${resolve(options.reportsDir)}\n`);
  process.stdout.write(`  dev UI: ${options.devUi ? `${url}/dev/plugins/text.stats` : 'disabled'}\n`);
  process.stdout.write(`  approvals: ${options.approveInteractive ? 'interactive (y/N on this terminal)' : 'none — consequential calls answer 403 APPROVAL_REQUIRED'}\n`);
  const stop = () => { host.close().then(() => process.exit(0), () => process.exit(1)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('cli.mjs')) {
  main(process.argv.slice(2)).catch((cause) => {
    process.stderr.write(`eip host: ${messageOf(cause)}\n${USAGE}`);
    process.exitCode = 2;
  });
}
