import { describe, it, expect } from 'vitest';
import { TimelinePipeline } from '../src/player/Timeline';
import type { AnimDocument, ShapeElement } from '../src/schema';

describe('Tween Interpolation & Reduced Motion in Timeline', () => {
  const startShape: ShapeElement = {
    id: 'box1',
    type: 'shape',
    instanceName: 'box',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
    alpha: 1,
    visible: true,
    paths: [{ d: 'M 0 0 H 10 V 10 Z' }],
  };

  const endShape: ShapeElement = {
    id: 'box1',
    type: 'shape',
    instanceName: 'box',
    transform: { x: 100, y: 200, scaleX: 2, scaleY: 3, rotation: 90, skewX: 10, skewY: 20, originX: 5, originY: 5 },
    alpha: 0.5,
    visible: true,
    paths: [{ d: 'M 0 0 H 10 V 10 Z' }],
  };

  const tweenDoc: AnimDocument = {
    version: 1,
    meta: { name: 'Tween Test', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
    stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
    library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
    root: {
      frameCount: 10,
      layers: [
        {
          id: 'l1',
          name: 'MotionLayer',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf1',
              index: 0,
              duration: 4,
              tween: { type: 'motion', easing: { type: 'linear' } },
              elements: [startShape],
            },
            {
              id: 'kf2',
              index: 4,
              duration: 6,
              elements: [endShape],
            },
          ],
        },
      ],
    },
  };

  it('interpolates transform and alpha at intermediate frames during a motion tween', () => {
    const pipeline = new TimelinePipeline(tweenDoc);
    pipeline.init();

    // Frame 1 (index 0): start values
    pipeline.rootTimeline.reconcileDisplayList(0);
    const box = pipeline.root._childrenByElementId.get('box1');
    expect(box).toBeDefined();
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
    expect(box?.scaleX).toBe(1);
    expect(box?.scaleY).toBe(1);
    expect(box?.rotation).toBe(0);
    expect(box?.alpha).toBe(1);

    // Frame 3 (index 2): midway between index 0 and 4 (t = 0.5)
    pipeline.rootTimeline.reconcileDisplayList(2);
    expect(box?.x).toBe(50);
    expect(box?.y).toBe(100);
    expect(box?.scaleX).toBe(1.5);
    expect(box?.scaleY).toBe(2);
    expect(box?.rotation).toBe(45);
    expect(box?.skewX).toBe(5);
    expect(box?.skewY).toBe(10);
    expect(box?.originX).toBe(2.5);
    expect(box?.originY).toBe(2.5);
    expect(box?.alpha).toBeCloseTo(0.75, 2);

    // Frame 5 (index 4): end values
    pipeline.rootTimeline.reconcileDisplayList(4);
    expect(box?.x).toBe(100);
    expect(box?.y).toBe(200);
    expect(box?.scaleX).toBe(2);
    expect(box?.scaleY).toBe(3);
    expect(box?.rotation).toBe(90);
    expect(box?.alpha).toBe(0.5);
  });

  it('applies preset easing during tween interpolation', () => {
    const easeInDoc: AnimDocument = {
      ...tweenDoc,
      root: {
        ...tweenDoc.root,
        layers: [
          {
            ...tweenDoc.root.layers[0],
            keyframes: [
              {
                ...tweenDoc.root.layers[0].keyframes[0],
                tween: { type: 'motion', easing: { type: 'preset', name: 'ease-in' } },
              },
              tweenDoc.root.layers[0].keyframes[1],
            ],
          },
        ],
      },
    };

    const pipeline = new TimelinePipeline(easeInDoc);
    pipeline.init();

    // At t = 0.5 with ease-in (t*t), eased progress is 0.25 -> x should be 25
    pipeline.rootTimeline.reconcileDisplayList(2);
    const box = pipeline.root._childrenByElementId.get('box1');
    expect(box?.x).toBe(25);
  });

  it('respects reduced-motion mode "fixed" by locking playhead to posterFrame', () => {
    const reducedDoc: AnimDocument = {
      ...tweenDoc,
      stage: {
        ...tweenDoc.stage,
        reducedMotion: { mode: 'fixed', posterFrame: 5 },
      },
    };

    const pipeline = new TimelinePipeline(reducedDoc);
    pipeline.init();

    // In fixed mode, playhead locks at posterFrame
    expect(pipeline.root.currentFrame).toBe(5);
    expect(pipeline.root.isPlaying).toBe(false);

    // Advancing playhead should return false and not move
    expect(pipeline.rootTimeline.advancePlayhead()).toBe(false);
    expect(pipeline.root.currentFrame).toBe(5);
  });

  it('quantizes frame progress in "stop-motion" reduced-motion mode', () => {
    const stopMotionDoc: AnimDocument = {
      ...tweenDoc,
      stage: {
        ...tweenDoc.stage,
        reducedMotion: { mode: 'stop-motion' },
      },
      root: {
        ...tweenDoc.root,
        frameCount: 20,
        layers: [
          {
            id: 'l1',
            name: 'MotionLayer',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 12,
                tween: { type: 'motion', easing: { type: 'linear' } },
                elements: [startShape],
              },
              {
                id: 'kf2',
                index: 12,
                duration: 8,
                elements: [endShape],
              },
            ],
          },
        ],
      },
    };

    const pipeline = new TimelinePipeline(stopMotionDoc);
    pipeline.init();

    const box = pipeline.root._childrenByElementId.get('box1');

    // Index 1, 2, 3, 4, 5 all quantize to floor(idx/6)*6 = 0
    pipeline.rootTimeline.reconcileDisplayList(3);
    expect(box?.x).toBe(0);

    // Index 6 quantizes to 6 (halfway through 12-frame duration, so x = 50)
    pipeline.rootTimeline.reconcileDisplayList(6);
    expect(box?.x).toBe(50);

    // Index 7 also stays quantized at 6 -> x remains 50
    pipeline.rootTimeline.reconcileDisplayList(7);
    expect(box?.x).toBe(50);
  });

  it('interpolates continuously between frames using subFrameProgress and batches onTransformChange into 1 call', () => {
    const pipeline = new TimelinePipeline(tweenDoc);
    pipeline.init();

    const box = pipeline.root._childrenByElementId.get('box1')!;
    let transformCallCount = 0;
    box.rendererHooks = {
      onTransformChange: () => {
        transformCallCount++;
      },
    };

    // Sub-frame render at frame 1 (index 0) + 0.5 subFrameProgress (exactFrame = 0.5 out of duration 4 => t = 0.125)
    pipeline.render(0.5);
    expect(box.x).toBeCloseTo(12.5, 4);
    expect(box.y).toBeCloseTo(25, 4);
    expect(transformCallCount).toBe(1);
  });

  it('smoothly interpolates SVG vector path points and colors between start and end keyframes', () => {
    const morphDoc: AnimDocument = {
      ...tweenDoc,
      root: {
        frameCount: 10,
        layers: [
          {
            id: 'l_morph',
            name: 'MorphLayer',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 4,
                tween: { type: 'shape', easing: { type: 'linear' } },
                elements: [
                  {
                    ...startShape,
                    transform: { ...startShape.transform, rotation: 350 },
                    paths: [{ d: 'M 0 0 L 100 0 L 100 100 Z', fill: { type: 'solid', color: '#000000' } }],
                  },
                ],
              },
              {
                id: 'kf2',
                index: 4,
                duration: 6,
                elements: [
                  {
                    ...endShape,
                    transform: { ...endShape.transform, rotation: 10 },
                    paths: [{ d: 'M 20 40 L 200 0 L 100 200 Z', fill: { type: 'solid', color: '#ffffff' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const pipeline = new TimelinePipeline(morphDoc);
    pipeline.init();
    pipeline.rootTimeline.reconcileDisplayList(2); // t = 0.5
    const box = pipeline.root._childrenByElementId.get('box1')!;
    const currentShape = box.currentDef as ShapeElement;
    expect(currentShape.paths[0].d).toBe('M 10 20 L 150 0 L 100 150 Z');
    // Absolute linear interpolation between 350deg and 10deg at t=0.5 is 180deg
    expect(box.rotation).toBeCloseTo(180, 4);
  });
});
