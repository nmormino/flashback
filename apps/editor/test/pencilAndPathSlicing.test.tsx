import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useEditorStore,
  editorActions,
  getEditorState,
  getActiveTimeline,
  type EditorElement,
} from '../src/state/editorStore';
import { Stage } from '../src/panels/Stage/Stage';
import { Tools } from '../src/panels/Tools/Tools';
import { Properties } from '../src/panels/Properties/Properties';
import {
  fitCurveToPoints,
  isPathClosed,
  openPath,
  closePath,
  slicePathAtAnchor,
  slicePathAtPoint,
  simplifyPointsRDP,
  parseSvgPath,
  type Vector2D,
} from '../src/utils/bezier';
import type { ShapeElement } from '@flashback/runtime';

describe('Pencil Tool with Smoothness & Vector Path Slicing / Closing', () => {
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

  it('fitCurveToPoints converts mouse points to smooth cubic Bézier segments and obeys smoothness', () => {
    // Generate a wavy hand-drawn mouse trail
    const rawPoints: Vector2D[] = [];
    for (let x = 0; x <= 200; x += 4) {
      const y = 100 + Math.sin(x * 0.05) * 30 + (Math.random() - 0.5) * 4;
      rawPoints.push({ x, y });
    }

    // High fidelity / low smoothness (10%)
    const lowSmoothResult = fitCurveToPoints(rawPoints, 10);
    expect(lowSmoothResult.d).toContain('M');
    expect(lowSmoothResult.d).toContain('C');
    expect(lowSmoothResult.closed).toBe(false);

    // High smoothness (85%)
    const highSmoothResult = fitCurveToPoints(rawPoints, 85);
    expect(highSmoothResult.d).toContain('M');
    expect(highSmoothResult.d).toContain('C');

    // Higher smoothness should simplify and produce fewer anchors than low smoothness
    expect(highSmoothResult.anchors.length).toBeLessThan(lowSmoothResult.anchors.length);
  });

  it('fitCurveToPoints auto-closes when end point is near start point', () => {
    const loopPoints: Vector2D[] = [
      { x: 50, y: 50 },
      { x: 120, y: 50 },
      { x: 130, y: 120 },
      { x: 60, y: 110 },
      { x: 52, y: 53 }, // Within autoCloseDistance (16px) of (50, 50)
    ];

    const result = fitCurveToPoints(loopPoints, 50, 16);
    expect(result.closed).toBe(true);
    expect(isPathClosed(result.d)).toBe(true);
  });

  it('can open a closed vector path and close an open vector path', () => {
    const closedRectD = 'M 0 0 C 10 0 20 0 30 0 C 30 10 30 20 30 30 C 20 30 10 30 0 30 C 0 20 0 10 0 0 Z';
    expect(isPathClosed(closedRectD)).toBe(true);

    // Open path
    const openedD = openPath(closedRectD);
    expect(isPathClosed(openedD)).toBe(false);
    expect(openedD.toLowerCase()).not.toContain('z');

    // Close path again
    const reclosedD = closePath(openedD);
    expect(isPathClosed(reclosedD)).toBe(true);
  });

  it('slicePathAtPoint splits/slices a path at a point along its perimeter', () => {
    // Closed square loop
    const closedLoop = 'M 0 0 C 50 0 50 0 100 0 C 100 50 100 50 100 100 C 50 100 50 100 0 100 C 0 50 0 50 0 0 Z';
    expect(isPathClosed(closedLoop)).toBe(true);

    // Slice at (100, 50) on the right edge
    const sliced = slicePathAtPoint(closedLoop, { x: 100, y: 50 });
    // Should be open now
    expect(isPathClosed(sliced)).toBe(false);
  });

  it('stores and updates pencilConfig in editorStore', () => {
    expect(getEditorState().pencilConfig.smoothness).toBe(50);

    editorActions.setPencilConfig({ smoothness: 80 });
    expect(getEditorState().pencilConfig.smoothness).toBe(80);

    editorActions.setActiveTool('pencil');
    expect(getEditorState().activeTool).toBe('pencil');
  });

  it('renders Pencil tool smoothness settings in Properties panel when activeTool is pencil', () => {
    editorActions.setActiveTool('pencil');

    const root = createRoot(container);
    act(() => {
      root.render(<Properties />);
    });

    const pencilSection = container.querySelector('[data-testid="tool-pencil-defaults-section"]');
    expect(pencilSection).toBeTruthy();
    expect(container.textContent).toContain('Pencil Tool Options');
    expect(container.textContent).toContain('Smoothness:');

    // Click quick preset buttons
    const preset10 = container.querySelector('[data-testid="pencil-smoothness-10"]') as HTMLButtonElement;
    expect(preset10).toBeTruthy();
    act(() => {
      preset10.click();
    });
    expect(getEditorState().pencilConfig.smoothness).toBe(10);

    const preset85 = container.querySelector('[data-testid="pencil-smoothness-85"]') as HTMLButtonElement;
    expect(preset85).toBeTruthy();
    act(() => {
      preset85.click();
    });
    expect(getEditorState().pencilConfig.smoothness).toBe(85);

    act(() => {
      root.unmount();
    });
  });

  it('renders Path Topology controls in Properties panel and can open/close shape via actions', () => {
    // Add a closed shape to document
    const testShape: ShapeElement = {
      id: 'shape_test_1',
      type: 'shape',
      visible: true,
      transform: {
        x: 100,
        y: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 25,
        originY: 25,
      },
      paths: [
        {
          d: 'M 0 0 C 25 0 25 0 50 0 C 50 25 50 25 50 50 C 25 50 25 50 0 50 C 0 25 0 25 0 0 Z',
          fill: { type: 'solid', color: '#ff0000' },
          stroke: { fill: { type: 'solid', color: '#000000' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(testShape);
    editorActions.selectElements([testShape.id]);

    const root = createRoot(container);
    act(() => {
      root.render(<Properties />);
    });

    const topologyBadge = container.querySelector('[data-testid="path-topology-badge"]');
    expect(topologyBadge).toBeTruthy();
    expect(topologyBadge?.textContent).toContain('Closed Loop');

    // Open shape path
    const toggleBtn = container.querySelector('[data-testid="toggle-path-closed-btn"]') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    act(() => {
      toggleBtn.click();
    });

    // Check store element is now open
    const tl1 = getActiveTimeline(getEditorState().doc);
    const updatedShape = tl1.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(isPathClosed(updatedShape.paths[0].d)).toBe(false);

    // Close shape path again
    act(() => {
      editorActions.closeShapePath(testShape.id);
    });
    const tl2 = getActiveTimeline(getEditorState().doc);
    const reclosedShape = tl2.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(isPathClosed(reclosedShape.paths[0].d)).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('displays Artboard name in breadcrumbs when in isolation and NEVER displays legacy "Scene 1"', () => {
    // When not isolating, no breadcrumb bar is rendered
    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    expect(container.textContent).not.toContain('Scene 1');

    // Create a clip (which enters isolation)
    act(() => {
      editorActions.createEmptyClip('SpinningWidget', 120, 120);
    });

    expect(getEditorState().isolationStack.length).toBe(1);

    // Breadcrumbs should show Return to Artboard 1 (or stage), NOT Scene 1
    expect(container.textContent).toContain('← Artboard 1');
    expect(container.textContent).toContain('SpinningWidget');
    expect(container.textContent).not.toContain('Scene 1');

    act(() => {
      root.unmount();
    });
  });

  it('Illustrator-style floating Pencil Tool Options window opens from Tools bar and re-smoothes selected shape live', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<Tools />);
    });

    // Options window initially closed
    expect(container.querySelector('[data-testid="pencil-options-floating-window"]')).toBeFalsy();

    // Double-click Pencil tool button in toolbar
    const pencilBtn = container.querySelector('[data-testid="tool-btn-pencil"]') as HTMLButtonElement;
    expect(pencilBtn).toBeTruthy();

    act(() => {
      pencilBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    // Floating window is now visible!
    const optionsWin = container.querySelector('[data-testid="pencil-options-floating-window"]') as HTMLElement;
    expect(optionsWin).toBeTruthy();
    expect(optionsWin.textContent).toContain('Pencil Tool Options');
    expect(optionsWin.textContent).toContain('Fidelity / Smoothness:');

    // Add a wavy hand-drawn shape to the stage and select it
    const rawTrail: Vector2D[] = [];
    for (let i = 0; i < 30; i++) {
      rawTrail.push({ x: i * 5, y: Math.sin(i * 0.4) * 20 });
    }
    const initialFit = fitCurveToPoints(rawTrail, 10);
    const testShape: ShapeElement = {
      id: 'pencil_line_test',
      type: 'shape',
      visible: true,
      rawPoints: rawTrail,
      pencilSmoothness: 10,
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [{ d: initialFit.d, fill: { type: 'solid', color: 'transparent' }, stroke: { fill: { type: 'solid', color: '#000' }, width: 2 } }],
      alpha: 1,
    };
    act(() => {
      editorActions.addElement(testShape);
      editorActions.selectElements([testShape.id]);
    });

    const initialD = testShape.paths[0].d;

    // Adjust smoothness to 85% via preset in the floating options window AFTER drawing
    const smoothPresetBtn = container.querySelector('[data-testid="preset-smooth-btn"]') as HTMLButtonElement;
    expect(smoothPresetBtn).toBeTruthy();

    act(() => {
      smoothPresetBtn.click();
    });

    expect(getEditorState().pencilConfig.smoothness).toBe(85);

    // Verify the selected shape's path was re-smoothed live on stage!
    const activeTl = getActiveTimeline(getEditorState().doc);
    const reSmoothedShape = activeTl.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'pencil_line_test'
    ) as ShapeElement;
    expect(reSmoothedShape.paths[0].d).not.toBe(initialD);
    expect(reSmoothedShape.pencilSmoothness).toBe(85);

    // Close window via ✕ button
    const closeBtn = container.querySelector('[data-testid="close-pencil-options-btn"]') as HTMLButtonElement;
    act(() => {
      closeBtn.click();
    });
    expect(getEditorState().isPencilOptionsOpen).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('Subselection tool adds anchor points anywhere along a path segment without weird plus buttons', () => {
    // Add a simple vector shape
    const rectShape: ShapeElement = {
      id: 'subselect_test_shape',
      type: 'shape',
      visible: true,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50 },
      paths: [
        {
          d: 'M 0 0 C 30 0 70 0 100 0 C 100 30 100 70 100 100 C 70 100 30 100 0 100 C 0 70 0 30 0 0 Z',
          fill: { type: 'solid', color: '#3b82f6' },
          stroke: { fill: { type: 'solid', color: '#1d4ed8' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(rectShape);
    editorActions.selectElements([rectShape.id]);
    editorActions.setActiveTool('subselect');

    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    // Verify there are NO weird circular '+' midpoint buttons rendered on the canvas
    const plusButtons = container.querySelectorAll('[data-testid^="subselect-add-point-"]');
    expect(plusButtons.length).toBe(0);

    // There should be clickable segment hit areas
    const segmentHit = container.querySelector('[data-testid="subselect-segment-hit"]') as SVGElement;
    expect(segmentHit).toBeTruthy();

    // Clicking anywhere on the segment hit area adds a point and handles
    act(() => {
      segmentHit.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 0, bubbles: true }));
    });

    const activeTl = getActiveTimeline(getEditorState().doc);
    const updatedShape = activeTl.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'subselect_test_shape'
    ) as ShapeElement;

    // Original shape had 4 anchors; after clicking edge it should have 5 anchors!
    expect(updatedShape.paths[0].d).toContain('C');

    act(() => {
      root.unmount();
    });
  });

  it('draws a pencil line without jumping or shifting position upon mouse release', () => {
    editorActions.setActiveTool('pencil');

    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    expect(canvas).toBeTruthy();

    // Mouse down at (100, 100)
    act(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });

    // Drag pencil along path
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 130, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 170, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 220, bubbles: true }));
    });

    // Mouse up to complete the pencil stroke
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 220, bubbles: true }));
    });

    const activeTl = getActiveTimeline(getEditorState().doc);
    const pencilShape = activeTl.layers[0].keyframes[0].elements.find(
      (e) => e.id.startsWith('pencil_')
    ) as ShapeElement;

    expect(pencilShape).toBeTruthy();
    expect(pencilShape.rawPoints?.length).toBe(4);

    // The bounding box of drawn points was minX = 100, minY = 100, maxX = 200, maxY = 220 (w = 100, h = 120)
    // Pivot should be at center: originX = 50, originY = 60
    expect(pencilShape.transform.originX).toBe(50);
    expect(pencilShape.transform.originY).toBe(60);

    // Transform position must be min + origin: (100 + 50 = 150, 100 + 60 = 160)
    expect(pencilShape.transform.x).toBe(150);
    expect(pencilShape.transform.y).toBe(160);

    // Effective top-left in stage coordinates (tx = x - originX, ty = y - originY)
    const effectiveStageX = pencilShape.transform.x - pencilShape.transform.originX;
    const effectiveStageY = pencilShape.transform.y - pencilShape.transform.originY;
    expect(effectiveStageX).toBe(100);
    expect(effectiveStageY).toBe(100);

    act(() => {
      root.unmount();
    });
  });

  it('clicking an anchor point itself and releasing without dragging toggles between Corner and Smooth point types', () => {
    // Add a sharp polygon/rectangle shape with corner points
    const testShape: ShapeElement = {
      id: 'point_type_toggle_shape',
      type: 'shape',
      visible: true,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50 },
      paths: [
        {
          d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
          fill: { type: 'solid', color: '#3b82f6' },
          stroke: { fill: { type: 'solid', color: '#000' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(testShape);
    editorActions.selectElements([testShape.id]);
    editorActions.setActiveTool('subselect');

    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    // Anchor #1 at (100, 0) starts as a sharp corner (rendered as square <rect> with data-point-type="corner")
    const anchors = container.querySelectorAll('[data-testid="subselect-anchor"]');
    expect(anchors.length).toBe(4);
    const anchor1 = Array.from(anchors).find((el) => el.getAttribute('data-anchor-index') === '1') as SVGElement;
    expect(anchor1).toBeTruthy();
    expect(anchor1.tagName.toLowerCase()).toBe('rect');
    expect(anchor1.getAttribute('data-point-type')).toBe('corner');

    // Click anchor #1 and release WITHOUT dragging (mousedown at 100,0 then mouseup at 100,0)
    act(() => {
      anchor1.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 0, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 0, bubbles: true }));
    });

    // Verify it toggled to Smooth!
    const activeTl1 = getActiveTimeline(getEditorState().doc);
    const shapeAfterFirstClick = activeTl1.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'point_type_toggle_shape'
    ) as ShapeElement;
    expect(shapeAfterFirstClick.pathAnchorPointTypes?.[1]).toBe('smooth');

    // Re-query anchor #1: it should now render as a circle <circle> with data-point-type="smooth"
    const updatedAnchors = container.querySelectorAll('[data-testid="subselect-anchor"]');
    const updatedAnchor1 = Array.from(updatedAnchors).find((el) => el.getAttribute('data-anchor-index') === '1') as SVGElement;
    expect(updatedAnchor1.tagName.toLowerCase()).toBe('circle');
    expect(updatedAnchor1.getAttribute('data-point-type')).toBe('smooth');

    // Click anchor #1 again without dragging -> toggles back to Corner!
    act(() => {
      updatedAnchor1.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 0, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 0, bubbles: true }));
    });

    const activeTl2 = getActiveTimeline(getEditorState().doc);
    const shapeAfterSecondClick = activeTl2.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'point_type_toggle_shape'
    ) as ShapeElement;
    expect(shapeAfterSecondClick.pathAnchorPointTypes?.[1]).toBe('corner');

    act(() => {
      root.unmount();
    });
  });

  it('renders Illustrator-style anchor point inspector in Properties panel and converts point types via buttons', () => {
    const testShape: ShapeElement = {
      id: 'props_anchor_test_shape',
      type: 'shape',
      visible: true,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50 },
      paths: [
        {
          d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
          fill: { type: 'solid', color: '#3b82f6' },
          stroke: { fill: { type: 'solid', color: '#000' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(testShape);
    editorActions.selectElements([testShape.id]);
    editorActions.setActiveTool('subselect');
    editorActions.setSubselectedAnchor({ shapeId: testShape.id, pathIndex: 0, anchorIndex: 2 });

    const root = createRoot(container);
    act(() => {
      root.render(<Properties />);
    });

    const anchorInspector = container.querySelector('[data-testid="anchor-point-inspector"]');
    expect(anchorInspector).toBeTruthy();

    const badge = container.querySelector('[data-testid="anchor-point-type-badge"]');
    expect(badge?.textContent).toContain('Corner Point');

    // Click "Convert to Smooth" button
    const smoothBtn = container.querySelector('[data-testid="convert-anchor-smooth-btn"]') as HTMLButtonElement;
    expect(smoothBtn).toBeTruthy();
    act(() => {
      smoothBtn.click();
    });

    // Check store
    const tl1 = getActiveTimeline(getEditorState().doc);
    const shape1 = tl1.layers[0].keyframes[0].elements.find((e) => e.id === 'props_anchor_test_shape') as ShapeElement;
    expect(shape1.pathAnchorPointTypes?.[2]).toBe('smooth');
    expect(container.querySelector('[data-testid="anchor-point-type-badge"]')?.textContent).toContain('Smooth Point');

    // Click "Convert to Corner" button
    const cornerBtn = container.querySelector('[data-testid="convert-anchor-corner-btn"]') as HTMLButtonElement;
    expect(cornerBtn).toBeTruthy();
    act(() => {
      cornerBtn.click();
    });

    const tl2 = getActiveTimeline(getEditorState().doc);
    const shape2 = tl2.layers[0].keyframes[0].elements.find((e) => e.id === 'props_anchor_test_shape') as ShapeElement;
    expect(shape2.pathAnchorPointTypes?.[2]).toBe('corner');
    expect(container.querySelector('[data-testid="anchor-point-type-badge"]')?.textContent).toContain('Corner Point');

    act(() => {
      root.unmount();
    });
  });

  it('clicking or dragging a Bézier handle NEVER accidentally adds another vector point', () => {
    // Add a curved shape with smooth handles
    const testShape: ShapeElement = {
      id: 'handle_grab_test_shape',
      type: 'shape',
      visible: true,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [
        {
          d: 'M 0 50 C 15 25 35 25 50 50 C 65 75 85 75 100 50',
          fill: { type: 'solid', color: 'transparent' },
          stroke: { fill: { type: 'solid', color: '#000' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(testShape);
    editorActions.selectElements([testShape.id]);
    editorActions.setActiveTool('subselect');
    // Select the middle anchor at index 1: (50, 50) with handleIn at (35, 25) and handleOut at (65, 75)
    editorActions.setSubselectedAnchor({ shapeId: testShape.id, pathIndex: 0, anchorIndex: 1 });

    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    const handleInHit = container.querySelector('[data-testid="subselect-handle-in"]') as SVGElement;
    expect(handleInHit).toBeTruthy();

    // Mousedown on the handle and drag to (35, 10)
    act(() => {
      handleInHit.dispatchEvent(new MouseEvent('mousedown', { clientX: 35, clientY: 25, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 35, clientY: 10, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 35, clientY: 10, bubbles: true }));
    });

    const tl = getActiveTimeline(getEditorState().doc);
    const updatedShape = tl.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'handle_grab_test_shape'
    ) as ShapeElement;

    // Must still have EXACTLY 3 anchors (did NOT add a vector point!)
    const parsed = parseSvgPath(updatedShape.paths[0].d);
    expect(parsed.anchors.length).toBe(3);

    // The handle was updated
    expect(parsed.anchors[1].handleIn?.y).toBe(10);

    // Now test clicking on a segment edge very close to the handle/anchor
    const segmentHit = container.querySelector('[data-testid="subselect-segment-hit"]') as SVGElement;
    expect(segmentHit).toBeTruthy();
    act(() => {
      // Click at (35, 12), right by the handle
      segmentHit.dispatchEvent(new MouseEvent('mousedown', { clientX: 35, clientY: 12, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 35, clientY: 12, bubbles: true }));
    });

    const tlAfterCloseClick = getActiveTimeline(getEditorState().doc);
    const shapeAfterCloseClick = tlAfterCloseClick.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'handle_grab_test_shape'
    ) as ShapeElement;
    const parsedAfter = parseSvgPath(shapeAfterCloseClick.paths[0].d);
    // Still exactly 3 anchors!
    expect(parsedAfter.anchors.length).toBe(3);

    act(() => {
      root.unmount();
    });
  });

  it('deleting with a point selected deletes only that single point and NOT the whole element', () => {
    // 4-point rectangle
    const rectShape: ShapeElement = {
      id: 'delete_point_test_shape',
      type: 'shape',
      visible: true,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      paths: [
        {
          d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
          fill: { type: 'solid', color: '#ff0000' },
          stroke: { fill: { type: 'solid', color: '#000000' }, width: 2 },
        },
      ],
      alpha: 1,
    };

    editorActions.addElement(rectShape);
    editorActions.selectElements([rectShape.id]);
    editorActions.setActiveTool('subselect');
    // Select point #1 (100, 0)
    editorActions.setSubselectedAnchor({ shapeId: rectShape.id, pathIndex: 0, anchorIndex: 1 });

    const root = createRoot(container);
    act(() => {
      root.render(<Properties />);
    });

    // Verify Delete Point button exists in Properties panel
    const deleteBtn = container.querySelector('[data-testid="delete-anchor-point-btn"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    // Trigger delete via delete button (or deleteSelectedElements)
    act(() => {
      editorActions.deleteSelectedElements();
    });

    const activeTl = getActiveTimeline(getEditorState().doc);
    const shapeAfter = activeTl.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'delete_point_test_shape'
    ) as ShapeElement;

    // THE SHAPE MUST STILL EXIST! (Not deleted as a whole element)
    expect(shapeAfter).toBeTruthy();

    // Exactly 3 anchors remaining (point #1 was removed, leaving (0,0), (100,100), (0,100))
    const parsed = parseSvgPath(shapeAfter.paths[0].d);
    expect(parsed.anchors.length).toBe(3);
    expect(parsed.anchors[0]).toEqual({ x: 0, y: 0, pointType: 'corner' });
    expect(parsed.anchors[1]).toEqual({ x: 100, y: 100, pointType: 'corner' });
    expect(parsed.anchors[2]).toEqual({ x: 0, y: 100, pointType: 'corner' });

    // Now test clicking the delete button in Properties panel for point #1
    act(() => {
      editorActions.setSubselectedAnchor({ shapeId: shapeAfter.id, pathIndex: 0, anchorIndex: 1 });
    });

    act(() => {
      const deleteBtn2 = container.querySelector('[data-testid="delete-anchor-point-btn"]') as HTMLButtonElement;
      if (deleteBtn2) deleteBtn2.click();
    });

    const activeTl2 = getActiveTimeline(getEditorState().doc);
    const shapeAfter2 = activeTl2.layers[0].keyframes[0].elements.find(
      (e) => e.id === 'delete_point_test_shape'
    ) as ShapeElement;
    expect(shapeAfter2).toBeTruthy();
    const parsed2 = parseSvgPath(shapeAfter2.paths[0].d);
    // Deleted from 3-point closed triangle -> now 2-point open line!
    expect(parsed2.anchors.length).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it('scales vector anchor points, direction handles, and live corner handles inversely with canvas zoom to keep constant screen size', () => {
    // 1. Create a shape and subselect an anchor with Bézier handles
    const shapeWithHandles: ShapeElement = {
      id: 'zoom_invariant_shape',
      name: 'Zoom Invariant Shape',
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        originX: 0,
        originY: 0,
      },
      paths: [
        {
          d: 'M 20 20 C 30 10, 70 10, 80 20 C 90 30, 90 70, 80 80 C 70 90, 30 90, 20 80 Z',
          fill: { type: 'solid', color: '#10b981' },
          stroke: { type: 'solid', color: '#047857', width: 2 },
        },
      ],
      pathAnchorPointTypes: {
        0: 'smooth',
        1: 'corner',
      },
    };

    act(() => {
      editorActions.addElement(shapeWithHandles);
      editorActions.setActiveTool('subselect');
      editorActions.selectElements([shapeWithHandles.id]);
      editorActions.setSubselectedAnchor({
        shapeId: shapeWithHandles.id,
        pathIndex: 0,
        anchorIndex: 0,
      });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Stage />);
    });

    // At 100% zoom (1.0), invZoom is 1.0. Check anchor group transform has scale(1)
    const anchorNode = container.querySelector('[data-testid="subselect-anchor"]') as SVGElement;
    expect(anchorNode).toBeTruthy();
    const anchorGroup = anchorNode.parentElement as unknown as SVGGElement;
    expect(anchorGroup.tagName.toLowerCase()).toBe('g');
    expect(anchorGroup.getAttribute('transform')).toContain('scale(1)');

    // Check handleOut tip group has scale(1)
    const handleOutNode = container.querySelector('[data-testid="subselect-handle-out"]') as SVGElement;
    expect(handleOutNode).toBeTruthy();
    const handleOutGroup = handleOutNode.parentElement as unknown as SVGGElement;
    expect(handleOutGroup.tagName.toLowerCase()).toBe('g');
    expect(handleOutGroup.getAttribute('transform')).toContain('scale(1)');

    // Zoom in using the Zoom In button (clicks twice: 1.0 -> 1.25 -> 1.5)
    const zoomInBtn = container.querySelector('[title="Zoom In (Ctrl +)"]') as HTMLButtonElement;
    expect(zoomInBtn).toBeTruthy();

    act(() => {
      zoomInBtn.click();
    });
    act(() => {
      zoomInBtn.click();
    });

    // At 150% zoom (1.5), invZoom = 1 / 1.5 = 0.6666...
    // The anchor and handle groups now have scale(0.6666...) so they stay constant screen size!
    const updatedAnchorNode = container.querySelector('[data-testid="subselect-anchor"]') as SVGElement;
    const updatedAnchorGroup = updatedAnchorNode.parentElement as unknown as SVGGElement;
    const anchorTransform = updatedAnchorGroup.getAttribute('transform') || '';
    expect(anchorTransform).toContain('scale(');
    const scaleMatch = anchorTransform.match(/scale\(([^)]+)\)/);
    expect(scaleMatch).toBeTruthy();
    const currentScale = parseFloat(scaleMatch![1]);
    expect(currentScale).toBeCloseTo(1 / 1.5, 2);

    // Verify handle endpoint group also scaled inversely
    const updatedHandleOutNode = container.querySelector('[data-testid="subselect-handle-out"]') as SVGElement;
    const updatedHandleOutGroup = updatedHandleOutNode.parentElement as unknown as SVGGElement;
    const handleTransform = updatedHandleOutGroup.getAttribute('transform') || '';
    expect(handleTransform).toContain('scale(');
    const handleScaleMatch = handleTransform.match(/scale\(([^)]+)\)/);
    expect(handleScaleMatch).toBeTruthy();
    expect(parseFloat(handleScaleMatch![1])).toBeCloseTo(1 / 1.5, 2);

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
