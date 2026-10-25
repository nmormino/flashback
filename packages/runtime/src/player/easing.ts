import type { Easing } from '../schema';

export function cleanNumber(val: number): number {
  if (Math.abs(val) < 1e-12) return 0;
  return parseFloat(val.toFixed(6));
}

/**
 * Standard CSS Cubic-Bezier presets.
 */
export const BEZIER_PRESETS: Record<'ease' | 'ease-in' | 'ease-out' | 'ease-in-out', [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1.0],
  'ease-in': [0.42, 0.0, 1.0, 1.0],
  'ease-out': [0.0, 0.0, 0.58, 1.0],
  'ease-in-out': [0.42, 0.0, 0.58, 1.0],
};

/**
 * Solves cubic bezier curve for x(u) = t using Newton-Raphson with bisection fallback,
 * then returns y(u).
 */
export function solveCubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  t: number
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Coefficients for polynomial: x(u) = ((a*u + b)*u + c)*u
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleCurveY = (u: number) => ((ay * u + by) * u + cy) * u;
  const sampleDerivativeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  // 1. Try Newton-Raphson iteration
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = sampleCurveX(u);
    const diff = x - t;
    if (Math.abs(diff) < 1e-7) {
      return sampleCurveY(u);
    }
    const d = sampleDerivativeX(u);
    if (Math.abs(d) < 1e-6) break;
    u -= diff / d;
  }

  // 2. Fallback to bisection
  let low = 0;
  let high = 1;
  u = t;

  while (low < high) {
    const x = sampleCurveX(u);
    if (Math.abs(x - t) < 1e-7) {
      return sampleCurveY(u);
    }
    if (t > x) {
      low = u;
    } else {
      high = u;
    }
    u = (high + low) / 2;
    if (high - low < 1e-7) break;
  }

  return sampleCurveY(u);
}

/**
 * Evaluates steps easing at progress t in [0, 1].
 */
export function evaluateSteps(count: number, position: 'start' | 'end', t: number): number {
  const n = Math.max(1, Math.floor(count));
  if (t <= 0) return position === 'start' ? 1 / n : 0;
  if (t >= 1) return 1;

  if (position === 'start') {
    return Math.min(1, (Math.floor(t * n) + 1) / n);
  } else {
    return Math.floor(t * n) / n;
  }
}

/**
 * Evaluates piecewise linear points easing at progress t in [0, 1].
 */
export function evaluateLinearPoints(
  points: Array<[value: number, progress: number]>,
  t: number
): number {
  if (!points || points.length === 0) return t;
  if (points.length === 1) return points[0][0];

  // Normalize progress if values were entered as 0..100
  const normalized: Array<[number, number]> = points.map(([val, prog]) => [
    val,
    prog > 1 ? prog / 100 : Math.max(0, prog),
  ]);

  // Sort ascending by progress
  normalized.sort((a, b) => a[1] - b[1]);

  if (t <= normalized[0][1]) return normalized[0][0];
  if (t >= normalized[normalized.length - 1][1]) {
    return normalized[normalized.length - 1][0];
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    const p0 = normalized[i];
    const p1 = normalized[i + 1];
    if (t >= p0[1] && t <= p1[1]) {
      const span = p1[1] - p0[1];
      if (span === 0) return p1[0];
      const frac = (t - p0[1]) / span;
      return p0[0] + frac * (p1[0] - p0[0]);
    }
  }

  return normalized[normalized.length - 1][0];
}

/**
 * Evaluates any schema Easing variant at time progress t in [0, 1].
 */
export function evaluateEasing(easing: Easing | undefined, t: number): number {
  if (!easing) return t;
  const clampedT = Math.max(0, Math.min(1, t));

  switch (easing.type) {
    case 'linear':
      return clampedT;

    case 'preset': {
      const p = BEZIER_PRESETS[easing.name] ?? BEZIER_PRESETS.ease;
      return solveCubicBezier(p[0], p[1], p[2], p[3], clampedT);
    }

    case 'cubic-bezier': {
      const [p1x, p1y, p2x, p2y] = easing.p;
      return solveCubicBezier(p1x, p1y, p2x, p2y, clampedT);
    }

    case 'steps':
      return evaluateSteps(easing.count, easing.position, clampedT);

    case 'linear-points':
      return evaluateLinearPoints(easing.points, clampedT);

    default:
      return clampedT;
  }
}

/**
 * Compiles a schema Easing object into a standard CSS easing function string
 * for WAAPI and CSS transitions.
 */
export function compileEasingToCSS(easing?: Easing): string {
  if (!easing) return 'linear';

  switch (easing.type) {
    case 'linear':
      return 'linear';

    case 'preset':
      return easing.name;

    case 'cubic-bezier': {
      const [x1, y1, x2, y2] = easing.p;
      return `cubic-bezier(${cleanNumber(x1)}, ${cleanNumber(y1)}, ${cleanNumber(x2)}, ${cleanNumber(y2)})`;
    }

    case 'steps':
      return `steps(${easing.count}, ${easing.position})`;

    case 'linear-points': {
      if (!easing.points || easing.points.length === 0) return 'linear';
      const parts = easing.points.map(([val, prog]) => {
        const pct = prog <= 1 && prog >= 0 ? prog * 100 : prog;
        return `${cleanNumber(val)} ${cleanNumber(pct)}%`;
      });
      return `linear(${parts.join(', ')})`;
    }

    default:
      return 'linear';
  }
}
