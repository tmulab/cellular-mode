// The probe retries ONE symptom (exit 0 with no output, seen from a Windows app-execution alias
// under load). The retry must never turn a real silence into a "present" toolchain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { probe } from './toolchains.mjs';

test('probe · a program that really prints nothing is still reported absent after the retries', () => {
  const result = probe([process.execPath, '-e', '']);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason.endsWith('printed no version'), 'the same honest reason');
});

test('probe · a program that prints its version is present on the first answer', () => {
  const result = probe([process.execPath, '--version']);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.version.startsWith('v'));
});

test('probe · a non-zero exit is not retried into success', () => {
  const result = probe([process.execPath, '-e', 'console.log("v9"); process.exit(3)']);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason.endsWith('exited 3'));
});
