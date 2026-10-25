import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  editorActions,
  getEditorState,
  formatTimeInSeconds,
  computeTotalTimelineDuration,
  getKeyframeTime,
  getKeyframeDurationTime,
  findKeyframeAtTime,
  type EditorElement,
} from '../src/state/editorStore';
import { interpolatePathD } from '../src/utils/bezier';

describe('Time-Based Timeline and Unified Scene Graph', () => {
  beforeEach(() => {
    editorActions.newDocument();
    editorActions.deselectAll();
    editorActions.setActiveTool('select');
  });

  describe('1. Pure Time-Based Timeline & Continuous Playhead', () => {
    it('formats timecodes accurately in MM:SS.mmm format', () => {
      expect(formatTimeInSeconds(0)).toBe('00:00.000');
      expect(formatTimeInSeconds(0.852)).toBe('00:00.852');
      expect(formatTimeInSeconds(1.0)).toBe('00:01.000');
      expect(formatTimeInSeconds(1.5)).toBe('00:01.500');
      expect(formatTimeInSeconds(3.2)).toBe('00:03.200');
      expect(formatTimeInSeconds(65.123)).toBe('01:05.123');
    });

    it('sets and scrubs continuous playhead in seconds and milliseconds', () => {
      expect(getEditorState().currentTime).toBe(0);
      expect(getEditorState().currentFrame).toBe(0);

      editorActions.setPlayheadTime(0.852);
      expect(getEditorState().currentTime).toBeCloseTo(0.852, 3);
      expect(getEditorState().selectedTime).toBeCloseTo(0.852, 3);
      expect(getEditorState().currentFrame).toBe(Math.round(0.852 * 24));

      editorActions.setPlayheadTime(1.5);
      expect(getEditorState().currentTime).toBeCloseTo(1.5, 3);
      expect(getEditorState().currentFrame).toBe(36);
    });

    it('computes total timeline duration accurately in seconds', () => {
      const tl = getEditorState().doc.root;
      const duration = computeTotalTimelineDuration(tl, 24);
      expect(duration).toBeGreaterThanOrEqual(1.0);
    });

    it('places keyframes at continuous timestamps (e.g. 0.00s, 0.75s, 1.20s)', () => {
      const layer = getEditorState().doc.root.layers[0];

      // Insert keyframe at 0.75s
      editorActions.insertKeyframe(layer.id, 0.75);
      const updatedLayer = getEditorState().doc.root.layers[0];
      expect(updatedLayer.keyframes).toHaveLength(2);

      const kf0 = updatedLayer.keyframes[0];
      const kf1 = updatedLayer.keyframes[1];

      expect(getKeyframeTime(kf0)).toBe(0);
      expect(getKeyframeTime(kf1)).toBeCloseTo(0.75, 3);
      expect(kf1.time).toBeCloseTo(0.75, 3);

      // Insert another keyframe at 1.20s
      editorActions.insertKeyframe(layer.id, 1.20);
      const layerAfterSecondKf = getEditorState().doc.root.layers[0];
      expect(layerAfterSecondKf.keyframes).toHaveLength(3);

      const kf2 = layerAfterSecondKf.keyframes[2];
      expect(getKeyframeTime(kf2)).toBeCloseTo(1.20, 3);
      expect(kf2.time).toBeCloseTo(1.20, 3);
    });
  });

  describe('2. Unified Scene Graph in the Timeline', () => {
    it('adds element to layer and selects both layer and element', () => {
      const rectEl: EditorElement = {
        id: 'rect_artboard_1',
        type: 'shape',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(rectEl);

      const state = getEditorState();
      const layer = state.doc.root.layers[0];
      const currentKf = findKeyframeAtTime(layer, state.currentTime);
      expect(currentKf?.elements.some((e) => e.id === 'rect_artboard_1')).toBe(true);
      expect(state.selectedElementIds).toContain('rect_artboard_1');
      expect(state.selectedLayerId).toBe(layer.id);
    });

    it('supports element visibility toggling', () => {
      const textEl: EditorElement = {
        id: 'text_vis_test',
        type: 'text',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Hello Blaster',
        alpha: 1,
        visible: true,
      } as any;

      editorActions.addElement(textEl);
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'text_vis_test');
      expect(el?.visible).toBe(true);

      editorActions.toggleElementVisibility('text_vis_test');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'text_vis_test');
      expect(el?.visible).toBe(false);

      editorActions.toggleElementVisibility('text_vis_test');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'text_vis_test');
      expect(el?.visible).toBe(true);
    });

    it('supports element lock toggling', () => {
      const ovalEl: EditorElement = {
        id: 'oval_lock_test',
        type: 'shape',
        transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(ovalEl);
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'oval_lock_test');
      expect((el as any).locked).toBeFalsy();

      editorActions.toggleElementLock('oval_lock_test');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'oval_lock_test');
      expect((el as any).locked).toBe(true);

      editorActions.toggleElementLock('oval_lock_test');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'oval_lock_test');
      expect((el as any).locked).toBe(false);
    });

    it('supports element renaming in the scene graph', () => {
      const penEl: EditorElement = {
        id: 'shape_rename_test',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(penEl);
      editorActions.renameElement('shape_rename_test', 'Custom Star Shape');

      const el = getEditorState().doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'shape_rename_test');
      expect(el?.instanceName).toBe('Custom Star Shape');
    });

    it('drags elements into a Folder (Group) and parents them', () => {
      editorActions.addFolder('Graphics Folder');
      const folder = getEditorState().doc.root.layers.find((l) => l.name === 'Graphics Folder')!;
      expect(folder).toBeDefined();
      expect(folder.kind).toBe('folder');

      const rect: EditorElement = {
        id: 'drag_rect_1',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(rect);
      // Move element to folder
      editorActions.moveElementToFolder('drag_rect_1', folder.id);

      const updatedFolder = getEditorState().doc.root.layers.find((l) => l.id === folder.id)!;
      const foundInFolder = updatedFolder.keyframes.some((kf) =>
        kf.elements.some((e) => e.id === 'drag_rect_1')
      );
      expect(foundInFolder).toBe(true);
    });

    it('consolidates Folders and Groups into kind: folder', () => {
      const elA: EditorElement = {
        id: 'item_a',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };
      const elB: EditorElement = {
        id: 'item_b',
        type: 'shape',
        transform: { x: 30, y: 30, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(elA);
      editorActions.addElement(elB);
      editorActions.selectElements(['item_a', 'item_b']);

      editorActions.groupSelectedElements();

      const state = getEditorState();
      const folderLayer = state.doc.root.layers.find((l) => l.kind === 'folder');
      expect(folderLayer).toBeDefined();
      expect(folderLayer?.kind).toBe('folder');
      expect(folderLayer?.keyframes[0].elements).toHaveLength(2);
      expect(folderLayer?.keyframes[0].elements.map((e) => e.id)).toEqual(['item_a', 'item_b']);
    });
  });

  describe('3. Fluid Continuous Motion Tweening and rAF Playback', () => {
    it('creates fluid motion tween between Keyframe A and Keyframe B', () => {
      const square: EditorElement = {
        id: 'tween_square',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 40 0 L 40 40 L 0 40 Z' }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(square);
      const layerId = getEditorState().doc.root.layers[0].id;

      // Insert keyframe at 1.0s and move square to x=200
      editorActions.setPlayheadTime(1.0);
      editorActions.insertKeyframe(layerId, 1.0);
      editorActions.updateElementTransform('tween_square', { x: 200, y: 100 });

      // Create motion tween (even if called at second keyframe or first keyframe)
      editorActions.createMotionTween(layerId, 1.0);

      const layer = getEditorState().doc.root.layers[0];
      const kf0 = layer.keyframes[0];
      const kf1 = layer.keyframes[1];

      expect(kf0.tween?.type).toBe('motion');
      expect(getKeyframeTime(kf0)).toBe(0);
      expect(getKeyframeTime(kf1)).toBeCloseTo(1.0, 3);
      expect(kf0.elements[0].transform.x).toBe(0);
      expect(kf1.elements[0].transform.x).toBe(200);

      // Verify continuous interpolation at 50% (currentTime = 0.5s):
      const kfTime = getKeyframeTime(kf0);
      const nextKfTime = getKeyframeTime(kf1);
      const t = (0.5 - kfTime) / (nextKfTime - kfTime);
      expect(t).toBe(0.5);

      const interpX = kf0.elements[0].transform.x + (kf1.elements[0].transform.x - kf0.elements[0].transform.x) * t;
      expect(interpX).toBe(100);
    });

    it('smoothly interpolates SVG paths using interpolatePathD', () => {
      const d1 = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
      const d2 = 'M 50 50 L 150 50 L 150 150 L 50 150 Z';

      const dMid = interpolatePathD(d1, d2, 0.5);
      expect(dMid).toBeDefined();
      expect(dMid).toContain('M 25');
      expect(dMid).toContain('L 125');
      expect(dMid).toContain('125');
    });

    it('toggles playback and stops smoothly', () => {
      expect(getEditorState().isPlaying).toBe(false);

      editorActions.play();
      expect(getEditorState().isPlaying).toBe(true);

      editorActions.stop();
      expect(getEditorState().isPlaying).toBe(false);

      editorActions.togglePlay();
      expect(getEditorState().isPlaying).toBe(true);

      editorActions.togglePlay();
      expect(getEditorState().isPlaying).toBe(false);
    });

    it('manages custom loop counts and infinite loop mode seamlessly', () => {
      // Default initial is infinite
      editorActions.setLoopMode('infinite');
      expect(getEditorState().loopMode).toBe('infinite');

      // Toggling switches to custom count (defaulting to 1 for play once)
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe(1);

      // Toggling again restores infinite
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe('infinite');

      // Set user-chosen positive integers (e.g. 2, 3, 7, 100)
      editorActions.setLoopMode(7);
      expect(getEditorState().loopMode).toBe(7);

      // Toggling infinite on/off preserves the user's chosen custom count (7)
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe('infinite');

      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe(7);

      // Negative or floating numbers get sanitized to positive integers
      editorActions.setLoopMode(-5);
      expect(getEditorState().loopMode).toBe(1);

      editorActions.setLoopMode(4.8);
      expect(getEditorState().loopMode).toBe(4);
    });

    it('stops playback when loopCycle reaches custom loop count, but loops continuously in infinite mode', async () => {
      const tl = getEditorState().doc.root;
      const totalDur = computeTotalTimelineDuration(tl, 24);

      // 1. In custom count mode = 1 (play once)
      editorActions.setLoopMode(1);
      // Position playhead right at the brink of the end
      editorActions.setPlayheadTime(totalDur - 0.001);
      editorActions.play();
      expect(getEditorState().isPlaying).toBe(true);

      // Wait a short tick for RAF
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should have hit end, counted loopCycle = 1, and stopped
      expect(getEditorState().isPlaying).toBe(false);

      // 2. In infinite mode
      editorActions.setLoopMode('infinite');
      editorActions.setPlayheadTime(totalDur - 0.001);
      editorActions.play();
      expect(getEditorState().isPlaying).toBe(true);

      // Wait a tick for RAF
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should still be playing and looped back
      expect(getEditorState().isPlaying).toBe(true);
      editorActions.stop();
    });
  });
});
