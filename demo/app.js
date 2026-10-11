import { stencilSvg, toPathData } from '../dist/index.js';
import opentype from './vendor/opentype.js';

const $ = (id) => document.getElementById(id);
const state = {
  text: 'GOOD VIBES',
  font: 'ArchivoBlack-Regular.ttf',
  size: 40,
  width: 1.5,
  bridges: 2,
  direction: 'vertical',
  margin: 8,
  view: 'after',
  highlight: true,
  file: null,
};
const fonts = new Map();
let latest = null,
  token = 0;

async function loadFont(name) {
  if (!fonts.has(name))
    fonts.set(
      name,
      fetch(`./fonts/${name}`)
        .then((r) => r.arrayBuffer())
        .then((b) => opentype.parse(b)),
    );
  return fonts.get(name);
}

async function sourceSvg() {
  if (state.file) return state.file.svg;
  const font = await loadFont(state.font);
  const text = state.text.trim() || ' ';
  const path = font.getPath(text, 0, 0, state.size);
  const box = path.getBoundingBox();
  const w = Math.max(box.x2 - box.x1, 1),
    h = Math.max(box.y2 - box.y1, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${box.x1} ${box.y1} ${w} ${h}"><path d="${path.toPathData(3)}"/></svg>`;
}

function bounds(polygons) {
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const p of polygons.flat()) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    r = Math.max(r, p[0]);
    b = Math.max(b, p[1]);
  }
  return Number.isFinite(x) ? { x, y, w: r - x, h: b - y } : { x: 0, y: 0, w: 10, h: 10 };
}

const options = () => ({
  bridgeWidth: state.width,
  bridges: state.bridges,
  direction: state.direction,
  frame: state.margin,
});

function rect(b) {
  return `M${b.x} ${b.y}H${b.x + b.w}V${b.y + b.h}H${b.x}Z`;
}

function draw() {
  if (!latest) return;
  const { before, after, ms } = latest;
  const box = bounds(before.polygons);
  const m = state.margin;
  const sheet = { x: box.x - m, y: box.y - m, w: box.w + 2 * m, h: box.h + 2 * m };
  const pad = Math.max(sheet.w, sheet.h) * 0.03;
  const view = `${sheet.x - pad} ${sheet.y - pad} ${sheet.w + 2 * pad} ${sheet.h + 2 * pad}`;
  let body;
  if (state.view === 'before') {
    const pieces = before.islands
      .map(
        (island, i) =>
          `<path class="piece" style="--i:${i};--r:${((i * 47) % 50) - 25}deg" d="${toPathData([island.polygon])}"/>`,
      )
      .join('');
    body = `<path class="sheet" fill-rule="evenodd" d="${rect(sheet)}${toPathData(before.polygons)}"/><g>${pieces}</g>`;
  } else {
    const bridges = state.highlight
      ? after.bridges.map((b) => `<path class="bridge" d="${toPathData(b.polygons)}"/>`).join('')
      : '';
    body = `<path class="sheet" fill-rule="evenodd" d="${rect(sheet)}${toPathData(after.polygons)}"/>${bridges}`;
  }
  $('stage').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" class="${state.view === 'before' ? 'falling' : ''}" style="--drop:${sheet.h * 1.3}px" role="img" aria-label="${state.view === 'before' ? 'Stencil without bridges; enclosed pieces fall out' : 'Stencil with bridges'}">${body}</svg>`;
  $('stage')
    .querySelectorAll('.piece')
    .forEach((p) => (p.style.animationName = 'fall'));
  $('stat-islands').textContent = String(after.islands.length);
  $('stat-bridges').textContent = String(after.bridges.length);
  $('stat-size').textContent = `${sheet.w.toFixed(0)} × ${sheet.h.toFixed(0)}`;
  $('stat-time').textContent = ms.toFixed(0);
  $('issues').replaceChildren(
    ...after.issues.map((i) =>
      Object.assign(document.createElement('li'), { textContent: i.message }),
    ),
  );
}

async function update() {
  const mine = ++token;
  try {
    const svg = await sourceSvg();
    if (mine !== token) return;
    const t = performance.now();
    const after = stencilSvg(svg, options());
    const ms = performance.now() - t;
    const before = stencilSvg(svg, { minIslandArea: 1e12, frame: state.margin });
    latest = { svg, before, after, ms };
    draw();
  } catch (error) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.color = '#f4ead8';
    p.textContent = String(error.message ?? error);
    $('stage').replaceChildren(p);
    latest = null;
  }
  $('snippet').textContent = `import { stencilSvg } from '@mylasertools/laser-stencil';

const { svg, islands, bridges } = stencilSvg(source, {
  bridgeWidth: ${state.width},
  bridges: ${state.bridges},
  direction: '${state.direction}',
  frame: ${state.margin},
});`;
}

function segmented(id, key, parse = (v) => v) {
  $(id).addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    set({ [key]: parse(button.dataset.value) });
  });
}

function sync() {
  for (const [id, key] of [
    ['bridges', 'bridges'],
    ['direction', 'direction'],
    ['view', 'view'],
  ])
    $(id)
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('active', b.dataset.value === String(state[key])));
  $('text').value = state.text;
  $('font').value = state.font;
  $('size').value = state.size;
  $('width').value = state.width;
  $('margin').value = state.margin;
  $('highlight').checked = state.highlight;
  $('size-label').textContent = `${state.size} mm`;
  $('width-label').textContent = `${state.width} mm`;
  $('margin-label').textContent = `${state.margin} mm`;
  $('text-controls').hidden = !!state.file;
  $('file-controls').hidden = !state.file;
  if (state.file) $('file-name').textContent = state.file.name;
}

const visual = new Set(['view', 'highlight']);
function set(patch) {
  Object.assign(state, patch);
  sync();
  if (Object.keys(patch).every((k) => visual.has(k))) draw();
  else update();
}

$('text').addEventListener('input', (e) => set({ text: e.target.value }));
$('font').addEventListener('change', (e) => set({ font: e.target.value }));
$('size').addEventListener('input', (e) => set({ size: +e.target.value }));
$('width').addEventListener('input', (e) => set({ width: +e.target.value }));
$('margin').addEventListener('input', (e) => set({ margin: +e.target.value }));
$('highlight').addEventListener('change', (e) => set({ highlight: e.target.checked }));
segmented('bridges', 'bridges', Number);
segmented('direction', 'direction');
segmented('view', 'view');
$('file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) return alert('Please choose an SVG under 2 MB.');
  set({ file: { name: file.name, svg: await file.text() } });
  e.target.value = '';
});
$('use-text').addEventListener('click', () => set({ file: null }));
$('download').addEventListener('click', () => {
  if (!latest) return;
  const name = state.file ? state.file.name.replace(/\.svg$/i, '') : state.text.trim() || 'stencil';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([latest.after.svg], { type: 'image/svg+xml' }));
  a.download = `${name.replace(/[^\w-]+/g, '-')}-stencil.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

window.laserStencilDemo = {
  set: (patch) => {
    set(patch);
    return update();
  },
  ready: () => !!latest,
};
sync();
update();
