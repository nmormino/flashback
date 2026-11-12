import { describe, it, expect } from 'vitest';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';
import {
  unitePaths,
  subtractPaths,
  intersectPaths,
  excludePaths,
  expandStroke,
  fitPointsToCurve,
  splitCubicBezier,
  getPreciseCurveBounds,
  findClosestPointOnCurve,
  convertTextToVectorPath,
} from '../src/utils/geometry';

describe('Geometry Facade & Advanced Geometry Tools', () => {
  describe('Pathfinder Boolean Operations', () => {
    // Two overlapping 100x100 squares:
    // Rect 1: [0, 0] to [100, 100]
    // Rect 2: [50, 50] to [150, 150]
    const rect1 = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const rect2 = 'M 50 50 L 150 50 L 150 150 L 50 150 Z';

    it('unitePaths combines 2 overlapping rectangles into a single outer perimeter', () => {
      const united = unitePaths(rect1, rect2);
      expect(united).toBeDefined();
      expect(united.length).toBeGreaterThan(0);
      // The union should be an L-like polygon without the internal intersecting lines
      expect(united.toLowerCase()).toContain('m');
      expect(united.toLowerCase()).toContain('z');

      // Check precise bounds of united perimeter: x spans 0..150, y spans 0..150
      const bounds = getPreciseCurveBounds(united);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(150, 1);
      expect(bounds.maxY).toBeCloseTo(150, 1);
      expect(bounds.width).toBeCloseTo(150, 1);
      expect(bounds.height).toBeCloseTo(150, 1);
    });

    it('unitePaths handles empty or whitespace paths gracefully', () => {
      expect(unitePaths('', rect1)).toBe(rect1);
      expect(unitePaths(rect1, '  ')).toBe(rect1);
      expect(unitePaths('', '')).toBe('');
    });

    it('subtractPaths subtracts the overlapping front path from the base path (Minus Front)', () => {
      // Subtract rect2 from rect1: retains the [0,0]->[100,100] rect minus [50,50]->[100,100]
      const subtracted = subtractPaths(rect1, rect2);
      expect(subtracted).toBeDefined();
      expect(subtracted.length).toBeGreaterThan(0);

      const bounds = getPreciseCurveBounds(subtracted);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.maxY).toBeCloseTo(100, 1);
    });

    it('subtractPaths with empty paths', () => {
      expect(subtractPaths(rect1, '')).toBe(rect1);
      expect(subtractPaths('', rect2)).toBe('');
    });

    it('intersectPaths computes the common overlapping region between paths', () => {
      const intersection = intersectPaths(rect1, rect2);
      expect(intersection).toBeDefined();
      expect(intersection.length).toBeGreaterThan(0);

      // Overlap region is [50, 50] to [100, 100]
      const bounds = getPreciseCurveBounds(intersection);
      expect(bounds.minX).toBeCloseTo(50, 1);
      expect(bounds.minY).toBeCloseTo(50, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.maxY).toBeCloseTo(100, 1);
      expect(bounds.width).toBeCloseTo(50, 1);
      expect(bounds.height).toBeCloseTo(50, 1);
    });

    it('intersectPaths on disjoint shapes yields empty string', () => {
      const disjoint1 = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
      const disjoint2 = 'M 100 100 L 110 100 L 110 110 L 100 110 Z';
      const result = intersectPaths(disjoint1, disjoint2);
      expect(result).toBe('');
    });

    it('excludePaths performs XOR / symmetric difference between paths', () => {
      const excluded = excludePaths(rect1, rect2);
      expect(excluded).toBeDefined();
      expect(excluded.length).toBeGreaterThan(0);

      // Total bounds encompass both non-overlapping corners [0, 0] to [150, 150]
      const bounds = getPreciseCurveBounds(excluded);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(150, 1);
    });
  });

  describe('Outline Stroke (expandStroke)', () => {
    it('expands an open straight line into a closed polygon with width and caps', () => {
      const line = 'M 10 10 L 100 10';
      const strokeWidth = 10;
      const outlined = expandStroke(line, strokeWidth, { cap: 'round', join: 'round' });

      expect(outlined).toBeDefined();
      expect(outlined.toLowerCase()).toContain('z');

      // A line from (10, 10) to (100, 10) of strokeWidth 10 with round caps:
      // x should span [5, 105], y should span [5, 15]
      const bounds = getPreciseCurveBounds(outlined);
      expect(bounds.minX).toBeCloseTo(5, 1);
      expect(bounds.maxX).toBeCloseTo(105, 1);
      expect(bounds.minY).toBeCloseTo(5, 1);
      expect(bounds.maxY).toBeCloseTo(15, 1);
      expect(bounds.width).toBeCloseTo(100, 1);
      expect(bounds.height).toBeCloseTo(10, 1);
    });

    it('expands stroke with butt and square caps', () => {
      const line = 'M 10 10 L 100 10';
      const buttOutlined = expandStroke(line, 4, { cap: 'butt' });
      expect(buttOutlined).toBeDefined();
      const buttBounds = getPreciseCurveBounds(buttOutlined);
      expect(buttBounds.minX).toBeCloseTo(10, 1);
      expect(buttBounds.maxX).toBeCloseTo(100, 1);

      const squareOutlined = expandStroke(line, 4, { cap: 'square' });
      expect(squareOutlined).toBeDefined();
      const squareBounds = getPreciseCurveBounds(squareOutlined);
      expect(squareBounds.minX).toBeCloseTo(8, 1);
      expect(squareBounds.maxX).toBeCloseTo(102, 1);
    });

    it('handles strokeWidth <= 0 or empty path safely', () => {
      expect(expandStroke('', 10)).toBe('');
      expect(expandStroke('M 0 0 L 10 10', 0)).toBe('M 0 0 L 10 10');
      expect(expandStroke('M 0 0 L 10 10', -2)).toBe('M 0 0 L 10 10');
    });
  });

  describe('Pencil Curve Fitting (fitPointsToCurve)', () => {
    it('turns 10 polyline points into a smooth cubic Bézier curve string', () => {
      // 10 raw digitized points forming an S-curve or arc
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 15 },
        { x: 20, y: 35 },
        { x: 30, y: 55 },
        { x: 40, y: 75 },
        { x: 50, y: 90 },
        { x: 60, y: 98 },
        { x: 70, y: 95 },
        { x: 80, y: 80 },
        { x: 90, y: 50 },
      ];

      const svgPath = fitPointsToCurve(points, 2.5);
      expect(svgPath).toBeDefined();
      expect(svgPath.startsWith('M')).toBe(true);
      expect(svgPath).toContain('C');

      // Bounds of fitted curve should roughly match points
      const bounds = getPreciseCurveBounds(svgPath);
      expect(bounds.minX).toBeCloseTo(0, 0);
      expect(bounds.maxX).toBeCloseTo(90, 0);
      expect(bounds.minY).toBeCloseTo(0, 0);
    });

    it('handles edge cases: 0 points, 1 point, 2 points, and closed loops', () => {
      expect(fitPointsToCurve([])).toBe('');

      const single = fitPointsToCurve([{ x: 15, y: 25 }]);
      expect(single).toBe('M 15 25');

      const twoPts = fitPointsToCurve([{ x: 10, y: 10 }, { x: 50, y: 50 }]);
      expect(twoPts).toBe('M 10 10 L 50 50');

      // Explicitly closed path
      const closed = fitPointsToCurve(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
          { x: 0, y: 50 },
        ],
        2.5,
        { closed: true }
      );
      expect(closed.endsWith('Z')).toBe(true);
    });

    it('deduplicates adjacent identical points without errors', () => {
      const dupes = [
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ];
      const res = fitPointsToCurve(dupes);
      expect(res.startsWith('M 10 10')).toBe(true);
    });
  });

  describe('Curve Math (splitCubicBezier & Analytical Extrema & Closest Point)', () => {
    it('splits a cubic Bézier curve at t = 0.5 into two valid subcurves using de Casteljau', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 0, y: 100 };
      const p2 = { x: 100, y: 100 };
      const p3 = { x: 100, y: 0 };

      const result = splitCubicBezier(p0, p1, p2, p3, 0.5);

      // Verify destructuring as array and property access
      const [leftArray, rightArray] = result;
      const { left, right } = result;

      expect(leftArray).toEqual(left);
      expect(rightArray).toEqual(right);
      expect(left).toHaveLength(4);
      expect(right).toHaveLength(4);

      // Start of left should be p0
      expect(left[0].x).toBeCloseTo(0, 2);
      expect(left[0].y).toBeCloseTo(0, 2);

      // End of right should be p3
      expect(right[3].x).toBeCloseTo(100, 2);
      expect(right[3].y).toBeCloseTo(0, 2);

      // Split midpoint (left[3] and right[0]) should match at t=0.5:
      // By Bézier formula: B(0.5) = (0.5)^3*p0 + 3*(0.5)^3*p1 + 3*(0.5)^3*p2 + (0.5)^3*p3
      // x = 0 + 3*(0.125)*0 + 3*(0.125)*100 + 0.125*100 = 37.5 + 12.5 = 50
      // y = 0 + 3*(0.125)*100 + 3*(0.125)*100 + 0 = 37.5 + 37.5 = 75
      expect(left[3].x).toBeCloseTo(50, 2);
      expect(left[3].y).toBeCloseTo(75, 2);
      expect(right[0].x).toBeCloseTo(50, 2);
      expect(right[0].y).toBeCloseTo(75, 2);
    });

    it('calculates true analytical extrema bounds (tighter than control point bounding box)', () => {
      // In this cubic curve, control points reach y = 100, but curve extrema is y = 75
      const d = 'M 0 0 C 10 100 90 100 100 0';
      const bounds = getPreciseCurveBounds(d);

      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      expect(bounds.maxY).toBeCloseTo(75, 1);
      // Strictly less than control point y=100
      expect(bounds.maxY).toBeLessThan(80);
      expect(bounds.height).toBeCloseTo(75, 1);
    });

    it('finds the closest point on an SVG curve to a target query point', () => {
      const d = 'M 0 0 C 0 100 100 100 100 0';
      // Query near the peak of the curve (50, 75)
      const queryPoint = { x: 50, y: 80 };
      const closest = findClosestPointOnCurve(d, queryPoint);

      expect(closest.x).toBeCloseTo(50, 1);
      expect(closest.y).toBeCloseTo(75, 1);
      expect(closest.t).toBeCloseTo(0.5, 1);
      expect(closest.distance).toBeCloseTo(5, 1);
      expect(closest.point.x).toBeCloseTo(closest.x, 1);
      expect(closest.point.y).toBeCloseTo(closest.y, 1);
    });
  });

  describe('Text Outlines (convertTextToVectorPath)', () => {
    // Generate a minimal valid in-memory TTF font for testing
    function createMockFontBuffer(): ArrayBuffer {
      const glyphA = new opentype.Glyph({
        name: 'A',
        unicode: 65,
        advanceWidth: 600,
        path: new opentype.Path(),
      });
      // Triangle glyph
      glyphA.path.moveTo(0, 0);
      glyphA.path.lineTo(300, 700);
      glyphA.path.lineTo(600, 0);
      glyphA.path.close();

      const notdef = new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: 500,
        path: new opentype.Path(),
      });

      const font = new opentype.Font({
        familyName: 'MockFont',
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs: [notdef, glyphA],
      });

      return font.toArrayBuffer();
    }

    it('converts text into vector SVG path using standard TTF buffer', async () => {
      const ttfBuffer = createMockFontBuffer();
      const pathData = await convertTextToVectorPath('A', ttfBuffer, { fontSize: 100 });

      expect(pathData).toBeDefined();
      expect(pathData.length).toBeGreaterThan(0);
      expect(pathData.toLowerCase()).toContain('m');
      expect(pathData.toLowerCase()).toContain('l');
    });

    it('decompresses WOFF2 font and converts text into vector path', async () => {
      const ttfBuffer = createMockFontBuffer();
      // Compress TTF buffer to WOFF2 using wawoff2
      const compressedWoff2 = await wawoff2.compress(new Uint8Array(ttfBuffer));
      const woff2Buffer = compressedWoff2.buffer.slice(
        compressedWoff2.byteOffset,
        compressedWoff2.byteOffset + compressedWoff2.byteLength
      );

      const ttfPath = await convertTextToVectorPath('A', ttfBuffer, { fontSize: 80 });
      const woff2Path = await convertTextToVectorPath('A', woff2Buffer, {
        fontSize: 80,
        isWoff2: true,
      });

      expect(woff2Path).toBeDefined();
      expect(woff2Path.length).toBeGreaterThan(0);
      // Both should yield the exact same vector outlines
      expect(woff2Path).toBe(ttfPath);
    });

    it('returns empty string for empty text', async () => {
      const ttfBuffer = createMockFontBuffer();
      const pathData = await convertTextToVectorPath('', ttfBuffer);
      expect(pathData).toBe('');
    });
  });
});
