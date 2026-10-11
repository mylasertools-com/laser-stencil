export type Point = readonly [number, number];
export type Matrix = readonly [number, number, number, number, number, number];
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Direction = 'vertical' | 'horizontal' | 'auto';
export interface StencilOptions {
  /** Bridge width in mm. Default 1.5. */
  bridgeWidth?: number;
  /** Bridges per island, 1 to 4. Default 2. */
  bridges?: number;
  /** Preferred bridge direction. Other angles are tried only when this one cannot hold an island. Default 'vertical'. */
  direction?: Direction;
  /** Islands smaller than this area in mm² are left to fall out. Default 0. */
  minIslandArea?: number;
  /** Curve flattening tolerance in mm. Default 0.02. */
  tolerance?: number;
}
export interface SvgStencilOptions extends StencilOptions {
  /** Add a rectangular sheet outline this many mm outside the design. Omit for none. */
  frame?: number;
  /** 'cut' writes hairline outlines; 'fill' writes a filled preview. Default 'cut'. */
  output?: 'cut' | 'fill';
  /** Decimal places for output coordinates. Default 3, range 1 to 8. */
  precision?: number;
}
export interface PolygonStencilOptions extends StencilOptions {
  /** How overlapping or nested input contours combine. Default 'nonzero'. */
  fillRule?: 'nonzero' | 'evenodd';
}
export interface Island {
  id: number;
  /** Area in mm². */
  area: number;
  bounds: Bounds;
  center: Point;
  /** The island's outline in mm. */
  polygon: Point[];
  bridges: number;
  skipped: boolean;
}
export interface Bridge {
  island: number;
  /** Middle of the crossing, in mm. */
  center: Point;
  /** Direction of the bridge axis in degrees: 90 is vertical, 0 is horizontal. */
  angle: number;
  /** Longest crossing under the bridge, in mm. */
  length: number;
  width: number;
  /** The material the bridge keeps, in mm. */
  polygons: Point[][];
}
export interface Issue {
  code: 'UNBRIDGED_ISLAND' | 'FEWER_BRIDGES' | 'OPEN_PATH_IGNORED';
  island?: number;
  message: string;
}
export interface PolygonStencilResult {
  /** Cut contours in mm after bridging. Outer and hole orientation alternate. */
  polygons: Point[][];
  islands: Island[];
  bridges: Bridge[];
  issues: Issue[];
}
export interface StencilResult extends PolygonStencilResult {
  svg: string;
  width: number;
  height: number;
  unit: 'mm';
}
export class StencilError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StencilError';
  }
}
