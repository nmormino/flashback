import type { Transform } from '../schema';

export interface Point2D {
  x: number;
  y: number;
}

function cleanNumber(val: number): number {
  if (Math.abs(val) < 1e-12) return 0;
  return parseFloat(val.toFixed(6));
}

/**
 * 2D Affine Transformation Matrix (3x3):
 * [ a  c  tx ]
 * [ b  d  ty ]
 * [ 0  0  1  ]
 *
 * Transforms a column vector [x, y, 1]^T:
 *   x' = a * x + c * y + tx
 *   y' = b * x + d * y + ty
 */
export class Matrix2D {
  public a: number;
  public b: number;
  public c: number;
  public d: number;
  public tx: number;
  public ty: number;

  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  public static identity(): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, 0, 0);
  }

  public static translation(tx: number, ty: number): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, tx, ty);
  }

  public static scaling(sx: number, sy = sx): Matrix2D {
    return new Matrix2D(sx, 0, 0, sy, 0, 0);
  }

  public static rotation(angleRad: number): Matrix2D {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return new Matrix2D(cos, sin, -sin, cos, 0, 0);
  }

  public static rotationDeg(angleDeg: number): Matrix2D {
    return Matrix2D.rotation((angleDeg * Math.PI) / 180);
  }

  public static skewing(skewXRad: number, skewYRad: number): Matrix2D {
    const tanX = Math.tan(skewXRad);
    const tanY = Math.tan(skewYRad);
    return new Matrix2D(1, tanY, tanX, 1, 0, 0);
  }

  public static skewingDeg(skewXDeg: number, skewYDeg: number): Matrix2D {
    return Matrix2D.skewing((skewXDeg * Math.PI) / 180, (skewYDeg * Math.PI) / 180);
  }

  public static fromArray(arr: [number, number, number, number, number, number] | readonly number[] | number[]): Matrix2D {
    return new Matrix2D(arr[0] ?? 1, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 1, arr[4] ?? 0, arr[5] ?? 0);
  }

  /**
   * Constructs a Matrix2D from a schema Transform object.
   * Order of operations:
   * 1. Translate by (-originX, -originY) so the registration point is at (0, 0)
   * 2. Apply skew
   * 3. Apply scale
   * 4. Apply rotation
   * 5. Translate by (x, y)
   *
   * As a result, the registration point (originX, originY) is positioned at (x, y) in the parent space.
   */
  public static fromTransform(transform: Partial<Transform>): Matrix2D {
    const x = transform.x ?? 0;
    const y = transform.y ?? 0;
    const scaleX = transform.scaleX ?? 1;
    const scaleY = transform.scaleY ?? 1;
    const rotation = transform.rotation ?? 0;
    const skewX = transform.skewX ?? 0;
    const skewY = transform.skewY ?? 0;
    const originX = transform.originX ?? 0;
    const originY = transform.originY ?? 0;

    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let a: number;
    let b: number;
    let c: number;
    let d: number;

    if (skewX === 0 && skewY === 0) {
      a = scaleX * cos;
      b = scaleX * sin;
      c = -scaleY * sin;
      d = scaleY * cos;
    } else {
      const skxRad = (skewX * Math.PI) / 180;
      const skyRad = (skewY * Math.PI) / 180;
      const tanX = Math.tan(skxRad);
      const tanY = Math.tan(skyRad);

      a = scaleX * cos - scaleY * sin * tanY;
      b = scaleX * sin + scaleY * cos * tanY;
      c = scaleX * cos * tanX - scaleY * sin;
      d = scaleX * sin * tanX + scaleY * cos;
    }

    const tx = x - (a * originX + c * originY);
    const ty = y - (b * originX + d * originY);

    return new Matrix2D(a, b, c, d, tx, ty);
  }

  /**
   * Multiplies this matrix by another (this * other).
   * Transforms by `other` first, then `this`.
   * (e.g. M_world = M_parent.multiply(M_child)).
   */
  public multiply(other: Matrix2D): Matrix2D {
    return new Matrix2D(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.tx + this.c * other.ty + this.tx,
      this.b * other.tx + this.d * other.ty + this.ty
    );
  }

  /**
   * Prepends another matrix (other * this).
   */
  public prepend(other: Matrix2D): Matrix2D {
    return other.multiply(this);
  }

  /**
   * Inverts the affine matrix. If the determinant is approximately 0, returns an identity matrix.
   */
  public invert(): Matrix2D {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-14) {
      return Matrix2D.identity();
    }
    const invDet = 1 / det;
    return new Matrix2D(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.ty - this.d * this.tx) * invDet,
      (this.b * this.tx - this.a * this.ty) * invDet
    );
  }

  /**
   * Transforms a 2D point by this matrix.
   */
  public transformPoint(p: Point2D): Point2D {
    return {
      x: this.a * p.x + this.c * p.y + this.tx,
      y: this.b * p.x + this.d * p.y + this.ty,
    };
  }

  /**
   * Inversely transforms a 2D point (maps from transformed space back to local space).
   */
  public inverseTransformPoint(p: Point2D): Point2D {
    return this.invert().transformPoint(p);
  }

  /**
   * Emits a standard CSS `matrix(a, b, c, d, tx, ty)` string.
   */
  public toCSS(): string {
    return `matrix(${cleanNumber(this.a)}, ${cleanNumber(this.b)}, ${cleanNumber(this.c)}, ${cleanNumber(this.d)}, ${cleanNumber(this.tx)}, ${cleanNumber(this.ty)})`;
  }

  public toArray(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.tx, this.ty];
  }

  public clone(): Matrix2D {
    return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }

  public equals(other: Matrix2D, epsilon = 1e-6): boolean {
    return (
      Math.abs(this.a - other.a) <= epsilon &&
      Math.abs(this.b - other.b) <= epsilon &&
      Math.abs(this.c - other.c) <= epsilon &&
      Math.abs(this.d - other.d) <= epsilon &&
      Math.abs(this.tx - other.tx) <= epsilon &&
      Math.abs(this.ty - other.ty) <= epsilon
    );
  }
}

export function transformToMatrix(transform: Partial<Transform>): Matrix2D {
  return Matrix2D.fromTransform(transform);
}

export function transformToCSS(transform: Partial<Transform>): string {
  const baseMatrix = Matrix2D.fromTransform(transform).toCSS();
  const rx = transform.rotateX ? cleanNumber(transform.rotateX) : 0;
  const ry = transform.rotateY ? cleanNumber(transform.rotateY) : 0;
  if (rx !== 0 || ry !== 0) {
    const persp = transform.perspective ? cleanNumber(transform.perspective) : 800;
    return `perspective(${persp}px) rotateX(${rx}deg) rotateY(${ry}deg) ${baseMatrix}`;
  }
  return baseMatrix;
}
