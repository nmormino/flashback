import { describe, it, expect } from 'vitest';
import {
  Matrix2D,
  Timeline,
  TimelinePipeline,
  compileTracks,
  compileEasingToCSS,
  evaluateEasing,
  solveCubicBezier,
  DomRenderer,
} from '../src';
import type { AnimDocument, TimelineDef, LayerDef, ShapeElement, KeyframeDef } from '../src';

describe('Phase 1: Group Motion & Parent Layer Composition', () => {
  it('Matrix2D decomposes affine matrix into transform components and checks identity', () => {
    const id = Matrix2D.identity();
    expect(id.isIdentity()).toBe(true);

    const translated = Matrix2D.translation(100, 50);
    expect(translated.isIdentity()).toBe(false);
    const decT = translated.decompose();
    expect(decT.x).toBe(100);
    expect(decT.y).toBe(50);
    expect(decT.scaleX).toBe(1);
    expect(decT.scaleY).toBe(1);
    expect(decT.rotation).toBe(0);

    // Rotation and scaling
    const rotated = Matrix2D.fromTransform({ x: 20, y: 30, rotation: 90, scaleX: 2, scaleY: 2 });
    const decRot = rotated.decompose();
    expect(decRot.x).toBe(20);
    expect(decRot.y).toBe(30);
    expect(decRot.scaleX).toBeCloseTo(2, 2);
    expect(decRot.scaleY).toBeCloseTo(2, 2);
    expect(decRot.rotation).toBeCloseTo(90, 2);
  });

  it('composes parent matrices down the parentLayerId chain in Timeline and DisplayObject', () => {
    const circle: ShapeElement = {
      id: 'circle1',
      type: 'shape',
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
    };

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Parenting Doc', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 500, height: 400, fps: 24, background: { type: 'solid', color: '#fff' } },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      root: {
        frameCount: 24,
        layers: [
          // Folder layer with its own transform
          {
            id: 'folder1',
            name: 'Group Folder',
            kind: 'folder',
            visible: true,
            locked: false,
            transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            keyframes: [
              {
                id: 'fkf1',
                index: 0,
                duration: 24,
                elements: [],
                transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
          // Child layer parented to folder1
          {
            id: 'childLayer',
            name: 'Child Layer',
            kind: 'normal',
            visible: true,
            locked: false,
            parentLayerId: 'folder1',
            keyframes: [
              {
                id: 'ckf1',
                index: 0,
                duration: 24,
                elements: [circle],
              },
            ],
          },
        ],
      },
    };

    const container = document.createElement('div');
    const renderer = new DomRenderer(container, { doc });
    const pipeline = new TimelinePipeline(doc, { renderer });
    pipeline.init();
    renderer.attach(pipeline.root);

    const rootClip = pipeline.root;
    const childObj = rootClip.getChildRawAt(0);
    expect(childObj).toBeDefined();

    // The child keeps its independent local coordinates: (10, 20)
    expect(childObj!.x).toBe(10);
    expect(childObj!.y).toBe(20);

    // The parentLayerMatrix is composed: (100, 50)
    expect(childObj!.parentLayerMatrix.tx).toBe(100);
    expect(childObj!.parentLayerMatrix.ty).toBe(50);

    // The world matrix composed with the folder is: (100 + 10, 50 + 20) = (110, 70)
    const worldM = childObj!.getWorldMatrix();
    expect(worldM.tx).toBe(110);
    expect(worldM.ty).toBe(70);

    // Rendered DOM node should reflect composed transform
    const node = renderer.getNode(childObj!);
    expect(node).toBeDefined();
    expect(node?.style.transform).toContain('matrix(1, 0, 0, 1, 110, 70)');
  });

  it('relative/composed motion: folder motion tweens compose with child independent motion tweens', () => {
    const star: ShapeElement = {
      id: 'star1',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 5 5' }],
    };

    const starEnd: ShapeElement = {
      ...star,
      transform: { x: 50, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
    };

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Composed Tween Doc', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 500, height: 400, fps: 24, background: { type: 'solid', color: '#fff' } },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      root: {
        frameCount: 20,
        layers: [
          // Folder layer moving down by Y + 100
          {
            id: 'worldFolder',
            name: 'World Folder',
            kind: 'folder',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'wkf1',
                index: 0,
                duration: 10,
                elements: [],
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                tween: { type: 'motion', easing: { type: 'linear' } },
              },
              {
                id: 'wkf2',
                index: 10,
                duration: 10,
                elements: [],
                transform: { x: 0, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
          // Child layer moving right by X + 50
          {
            id: 'heroLayer',
            name: 'Hero Layer',
            kind: 'normal',
            visible: true,
            locked: false,
            parentLayerId: 'worldFolder',
            keyframes: [
              {
                id: 'hkf1',
                index: 0,
                duration: 10,
                elements: [star],
                tween: { type: 'motion', easing: { type: 'linear' } },
              },
              {
                id: 'hkf2',
                index: 10,
                duration: 10,
                elements: [starEnd],
              },
            ],
          },
        ],
      },
    };

    const container = document.createElement('div');
    const renderer = new DomRenderer(container, { doc });
    const pipeline = new TimelinePipeline(doc, { renderer });
    pipeline.init();
    renderer.attach(pipeline.root);

    const rootClip = pipeline.root;
    const hero = rootClip.getChildRawAt(0);

    // At frame 1 (index 0): Hero is at (0, 0), Folder is at (0, 0) -> World (0, 0)
    expect(hero?.getWorldMatrix().tx).toBe(0);
    expect(hero?.getWorldMatrix().ty).toBe(0);

    // Seek to frame 6 (midway, 50% tween progress)
    rootClip.gotoAndStop(6);
    // Hero local X progressed by 25 (50% of 50)
    expect(hero?.x).toBeCloseTo(25, 1);
    expect(hero?.y).toBe(0);
    // Folder parent matrix Y progressed by 50 (50% of 100)
    expect(hero?.parentLayerMatrix.ty).toBeCloseTo(50, 1);
    // Composed world matrix is (25, 50)
    const midWorldM = hero?.getWorldMatrix();
    expect(midWorldM?.tx).toBeCloseTo(25, 1);
    expect(midWorldM?.ty).toBeCloseTo(50, 1);

    // Seek to frame 11 (index 10, 100% completion)
    rootClip.gotoAndStop(11);
    expect(hero?.x).toBe(50);
    expect(hero?.parentLayerMatrix.ty).toBe(100);
    expect(hero?.getWorldMatrix().tx).toBe(50);
    expect(hero?.getWorldMatrix().ty).toBe(100);
  });

  it('compileTracks composes parent folder motion into compiled WAAPI tracks', () => {
    const el1: ShapeElement = {
      id: 'box1',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
    };
    const el2: ShapeElement = {
      ...el1,
      transform: { x: 30, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
    };

    const timeline: TimelineDef = {
      frameCount: 10,
      layers: [
        {
          id: 'group',
          name: 'Group',
          kind: 'folder',
          visible: true,
          locked: false,
          transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
          keyframes: [
            {
              id: 'gkf1',
              index: 0,
              duration: 10,
              elements: [],
              transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
          ],
        },
        {
          id: 'items',
          name: 'Items',
          kind: 'normal',
          visible: true,
          locked: false,
          parentLayerId: 'group',
          keyframes: [
            {
              id: 'ikf1',
              index: 0,
              duration: 10,
              elements: [el1],
              tween: { type: 'motion', easing: { type: 'linear' } },
            },
            {
              id: 'ikf2',
              index: 10,
              duration: 1,
              elements: [el2],
            },
          ],
        },
      ],
    };

    const tracks = compileTracks(timeline, 24);
    expect(tracks.length).toBe(1);
    const track = tracks[0];
    expect(track.elementId).toBe('box1');

    // First keyframe should be composed: 100 + 10 = 110, 200 + 10 = 210
    const startKf = track.keyframes[0];
    expect(startKf.transform).toContain('translate(110px, 210px)');

    // End keyframe should be composed: 100 + 30 = 130, 200 + 10 = 210
    const endKf = track.keyframes[1];
    expect(endKf.transform).toContain('translate(130px, 210px)');
  });
});

describe('Phase 2: Bézier Curve Runtime Easing Evaluation', () => {
  it('compileEasingToCSS outputs valid CSS cubic-bezier syntax', () => {
    const css = compileEasingToCSS({
      type: 'cubic-bezier',
      p: [0.25, 0.1, 0.25, 1],
    });
    expect(css).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  it('evaluateEasing computes cubic-bezier progress accurately', () => {
    const linearBezier = { type: 'cubic-bezier' as const, p: [0, 0, 1, 1] as [number, number, number, number] };
    expect(evaluateEasing(linearBezier, 0)).toBe(0);
    expect(evaluateEasing(linearBezier, 0.5)).toBeCloseTo(0.5, 3);
    expect(evaluateEasing(linearBezier, 1)).toBe(1);

    // Ease-in: slower start, faster end
    const easeIn = { type: 'cubic-bezier' as const, p: [0.42, 0, 1, 1] as [number, number, number, number] };
    const midVal = evaluateEasing(easeIn, 0.5);
    expect(midVal).toBeLessThan(0.5);

    // Back overshoot: exceeds 1.0 before returning to 1.0
    const back = { type: 'cubic-bezier' as const, p: [0.34, 1.56, 0.64, 1] as [number, number, number, number] };
    const overshootVal = evaluateEasing(back, 0.7);
    expect(overshootVal).toBeGreaterThan(1.0);
    expect(evaluateEasing(back, 1)).toBe(1);
  });

  it('solveCubicBezier handles extreme overshoots (anticipate / bounce)', () => {
    // Bounce curve with negative starting overshoot
    const bounceP: [number, number, number, number] = [0.68, -0.55, 0.27, 1.55];
    const valEarly = solveCubicBezier(...bounceP, 0.2);
    expect(valEarly).toBeLessThan(0); // dips negative
    const valLate = solveCubicBezier(...bounceP, 0.8);
    expect(valLate).toBeGreaterThan(1.0); // overshoots above 1
    expect(solveCubicBezier(...bounceP, 0)).toBe(0);
    expect(solveCubicBezier(...bounceP, 1)).toBe(1);
  });
});
