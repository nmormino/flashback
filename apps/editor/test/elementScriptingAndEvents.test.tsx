import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  type EditorElement,
  findKeyframeAt,
} from '../src/state/editorStore';
import { Scripts } from '../src/panels/Scripts/Scripts';
import type { ShapeElement } from '@flashback/runtime';
import { hydrate } from '@flashback/serializer';
import { WebAnim, DisplayObject } from '@flashback/runtime';

describe('Element Scripting & Event Execution Pipeline', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  it('tests DisplayObject context.x assignment directly', () => {
    const shapeObj = new DisplayObject('testShape');
    shapeObj.x = 10;
    expect(shapeObj.x).toBe(10);
    shapeObj.context.x = 99;
    expect(shapeObj.x).toBe(99);
  });

  it('preserves script in Scripts.tsx and doc when typing on a shape, deselecting, and re-selecting', () => {
    editorActions.newDocument();
    const doc = getEditorState().doc;
    const layer = doc.root.layers[0];
    const kf = layer.keyframes[0];

    // Add a vector shape element
    const shapeId = 'shape_hero_star';
    const shape: ShapeElement = {
      id: shapeId,
      type: 'shape',
      paths: [
        {
          d: 'M 0 0 L 100 0 L 100 100 Z',
          fill: { type: 'solid', color: '#ff0055' },
        },
      ],
      transform: {
        x: 50,
        y: 60,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      },
      alpha: 1,
      visible: true,
    };

    kf.elements.push(shape);
    editorActions.selectElement(shapeId);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Scripts />);
    });

    // 1. Target badge correctly recognizes Shape element
    expect(container.textContent).toContain('Target: ⬡');
    expect(container.textContent).toContain('Shape');

    // 2. Select "onPointerEnter — Hover In" event in dropdown
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();

    act(() => {
      const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      selectSetter?.call(select, 'onPointerEnter');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 3. Open code view via </> toggle and type alert('test'); in textarea — auto-saves immediately without clicking Apply
    const codeToggle = container.querySelector('[data-testid="toggle-code-view-btn"]') as HTMLButtonElement;
    if (codeToggle) {
      act(() => {
        codeToggle.click();
      });
    }
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    act(() => {
      const textSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      textSetter?.call(textarea, "alert('test');");
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Verify it is immediately persisted to the doc on the shape element
    const currentDoc = getEditorState().doc;
    const currentLayer = currentDoc.root.layers[0];
    const currentKf = findKeyframeAt(currentLayer, 0);
    const savedShape = currentKf?.elements.find((e) => e.id === shapeId);

    expect(savedShape).toBeDefined();
    expect(savedShape?.events?.onPointerEnter).toEqual({ __fn: "alert('test');" });
    // Stable identifier assigned
    expect(savedShape?.instanceName).toBe(shapeId);
    // Also recorded in doc.scripts
    expect((currentDoc as any).scripts?.[shapeId]?.onPointerEnter).toEqual({ __fn: "alert('test');" });

    // 4. Deselect all elements
    act(() => {
      editorActions.deselectAll();
    });
    expect(getEditorState().selectedElementIds).toHaveLength(0);

    // Scripts panel now shows Frame target
    expect(container.textContent).toContain('Frame 1');

    // 5. Click back into the shape element
    act(() => {
      editorActions.selectElement(shapeId);
    });
    expect(getEditorState().selectedElementIds).toEqual([shapeId]);

    // 6. Verify the script is restored in Scripts.tsx!
    act(() => {
      select.value = 'onPointerEnter';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const restoredTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(restoredTextarea.value).toBe("alert('test');");

    // Clean up
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('executes hover script alert("test") and runtime APIs in WebAnim / preview stage', () => {
    editorActions.newDocument();
    const doc = getEditorState().doc;
    const layer = doc.root.layers[0];
    const kf = layer.keyframes[0];

    const shapeId = 'shape_interactive_box';
    const shape: ShapeElement = {
      id: shapeId,
      instanceName: 'myBox',
      type: 'shape',
      paths: [
        {
          d: 'M 0 0 L 80 0 L 80 80 Z',
          fill: { type: 'solid', color: '#00aaff' },
        },
      ],
      transform: {
        x: 10,
        y: 10,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      },
      alpha: 1,
      visible: true,
      events: {
        onPointerEnter: { __fn: "alert('test'); this.x = 99; stop();" } as any,
        onClick: { __fn: "this.y = 150;" } as any,
      },
    };

    kf.elements.push(shape);

    // Mock alert
    const alertSpy = vi.fn();
    (window as any).alert = alertSpy;

    // Hydrate doc
    const animDoc = hydrate(doc);

    // Mount WebAnim component
    const webAnim = new WebAnim();
    document.body.appendChild(webAnim);

    webAnim.animation = animDoc;
    webAnim.play();

    // Find the shape wrapper DOM element in WebAnim shadowRoot
    const shadow = webAnim.shadowRoot;
    expect(shadow).not.toBeNull();

    const shapeWrapper = shadow!.querySelector(`[data-el-id="${shapeId}"]`) as HTMLElement;
    expect(shapeWrapper).not.toBeNull();

    // Verify pointer-events and cursor are set to interactive
    expect(shapeWrapper.style.pointerEvents).toBe('auto');
    expect(shapeWrapper.style.cursor).toBe('pointer');

    const boxInstance = webAnim.root.getInstance(shapeId) || webAnim.root.getInstance('myBox');

    // Dispatch hover event (pointerenter)
    shapeWrapper.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));

    // Verify alert('test') was called!
    expect(alertSpy).toHaveBeenCalledWith('test');

    // Verify this.x was modified and stop() was executed
    expect(boxInstance).toBeDefined();
    expect(boxInstance.x).toBe(99);

    // Dispatch click event
    shapeWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(boxInstance.y).toBe(150);

    // Teardown
    webAnim.stop();
    webAnim.remove();
  });
});
