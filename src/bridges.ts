import {
  booleanOpWithPolyTree,
  ClipType,
  difference,
  FillRule,
  intersect,
  PolyTree64,
  union,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import {
  StencilError,
  type Bounds,
  type Bridge,
  type Direction,
  type Island,
  type Issue,
  type Point,
  type PolygonStencilResult,
  type StencilOptions,
} from './types.js';

/** 0.1 µm integer grid for Clipper. */
const SCALE = 10_000;
const EXTEND = 0.1;
const AUTO = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];

export interface Group {
  contours: Point[][];
  fillRule: 'nonzero' | 'evenodd';
}

const toPath = (p: readonly Point[]): Path64 =>
  p.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));
const fromPath = (p: Path64): Point[] => p.map((q) => [q.x / SCALE, q.y / SCALE] as const);
const rule = (r: Group['fillRule']) => (r === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero);

export function area(p: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
export function boundsOf(points: readonly Point[]): Bounds {
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const p of points) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    r = Math.max(r, p[0]);
    b = Math.max(b, p[1]);
  }
  return points.length
    ? { x, y, width: r - x, height: b - y }
    : { x: 0, y: 0, width: 0, height: 0 };
}

interface Span {
  a: number;
  b: number;
  ca: number;
  cb: number;
}
interface Candidate {
  s: number;
  lo: number;
  hi: number;
  length: number;
  cost: number;
  other: number;
  anchor: Point;
  center: Point;
  angle: number;
}

/** Contours seen along a bridge axis: u runs along the bridge, v across it. */
class Frame {
  readonly d: Point;
  readonly n: Point;
  readonly u: Float64Array[];
  readonly v: Float64Array[];
  constructor(
    contours: readonly Point[][],
    readonly angle: number,
  ) {
    const t = (angle * Math.PI) / 180;
    this.d = [Math.cos(t), Math.sin(t)];
    this.n = [-Math.sin(t), Math.cos(t)];
    this.u = contours.map((c) => Float64Array.from(c, (p) => p[0] * this.d[0] + p[1] * this.d[1]));
    this.v = contours.map((c) => Float64Array.from(c, (p) => p[0] * this.n[0] + p[1] * this.n[1]));
  }
  world(u: number, v: number): Point {
    return [u * this.d[0] + v * this.n[0], u * this.d[1] + v * this.n[1]];
  }
  spans(s: number): Span[] {
    const hits: Array<{ u: number; c: number }> = [];
    for (let c = 0; c < this.u.length; c++) {
      const us = this.u[c],
        vs = this.v[c],
        len = us.length;
      for (let i = 0; i < len; i++) {
        const j = (i + 1) % len,
          v1 = vs[i],
          v2 = vs[j];
        if (v1 <= s === v2 <= s) continue;
        hits.push({ u: us[i] + ((s - v1) * (us[j] - us[i])) / (v2 - v1), c });
      }
    }
    hits.sort((p, q) => p.u - q.u);
    const out: Span[] = [];
    for (let i = 0; i + 1 < hits.length; i += 2)
      out.push({ a: hits[i].u, b: hits[i + 1].u, ca: hits[i].c, cb: hits[i + 1].c });
    return out;
  }
}

function candidates(frame: Frame, hole: number, width: number): Candidate[] {
  const vs = frame.v[hole];
  let vmin = Infinity,
    vmax = -Infinity;
  for (const v of vs) {
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  const half = (vmax - vmin) / 2,
    mid = vmin + half,
    step = Math.max(width / 4, (vmax - vmin) / 160),
    out: Candidate[] = [];
  const ends = (q: Span) => {
    const onA = q.ca === hole;
    return onA === (q.cb === hole)
      ? undefined
      : { other: onA ? q.cb : q.ca, edge: onA ? q.a : q.b };
  };
  const positions: number[] = [mid];
  for (let k = 1; k * step < half; k++) positions.push(mid - k * step, mid + k * step);
  for (const s of positions) {
    for (const span of frame.spans(s)) {
      const e = ends(span);
      if (!e) continue;
      let lo = span.a,
        hi = span.b,
        length = span.b - span.a,
        ok = true;
      for (const k of [-2, -1, 1, 2]) {
        let best: Span | undefined,
          gap = Infinity;
        for (const q of frame.spans(s + (k * width) / 4)) {
          const f = ends(q);
          if (!f || f.other !== e.other) continue;
          const d = Math.abs(f.edge - e.edge);
          if (d < gap) {
            gap = d;
            best = q;
          }
        }
        if (!best || gap > Math.max(2 * width, length / 2)) {
          ok = false;
          break;
        }
        lo = Math.min(lo, best.a);
        hi = Math.max(hi, best.b);
        length = Math.max(length, best.b - best.a);
      }
      if (!ok) continue;
      const off = half ? (s - mid) / half : 0;
      out.push({
        s,
        lo,
        hi,
        length,
        cost: length * (1 + 0.3 * off * off),
        other: e.other,
        anchor: frame.world(e.edge, s),
        center: frame.world((span.a + span.b) / 2, s),
        angle: frame.angle,
      });
    }
  }
  return out;
}

function gather(contours: Point[][], hole: number, width: number, angles: number[]) {
  return angles
    .flatMap((a) => candidates(new Frame(contours, a), hole, width))
    .sort((a, b) => a.cost - b.cost);
}

function choose(
  contours: Point[][],
  hole: number,
  count: number,
  width: number,
  direction: Direction,
): Candidate[] {
  const preferred = direction === 'vertical' ? [90] : direction === 'horizontal' ? [0] : AUTO;
  const primary = gather(contours, hole, width, preferred);
  let fallback: Candidate[] | undefined;
  const others = () =>
    (fallback ??=
      direction === 'auto'
        ? []
        : gather(
            contours,
            hole,
            width,
            AUTO.filter((a) => !preferred.includes(a)),
          ));
  const first = primary.find((c) => c.other === 0) ?? others().find((c) => c.other === 0);
  if (!first) return [];
  const b = boundsOf(contours[hole]),
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2,
    chosen = [first],
    spread = Math.PI / count - 1e-9;
  const heading = (c: Candidate) => Math.atan2(c.anchor[1] - cy, c.anchor[0] - cx);
  const apart = (x: Candidate, c: Candidate) => {
    const turn = Math.abs(heading(x) - heading(c)) % (2 * Math.PI);
    return (
      Math.min(turn, 2 * Math.PI - turn) >= spread &&
      Math.hypot(x.anchor[0] - c.anchor[0], x.anchor[1] - c.anchor[1]) >= width
    );
  };
  const fill = (list: Candidate[]) => {
    for (const c of list) {
      if (chosen.length >= count) return;
      if (chosen.every((x) => apart(x, c))) chosen.push(c);
    }
  };
  fill(primary.includes(first) ? primary : others());
  return chosen;
}

function bridgeShape(c: Candidate, width: number): Point[] {
  const t = (c.angle * Math.PI) / 180,
    d: Point = [Math.cos(t), Math.sin(t)],
    n: Point = [-Math.sin(t), Math.cos(t)];
  const at = (u: number, v: number): Point => [u * d[0] + v * n[0], u * d[1] + v * n[1]];
  const lo = c.lo - EXTEND,
    hi = c.hi + EXTEND,
    a = c.s - width / 2,
    b = c.s + width / 2;
  return [at(lo, a), at(hi, a), at(hi, b), at(lo, b)];
}

export function validate(options: StencilOptions) {
  const width = options.bridgeWidth ?? 1.5,
    count = options.bridges ?? 2,
    direction = options.direction ?? 'vertical',
    minIslandArea = options.minIslandArea ?? 0,
    tolerance = options.tolerance ?? 0.02;
  if (!Number.isFinite(width) || width <= 0 || width > 100)
    throw new StencilError(
      'INVALID_OPTIONS',
      'bridgeWidth must be greater than 0 and at most 100 mm.',
    );
  if (!Number.isInteger(count) || count < 1 || count > 4)
    throw new StencilError('INVALID_OPTIONS', 'bridges must be an integer from 1 to 4.');
  if (!['vertical', 'horizontal', 'auto'].includes(direction))
    throw new StencilError(
      'INVALID_OPTIONS',
      "direction must be 'vertical', 'horizontal' or 'auto'.",
    );
  if (!Number.isFinite(minIslandArea) || minIslandArea < 0)
    throw new StencilError('INVALID_OPTIONS', 'minIslandArea must be zero or more.');
  if (!Number.isFinite(tolerance) || tolerance < 0.0001 || tolerance > 1)
    throw new StencilError('INVALID_OPTIONS', 'tolerance must be between 0.0001 and 1 mm.');
  return { width, count, direction, minIslandArea, tolerance };
}

export function stencil(
  groups: Group[],
  options: StencilOptions,
  bridging = true,
): PolygonStencilResult {
  const { width, count, direction, minIslandArea } = validate(options);
  let points = 0;
  for (const g of groups)
    for (const c of g.contours) {
      points += c.length;
      for (const p of c)
        if (
          !Number.isFinite(p[0]) ||
          !Number.isFinite(p[1]) ||
          Math.abs(p[0]) > 1e5 ||
          Math.abs(p[1]) > 1e5
        )
          throw new StencilError(
            'NUMERIC_RANGE',
            'Coordinates must be finite and within ±100,000 mm.',
          );
    }
  if (points > 200_000)
    throw new StencilError('COMPLEXITY_LIMIT', 'Input exceeds 200,000 contour points.');
  const merged: Paths64 = [];
  for (const g of groups) {
    const paths = g.contours.filter((c) => c.length >= 3).map(toPath);
    if (paths.length) merged.push(...union(paths, rule(g.fillRule)));
  }
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, merged, null, tree, FillRule.NonZero);
  const islands: Island[] = [],
    bridges: Bridge[] = [],
    issues: Issue[] = [],
    keep: Paths64 = [];
  const visit = (node: PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const outer = node.child(i),
        holes = Array.from({ length: outer.count }, (_, j) => outer.child(j)),
        contours = [outer.polygon ?? [], ...holes.map((h) => h.polygon ?? [])].map(fromPath),
        material = [outer.polygon ?? [], ...holes.map((h) => h.polygon ?? [])];
      for (let h = 1; h < contours.length; h++) {
        const polygon = contours[h],
          size = Math.abs(area(polygon)),
          bounds = boundsOf(polygon),
          id = islands.length,
          skipped = size < minIslandArea;
        const island: Island = {
          id,
          area: size,
          bounds,
          center: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
          polygon,
          bridges: 0,
          skipped,
        };
        islands.push(island);
        if (!bridging || skipped) continue;
        const chosen = choose(contours, h, count, width, direction);
        if (!chosen.length) {
          issues.push({
            code: 'UNBRIDGED_ISLAND',
            island: id,
            message: `Island ${id} has no straight crossing to the surrounding sheet and will fall out.`,
          });
          continue;
        }
        if (chosen.length < count)
          issues.push({
            code: 'FEWER_BRIDGES',
            island: id,
            message: `Island ${id} has room for ${chosen.length} of ${count} bridges.`,
          });
        for (const c of chosen) {
          const kept = intersect([toPath(bridgeShape(c, width))], material, FillRule.EvenOdd);
          if (!kept.length) continue;
          keep.push(...kept);
          island.bridges++;
          bridges.push({
            island: id,
            center: c.center,
            angle: c.angle,
            length: c.length,
            width,
            polygons: kept.map(fromPath),
          });
        }
      }
      for (const h of holes) visit(h);
    }
  };
  visit(tree);
  const cut = keep.length
    ? difference(union(merged, FillRule.NonZero), union(keep, FillRule.NonZero), FillRule.NonZero)
    : union(merged, FillRule.NonZero);
  return { polygons: cut.map(fromPath), islands, bridges, issues };
}
