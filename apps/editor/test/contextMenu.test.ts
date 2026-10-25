import { describe, it, expect } from 'vitest';
import { editorActions, getEditorState } from '../src/state/editorStore';
import type { ShapeElement } from '@flashback/runtime';

describe('Context Menu & Clipboard Operations', () => {
  it('opens and closes context menu state', () => {
    editorActions.openContextMenu({
      x: 150,
      y: 200,
      items: [
        { label: 'Test Item', action: () => {} },
      ],
    });

    const state = getEditorState();
    expect(state.contextMenu).not.toBeNull();
    expect(state.contextMenu?.isOpen).toBe(true);
    expect(state.contextMenu?.x).toBe(150);
    expect(state.contextMenu?.y).toBe(200);
    expect(state.contextMenu?.items).toHaveLength(1);

    editorActions.closeContextMenu();
    expect(getEditorState().contextMenu).toBeNull();
  });

  it('supports copy, cut, paste, and duplicate', () => {
    editorActions.newDocument();

    const shape: ShapeElement = {
      id: 'shape_test_1',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 20 0 L 20 20 Z' }],
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(shape);
    editorActions.selectElement('shape_test_1');

    // Duplicate
    editorActions.duplicateSelectedElements();
    let kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements).toHaveLength(2);

    // Copy
    editorActions.selectElement('shape_test_1');
    editorActions.copySelectedElements();
    expect(getEditorState().clipboard).toHaveLength(1);

    // Paste
    editorActions.pasteElements();
    kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements).toHaveLength(3);

    // Cut
    editorActions.selectElement('shape_test_1');
    editorActions.cutSelectedElements();
    kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements).toHaveLength(2);
    expect(getEditorState().clipboard[0].id).toBe('shape_test_1');
  });

  it('supports bringToFront and sendToBack z-order ordering', () => {
    editorActions.newDocument();

    const el1: ShapeElement = {
      id: 'el_1',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
      alpha: 1,
      visible: true,
    };
    const el2: ShapeElement = {
      id: 'el_2',
      type: 'shape',
      transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(el1);
    editorActions.addElement(el2);

    let kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements.map((e) => e.id)).toEqual(['el_1', 'el_2']);

    // Bring el_1 to front
    editorActions.bringToFront('el_1');
    kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements.map((e) => e.id)).toEqual(['el_2', 'el_1']);

    // Send el_1 to back
    editorActions.sendToBack('el_1');
    kf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(kf.elements.map((e) => e.id)).toEqual(['el_1', 'el_2']);
  });
});
