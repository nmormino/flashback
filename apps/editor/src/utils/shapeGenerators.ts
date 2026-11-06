import type { ShapeElement } from '@flashback/runtime';

/**
 * Generates an SVG path string for a regular polygon or an extruded star.
 *
 * @param cx Center X
 * @param cy Center Y
 * @param outerRadius Distance from center to outer vertices
 * @param points Number of outer vertices (default: 5)
 * @param pointRatio Ratio of inner radius to outer radius (1.0 = regular polygon, < 1.0 = star)
 * @param startAngle Starting rotation offset in radians (default: -PI/2 to point straight up)
 */
export function generatePolygonStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  points = 5,
  pointRatio = 0.5,
  startAngle = -Math.PI / 2
): string {
  const pts = Math.max(3, points);
  const rOuter = Math.max(2, outerRadius);
  const isExtruded = Math.abs(pointRatio - 1.0) > 0.001;
  const totalVertices = isExtruded ? pts * 2 : pts;
  const angleStep = (Math.PI * 2) / totalVertices;

  const pathCommands: string[] = [];

  for (let i = 0; i < totalVertices; i++) {
    const angle = startAngle + i * angleStep;
    let r = rOuter;
    if (isExtruded && i % 2 === 1) {
      r = rOuter * Math.max(0.05, Math.min(3.0, pointRatio));
    }
    const px = Math.round((cx + r * Math.cos(angle)) * 100) / 100;
    const py = Math.round((cy + r * Math.sin(angle)) * 100) / 100;

    if (i === 0) {
      pathCommands.push(`M ${px} ${py}`);
    } else {
      pathCommands.push(`L ${px} ${py}`);
    }
  }

  pathCommands.push('Z');
  return pathCommands.join(' ');
}

/**
 * Computes the axis-aligned bounding box of a vector shape based on its SVG paths.
 */
export function getShapeBounds(shape: ShapeElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const path of shape.paths) {
    const d = path.d;
    const nums = d.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!nums || nums.length < 2) continue;

    // Check for oval arc command
    if (d.includes(' a ') || d.includes(' A ')) {
      const rY = parseFloat(nums[1]) || 20;
      const rw = parseFloat(nums[7]) || rY * 2;
      const rh = rY * 2;
      minX = Math.min(minX, 0);
      minY = Math.min(minY, 0);
      maxX = Math.max(maxX, rw);
      maxY = Math.max(maxY, rh);
      continue;
    }

    // Path points (pairs of x, y)
    for (let i = 0; i < nums.length - 1; i += 2) {
      const px = parseFloat(nums[i]);
      const py = parseFloat(nums[i + 1]);
      if (!isNaN(px) && !isNaN(py)) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }
  }

  if (!isFinite(minX) || !isFinite(maxX)) {
    return { x: 0, y: 0, width: 40, height: 40 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(8, maxX - minX),
    height: Math.max(8, maxY - minY),
  };
}

export interface StarPreset {
  id: string;
  name: string;
  points: number;
  pointRatio: number;
}

export const STAR_PRESETS: StarPreset[] = [
  { id: 'star-5', name: '5-pt Star', points: 5, pointRatio: 0.5 },
  { id: 'star-6', name: '6-pt Star', points: 6, pointRatio: 0.58 },
  { id: 'pentagon', name: 'Pentagon', points: 5, pointRatio: 1.0 },
  { id: 'hexagon', name: 'Hexagon', points: 6, pointRatio: 1.0 },
  { id: 'sun-12', name: '12-pt Sun', points: 12, pointRatio: 0.75 },
  { id: 'burst-16', name: '16-pt Burst', points: 16, pointRatio: 0.35 },
  { id: 'extruded-4', name: '4-pt Extruded', points: 4, pointRatio: 1.4 },
];
