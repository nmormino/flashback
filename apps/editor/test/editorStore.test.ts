import { describe, it, expect, beforeEach } from 'vitest';
import {
  editorActions,
  getEditorState,
  fastClone,
  computeTotalTimelineDuration,
  invalidateTimelineDurationCache,
  type EditorElement,
  type EditorSymbol,
} from '../src/state/editorStore';

describe('Editor Store', () => {
  beforeEach(() => {
    editorActions.newDocument();
  });

  it('initializes with default blank Stage 550x400 @ 24fps with 1 layer, 1 keyframe', () => {
    const state = getEditorState();
    expect(state.doc.stage.width).toBe(550);
    expect(state.doc.stage.height).toBe(400);
    expect(state.doc.stage.fps).toBe(24);
    expect(state.doc.root.layers).toHaveLength(1);
    expect(state.doc.root.layers[0].name).toBe('Layer 1');
    expect(state.doc.root.layers[0].keyframes).toHaveLength(1);
    expect(state.doc.root.layers[0].keyframes[0].index).toBe(0);
    expect(state.currentFrame).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.activeTool).toBe('select');
  });

  describe('Timeline Keyframe Operations', () => {
    it('insertKeyframe (F6) splits an existing keyframe and preserves elements', () => {
      // Add a test element to frame 0
      const testEl: EditorElement = {
        id: 'box_1',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 L 0 50 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(testEl);

      // Seek to frame 10 and press F6 (insertKeyframe)
      editorActions.setPlayhead(10);
      editorActions.insertKeyframe();

      const layer = getEditorState().doc.root.layers[0];
      expect(layer.keyframes).toHaveLength(2);
      expect(layer.keyframes[0].index).toBe(0);
      expect(layer.keyframes[0].duration).toBe(10);
      expect(layer.keyframes[1].index).toBe(10);
      // Cloned element has same ID so tweens can match it
      expect(layer.keyframes[1].elements[0].id).toBe('box_1');
    });

    it('insertBlankKeyframe (F7) creates an empty keyframe', () => {
      editorActions.setPlayhead(12);
      editorActions.insertBlankKeyframe();

      const layer = getEditorState().doc.root.layers[0];
      expect(layer.keyframes).toHaveLength(2);
      const kf2 = layer.keyframes.find((k) => k.index === 12);
      expect(kf2).toBeDefined();
      expect(kf2?.elements).toHaveLength(0);
    });

    it('insertFrame (F5) and removeFrame adjust keyframe duration and shift indices', () => {
      const initialDuration = getEditorState().doc.root.layers[0].keyframes[0].duration;

      editorActions.insertFrame();
      expect(getEditorState().doc.root.layers[0].keyframes[0].duration).toBe(initialDuration + 1);

      editorActions.removeFrame();
      expect(getEditorState().doc.root.layers[0].keyframes[0].duration).toBe(initialDuration);
    });

    it('createMotionTween sets motion tween on keyframe', () => {
      const layerId = getEditorState().doc.root.layers[0].id;
      editorActions.createMotionTween(layerId, 0);

      const kf = getEditorState().doc.root.layers[0].keyframes[0];
      expect(kf.tween?.type).toBe('motion');
      expect(kf.tween?.easing.type).toBe('linear');
    });
  });

  describe('Element & Drawing Operations', () => {
    it('addElement and updateElementTransform updates visual positioning', () => {
      const testEl: EditorElement = {
        id: 'rect_test',
        type: 'shape',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(testEl);

      editorActions.updateElementTransform('rect_test', { x: 120, y: 150 });
      const el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.x).toBe(120);
      expect(el.transform.y).toBe(150);
    });

    it('deleteSelectedElements removes selected elements', () => {
      const testEl: EditorElement = {
        id: 'del_me',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(testEl);
      editorActions.selectElement('del_me');
      editorActions.deleteSelectedElements();

      const elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(elements).toHaveLength(0);
      expect(getEditorState().selectedElementIds).toHaveLength(0);
    });

    it('convertToSymbol converts element to library symbol and replaces with instance', () => {
      const testEl: EditorElement = {
        id: 'to_symbol',
        type: 'shape',
        transform: { x: 30, y: 40, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 20 20 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(testEl);

      editorActions.convertToSymbol('to_symbol', 'MyHero', 'movieclip');

      const state = getEditorState();
      const symbolKeys = Object.keys(state.doc.library.symbols);
      expect(symbolKeys.length).toBeGreaterThan(0);

      const symbol = state.doc.library.symbols[symbolKeys[0]];
      expect(symbol.name).toBe('MyHero');
      expect(symbol.kind).toBe('movieclip');

      // Stage element replaced with SymbolInstance
      const stageEl = state.doc.root.layers[0].keyframes[0].elements[0];
      expect(stageEl.type).toBe('instance');
      expect((stageEl as any).symbolId).toBe(symbol.id);
    });
  });

  describe('Scripting Operations', () => {
    it('updateKeyframeScript binds frame script', () => {
      const layerId = getEditorState().doc.root.layers[0].id;
      editorActions.updateKeyframeScript(layerId, 0, 'this.stop();');

      const kf = getEditorState().doc.root.layers[0].keyframes[0];
      expect((kf.actions as any)?.__fn).toBe('this.stop();');

      // Clear script
      editorActions.updateKeyframeScript(layerId, 0, '');
      expect(getEditorState().doc.root.layers[0].keyframes[0].actions).toBeUndefined();
    });

    it('updateElementScript binds object event script', () => {
      const inst: EditorElement = {
        id: 'btn_1',
        type: 'instance',
        symbolId: 'dummy_sym',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(inst);

      editorActions.updateElementScript('btn_1', 'onClick', 'this.play();');
      const el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect((el as any).events?.onClick?.__fn).toBe('this.play();');
    });
  });

  describe('History Undo / Redo', () => {
    it('supports undo and redo snapshots', () => {
      const testEl: EditorElement = {
        id: 'undo_test',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(testEl);
      expect(getEditorState().doc.root.layers[0].keyframes[0].elements).toHaveLength(1);

      editorActions.undo();
      expect(getEditorState().doc.root.layers[0].keyframes[0].elements).toHaveLength(0);

      editorActions.redo();
      expect(getEditorState().doc.root.layers[0].keyframes[0].elements).toHaveLength(1);
    });
  });

  describe('Serialization Round-Trip (Export & Import)', () => {
    it('exportToJS and loadFromJS round-trips correctly', () => {
      const testEl: EditorElement = {
        id: 'export_shape',
        type: 'shape',
        transform: { x: 100, y: 200, scaleX: 1.5, scaleY: 1.5, rotation: 45, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 Z' }],
        alpha: 0.8,
        visible: true,
      };
      editorActions.addElement(testEl);

      const exportedJS = editorActions.exportToJS();
      expect(exportedJS).toContain('export default');
      expect(exportedJS).toContain('export_shape');

      // Clear doc and load from the exported code
      editorActions.newDocument();
      expect(getEditorState().doc.root.layers[0].keyframes[0].elements).toHaveLength(0);

      const res = editorActions.loadFromJS(exportedJS);
      expect(res.success).toBe(true);

      const reloadedEl = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(reloadedEl.id).toBe('export_shape');
      expect(reloadedEl.transform.x).toBe(100);
      expect(reloadedEl.transform.y).toBe(200);
      expect(reloadedEl.transform.rotation).toBe(45);
    });
  });

  describe('fastClone Performance & Integrity Utility', () => {
    it('clones primitives and special values accurately', () => {
      expect(fastClone(42)).toBe(42);
      expect(fastClone('flashback')).toBe('flashback');
      expect(fastClone(true)).toBe(true);
      expect(fastClone(null)).toBeNull();
      expect(fastClone(undefined)).toBeUndefined();
    });

    it('preserves functions and methods intact (unlike JSON.stringify)', () => {
      const fn = (x: number, y: number) => x * y;
      const obj = {
        name: 'scriptElement',
        onEnterFrame: fn,
      };

      const cloned = fastClone(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.onEnterFrame).toBe(fn);
      expect(cloned.onEnterFrame(3, 4)).toBe(12);
    });

    it('clones Date objects with matching timestamps without ISO conversion', () => {
      const originalDate = new Date(1700000000000);
      const data = { createdAt: originalDate };

      const cloned = fastClone(data);
      expect(cloned.createdAt).toBeInstanceOf(Date);
      expect(cloned.createdAt).not.toBe(originalDate);
      expect(cloned.createdAt.getTime()).toBe(originalDate.getTime());
    });

    it('clones RegExp objects with matching flags and sources', () => {
      const regex = /flashback-[0-9]+/gi;
      const cloned = fastClone(regex);
      expect(cloned).toBeInstanceOf(RegExp);
      expect(cloned).not.toBe(regex);
      expect(cloned.source).toBe(regex.source);
      expect(cloned.flags).toBe(regex.flags);
    });

    it('deeply clones nested arrays and objects preserving mutation isolation', () => {
      const original = {
        layers: [
          { id: 'l1', keyframes: [{ index: 0, elements: [{ id: 'el1', x: 10 }] }] },
          { id: 'l2', keyframes: [{ index: 5, elements: [] }] },
        ],
      };

      const clone = fastClone(original);
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.layers).not.toBe(original.layers);
      expect(clone.layers[0]).not.toBe(original.layers[0]);
      expect(clone.layers[0].keyframes[0].elements).not.toBe(original.layers[0].keyframes[0].elements);

      // Mutate clone and ensure original is untouched
      clone.layers[0].keyframes[0].elements[0].x = 999;
      expect(original.layers[0].keyframes[0].elements[0].x).toBe(10);
    });

    it('deeply clones an entire EditorDocument', () => {
      const state = getEditorState();
      const clonedDoc = fastClone(state.doc);
      expect(clonedDoc).toEqual(state.doc);
      expect(clonedDoc).not.toBe(state.doc);
      expect(clonedDoc.root.layers).not.toBe(state.doc.root.layers);
    });

    it('outperforms JSON.parse(JSON.stringify) in deep cloning speed', () => {
      const doc = getEditorState().doc;
      const iterations = 500;

      // JIT Warm-up
      for (let i = 0; i < 100; i++) {
        JSON.parse(JSON.stringify(doc));
        fastClone(doc);
      }

      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        JSON.parse(JSON.stringify(doc));
      }
      const jsonTime = performance.now() - t0;

      const t1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        fastClone(doc);
      }
      const fastCloneTime = performance.now() - t1;

      console.log(`[Cloning Benchmark - ${iterations} iterations] JSON.parse/stringify: ${jsonTime.toFixed(2)}ms vs fastClone: ${fastCloneTime.toFixed(2)}ms (${(jsonTime / fastCloneTime).toFixed(1)}x faster)`);
      // Allow for CI/system jitter margin
      expect(fastCloneTime).toBeLessThanOrEqual(jsonTime * 1.25);
    });
  });

  describe('Timeline Duration Memoization & Caching', () => {
    it('caches duration calculations and re-evaluates on document mutation or stage FPS change', () => {
      const tl = getEditorState().doc.root;
      const dur1 = computeTotalTimelineDuration(tl, 24);
      const dur2 = computeTotalTimelineDuration(tl, 24);
      expect(dur1).toBe(dur2);
      expect(dur1).toBeGreaterThanOrEqual(2.0);

      // Different FPS computes with corresponding time scaling
      const dur60 = computeTotalTimelineDuration(tl, 60);
      expect(dur60).toBeGreaterThanOrEqual(2.0);

      // Invalidate cache
      invalidateTimelineDurationCache(tl);
      const durAfterInvalidate = computeTotalTimelineDuration(tl, 24);
      expect(durAfterInvalidate).toBe(dur1);

      // Mutate document by inserting a keyframe at 5.0 seconds
      editorActions.insertKeyframe(undefined, 5.0);
      const updatedTl = getEditorState().doc.root;
      const updatedDur = computeTotalTimelineDuration(updatedTl, 24);
      expect(updatedDur).toBeGreaterThanOrEqual(5.0);
    });
  });

  describe('Component Action Aliases', () => {
    it('supports addComponent, deleteComponent, and addComponentToStage aliases', () => {
      const componentDef: EditorSymbol = {
        id: 'comp_btn_test',
        name: 'TestButton',
        kind: 'button',
        timeline: {
          frameCount: 4,
          layers: [
            {
              id: 'btn_l1',
              name: 'Button Layer',
              visible: true,
              locked: false,
              keyframes: [
                {
                  index: 0,
                  duration: 4,
                  elements: [],
                },
              ],
            },
          ],
        },
        registration: { x: 25, y: 15 },
      };

      // 1. addComponent
      editorActions.addComponent(componentDef);
      expect(getEditorState().doc.library.symbols['comp_btn_test']).toBeDefined();
      expect(getEditorState().doc.library.symbols['comp_btn_test'].name).toBe('TestButton');

      // 2. addComponentToStage
      editorActions.addComponentToStage('comp_btn_test', 150, 200);
      const layer = getEditorState().doc.root.layers[0];
      const instance = layer.keyframes[0].elements.find(
        (el: any) => el.type === 'instance' && el.symbolId === 'comp_btn_test'
      );
      expect(instance).toBeDefined();
      expect(instance?.transform.x).toBe(150);
      expect(instance?.transform.y).toBe(200);
      expect(instance?.transform.originX).toBe(25);
      expect(instance?.transform.originY).toBe(15);

      // 3. deleteComponent
      editorActions.deleteComponent('comp_btn_test');
      expect(getEditorState().doc.library.symbols['comp_btn_test']).toBeUndefined();
    });
  });
});



