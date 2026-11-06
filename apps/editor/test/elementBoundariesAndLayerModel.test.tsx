import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  type EditorElement,
} from '../src/state/editorStore';
import { Timeline } from '../src/panels/Timeline/Timeline';
import { Stage } from '../src/panels/Stage/Stage';
import type { ShapeElement } from '@flashback/runtime';

describe('Element Boundaries & Layer Model (1:1 Element Track & Selection Integrity)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    editorActions.newDocument();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('1. Selecting an element sets selectedElementIds and atomically sets selectedLayerId to its owning layer without clearing selectedElementIds', () => {
    const rect1: ShapeElement = {
      id: 'rect_elem_1',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
      alpha: 1,
      visible: true,
    };
    const oval1: ShapeElement = {
      id: 'oval_elem_1',
      type: 'shape',
      transform: { x: 150, y: 150, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 50 a 50 50 0 1 0 100 0 a 50 50 0 1 0 -100 0 Z' }],
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(rect1);
    editorActions.addElement(oval1);

    const state = getEditorState();
    const rectLayer = state.doc.root.layers.find((l) =>
      l.keyframes.some((k) => k.elements.some((e) => e.id === rect1.id))
    )!;
    const ovalLayer = state.doc.root.layers.find((l) =>
      l.keyframes.some((k) => k.elements.some((e) => e.id === oval1.id))
    )!;

    expect(rectLayer).toBeDefined();
    expect(ovalLayer).toBeDefined();
    expect(rectLayer.id).not.toBe(ovalLayer.id);

    // Select rect1
    editorActions.selectElement(rect1.id);
    const rectSelectedState = getEditorState();
    expect(rectSelectedState.selectedElementIds).toEqual([rect1.id]);
    expect(rectSelectedState.selectedLayerId).toBe(rectLayer.id);

    // Select oval1
    editorActions.selectElement(oval1.id);
    const ovalSelectedState = getEditorState();
    expect(ovalSelectedState.selectedElementIds).toEqual([oval1.id]);
    expect(ovalSelectedState.selectedLayerId).toBe(ovalLayer.id);

    // Multi-select selectElements
    editorActions.selectElements([rect1.id, oval1.id]);
    const multiSelectedState = getEditorState();
    expect(multiSelectedState.selectedElementIds).toEqual([rect1.id, oval1.id]);
    expect(multiSelectedState.selectedLayerId).toBe(rectLayer.id);
  });

  it('2. Calling selectLayer for the owning layer preserves selectedElementIds', () => {
    const shape: ShapeElement = {
      id: 'shape_target',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 50 50 Z' }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(shape);

    const initial = getEditorState();
    const owningLayerId = initial.selectedLayerId!;
    expect(initial.selectedElementIds).toEqual([shape.id]);

    // Calling selectLayer on the same owning layer must NOT clear selectedElementIds!
    editorActions.selectLayer(owningLayerId);
    const afterSelectLayer = getEditorState();
    expect(afterSelectLayer.selectedLayerId).toBe(owningLayerId);
    expect(afterSelectLayer.selectedElementIds).toEqual([shape.id]);

    // Calling selectLayer with preserveElementSelection = true on another layer
    editorActions.addLayer('Other Layer');
    const otherLayerId = getEditorState().selectedLayerId!;
    // Re-select shape
    editorActions.selectElement(shape.id);
    expect(getEditorState().selectedElementIds).toEqual([shape.id]);

    // Select other layer with preserveElementSelection = true
    editorActions.selectLayer(otherLayerId, true);
    expect(getEditorState().selectedLayerId).toBe(otherLayerId);
    expect(getEditorState().selectedElementIds).toEqual([shape.id]);

    // Select other layer without preserveElementSelection clears selection
    editorActions.selectLayer(otherLayerId, false);
    expect(getEditorState().selectedLayerId).toBe(otherLayerId);
    expect(getEditorState().selectedElementIds).toEqual([]);
  });

  it('3. Adding multiple elements gives each element its own dedicated track (1:1 element track) with independent keyframes', () => {
    const el1: ShapeElement = {
      id: 'elem_rect',
      type: 'shape',
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 10 10 Z' }],
      alpha: 1,
      visible: true,
    };
    const el2: ShapeElement = {
      id: 'elem_oval',
      type: 'shape',
      transform: { x: 30, y: 30, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 20 20 Z' }],
      alpha: 1,
      visible: true,
    };
    const el3: EditorElement = {
      id: 'elem_text',
      type: 'text',
      transform: { x: 60, y: 60, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      text: 'Hello Flashback',
      fontSize: 14,
      color: '#000000',
      align: 'left',
      width: 100,
      height: 24,
      mode: 'static',
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(el1);
    editorActions.addElement(el2);
    editorActions.addElement(el3);

    const doc = getEditorState().doc;
    const normalLayers = doc.root.layers.filter((l) => l.kind === 'normal');
    expect(normalLayers.length).toBe(3);

    const track1 = normalLayers.find((l) => l.keyframes.some((k) => k.elements.some((e) => e.id === el1.id)))!;
    const track2 = normalLayers.find((l) => l.keyframes.some((k) => k.elements.some((e) => e.id === el2.id)))!;
    const track3 = normalLayers.find((l) => l.keyframes.some((k) => k.elements.some((e) => e.id === el3.id)))!;

    expect(track1).toBeDefined();
    expect(track2).toBeDefined();
    expect(track3).toBeDefined();
    expect(new Set([track1.id, track2.id, track3.id]).size).toBe(3);

    // Each track has exactly its own element in its initial keyframe
    expect(track1.keyframes[0].elements.map((e) => e.id)).toEqual([el1.id]);
    expect(track2.keyframes[0].elements.map((e) => e.id)).toEqual([el2.id]);
    expect(track3.keyframes[0].elements.map((e) => e.id)).toEqual([el3.id]);

    // Independent keyframe creation on track 2
    editorActions.selectLayer(track2.id);
    editorActions.setCurrentFrame(12);
    editorActions.insertKeyframe();

    const updatedDoc = getEditorState().doc;
    const updatedTrack1 = updatedDoc.root.layers.find((l) => l.id === track1.id)!;
    const updatedTrack2 = updatedDoc.root.layers.find((l) => l.id === track2.id)!;
    const updatedTrack3 = updatedDoc.root.layers.find((l) => l.id === track3.id)!;

    // Track 2 now has 2 keyframes, but Track 1 and Track 3 are completely untouched and independent
    expect(updatedTrack2.keyframes).toHaveLength(2);
    expect(updatedTrack1.keyframes).toHaveLength(1);
    expect(updatedTrack3.keyframes).toHaveLength(1);

    // Adding inside a folder creates dedicated child tracks
    editorActions.addFolder('Characters');
    const folderId = getEditorState().selectedLayerId!;
    const hero: ShapeElement = {
      id: 'hero_sprite',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(hero);

    const stateAfterHero = getEditorState();
    const heroTrack = stateAfterHero.doc.root.layers.find((l) =>
      l.keyframes.some((k) => k.elements.some((e) => e.id === hero.id))
    )!;
    expect(heroTrack).toBeDefined();
    expect(heroTrack.parentLayerId).toBe(folderId);
  });

  it('4. Adding an empty track via addLayer is visible in the Timeline and does not disappear', () => {
    // Start with 1 empty layer in default document
    act(() => {
      root.render(React.createElement(Timeline));
    });

    let trackRows = container.querySelectorAll('[class*="layerRow"]');
    expect(trackRows.length).toBe(1);

    // Add empty track via action
    act(() => {
      editorActions.addLayer();
    });

    trackRows = container.querySelectorAll('[class*="layerRow"]');
    // BOTH empty layers must be rendered! It should NOT disappear!
    expect(trackRows.length).toBe(2);

    // Click "Add Track / Layer" button in header
    const addTrackBtn = container.querySelector('button[title="Add Track / Layer"]') as HTMLButtonElement;
    expect(addTrackBtn).toBeTruthy();

    act(() => {
      addTrackBtn.click();
    });

    trackRows = container.querySelectorAll('[class*="layerRow"]');
    expect(trackRows.length).toBe(3);
  });

  it('5. Mouse down on element preserves selection and renders freeform handles', () => {
    const el: ShapeElement = {
      id: 'clickable_rect',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(el);

    // Deselect first to verify click selection
    editorActions.deselectAll();
    expect(getEditorState().selectedElementIds).toEqual([]);

    act(() => {
      root.render(React.createElement(Stage));
    });

    // Find the element rendered on stage
    const elWrapper = container.querySelector('[class*="elementWrapper"]') as HTMLDivElement;
    expect(elWrapper).toBeTruthy();

    // Trigger mousedown on element
    act(() => {
      elWrapper.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        })
      );
    });

    // Verification: Element selection was NOT wiped out by selectLayer!
    const state = getEditorState();
    expect(state.selectedElementIds).toEqual([el.id]);

    // Freeform transformation handles (8 resize, 4 rotate, 4 skew, pivot) are rendered
    const resizeTl = container.querySelector('[data-testid="resize-handle-tl"]');
    const resizeTr = container.querySelector('[data-testid="resize-handle-tr"]');
    const resizeBl = container.querySelector('[data-testid="resize-handle-bl"]');
    const resizeBr = container.querySelector('[data-testid="resize-handle-br"]');
    const rotateTl = container.querySelector('[data-testid="rotate-handle-tl"]');
    const rotateBr = container.querySelector('[data-testid="rotate-handle-br"]');
    const pivotHandle = container.querySelector('[class*="pivotHandle"]');

    expect(resizeTl).toBeTruthy();
    expect(resizeTr).toBeTruthy();
    expect(resizeBl).toBeTruthy();
    expect(resizeBr).toBeTruthy();
    expect(rotateTl).toBeTruthy();
    expect(rotateBr).toBeTruthy();
    expect(pivotHandle).toBeTruthy();
  });

  it('6. Skew controls are rendered outside the edges and can trigger shear dragging without conflicting with edge resize handles', () => {
    const el: ShapeElement = {
      id: 'skew_test_box',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }],
      alpha: 1,
      visible: true,
    };
    editorActions.addElement(el);
    editorActions.selectElement(el.id);

    act(() => {
      root.render(React.createElement(Stage));
    });

    // Skew handles outside edges
    const skewTop = container.querySelector('[data-testid="skew-handle-top"]') as HTMLDivElement;
    const skewBottom = container.querySelector('[data-testid="skew-handle-bottom"]') as HTMLDivElement;
    const skewLeft = container.querySelector('[data-testid="skew-handle-left"]') as HTMLDivElement;
    const skewRight = container.querySelector('[data-testid="skew-handle-right"]') as HTMLDivElement;

    expect(skewTop).toBeTruthy();
    expect(skewBottom).toBeTruthy();
    expect(skewLeft).toBeTruthy();
    expect(skewRight).toBeTruthy();

    // Verify mid-edge resize handles are separate and present
    const resizeTc = container.querySelector('[data-testid="resize-handle-tc"]');
    const resizeBc = container.querySelector('[data-testid="resize-handle-bc"]');
    const resizeMl = container.querySelector('[data-testid="resize-handle-ml"]');
    const resizeMr = container.querySelector('[data-testid="resize-handle-mr"]');

    expect(resizeTc).toBeTruthy();
    expect(resizeBc).toBeTruthy();
    expect(resizeMl).toBeTruthy();
    expect(resizeMr).toBeTruthy();

    // Trigger mousedown on top skew handle to shear horizontally
    act(() => {
      skewTop.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 40,
        })
      );
    });

    // Simulate drag horizontally
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 130,
          clientY: 40,
        })
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const state = getEditorState();
    const updatedEl = state.doc.root.layers[0].keyframes[0].elements.find(
      (e) => e.id === el.id
    ) as ShapeElement;

    // SkewX was modified by horizontal shear dragging
    expect(updatedEl.transform.skewX).toBeDefined();
    expect(updatedEl.transform.skewX).not.toBe(0);
  });
});
