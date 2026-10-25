import { describe, it, expect, beforeEach } from 'vitest';
import {
  editorActions,
  getEditorState,
  computeTotalTimelineFrames,
  formatTimecode,
  type EditorElement,
} from '../src/state/editorStore';
import { GRADIENT_PRESETS } from '../src/ui/GradientPicker';
import { fillToCSS, type Fill, type ShapeElement, type TextElement } from '@flashback/runtime';

describe('Unified Requirements: Text Editing, Gradient Editor, Unified Timeline & Layers', () => {
  beforeEach(() => {
    // Reset selection and tool
    editorActions.deselectAll();
    editorActions.setActiveTool('select');
    editorActions.setEditingTextElId(null);
  });

  describe('1. Immediate Text Editing & Inline Mode', () => {
    it('sets and clears editingTextElId in editor store', () => {
      expect(getEditorState().editingTextElId).toBeNull();
      editorActions.setEditingTextElId('text_123');
      expect(getEditorState().editingTextElId).toBe('text_123');
      editorActions.setEditingTextElId(null);
      expect(getEditorState().editingTextElId).toBeNull();
    });

    it('creates text element adopting foreground fillColor', () => {
      editorActions.setFillColor('#ff3366');
      expect(getEditorState().fillColor).toBe('#ff3366');

      const newText: TextElement = {
        id: 'test_text_new',
        type: 'text',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Hello World',
        fontSize: 24,
        color: getEditorState().fillColor,
        fill: getEditorState().activeFill,
        align: 'left',
        width: 180,
        height: 36,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(newText);
      const rootLayer = getEditorState().doc.root.layers[0];
      const added = rootLayer.keyframes[0].elements.find((e) => e.id === 'test_text_new') as TextElement;
      expect(added).toBeDefined();
      expect(added.color).toBe('#ff3366');
      expect(added.fill).toEqual({ type: 'solid', color: '#ff3366' });
    });
  });

  describe('2. Illustrator-Style Gradient Support for Shapes and Text', () => {
    it('provides all ready-made gradient presets', () => {
      const names = GRADIENT_PRESETS.map((p) => p.name);
      expect(names).toContain('Sunset');
      expect(names).toContain('Ocean');
      expect(names).toContain('Neon');
      expect(names).toContain('Pastel');
      expect(names).toContain('Chrome');
      expect(names).toContain('Metallic Gold');

      const sunset = GRADIENT_PRESETS.find((p) => p.name === 'Sunset')?.fill;
      expect(sunset?.type).toBe('linearGradient');
      expect(fillToCSS(sunset)).toContain('linear-gradient');
    });

    it('sets active fill and applies gradient to shapes', () => {
      const neonGradient = GRADIENT_PRESETS.find((p) => p.name === 'Neon')!.fill;
      editorActions.setActiveFill(neonGradient);
      expect(getEditorState().activeFill.type).toBe('linearGradient');

      const shape: ShapeElement = {
        id: 'gradient_shape_1',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
            fill: neonGradient,
          },
        ],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(shape);
      const rootLayer = getEditorState().doc.root.layers[0];
      const added = rootLayer.keyframes[0].elements.find((e) => e.id === 'gradient_shape_1') as ShapeElement;
      expect(added).toBeDefined();
      expect(added.paths[0].fill?.type).toBe('linearGradient');
      expect((added.paths[0].fill as any).stops).toHaveLength(3);
    });

    it('applies radial gradient to text element and computes CSS', () => {
      const radialFill: Fill = {
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: '#facc15' },
          { offset: 1, color: '#dc2626' },
        ],
      };

      const text: TextElement = {
        id: 'gradient_text_1',
        type: 'text',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Title Gradient',
        fontSize: 32,
        color: '#facc15',
        fill: radialFill,
        align: 'center',
        width: 250,
        height: 50,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(text);
      const css = fillToCSS(radialFill);
      expect(css).toContain('radial-gradient');
      expect(css).toContain('#facc15');
      expect(css).toContain('#dc2626');
    });
  });

  describe('3. Unified Timeline & Layers Panel Features', () => {
    it('creates folder tracks and parents child layers under folders', () => {
      editorActions.addFolder('Characters Group');
      const layers = getEditorState().doc.root.layers;
      const folder = layers.find((l) => l.name === 'Characters Group');
      expect(folder).toBeDefined();
      expect(folder?.kind).toBe('folder');
      expect(folder?.keyframes).toBeDefined();
      expect(folder?.keyframes[0].elements).toBeDefined();

      // Add child layer inside the folder
      editorActions.addLayer('Hero Sprite', folder!.id);
      const child = getEditorState().doc.root.layers.find((l) => l.name === 'Hero Sprite');
      expect(child).toBeDefined();
      expect(child?.parentLayerId).toBe(folder!.id);
    });

    it('animates folder-level entity with transform keyframes', () => {
      editorActions.addFolder('Motion Group');
      const folder = getEditorState().doc.root.layers.find((l) => l.name === 'Motion Group')!;

      // Apply folder-level transform keyframe
      editorActions.setFolderTransform(folder.id, 0, { x: 150, y: 200, rotation: 45 });
      const updatedFolder = getEditorState().doc.root.layers.find((l) => l.id === folder.id)!;
      expect(updatedFolder.keyframes[0].transform?.x).toBe(150);
      expect(updatedFolder.keyframes[0].transform?.y).toBe(200);
      expect(updatedFolder.keyframes[0].transform?.rotation).toBe(45);
    });

    it('computes accurate modern timecodes and animation lengths', () => {
      // 24 fps calculations
      expect(formatTimecode(0, 24)).toBe('00:00:00.000');
      expect(formatTimecode(24, 24)).toBe('00:00:01.000');
      expect(formatTimecode(12, 24)).toBe('00:00:00.500');
      expect(formatTimecode(72, 24)).toBe('00:00:03.000');

      // Furthest out keyframe auto-duration
      const tl = getEditorState().doc.root;
      const maxFrames = computeTotalTimelineFrames(tl);
      expect(maxFrames).toBeGreaterThanOrEqual(tl.frameCount);
    });

    it('supports cycling playback looping controls', () => {
      editorActions.setLoopMode('infinite');
      expect(getEditorState().loopMode).toBe('infinite');

      // Toggling from infinite switches to custom count (default 1)
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe(1);

      // Toggling again switches back to infinite
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe('infinite');

      // Setting a custom loop count
      editorActions.setLoopMode(5);
      expect(getEditorState().loopMode).toBe(5);

      // Toggling preserves the custom count
      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe('infinite');

      editorActions.toggleLoopMode();
      expect(getEditorState().loopMode).toBe(5);
    });
  });
});
