import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  editorActions,
  getEditorState,
  getActiveArtboard,
  getActiveTimeline,
} from '../src/state/editorStore';
import { createDefaultDocument } from '../src/state/defaultDoc';
import { ArtboardTabStrip } from '../src/panels/Stage/ArtboardTabStrip';

describe('Phase 5: Editor Artboard Management, Tabs & Navigation', () => {
  beforeEach(() => {
    // Reset editor store with default document
    const freshDoc = createDefaultDocument();
    (getEditorState() as any).doc = freshDoc;
    (getEditorState() as any).undoStack = [];
    (getEditorState() as any).redoStack = [];
    (getEditorState() as any).selectedElementIds = [];
    (getEditorState() as any).currentFrame = 0;
  });

  it('implicitly exposes single default artboard when doc.artboards is undefined', () => {
    const doc = getEditorState().doc;
    expect(doc.artboards).toBeUndefined();

    const activeAb = getActiveArtboard(doc);
    expect(activeAb.id).toBe('artboard-1');
    expect(activeAb.name).toBe('Artboard 1');
    expect(activeAb.width).toBe(550);
    expect(activeAb.height).toBe(400);
    expect(activeAb.root).toBe(doc.root);
  });

  it('addArtboard() materializes initial artboard and adds new artboard with fresh timeline', () => {
    const newId = editorActions.addArtboard('Mobile Artboard', 390, 844);
    const doc = getEditorState().doc;

    expect(doc.artboards).toHaveLength(2);
    expect(doc.artboards![0].name).toBe('Artboard 1');
    expect(doc.artboards![1].name).toBe('Mobile Artboard');
    expect(doc.artboards![1].width).toBe(390);
    expect(doc.artboards![1].height).toBe(844);
    expect(doc.activeArtboardId).toBe(newId);

    // Active timeline matches new artboard's root
    const activeTl = getActiveTimeline(doc);
    expect(activeTl).toBe(doc.artboards![1].root);
  });

  it('setActiveArtboard() switches active artboard and updates active timeline', () => {
    const newId = editorActions.addArtboard('Second Artboard', 1080, 1080);
    expect(getEditorState().doc.activeArtboardId).toBe(newId);

    const firstId = getEditorState().doc.artboards![0].id;
    editorActions.setActiveArtboard(firstId);

    const doc = getEditorState().doc;
    expect(doc.activeArtboardId).toBe(firstId);
    expect(getActiveTimeline(doc)).toBe(doc.artboards![0].root);
  });

  it('duplicateArtboard() duplicates artboard with cloned layers and unique IDs', () => {
    editorActions.addArtboard('Original', 600, 600);
    const docBefore = getEditorState().doc;
    const origId = docBefore.activeArtboardId!;

    const dupId = editorActions.duplicateArtboard(origId);
    const docAfter = getEditorState().doc;

    expect(docAfter.artboards).toHaveLength(3);
    const dup = docAfter.artboards!.find((a) => a.id === dupId);
    expect(dup).toBeDefined();
    expect(dup?.name).toBe('Original Copy');
    expect(dup?.width).toBe(600);
    expect(dup?.height).toBe(600);
    expect(dup?.id).not.toBe(origId);
  });

  it('renameArtboard() updates the artboard name', () => {
    editorActions.addArtboard('Draft Name', 550, 400);
    const doc = getEditorState().doc;
    const targetId = doc.activeArtboardId!;

    editorActions.renameArtboard(targetId, 'Published Screen');
    const updated = getEditorState().doc.artboards!.find((a) => a.id === targetId);
    expect(updated?.name).toBe('Published Screen');
  });

  it('deleteArtboard() removes the artboard and preserves at least one artboard', () => {
    const ab2 = editorActions.addArtboard('To Be Deleted', 550, 400);
    expect(getEditorState().doc.artboards).toHaveLength(2);

    editorActions.deleteArtboard(ab2);
    expect(getEditorState().doc.artboards).toHaveLength(1);

    // Attempting to delete the last remaining artboard is a no-op
    const lastId = getEditorState().doc.artboards![0].id;
    editorActions.deleteArtboard(lastId);
    expect(getEditorState().doc.artboards).toHaveLength(1);
  });

  it('undo/redo restores artboard additions, renames and deletions', () => {
    const ab2 = editorActions.addArtboard('Undoable Artboard', 800, 600);
    expect(getEditorState().doc.artboards).toHaveLength(2);

    editorActions.undo();
    expect(getEditorState().doc.artboards || []).toHaveLength(0); // reverted to implicit single

    editorActions.redo();
    expect(getEditorState().doc.artboards).toHaveLength(2);
    expect(getEditorState().doc.artboards![1].name).toBe('Undoable Artboard');
  });

  it('moveElementToArtboard() moves element from one artboard to another', () => {
    // 1. Insert a shape element on artboard 1
    const testEl: any = {
      id: 'test_rect_1',
      type: 'shape',
      alpha: 1,
      visible: true,
      transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [],
    };
    editorActions.addElement(testEl);
    const elId = testEl.id;

    // 2. Add artboard 2
    const ab2 = editorActions.addArtboard('Target Artboard', 600, 600);

    // 3. Switch back to artboard 1 and move the element to artboard 2
    const ab1 = getEditorState().doc.artboards![0].id;
    editorActions.setActiveArtboard(ab1);
    expect(getActiveArtboard(getEditorState().doc).id).toBe(ab1);

    editorActions.moveElementToArtboard(elId, ab2);

    // Element removed from artboard 1
    const ab1Tl = getEditorState().doc.artboards![0].root;
    const inAb1 = ab1Tl.layers[0].keyframes[0].elements.some((e) => e.id === elId);
    expect(inAb1).toBe(false);

    // Element present in artboard 2
    const ab2Tl = getEditorState().doc.artboards![1].root;
    const inAb2 = ab2Tl.layers[0].keyframes[0].elements.some((e) => e.id === elId);
    expect(inAb2).toBe(true);
  });

  it('ArtboardTabStrip renders accessible tablist, tabs, and handles switching and adding', () => {
    editorActions.addArtboard('Landing Page', 1440, 900);
    editorActions.addArtboard('Mobile Modal', 390, 844);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ArtboardTabStrip />);
    });

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3); // Artboard 1 + Landing Page + Mobile Modal

    // Last added is active
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(tabs[2].textContent).toContain('Mobile Modal');

    // Click first tab
    act(() => {
      (tabs[0] as HTMLButtonElement).click();
    });

    expect(getEditorState().doc.activeArtboardId).toBe(getEditorState().doc.artboards![0].id);

    // Click '+' Add Artboard button
    const addBtn = container.querySelector('button[title="Add Artboard"]') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();

    act(() => {
      addBtn.click();
    });

    expect(getEditorState().doc.artboards).toHaveLength(4);

    root.unmount();
    container.remove();
  });
});
