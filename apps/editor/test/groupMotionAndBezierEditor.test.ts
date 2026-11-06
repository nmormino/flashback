import { describe, it, expect, beforeEach } from 'vitest';
import { getEditorState, editorActions } from '../src/state/editorStore';
import { PRESETS } from '../src/ui/BezierEditorModal';
import { serialize } from '@flashback/serializer';
import type { ShapeElement } from '@flashback/runtime';

describe('Phase 1: Group Motion & Selection in Editor', () => {
  beforeEach(() => {
    editorActions.newDocument();
  });

  it('selecting a folder or layer row clears selectedElementIds to select as one entity', () => {
    const s = getEditorState();
    const activeTl = s.doc.root;

    // Add a folder
    editorActions.addFolder('Characters Folder');
    const folder = getEditorState().doc.root.layers.find((l) => l.name === 'Characters Folder')!;
    expect(folder).toBeDefined();

    // Add a child element on default layer and select it
    const shape: ShapeElement = {
      id: 'box_child',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
    };
    editorActions.addElement(shape);
    editorActions.selectElement('box_child');
    expect(getEditorState().selectedElementIds).toEqual(['box_child']);

    // Now clicking the folder row in Timeline selects the folder as one entity
    editorActions.selectLayer(folder.id);
    const updated = getEditorState();
    expect(updated.selectedLayerId).toBe(folder.id);
    expect(updated.selectedElementIds).toEqual([]); // element selection cleared
  });

  it('updateFolderTransform edits the folder transform and auto-keyframes without touching children', () => {
    // Add folder
    editorActions.addFolder('Enemies');
    const state1 = getEditorState();
    const folder = state1.doc.root.layers.find((l) => l.name === 'Enemies')!;

    // Put a child layer inside folder
    const childShape: ShapeElement = {
      id: 'orc',
      type: 'shape',
      transform: { x: 20, y: 30, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10' }],
    };
    editorActions.addLayer('Orc Layer');
    const orcLayer = getEditorState().doc.root.layers.find((l) => l.name === 'Orc Layer')!;
    editorActions.setLayerParent(orcLayer.id, folder.id);
    editorActions.addElement(childShape);

    // Initial folder has identity/clean transform
    expect(folder.transform?.x ?? 0).toBe(0);

    // Edit folder transform at frame 0
    editorActions.updateFolderTransform(folder.id, { x: 150, y: 80 });

    const state2 = getEditorState();
    const updatedFolder = state2.doc.root.layers.find((l) => l.id === folder.id)!;
    expect(updatedFolder.transform?.x).toBe(150);
    expect(updatedFolder.transform?.y).toBe(80);

    // Crucial requirement: child transform was NEVER modified
    const updatedOrcLayer = state2.doc.root.layers.find((l) => l.id === orcLayer.id)!;
    const orcEl = updatedOrcLayer.keyframes[0].elements.find((e) => e.id === 'orc')!;
    expect(orcEl.transform.x).toBe(20);
    expect(orcEl.transform.y).toBe(30);

    // Move playhead forward to frame 12 and edit folder again -> auto-keyframes!
    editorActions.setCurrentFrame(12);
    editorActions.updateFolderTransform(folder.id, { x: 250, y: 120 });

    const state3 = getEditorState();
    const kfFolder = state3.doc.root.layers.find((l) => l.id === folder.id)!;
    expect(kfFolder.keyframes.length).toBeGreaterThanOrEqual(2);
    const kf12 = kfFolder.keyframes.find((k) => k.index === 12);
    expect(kf12).toBeDefined();
    expect(kf12?.transform?.x).toBe(250);
    expect(kf12?.transform?.y).toBe(120);

    // Child transform still remains untouched at (20, 30)
    const childAfter = state3.doc.root.layers.find((l) => l.id === orcLayer.id)!.keyframes[0].elements[0];
    expect(childAfter.transform.x).toBe(20);
    expect(childAfter.transform.y).toBe(30);
  });

  it('keeps exported JSON concise by omitting identity transforms on layers and keyframes', () => {
    // A fresh doc with identity layer/folder
    editorActions.addFolder('EmptyGroup');
    const json = serialize(getEditorState().doc);
    // Identity transform should be omitted from concise JSON
    expect(json).not.toContain('"transform": {');
  });
});

describe('Phase 2: Bézier Curve Editor in Editor UI', () => {
  beforeEach(() => {
    editorActions.newDocument();
  });

  it('has presets for linear, ease-in, ease-out, ease-in-out, back, bounce', () => {
    const names = PRESETS.map((p) => p.name);
    expect(names).toContain('Linear');
    expect(names).toContain('Ease In');
    expect(names).toContain('Ease Out');
    expect(names).toContain('Ease In-Out');
    expect(names).toContain('Back');
    expect(names).toContain('Bounce');

    const backPreset = PRESETS.find((p) => p.name === 'Back')!;
    expect(backPreset.p[1]).toBeGreaterThan(1); // overshoot y1 > 1

    const bouncePreset = PRESETS.find((p) => p.name === 'Bounce')!;
    expect(bouncePreset.p[1]).toBeLessThan(0); // negative anticipate
  });

  it('setKeyframeEasing stores cubic-bezier on keyframe tween easing', () => {
    const layer = getEditorState().doc.root.layers[0];
    const kf = layer.keyframes[0];

    // Set custom cubic-bezier
    const customP: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
    editorActions.setKeyframeEasing(layer.id, kf.id, {
      type: 'cubic-bezier',
      p: customP,
    });

    const updatedKf = getEditorState().doc.root.layers[0].keyframes[0];
    expect(updatedKf.tween).toBeDefined();
    expect(updatedKf.tween?.type).toBe('motion');
    expect(updatedKf.tween?.easing).toEqual({
      type: 'cubic-bezier',
      p: customP,
    });
  });

  it('opens and closes Bézier curve editor modal state via editorActions', () => {
    expect(getEditorState().bezierModalOpen).toBe(false);

    const layer = getEditorState().doc.root.layers[0];
    const kf = layer.keyframes[0];

    editorActions.openBezierEditor(layer.id, kf.id, {
      type: 'cubic-bezier',
      p: [0.34, 1.56, 0.64, 1],
    });

    const openState = getEditorState();
    expect(openState.bezierModalOpen).toBe(true);
    expect(openState.activeBezierTarget?.layerId).toBe(layer.id);
    expect(openState.activeBezierTarget?.kfId).toBe(kf.id);
    expect(openState.activeBezierTarget?.initialEasing).toEqual({
      type: 'cubic-bezier',
      p: [0.34, 1.56, 0.64, 1],
    });

    editorActions.closeBezierEditor();
    expect(getEditorState().bezierModalOpen).toBe(false);
    expect(getEditorState().activeBezierTarget).toBeNull();
  });
});

