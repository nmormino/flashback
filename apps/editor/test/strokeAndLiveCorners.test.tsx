import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { editorActions, getEditorState, getActiveTimeline } from '../src/state/editorStore';
import { Stage } from '../src/panels/Stage/Stage';
import { Properties } from '../src/panels/Properties/Properties';
import { Tools } from '../src/panels/Tools/Tools';
import {
  generateRoundedRectPath,
  generateOvalPath,
  generatePolygonStarPath,
  getSharpCornerVertices,
} from '../src/utils/shapeGenerators';
import type { ShapeElement } from '@flashback/runtime';

describe('Border Color Picker & Illustrator-Style Live Corner Shapes', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    editorActions.newDocument();
    editorActions.setActiveTool('select');
    editorActions.setActiveFill({ type: 'solid', color: '#3b82f6' });
    editorActions.setActiveStroke({ type: 'solid', color: '#0f172a' });
    editorActions.setStrokeWidth(2);
    editorActions.setRectConfig({
      width: 100,
      height: 100,
      cornerRadius: 0,
      cornerType: 'round',
    });
    editorActions.setOvalConfig({
      rx: 50,
      ry: 50,
      innerRadiusRatio: 0,
      startAngle: 0,
      endAngle: 360,
    });
    editorActions.setStarConfig({ points: 5, pointRatio: 0.5, cornerRadius: 0 });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('supports setting Border / Stroke color to Transparent (none), Solid, and Linear Gradient in Tools and Properties', async () => {
    await act(async () => {
      root.render(
        <div>
          <Tools />
          <Stage />
          <Properties />
        </div>
      );
    });

    // 1. Open Tools stroke picker and select "Transparent"
    const toolsStrokeSwatch = container.querySelector(
      '[data-testid="tools-stroke-swatch"]'
    ) as HTMLElement;
    expect(toolsStrokeSwatch).not.toBeNull();

    await act(async () => {
      toolsStrokeSwatch.click();
    });

    const transparentPreselectBtn = document.querySelector(
      '[data-testid="transparent-preselect-btn"]'
    ) as HTMLElement;
    expect(transparentPreselectBtn).not.toBeNull();

    await act(async () => {
      transparentPreselectBtn.click();
    });

    expect(getEditorState().activeStroke).toEqual({ type: 'none' });

    // Close Tools stroke popover
    await act(async () => {
      toolsStrokeSwatch.click();
    });

    // 2. Draw a rectangle while activeStroke is 'none'
    await act(async () => {
      editorActions.setActiveTool('rect');
    });

    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 150, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 150, bubbles: true }));
    });

    const layer = getEditorState().doc.root.layers[0];
    const rectEl = layer.keyframes[0].elements[0] as ShapeElement;
    expect(rectEl).toBeDefined();
    expect(rectEl.paths[0].stroke?.fill).toEqual({ type: 'none' });

    // 3. Select the rectangle and change its Border color to Linear Gradient via Properties panel
    await act(async () => {
      editorActions.selectElement(rectEl.id);
    });

    const shapeStrokeBtn = container.querySelector(
      '[data-testid="shape-stroke-picker-btn"]'
    ) as HTMLElement;
    expect(shapeStrokeBtn).not.toBeNull();

    await act(async () => {
      shapeStrokeBtn.click();
    });

    const linearBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Linear'
    ) as HTMLElement;
    expect(linearBtn).toBeDefined();

    await act(async () => {
      linearBtn.click();
    });

    const updatedRect = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(updatedRect.paths[0].stroke?.fill.type).toBe('linearGradient');

    // 4. Switch Border back to Transparent via Properties panel
    const noneTab = document.querySelector('[data-testid="tab-none"]') as HTMLElement;
    expect(noneTab).not.toBeNull();
    await act(async () => {
      noneTab.click();
    });

    const transparentRect = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(transparentRect.paths[0].stroke?.fill).toEqual({ type: 'none' });
  });

  it('generates rounded, inverted, and chamfered rectangle paths with uniform or per-corner radii', () => {
    const sharp = generateRoundedRectPath(100, 80, 0, 'round');
    expect(sharp).toContain('M 0 0 L 100 0 L 100 80 L 0 80 Z');

    const rounded = generateRoundedRectPath(100, 80, 16, 'round');
    expect(rounded).toContain('M 16 0');
    expect(rounded).toContain('C ');

    const chamfer = generateRoundedRectPath(100, 80, 12, 'chamfer');
    expect(chamfer).toContain('M 12 0');
    expect(chamfer).toContain('L 100 12');
    expect(chamfer).not.toContain('C ');

    const perCorner = generateRoundedRectPath(
      100,
      80,
      { tl: 20, tr: 0, br: 10, bl: 0 },
      'round'
    );
    expect(perCorner).toContain('M 20 0');
    expect(perCorner).toContain('L 100 0');
  });

  it('updates rectangle corner radius from the Properties panel and via on-canvas Live Corner Bullseye handles', async () => {
    await act(async () => {
      root.render(
        <div>
          <Stage />
          <Properties />
        </div>
      );
    });

    // Draw a 160x120 rectangle
    await act(async () => {
      editorActions.setActiveTool('rect');
    });
    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 40, clientY: 40, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 160, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 160, bubbles: true }));
    });

    const layer = getEditorState().doc.root.layers[0];
    const rectEl = layer.keyframes[0].elements[0] as ShapeElement;
    expect(rectEl.rectConfig).toBeDefined();
    expect(rectEl.rectConfig?.cornerRadius).toBe(0);

    // Select the rectangle and verify the Properties section & 4 Live Corner handles render
    await act(async () => {
      editorActions.selectElement(rectEl.id);
    });
    expect(container.querySelector('[data-testid="rectangle-corners-section"]')).not.toBeNull();

    const tlHandle = container.querySelector(
      '[data-testid="live-corner-handle-tl"]'
    ) as HTMLElement;
    expect(tlHandle).not.toBeNull();
    expect(container.querySelector('[data-testid="live-corner-handle-tr"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="live-corner-handle-br"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="live-corner-handle-bl"]')).not.toBeNull();

    // Drag the top-left Live Corner handle inward by (+20, +20)
    await act(async () => {
      tlHandle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 54, clientY: 54, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 74, clientY: 74, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 74, clientY: 74, bubbles: true })
      );
    });

    const afterDragRect = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(typeof afterDragRect.rectConfig?.cornerRadius).toBe('number');
    expect(afterDragRect.rectConfig?.cornerRadius as number).toBeGreaterThan(15);
    expect(afterDragRect.paths[0].d).toContain('C ');

    // Shift+Drag the bottom-right handle to adjust only the BR corner independently
    const brHandle = container.querySelector(
      '[data-testid="live-corner-handle-br"]'
    ) as HTMLElement;
    await act(async () => {
      brHandle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 180, clientY: 140, shiftKey: true, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 150, clientY: 110, shiftKey: true, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 150, clientY: 110, shiftKey: true, bubbles: true })
      );
    });

    const afterShiftRect = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(typeof afterShiftRect.rectConfig?.cornerRadius).toBe('object');

    // Alt/Option-click a Live Corner handle to cycle cornerType ('round' -> 'inverted' -> 'chamfer')
    await act(async () => {
      tlHandle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 60, clientY: 60, altKey: true, bubbles: true })
      );
    });
    const afterAltClick = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(afterAltClick.rectConfig?.cornerType).toBe('inverted');
  });

  it('preserves circular corners without distortion when resizing a rounded rectangle on Stage', async () => {
    await act(async () => {
      root.render(<Stage />);
    });

    // Draw a rectangle with 20px corner radius
    await act(async () => {
      editorActions.setRectConfig({ cornerRadius: 20, cornerType: 'round' });
      editorActions.setActiveTool('rect');
    });
    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 150, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 150, bubbles: true }));
    });

    let rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(rectEl.rectConfig?.cornerRadius).toBe(20);
    expect(rectEl.paths[0].d).toContain('M 20 0');

    // Resize width from 100 to 250 via middle-right resize handle
    await act(async () => {
      editorActions.selectElement(rectEl.id);
    });
    const mrHandle = container.querySelector('[data-testid="resize-handle-mr"]') as HTMLElement;
    await act(async () => {
      mrHandle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 150, clientY: 100, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 300, clientY: 100, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 300, clientY: 100, bubbles: true })
      );
    });

    rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(rectEl.rectConfig?.width).toBeGreaterThan(200);
    expect(rectEl.rectConfig?.cornerRadius).toBe(20);
    // Top-left corner still starts at M 20 0 (not stretched horizontally)
    expect(rectEl.paths[0].d).toContain('M 20 0');
  });

  it('supports Illustrator-style Oval Donut/Pie and Polygon/Star vertex corner filleting', () => {
    const donutD = generateOvalPath(60, 60, {
      rx: 60,
      ry: 60,
      innerRadiusRatio: 0.5,
      startAngle: 0,
      endAngle: 360,
    });
    expect(donutD.match(/Z/g)?.length).toBe(2);

    const pieD = generateOvalPath(60, 60, {
      rx: 60,
      ry: 60,
      innerRadiusRatio: 0,
      startAngle: 0,
      endAngle: 270,
    });
    expect(pieD).toContain('L 60 60 Z');

    const roundedStarD = generatePolygonStarPath(50, 50, 50, 5, 0.5, -Math.PI / 2, 6);
    expect(roundedStarD).toContain('C ');
  });

  it('supports per-corner border styles (e.g. opposite corners Round and Inverted) in Properties and on Stage', async () => {
    await act(async () => {
      root.render(
        <div>
          <Stage />
          <Properties />
        </div>
      );
    });

    // Draw a 160x120 rectangle with 20px radius
    await act(async () => {
      editorActions.setRectConfig({ cornerRadius: 20, cornerType: 'round' });
      editorActions.setActiveTool('rect');
    });
    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 40, clientY: 40, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 160, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 160, bubbles: true }));
    });

    let rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    await act(async () => {
      editorActions.selectElement(rectEl.id);
    });

    // 1. Click the "Opposite ╭/╯" preset in the Properties panel
    const oppositePresetBtn = container.querySelector(
      '[data-testid="rect-preset-opposite-round-inverted"]'
    ) as HTMLElement;
    expect(oppositePresetBtn).not.toBeNull();
    await act(async () => {
      oppositePresetBtn.click();
    });

    rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(rectEl.rectConfig?.cornerType).toEqual({
      tl: 'round',
      br: 'round',
      tr: 'inverted',
      bl: 'inverted',
    });

    // 2. Verify independent 4-corner grid is visible and set BL corner to 'chamfer'
    const blChamferBtn = container.querySelector(
      '[data-testid="rect-corner-type-bl-chamfer"]'
    ) as HTMLElement;
    expect(blChamferBtn).not.toBeNull();
    await act(async () => {
      blChamferBtn.click();
    });

    rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(rectEl.rectConfig?.cornerType).toEqual({
      tl: 'round',
      br: 'round',
      tr: 'inverted',
      bl: 'chamfer',
    });

    // 3. Shift+Alt+Click the TL handle on Stage to cycle only the TL corner from 'round' -> 'inverted'
    const tlHandle = container.querySelector(
      '[data-testid="live-corner-handle-tl"]'
    ) as HTMLElement;
    await act(async () => {
      tlHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 60,
          clientY: 60,
          altKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
    });

    rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect((rectEl.rectConfig?.cornerType as any).tl).toBe('inverted');
  });

  it('allows adding new anchor points along an existing rectangle path and adjusting the new point', async () => {
    await act(async () => {
      root.render(
        <div>
          <Stage />
          <Properties />
        </div>
      );
    });

    // Draw a 100x80 rectangle
    await act(async () => {
      editorActions.setRectConfig({ cornerRadius: 0, cornerType: 'round' });
      editorActions.setActiveTool('rect');
    });
    const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 130, bubbles: true }));
    });

    let rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(rectEl.paths[0].d).toBe('M 0 0 L 100 0 L 100 80 L 0 80 Z');

    // Switch to Subselect tool ('A') and select the rectangle
    await act(async () => {
      editorActions.selectElement(rectEl.id);
      editorActions.setActiveTool('subselect');
    });

    // Verify 4 anchors and segment hit paths render
    expect(container.querySelectorAll('[data-testid="subselect-anchor"]').length).toBe(4);
    const segHit0 = container.querySelector(
      '[data-testid="subselect-segment-hit"]'
    ) as HTMLElement;
    expect(segHit0).not.toBeNull();

    // Click and drag the top segment edge upward by 25px to create a roof peak
    await act(async () => {
      segHit0.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 100, clientY: 25, bubbles: true })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 100, clientY: 25, bubbles: true })
      );
    });

    rectEl = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    // Now has 5 anchors with the new top midpoint pulled up to (50, -25)
    expect(container.querySelectorAll('[data-testid="subselect-anchor"]').length).toBe(5);
    expect(rectEl.basePathD).toContain('L 50.00 -25.00');
    expect(rectEl.paths[0].d).toContain('L 50.00 -25.00');
  });

  it('adjusts corner radius and corner style on any arbitrary vector shape (Pen paths & customized rectangles)', async () => {
    await act(async () => {
      root.render(
        <div>
          <Stage />
          <Properties />
        </div>
      );
    });

    // Create an arbitrary triangle vector shape (as drawn by Pen tool)
    const penTriangle: ShapeElement = {
      id: 'shape_pen_triangle',
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
      paths: [
        {
          d: 'M 60 0 L 120 100 L 0 100 Z',
          fill: { type: 'solid', color: '#10b981' },
          stroke: {
            fill: { type: 'solid', color: '#0f172a' },
            width: 2,
            cap: 'round',
            join: 'round',
          },
        },
      ],
      alpha: 1,
      visible: true,
    };

    await act(async () => {
      editorActions.addElement(penTriangle);
      editorActions.selectElement(penTriangle.id);
    });

    // 1. Verify Vector Path & Live Corners section renders in Properties panel
    const vecCornerSection = container.querySelector(
      '[data-testid="vector-corner-radius-section"]'
    );
    expect(vecCornerSection).not.toBeNull();

    // 2. Verify 3 on-canvas Live Corner Bullseye handles render for the 3 sharp vertices of the triangle
    const vHandle0 = container.querySelector(
      '[data-testid="vertex-corner-handle-0"]'
    ) as HTMLElement;
    expect(vHandle0).not.toBeNull();
    expect(container.querySelector('[data-testid="vertex-corner-handle-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="vertex-corner-handle-2"]')).not.toBeNull();

    // 3. Apply a 14px corner radius to the Pen triangle via editorActions.updateShapeCornerRadius
    await act(async () => {
      editorActions.updateShapeCornerRadius(penTriangle.id, {
        cornerRadius: 14,
        cornerType: 'round',
      });
    });

    let updatedTri = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(updatedTri.pathCornerRadius).toBe(14);
    expect(updatedTri.basePathD).toBe('M 60 0 L 120 100 L 0 100 Z');
    expect(updatedTri.paths[0].d).toContain('C ');

    // 4. Switch the Pen triangle's corner style to Inverted via Properties button
    const invertedBtn = container.querySelector(
      '[data-testid="vector-corner-type-inverted"]'
    ) as HTMLElement;
    expect(invertedBtn).not.toBeNull();
    await act(async () => {
      invertedBtn.click();
    });

    updatedTri = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(updatedTri.pathCornerType).toBe('inverted');
    expect(updatedTri.paths[0].d).toContain('C ');

    // 5. Add a new anchor point to the rounded Pen triangle by clicking on the path segment with Subselect tool
    await act(async () => {
      editorActions.setActiveTool('subselect');
    });
    const segHitTri = container.querySelector(
      '[data-testid="subselect-segment-hit"]'
    ) as HTMLElement;
    expect(segHitTri).not.toBeNull();
    await act(async () => {
      segHitTri.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 90, clientY: 50, bubbles: true })
      );
    });

    updatedTri = getEditorState().doc.root.layers[0].keyframes[0]
      .elements[0] as ShapeElement;
    expect(updatedTri.basePathD).toContain('L 90.00 50.00');
    expect(getEditorState().activeTool).toBe('subselect');
  });

  it('preserves point count when adjusting star points after changing corner radius and re-adjusting corner radius', async () => {
    await act(async () => {
      root.render(
        <div>
          <Tools />
          <Stage />
          <Properties />
        </div>
      );
    });

    // 1. Create and select a 5-point star
    const initialStarD = generatePolygonStarPath(100, 100, 60, 5, 0.5, -Math.PI / 2, 0);
    const starElement: ShapeElement = {
      id: 'poly_star_point_revert_test',
      type: 'shape',
      transform: {
        x: 50,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 60,
        originY: 60,
      },
      paths: [
        {
          d: initialStarD,
          fill: { type: 'solid', color: '#f59e0b' },
          stroke: {
            fill: { type: 'solid', color: '#0f172a' },
            width: 2,
            cap: 'round',
            join: 'round',
          },
        },
      ],
      starConfig: {
        points: 5,
        pointRatio: 0.5,
        outerRadius: 60,
        startAngle: -Math.PI / 2,
        cornerRadius: 0,
        cx: 100,
        cy: 100,
      },
      basePathD: initialStarD,
      pathCornerRadius: 0,
      alpha: 1,
      visible: true,
    };

    await act(async () => {
      editorActions.addElement(starElement);
      editorActions.selectElement(starElement.id);
    });

    let star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(5);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(10); // 5 points * 2 vertices = 10 vertices

    // 2. Change star corner/border radius to 12px via updateShapeCornerRadius
    await act(async () => {
      editorActions.updateShapeCornerRadius(starElement.id, {
        cornerRadius: 12,
      });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.cornerRadius).toBe(12);
    expect(star.pathCornerRadius).toBe(12);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(10);

    // 3. Adjust the number of points in the star from 5 to 8
    await act(async () => {
      editorActions.updateStarShape(starElement.id, { points: 8 });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(8);
    expect(star.starConfig?.cornerRadius).toBe(12);
    expect(star.pathCornerRadius).toBe(12);
    // An 8-point star has 16 vertices (8 outer + 8 inner)
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(16);

    // 4. Go back to adjusting the border/corner radius to 18px via updateShapeCornerRadius
    await act(async () => {
      editorActions.updateShapeCornerRadius(starElement.id, {
        cornerRadius: 18,
      });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(8);
    expect(star.starConfig?.cornerRadius).toBe(18);
    expect(star.pathCornerRadius).toBe(18);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(16);

    // 5. Verify 16 vertex corner handles render on Stage for the 8-point star
    for (let i = 0; i < 16; i++) {
      const handle = container.querySelector(`[data-testid="vertex-corner-handle-${i}"]`);
      expect(handle).not.toBeNull();
    }
    // Should NOT have vertex #16 (only 0..15)
    expect(container.querySelector('[data-testid="vertex-corner-handle-16"]')).toBeNull();

    // 6. Test adjusting corner radius via updateStarShape to 22px
    await act(async () => {
      editorActions.updateStarShape(starElement.id, { cornerRadius: 22 });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(8);
    expect(star.starConfig?.cornerRadius).toBe(22);
    expect(star.pathCornerRadius).toBe(22);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(16);

    // 7. Test on-canvas dragging of a vertex corner handle
    const vHandle0 = container.querySelector(
      '[data-testid="vertex-corner-handle-0"]'
    ) as HTMLElement;
    expect(vHandle0).not.toBeNull();

    await act(async () => {
      vHandle0.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 100, clientY: 40, bubbles: true })
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 100, clientY: 70, bubbles: true })
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 100, clientY: 70, bubbles: true })
      );
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    // Points must STILL be 8, never reverting to 5!
    expect(star.starConfig?.points).toBe(8);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(16);

    // 8. Test switching corner style to Inverted via updateShapeCornerRadius
    await act(async () => {
      editorActions.updateShapeCornerRadius(starElement.id, {
        cornerType: 'inverted',
        cornerRadius: 15,
      });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(8);
    expect(star.pathCornerType).toBe('inverted');
    expect(star.starConfig?.cornerRadius).toBe(15);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(16);

    // 9. Now change points to 12 with inverted corners
    await act(async () => {
      editorActions.updateStarShape(starElement.id, { points: 12 });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(12);
    expect(star.pathCornerType).toBe('inverted');
    expect(star.starConfig?.cornerRadius).toBe(15);
    // 12 points * 2 vertices = 24 vertices
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(24);

    // 10. Adjust corner radius again on the 12-point star
    await act(async () => {
      editorActions.updateShapeCornerRadius(starElement.id, { cornerRadius: 20 });
    });

    star = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
    expect(star.starConfig?.points).toBe(12);
    expect(star.starConfig?.cornerRadius).toBe(20);
    expect(getSharpCornerVertices(star.basePathD || '').length).toBe(24);
  });
});
