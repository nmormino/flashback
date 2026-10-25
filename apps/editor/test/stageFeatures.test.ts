import { describe, it, expect } from 'vitest';
import { getShapeBounds, getElementBounds } from '../src/panels/Stage/Stage';
import { editorActions, getEditorState, type EditorElement } from '../src/state/editorStore';
import type { ShapeElement, TextElement } from '@flashback/runtime';

describe('Stage & Editor Modern Features', () => {
  it('computes correct bounding box for rectangle shapes', () => {
    const rectShape: ShapeElement = {
      id: 'rect_1',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [
        {
          d: 'M 0 0 L 120 0 L 120 80 L 0 80 Z',
          fill: { type: 'solid', color: '#ff0000' },
        },
      ],
      alpha: 1,
      visible: true,
    };

    const bounds = getShapeBounds(rectShape);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(120);
    expect(bounds.height).toBe(80);
  });

  it('computes correct bounding box for oval shapes', () => {
    const ovalShape: ShapeElement = {
      id: 'oval_1',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [
        {
          d: 'M 0 30 a 40 30 0 1 0 80 0 a 40 30 0 1 0 -80 0 Z',
          fill: { type: 'solid', color: '#00ff00' },
        },
      ],
      alpha: 1,
      visible: true,
    };

    const bounds = getShapeBounds(ovalShape);
    expect(bounds.width).toBe(80);
    expect(bounds.height).toBe(60);
  });

  it('computes element bounds for text and instance elements', () => {
    const textEl: TextElement = {
      id: 'text_1',
      type: 'text',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      text: 'Sample',
      fontSize: 16,
      color: '#000000',
      align: 'left',
      width: 150,
      height: 32,
      mode: 'static',
      multiline: false,
      selectable: true,
      fontId: 'default',
      alpha: 1,
      visible: true,
    };

    const bounds = getElementBounds(textEl);
    expect(bounds.width).toBe(150);
    expect(bounds.height).toBe(32);
  });

  it('supports transparent background ({ type: "none" }) and solid color backgrounds', () => {
    editorActions.newDocument();

    // Default is solid
    expect(getEditorState().doc.stage.background.type).toBe('solid');

    // Switch to transparent
    editorActions.updateStageProps({ background: { type: 'none' } });
    expect(getEditorState().doc.stage.background.type).toBe('none');

    // Switch back to custom solid color
    editorActions.updateStageProps({ background: { type: 'solid', color: '#16171a' } });
    expect(getEditorState().doc.stage.background).toEqual({ type: 'solid', color: '#16171a' });
  });

  it('supports target framerate configuration', () => {
    editorActions.newDocument();

    // Default fps is initialized
    expect(getEditorState().doc.stage.fps).toBe(24);

    // Update target FPS to smooth 60 FPS
    editorActions.updateStageProps({ fps: 60 });
    expect(getEditorState().doc.stage.fps).toBe(60);
  });

  it('supports selecting multiple elements via selectElements', () => {
    editorActions.newDocument();

    const el1: EditorElement = {
      id: 'e1',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [],
      alpha: 1,
      visible: true,
    };
    const el2: EditorElement = {
      id: 'e2',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [],
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(el1);
    editorActions.addElement(el2);

    editorActions.selectElements(['e1', 'e2']);
    expect(getEditorState().selectedElementIds).toEqual(['e1', 'e2']);

    editorActions.deselectAll();
    expect(getEditorState().selectedElementIds).toEqual([]);
  });

  it('supports updating rich typography properties on TextElement', () => {
    editorActions.newDocument();

    const textEl: TextElement = {
      id: 'text_rich_1',
      type: 'text',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      text: 'Headline',
      fontSize: 24,
      color: '#ffffff',
      align: 'center',
      width: 200,
      height: 40,
      mode: 'static',
      multiline: false,
      selectable: true,
      fontId: 'default',
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: 2,
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(textEl);
    editorActions.selectElement('text_rich_1');

    editorActions.updateElementProps('text_rich_1', {
      fontWeight: 800,
      lineHeight: 1.5,
      letterSpacing: 4,
      fontId: 'font_pacifico',
    });

    const kf = getEditorState().doc.root.layers[0].keyframes[0];
    const updated = kf.elements.find((e) => e.id === 'text_rich_1') as TextElement;
    expect(updated.fontWeight).toBe(800);
    expect(updated.lineHeight).toBe(1.5);
    expect(updated.letterSpacing).toBe(4);
    expect(updated.fontId).toBe('font_pacifico');
  });

  it('updates element rotation smoothly in transform state', () => {
    editorActions.newDocument();

    const shape: ShapeElement = {
      id: 'rot_shape_1',
      type: 'shape',
      transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 50 0 L 50 50 Z' }],
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(shape);
    editorActions.updateElementTransform('rot_shape_1', { rotation: 45 });

    const kf = getEditorState().doc.root.layers[0].keyframes[0];
    const updated = kf.elements.find((e) => e.id === 'rot_shape_1')!;
    expect(updated.transform.rotation).toBe(45);
  });
});
