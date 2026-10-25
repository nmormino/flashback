import { describe, it, expect, beforeEach } from 'vitest';
import {
  editorActions,
  getEditorState,
  type EditorElement,
} from '../src/state/editorStore';
import { filtersToCSS } from '@flashback/runtime';

describe('Advanced Vector Editor Features', () => {
  beforeEach(() => {
    editorActions.newDocument();
  });

  describe('1. In-Place Text Editing & Typography Formatting', () => {
    it('creates a text element with fontStyle and textDecoration and updates text content', () => {
      const textEl: EditorElement = {
        id: 'text_1',
        type: 'text',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Initial Text',
        fontSize: 24,
        fontFamily: 'Inter',
        color: '#ffffff',
        fontWeight: 400,
        fontStyle: 'normal',
        textDecoration: 'none',
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(textEl);

      // Verify initial element
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.type).toBe('text');
      if (el.type === 'text') {
        expect(el.text).toBe('Initial Text');
        expect(el.fontStyle).toBe('normal');
        expect(el.textDecoration).toBe('none');
      }

      // Update text formatting: Bold, Italic, Underline
      editorActions.updateElementProps('text_1', {
        fontWeight: 700,
        fontStyle: 'italic',
        textDecoration: 'underline',
      });

      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      if (el.type === 'text') {
        expect(el.fontWeight).toBe(700);
        expect(el.fontStyle).toBe('italic');
        expect(el.textDecoration).toBe('underline');
      }

      // Live text editing update
      editorActions.updateElementProps('text_1', {
        text: 'Live Edited Text Content!',
      });

      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      if (el.type === 'text') {
        expect(el.text).toBe('Live Edited Text Content!');
      }
    });
  });

  describe('2. On-Canvas Freeform Transforms (Rotate, Skew, Warp Handles & Pivot)', () => {
    it('supports originX, originY pivot point adjustments', () => {
      const box: EditorElement = {
        id: 'box_pivot',
        type: 'shape',
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(box);

      // Change registration / pivot point to center (50, 50)
      editorActions.updateElementTransform('box_pivot', {
        originX: 50,
        originY: 50,
      });

      const el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.originX).toBe(50);
      expect(el.transform.originY).toBe(50);
    });

    it('supports skewX and skewY shear transformations', () => {
      const box: EditorElement = {
        id: 'box_skew',
        type: 'shape',
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(box);

      // Apply horizontal shear (skewX = 30 deg) and vertical shear (skewY = -15 deg)
      editorActions.updateElementTransform('box_skew', {
        skewX: 30,
        skewY: -15,
      });

      const el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.skewX).toBe(30);
      expect(el.transform.skewY).toBe(-15);
    });

    it('supports scale and rotation around pivot', () => {
      const box: EditorElement = {
        id: 'box_rot',
        type: 'shape',
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(box);

      editorActions.updateElementTransform('box_rot', {
        rotation: 45,
        scaleX: 1.5,
        scaleY: 2.0,
      });

      const el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.rotation).toBe(45);
      expect(el.transform.scaleX).toBe(1.5);
      expect(el.transform.scaleY).toBe(2.0);
    });
  });

  describe('3. Grouping Elements (Scene Graph / Hierarchical Nesting & Isolation Mode)', () => {
    it('groups selected elements into a consolidated Folder (Group) layer', () => {
      const el1: EditorElement = {
        id: 'eye_left',
        type: 'shape',
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' }],
        alpha: 1,
        visible: true,
      };
      const el2: EditorElement = {
        id: 'eye_right',
        type: 'shape',
        transform: { x: 50, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(el1);
      editorActions.addElement(el2);

      // Select both
      editorActions.selectElement('eye_left', false);
      editorActions.selectElement('eye_right', true);
      expect(getEditorState().selectedElementIds).toEqual(['eye_left', 'eye_right']);

      // Group Selection -> consolidated into kind: 'folder'
      editorActions.groupSelectedElements();

      const state = getEditorState();
      const folder = state.doc.root.layers.find((l) => l.kind === 'folder');
      expect(folder).toBeDefined();
      expect(folder?.kind).toBe('folder');
      expect(folder?.keyframes[0].elements).toHaveLength(2);
      expect(folder?.keyframes[0].elements.map((e) => e.id)).toEqual(['eye_left', 'eye_right']);
    });

    it('ungroups a Folder (Group) layer back into individual elements', () => {
      const el1: EditorElement = {
        id: 'box_a',
        type: 'shape',
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' }],
        alpha: 1,
        visible: true,
      };
      const el2: EditorElement = {
        id: 'box_b',
        type: 'shape',
        transform: { x: 50, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(el1);
      editorActions.addElement(el2);
      editorActions.selectElement('box_a', false);
      editorActions.selectElement('box_b', true);
      editorActions.groupSelectedElements();

      // Now ungroup the resulting folder
      editorActions.ungroupSelectedElements();

      const rootLayers = getEditorState().doc.root.layers;
      expect(rootLayers.some((l) => l.kind === 'folder')).toBe(false);
      const elements = rootLayers[0].keyframes[0].elements;
      expect(elements).toHaveLength(2);
      expect(elements.map((e) => e.type)).toEqual(['shape', 'shape']);
    });

    it('enters and exits isolation mode, scoping mutations to the isolated symbol timeline', () => {
      const el1: EditorElement = {
        id: 'sub_el',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(el1);
      editorActions.convertToSymbol('sub_el', 'Face Group', 'movieclip');

      const instance = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(instance.type).toBe('instance');
      if (instance.type !== 'instance') return;

      const symId = instance.symbolId;

      // Enter isolation
      editorActions.enterIsolation(symId, 'Face Group');
      expect(getEditorState().isolationStack).toHaveLength(1);
      expect(getEditorState().isolationStack[0].symbolId).toBe(symId);
      expect(getEditorState().isolationStack[0].name).toBe('Face Group');

      // Add element while inside isolation mode
      const nestedEl: EditorElement = {
        id: 'nested_element_inside_group',
        type: 'shape',
        transform: { x: 5, y: 5, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 5 0 L 5 5 L 0 5 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(nestedEl);

      // Check that the new element was added to the isolated symbol, NOT to doc.root
      const rootElements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(rootElements).toHaveLength(1); // Still just the SymbolInstance

      const symbol = getEditorState().doc.library.symbols[symId];
      const symbolElements = symbol.timeline.layers[0].keyframes[0].elements;
      expect(symbolElements.some((e) => e.id === 'nested_element_inside_group')).toBe(true);

      // Exit isolation
      editorActions.exitIsolation();
      expect(getEditorState().isolationStack).toHaveLength(0);
    });

    it('exitToIsolationLevel exits back to specified depth in isolation stack', () => {
      // Create nested symbols in library
      getEditorState().doc.library.symbols['sym_1'] = {
        id: 'sym_1',
        name: 'Level 1',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: { frameCount: 1, layers: [] },
      };
      getEditorState().doc.library.symbols['sym_2'] = {
        id: 'sym_2',
        name: 'Level 2',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: { frameCount: 1, layers: [] },
      };
      getEditorState().doc.library.symbols['sym_3'] = {
        id: 'sym_3',
        name: 'Level 3',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: { frameCount: 1, layers: [] },
      };

      editorActions.enterIsolation('sym_1', 'Level 1');
      editorActions.enterIsolation('sym_2', 'Level 2');
      editorActions.enterIsolation('sym_3', 'Level 3');
      expect(getEditorState().isolationStack).toHaveLength(3);

      editorActions.exitToIsolationLevel(0); // Keep up to index 0 (Level 1)
      expect(getEditorState().isolationStack).toHaveLength(1);
      expect(getEditorState().isolationStack[0].name).toBe('Level 1');

      editorActions.exitToIsolationLevel(-1); // Exit back to root
      expect(getEditorState().isolationStack).toHaveLength(0);
    });
  });

  describe('4. Layers Panel, Ordering & CSS Layer Filters', () => {
    it('adds, updates, and removes CSS Layer Filters', () => {
      const layerId = getEditorState().doc.root.layers[0].id;

      // Add blur filter
      editorActions.addLayerFilter(layerId, {
        type: 'blur',
        radius: 8,
      });

      let layer = getEditorState().doc.root.layers[0];
      expect(layer.filters).toHaveLength(1);
      expect(layer.filters?.[0].type).toBe('blur');
      expect(filtersToCSS(layer.filters)).toBe('blur(8px)');

      // Add opacity filter
      editorActions.addLayerFilter(layerId, {
        type: 'opacity',
        amount: 0.75,
      });

      layer = getEditorState().doc.root.layers[0];
      expect(layer.filters).toHaveLength(2);
      expect(filtersToCSS(layer.filters)).toContain('blur(8px)');
      expect(filtersToCSS(layer.filters)).toContain('opacity(0.75)');

      // Update blur filter
      editorActions.updateLayerFilter(layerId, 0, { radius: 16 });
      layer = getEditorState().doc.root.layers[0];
      expect(layer.filters?.[0]).toEqual(expect.objectContaining({ radius: 16 }));
      expect(filtersToCSS(layer.filters)).toContain('blur(16px)');

      // Remove blur filter
      editorActions.removeLayerFilter(layerId, 0);
      layer = getEditorState().doc.root.layers[0];
      expect(layer.filters).toHaveLength(1);
      expect(layer.filters?.[0].type).toBe('opacity');

      // Set entire filters array
      editorActions.setLayerFilters(layerId, [
        { type: 'dropShadow', x: 4, y: 4, blur: 10, color: 'rgba(0,0,0,0.5)' },
        { type: 'hueRotate', degrees: 90 },
      ]);
      layer = getEditorState().doc.root.layers[0];
      expect(layer.filters).toHaveLength(2);
      const css = filtersToCSS(layer.filters);
      expect(css).toContain('drop-shadow(4px 4px 10px rgba(0,0,0,0.5))');
      expect(css).toContain('hue-rotate(90deg)');
    });

    it('reorders layers and elements (bring forward / send backward)', () => {
      // Add a second layer (unshifted to index 0, so index 1 is bottomLayer)
      const bottomLayerId = getEditorState().doc.root.layers[0].id;
      editorActions.addLayer('Layer 2');
      const layers = getEditorState().doc.root.layers;
      expect(layers).toHaveLength(2);
      expect(layers[1].id).toBe(bottomLayerId);
      const topLayerId = layers[0].id;

      // Bring bottom layer forward (moves from index 1 to index 0)
      editorActions.bringLayerForward(bottomLayerId);
      expect(getEditorState().doc.root.layers[0].id).toBe(bottomLayerId);

      // Send it backward again (moves from index 0 to index 1)
      editorActions.sendLayerBackward(bottomLayerId);
      expect(getEditorState().doc.root.layers[1].id).toBe(bottomLayerId);

      // Test element z-ordering
      const el1: EditorElement = {
        id: 'el_bottom',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 Z' }],
        alpha: 1,
        visible: true,
      };
      const el2: EditorElement = {
        id: 'el_top',
        type: 'shape',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(el1);
      editorActions.addElement(el2);

      let elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(elements[0].id).toBe('el_bottom');
      expect(elements[1].id).toBe('el_top');

      // Bring el_bottom forward
      editorActions.bringElementForward('el_bottom');
      elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(elements[0].id).toBe('el_top');
      expect(elements[1].id).toBe('el_bottom');

      // Send el_bottom backward
      editorActions.sendElementBackward('el_bottom');
      elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(elements[0].id).toBe('el_bottom');
      expect(elements[1].id).toBe('el_top');
    });
  });
});
