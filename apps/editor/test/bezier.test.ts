import { describe, it, expect } from 'vitest';
import { parseSvgPath, formatSvgPath, updatePathAnchor } from '../src/utils/bezier';

describe('Bézier Vector Utilities', () => {
  it('parses straight line paths (M and L commands)', () => {
    const d = 'M 10 10 L 50 10 L 50 50 Z';
    const parsed = parseSvgPath(d);
    expect(parsed.anchors).toHaveLength(3);
    expect(parsed.closed).toBe(true);
    expect(parsed.anchors[0]).toEqual({ x: 10, y: 10 });
    expect(parsed.anchors[1]).toEqual({ x: 50, y: 10 });
    expect(parsed.anchors[2]).toEqual({ x: 50, y: 50 });
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
});
