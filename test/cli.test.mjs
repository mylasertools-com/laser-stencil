import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'laser-stencil-'));
const input = join(dir, 'ring.svg');
writeFileSync(
  input,
  '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60"><path fill-rule="evenodd" d="M30 5A25 25 0 1 1 29.99 5ZM30 15A15 15 0 1 0 30.01 15Z"/></svg>',
);
const run = (...args) =>
  spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });

test('writes a bridged SVG', () => {
  const out = join(dir, 'out.svg');
  const r = run(input, '-o', out, '--width', '2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /1 island\(s\) held by 2 bridge\(s\)/);
  assert.match(readFileSync(out, 'utf8'), /^<svg/);
});

test('reports islands as JSON', () => {
  const r = run(input, '--islands', '--json');
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.islands.length, 1);
  assert.equal(report.islands[0].polygon, undefined);
});

test('rejects unknown options', () => {
  const r = run(input, '--nope');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});
