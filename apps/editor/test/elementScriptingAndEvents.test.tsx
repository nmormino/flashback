import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  type EditorElement,
  findKeyframeAt,
} from '../src/state/editorStore';
import { Properties } from '../src/panels/Properties/Properties';
import { StateMachinePanel } from '../src/panels/StateMachine/StateMachinePanel';
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

  it('binds element interactions via State Machine and displays them in Properties and StateMachinePanel', async () => {
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

    await act(async () => {
      root.render(<Properties />);
    });

    // 1. Verify Interactions & State Machine section exists
    expect(container.textContent).toContain('Interactions & State Machine');

    // 2. Click "+ Add Click Interaction" button
    const addClickBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Click Interaction')
    );
    expect(addClickBtn).toBeDefined();

    await act(async () => {
      addClickBtn?.click();
    });

    // Switched to State Machine tab
    expect(getEditorState().activeInspectorTab).toBe('statemachine');

    // State machine has a listener targeting the shape
    let stateMachines = getEditorState().doc.stateMachines;
    expect(stateMachines).toBeDefined();
    expect(stateMachines!.length).toBeGreaterThanOrEqual(1);

    const sm = stateMachines![0];
    expect(sm.listeners).toBeDefined();
    const clickListener = sm.listeners?.find(
      (l) => l.targetElementId === shapeId && l.eventType === 'click'
    );
    expect(clickListener).toBeDefined();

    // 3. Re-render Properties and click "+ Add Hover Interaction"
    await act(async () => {
      root.render(<Properties />);
    });

    const addHoverBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Hover Interaction')
    );
    expect(addHoverBtn).toBeDefined();

    await act(async () => {
      addHoverBtn?.click();
    });

    const hoverListener = getEditorState().doc.stateMachines![0].listeners?.find(
      (l) => l.targetElementId === shapeId && l.eventType === 'pointerenter'
    );
    expect(hoverListener).toBeDefined();

    // 4. Render StateMachinePanel and verify listeners are present
    await act(async () => {
      root.render(<StateMachinePanel />);
    });

    expect(container.textContent).toContain('Game Listeners');
    expect(container.textContent).toContain('click');
    expect(container.textContent).toContain('pointerenter');

    // 5. Clean up
    await act(async () => {
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
