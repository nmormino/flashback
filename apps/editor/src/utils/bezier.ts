/**
 * Illustrator-grade Bézier path manipulation and conversion utilities.
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface BezierAnchor {
  x: number;
  y: number;
  handleIn?: Vector2D;   // Incoming control handle (relative to anchor or absolute)
  handleOut?: Vector2D;  // Outgoing control handle (relative to anchor or absolute)
}

export interface ParsedPath {
  anchors: BezierAnchor[];
  closed: boolean;
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
export function parseSvgPath(d: string): ParsedPath {
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
    if (updates.handleIn !== undefined) anchor.handleIn = updates.handleIn ?? undefined;
    if (updates.handleOut !== undefined) anchor.handleOut = updates.handleOut ?? undefined;
  }

  return formatSvgPath(parsed.anchors, parsed.closed);
}

/**
 * Linearly interpolate between two SVG paths if anchor counts match.
 */
export function interpolatePathD(d1: string, d2: string, t: number): string {
  if (t <= 0) return d1;
  if (t >= 1) return d2;
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
  } catch {}
  return t < 0.5 ? d1 : d2;
}
