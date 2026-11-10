import type {
  ShapeElement,
  CornerType,
  RectCornerRadius,
  RectCornerTypes,
  OvalConfig,
} from '@flashback/runtime';
import { parseSvgPath, formatSvgPath } from './bezier';

const KAPPA = 0.5522847498;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeCornerRadii(
  radii: number | RectCornerRadius | undefined,
  maxRadius = Infinity
): RectCornerRadius {
  const clamp = (v: number) => Math.max(0, Math.min(maxRadius, Number.isFinite(v) ? v : 0));
  if (typeof radii === 'number') {
    const r = clamp(radii);
    return { tl: r, tr: r, br: r, bl: r };
  }
  if (radii && typeof radii === 'object') {
    return {
      tl: clamp(radii.tl),
      tr: clamp(radii.tr),
      br: clamp(radii.br),
      bl: clamp(radii.bl),
    };
  }
  return { tl: 0, tr: 0, br: 0, bl: 0 };
}

export function isUniformCornerRadius(radii: number | RectCornerRadius | undefined): boolean {
  if (radii === undefined || typeof radii === 'number') return true;
  return (
    Math.abs(radii.tl - radii.tr) < 0.01 &&
    Math.abs(radii.tl - radii.br) < 0.01 &&
    Math.abs(radii.tl - radii.bl) < 0.01
  );
}

export function getUniformCornerRadius(radii: number | RectCornerRadius | undefined): number {
  if (radii === undefined) return 0;
  if (typeof radii === 'number') return Math.max(0, radii);
  return Math.max(0, radii.tl);
}

export function normalizeCornerTypes(
  cornerType: CornerType | RectCornerTypes | undefined
): RectCornerTypes {
  if (cornerType && typeof cornerType === 'object') {
    return {
      tl: cornerType.tl ?? 'round',
      tr: cornerType.tr ?? 'round',
      br: cornerType.br ?? 'round',
      bl: cornerType.bl ?? 'round',
    };
  }
  const ct: CornerType = cornerType ?? 'round';
  return { tl: ct, tr: ct, br: ct, bl: ct };
}

export function isUniformCornerType(
  cornerType: CornerType | RectCornerTypes | undefined
): boolean {
  if (!cornerType || typeof cornerType === 'string') return true;
  return (
    cornerType.tl === cornerType.tr &&
    cornerType.tl === cornerType.br &&
    cornerType.tl === cornerType.bl
  );
}

export function getUniformCornerType(
  cornerType: CornerType | RectCornerTypes | undefined
): CornerType {
  if (!cornerType) return 'round';
  if (typeof cornerType === 'string') return cornerType;
  return cornerType.tl ?? 'round';
}

/**
 * Generates an Adobe Illustrator-style SVG path string for a rectangle with live corners.
 * Supports uniform or per-corner radii and uniform or per-corner styles ('round', 'inverted', or 'chamfer').
 */
export function generateRoundedRectPath(
  width: number,
  height: number,
  cornerRadius: number | RectCornerRadius = 0,
  cornerType: CornerType | RectCornerTypes = 'round',
  offsetX = 0,
  offsetY = 0
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const maxR = Math.min(w, h) / 2;
  const { tl, tr, br, bl } = normalizeCornerRadii(cornerRadius, maxR);
  const types = normalizeCornerTypes(cornerType);
  const x = offsetX;
  const y = offsetY;

  if (tl <= 0.01 && tr <= 0.01 && br <= 0.01 && bl <= 0.01) {
    return `M ${round2(x)} ${round2(y)} L ${round2(x + w)} ${round2(y)} L ${round2(x + w)} ${round2(y + h)} L ${round2(x)} ${round2(y + h)} Z`;
  }

  const cmds: string[] = [];
  cmds.push(`M ${round2(x + tl)} ${round2(y)}`);
  cmds.push(`L ${round2(x + w - tr)} ${round2(y)}`);

  // Top-Right Corner
  if (tr > 0.01) {
    if (types.tr === 'chamfer') {
      cmds.push(`L ${round2(x + w)} ${round2(y + tr)}`);
    } else if (types.tr === 'inverted') {
      cmds.push(
        `C ${round2(x + w - tr)} ${round2(y + tr * KAPPA)} ${round2(x + w - tr * KAPPA)} ${round2(y + tr)} ${round2(x + w)} ${round2(y + tr)}`
      );
    } else {
      cmds.push(
        `C ${round2(x + w - tr + tr * KAPPA)} ${round2(y)} ${round2(x + w)} ${round2(y + tr - tr * KAPPA)} ${round2(x + w)} ${round2(y + tr)}`
      );
    }
  }

  cmds.push(`L ${round2(x + w)} ${round2(y + h - br)}`);

  // Bottom-Right Corner
  if (br > 0.01) {
    if (types.br === 'chamfer') {
      cmds.push(`L ${round2(x + w - br)} ${round2(y + h)}`);
    } else if (types.br === 'inverted') {
      cmds.push(
        `C ${round2(x + w - br * KAPPA)} ${round2(y + h - br)} ${round2(x + w - br)} ${round2(y + h - br * KAPPA)} ${round2(x + w - br)} ${round2(y + h)}`
      );
    } else {
      cmds.push(
        `C ${round2(x + w)} ${round2(y + h - br + br * KAPPA)} ${round2(x + w - br + br * KAPPA)} ${round2(y + h)} ${round2(x + w - br)} ${round2(y + h)}`
      );
    }
  }

  cmds.push(`L ${round2(x + bl)} ${round2(y + h)}`);

  // Bottom-Left Corner
  if (bl > 0.01) {
    if (types.bl === 'chamfer') {
      cmds.push(`L ${round2(x)} ${round2(y + h - bl)}`);
    } else if (types.bl === 'inverted') {
      cmds.push(
        `C ${round2(x + bl)} ${round2(y + h - bl * KAPPA)} ${round2(x + bl * KAPPA)} ${round2(y + h - bl)} ${round2(x)} ${round2(y + h - bl)}`
      );
    } else {
      cmds.push(
        `C ${round2(x + bl - bl * KAPPA)} ${round2(y + h)} ${round2(x)} ${round2(y + h - bl + bl * KAPPA)} ${round2(x)} ${round2(y + h - bl)}`
      );
    }
  }

  cmds.push(`L ${round2(x)} ${round2(y + tl)}`);

  // Top-Left Corner
  if (tl > 0.01) {
    if (types.tl === 'chamfer') {
      cmds.push(`L ${round2(x + tl)} ${round2(y)}`);
    } else if (types.tl === 'inverted') {
      cmds.push(
        `C ${round2(x + tl * KAPPA)} ${round2(y + tl)} ${round2(x + tl)} ${round2(y + tl * KAPPA)} ${round2(x + tl)} ${round2(y)}`
      );
    } else {
      cmds.push(
        `C ${round2(x)} ${round2(y + tl - tl * KAPPA)} ${round2(x + tl - tl * KAPPA)} ${round2(y)} ${round2(x + tl)} ${round2(y)}`
      );
    }
  }

  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Generates an SVG path string for an ellipse, donut ring, or pie slice.
 */
export function generateOvalPath(
  rx: number,
  ry: number,
  config?: Partial<OvalConfig>
): string {
  const rX = Math.max(2, rx);
  const rY = Math.max(2, ry);
  const cx = rX;
  const cy = rY;
  const innerRatio = Math.max(0, Math.min(0.92, config?.innerRadiusRatio ?? 0));
  const startDeg = config?.startAngle ?? 0;
  const endDeg = config?.endAngle ?? 360;
  const spanDeg = Math.abs(endDeg - startDeg);

  // Full ellipse or full donut
  if (spanDeg >= 359.9) {
    const outer = `M 0 ${round2(rY)} a ${round2(rX)} ${round2(rY)} 0 1 0 ${round2(rX * 2)} 0 a ${round2(rX)} ${round2(rY)} 0 1 0 ${round2(-rX * 2)} 0 Z`;
    if (innerRatio <= 0.005) {
      return outer;
    }
    const irX = rX * innerRatio;
    const irY = rY * innerRatio;
    const innerStartX = cx - irX;
    // Counter-clockwise inner ellipse for hole cutout
    const inner = `M ${round2(innerStartX)} ${round2(cy)} a ${round2(irX)} ${round2(irY)} 0 1 1 ${round2(irX * 2)} 0 a ${round2(irX)} ${round2(irY)} 0 1 1 ${round2(-irX * 2)} 0 Z`;
    return `${outer} ${inner}`;
  }

  // Pie / Arc sector (approximated with high-precision cubic/linear segments so bounding box & Subselect work)
  const sRad = (startDeg * Math.PI) / 180;
  const eRad = (endDeg * Math.PI) / 180;
  const steps = Math.max(8, Math.ceil((spanDeg / 360) * 32));
  const cmds: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = sRad + (eRad - sRad) * t;
    const px = round2(cx + rX * Math.cos(ang));
    const py = round2(cy + rY * Math.sin(ang));
    cmds.push(i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`);
  }

  if (innerRatio > 0.005) {
    const irX = rX * innerRatio;
    const irY = rY * innerRatio;
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const ang = sRad + (eRad - sRad) * t;
      const px = round2(cx + irX * Math.cos(ang));
      const py = round2(cy + irY * Math.sin(ang));
      cmds.push(`L ${px} ${py}`);
    }
  } else {
    cmds.push(`L ${round2(cx)} ${round2(cy)}`);
  }

  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Generates an SVG path string for a regular polygon or an extruded star,
 * with optional live corner filleting (cornerRadius).
 *
 * @param cx Center X
 * @param cy Center Y
 * @param outerRadius Distance from center to outer vertices
 * @param points Number of outer vertices (default: 5)
 * @param pointRatio Ratio of inner radius to outer radius (1.0 = regular polygon, < 1.0 = star)
 * @param startAngle Starting rotation offset in radians (default: -PI/2 to point straight up)
 * @param cornerRadius Optional corner fillet radius in pixels (default: 0)
 */
export function generatePolygonStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  points = 5,
  pointRatio = 0.5,
  startAngle = -Math.PI / 2,
  cornerRadius = 0
): string {
  const pts = Math.max(3, points);
  const rOuter = Math.max(2, outerRadius);
  const isExtruded = Math.abs(pointRatio - 1.0) > 0.001;
  const totalVertices = isExtruded ? pts * 2 : pts;
  const angleStep = (Math.PI * 2) / totalVertices;

  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < totalVertices; i++) {
    const angle = startAngle + i * angleStep;
    let r = rOuter;
    if (isExtruded && i % 2 === 1) {
      r = rOuter * Math.max(0.05, Math.min(3.0, pointRatio));
    }
    vertices.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  const pathCommands: string[] = [];

  if (cornerRadius <= 0.1) {
    for (let i = 0; i < vertices.length; i++) {
      const px = round2(vertices[i].x);
      const py = round2(vertices[i].y);
      pathCommands.push(i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`);
    }
    pathCommands.push('Z');
    return pathCommands.join(' ');
  }

  // Rounded vertices using cubic Bézier fillets
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1) || 1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;

    const maxFillet = Math.min(len1, len2) * 0.45;
    const d = Math.min(cornerRadius, maxFillet);

    const p1x = curr.x + (dx1 / len1) * d;
    const p1y = curr.y + (dy1 / len1) * d;
    const p2x = curr.x + (dx2 / len2) * d;
    const p2y = curr.y + (dy2 / len2) * d;

    const c1x = p1x + (curr.x - p1x) * KAPPA;
    const c1y = p1y + (curr.y - p1y) * KAPPA;
    const c2x = p2x + (curr.x - p2x) * KAPPA;
    const c2y = p2y + (curr.y - p2y) * KAPPA;

    if (i === 0) {
      pathCommands.push(`M ${round2(p1x)} ${round2(p1y)}`);
    } else {
      pathCommands.push(`L ${round2(p1x)} ${round2(p1y)}`);
    }
    pathCommands.push(
      `C ${round2(c1x)} ${round2(c1y)} ${round2(c2x)} ${round2(c2y)} ${round2(p2x)} ${round2(p2y)}`
    );
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

export interface SharpVertexInfo {
  index: number;
  x: number;
  y: number;
  bisectorX: number;
  bisectorY: number;
  maxRadius: number;
}

/**
 * Returns the sharp corner vertices of a base SVG path along with their inward unit bisectors,
 * used for rendering Illustrator-style Live Corner widgets on arbitrary vector shapes.
 */
export function getSharpCornerVertices(baseD: string): SharpVertexInfo[] {
  const parsed = parseSvgPath(baseD);
  const n = parsed.anchors.length;
  if (n < 3 && !parsed.closed) {
    if (n < 3) return [];
  }
  const result: SharpVertexInfo[] = [];

  for (let i = 0; i < n; i++) {
    if (!parsed.closed && (i === 0 || i === n - 1)) continue;
    const curr = parsed.anchors[i];
    if (curr.handleIn || curr.handleOut) continue;

    const prev = parsed.anchors[(i - 1 + n) % n];
    const next = parsed.anchors[(i + 1) % n];
    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 2 || len2 < 2) continue;

    const u1x = dx1 / len1;
    const u1y = dy1 / len1;
    const u2x = dx2 / len2;
    const u2y = dy2 / len2;

    let bx = u1x + u2x;
    let by = u1y + u2y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 0.05) continue; // Nearly collinear (180° straight edge)
    bx /= bLen;
    by /= bLen;

    result.push({
      index: i,
      x: curr.x,
      y: curr.y,
      bisectorX: bx,
      bisectorY: by,
      maxRadius: Math.round(Math.min(len1, len2) * 0.45),
    });
  }

  return result;
}

/**
 * Applies Adobe Illustrator-style Live Corner Radius ('round', 'inverted', or 'chamfer')
 * to any arbitrary vector path `baseD`, supporting uniform radius/type as well as per-vertex overrides.
 */
export function applyCornerRadiusToPath(
  baseD: string,
  uniformRadius = 0,
  uniformType: CornerType = 'round',
  anchorRadii?: Record<number, number>,
  anchorTypes?: Record<number, CornerType>
): string {
  const parsed = parseSvgPath(baseD);
  const n = parsed.anchors.length;
  if (n < 3) return baseD;

  const hasAnyRadius =
    uniformRadius > 0.05 ||
    (anchorRadii !== undefined && Object.values(anchorRadii).some((v) => v > 0.05));
  if (!hasAnyRadius) {
    return baseD;
  }

  const outAnchors: Array<{
    x: number;
    y: number;
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  }> = [];

  for (let i = 0; i < n; i++) {
    const curr = parsed.anchors[i];
    const isEndpoint = !parsed.closed && (i === 0 || i === n - 1);
    const r = anchorRadii?.[i] !== undefined ? anchorRadii[i] : uniformRadius;
    const cType: CornerType = anchorTypes?.[i] ?? uniformType ?? 'round';

    if (isEndpoint || curr.handleIn || curr.handleOut || r <= 0.05) {
      outAnchors.push({
        x: curr.x,
        y: curr.y,
        handleIn: curr.handleIn ? { ...curr.handleIn } : undefined,
        handleOut: curr.handleOut ? { ...curr.handleOut } : undefined,
      });
      continue;
    }

    const prev = parsed.anchors[(i - 1 + n) % n];
    const next = parsed.anchors[(i + 1) % n];
    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;

    const d = Math.min(r, Math.min(len1, len2) * 0.45);
    if (d <= 0.05) {
      outAnchors.push({ x: curr.x, y: curr.y });
      continue;
    }

    const p1x = curr.x + (dx1 / len1) * d;
    const p1y = curr.y + (dy1 / len1) * d;
    const p2x = curr.x + (dx2 / len2) * d;
    const p2y = curr.y + (dy2 / len2) * d;

    if (cType === 'chamfer') {
      outAnchors.push({ x: round2(p1x), y: round2(p1y) });
      outAnchors.push({ x: round2(p2x), y: round2(p2y) });
    } else if (cType === 'inverted') {
      const invX = p1x + p2x - curr.x;
      const invY = p1y + p2y - curr.y;
      const c1x = round2(p1x + (invX - p1x) * KAPPA);
      const c1y = round2(p1y + (invY - p1y) * KAPPA);
      const c2x = round2(p2x + (invX - p2x) * KAPPA);
      const c2y = round2(p2y + (invY - p2y) * KAPPA);
      outAnchors.push({ x: round2(p1x), y: round2(p1y), handleOut: { x: c1x, y: c1y } });
      outAnchors.push({ x: round2(p2x), y: round2(p2y), handleIn: { x: c2x, y: c2y } });
    } else {
      const c1x = round2(p1x + (curr.x - p1x) * KAPPA);
      const c1y = round2(p1y + (curr.y - p1y) * KAPPA);
      const c2x = round2(p2x + (curr.x - p2x) * KAPPA);
      const c2y = round2(p2y + (curr.y - p2y) * KAPPA);
      outAnchors.push({ x: round2(p1x), y: round2(p1y), handleOut: { x: c1x, y: c1y } });
      outAnchors.push({ x: round2(p2x), y: round2(p2y), handleIn: { x: c2x, y: c2y } });
    }
  }

  return formatSvgPath(outAnchors, parsed.closed);
}
