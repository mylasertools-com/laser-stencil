import { stencil, validate, boundsOf, type Group } from './bridges.js';
import { format, mul } from './matrix.js';
import { flatten, isClosed, transformPath } from './path.js';
import { readSvg } from './svg.js';
import {
  StencilError,
  type Island,
  type Point,
  type PolygonStencilOptions,
  type PolygonStencilResult,
  type StencilOptions,
  type StencilResult,
  type SvgStencilOptions,
} from './types.js';

export * from './types.js';

function groupsFromSvg(svg: string, tolerance: number) {
  const document = readSvg(svg),
    outlines: Point[][] = [],
    groups: Group[] = [];
  let open = 0;
  for (const shape of document.shapes) {
    const filled = shape.fill !== 'none' && shape.fill !== 'transparent';
    if (!filled && shape.stroke === 'none') continue;
    const matrix = mul(document.viewport, shape.matrix),
      contours: Point[][] = [];
    for (const path of shape.paths) {
      if (!isClosed(path)) {
        open++;
        continue;
      }
      const polygon = flatten(transformPath(path, matrix), tolerance);
      if (polygon.length >= 3) contours.push(polygon);
    }
    if (filled) groups.push({ contours, fillRule: shape.fillRule });
    else outlines.push(...contours);
  }
  // Outline-only artwork is how laser files arrive: nested outlines alternate solid and hole.
  if (outlines.length) groups.push({ contours: outlines, fillRule: 'evenodd' });
  return { document, groups, open };
}

/** Bridge closed contours given in millimetres. */
export function stencilPolygons(
  contours: readonly (readonly Point[])[],
  options: PolygonStencilOptions = {},
): PolygonStencilResult {
  const fillRule = options.fillRule ?? 'nonzero';
  if (fillRule !== 'nonzero' && fillRule !== 'evenodd')
    throw new StencilError('INVALID_OPTIONS', "fillRule must be 'nonzero' or 'evenodd'.");
  return stencil([{ contours: contours.map((c) => [...c]), fillRule }], options);
}

/** List the pieces that would fall out, without changing anything. */
export function findIslands(
  svg: string,
  options: Pick<StencilOptions, 'tolerance' | 'minIslandArea'> = {},
): Island[] {
  const { tolerance } = validate(options);
  return stencil(groupsFromSvg(svg, tolerance).groups, options, false).islands;
}

export function toPathData(polygons: readonly (readonly Point[])[], precision = 3): string {
  return polygons
    .filter((p) => p.length >= 3)
    .map(
      (p) =>
        'M' + p.map(([x, y]) => `${format(x, precision)} ${format(y, precision)}`).join('L') + 'Z',
    )
    .join('');
}

/** Add bridges to an SVG so enclosed pieces stay attached to the stencil sheet. */
export function stencilSvg(svg: string, options: SvgStencilOptions = {}): StencilResult {
  const { tolerance } = validate(options),
    precision = options.precision ?? 3,
    output = options.output ?? 'cut',
    frame = options.frame;
  if (!Number.isInteger(precision) || precision < 1 || precision > 8)
    throw new StencilError('INVALID_OPTIONS', 'precision must be an integer from 1 to 8.');
  if (output !== 'cut' && output !== 'fill')
    throw new StencilError('INVALID_OPTIONS', "output must be 'cut' or 'fill'.");
  if (frame !== undefined && (!Number.isFinite(frame) || frame < 0 || frame > 1000))
    throw new StencilError('INVALID_OPTIONS', 'frame must be between 0 and 1000 mm.');
  const { document, groups, open } = groupsFromSvg(svg, tolerance);
  const result = stencil(groups, options);
  if (open)
    result.issues.push({
      code: 'OPEN_PATH_IGNORED',
      message: `${open} open path${open === 1 ? ' was' : 's were'} ignored. Close them to include them in the stencil.`,
    });
  let box = { x: 0, y: 0, width: document.width, height: document.height };
  let sheet = '';
  if (frame !== undefined) {
    const b = boundsOf(result.polygons.flat());
    box = {
      x: b.x - frame,
      y: b.y - frame,
      width: b.width + 2 * frame,
      height: b.height + 2 * frame,
    };
    sheet = toPathData(
      [
        [
          [box.x, box.y],
          [box.x + box.width, box.y],
          [box.x + box.width, box.y + box.height],
          [box.x, box.y + box.height],
        ],
      ],
      precision,
    );
  }
  const f = (n: number) => format(n, precision);
  const style =
    output === 'cut'
      ? 'fill="none" stroke="#000000" stroke-width="0.1"'
      : 'fill="#000000" stroke="none"';
  const body = [
    sheet && `  <path d="${sheet}" fill="none" stroke="#000000" stroke-width="0.1"/>`,
    `  <path d="${toPathData(result.polygons, precision)}" fill-rule="evenodd" ${style}/>`,
  ].filter(Boolean);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(box.width)}mm" height="${f(box.height)}mm" viewBox="${f(box.x)} ${f(box.y)} ${f(box.width)} ${f(box.height)}">`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
  return { ...result, svg: out, width: box.width, height: box.height, unit: 'mm' };
}
