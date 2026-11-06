import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { interpolatePathD, morphCache } from '../src/utils/bezier';
import { generatePolygonStarPath } from '../src/utils/shapeGenerators';
import { computeInterpolatedElement } from '../src/panels/Stage/Stage';
import {
  editorActions,
  getEditorState,
  findKeyframeAtTime,
  findKeyframeAt,
  getKeyframeTime,
} from '../src/state/editorStore';
import { Properties } from '../src/panels/Properties/Properties';
import type { ShapeElement } from '@flashback/runtime';

describe('Shape Morphing, Flubber Engine & Element ID Cross-Keyframe Swapping', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    morphCache.clear();
    editorActions.newDocument();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('Test 1: Star with 5 points morphs smoothly into a star with 8 points across a motion/shape tween', () => {
    const star5 = generatePolygonStarPath(100, 100, 50, 5, 0.5);
    const star8 = generatePolygonStarPath(100, 100, 50, 8, 0.5);

    expect(interpolatePathD(star5, star8, 0)).toBe(star5);
    expect(interpolatePathD(star5, star8, 1)).toBe(star8);

    const midD = interpolatePathD(star5, star8, 0.5);
    expect(midD).toBeDefined();
    expect(midD).not.toBe(star5);
    expect(midD).not.toBe(star8);
    expect(midD.startsWith('M')).toBe(true);

    // Verify cache hit and instantaneous retrieval for 60fps scrubbing
    const cacheKey = `${star5}__FLUBBER__${star8}`;
    expect(morphCache.has(cacheKey)).toBe(true);
    const cachedD = interpolatePathD(star5, star8, 0.5);
    expect(cachedD).toBe(midD);
  });

  it('Test 2: Star with 20% intrusion morphs smoothly into star with 80% intrusion across a tween', () => {
    // 20% intrusion = 0.8 inner ratio, 80% intrusion = 0.2 inner ratio
    const star20 = generatePolygonStarPath(100, 100, 50, 5, 0.8);
    const star80 = generatePolygonStarPath(100, 100, 50, 5, 0.2);

    const midD = interpolatePathD(star20, star80, 0.5);
    expect(midD).toBeDefined();
    expect(midD).not.toBe(star20);
    expect(midD).not.toBe(star80);

    // Anchor count matches (10 anchors each), so fast-path bezier linear anchor interpolation applies
    const nums20 = star20.match(/[-+]?[0-9.]+/g)!.map(Number);
    const nums80 = star80.match(/[-+]?[0-9.]+/g)!.map(Number);
    const numsMid = midD.match(/[-+]?[0-9.]+/g)!.map(Number);

    expect(numsMid.length).toBe(nums20.length);
    for (let i = 0; i < nums20.length; i++) {
      const expected = (nums20[i] + nums80[i]) / 2;
      expect(numsMid[i]).toBeCloseTo(expected, 1);
    }
  });

  it('Test 3: Star morphs into a Circle when sharing the same element ID across two keyframes', () => {
    const starD = generatePolygonStarPath(100, 100, 50, 5, 0.5);
    const circleD = 'M 0 50 a 50 50 0 1 0 100 0 a 50 50 0 1 0 -100 0 Z';

    const starElement: ShapeElement = {
      id: 'shared_morph_id',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: starD, fill: { type: 'solid', color: '#f59e0b' } }],
    };

    const circleElement: ShapeElement = {
      id: 'shared_morph_id',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: circleD, fill: { type: 'solid', color: '#3b82f6' } }],
    };

    const interpolated = computeInterpolatedElement(starElement, circleElement, 0.5) as ShapeElement;
    expect(interpolated.paths[0].d).toBeDefined();
    expect(interpolated.paths[0].d).not.toBe(starD);
    expect(interpolated.paths[0].d).not.toBe(circleD);
    expect(interpolated.paths[0].d.startsWith('M')).toBe(true);
  });

  it('Test 4: Renaming an element ID via changeElementId allows pairing and morphing across keyframes', async () => {
    const starD = generatePolygonStarPath(100, 100, 50, 5, 0.5);
    const circleD = 'M 0 50 a 50 50 0 1 0 100 0 a 50 50 0 1 0 -100 0 Z';

    // Set up a layer with 2 keyframes:
    // Keyframe 1 (frame 0) with Star (id: 'star_shape_1') and a motion tween
    // Keyframe 2 (frame 10) with Circle (initially id: 'circle_shape_2')
    const state = getEditorState();
    const layer = state.doc.root.layers[0];
    const kf1 = layer.keyframes[0];
    kf1.duration = 10;
    kf1.tween = { type: 'motion', easing: { type: 'linear' } };
    kf1.elements = [
      {
        id: 'star_shape_1',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        paths: [{ d: starD, fill: { type: 'solid', color: '#ff0000' } }],
      } as ShapeElement,
    ];

    layer.keyframes.push({
      id: 'kf_frame10',
      index: 10,
      duration: 10,
      elements: [
        {
          id: 'circle_shape_2',
          type: 'shape',
          transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
          paths: [{ d: circleD, fill: { type: 'solid', color: '#0000ff' } }],
        } as ShapeElement,
      ],
    });

    // Go to frame 10 and select circle_shape_2
    editorActions.setCurrentFrame(10);
    editorActions.selectElement('circle_shape_2');

    // Mount Properties panel to test the Element ID UI
    await act(async () => {
      root.render(<Properties />);
    });

    const idInput = container.querySelector('[data-testid="element-id-input"]') as HTMLInputElement;
    expect(idInput).toBeDefined();
    expect(idInput.value).toBe('circle_shape_2');

    // Rename circle_shape_2 to match star_shape_1 using changeElementId
    act(() => {
      editorActions.changeElementId('circle_shape_2', 'star_shape_1');
    });

    // Verify selection was updated to the new ID
    const updatedState = getEditorState();
    expect(updatedState.selectedElementIds).toEqual(['star_shape_1']);

    // Verify element on keyframe 2 was renamed
    const kf2 = updatedState.doc.root.layers[0].keyframes[1];
    expect(kf2.elements[0].id).toBe('star_shape_1');

    // Verify cross-keyframe morphing pairing
    const kf1El = updatedState.doc.root.layers[0].keyframes[0].elements[0];
    const kf2El = kf2.elements.find((e) => e.id === kf1El.id)!;
    expect(kf2El).toBeDefined();

    const morphed = computeInterpolatedElement(kf1El, kf2El, 0.5) as ShapeElement;
    expect(morphed.paths[0].d).not.toBe(starD);
    expect(morphed.paths[0].d).not.toBe(circleD);
    expect(morphed.paths[0].d.startsWith('M')).toBe(true);
  });

  it('Test 5: Adding a blank keyframe and drawing a star stays on the SAME track and inherits previous element ID', () => {
    editorActions.newDocument();
    const circleD = 'M 0 50 a 50 50 0 1 0 100 0 a 50 50 0 1 0 -100 0 Z';
    const circleEl: ShapeElement = {
      id: 'morph_circle_lead',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [{ d: circleD, fill: { type: 'solid', color: '#ff0055' } }],
    };

    // 1. Add circle on frame 0 of the initial layer
    editorActions.addElement(circleEl);

    const stateAfterCircle = getEditorState();
    expect(stateAfterCircle.doc.root.layers.length).toBe(1);
    const track = stateAfterCircle.doc.root.layers[0];
    expect(track.keyframes.length).toBe(1);
    expect(track.keyframes[0].elements[0].id).toBe('morph_circle_lead');

    // 2. Insert blank keyframe at frame 10 (F7)
    editorActions.setCurrentFrame(10);
    editorActions.insertBlankKeyframe(track.id, 10);

    const stateAfterBlank = getEditorState();
    const trackAfterBlank = stateAfterBlank.doc.root.layers[0];
    expect(trackAfterBlank.keyframes.length).toBe(2);
    expect(trackAfterBlank.keyframes[1].index).toBe(10);
    expect(trackAfterBlank.keyframes[1].elements.length).toBe(0); // Blank!

    // 3. User draws a star into this blank keyframe
    const starD = generatePolygonStarPath(50, 50, 40, 5, 0.5);
    const starEl: ShapeElement = {
      id: 'new_drawn_star_shape', // Raw ID generated by drawing tool
      type: 'shape',
      transform: { x: 120, y: 120, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [{ d: starD, fill: { type: 'solid', color: '#00cc88' } }],
    };

    editorActions.addElement(starEl, track.id, 10);

    // 4. Verify it STAYED ON THE SAME TRACK (no extra layer spawned!)
    const finalState = getEditorState();
    expect(finalState.doc.root.layers.length).toBe(1);

    const finalTrack = finalState.doc.root.layers[0];
    expect(finalTrack.keyframes.length).toBe(2);
    const kf2 = finalTrack.keyframes[1];
    expect(kf2.elements.length).toBe(1);

    // 5. Verify it inherited the element ID from keyframe 1 so they morph!
    expect(kf2.elements[0].id).toBe('morph_circle_lead');

    // 6. Test interpolation between kf1 and kf2
    const el1 = finalTrack.keyframes[0].elements[0] as ShapeElement;
    const el2 = kf2.elements[0] as ShapeElement;
    const morphed = computeInterpolatedElement(el1, el2, 0.5) as ShapeElement;
    expect(morphed.paths[0].d).not.toBe(circleD);
    expect(morphed.paths[0].d).not.toBe(starD);
    expect(morphed.paths[0].d.startsWith('M')).toBe(true);
  });

  it('Test 6: morphShapeTo updates geometry and Properties panel Morph buttons work', async () => {
    editorActions.newDocument();
    const rectD = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const rectEl: ShapeElement = {
      id: 'morph_test_subject',
      type: 'shape',
      transform: { x: 40, y: 40, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [{ d: rectD, fill: { type: 'solid', color: '#3b82f6' } }],
    };

    editorActions.addElement(rectEl);
    editorActions.selectElement('morph_test_subject');

    // Mount Properties panel
    await act(async () => {
      root.render(<Properties />);
    });

    const morphGroup = container.querySelector('[data-testid="morph-shape-group"]');
    expect(morphGroup).toBeDefined();

    const circleBtn = container.querySelector('[data-testid="morph-to-circle-btn"]') as HTMLButtonElement;
    const starBtn = container.querySelector('[data-testid="morph-to-star-btn"]') as HTMLButtonElement;
    const rectBtn = container.querySelector('[data-testid="morph-to-rect-btn"]') as HTMLButtonElement;
    expect(circleBtn).toBeDefined();
    expect(starBtn).toBeDefined();
    expect(rectBtn).toBeDefined();

    // 1. Morph to Star via action
    act(() => {
      editorActions.morphShapeTo('morph_test_subject', 'star');
    });

    let el = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(el.id).toBe('morph_test_subject');
    expect((el as any).starConfig).toBeDefined();
    expect(el.paths[0].d).toContain('L');

    // 2. Click Morph to Circle in Properties
    act(() => {
      circleBtn.click();
    });

    el = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(el.id).toBe('morph_test_subject');
    expect((el as any).starConfig).toBeUndefined();
    expect(el.paths[0].d).toContain('a'); // SVG oval / circle arc

    // 3. Click Morph to Rectangle in Properties
    act(() => {
      rectBtn.click();
    });

    el = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(el.id).toBe('morph_test_subject');
    expect(el.paths[0].d).toContain('Z');
  });

  it('handles degenerate and invalid paths with fallback', () => {
    const invalid1 = 'broken invalid path';
    const invalid2 = 'M 0 0';
    expect(interpolatePathD(invalid1, invalid2, 0.2)).toBe(invalid1);
    expect(interpolatePathD(invalid1, invalid2, 0.8)).toBe(invalid2);
  });

  it('verifies user workflow: circle -> blank keyframe -> star -> motion tween renders seamlessly across all frames without disappearing', () => {
    editorActions.newDocument();
    const doc = getEditorState().doc;
    const layer = doc.root.layers[0];
    const fps = doc.stage.fps || 24;

    const rw = 100, rh = 100, rX = 50, rY = 50, cx = 50, cy = 50;
    const ovalEl: ShapeElement = {
      id: `oval_lead`,
      type: 'shape',
      transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: cx, originY: cy },
      paths: [{
        d: `M 0 ${rY} a ${rX} ${rY} 0 1 0 ${rw} 0 a ${rX} ${rY} 0 1 0 ${-rw} 0 Z`,
        fill: { type: 'solid', color: '#0066cc' },
        stroke: { fill: { type: 'solid', color: '#000000' }, width: 1, cap: 'round', join: 'round' },
      }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(ovalEl);

    // Insert Blank Keyframe at frame 12 (0.5s)
    editorActions.setPlayhead(12);
    editorActions.insertBlankKeyframe();

    // Verify blank keyframe was inserted on the same track
    const trackAfterBlank = getEditorState().doc.root.layers[0];
    expect(trackAfterBlank.keyframes.length).toBe(2);
    expect(trackAfterBlank.keyframes[1].elements.length).toBe(0);

    // Draw Star at frame 12
    const radius = 50, pts = 5, ratio = 0.5, angle = -Math.PI / 2;
    const pathD = generatePolygonStarPath(radius, radius, radius, pts, ratio, angle);
    const starEl: ShapeElement = {
      id: `poly_temp`,
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: radius, originY: radius },
      paths: [{
        d: pathD,
        fill: { type: 'solid', color: '#ffaa00' },
        stroke: { fill: { type: 'solid', color: '#000000' }, width: 1, cap: 'round', join: 'round' },
      }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(starEl);

    // Verify it stayed on the SAME track and inherited the ID
    const trackAfterStar = getEditorState().doc.root.layers[0];
    expect(getEditorState().doc.root.layers.length).toBe(1);
    expect(trackAfterStar.keyframes.length).toBe(2);
    expect(trackAfterStar.keyframes[1].elements.length).toBe(1);
    expect(trackAfterStar.keyframes[1].elements[0].id).toBe(trackAfterStar.keyframes[0].elements[0].id);

    // Create motion tween on keyframe 0
    editorActions.createMotionTween(layer.id, 0);

    const updatedTl = getEditorState().doc.root;
    const testLayer = updatedTl.layers[0];

    // Check every frame from 0 to 24
    for (let f = 0; f <= 24; f++) {
      const time = f / fps;
      const kf = findKeyframeAtTime(testLayer, time, fps) ?? findKeyframeAt(testLayer, f);
      // Keyframe must exist at EVERY frame — no gaps or dropouts!
      expect(kf).toBeDefined();

      const isTween = kf!.tween?.type === 'motion' || kf!.tween?.type === 'shape';
      const kfIdx = testLayer.keyframes.indexOf(kf!);
      const nextKf = isTween ? testLayer.keyframes[kfIdx + 1] : undefined;
      const kfTime = getKeyframeTime(kf!, fps);
      const nextKfTime = nextKf ? getKeyframeTime(nextKf, fps) : kfTime;

      const rawProgress = isTween && nextKf && nextKfTime > kfTime
        ? Math.max(0, Math.min(1, (time - kfTime) / (nextKfTime - kfTime)))
        : 0;

      let el = kf!.elements[0];
      if (isTween && nextKf && rawProgress > 0) {
        const matchEl = nextKf.elements.find((e) => e.id === el.id);
        if (matchEl) {
          el = computeInterpolatedElement(el, matchEl, rawProgress);
        }
      }

      // Element must be present and valid on EVERY frame!
      expect(el).toBeDefined();
      expect(el.visible !== false).toBe(true);
      expect((el as ShapeElement).paths[0].d).toBeDefined();
      expect((el as ShapeElement).paths[0].d.length).toBeGreaterThan(0);
    }
  });
});
