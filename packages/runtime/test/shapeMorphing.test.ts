import { describe, it, expect, beforeEach } from 'vitest';
import { interpolateSvgPathD, morphCache, TimelinePipeline } from '../src/player/Timeline';
import type { AnimDocument, ShapeElement } from '../src/schema';

function generateStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  points: number,
  pointRatio: number
): string {
  const pts = points * 2;
  const step = (Math.PI * 2) / pts;
  const cmds: string[] = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < pts; i++) {
    const angle = startAngle + i * step;
    const r = i % 2 === 1 ? outerRadius * pointRatio : outerRadius;
    const x = Math.round((cx + r * Math.cos(angle)) * 100) / 100;
    const y = Math.round((cy + r * Math.sin(angle)) * 100) / 100;
    cmds.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

describe('Runtime Shape Morphing & Flubber Vector Interpolation', () => {
  beforeEach(() => {
    morphCache.clear();
  });

  it('Test 1: Star with 5 points morphs smoothly into a star with 8 points across a motion/shape tween', () => {
    const star5 = generateStarPath(50, 50, 40, 5, 0.5);
    const star8 = generateStarPath(50, 50, 40, 8, 0.5);

    // Initial and final paths
    expect(interpolateSvgPathD(star5, star8, 0)).toBe(star5);
    expect(interpolateSvgPathD(star5, star8, 1)).toBe(star8);

    // Intermediate path at t=0.5
    const midPath = interpolateSvgPathD(star5, star8, 0.5);
    expect(midPath).toBeDefined();
    expect(midPath).not.toBe(star5);
    expect(midPath).not.toBe(star8);
    // Should start with M command and contain coordinates without snapping
    expect(midPath.startsWith('M')).toBe(true);

    // Verify cache was populated for 60fps fast retrieval
    const cacheKey = `${star5}__FLUBBER__${star8}`;
    expect(morphCache.has(cacheKey)).toBe(true);

    // Verify repeated query uses cache and returns identical result
    const cachedMid = interpolateSvgPathD(star5, star8, 0.5);
    expect(cachedMid).toBe(midPath);
  });

  it('Test 2: Star with 20% intrusion morphs smoothly into star with 80% intrusion across a tween', () => {
    // 20% intrusion means inner radius is 80% of outer, 80% intrusion means inner radius is 20% of outer
    const starIntrusion20 = generateStarPath(50, 50, 40, 5, 0.8);
    const starIntrusion80 = generateStarPath(50, 50, 40, 5, 0.2);

    const midPath = interpolateSvgPathD(starIntrusion20, starIntrusion80, 0.5);
    expect(midPath).toBeDefined();
    expect(midPath).not.toBe(starIntrusion20);
    expect(midPath).not.toBe(starIntrusion80);

    // Fast path: matching anchor/token counts are arithmetically interpolated
    const tokens20 = starIntrusion20.match(/[0-9.]+/g)!.map(Number);
    const tokens80 = starIntrusion80.match(/[0-9.]+/g)!.map(Number);
    const midTokens = midPath.match(/[0-9.]+/g)!.map(Number);

    expect(midTokens.length).toBe(tokens20.length);
    for (let i = 0; i < tokens20.length; i++) {
      const expected = Math.round(((tokens20[i] + tokens80[i]) / 2) * 100) / 100;
      expect(midTokens[i]).toBeCloseTo(expected, 1);
    }
  });

  it('Test 3: Star morphs into a Circle when sharing the same element ID across two keyframes', () => {
    const starPath = generateStarPath(50, 50, 40, 5, 0.5);
    const circlePath = 'M 0 50 a 50 50 0 1 0 100 0 a 50 50 0 1 0 -100 0 Z';

    const starShape: ShapeElement = {
      id: 'shared-shape-id',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: starPath, fill: { type: 'solid', color: '#ff0000' } }],
    };

    const circleShape: ShapeElement = {
      id: 'shared-shape-id',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: circlePath, fill: { type: 'solid', color: '#0000ff' } }],
    };

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Star-to-Circle Morph', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      root: {
        frameCount: 10,
        layers: [
          {
            id: 'layer1',
            name: 'MorphLayer',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 10,
                tween: { type: 'motion', easing: { type: 'linear' } },
                elements: [starShape],
              },
              {
                id: 'kf2',
                index: 10,
                duration: 1,
                elements: [circleShape],
              },
            ],
          },
        ],
      },
    };

    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    // Frame 0 (t = 0): exactly star
    pipeline.rootTimeline.reconcileDisplayList(0);
    const objAt0 = pipeline.root._childrenByElementId.get('shared-shape-id');
    expect(objAt0).toBeDefined();
    const shapeAt0 = objAt0?.currentDef as ShapeElement;
    expect(shapeAt0.paths[0].d).toBe(starPath);

    // Frame 5 (t = 0.5): intermediate morph shape
    pipeline.rootTimeline.reconcileDisplayList(5);
    const objAt5 = pipeline.root._childrenByElementId.get('shared-shape-id');
    const shapeAt5 = objAt5?.currentDef as ShapeElement;
    expect(shapeAt5.paths[0].d).not.toBe(starPath);
    expect(shapeAt5.paths[0].d).not.toBe(circlePath);
    expect(shapeAt5.paths[0].d.startsWith('M')).toBe(true);

    // Frame 10 (t = 1.0): exactly circle
    pipeline.rootTimeline.reconcileDisplayList(10);
    const objAt10 = pipeline.root._childrenByElementId.get('shared-shape-id');
    const shapeAt10 = objAt10?.currentDef as ShapeElement;
    expect(shapeAt10.paths[0].d).toBe(circlePath);
  });

  it('Test 4: Pairing elements with matching IDs across keyframes enables cross-keyframe morphing', () => {
    const star5 = generateStarPath(50, 50, 40, 5, 0.5);
    const star8 = generateStarPath(50, 50, 40, 8, 0.35);

    // Before pairing (differing IDs):
    const docUnpaired: AnimDocument = {
      version: 1,
      meta: { name: 'Unpaired', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      root: {
        frameCount: 10,
        layers: [
          {
            id: 'layer1',
            name: 'Layer 1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 10,
                tween: { type: 'motion', easing: { type: 'linear' } },
                elements: [
                  {
                    id: 'shape-A',
                    type: 'shape',
                    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                    alpha: 1,
                    visible: true,
                    paths: [{ d: star5 }],
                  },
                ],
              },
              {
                id: 'kf2',
                index: 10,
                duration: 1,
                elements: [
                  {
                    id: 'shape-B',
                    type: 'shape',
                    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                    alpha: 1,
                    visible: true,
                    paths: [{ d: star8 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const pipelineUnpaired = new TimelinePipeline(docUnpaired);
    pipelineUnpaired.init();
    pipelineUnpaired.rootTimeline.reconcileDisplayList(5);
    // At t=0.5 without matching IDs, shape-A does not find a match so does not morph
    const unpairedA = pipelineUnpaired.root._childrenByElementId.get('shape-A');
    expect((unpairedA?.currentDef as ShapeElement).paths[0].d).toBe(star5);

    // After assigning identical IDs (simulating changeElementId):
    const docPaired: AnimDocument = JSON.parse(JSON.stringify(docUnpaired));
    docPaired.root.layers[0].keyframes[1].elements[0].id = 'shape-A';

    const pipelinePaired = new TimelinePipeline(docPaired);
    pipelinePaired.init();
    pipelinePaired.rootTimeline.reconcileDisplayList(5);
    const pairedA = pipelinePaired.root._childrenByElementId.get('shape-A');
    const morphedD = (pairedA?.currentDef as ShapeElement).paths[0].d;
    expect(morphedD).not.toBe(star5);
    expect(morphedD).not.toBe(star8);
    expect(morphedD.startsWith('M')).toBe(true);
  });

  it('handles degenerate / invalid paths gracefully with fallback', () => {
    const invalidD1 = 'not a valid svg path';
    const invalidD2 = 'M 0 0';
    expect(interpolateSvgPathD(invalidD1, invalidD2, 0.25)).toBe(invalidD1);
    expect(interpolateSvgPathD(invalidD1, invalidD2, 0.75)).toBe(invalidD2);
  });
});
