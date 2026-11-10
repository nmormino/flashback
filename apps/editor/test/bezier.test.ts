import { describe, it, expect } from 'vitest';
import {
  parseSvgPath,
  formatSvgPath,
  updatePathAnchor,
  toggleAnchorPointType,
  getAnchorPointType,
} from '../src/utils/bezier';

describe('Bézier Vector Utilities', () => {
  it('parses straight line paths (M and L commands)', () => {
    const d = 'M 10 10 L 50 10 L 50 50 Z';
    const parsed = parseSvgPath(d);
    expect(parsed.anchors).toHaveLength(3);
    expect(parsed.closed).toBe(true);
    expect(parsed.anchors[0]).toEqual({ x: 10, y: 10, pointType: 'corner' });
    expect(parsed.anchors[1]).toEqual({ x: 50, y: 10, pointType: 'corner' });
    expect(parsed.anchors[2]).toEqual({ x: 50, y: 50, pointType: 'corner' });
  });

  it('parses cubic Bézier paths with handles (C commands)', () => {
    const d = 'M 0 0 C 10 20 30 40 50 50';
    const parsed = parseSvgPath(d);
    expect(parsed.anchors).toHaveLength(2);
    expect(parsed.anchors[0].x).toBe(0);
    expect(parsed.anchors[0].y).toBe(0);
    expect(parsed.anchors[0].handleOut).toEqual({ x: 10, y: 20 });
    expect(parsed.anchors[1].x).toBe(50);
    expect(parsed.anchors[1].y).toBe(50);
    expect(parsed.anchors[1].handleIn).toEqual({ x: 30, y: 40 });
  });

  it('formats anchors with Bézier handles back into an SVG path', () => {
    const anchors = [
      { x: 0, y: 0, handleOut: { x: 10, y: 20 } },
      { x: 50, y: 50, handleIn: { x: 30, y: 40 } },
    ];
    const pathStr = formatSvgPath(anchors, false);
    expect(pathStr).toBe('M 0 0 C 10.00 20.00 30.00 40.00 50.00 50.00');
  });

  it('updates an anchor point position while shifting handles', () => {
    const d = 'M 0 0 C 10 20 30 40 50 50';
    const updated = updatePathAnchor(d, 0, { delta: { x: 5, y: 10 } });
    const parsed = parseSvgPath(updated);
    expect(parsed.anchors[0].x).toBe(5);
    expect(parsed.anchors[0].y).toBe(10);
    expect(parsed.anchors[0].handleOut).toEqual({ x: 15, y: 30 });
  });

  it('updates individual handle control coordinates', () => {
    const d = 'M 0 0 C 10 20 30 40 50 50';
    const updated = updatePathAnchor(d, 0, { handleOut: { x: 12, y: 25 } });
    const parsed = parseSvgPath(updated);
    expect(parsed.anchors[0].handleOut).toEqual({ x: 12, y: 25 });
  });

  it('detects smooth vs corner point types according to Illustrator rules', () => {
    // Sharp anchor with no handles -> Corner
    const cornerAnchor = { x: 50, y: 50 };
    expect(getAnchorPointType(cornerAnchor)).toBe('corner');

    // Anchor with collinear handles (180° opposite) -> Smooth
    const smoothAnchor = {
      x: 50,
      y: 50,
      handleIn: { x: 30, y: 50 },  // 20px left
      handleOut: { x: 70, y: 50 }, // 20px right
    };
    expect(getAnchorPointType(smoothAnchor)).toBe('smooth');

    // Anchor with non-collinear handles (90° corner) -> Corner
    const cuspedAnchor = {
      x: 50,
      y: 50,
      handleIn: { x: 30, y: 50 },  // left
      handleOut: { x: 50, y: 70 }, // down
    };
    expect(getAnchorPointType(cuspedAnchor)).toBe('corner');
  });

  it('toggles anchor point between corner and smooth point types', () => {
    // Closed triangle with 3 sharp corner points
    const triangleD = 'M 0 0 L 100 0 L 50 80 Z';
    const parsed = parseSvgPath(triangleD);
    expect(parsed.anchors[1].pointType).toBe('corner');

    // Toggle anchor #1 (100, 0) from Corner to Smooth
    const toSmooth = toggleAnchorPointType(triangleD, 1);
    expect(toSmooth.newType).toBe('smooth');
    expect(toSmooth.anchors[1].handleIn).toBeDefined();
    expect(toSmooth.anchors[1].handleOut).toBeDefined();

    // Verify handles are collinear (opposite directions)
    const a1 = toSmooth.anchors[1];
    const dxIn = a1.handleIn!.x - a1.x;
    const dyIn = a1.handleIn!.y - a1.y;
    const dxOut = a1.handleOut!.x - a1.x;
    const dyOut = a1.handleOut!.y - a1.y;
    // Dot product should be negative (opposite directions)
    const dot = (dxIn * dxOut + dyIn * dyOut) / (Math.hypot(dxIn, dyIn) * Math.hypot(dxOut, dyOut));
    expect(dot).toBeLessThan(-0.9);

    // Toggle anchor #1 again: Smooth -> Corner (retracts handles)
    const toCorner = toggleAnchorPointType(toSmooth.d, 1);
    expect(toCorner.newType).toBe('corner');
    expect(toCorner.anchors[1].handleIn).toBeUndefined();
    expect(toCorner.anchors[1].handleOut).toBeUndefined();
  });

  it('smooth point handles rotate collinearly when one handle is dragged', () => {
    // Path with smooth anchor at index 1: (50, 50) with handleIn at (30, 50) and handleOut at (75, 50)
    const d = 'M 0 50 C 10 50 30 50 50 50 C 75 50 90 50 100 50';
    const parsed = parseSvgPath(d);
    expect(parsed.anchors[1].pointType).toBe('smooth');

    // Drag handleIn upwards to (30, 30) (vector: -20, -20)
    const updated = updatePathAnchor(d, 1, { handleIn: { x: 30, y: 30 } });
    const afterDrag = parseSvgPath(updated);

    expect(afterDrag.anchors[1].handleIn).toEqual({ x: 30, y: 30 });
    // handleOut must have rotated downwards to stay 180° opposite collinear!
    // Direction vector from anchor (50, 50) to handleOut must be (+20, +20) normalized * original length (25)
    expect(afterDrag.anchors[1].handleOut!.x).toBeGreaterThan(50);
    expect(afterDrag.anchors[1].handleOut!.y).toBeGreaterThan(50);

    // Verify collinearity
    const a = afterDrag.anchors[1];
    const vIn = { x: a.handleIn!.x - a.x, y: a.handleIn!.y - a.y };
    const vOut = { x: a.handleOut!.x - a.x, y: a.handleOut!.y - a.y };
    const dot = (vIn.x * vOut.x + vIn.y * vOut.y) / (Math.hypot(vIn.x, vIn.y) * Math.hypot(vOut.x, vOut.y));
    expect(dot).toBeCloseTo(-1, 1);
  });

  it('corner point handles move independently without affecting the opposite handle', () => {
    // Cusp/corner anchor with independent handles
    const d = 'M 0 50 C 10 50 30 50 50 50 C 50 70 50 90 50 100';
    const parsed = parseSvgPath(d);
    // Explicitly corner point
    expect(parsed.anchors[1].pointType).toBe('corner');

    // Drag handleIn upwards
    const updated = updatePathAnchor(d, 1, {
      handleIn: { x: 30, y: 20 },
      pointType: 'corner',
    });
    const afterDrag = parseSvgPath(updated);

    expect(afterDrag.anchors[1].handleIn).toEqual({ x: 30, y: 20 });
    // handleOut remains completely unchanged at (50, 70)!
    expect(afterDrag.anchors[1].handleOut).toEqual({ x: 50, y: 70 });
  });

  it('holding Alt breaks collinearity on a smooth point and converts to corner', () => {
    const d = 'M 0 50 C 10 50 30 50 50 50 C 70 50 90 50 100 50';
    const updated = updatePathAnchor(d, 1, {
      handleIn: { x: 30, y: 20 },
      breakHandles: true,
    });
    const afterDrag = parseSvgPath(updated);

    expect(afterDrag.anchors[1].handleIn).toEqual({ x: 30, y: 20 });
    // handleOut remains at original position, NOT rotated
    expect(afterDrag.anchors[1].handleOut).toEqual({ x: 70, y: 50 });
  });
});
