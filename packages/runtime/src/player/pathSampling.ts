export interface PathSample {
  x: number;
  y: number;
  tangentDeg: number;
}

export interface PathSampler {
  totalLength: number;
  sample(t: number): PathSample;
  sampleAtDistance(distance: number): PathSample;
}

interface Point2D {
  x: number;
  y: number;
}

interface CurveSegment {
  eval(u: number): Point2D;
  derivative(u: number): Point2D;
  length: number;
  // Precomputed arc-length LUT: [u, distance]
  lut: Array<{ u: number; s: number }>;
}

function tokenizeSvgPath(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const regex = /([a-df-z])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2]) {
      tokens.push(parseFloat(match[2]));
    }
  }

  return tokens;
}

function makeLineSegment(p0: Point2D, p1: Point2D): CurveSegment {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const length = Math.hypot(dx, dy);

  return {
    eval: (u) => ({ x: p0.x + u * dx, y: p0.y + u * dy }),
    derivative: () => ({ x: dx, y: dy }),
    length,
    lut: [
      { u: 0, s: 0 },
      { u: 1, s: length },
    ],
  };
}

function makeQuadSegment(p0: Point2D, p1: Point2D, p2: Point2D): CurveSegment {
  const evalPt = (u: number): Point2D => {
    const omt = 1 - u;
    return {
      x: omt * omt * p0.x + 2 * omt * u * p1.x + u * u * p2.x,
      y: omt * omt * p0.y + 2 * omt * u * p1.y + u * u * p2.y,
    };
  };

  const derivative = (u: number): Point2D => {
    const omt = 1 - u;
    const dx = 2 * omt * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
    const dy = 2 * omt * (p1.y - p0.y) + 2 * u * (p2.y - p1.y);
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
      return { x: p2.x - p0.x, y: p2.y - p0.y };
    }
    return { x: dx, y: dy };
  };

  const STEPS = 40;
  const lut: Array<{ u: number; s: number }> = [{ u: 0, s: 0 }];
  let cum = 0;
  let prevPt = p0;

  for (let i = 1; i <= STEPS; i++) {
    const u = i / STEPS;
    const pt = evalPt(u);
    cum += Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);
    lut.push({ u, s: cum });
    prevPt = pt;
  }

  return {
    eval: evalPt,
    derivative,
    length: cum,
    lut,
  };
}

function makeCubicSegment(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D): CurveSegment {
  const evalPt = (u: number): Point2D => {
    const omt = 1 - u;
    const omt2 = omt * omt;
    const omt3 = omt2 * omt;
    const u2 = u * u;
    const u3 = u2 * u;

    return {
      x: omt3 * p0.x + 3 * omt2 * u * p1.x + 3 * omt * u2 * p2.x + u3 * p3.x,
      y: omt3 * p0.y + 3 * omt2 * u * p1.y + 3 * omt * u2 * p2.y + u3 * p3.y,
    };
  };

  const derivative = (u: number): Point2D => {
    const omt = 1 - u;
    const dx = 3 * omt * omt * (p1.x - p0.x) + 6 * omt * u * (p2.x - p1.x) + 3 * u * u * (p3.x - p2.x);
    const dy = 3 * omt * omt * (p1.y - p0.y) + 6 * omt * u * (p2.y - p1.y) + 3 * u * u * (p3.y - p2.y);
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
      // Degenerate derivative at endpoint, fall back to chord
      return { x: p3.x - p0.x, y: p3.y - p0.y };
    }
    return { x: dx, y: dy };
  };

  const STEPS = 50;
  const lut: Array<{ u: number; s: number }> = [{ u: 0, s: 0 }];
  let cum = 0;
  let prevPt = p0;

  for (let i = 1; i <= STEPS; i++) {
    const u = i / STEPS;
    const pt = evalPt(u);
    cum += Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);
    lut.push({ u, s: cum });
    prevPt = pt;
  }

  return {
    eval: evalPt,
    derivative,
    length: cum,
    lut,
  };
}

/**
 * Creates a high-precision, headless SVG path sampler that calculates exact position
 * and tangent orientation angles using parametric curve derivatives and arc-length parameterization.
 */
export function createPathSampler(d: string): PathSampler {
  if (!d || typeof d !== 'string') {
    return {
      totalLength: 0,
      sample: () => ({ x: 0, y: 0, tangentDeg: 0 }),
      sampleAtDistance: () => ({ x: 0, y: 0, tangentDeg: 0 }),
    };
  }

  const tokens = tokenizeSvgPath(d);
  const segments: CurveSegment[] = [];

  let currX = 0;
  let currY = 0;
  let startX = 0;
  let startY = 0;
  let lastCubicCpX = 0;
  let lastCubicCpY = 0;
  let lastQuadCpX = 0;
  let lastQuadCpY = 0;
  let lastCmd = '';

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    let cmd = '';

    if (typeof token === 'string') {
      cmd = token;
      i++;
    } else {
      if (lastCmd === 'M') cmd = 'L';
      else if (lastCmd === 'm') cmd = 'l';
      else cmd = lastCmd;
    }

    const isRelative = cmd === cmd.toLowerCase();
    const upperCmd = cmd.toUpperCase();

    switch (upperCmd) {
      case 'M': {
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);
        currX = isRelative ? currX + x : x;
        currY = isRelative ? currY + y : y;
        startX = currX;
        startY = currY;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'L': {
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);
        const endX = isRelative ? currX + x : x;
        const endY = isRelative ? currY + y : y;
        const seg = makeLineSegment({ x: currX, y: currY }, { x: endX, y: endY });
        if (seg.length > 0) segments.push(seg);
        currX = endX;
        currY = endY;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'H': {
        const x = Number(tokens[i++]);
        const endX = isRelative ? currX + x : x;
        const seg = makeLineSegment({ x: currX, y: currY }, { x: endX, y: currY });
        if (seg.length > 0) segments.push(seg);
        currX = endX;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'V': {
        const y = Number(tokens[i++]);
        const endY = isRelative ? currY + y : y;
        const seg = makeLineSegment({ x: currX, y: currY }, { x: currX, y: endY });
        if (seg.length > 0) segments.push(seg);
        currY = endY;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'C': {
        const x1 = Number(tokens[i++]);
        const y1 = Number(tokens[i++]);
        const x2 = Number(tokens[i++]);
        const y2 = Number(tokens[i++]);
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);

        const cp1: Point2D = { x: isRelative ? currX + x1 : x1, y: isRelative ? currY + y1 : y1 };
        const cp2: Point2D = { x: isRelative ? currX + x2 : x2, y: isRelative ? currY + y2 : y2 };
        const end: Point2D = { x: isRelative ? currX + x : x, y: isRelative ? currY + y : y };

        const seg = makeCubicSegment({ x: currX, y: currY }, cp1, cp2, end);
        if (seg.length > 0) segments.push(seg);

        currX = end.x;
        currY = end.y;
        lastCubicCpX = cp2.x;
        lastCubicCpY = cp2.y;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'S': {
        const x2 = Number(tokens[i++]);
        const y2 = Number(tokens[i++]);
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);

        let cp1X = currX;
        let cp1Y = currY;
        if (lastCmd.toUpperCase() === 'C' || lastCmd.toUpperCase() === 'S') {
          cp1X = 2 * currX - lastCubicCpX;
          cp1Y = 2 * currY - lastCubicCpY;
        }

        const cp1: Point2D = { x: cp1X, y: cp1Y };
        const cp2: Point2D = { x: isRelative ? currX + x2 : x2, y: isRelative ? currY + y2 : y2 };
        const end: Point2D = { x: isRelative ? currX + x : x, y: isRelative ? currY + y : y };

        const seg = makeCubicSegment({ x: currX, y: currY }, cp1, cp2, end);
        if (seg.length > 0) segments.push(seg);

        currX = end.x;
        currY = end.y;
        lastCubicCpX = cp2.x;
        lastCubicCpY = cp2.y;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      case 'Q': {
        const x1 = Number(tokens[i++]);
        const y1 = Number(tokens[i++]);
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);

        const cp: Point2D = { x: isRelative ? currX + x1 : x1, y: isRelative ? currY + y1 : y1 };
        const end: Point2D = { x: isRelative ? currX + x : x, y: isRelative ? currY + y : y };

        const seg = makeQuadSegment({ x: currX, y: currY }, cp, end);
        if (seg.length > 0) segments.push(seg);

        currX = end.x;
        currY = end.y;
        lastQuadCpX = cp.x;
        lastQuadCpY = cp.y;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        break;
      }

      case 'T': {
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);

        let cpX = currX;
        let cpY = currY;
        if (lastCmd.toUpperCase() === 'Q' || lastCmd.toUpperCase() === 'T') {
          cpX = 2 * currX - lastQuadCpX;
          cpY = 2 * currY - lastQuadCpY;
        }

        const cp: Point2D = { x: cpX, y: cpY };
        const end: Point2D = { x: isRelative ? currX + x : x, y: isRelative ? currY + y : y };

        const seg = makeQuadSegment({ x: currX, y: currY }, cp, end);
        if (seg.length > 0) segments.push(seg);

        currX = end.x;
        currY = end.y;
        lastQuadCpX = cp.x;
        lastQuadCpY = cp.y;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        break;
      }

      case 'Z': {
        const seg = makeLineSegment({ x: currX, y: currY }, { x: startX, y: startY });
        if (seg.length > 0) segments.push(seg);
        currX = startX;
        currY = startY;
        lastCubicCpX = currX;
        lastCubicCpY = currY;
        lastQuadCpX = currX;
        lastQuadCpY = currY;
        break;
      }

      default:
        break;
    }

    lastCmd = cmd;
  }

  if (segments.length === 0) {
    return {
      totalLength: 0,
      sample: () => ({ x: currX, y: currY, tangentDeg: 0 }),
      sampleAtDistance: () => ({ x: currX, y: currY, tangentDeg: 0 }),
    };
  }

  // Precompute cumulative lengths per segment
  const cumLengths: number[] = [0];
  let totalLength = 0;
  for (const seg of segments) {
    totalLength += seg.length;
    cumLengths.push(totalLength);
  }

  function sampleAtDistance(dist: number): PathSample {
    if (totalLength === 0) {
      const pt = segments[0].eval(0);
      return { x: pt.x, y: pt.y, tangentDeg: 0 };
    }

    const clampedDist = Math.max(0, Math.min(totalLength, dist));

    // Find segment
    let segIdx = 0;
    for (let k = 0; k < segments.length; k++) {
      if (clampedDist <= cumLengths[k + 1] || k === segments.length - 1) {
        segIdx = k;
        break;
      }
    }

    const seg = segments[segIdx];
    const segStartDist = cumLengths[segIdx];
    const localDist = clampedDist - segStartDist;

    // Map local distance to parameter u using LUT
    let u = 0;
    if (seg.length > 0) {
      const lut = seg.lut;
      let low = 0;
      let high = lut.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lut[mid].s < localDist) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const idx = Math.max(1, Math.min(lut.length - 1, low));
      const s0 = lut[idx - 1].s;
      const s1 = lut[idx].s;
      const u0 = lut[idx - 1].u;
      const u1 = lut[idx].u;
      const span = s1 - s0;
      const f = span > 1e-9 ? (localDist - s0) / span : 0;
      u = u0 + f * (u1 - u0);
    }

    u = Math.max(0, Math.min(1, u));

    const pt = seg.eval(u);
    const deriv = seg.derivative(u);
    const tangentDeg = (Math.atan2(deriv.y, deriv.x) * 180) / Math.PI;

    return {
      x: pt.x,
      y: pt.y,
      tangentDeg,
    };
  }

  function sample(t: number): PathSample {
    const clampedT = Math.max(0, Math.min(1, t));
    return sampleAtDistance(clampedT * totalLength);
  }

  return {
    totalLength,
    sample,
    sampleAtDistance,
  };
}

export function sampleSvgPath(d: string, t: number): PathSample {
  return createPathSampler(d).sample(t);
}
