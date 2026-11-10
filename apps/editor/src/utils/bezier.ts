/**
 * Illustrator-grade Bézier path manipulation and conversion utilities.
 */

import * as flubberModule from 'flubber';

const flubberInterpolate: typeof flubberModule.interpolate =
  (flubberModule as any).interpolate ?? (flubberModule as any).default?.interpolate;

export const morphCache = new Map<string, (t: number) => string>();

export interface Vector2D {
  x: number;
  y: number;
}

export interface BezierAnchor {
  x: number;
  y: number;
  handleIn?: Vector2D;   // Incoming control handle (relative to anchor or absolute)
  handleOut?: Vector2D;  // Outgoing control handle (relative to anchor or absolute)
  pointType?: 'smooth' | 'corner'; // Illustrator-style anchor point type
}

export interface ParsedPath {
  anchors: BezierAnchor[];
  closed: boolean;
}

/**
 * Check whether an anchor point is a smooth point or a corner point.
 * In Illustrator, an anchor is smooth if its handles are collinear opposite,
 * or explicitly designated as smooth.
 */
export function getAnchorPointType(anchor: BezierAnchor): 'smooth' | 'corner' {
  if (anchor.pointType) return anchor.pointType;
  if (!anchor.handleIn && !anchor.handleOut) return 'corner';
  if (anchor.handleIn && anchor.handleOut) {
    const vIn = { x: anchor.handleIn.x - anchor.x, y: anchor.handleIn.y - anchor.y };
    const vOut = { x: anchor.handleOut.x - anchor.x, y: anchor.handleOut.y - anchor.y };
    const lenIn = Math.hypot(vIn.x, vIn.y);
    const lenOut = Math.hypot(vOut.x, vOut.y);
    if (lenIn > 0.5 && lenOut > 0.5) {
      const uIn = { x: vIn.x / lenIn, y: vIn.y / lenIn };
      const uOut = { x: vOut.x / lenOut, y: vOut.y / lenOut };
      const dot = uIn.x * uOut.x + uIn.y * uOut.y;
      // Collinear opposite handles have dot product close to -1
      if (dot <= -0.85) {
        return 'smooth';
      }
    }
    return 'corner';
  }
  return 'corner';
}

/**
 * Tokenize an SVG path string into command tokens and numeric arguments.
 */
function tokenizeSvgPath(d: string): Array<{ command: string; args: number[] }> {
  const result: Array<{ command: string; args: number[] }> = [];
  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = commandRegex.exec(d)) !== null) {
    const command = match[1];
    const argsStr = match[2].trim();
    const args = argsStr.length > 0
      ? (argsStr.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number)
      : [];
    result.push({ command, args });
  }

  return result;
}

/**
 * Parse an SVG path `d` attribute into an array of Bézier anchors with control handles.
 */
export function parseSvgPath(
  d: string,
  pointTypes?: Record<number, 'smooth' | 'corner'>
): ParsedPath {
  const tokens = tokenizeSvgPath(d);
  const anchors: BezierAnchor[] = [];
  let closed = false;
  let currX = 0;
  let currY = 0;

  for (let i = 0; i < tokens.length; i++) {
    const { command, args } = tokens[i];
    const isUpper = command === command.toUpperCase();

    switch (command.toUpperCase()) {
      case 'M': {
        for (let j = 0; j < args.length; j += 2) {
          const x = isUpper ? args[j] : currX + args[j];
          const y = isUpper ? args[j + 1] : currY + args[j + 1];
          currX = x;
          currY = y;
          anchors.push({ x, y });
        }
        break;
      }
      case 'L': {
        for (let j = 0; j < args.length; j += 2) {
          const x = isUpper ? args[j] : currX + args[j];
          const y = isUpper ? args[j + 1] : currY + args[j + 1];
          currX = x;
          currY = y;
          anchors.push({ x, y });
        }
        break;
      }
      case 'C': {
        // Cubic Bézier: cp1x cp1y cp2x cp2y x y
        for (let j = 0; j < args.length; j += 6) {
          const cp1x = isUpper ? args[j] : currX + args[j];
          const cp1y = isUpper ? args[j + 1] : currY + args[j + 1];
          const cp2x = isUpper ? args[j + 2] : currX + args[j + 2];
          const cp2y = isUpper ? args[j + 3] : currY + args[j + 3];
          const x = isUpper ? args[j + 4] : currX + args[j + 4];
          const y = isUpper ? args[j + 5] : currY + args[j + 5];

          // The previous anchor's handleOut is cp1
          if (anchors.length > 0) {
            anchors[anchors.length - 1].handleOut = { x: cp1x, y: cp1y };
          }

          // The new anchor's handleIn is cp2
          anchors.push({
            x,
            y,
            handleIn: { x: cp2x, y: cp2y },
          });

          currX = x;
          currY = y;
        }
        break;
      }
      case 'Q': {
        // Quadratic Bézier: cpx cpy x y -> convert to cubic
        for (let j = 0; j < args.length; j += 4) {
          const cpx = isUpper ? args[j] : currX + args[j];
          const cpy = isUpper ? args[j + 1] : currY + args[j + 1];
          const x = isUpper ? args[j + 2] : currX + args[j + 2];
          const y = isUpper ? args[j + 3] : currY + args[j + 3];

          const cp1x = currX + (2 / 3) * (cpx - currX);
          const cp1y = currY + (2 / 3) * (cpy - currY);
          const cp2x = x + (2 / 3) * (cpx - x);
          const cp2y = y + (2 / 3) * (cpy - y);

          if (anchors.length > 0) {
            anchors[anchors.length - 1].handleOut = { x: cp1x, y: cp1y };
          }
          anchors.push({
            x,
            y,
            handleIn: { x: cp2x, y: cp2y },
          });

          currX = x;
          currY = y;
        }
        break;
      }
      case 'Z': {
        closed = true;
        break;
      }
      default: {
        // Fallback for arc or other commands: extract pairs as points
        for (let j = 0; j < args.length - 1; j += 2) {
          const x = isUpper ? args[j] : currX + args[j];
          const y = isUpper ? args[j + 1] : currY + args[j + 1];
          currX = x;
          currY = y;
          anchors.push({ x, y });
        }
        break;
      }
    }
  }

  for (let i = 0; i < anchors.length; i++) {
    anchors[i].pointType = pointTypes?.[i] ?? getAnchorPointType(anchors[i]);
  }

  return { anchors, closed };
}

/**
 * Format Bézier anchors back into an SVG path `d` string.
 */
export function formatSvgPath(anchors: BezierAnchor[], closed = false): string {
  if (anchors.length === 0) return '';
  if (anchors.length === 1) {
    return `M ${anchors[0].x} ${anchors[0].y}`;
  }

  const parts: string[] = [];
  const p0 = anchors[0];
  parts.push(`M ${p0.x} ${p0.y}`);

  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const curr = anchors[i];

    const hasCp1 = prev.handleOut !== undefined;
    const hasCp2 = curr.handleIn !== undefined;

    if (hasCp1 || hasCp2) {
      const cp1 = prev.handleOut ?? { x: prev.x, y: prev.y };
      const cp2 = curr.handleIn ?? { x: curr.x, y: curr.y };
      parts.push(`C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    } else {
      parts.push(`L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    }
  }

  if (closed) {
    const last = anchors[anchors.length - 1];
    const first = anchors[0];
    const hasCp1 = last.handleOut !== undefined;
    const hasCp2 = first.handleIn !== undefined;

    if (hasCp1 || hasCp2) {
      const cp1 = last.handleOut ?? { x: last.x, y: last.y };
      const cp2 = first.handleIn ?? { x: first.x, y: first.y };
      parts.push(`C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);
    }
    parts.push('Z');
  }

  return parts.join(' ');
}

/**
 * Update an anchor point or handle in an SVG path `d` string.
 * Supports Illustrator-style smooth collinear handle dragging and corner independent handle dragging.
 */
export function updatePathAnchor(
  d: string,
  anchorIndex: number,
  updates: {
    x?: number;
    y?: number;
    handleIn?: Vector2D | null;
    handleOut?: Vector2D | null;
    delta?: Vector2D;
    pointType?: 'smooth' | 'corner';
    breakHandles?: boolean;
  }
): string {
  const parsed = parseSvgPath(d);
  if (anchorIndex < 0 || anchorIndex >= parsed.anchors.length) {
    return d;
  }

  const anchor = parsed.anchors[anchorIndex];

  if (updates.delta) {
    anchor.x += updates.delta.x;
    anchor.y += updates.delta.y;
    if (anchor.handleIn) {
      anchor.handleIn.x += updates.delta.x;
      anchor.handleIn.y += updates.delta.y;
    }
    if (anchor.handleOut) {
      anchor.handleOut.x += updates.delta.x;
      anchor.handleOut.y += updates.delta.y;
    }
  } else {
    if (updates.x !== undefined) anchor.x = updates.x;
    if (updates.y !== undefined) anchor.y = updates.y;

    const isSmooth =
      !updates.breakHandles &&
      (updates.pointType ?? anchor.pointType ?? getAnchorPointType(anchor)) === 'smooth';

    if (updates.handleIn !== undefined) {
      const newIn = updates.handleIn ?? undefined;
      anchor.handleIn = newIn;

      // If smooth, mirror handleOut angle to stay collinear (180° opposite)
      if (isSmooth && newIn) {
        const vx = newIn.x - anchor.x;
        const vy = newIn.y - anchor.y;
        const lenIn = Math.hypot(vx, vy);
        if (lenIn > 0.001) {
          const ux = vx / lenIn;
          const uy = vy / lenIn;
          let lenOut = anchor.handleOut
            ? Math.hypot(anchor.handleOut.x - anchor.x, anchor.handleOut.y - anchor.y)
            : lenIn;
          if (lenOut < 1) lenOut = lenIn;

          anchor.handleOut = {
            x: Math.round((anchor.x - ux * lenOut) * 100) / 100,
            y: Math.round((anchor.y - uy * lenOut) * 100) / 100,
          };
        }
      }
    }

    if (updates.handleOut !== undefined) {
      const newOut = updates.handleOut ?? undefined;
      anchor.handleOut = newOut;

      // If smooth, mirror handleIn angle to stay collinear (180° opposite)
      if (isSmooth && newOut) {
        const vx = newOut.x - anchor.x;
        const vy = newOut.y - anchor.y;
        const lenOut = Math.hypot(vx, vy);
        if (lenOut > 0.001) {
          const ux = vx / lenOut;
          const uy = vy / lenOut;
          let lenIn = anchor.handleIn
            ? Math.hypot(anchor.handleIn.x - anchor.x, anchor.handleIn.y - anchor.y)
            : lenOut;
          if (lenIn < 1) lenIn = lenOut;

          anchor.handleIn = {
            x: Math.round((anchor.x - ux * lenIn) * 100) / 100,
            y: Math.round((anchor.y - uy * lenIn) * 100) / 100,
          };
        }
      }
    }

    if (updates.breakHandles) {
      anchor.pointType = 'corner';
    }
  }

  return formatSvgPath(parsed.anchors, parsed.closed);
}

/**
 * Toggle an anchor point between Illustrator's two point types:
 * - Corner Point: sharp corner with retracted handles.
 * - Smooth Point: continuous curvature with collinear direction handles.
 */
export function toggleAnchorPointType(
  d: string,
  anchorIndex: number,
  targetType?: 'smooth' | 'corner'
): { d: string; newType: 'smooth' | 'corner'; anchors: BezierAnchor[] } {
  const parsed = parseSvgPath(d);
  if (anchorIndex < 0 || anchorIndex >= parsed.anchors.length) {
    return { d, newType: 'corner', anchors: parsed.anchors };
  }

  const anchor = parsed.anchors[anchorIndex];
  const currentType = anchor.pointType ?? getAnchorPointType(anchor);
  const nextType = targetType ?? (currentType === 'smooth' ? 'corner' : 'smooth');

  if (nextType === 'corner') {
    // Retract handles to the anchor point -> sharp corner
    anchor.handleIn = undefined;
    anchor.handleOut = undefined;
    anchor.pointType = 'corner';
  } else {
    // Generate smooth collinear direction handles along the tangent between neighboring vertices
    const numAnchors = parsed.anchors.length;
    let prevAnchor: BezierAnchor | undefined;
    let nextAnchor: BezierAnchor | undefined;

    if (parsed.closed) {
      prevAnchor = parsed.anchors[(anchorIndex - 1 + numAnchors) % numAnchors];
      nextAnchor = parsed.anchors[(anchorIndex + 1) % numAnchors];
    } else {
      if (anchorIndex > 0) prevAnchor = parsed.anchors[anchorIndex - 1];
      if (anchorIndex < numAnchors - 1) nextAnchor = parsed.anchors[anchorIndex + 1];
    }

    if (prevAnchor && nextAnchor) {
      const tx = nextAnchor.x - prevAnchor.x;
      const ty = nextAnchor.y - prevAnchor.y;
      const tLen = Math.hypot(tx, ty);
      const ux = tLen > 0.001 ? tx / tLen : 1;
      const uy = tLen > 0.001 ? ty / tLen : 0;

      const dPrev = Math.hypot(anchor.x - prevAnchor.x, anchor.y - prevAnchor.y);
      const dNext = Math.hypot(nextAnchor.x - anchor.x, nextAnchor.y - anchor.y);
      const lenIn = Math.max(12, Math.round(dPrev * 0.33 * 100) / 100);
      const lenOut = Math.max(12, Math.round(dNext * 0.33 * 100) / 100);

      anchor.handleIn = {
        x: Math.round((anchor.x - ux * lenIn) * 100) / 100,
        y: Math.round((anchor.y - uy * lenIn) * 100) / 100,
      };
      anchor.handleOut = {
        x: Math.round((anchor.x + ux * lenOut) * 100) / 100,
        y: Math.round((anchor.y + uy * lenOut) * 100) / 100,
      };
    } else if (nextAnchor) {
      const tx = nextAnchor.x - anchor.x;
      const ty = nextAnchor.y - anchor.y;
      const tLen = Math.hypot(tx, ty);
      const ux = tLen > 0.001 ? tx / tLen : 1;
      const uy = tLen > 0.001 ? ty / tLen : 0;
      const lenOut = Math.max(12, Math.round(tLen * 0.33 * 100) / 100);

      anchor.handleOut = {
        x: Math.round((anchor.x + ux * lenOut) * 100) / 100,
        y: Math.round((anchor.y + uy * lenOut) * 100) / 100,
      };
      anchor.handleIn = undefined;
    } else if (prevAnchor) {
      const tx = anchor.x - prevAnchor.x;
      const ty = anchor.y - prevAnchor.y;
      const tLen = Math.hypot(tx, ty);
      const ux = tLen > 0.001 ? tx / tLen : 1;
      const uy = tLen > 0.001 ? ty / tLen : 0;
      const lenIn = Math.max(12, Math.round(tLen * 0.33 * 100) / 100);

      anchor.handleIn = {
        x: Math.round((anchor.x - ux * lenIn) * 100) / 100,
        y: Math.round((anchor.y - uy * lenIn) * 100) / 100,
      };
      anchor.handleOut = undefined;
    } else {
      anchor.handleIn = { x: anchor.x - 25, y: anchor.y };
      anchor.handleOut = { x: anchor.x + 25, y: anchor.y };
    }
    anchor.pointType = 'smooth';
  }

  const formattedD = formatSvgPath(parsed.anchors, parsed.closed);
  return { d: formattedD, newType: nextType, anchors: parsed.anchors };
}

/**
 * Evaluate a point on a line or cubic Bézier segment at t in [0, 1].
 */
function evalSegmentAt(a0: BezierAnchor, a1: BezierAnchor, t: number): Vector2D {
  const hasCurve = a0.handleOut !== undefined || a1.handleIn !== undefined;
  if (!hasCurve) {
    return {
      x: a0.x + (a1.x - a0.x) * t,
      y: a0.y + (a1.y - a0.y) * t,
    };
  }
  const p0 = { x: a0.x, y: a0.y };
  const p1 = a0.handleOut ?? p0;
  const p2 = a1.handleIn ?? { x: a1.x, y: a1.y };
  const p3 = { x: a1.x, y: a1.y };
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y,
  };
}

/**
 * Insert a new anchor point along segment `segmentIndex` (between anchor[i] and anchor[i+1])
 * at parameter `t` in (0, 1) (default 0.5). Uses De Casteljau's algorithm if the segment is curved.
 */
export function insertPointOnPathSegment(
  d: string,
  segmentIndex: number,
  t = 0.5
): { d: string; insertedAnchorIndex: number; point: Vector2D } {
  const parsed = parseSvgPath(d);
  const n = parsed.anchors.length;
  const numSegments = parsed.closed ? n : Math.max(0, n - 1);
  if (n < 2 || segmentIndex < 0 || segmentIndex >= numSegments) {
    return { d, insertedAnchorIndex: -1, point: { x: 0, y: 0 } };
  }

  const clampedT = Math.max(0.05, Math.min(0.95, t));
  const i0 = segmentIndex;
  const i1 = (segmentIndex + 1) % n;
  const a0 = parsed.anchors[i0];
  const a1 = parsed.anchors[i1];

  const hasCurve = a0.handleOut !== undefined || a1.handleIn !== undefined;
  let newAnchor: BezierAnchor;

  if (!hasCurve) {
    newAnchor = {
      x: Math.round((a0.x + (a1.x - a0.x) * clampedT) * 100) / 100,
      y: Math.round((a0.y + (a1.y - a0.y) * clampedT) * 100) / 100,
    };
  } else {
    // De Casteljau subdivision at clampedT
    const p0 = { x: a0.x, y: a0.y };
    const p1 = a0.handleOut ?? p0;
    const p2 = a1.handleIn ?? { x: a1.x, y: a1.y };
    const p3 = { x: a1.x, y: a1.y };
    const lerpPt = (u: Vector2D, v: Vector2D, s: number): Vector2D => ({
      x: Math.round((u.x + (v.x - u.x) * s) * 100) / 100,
      y: Math.round((u.y + (v.y - u.y) * s) * 100) / 100,
    });

    const q0 = lerpPt(p0, p1, clampedT);
    const q1 = lerpPt(p1, p2, clampedT);
    const q2 = lerpPt(p2, p3, clampedT);
    const r0 = lerpPt(q0, q1, clampedT);
    const r1 = lerpPt(q1, q2, clampedT);
    const s0 = lerpPt(r0, r1, clampedT);

    a0.handleOut = q0;
    a1.handleIn = q2;
    newAnchor = {
      x: s0.x,
      y: s0.y,
      handleIn: r0,
      handleOut: r1,
    };
  }

  const insertIdx = segmentIndex + 1;
  parsed.anchors.splice(insertIdx, 0, newAnchor);
  return {
    d: formatSvgPath(parsed.anchors, parsed.closed),
    insertedAnchorIndex: insertIdx,
    point: { x: newAnchor.x, y: newAnchor.y },
  };
}

/**
 * Find the closest segment and parameter `t` on an SVG path to a target local point.
 */
export function findClosestPointOnPathSegments(
  d: string,
  target: Vector2D
): { segmentIndex: number; t: number; point: Vector2D; distance: number } | null {
  const parsed = parseSvgPath(d);
  const n = parsed.anchors.length;
  const numSegments = parsed.closed ? n : Math.max(0, n - 1);
  if (numSegments === 0) return null;

  let bestSeg = 0;
  let bestT = 0.5;
  let bestPt: Vector2D = { x: parsed.anchors[0].x, y: parsed.anchors[0].y };
  let bestDist = Infinity;

  const samples = 24;
  for (let seg = 0; seg < numSegments; seg++) {
    const a0 = parsed.anchors[seg];
    const a1 = parsed.anchors[(seg + 1) % n];
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const pt = evalSegmentAt(a0, a1, t);
      const dist = Math.hypot(pt.x - target.x, pt.y - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestSeg = seg;
        bestT = t;
        bestPt = pt;
      }
    }
  }

  return {
    segmentIndex: bestSeg,
    t: Math.max(0.05, Math.min(0.95, bestT)),
    point: {
      x: Math.round(bestPt.x * 100) / 100,
      y: Math.round(bestPt.y * 100) / 100,
    },
    distance: bestDist,
  };
}

/**
 * Delete an anchor point from an SVG path `d` string (preserves minimum 2 points for open, 3 for closed).
 */
export function deletePathAnchor(d: string, anchorIndex: number): string {
  const parsed = parseSvgPath(d);
  if (
    parsed.anchors.length <= 2 ||
    anchorIndex < 0 ||
    anchorIndex >= parsed.anchors.length
  ) {
    return d;
  }
  parsed.anchors.splice(anchorIndex, 1);
  const isClosed = parsed.closed && parsed.anchors.length >= 3;
  return formatSvgPath(parsed.anchors, isClosed);
}

/**
 * Linearly interpolate between two SVG paths if anchor counts match,
 * or use flubber for morphing shapes with differing vertex counts or complex topologies.
 */
export function interpolatePathD(d1: string, d2: string, t: number): string {
  if (d1 === d2 || t <= 0) return d1;
  if (t >= 1) return d2;

  // 1. Fast path: matching anchor counts (fast linear bezier anchor interpolation)
  try {
    const p1 = parseSvgPath(d1);
    const p2 = parseSvgPath(d2);
    if (p1.anchors.length === p2.anchors.length && p1.anchors.length > 0) {
      const interpAnchors: BezierAnchor[] = p1.anchors.map((a1, idx) => {
        const a2 = p2.anchors[idx];
        const x = a1.x + (a2.x - a1.x) * t;
        const y = a1.y + (a2.y - a1.y) * t;
        const handleIn =
          a1.handleIn && a2.handleIn
            ? {
                x: a1.handleIn.x + (a2.handleIn.x - a1.handleIn.x) * t,
                y: a1.handleIn.y + (a2.handleIn.y - a1.handleIn.y) * t,
              }
            : a1.handleIn || a2.handleIn;
        const handleOut =
          a1.handleOut && a2.handleOut
            ? {
                x: a1.handleOut.x + (a2.handleOut.x - a1.handleOut.x) * t,
                y: a1.handleOut.y + (a2.handleOut.y - a1.handleOut.y) * t,
              }
            : a1.handleOut || a2.handleOut;
        return { x, y, handleIn, handleOut };
      });
      return formatSvgPath(interpAnchors, p1.closed || p2.closed);
    }
  } catch {
    // If fast bezier parsing fails, fall through to flubber morphing
  }

  // 2. Differing vertex counts or complex shapes: flubber.interpolate with cache
  const cacheKey = `${d1}__FLUBBER__${d2}`;
  try {
    let interpolator = morphCache.get(cacheKey);
    if (!interpolator) {
      if (typeof flubberInterpolate === 'function') {
        interpolator = flubberInterpolate(d1, d2, { maxSegmentLength: 4 });
        if (morphCache.size > 2000) morphCache.clear();
        morphCache.set(cacheKey, interpolator);
      }
    }
    if (interpolator) {
      const result = interpolator(t);
      if (result) return result;
    }
  } catch {
    // Degenerate segment or shape fallback
  }

  return t < 0.5 ? d1 : d2;
}

/**
 * Checks whether an SVG path string represents a closed shape.
 */
export function isPathClosed(d: string): boolean {
  if (!d) return false;
  const trimmed = d.trim();
  if (/[Zz]\s*$/.test(trimmed)) return true;
  const parsed = parseSvgPath(trimmed);
  return parsed.closed;
}

/**
 * Closes an open vector path by connecting its last point to its first point with a 'Z' segment.
 */
export function closePath(d: string): string {
  if (!d) return d;
  if (isPathClosed(d)) return d;
  const parsed = parseSvgPath(d);
  if (parsed.anchors.length < 2) return d;
  return formatSvgPath(parsed.anchors, true);
}

/**
 * Opens a closed vector path by removing the closing segment, turning a closed loop into an open curve.
 */
export function openPath(d: string): string {
  if (!d) return d;
  const parsed = parseSvgPath(d);
  if (!parsed.closed) return d;
  return formatSvgPath(parsed.anchors, false);
}

/**
 * Slices a vector path at a specific anchor index.
 * If the path is closed, it breaks the loop at that anchor, making it an open path.
 * If the path is open, it splits the path into two disjoint subpaths.
 */
export function slicePathAtAnchor(d: string, anchorIndex: number): string {
  const parsed = parseSvgPath(d);
  const n = parsed.anchors.length;
  if (n < 2 || anchorIndex < 0 || anchorIndex >= n) return d;

  if (parsed.closed) {
    // Break the closed loop at anchorIndex
    // Shift the anchors array so anchorIndex is start, ending with a copy of anchorIndex
    const reordered: BezierAnchor[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (anchorIndex + i) % n;
      reordered.push({ ...parsed.anchors[idx] });
    }
    // Duplicate the cut point at the end so it forms the other open terminal
    reordered.push({
      x: parsed.anchors[anchorIndex].x,
      y: parsed.anchors[anchorIndex].y,
      handleIn: parsed.anchors[anchorIndex].handleIn ? { ...parsed.anchors[anchorIndex].handleIn! } : undefined,
    });
    return formatSvgPath(reordered, false);
  } else {
    // Open path split into two subpaths
    if (anchorIndex === 0 || anchorIndex === n - 1) return d;
    const path1 = parsed.anchors.slice(0, anchorIndex + 1);
    const path2 = parsed.anchors.slice(anchorIndex);
    return `${formatSvgPath(path1, false)} ${formatSvgPath(path2, false)}`;
  }
}

/**
 * Slices / cuts a vector path at a target coordinate (x, y) along its perimeter.
 * Finds the closest point on the path, splits the segment there, and opens the loop.
 */
export function slicePathAtPoint(d: string, pt: Vector2D): string {
  const closest = findClosestPointOnPathSegments(d, pt);
  if (!closest) return d;
  const { d: withPoint, insertedAnchorIndex } = insertPointOnPathSegment(d, closest.segmentIndex, closest.t);
  return slicePathAtAnchor(withPoint, insertedAnchorIndex);
}

/**
 * Ramer-Douglas-Peucker (RDP) polyline simplification algorithm.
 * Reduces raw sampled mouse points while preserving significant curvature.
 */
export function simplifyPointsRDP(points: Vector2D[], epsilon: number): Vector2D[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let dist = 0;
    if (lineLenSq === 0) {
      dist = Math.hypot(p.x - p1.x, p.y - p1.y);
    } else {
      const u = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lineLenSq;
      const clampedU = Math.max(0, Math.min(1, u));
      const projX = p1.x + clampedU * dx;
      const projY = p1.y + clampedU * dy;
      dist = Math.hypot(p.x - projX, p.y - projY);
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPointsRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyPointsRDP(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [p1, p2];
  }
}

/**
 * Fits a smooth cubic Bézier vector path to freehand drawn points with a smoothness parameter.
 * Smoothness: 0 (Accurate / crisp, more points) to 100 (Ultra smooth, fewer points).
 */
export function fitCurveToPoints(
  rawPoints: Vector2D[],
  smoothness = 50,
  autoCloseDistance = 16
): { d: string; anchors: BezierAnchor[]; closed: boolean } {
  if (rawPoints.length === 0) return { d: '', anchors: [], closed: false };
  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    return { d: `M ${p.x} ${p.y}`, anchors: [{ x: p.x, y: p.y }], closed: false };
  }

  // Smoothness maps to RDP epsilon: 0 -> 1px (high point density), 50 -> 6px, 100 -> 18px (fewer points, very smooth)
  const clampedSmooth = Math.max(0, Math.min(100, smoothness));
  const epsilon = 1 + (clampedSmooth / 100) * 17;

  // Check if stroke forms a closed loop
  const pStart = rawPoints[0];
  const pEnd = rawPoints[rawPoints.length - 1];
  const loopDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
  const shouldClose = rawPoints.length > 3 && loopDist <= autoCloseDistance;

  let points = [...rawPoints];
  if (shouldClose) {
    points[points.length - 1] = { x: pStart.x, y: pStart.y };
  }

  // 1. Simplify points using RDP
  const simplified = simplifyPointsRDP(points, epsilon);
  if (simplified.length < 2) {
    return {
      d: `M ${pStart.x} ${pStart.y}`,
      anchors: [{ x: pStart.x, y: pStart.y }],
      closed: shouldClose,
    };
  }

  // 2. Convert simplified polyline into smooth cubic Bézier curves (Catmull-Rom to Bézier)
  // Tension factor between 0.15 and 0.4 based on smoothness
  const tension = 0.2 + (clampedSmooth / 100) * 0.18;
  const n = simplified.length;
  const anchors: BezierAnchor[] = [];

  for (let i = 0; i < n; i++) {
    const curr = simplified[i];
    anchors.push({ x: Math.round(curr.x * 100) / 100, y: Math.round(curr.y * 100) / 100 });
  }

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? simplified[i - 1] : simplified[i];
    const p1 = simplified[i];
    const p2 = simplified[i + 1];
    const p3 = i + 2 < n ? simplified[i + 2] : p2;

    const cp1x = Math.round((p1.x + ((p2.x - p0.x) / 6) * tension * 3) * 100) / 100;
    const cp1y = Math.round((p1.y + ((p2.y - p0.y) / 6) * tension * 3) * 100) / 100;
    const cp2x = Math.round((p2.x - ((p3.x - p1.x) / 6) * tension * 3) * 100) / 100;
    const cp2y = Math.round((p2.y - ((p3.y - p1.y) / 6) * tension * 3) * 100) / 100;

    anchors[i].handleOut = { x: cp1x, y: cp1y };
    anchors[i + 1].handleIn = { x: cp2x, y: cp2y };
  }

  const d = formatSvgPath(anchors, shouldClose);
  return { d, anchors, closed: shouldClose };
}

/**
 * Samples sequential coordinate points along an arbitrary SVG path.
 * Used for live re-smoothing and simplifying vector paths.
 */
export function samplePointsFromPath(d: string, pointsPerSegment = 10): Vector2D[] {
  const parsed = parseSvgPath(d);
  if (parsed.anchors.length < 2) return [];

  const points: Vector2D[] = [];
  const segCount = parsed.closed
    ? parsed.anchors.length
    : parsed.anchors.length - 1;

  for (let i = 0; i < segCount; i++) {
    const a0 = parsed.anchors[i];
    const a1 = parsed.anchors[(i + 1) % parsed.anchors.length];
    for (let s = 0; s < pointsPerSegment; s++) {
      const t = s / pointsPerSegment;
      points.push(evalSegmentAt(a0, a1, t));
    }
  }

  if (!parsed.closed && parsed.anchors.length > 0) {
    const last = parsed.anchors[parsed.anchors.length - 1];
    points.push({ x: last.x, y: last.y });
  }

  return points;
}
