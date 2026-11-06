import { describe, it, expect } from 'vitest';
import { TimelinePipeline } from '../src/player/Timeline';
import type { AnimDocument, SymbolDef } from '../src/schema';

describe('Phase 4: Components as nested animations & independent playheads', () => {
  const childSymbolDef: SymbolDef = {
    id: 'child_sym_1',
    name: 'Spinner',
    kind: 'movieclip',
    timeline: {
      frameCount: 3,
      layers: [
        {
          id: 'child_l1',
          name: 'Layer 1',
          kind: 'normal',
          visible: true,
          keyframes: [
            {
              id: 'ckf_1',
              index: 0,
              duration: 1,
              elements: [
                {
                  id: 'c_shape_1',
                  type: 'shape',
                  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                  paths: [{ d: 'M 0 0 L 10 10' }],
                  alpha: 1,
                  visible: true,
                },
              ],
            },
            {
              id: 'ckf_2',
              index: 1,
              duration: 1,
              elements: [
                {
                  id: 'c_shape_1',
                  type: 'shape',
                  transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 90, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                  paths: [{ d: 'M 0 0 L 10 10' }],
                  alpha: 1,
                  visible: true,
                },
              ],
            },
            {
              id: 'ckf_3',
              index: 2,
              duration: 1,
              elements: [
                {
                  id: 'c_shape_1',
                  type: 'shape',
                  transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                  paths: [{ d: 'M 0 0 L 10 10' }],
                  alpha: 1,
                  visible: true,
                },
              ],
            },
          ],
        },
      ],
    },
  };

  function createTestDoc(instanceOverrides: Record<string, any> = {}): AnimDocument {
    return {
      version: 1,
      meta: { name: 'Nested Anim Test' },
      stage: { width: 400, height: 300, fps: 24, background: '#ffffff' },
      library: {
        symbols: {
          child_sym_1: childSymbolDef,
        },
      },
      root: {
        frameCount: 10,
        layers: [
          {
            id: 'root_l1',
            name: 'Root Layer',
            kind: 'normal',
            visible: true,
            keyframes: [
              {
                id: 'rkf_1',
                index: 0,
                duration: 10,
                elements: [
                  {
                    id: 'inst_1',
                    type: 'instance',
                    symbolId: 'child_sym_1',
                    instanceName: 'spinner',
                    transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    alpha: 1,
                    visible: true,
                    ...instanceOverrides,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  it('default loop mode advances independent playhead and loops continuously', () => {
    const doc = createTestDoc({ playMode: 'loop' });
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');
    expect(child).not.toBeNull();
    expect(child?.currentFrame).toBe(1);

    // Frame 1 -> Frame 2
    pipeline.tick();
    expect(child?.currentFrame).toBe(2);

    // Frame 2 -> Frame 3
    pipeline.tick();
    expect(child?.currentFrame).toBe(3);

    // Frame 3 -> Frame 1 (loops!)
    pipeline.tick();
    expect(child?.currentFrame).toBe(1);
  });

  it('playMode once plays to the end and stops at the final frame', () => {
    const doc = createTestDoc({ playMode: 'once' });
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');
    expect(child?.currentFrame).toBe(1);

    pipeline.tick(); // frame 2
    expect(child?.currentFrame).toBe(2);

    pipeline.tick(); // frame 3 (totalFrames = 3)
    expect(child?.currentFrame).toBe(3);

    // Further ticks do not loop; stay at frame 3
    pipeline.tick();
    expect(child?.currentFrame).toBe(3);
    pipeline.tick();
    expect(child?.currentFrame).toBe(3);
  });

  it('playMode stop stays at frame 1 and does not advance', () => {
    const doc = createTestDoc({ playMode: 'stop' });
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');
    expect(child?.currentFrame).toBe(1);

    pipeline.tick();
    expect(child?.currentFrame).toBe(1);
    pipeline.tick();
    expect(child?.currentFrame).toBe(1);
  });

  it('autoplay false prevents automatic ticking until play() is called', () => {
    const doc = createTestDoc({ autoplay: false });
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');
    expect(child?.currentFrame).toBe(1);

    pipeline.tick();
    expect(child?.currentFrame).toBe(1);

    // Call play() via script API
    child?.play();
    pipeline.tick();
    expect(child?.currentFrame).toBe(2);
  });

  it('script controls child instance playhead with gotoAndPlay and gotoAndStop', () => {
    const doc = createTestDoc();
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');
    expect(child).not.toBeNull();

    // Script calls gotoAndStop(3)
    child?.gotoAndStop(3);
    expect(child?.currentFrame).toBe(3);
    pipeline.tick();
    expect(child?.currentFrame).toBe(3); // stays stopped

    // Script calls gotoAndPlay(2)
    child?.gotoAndPlay(2);
    expect(child?.currentFrame).toBe(2);
    pipeline.tick();
    expect(child?.currentFrame).toBe(3);
  });

  it('playMode sync synchronizes instance playhead with parent playhead', () => {
    const doc = createTestDoc({ playMode: 'sync' });
    const pipeline = new TimelinePipeline(doc);
    pipeline.init();

    const root = pipeline.root;
    const child = root.getInstance('spinner');

    expect(root.currentFrame).toBe(1);
    expect(child?.currentFrame).toBe(1);

    pipeline.tick(); // root frame 2 -> child frame 2
    expect(root.currentFrame).toBe(2);
    expect(child?.currentFrame).toBe(2);

    pipeline.tick(); // root frame 3 -> child frame 3
    expect(root.currentFrame).toBe(3);
    expect(child?.currentFrame).toBe(3);

    pipeline.tick(); // root frame 4 -> child frame 1 (child has 3 frames: 4 % 3 = 1)
    expect(root.currentFrame).toBe(4);
    expect(child?.currentFrame).toBe(1);
  });
});
