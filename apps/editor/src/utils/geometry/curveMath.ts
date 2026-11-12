import { Bezier } from 'bezier-js';
import { getGeometryPaperScope } from './pathfinder';
import type { Point2D } from './pencilFitter';

export type { Point2D };

export interface CurveBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ClosestPointResult {
  x: number;
  y: number;
  distance: number;
  t: number;
  point: { x: number; y: number };
  segmentIndex?: number;
}

export type SplitCubicResult = [Point2D[], Point2D[]] & {
  left: Point2D[];
  right: Point2D[];
};

/**
 * Splits a cubic Bézier curve at parameter t (0 to 1) using de Casteljau's algorithm via bezier-js.
 *
 * @param p0 Start point
 * @param p1 First control point
 * @param p2 Second control point
 * @param p3 End point
 * @param t Parameter at which to split (0 <= t <= 1)
 * @returns Both left and right cubic Bézier control points (accessible via destructuring or .left / .right)
 */
export function splitCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number
): SplitCubicResult {
  const clampedT = Math.max(0, Math.min(1, t));
  const b = new Bezier(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  const split = b.split(clampedT);

  const left: Point2D[] = [
    { x: split.left.points[0].x, y: split.left.points[0].y },
    { x: split.left.points[1].x, y: split.left.points[1].y },
    { x: split.left.points[2].x, y: split.left.points[2].y },
    { x: split.left.points[3].x, y: split.left.points[3].y },
  ];

  const right: Point2D[] = [
    { x: split.right.points[0].x, y: split.right.points[0].y },
    { x: split.right.points[1].x, y: split.right.points[1].y },
    { x: split.right.points[2].x, y: split.right.points[2].y },
    { x: split.right.points[3].x, y: split.right.points[3].y },
  ];

  return Object.assign([left, right], { left, right }) as SplitCubicResult;
}

/**
 * Helper to convert an SVG path string into an array of Bezier curve objects using Paper.js parsing.
 */
function extractBezierCurvesFromPath(d: string): Bezier[] {
  const pathStr = (d || '').trim();
  if (!pathStr) return [];

  const scope = getGeometryPaperScope();
  scope.activate();

  try {
    const item = new scope.CompoundPath(pathStr);
    const result: Bezier[] = [];

    // Check if the item contains curves
    if (item.curves && item.curves.length > 0) {
      for (const c of item.curves) {
        const p0x = c.point1.x;
        const p0y = c.point1.y;
        const cp1x = c.point1.x + c.handle1.x;
        const cp1y = c.point1.y + c.handle1.y;
        const cp2x = c.point2.x + c.handle2.x;
        const cp2y = c.point2.y + c.handle2.y;
        const p1x = c.point2.x;
        const p1y = c.point2.y;

        result.push(new Bezier(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p1x, p1y));
      }
    }

    return result;
  } catch {
    return [];
  } finally {
    try {
      scope.project?.clear();
    } catch {
      // ignore
    }
  }
}

/**
 * Calculates true analytical extrema for tight bounding boxes of arbitrary SVG paths.
 * Unlike naive control-point bounding boxes, this accurately solves the 1st derivatives (extrema)
 * of cubic Béziers to find the actual minimum and maximum bounds.
 */
export function getPreciseCurveBounds(d: string): CurveBounds {
  const pathStr = (d || '').trim();
  const emptyBounds: CurveBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  };

  if (!pathStr) return emptyBounds;

  const curves = extractBezierCurvesFromPath(pathStr);
  if (curves.length === 0) {
    // Fallback: try parsing single point M x y
    const mMatch = pathStr.match(/[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
    if (mMatch) {
      const x = parseFloat(mMatch[1]);
      const y = parseFloat(mMatch[2]);
      return { x, y, width: 0, height: 0, minX: x, minY: y, maxX: x, maxY: y };
    }
    return emptyBounds;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const curve of curves) {
    const bbox = curve.bbox();
    if (bbox.x.min < minX) minX = bbox.x.min;
    if (bbox.x.max > maxX) maxX = bbox.x.max;
    if (bbox.y.min < minY) minY = bbox.y.min;
    if (bbox.y.max > maxY) maxY = bbox.y.max;
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return emptyBounds;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    minX,
    minY,
    maxX,
    maxY,
  };
}

/**
 * Finds the closest point on an arbitrary SVG curve/path to a given query point.
 * Returns the nearest coordinates, distance, and parameter t.
 */
export function findClosestPointOnCurve(
  d: string,
  point: { x: number; y: number }
): ClosestPointResult {
  const defaultRes: ClosestPointResult = {
    x: point.x,
    y: point.y,
    distance: 0,
    t: 0,
    point: { x: point.x, y: point.y },
  };

  const curves = extractBezierCurvesFromPath(d);
  if (curves.length === 0) {
    return defaultRes;
  }

  let minDistance = Infinity;
  let bestResult: ClosestPointResult = defaultRes;

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const proj = curve.project(point);
    const dist = typeof proj.d === 'number' ? proj.d : Math.hypot(proj.x - point.x, proj.y - point.y);

    if (dist < minDistance) {
      minDistance = dist;
      bestResult = {
        x: proj.x,
        y: proj.y,
        distance: dist,
        t: typeof proj.t === 'number' ? proj.t : 0,
        point: { x: proj.x, y: proj.y },
        segmentIndex: i,
      };
    }
  }

  return bestResult;
}
