import { describe, it, expect } from 'vitest';
import { createPathSampler, sampleSvgPath } from '../src/player/pathSampling';

describe('Headless SVG Path Sampler', () => {
  it('samples straight horizontal and vertical lines', () => {
    // Horizontal line from (0, 0) to (100, 0)
    const hLine = createPathSampler('M 0 0 L 100 0');
    expect(hLine.totalLength).toBe(100);

    const midH = hLine.sample(0.5);
    expect(midH.x).toBeCloseTo(50, 4);
    expect(midH.y).toBeCloseTo(0, 4);
    expect(midH.tangentDeg).toBeCloseTo(0, 4);

    // Vertical line from (0, 0) down to (0, 200)
    const vLine = createPathSampler('M 0 0 V 200');
    expect(vLine.totalLength).toBe(200);

    const midV = vLine.sample(0.5);
    expect(midV.x).toBeCloseTo(0, 4);
    expect(midV.y).toBeCloseTo(100, 4);
    expect(midV.tangentDeg).toBeCloseTo(90, 4);
  });

  it('samples multi-segment paths with relative commands', () => {
    // Path: (0,0) -> (100,0) -> (100, 100)
    const sampler = createPathSampler('m 0 0 l 100 0 l 0 100');
    expect(sampler.totalLength).toBeCloseTo(200, 4);

    const p0 = sampler.sample(0);
    expect(p0.x).toBeCloseTo(0, 4);
    expect(p0.y).toBeCloseTo(0, 4);

    const pCorner = sampler.sample(0.5);
    expect(pCorner.x).toBeCloseTo(100, 4);
    expect(pCorner.y).toBeCloseTo(0, 4);

    const pEnd = sampler.sample(1);
    expect(pEnd.x).toBeCloseTo(100, 4);
    expect(pEnd.y).toBeCloseTo(100, 4);
    expect(pEnd.tangentDeg).toBeCloseTo(90, 4);
  });

  it('samples cubic bezier curves smoothly', () => {
    // Symmetrical curve from (0,0) with control points (0, 100) and (100, 100) to (100, 0)
    const sampler = createPathSampler('M 0 0 C 0 100, 100 100, 100 0');
    expect(sampler.totalLength).toBeGreaterThan(100);

    const start = sampler.sample(0);
    expect(start.x).toBeCloseTo(0, 2);
    expect(start.y).toBeCloseTo(0, 2);
    // At start, tangent points straight down towards (0, 100)
    expect(start.tangentDeg).toBeCloseTo(90, 1);

    const apex = sampler.sample(0.5);
    expect(apex.x).toBeCloseTo(50, 1);
    expect(apex.y).toBeGreaterThan(50);
    // At apex, tangent is horizontal
    expect(apex.tangentDeg).toBeCloseTo(0, 1);

    const end = sampler.sample(1);
    expect(end.x).toBeCloseTo(100, 2);
    expect(end.y).toBeCloseTo(0, 2);
  });

  it('samples quadratic bezier curves and smooth continuations', () => {
    const quad = createPathSampler('M 0 0 Q 50 100 100 0');
    expect(quad.totalLength).toBeGreaterThan(100);

    const start = quad.sample(0);
    expect(start.x).toBeCloseTo(0, 2);
    expect(start.y).toBeCloseTo(0, 2);

    const mid = quad.sample(0.5);
    expect(mid.x).toBeCloseTo(50, 1);
    expect(mid.y).toBeGreaterThan(40);
    expect(mid.tangentDeg).toBeCloseTo(0, 1);

    const end = quad.sample(1);
    expect(end.x).toBeCloseTo(100, 2);
    expect(end.y).toBeCloseTo(0, 2);
  });

  it('handles closed paths with Z command', () => {
    const closed = createPathSampler('M 0 0 L 100 0 L 100 100 Z');
    expect(closed.totalLength).toBeCloseTo(100 + 100 + Math.hypot(100, 100), 1);

    const end = closed.sample(1);
    expect(end.x).toBeCloseTo(0, 1);
    expect(end.y).toBeCloseTo(0, 1);
  });

  it('handles empty and malformed paths gracefully', () => {
    const empty = createPathSampler('');
    expect(empty.totalLength).toBe(0);
    expect(empty.sample(0.5)).toEqual({ x: 0, y: 0, tangentDeg: 0 });

    const singleMove = sampleSvgPath('M 50 50', 0.5);
    expect(singleMove.x).toBe(50);
    expect(singleMove.y).toBe(50);
  });
});
