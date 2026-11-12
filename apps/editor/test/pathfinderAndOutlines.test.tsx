import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  editorActions,
  getEditorState,
  getActiveTimeline,
} from '../src/state/editorStore';
import { Stage } from '../src/panels/Stage/Stage';
import { Properties } from '../src/panels/Properties/Properties';
import {
  fitPointsToCurve,
  getPreciseCurveBounds,
} from '../src/utils/geometry';
import type { ShapeElement, TextElement } from '@flashback/runtime';

describe('Pathfinder, Outline Stroke, Pencil Smoothing & Text Outlines', () => {
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

  describe('Pathfinder Boolean Operations in Store', () => {
    // Two overlapping 100x100 squares:
    // Rect 1: [0, 0] to [100, 100] (Bottom / Base Shape)
    // Rect 2: [50, 50] to [150, 150] (Top / Front Shape)
    function setupTwoOverlappingRects(): { rect1: ShapeElement; rect2: ShapeElement } {
      const rect1: ShapeElement = {
        id: 'rect_bottom',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
            fill: { type: 'solid', color: '#ff0000' },
            stroke: {
              fill: { type: 'solid', color: '#111111' },
              width: 2,
              cap: 'round',
              join: 'round',
            },
          },
        ],
        alpha: 1,
      };

      const rect2: ShapeElement = {
        id: 'rect_top',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 50 50 L 150 50 L 150 150 L 50 150 Z',
            fill: { type: 'solid', color: '#0000ff' },
          },
        ],
        alpha: 1,
      };

      editorActions.addElement(rect1);
      editorActions.addElement(rect2);
      editorActions.selectElements(['rect_bottom', 'rect_top']);

      return { rect1, rect2 };
    }

    it('uniteSelectedShapes combines 2 overlapping shapes and preserves bottom shape styling', () => {
      setupTwoOverlappingRects();

      editorActions.uniteSelectedShapes();

      const tl = getActiveTimeline(getEditorState().doc);
      const elements = tl.layers[0].keyframes[0].elements;

      expect(elements).toHaveLength(1);
      const unitedShape = elements[0] as ShapeElement;
      expect(unitedShape).toBeDefined();
      expect(unitedShape.type).toBe('shape');
      expect(unitedShape.isCustomizedPath).toBe(true);

      // Bottom shape styling (red fill & dark stroke) preserved
      expect(unitedShape.paths[0].fill).toEqual({ type: 'solid', color: '#ff0000' });
      expect(unitedShape.paths[0].stroke?.width).toBe(2);

      // Path data should span 0..150 on both X and Y axes
      const bounds = getPreciseCurveBounds(unitedShape.paths[0].d);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(150, 1);
      expect(bounds.maxY).toBeCloseTo(150, 1);

      // Selection updated to the remaining united shape
      expect(getEditorState().selectedElementIds).toEqual([unitedShape.id]);
    });

    it('subtractSelectedShapes subtracts top shape from bottom shape (Minus Front)', () => {
      setupTwoOverlappingRects();

      editorActions.subtractSelectedShapes();

      const tl = getActiveTimeline(getEditorState().doc);
      const elements = tl.layers[0].keyframes[0].elements;

      expect(elements).toHaveLength(1);
      const subtractedShape = elements[0] as ShapeElement;
      expect(subtractedShape).toBeDefined();
      expect(subtractedShape.isCustomizedPath).toBe(true);

      // Keeps bottom styling
      expect(subtractedShape.paths[0].fill).toEqual({ type: 'solid', color: '#ff0000' });

      // Region subtracted: bounds remain bounded inside [0, 100]
      const bounds = getPreciseCurveBounds(subtractedShape.paths[0].d);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.maxY).toBeCloseTo(100, 1);
    });

    it('intersectSelectedShapes computes the intersection of 2 selected shapes', () => {
      setupTwoOverlappingRects();

      editorActions.intersectSelectedShapes();

      const tl = getActiveTimeline(getEditorState().doc);
      const elements = tl.layers[0].keyframes[0].elements;

      expect(elements).toHaveLength(1);
      const intersectedShape = elements[0] as ShapeElement;
      expect(intersectedShape).toBeDefined();

      // Intersection between [0, 100] and [50, 150] is [50, 100]
      const bounds = getPreciseCurveBounds(intersectedShape.paths[0].d);
      expect(bounds.minX).toBeCloseTo(50, 1);
      expect(bounds.minY).toBeCloseTo(50, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.maxY).toBeCloseTo(100, 1);
    });

    it('excludeSelectedShapes computes the symmetric difference (XOR) of 2 shapes', () => {
      setupTwoOverlappingRects();

      editorActions.excludeSelectedShapes();

      const tl = getActiveTimeline(getEditorState().doc);
      const elements = tl.layers[0].keyframes[0].elements;

      expect(elements).toHaveLength(1);
      const excludedShape = elements[0] as ShapeElement;
      expect(excludedShape).toBeDefined();

      // Bounds span the two non-overlapping corners [0, 0] to [150, 150]
      const bounds = getPreciseCurveBounds(excludedShape.paths[0].d);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(150, 1);
    });

    it('uniteSelectedShapes combines 3 shapes in sequence', () => {
      const { rect1 } = setupTwoOverlappingRects();

      const rect3: ShapeElement = {
        id: 'rect_3',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 100 100 L 200 100 L 200 200 L 100 200 Z',
            fill: { type: 'solid', color: '#00ff00' },
          },
        ],
        alpha: 1,
      };
      editorActions.addElement(rect3);
      editorActions.selectElements(['rect_bottom', 'rect_top', 'rect_3']);

      editorActions.uniteSelectedShapes();

      const tl = getActiveTimeline(getEditorState().doc);
      const elements = tl.layers[0].keyframes[0].elements;
      expect(elements).toHaveLength(1);

      const bounds = getPreciseCurveBounds(elements[0].paths[0].d);
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(200, 1);
      expect(bounds.maxY).toBeCloseTo(200, 1);
    });
  });

  describe('Outline Stroke (outlineSelectedStroke)', () => {
    it('converts a stroked path into a closed filled vector path and removes the stroke', () => {
      const strokedShape: ShapeElement = {
        id: 'stroked_line',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 10 10 L 100 10',
            stroke: {
              fill: { type: 'solid', color: '#ff00ff' },
              width: 10,
              cap: 'round',
              join: 'round',
            },
          },
        ],
        alpha: 1,
      };

      editorActions.addElement(strokedShape);
      editorActions.selectElements(['stroked_line']);

      editorActions.outlineSelectedStroke();

      const tl = getActiveTimeline(getEditorState().doc);
      const updatedShape = tl.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'stroked_line'
      ) as ShapeElement;

      expect(updatedShape).toBeDefined();
      expect(updatedShape.isCustomizedPath).toBe(true);

      // The new path should be closed
      expect(updatedShape.paths[0].d.toLowerCase()).toContain('z');

      // The fill is now the former stroke fill (#ff00ff)
      expect(updatedShape.paths[0].fill).toEqual({ type: 'solid', color: '#ff00ff' });

      // Stroke property is removed
      expect(updatedShape.paths[0].stroke).toBeUndefined();

      // Precision bounds for 10px round capped line from (10, 10) to (100, 10)
      const bounds = getPreciseCurveBounds(updatedShape.paths[0].d);
      expect(bounds.minX).toBeCloseTo(5, 1);
      expect(bounds.maxX).toBeCloseTo(105, 1);
      expect(bounds.minY).toBeCloseTo(5, 1);
      expect(bounds.maxY).toBeCloseTo(15, 1);
    });
  });

  describe('Text to Vector Outlines (convertSelectedTextToOutlines)', () => {
    it('converts a TextElement into a ShapeElement using standard fallback font', async () => {
      const textEl: TextElement = {
        id: 'text_test_1',
        type: 'text',
        visible: true,
        mode: 'static',
        text: 'HELLO',
        fontId: 'default',
        fontSize: 48,
        color: '#ff9900',
        fill: { type: 'solid', color: '#ff9900' },
        transform: { x: 50, y: 80, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
      };

      editorActions.addElement(textEl);
      editorActions.selectElements(['text_test_1']);

      await editorActions.convertSelectedTextToOutlines();

      const tl = getActiveTimeline(getEditorState().doc);
      const remainingElements = tl.layers[0].keyframes[0].elements;

      expect(remainingElements).toHaveLength(1);
      const outlinedShape = remainingElements[0] as ShapeElement;

      expect(outlinedShape.type).toBe('shape');
      expect(outlinedShape.isCustomizedPath).toBe(true);
      expect(outlinedShape.paths).toHaveLength(1);
      expect(outlinedShape.paths[0].d.length).toBeGreaterThan(0);
      expect(outlinedShape.paths[0].d).toContain('M');

      // Preserves fill color and transform
      expect(outlinedShape.paths[0].fill).toEqual({ type: 'solid', color: '#ff9900' });
      expect(outlinedShape.transform.x).toBe(50);
      expect(outlinedShape.transform.y).toBe(80);

      // Selection points to the new shape
      expect(getEditorState().selectedElementIds).toEqual([outlinedShape.id]);
    });
  });

  describe('Pencil Curve Generation & Smoothing', () => {
    it('creates a pencil shape using fitPointsToCurve with cubic Bézier segments', () => {
      const rawPoints = [
        { x: 10, y: 10 },
        { x: 30, y: 40 },
        { x: 60, y: 80 },
        { x: 90, y: 110 },
        { x: 130, y: 130 },
      ];

      const shape = editorActions.createPencilShape(rawPoints, { smoothness: 60 });
      expect(shape).toBeDefined();
      expect(shape?.type).toBe('shape');
      expect(shape?.pencilSmoothness).toBe(60);
      expect(shape?.rawPoints?.length).toBe(5);

      // Check path contains cubic Bézier commands
      expect(shape?.paths[0].d.startsWith('M')).toBe(true);
      expect(shape?.paths[0].d).toContain('C');
    });

    it('draws a pencil curve on Stage with mouse events and commits smooth cubic Bézier shape', () => {
      editorActions.setActiveTool('pencil');

      const root = createRoot(container);
      act(() => {
        root.render(<Stage />);
      });

      const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
      expect(canvas).toBeTruthy();

      // Mouse down at (50, 50)
      act(() => {
        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }));
      });

      // Mouse moves
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 80, bubbles: true }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 120, bubbles: true }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 160, bubbles: true }));
      });

      // Mouse up to complete the pencil stroke
      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: 160, clientY: 160, bubbles: true }));
      });

      const tl = getActiveTimeline(getEditorState().doc);
      const pencilShape = tl.layers[0].keyframes[0].elements.find(
        (e) => e.id.startsWith('pencil_')
      ) as ShapeElement;

      expect(pencilShape).toBeTruthy();
      expect(pencilShape.rawPoints?.length).toBe(4);
      expect(pencilShape.paths[0].d.startsWith('M')).toBe(true);
      expect(pencilShape.paths[0].d).toContain('C');

      act(() => {
        root.unmount();
      });
    });
  });

  describe('Properties Panel Integration', () => {
    it('renders Pathfinder accordion section and active buttons when 2 shapes are selected', () => {
      const shape1: ShapeElement = {
        id: 'p_shape_1',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 L 0 50 Z', fill: { type: 'solid', color: '#ff0000' } }],
        alpha: 1,
      };
      const shape2: ShapeElement = {
        id: 'p_shape_2',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 25 25 L 75 25 L 75 75 L 25 75 Z', fill: { type: 'solid', color: '#00ff00' } }],
        alpha: 1,
      };

      editorActions.addElement(shape1);
      editorActions.addElement(shape2);
      editorActions.selectElements(['p_shape_1', 'p_shape_2']);

      const root = createRoot(container);
      act(() => {
        root.render(<Properties />);
      });

      // Pathfinder section rendered
      const pathfinderSection = container.querySelector('[data-testid="pathfinder-section"]');
      expect(pathfinderSection).toBeTruthy();

      // All 4 action buttons rendered and enabled
      const uniteBtn = container.querySelector('[data-testid="pathfinder-unite-btn"]') as HTMLButtonElement;
      const subtractBtn = container.querySelector('[data-testid="pathfinder-subtract-btn"]') as HTMLButtonElement;
      const intersectBtn = container.querySelector('[data-testid="pathfinder-intersect-btn"]') as HTMLButtonElement;
      const excludeBtn = container.querySelector('[data-testid="pathfinder-exclude-btn"]') as HTMLButtonElement;

      expect(uniteBtn).toBeTruthy();
      expect(subtractBtn).toBeTruthy();
      expect(intersectBtn).toBeTruthy();
      expect(excludeBtn).toBeTruthy();

      expect(uniteBtn.disabled).toBe(false);
      expect(subtractBtn.disabled).toBe(false);
      expect(intersectBtn.disabled).toBe(false);
      expect(excludeBtn.disabled).toBe(false);

      // Clicking Unite button triggers uniteSelectedShapes
      act(() => {
        uniteBtn.click();
      });

      const tl = getActiveTimeline(getEditorState().doc);
      expect(tl.layers[0].keyframes[0].elements).toHaveLength(1);

      act(() => {
        root.unmount();
      });
    });

    it('renders Outline Stroke button when selected shape has a stroke, and clicking it outlines stroke', () => {
      const strokedShape: ShapeElement = {
        id: 'shape_with_stroke',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [
          {
            d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
            fill: { type: 'solid', color: '#ffffff' },
            stroke: {
              fill: { type: 'solid', color: '#ff0000' },
              width: 6,
              cap: 'round',
              join: 'round',
            },
          },
        ],
        alpha: 1,
      };

      editorActions.addElement(strokedShape);
      editorActions.selectElements(['shape_with_stroke']);

      const root = createRoot(container);
      act(() => {
        root.render(<Properties />);
      });

      const outlineBtn = container.querySelector('[data-testid="outline-stroke-btn"]') as HTMLButtonElement;
      expect(outlineBtn).toBeTruthy();

      act(() => {
        outlineBtn.click();
      });

      const tl = getActiveTimeline(getEditorState().doc);
      const updated = tl.layers[0].keyframes[0].elements[0] as ShapeElement;
      expect(updated.paths[0].stroke).toBeUndefined();
      expect(updated.paths[0].fill).toEqual({ type: 'solid', color: '#ff0000' });

      act(() => {
        root.unmount();
      });
    });

    it('renders Convert to Outlines button when TextElement is selected, and clicking it converts text to outlines', async () => {
      const textEl: TextElement = {
        id: 'prop_text_el',
        type: 'text',
        visible: true,
        mode: 'static',
        text: 'OUTLINE ME',
        fontId: 'default',
        fontSize: 32,
        color: '#123456',
        fill: { type: 'solid', color: '#123456' },
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
      };

      editorActions.addElement(textEl);
      editorActions.selectElements(['prop_text_el']);

      const root = createRoot(container);
      act(() => {
        root.render(<Properties />);
      });

      const convertBtn = container.querySelector('[data-testid="convert-to-outlines-btn"]') as HTMLButtonElement;
      expect(convertBtn).toBeTruthy();

      await act(async () => {
        convertBtn.click();
      });

      const tl = getActiveTimeline(getEditorState().doc);
      const el = tl.layers[0].keyframes[0].elements[0];
      expect(el.type).toBe('shape');

      act(() => {
        root.unmount();
      });
    });
  });

  describe('Stage Context Menu Integration', () => {
    it('provides Pathfinder actions and Outline Stroke in shape context menu', () => {
      const shape1: ShapeElement = {
        id: 'ctx_shape_1',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 0 0 L 40 40' }],
        alpha: 1,
      };
      const shape2: ShapeElement = {
        id: 'ctx_shape_2',
        type: 'shape',
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        paths: [{ d: 'M 20 20 L 60 60' }],
        alpha: 1,
      };

      editorActions.addElement(shape1);
      editorActions.addElement(shape2);
      editorActions.selectElements(['ctx_shape_1', 'ctx_shape_2']);

      const root = createRoot(container);
      act(() => {
        root.render(<Stage />);
      });

      // Right click on shape element
      const elWrapper = container.querySelector('[data-el-id="ctx_shape_1"]') as HTMLElement;
      expect(elWrapper).toBeTruthy();

      const shapeSvg = elWrapper.querySelector('path');
      act(() => {
        (shapeSvg || elWrapper).dispatchEvent(
          new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true })
        );
      });

      const ctxState = getEditorState().contextMenu;
      expect(ctxState).not.toBeNull();
      const labels = ctxState?.items.map((it) => it.label);

      expect(labels).toContain('Outline Stroke');
      expect(labels?.some((l) => l?.includes('Pathfinder: Unite'))).toBe(true);
      expect(labels?.some((l) => l?.includes('Pathfinder: Minus Front'))).toBe(true);
      expect(labels?.some((l) => l?.includes('Pathfinder: Intersect'))).toBe(true);
      expect(labels?.some((l) => l?.includes('Pathfinder: Exclude'))).toBe(true);

      act(() => {
        root.unmount();
      });
    });

    it('provides Convert to Outlines in text element context menu', () => {
      const textEl: TextElement = {
        id: 'ctx_text_1',
        type: 'text',
        visible: true,
        mode: 'static',
        text: 'ContextMenu Text',
        fontId: 'default',
        fontSize: 24,
        color: '#000000',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
      };

      editorActions.addElement(textEl);
      editorActions.selectElements(['ctx_text_1']);

      const root = createRoot(container);
      act(() => {
        root.render(<Stage />);
      });

      const elWrapper = container.querySelector('[data-el-id="ctx_text_1"]') as HTMLElement;
      expect(elWrapper).toBeTruthy();

      act(() => {
        elWrapper.dispatchEvent(
          new MouseEvent('contextmenu', { clientX: 120, clientY: 120, bubbles: true })
        );
      });

      const ctxState = getEditorState().contextMenu;
      expect(ctxState).not.toBeNull();
      const labels = ctxState?.items.map((it) => it.label);
      expect(labels).toContain('Convert to Outlines');

      act(() => {
        root.unmount();
      });
    });
  });
});
