// rehearsal-swarm.test.mjs — the swarm rehearsal of cell R10: the two days of a REAL
// field operation (22-23/10/2026, "Ir ao ar") replayed through the real CLI on a temp
// vault that is a temp GIT repository, in order, one step per subtest. Nothing here is a
// unit: every assertion is a file on disk, an exit code or a stream the CLI produced.
//
// What the rehearsal is for: the finish line is frozen at opening (AGENTS.md rule 6), and
// a day of parallel cells, refusals, a pack amendment, discoveries and closures must not
// move it by a byte. The first step records the frozen text and its fingerprint; the last
// step compares them, in the operation file AND in the CURRENT-CELL.md header.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellText, readCellText, readState, run } from './helpers.mjs';
import {
  D22, D23, FOUR, OPEN_OP, freshProject, git, openCell, opFragment, opText,
} from './rehearsal-helpers.mjs';

const FINGERPRINT = /\*\*Fingerprint:\*\* [0-9a-f]{64}/;
const FINISH_FIELD = /\*\*Finish line \(frozen\):\*\*.*/;
const CURRENT_FINISH = /^Finish line: .*$/m;
const SHA = /[0-9a-f]{40}/;

test('swarm rehearsal: 22-23/10/2026, parallel cells and a finish line that never moves',
  async (t) => {
    const fixture = freshProject();
    if (fixture === null) return; // the rehearsal needs a real repository: no git, no run
    const { root, head } = fixture;
    const frozen = { finish: '', fingerprint: '', current: '' };
    /** @returns {number} the parked ideas */
    const parked = () => readState(root, 'parkingLot').split('\n')
      .filter((l) => l.startsWith('- [')).length;

    await t.test('1 · op open freezes five items, a pack with a ceiling, ten planned cells',
      () => {
        const out = run(root, OPEN_OP, { now: D22 });
        assert.match(out.stdout, /Opened operation "Ir ao ar" \(ir-ao-ar\) · 🔵/);
        assert.match(out.stdout, /Finish line frozen \(5 items\) · fingerprint [0-9a-f]{64}/);
        assert.match(out.stdout, /Planned cells: publicacao-vps, login, matricula-404, modulo-1/);
        const file = opText(root);
        assert.match(file, /\*\*Finish line \(frozen\):\*\* 1\. publicacao no VPS · 2\. login · /);
        assert.match(file, /3\. matricula 404 para quem nao tem · 4\. modulo 1 completo · /);
        assert.match(file, /5\. painel do admin$/m);
        assert.match(file, /\*\*Authorization pack:\*\*.*max-active-cells: 4/);
        assert.match(file, /denied: push to main, delete the database/);
        assert.match(file, /\*\*Quality bar:\*\* every claim carries an epistemic label/);
        assert.equal(/\*\*Planned cells:\*\* (.+)/.exec(file)?.[1]?.split(', ').length, 10);
        frozen.finish = opFragment(root, FINISH_FIELD);
        frozen.fingerprint = opFragment(root, FINGERPRINT);
        frozen.current = CURRENT_FINISH.exec(readState(root, 'current'))?.[0] ?? '';
        assert.equal(frozen.fingerprint.length, '**Fingerprint:** '.length + 64);
        assert.match(frozen.finish, /^\*\*Finish line \(frozen\):\*\* 1\. publicacao no VPS · /);
        assert.match(frozen.current, /^Finish line: 1\. publicacao no VPS · /);
        run(root, ['check'], { now: D22 });
      });

    await t.test('2 · four cells side by side; the fifth, the overlap and the unplanned one',
      () => {
        FOUR.forEach((cell, i) => {
          const out = openCell(root, cell);
          assert.match(out.stdout, new RegExp(`Operation: Ir ao ar · base commit ${
            SHA.source} · ${i + 1}/4 active`));
        });
        assert.match(cellText(root, 'publicacao-vps'), new RegExp(`\\*\\*Base commit:\\*\\* ${head}`));
        const fifth = run(root, ['open', 'Painel Admin', '--area', 'admin',
          '--in', 'app/painel.ts', '--out', 'infra/**'], { now: D22, expect: 3 });
        assert.match(fifth.stderr,
          /4 cell\(s\) already 🔵 in operation "Ir ao ar" \(max-active-cells: 4\)/);
        assert.match(fifth.stderr,
          /pause one first: Publicacao VPS, Login, Matricula 404, Modulo 1/);
        assert.equal(readCellText(root, 'painel-admin'), null, 'the refusal wrote no cell file');
        run(root, ['pause', 'Modulo 1', '--facts', 'aula 1 publicada',
          '--next', 'gravar a aula 2', '--spend', '3.2k tokens'], { now: D22 });
        const overlap = run(root, ['open', 'Painel Admin', '--area', 'admin',
          '--in', 'app/login.ts, app/painel.ts', '--out', 'infra/**'], { now: D22, expect: 3 });
        assert.match(overlap.stderr,
          /cell "Painel Admin" overlap with Login: app\/login\.ts/);
        assert.match(overlap.stderr, /re-run with --confirm to open it anyway/);
        assert.equal(readCellText(root, 'painel-admin'), null);
        run(root, ['check'], { now: D22 });
      });

    await t.test('2b · the unplanned cell needs the human: exit 1, then --amend-pack --confirm',
      () => {
        const args = ['open', 'Hotfix Pagamento', '--area', 'pay', '--in', 'app/pagamento.ts',
          '--out', 'app/login.ts', '--next', 'reproduzir o erro do cartao'];
        const refused = run(root, args, { now: D22, expect: 1 });
        assert.match(refused.stderr,
          /cell "Hotfix Pagamento" \(hotfix-pagamento\) is UNPLANNED in operation "Ir ao ar"/);
        assert.match(refused.stderr, /re-run with --amend-pack --confirm/);
        assert.equal(readCellText(root, 'hotfix-pagamento'), null);
        run(root, [...args, '--amend-pack', '--confirm'], { now: D22 });
        assert.match(opText(root), /\*\*Planned cells:\*\*.*, hotfix-pagamento$/m);
        assert.match(readState(root, 'log'),
          /\*\*Pack amendment:\*\* \+cell hotfix-pagamento, approved by human/);
        assert.equal(opFragment(root, FINGERPRINT), frozen.fingerprint,
          'the amendment widened the pack and left the finish line alone');
        assert.equal(opFragment(root, FINISH_FIELD), frozen.finish);
        run(root, ['check'], { now: D22 });
      });

    await t.test('3 · closures with spend, discoveries parked, and the finish line intact',
      () => {
        const before = parked();
        const done = run(root, ['complete', 'Login', '--facts', 'login em producao',
          '--confirm', '--spend', '2.1k tokens', '--build', 'green'], { now: D22 });
        assert.match(done.stdout, /Completed "Login" · ✔/);
        assert.match(cellText(root, 'login'), /\*\*Status:\*\* ✔/);
        assert.match(cellText(root, 'login'), /\*\*Spend:\*\* 2\.1k tokens/);
        for (const idea of ['trocar o smtp por um provedor com dominio proprio',
          'a matricula 404 pede um texto escrito pelo cliente']) {
          assert.match(run(root, ['park', idea], { now: D22 }).stdout,
            new RegExp(`^Parked: ${idea} \\(context: cell `, 'm'));
        }
        assert.equal(parked(), before + 2, 'the parking lot grew by the two discoveries');
        run(root, ['pause', 'Hotfix Pagamento', '--facts', 'erro reproduzido no gateway',
          '--next', 'abrir o ticket', '--spend', '1.4k tokens'], { now: D22 });
        assert.equal(opFragment(root, FINISH_FIELD), frozen.finish, 'operation file');
        assert.equal(opFragment(root, FINGERPRINT), frozen.fingerprint, 'operation file');
        assert.equal(CURRENT_FINISH.exec(readState(root, 'current'))?.[0], frozen.current,
          'and the CURRENT-CELL header says exactly what it said at opening');
        run(root, ['check'], { now: D22 });
      });

    await t.test('4 · a stale worker: a cell whose Base commit is not an ancestor of HEAD',
      () => {
        git(root, ['switch', '-q', '-c', 'side']);
        git(root, ['commit', '-q', '--allow-empty', '-m', 'worker commit']);
        const side = git(root, ['rev-parse', 'HEAD']) ?? '';
        openCell(root, { name: 'Emails', area: 'mail', in: 'app/emails.ts', out: 'app/login.ts' },
          { now: D23 });
        assert.match(cellText(root, 'emails'), new RegExp(`\\*\\*Base commit:\\*\\* ${side}`));
        run(root, ['check'], { now: D23 });
        git(root, ['switch', '-q', 'main']);
        const stale = run(root, ['check'], { now: D23, expect: 2 });
        assert.match(stale.stderr, /\[cell-stale\] cell stale: "Emails" is 🔵 in operation /);
        assert.match(stale.stderr, new RegExp(`but its Base commit ${side} is not an ancestor `
          + `of HEAD ${head}$`, 'm'));
        git(root, ['switch', '-q', 'side']);
        run(root, ['check'], { now: D23 }); // the worker rebased: the finding is gone
      });

    await t.test('5 · a deterministic map, op complete refused while a cell is 🔵, then ✔',
      () => {
        for (const name of ['maps/one.svg', 'maps/two.svg']) {
          run(root, ['report', '--out', name], { now: D23 });
        }
        assert.equal(readFileSync(join(root, 'maps', 'one.svg'), 'utf8'),
          readFileSync(join(root, 'maps', 'two.svg'), 'utf8'), 'the same vault, the same bytes');
        const early = run(root, ['op', 'complete', '--facts', 'no ar', '--confirm'],
          { now: D23, expect: 3 });
        assert.match(early.stderr, /is 🔵 in operation "Ir ao ar" — pause the cell first, then /);
        assert.match(opText(root), /\*\*Status:\*\* 🔵/, 'the refusal closed nothing');
        run(root, ['complete', 'Publicacao VPS', '--facts', 'no ar desde as 11h', '--confirm',
          '--spend', '5.0k tokens'], { now: D23 });
        run(root, ['complete', 'Matricula 404', '--facts', '404 com o texto do cliente',
          '--confirm', '--spend', '2.6k tokens'], { now: D23 });
        run(root, ['pause', 'Emails', '--facts', 'smtp configurado', '--next', 'testar o envio',
          '--spend', '0.9k tokens'], { now: D23 });
        const out = run(root, ['op', 'complete', '--facts', 'quatro itens no ar, um pausado',
          '--confirm'], { now: D23 });
        assert.match(out.stdout, /Completed operation "Ir ao ar" · ✔/);
        assert.match(out.stdout,
          new RegExp(`Fingerprint unchanged: ${frozen.fingerprint.split(' ').pop()}`));
        assert.match(opText(root), /\*\*Status:\*\* ✔/);
        run(root, ['check'], { now: D23 });
        assert.equal(opFragment(root, FINISH_FIELD), frozen.finish,
          'finish line fingerprint unchanged from opening to closing');
        assert.equal(opFragment(root, FINGERPRINT), frozen.fingerprint,
          'finish line fingerprint unchanged from opening to closing');
      });
  });
