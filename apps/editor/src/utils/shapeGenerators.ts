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
      r = rOuter * Math.max(0.05, Math.min(2.0, pointRatio));
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
