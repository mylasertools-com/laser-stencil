import { mkdir, readFile, writeFile } from 'node:fs/promises';
import opentype from 'opentype.js';
import { findIslands, stencilSvg, toPathData } from '../dist/index.js';

export async function textSvg(fontFile, text, size = 40) {
  const font = opentype.parse(
    (await readFile(new URL(`../demo/fonts/${fontFile}`, import.meta.url))).buffer,
  );
  const path = font.getPath(text, 0, 0, size);
  const box = path.getBoundingBox();
  const pad = 4;
  const w = box.x2 - box.x1 + pad * 2,
    h = box.y2 - box.y1 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="${(box.x1 - pad).toFixed(3)} ${(box.y1 - pad).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}"><path d="${path.toPathData(3)}"/></svg>`;
}

export function preview(source, result, islands) {
  const vb = /viewBox="([^"]+)"/.exec(result.svg)[1].split(' ').map(Number);
  const gap = 4,
    w = vb[2],
    h = vb[3];
  const before = /<path d="([^"]+)"/.exec(source)?.[1];
  const origin = /viewBox="([^"]+)"/.exec(source)[1].split(' ').map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * 4).toFixed(0)}" height="${((h * 2 + gap) * 4).toFixed(0)}" viewBox="${vb[0]} ${vb[1]} ${w} ${h * 2 + gap}">
<rect x="${vb[0]}" y="${vb[1]}" width="${w}" height="${h * 2 + gap}" fill="#f4efe6"/>
<path d="${before}" fill="#2b2b2b" transform="translate(${-origin[0]} ${-origin[1]})"/>
<path d="${toPathData(islands.map((i) => i.polygon))}" fill="#d9483b"/>
<g transform="translate(0 ${h + gap})"><path d="${toPathData(result.polygons)}" fill="#2b2b2b" fill-rule="evenodd"/>
${result.bridges.map((b) => `<path d="${toPathData(b.polygons)}" fill="#3a9d6a"/>`).join('')}</g>
</svg>`;
}

const samples = [
  ['ArchivoBlack-Regular.ttf', 'BOARD'],
  ['AlfaSlabOne-Regular.ttf', 'Rope & Anchor'],
  ['RubikMonoOne-Regular.ttf', 'QR8%@'],
  ['ArchivoBlack-Regular.ttf', 'abdegopq'],
];
if (process.argv[1]?.endsWith('examples.mjs')) {
  const previews = process.argv[2];
  if (previews) await mkdir(previews, { recursive: true });
  for (const [i, [font, text]] of samples.entries()) {
    const svg = await textSvg(font, text);
    const t = performance.now();
    const result = stencilSvg(svg, { frame: 6 });
    const ms = performance.now() - t;
    console.log(
      text,
      `${result.islands.length} islands, ${result.bridges.length} bridges, ${ms.toFixed(0)} ms`,
      result.issues.map((x) => x.code),
    );
    if (previews)
      await writeFile(`${previews}/preview-${i}.svg`, preview(svg, result, findIslands(svg)));
  }
  const svg = await textSvg('ArchivoBlack-Regular.ttf', 'GOOD VIBES');
  await writeFile(new URL('../examples/good-vibes.svg', import.meta.url), svg + '\n');
  await writeFile(
    new URL('../examples/good-vibes-stencil.svg', import.meta.url),
    stencilSvg(svg, { frame: 6 }).svg,
  );
  await writeFile(
    new URL('../examples/ring.svg', import.meta.url),
    '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60"><path fill-rule="evenodd" d="M30 5A25 25 0 1 1 29.99 5ZM30 15A15 15 0 1 0 30.01 15Z"/></svg>\n',
  );
}
