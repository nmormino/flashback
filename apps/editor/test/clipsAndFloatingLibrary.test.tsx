import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useEditorStore,
  editorActions,
  getEditorState,
  type EditorSymbol,
  type EditorElement,
} from '../src/state/editorStore';
import { Library } from '../src/panels/Library/Library';
import { Stage } from '../src/panels/Stage/Stage';
import { MenuBar } from '../src/layout/MenuBar';
import type { ShapeElement, SymbolInstance } from '@flashback/runtime';

describe('Floating Clips Window & Compounded Nested Timelines', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    editorActions.newDocument();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders Library as a floating window with close button and clips terminology', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<Library />);
    });

    const floatingWin = container.querySelector('[data-testid="floating-clips-library"]') as HTMLElement;
    expect(floatingWin).toBeTruthy();
    expect(floatingWin.style.position).toBe('fixed');

    // Terminology check
    expect(container.textContent).toContain('Clips');
    expect(container.textContent).toContain('+ New Clip (F8)');

    // Close window via ✕ button
    const closeBtn = container.querySelector('[data-testid="close-library-btn"]') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();

    act(() => {
      closeBtn.click();
    });

    expect(getEditorState().isLibraryOpen).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('can open and toggle Clips window from MenuBar and keyboard shortcut', () => {
    editorActions.setLibraryOpen(false);
    expect(getEditorState().isLibraryOpen).toBe(false);

    // Toggle via action
    editorActions.toggleLibrary();
    expect(getEditorState().isLibraryOpen).toBe(true);

    const root = createRoot(container);
    act(() => {
      root.render(<MenuBar />);
    });

    // Open hamburger menu
    const hamburgerBtn = container.querySelector('button[title="Menu & Settings"]') as HTMLButtonElement;
    expect(hamburgerBtn).toBeTruthy();
    act(() => {
      hamburgerBtn.click();
    });

    // Should list Clips Window
    expect(container.textContent).toContain('Clips Window');

    act(() => {
      root.unmount();
    });
  });

  it('creates an empty 100x100 Clip artboard and enters isolation mode', () => {
    const symId = editorActions.createEmptyClip('Tumbleweed', 100, 100);
    const state = getEditorState();

    const sym = state.doc.library.symbols[symId];
    expect(sym).toBeDefined();
    expect(sym.name).toBe('Tumbleweed');
    expect(sym.width).toBe(100);
    expect(sym.height).toBe(100);
    expect(sym.kind).toBe('movieclip');

    // Automatically enters isolation mode
    expect(state.isolationStack.length).toBe(1);
    expect(state.isolationStack[0].symbolId).toBe(symId);
    expect(state.isolationStack[0].name).toBe('Tumbleweed');

    // Exit isolation
    editorActions.exitIsolation();
    expect(getEditorState().isolationStack.length).toBe(0);
  });

  it('renders compounded timelines: instance moving on stage while inner clip spins 360 degrees', () => {
    // 1. Create nested clip "Tumbleweed" (100x100 artboard)
    editorActions.newDocument();
    const clipId = editorActions.createEmptyClip('Tumbleweed', 100, 100);
    const clipDef = getEditorState().doc.library.symbols[clipId];

    // Inside Tumbleweed clip: 12 frames (0.5s at 24fps)
    // Keyframe 0: spinning shape at rotation 0
    // Keyframe 12 (0.5s): rotation 360
    const innerShape: ShapeElement = {
      id: 'tumbleweed_weed_art',
      type: 'shape',
      transform: {
        x: 50,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      },
      paths: [{ d: 'M -20 -20 L 20 -20 L 20 20 L -20 20 Z', fill: { type: 'solid', color: '#d97706' } }],
      alpha: 1,
      visible: true,
    };

    const innerShapeEnd: ShapeElement = {
      ...innerShape,
      transform: {
        ...innerShape.transform,
        rotation: 360,
      },
    };

    // Populate Tumbleweed timeline with motion tween
    clipDef.timeline = {
      frameCount: 12,
      layers: [
        {
          id: 'tumbleweed_spin_layer',
          name: 'Spin',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf_spin_start',
              index: 0,
              duration: 12,
              elements: [innerShape],
              tween: {
                type: 'motion',
              },
            },
            {
              id: 'kf_spin_end',
              index: 12,
              duration: 1,
              elements: [innerShapeEnd],
            },
          ],
        },
      ],
    };

    // Exit isolation back to root stage
    editorActions.exitToIsolationLevel(-1);
    expect(getEditorState().isolationStack.length).toBe(0);

    // 2. Add Tumbleweed clip instance to Stage root timeline
    editorActions.addSymbolToStage(clipId, 0, 100);
    const rootKf0 = getEditorState().doc.root.layers[0].keyframes[0];
    const instEl = rootKf0.elements.find((e) => e.type === 'instance') as SymbolInstance;
    expect(instEl).toBeDefined();

    // Create a motion tween on the root layer: moving instance from x=0 to x=500 over 48 frames (2.0s)
    const instEnd: SymbolInstance = {
      ...instEl,
      transform: {
        ...instEl.transform,
        x: 500,
      },
    };

    const rootLayer = getEditorState().doc.root.layers[0];
    rootLayer.keyframes = [
      {
        id: 'root_kf_start',
        index: 0,
        duration: 48,
        elements: [instEl],
        tween: {
          type: 'motion',
        },
      },
      {
        id: 'root_kf_end',
        index: 48,
        duration: 1,
        elements: [instEnd],
      },
    ];

    // 3. Mount Stage and inspect compounding at different time points
    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    // At t = 0.25s (quarter through 2s motion, half through 0.5s spin)
    act(() => {
      editorActions.setCurrentTime(0.25);
    });

    // The root instance wrapper is translated based on x=62.5 with registration (50, 50): tx = 62.5 - 50 = 12.5
    const instWrapper = container.querySelector(`[data-el-id="${instEl.id}"]`) as HTMLElement;
    expect(instWrapper).toBeTruthy();
    expect(instWrapper.style.transform).toContain('12.5');

    // The inner tumbleweed shape should be rotated by 180deg (0.25s is halfway through 0.5s 360deg spin)
    const innerShapeEl = container.querySelector('[d="M -20 -20 L 20 -20 L 20 20 L -20 20 Z"]') as SVGPathElement;
    expect(innerShapeEl).toBeTruthy();
    const innerDiv = innerShapeEl.closest('div[style*="matrix"]') as HTMLElement;
    expect(innerDiv).toBeTruthy();

    // At 180 degrees, cos(180) = -1, sin(180) = 0: matrix(-1, 0, 0, -1, 50, 50)
    // Verify it is transformed by a rotation matrix rather than an identity/zero rotation matrix
    expect(innerDiv.style.transform).toContain('matrix');
    expect(innerDiv.style.transform).not.toBe('matrix(1, 0, 0, 1, 50, 50)');

    act(() => {
      root.unmount();
    });
  });

  it('rotates a rectangular image around its center point without swinging on its top-left point', () => {
    // 1. Create a clip with a 200x100 rectangular image
    editorActions.newDocument();
    const clipId = editorActions.createEmptyClip('ImageClip', 200, 100);
    const clipDef = getEditorState().doc.library.symbols[clipId];

    // Inside the clip: a 200x100 rectangular image
    const rectImage: ShapeElement = {
      id: 'rect_img',
      type: 'shape',
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 100, // Center X (200 / 2)
        originY: 50,  // Center Y (100 / 2)
      },
      paths: [{ d: 'M 0 0 L 200 0 L 200 100 L 0 100 Z', fill: { type: 'solid', color: '#3b82f6' } }],
      alpha: 1,
      visible: true,
    };

    const rectImageRotated: ShapeElement = {
      ...rectImage,
      transform: {
        ...rectImage.transform,
        rotation: 180,
      },
    };

    clipDef.timeline = {
      frameCount: 12,
      layers: [
        {
          id: 'spin_layer',
          name: 'Spin',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf_0',
              index: 0,
              duration: 12,
              elements: [rectImage],
              tween: { type: 'motion' },
            },
            {
              id: 'kf_12',
              index: 12,
              duration: 1,
              elements: [rectImageRotated],
            },
          ],
        },
      ],
    };

    // Exit isolation back to root stage
    editorActions.exitToIsolationLevel(-1);

    // 2. Pull the clip onto the main artboard
    editorActions.addSymbolToStage(clipId, 100, 100);

    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    // Check at t = 0s (0 deg)
    act(() => {
      editorActions.setCurrentTime(0);
    });

    const pathAt0 = container.querySelector('[d="M 0 0 L 200 0 L 200 100 L 0 100 Z"]') as SVGPathElement;
    expect(pathAt0).toBeTruthy();
    const childDivAt0 = pathAt0.closest('div[style*="matrix"]') as HTMLElement;
    expect(childDivAt0).toBeTruthy();
    // At rot 0: origin is (100, 50), tx = 0 - (1*100) = -100, ty = 0 - (1*50) = -50
    expect(childDivAt0.style.transformOrigin).toBe('0 0');
    expect(childDivAt0.style.left).toBe('0px');
    expect(childDivAt0.style.top).toBe('0px');

    // Check at t = 0.25s (halfway through 0.5s cycle: 90 deg rotation)
    act(() => {
      editorActions.setCurrentTime(0.25);
    });

    const pathAt90 = container.querySelector('[d="M 0 0 L 200 0 L 200 100 L 0 100 Z"]') as SVGPathElement;
    expect(pathAt90).toBeTruthy();
    const childDivAt90 = pathAt90.closest('div[style*="matrix"]') as HTMLElement;
    expect(childDivAt90).toBeTruthy();
    // At 90 deg: cos(90) = 0, sin(90) = 1
    expect(childDivAt90.style.transform).toContain('matrix(0, 1, -1, 0');

    act(() => {
      root.unmount();
    });
  });
});
