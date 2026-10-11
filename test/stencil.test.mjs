import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { findIslands, stencilPolygons, stencilSvg, StencilError } from '../dist/index.js';

const svg = (body, size = 60) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">${body}</svg>`;
const ring = svg(
  '<path fill-rule="evenodd" d="M30 5A25 25 0 1 1 29.99 5ZM30 15A15 15 0 1 0 30.01 15Z"/>',
);
const square = (x, y, s) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];
const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) < e, `${a} should be near ${b}`);

test('a ring keeps its middle with a bridge above and below', () => {
  const r = stencilSvg(ring);
  assert.equal(r.islands.length, 1);
  assert.equal(r.islands[0].bridges, 2);
  assert.deepEqual(r.issues, []);
  const [top, bottom] = [...r.bridges].sort((a, b) => a.center[1] - b.center[1]);
  near(top.center[0], 30);
  near(bottom.center[0], 30);
  near(top.length, 10, 0.1);
  assert.equal(top.angle, 90);
  assert.ok(top.center[1] < 15 && bottom.center[1] > 45);
});

test('the bridged result has no enclosed pieces left', () => {
  const r = stencilSvg(ring);
  assert.equal(stencilPolygons(r.polygons, { fillRule: 'evenodd' }).islands.length, 0);
});

test('outline-only artwork is read as nested even-odd outlines', () => {
  const outline = svg(
    '<circle cx="30" cy="30" r="25" fill="none" stroke="red"/><circle cx="30" cy="30" r="15" fill="none" stroke="red"/>',
  );
  assert.equal(findIslands(outline).length, 1);
  assert.equal(stencilSvg(outline).bridges.length, 2);
});

test('horizontal bridges cross the sides', () => {
  const r = stencilSvg(ring, { direction: 'horizontal' });
  const xs = r.bridges.map((b) => b.center[0]).sort((a, b) => a - b);
  assert.ok(xs[0] < 15 && xs[1] > 45);
  for (const b of r.bridges) assert.equal(b.angle, 0);
});

test('one bridge, or up to four, per island', () => {
  assert.equal(stencilSvg(ring, { bridges: 1 }).bridges.length, 1);
  const four = stencilSvg(ring, { bridges: 4, direction: 'auto' });
  assert.equal(four.bridges.length, 4);
  assert.deepEqual(four.issues, []);
});

test('bridge width is respected', () => {
  const r = stencilSvg(ring, { bridgeWidth: 3 });
  for (const b of r.bridges) {
    const xs = b.polygons.flat().map((p) => p[0]);
    near(Math.max(...xs) - Math.min(...xs), 3, 0.05);
  }
});

test('a figure eight bridges each counter to the outside first', () => {
  const eight = stencilPolygons([square(0, 0, 30), square(10, 4, 10), square(10, 16, 10)], {
    fillRule: 'evenodd',
  });
  assert.equal(eight.islands.length, 2);
  assert.ok(eight.islands.every((i) => i.bridges === 2));
  assert.deepEqual(eight.issues, []);
});

test('nested islands inside a counter are bridged to their own parent', () => {
  const r = stencilPolygons(
    [square(0, 0, 50), square(5, 5, 40), square(15, 15, 20), square(20, 20, 10)],
    { fillRule: 'evenodd' },
  );
  assert.equal(r.islands.length, 2);
  const inner = r.islands.find((i) => i.area < 200).id;
  for (const b of r.bridges.filter((b) => b.island === inner)) {
    const ys = b.polygons.flat().map((p) => p[1]);
    assert.ok(Math.min(...ys) >= 14.8 && Math.max(...ys) <= 35.2);
  }
  assert.equal(stencilPolygons(r.polygons, { fillRule: 'evenodd' }).islands.length, 0);
});

test('tiny islands can be left to fall out', () => {
  const r = stencilPolygons([square(0, 0, 20), square(9, 9, 2)], {
    fillRule: 'evenodd',
    minIslandArea: 5,
  });
  assert.equal(r.islands.length, 1);
  assert.equal(r.islands[0].skipped, true);
  assert.equal(r.bridges.length, 0);
});

test('an island too small for the bridge is reported, not hidden', () => {
  const r = stencilPolygons([square(0, 0, 20), square(9.5, 9.5, 1)], {
    fillRule: 'evenodd',
    bridgeWidth: 3,
  });
  assert.equal(r.issues[0].code, 'UNBRIDGED_ISLAND');
  assert.equal(r.islands[0].bridges, 0);
});

test('shapes without islands pass through unchanged', () => {
  const r = stencilSvg(svg('<rect x="10" y="10" width="20" height="5"/>'));
  assert.equal(r.islands.length, 0);
  assert.equal(r.polygons.length, 1);
  assert.match(r.svg, /width="60mm"/);
});

test('open paths are ignored and reported', () => {
  const r = stencilSvg(
    svg(
      '<rect x="10" y="10" width="20" height="5"/><path d="M0 0L10 10" stroke="red" fill="none"/>',
    ),
  );
  assert.equal(r.issues[0].code, 'OPEN_PATH_IGNORED');
});

test('frame adds a sheet outline around the design', () => {
  const r = stencilSvg(ring, { frame: 10 });
  near(r.width, 70, 0.1);
  near(r.height, 70, 0.1);
  assert.match(r.svg, /viewBox="-5 -4\.9\d+ 69\.9\d+ 69\.9\d+"/);
  assert.equal((r.svg.match(/<path /g) ?? []).length, 2);
});

test('fill output writes filled geometry', () => {
  assert.match(stencilSvg(ring, { output: 'fill' }).svg, /fill="#000000" stroke="none"/);
  assert.match(stencilSvg(ring).svg, /fill="none" stroke="#000000"/);
});

test('transforms and physical units are applied', () => {
  const r = stencilSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="6cm" height="6cm" viewBox="0 0 600 600"><g transform="scale(10)"><path fill-rule="evenodd" d="M30 5A25 25 0 1 1 29.99 5ZM30 15A15 15 0 1 0 30.01 15Z"/></g></svg>',
  );
  near(r.islands[0].bounds.width, 30, 0.1);
});

test('invalid input and options throw StencilError', () => {
  assert.throws(() => stencilSvg('<svg'), StencilError);
  assert.throws(() => stencilSvg(svg('<text x="1" y="1"/>')), /Convert text/);
  assert.throws(() => stencilSvg(ring, { bridgeWidth: 0 }), /bridgeWidth/);
  assert.throws(() => stencilSvg(ring, { bridges: 5 }), /bridges/);
  assert.throws(() => stencilSvg(ring, { direction: 'diagonal' }), /direction/);
  assert.throws(
    () =>
      stencilPolygons([
        [
          [0, 0],
          [Infinity, 0],
          [1, 1],
        ],
      ]),
    /finite/,
  );
});

test('CommonJS build works', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.equal(cjs.stencilSvg(ring).bridges.length, 2);
});
