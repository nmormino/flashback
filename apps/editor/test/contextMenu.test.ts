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

    const targetLayer = getEditorState().doc.root.layers[0];
    targetLayer.keyframes[0].elements = [el1, el2];

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

  it('supports keyframe copy, paste, duplicate, and convertToBlankKeyframe', () => {
    editorActions.newDocument();
    const layer = getEditorState().doc.root.layers[0];

    const shape: ShapeElement = {
      id: 'shape_kf_1',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(shape);

    // Initial keyframe has 1 element
    expect(getEditorState().doc.root.layers[0].keyframes[0].elements).toHaveLength(1);

    // Copy keyframe
    editorActions.copyKeyframe(layer.id, 0);
    expect(getEditorState().keyframeClipboard).not.toBeNull();
    expect(getEditorState().keyframeClipboard?.elements).toHaveLength(1);

    // Duplicate keyframe
    editorActions.duplicateKeyframe(layer.id, 0);
    let updatedLayer = getEditorState().doc.root.layers[0];
    expect(updatedLayer.keyframes.length).toBeGreaterThanOrEqual(2);

    // Convert to blank keyframe
    editorActions.convertToBlankKeyframe(layer.id, 0);
    updatedLayer = getEditorState().doc.root.layers[0];
    expect(updatedLayer.keyframes[0].elements).toHaveLength(0);

    // Paste keyframe at frame 12
    editorActions.pasteKeyframe(layer.id, 12);
    updatedLayer = getEditorState().doc.root.layers[0];
    const kf12 = updatedLayer.keyframes.find((k) => k.index === 12);
    expect(kf12).toBeDefined();
    expect(kf12?.elements).toHaveLength(1);

    // Delete keyframe
    editorActions.deleteKeyframe(layer.id, 12);
    updatedLayer = getEditorState().doc.root.layers[0];
    expect(updatedLayer.keyframes.find((k) => k.index === 12)).toBeUndefined();
  });

  it('supports layer grouping into folder, ungrouping, and moveLayerToFolder', () => {
    editorActions.newDocument();
    const layer = getEditorState().doc.root.layers[0];

    // Group layer into folder
    editorActions.groupLayerIntoFolder(layer.id);
    let tl = getEditorState().doc.root;
    const folder = tl.layers.find((l) => l.kind === 'folder')!;
    expect(folder).toBeDefined();
    const updatedLayer = tl.layers.find((l) => l.id === layer.id)!;
    expect(updatedLayer.parentLayerId).toBe(folder.id);

    // Move layer to root (ungroup)
    editorActions.ungroupLayer(layer.id);
    tl = getEditorState().doc.root;
    expect(tl.layers.find((l) => l.id === layer.id)?.parentLayerId).toBeUndefined();

    // Move layer back into folder
    editorActions.moveLayerToFolder(layer.id, folder.id);
    tl = getEditorState().doc.root;
    expect(tl.layers.find((l) => l.id === layer.id)?.parentLayerId).toBe(folder.id);

    // Ungroup folder dissolves the folder and retains children
    editorActions.ungroupLayer(folder.id);
    tl = getEditorState().doc.root;
    expect(tl.layers.find((l) => l.id === folder.id)).toBeUndefined();
    expect(tl.layers.find((l) => l.id === layer.id)).toBeDefined();
  });
});
