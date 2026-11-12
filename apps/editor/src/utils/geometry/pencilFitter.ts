import fitCurve from 'fit-curve';

export type PointTuple = [number, number];

export interface Point2D {
  x: number;
  y: number;
}

export interface FitCurveOptions {
  closed?: boolean;
  precision?: number;
}

function formatCoord(val: number, precision = 2): string {
  const rounded = Number(val.toFixed(precision));
  return `${rounded}`;
}

/**
 * Fits cubic Bézier curves to raw 2D point streams using Philip J. Schneider's algorithm (fit-curve).
 *
 * @param points Stream of 2D coordinates
 * @param errorTolerance Maximum distance in pixels between curve and input points (default 2.5)
 * @param options Additional options such as closed path flag or decimal precision
 * @returns Standard SVG path string (`M ... C ... (Z)`)
 */
export function fitPointsToCurve(
  points: Point2D[],
  errorTolerance = 2.5,
  options?: FitCurveOptions
): string {
  if (!points || !Array.isArray(points) || points.length === 0) {
    return '';
  }

  const precision = options?.precision ?? 2;

  // Filter out invalid coordinates and adjacent duplicate points
  const cleanTuples: PointTuple[] = [];
  for (const p of points) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) {
      continue;
    }
    if (cleanTuples.length === 0) {
      cleanTuples.push([p.x, p.y]);
    } else {
      const prev = cleanTuples[cleanTuples.length - 1];
      const dx = p.x - prev[0];
      const dy = p.y - prev[1];
      if (dx * dx + dy * dy > 1e-6) {
        cleanTuples.push([p.x, p.y]);
      }
    }
  }

  if (cleanTuples.length === 0) {
    return '';
  }

  if (cleanTuples.length === 1) {
    return `M ${formatCoord(cleanTuples[0][0], precision)} ${formatCoord(cleanTuples[0][1], precision)}`;
  }

  // Check whether path should be closed
  const first = cleanTuples[0];
  const last = cleanTuples[cleanTuples.length - 1];
  const isEndAtStart =
    cleanTuples.length > 2 && Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-4;
  const isClosed = options?.closed ?? isEndAtStart;

  if (cleanTuples.length === 2) {
    const startStr = `M ${formatCoord(first[0], precision)} ${formatCoord(first[1], precision)}`;
    if (isClosed) {
      return `${startStr} Z`;
    }
    return `${startStr} L ${formatCoord(last[0], precision)} ${formatCoord(last[1], precision)}`;
  }

  try {
    const beziers = fitCurve(cleanTuples, Math.max(0.01, errorTolerance));
    if (!beziers || beziers.length === 0) {
      // Fallback to polyline
      const poly = cleanTuples
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${formatCoord(pt[0], precision)} ${formatCoord(pt[1], precision)}`)
        .join(' ');
      return isClosed ? `${poly} Z` : poly;
    }

    let d = `M ${formatCoord(beziers[0][0][0], precision)} ${formatCoord(beziers[0][0][1], precision)}`;
    for (const seg of beziers) {
      const cp1 = seg[1];
      const cp2 = seg[2];
      const p1 = seg[3];
      d += ` C ${formatCoord(cp1[0], precision)} ${formatCoord(cp1[1], precision)}, ${formatCoord(cp2[0], precision)} ${formatCoord(cp2[1], precision)}, ${formatCoord(p1[0], precision)} ${formatCoord(p1[1], precision)}`;
    }

    if (isClosed) {
      d += ' Z';
    }

    return d;
  } catch {
    // Robust fallback to polyline if fitCurve fails
    const poly = cleanTuples
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${formatCoord(pt[0], precision)} ${formatCoord(pt[1], precision)}`)
      .join(' ');
    return isClosed ? `${poly} Z` : poly;
  }
}
