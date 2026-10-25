import { describe, it, expect } from 'vitest';
import { Matrix2D, transformToMatrix, transformToCSS } from '../src/math/Matrix2D';
import type { Transform } from '../src/schema';

describe('Matrix2D affine math', () => {
  it('creates identity matrix', () => {
    const m = Matrix2D.identity();
    expect(m.toArray()).toEqual([1, 0, 0, 1, 0, 0]);
    expect(m.toCSS()).toBe('matrix(1, 0, 0, 1, 0, 0)');
  });

  it('transforms 2D points with translation and scale', () => {
    const t = Matrix2D.translation(10, 20);
    const s = Matrix2D.scaling(2, 3);
    const combined = t.multiply(s); // scale then translate

    const p = combined.transformPoint({ x: 5, y: 5 });
    expect(p.x).toBe(20); // 5 * 2 + 10
    expect(p.y).toBe(35); // 5 * 3 + 20
  });

  it('rotates points correctly', () => {
    const rot90 = Matrix2D.rotationDeg(90);
    const p = rot90.transformPoint({ x: 10, y: 0 });
    expect(Math.round(p.x)).toBe(0);
    expect(Math.round(p.y)).toBe(10);
  });

  it('inverts affine matrices', () => {
    const m = Matrix2D.translation(15, -25)
      .multiply(Matrix2D.rotationDeg(45))
      .multiply(Matrix2D.scaling(2, 1.5));

    const inv = m.invert();
    const identityCheck = m.multiply(inv);
    expect(identityCheck.equals(Matrix2D.identity(), 1e-4)).toBe(true);

    const pt = { x: 40, y: -10 };
    const transformed = m.transformPoint(pt);
    const roundTrip = inv.transformPoint(transformed);
    expect(roundTrip.x).toBeCloseTo(pt.x, 4);
    expect(roundTrip.y).toBeCloseTo(pt.y, 4);
  });

  it('handles non-invertible singular matrices gracefully', () => {
    const zero = new Matrix2D(0, 0, 0, 0, 0, 0);
    const inv = zero.invert();
    expect(inv.equals(Matrix2D.identity())).toBe(true);
  });

  it('converts schema Transform to Matrix2D and CSS string', () => {
    const transform: Transform = {
      x: 100,
      y: 200,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      originX: 0,
      originY: 0,
    };

    const m = transformToMatrix(transform);
    expect(m.tx).toBe(100);
    expect(m.ty).toBe(200);
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
    expect(transformToCSS(transform)).toBe('matrix(2, 0, 0, 2, 100, 200)');
  });

  it('matches Flash registration point behavior with originX and originY', () => {
    // If registration/origin is (50, 50) and placed at (100, 100):
    // The registration point itself must map exactly to (100, 100)
    const transform: Transform = {
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 90,
      skewX: 0,
      skewY: 0,
      originX: 50,
      originY: 50,
    };

    const m = Matrix2D.fromTransform(transform);

    // Registration point (50, 50) maps to (100, 100)
    const regPointTransformed = m.transformPoint({ x: 50, y: 50 });
    expect(regPointTransformed.x).toBeCloseTo(100, 4);
    expect(regPointTransformed.y).toBeCloseTo(100, 4);

    // A point 10px to the right of registration: (60, 50) rotated 90 deg -> (100, 110)
    const rightPoint = m.transformPoint({ x: 60, y: 50 });
    expect(rightPoint.x).toBeCloseTo(100, 4);
    expect(rightPoint.y).toBeCloseTo(110, 4);
  });

  it('computes analytical closed-form transform with exact match to transformation pipeline', () => {
    const transform: Transform = {
      x: 125.5,
      y: -43.2,
      scaleX: 1.8,
      scaleY: -0.6,
      rotation: 37.5,
      skewX: 15,
      skewY: -10,
      originX: 32,
      originY: 64,
    };

    // Calculate reference via multi-matrix pipeline
    const rad = (transform.rotation * Math.PI) / 180;
    const skxRad = (transform.skewX * Math.PI) / 180;
    const skyRad = (transform.skewY * Math.PI) / 180;
    const tNeg = Matrix2D.translation(-transform.originX, -transform.originY);
    const mSkew = Matrix2D.skewing(skxRad, skyRad);
    const mScale = Matrix2D.scaling(transform.scaleX, transform.scaleY);
    const mRot = Matrix2D.rotation(rad);
    const tPos = Matrix2D.translation(transform.x, transform.y);
    const expected = tPos.multiply(mRot).multiply(mScale).multiply(mSkew).multiply(tNeg);

    const actual = Matrix2D.fromTransform(transform);

    expect(actual.a).toBeCloseTo(expected.a, 10);
    expect(actual.b).toBeCloseTo(expected.b, 10);
    expect(actual.c).toBeCloseTo(expected.c, 10);
    expect(actual.d).toBeCloseTo(expected.d, 10);
    expect(actual.tx).toBeCloseTo(expected.tx, 10);
    expect(actual.ty).toBeCloseTo(expected.ty, 10);

    // Registration point (32, 64) must map directly to (125.5, -43.2)
    const regPt = actual.transformPoint({ x: 32, y: 64 });
    expect(regPt.x).toBeCloseTo(125.5, 6);
    expect(regPt.y).toBeCloseTo(-43.2, 6);
  });
});

