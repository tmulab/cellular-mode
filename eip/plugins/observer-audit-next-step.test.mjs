// The defect `open --next` fixes, measured end to end: the REAL CLI writes a temp vault,
// the host's confined read ports read it, `observer.state`'s model normalises it, and
// `observer.audit`'s cell-contract rule judges it.
//
// Both sides are asserted on purpose. The auditor's rule is UNTOUCHED by this fix: a cell
// opened WITHOUT a next step must still raise AUD-CELL-CONTRACT, or the second assertion
// here would be proving that the warning went away because the check stopped looking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVaultReadPorts } from '../host/read-port.mjs';
import { readModel } from './observer-state/model.mjs';
import { cellContractChecks } from './observer-audit/checks-vault.mjs';
import { assignIds } from './observer-audit/statuses.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', '..', 'tools', 'cellmode', 'cli.mjs');
const STEP = 'write the failing test for the --next option';

/** A vault built by the real CLI: `init`, then `open` with the given extra options.
 * @param {string[]} extra @returns {{ root: string, cleanup: () => void }} */
function openedVault(extra) {
  const root = mkdtempSync(join(tmpdir(), 'audit-next-'));
  for (const args of [['init'], ['open', 'Tag Filter', '--area', 'tools', '--objective',
    'filter by tag', '--in', 'the filter', '--out', 'the UI', '--done', 'gates green', ...extra]]) {
    execFileSync(process.execPath, [CLI, ...args, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, CELLMODE_NOW: '2026-10-02 09:00' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** The cell-contract findings the auditor reports about a CLI-written vault.
 * @param {string[]} extra */
async function contractFindings(extra) {
  const vault = openedVault(extra);
  try {
    const ports = createVaultReadPorts(vault.root);
    const model = await readModel(
      (name) => ports.readVault.fn(name),
      () => ports.listCells.fn(),
    );
    assert.deepEqual(model.integrity.findings, [], 'the CLI wrote a vault the guard accepts');
    assert.deepEqual(model.entries.map((e) => [e.id, e.status]), [['tag-filter', 'active']]);
    return assignIds(cellContractChecks(model));
  } finally {
    vault.cleanup();
  }
}

test('a cell opened WITH --next raises no AUD-CELL-CONTRACT warning', async () => {
  const findings = await contractFindings(['--next', STEP]);
  assert.deepEqual(findings.map((f) => f.status), ['PASS']);
  assert.deepEqual(findings.map((f) => f.id), ['AUD-CELL-CONTRACT-001']);
  assert.equal(findings.filter((f) => f.status === 'WARNING').length, 0);
});

test('a cell opened WITHOUT --next still raises the warning: the rule is untouched', async () => {
  const findings = await contractFindings([]);
  assert.deepEqual(findings.map((f) => f.status), ['WARNING']);
  assert.deepEqual(findings.map((f) => f.id), ['AUD-CELL-CONTRACT-001']);
  assert.equal(findings[0]?.scope, 'cell:tag-filter');
  assert.deepEqual(findings[0]?.evidence, ['vault/state/cells/tag-filter.md', 'field next step']);
});
