import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
} from '../src/state/editorStore';
import { Stage } from '../src/panels/Stage/Stage';
import { Tools } from '../src/panels/Tools/Tools';
import { Properties } from '../src/panels/Properties/Properties';
import { STAR_PRESETS, generatePolygonStarPath } from '../src/utils/shapeGenerators';
import type { ShapeElement } from '@flashback/runtime';

describe('Star Shape Vector & Stage Tooling', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    editorActions.newDocument();
    editorActions.setStarConfig({ points: 5, pointRatio: 0.5 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('1. Store State & Configuration Actions', () => {
    it('initializes with default star configuration (5 points, 0.5 ratio)', () => {
      const state = getEditorState();
      expect(state.starConfig).toBeDefined();
      expect(state.starConfig.points).toBe(5);
      expect(state.starConfig.pointRatio).toBe(0.5);
    });

    it('setStarConfig updates store configuration and clamps bounds correctly', () => {
      editorActions.setStarConfig({ points: 8, pointRatio: 0.35 });
      let state = getEditorState();
      expect(state.starConfig.points).toBe(8);
      expect(state.starConfig.pointRatio).toBe(0.35);

      // Clamps min points to 3, max to 64
      editorActions.setStarConfig({ points: 1 });
      expect(getEditorState().starConfig.points).toBe(3);

      editorActions.setStarConfig({ points: 100 });
      expect(getEditorState().starConfig.points).toBe(64);

      // Clamps ratio min to 0.05, max to 3.0
      editorActions.setStarConfig({ pointRatio: 0.01 });
      expect(getEditorState().starConfig.pointRatio).toBe(0.05);

      editorActions.setStarConfig({ pointRatio: 5.0 });
      expect(getEditorState().starConfig.pointRatio).toBe(3.0);
    });
  });

  describe('2. Live Drawing Preview on Stage', () => {
    it('displays real-time SVG preview and verifies HUD badge is NOT rendered while dragging on Stage', async () => {
      editorActions.setActiveTool('polygon');
      editorActions.setStarConfig({ points: 5, pointRatio: 0.5 });

      await act(async () => {
        root.render(<Stage />);
      });

      const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;
      expect(canvas).not.toBeNull();

      // Mouse down to begin drawing
      await act(async () => {
        const mouseDownEv = new MouseEvent('mousedown', {
          clientX: 200,
          clientY: 200,
          bubbles: true,
        });
        canvas.dispatchEvent(mouseDownEv);
      });

      // Mouse move to drag out the star
      await act(async () => {
        const mouseMoveEv = new MouseEvent('mousemove', {
          clientX: 260,
          clientY: 200,
          bubbles: true,
        });
        window.dispatchEvent(mouseMoveEv);
      });

      // Verify live preview SVG is rendered
      const previewSvg = document.querySelector('[data-testid="star-draw-preview-svg"]');
      expect(previewSvg).not.toBeNull();

      const previewPath = previewSvg?.querySelector('path');
      expect(previewPath).not.toBeNull();
      const pathD = previewPath?.getAttribute('d') || '';
      expect(pathD).toContain('M ');
      expect(pathD).toContain('Z');
      // 5-point star extruded/intruded has 10 vertices (10 L/M commands)
      const commandCount = (pathD.match(/[ML]/g) || []).length;
      expect(commandCount).toBe(10);

      // Verify HUD badge is NOT rendered during drawing to keep the canvas clean and un-augmented
      const hudBadge = document.querySelector('[data-testid="star-hud-badge"]');
      expect(hudBadge).toBeNull();

      // Mouse up to finish drawing
      await act(async () => {
        const mouseUpEv = new MouseEvent('mouseup', {
          clientX: 260,
          clientY: 200,
          bubbles: true,
        });
        window.dispatchEvent(mouseUpEv);
      });

      // Preview is dismissed and element is committed to the stage
      expect(document.querySelector('[data-testid="star-draw-preview-svg"]')).toBeNull();

      const elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      expect(elements.length).toBeGreaterThan(0);
      const addedStar = elements[elements.length - 1] as ShapeElement;
      expect(addedStar.type).toBe('shape');
      expect((addedStar as any).starConfig).toBeDefined();
      expect((addedStar as any).starConfig.points).toBe(5);
      expect((addedStar as any).starConfig.pointRatio).toBe(0.5);
      expect((addedStar as any).starConfig.outerRadius).toBe(60);
      // Renders directly over the preview center (startX = 200, startY = 200)
      expect(addedStar.transform.x).toBe(200);
      expect(addedStar.transform.y).toBe(200);
      expect(addedStar.transform.originX).toBe(60);
      expect(addedStar.transform.originY).toBe(60);
    });
  });

  describe('3. Keyboard Modifiers During Star Drawing', () => {
    it('modifies points with ArrowUp / ArrowDown and intrusion with ArrowLeft / ArrowRight in real time without HUD badge', async () => {
      editorActions.setActiveTool('polygon');
      editorActions.setStarConfig({ points: 5, pointRatio: 0.5 });

      await act(async () => {
        root.render(<Stage />);
      });

      const canvas = container.querySelector('[data-testid="stage-canvas"]') as HTMLElement;

      // Start drawing
      await act(async () => {
        canvas.dispatchEvent(
          new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true })
        );
      });

      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 180, clientY: 100, bubbles: true })
        );
      });

      expect(document.querySelector('[data-testid="star-hud-badge"]')).toBeNull();
      const previewSvg = document.querySelector('[data-testid="star-draw-preview-svg"]');
      expect(previewSvg).not.toBeNull();

      // Initial 5-pt star: 10 vertices
      let pathD = previewSvg?.querySelector('path')?.getAttribute('d') || '';
      expect((pathD.match(/[ML]/g) || []).length).toBe(10);

      // Press ArrowUp: increment points to 6
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
        );
      });

      pathD = previewSvg?.querySelector('path')?.getAttribute('d') || '';
      expect((pathD.match(/[ML]/g) || []).length).toBe(12);

      // Press ArrowUp again: increment points to 7
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
        );
      });

      pathD = previewSvg?.querySelector('path')?.getAttribute('d') || '';
      expect((pathD.match(/[ML]/g) || []).length).toBe(14);

      // Press ArrowDown: decrement points to 6
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        );
      });

      pathD = previewSvg?.querySelector('path')?.getAttribute('d') || '';
      expect((pathD.match(/[ML]/g) || []).length).toBe(12);

      // Press ArrowLeft: decrement intrusion ratio by 5% (0.50 -> 0.45)
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
        );
      });

      // Press [ key: decrement intrusion ratio by 5% (0.45 -> 0.40)
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true })
        );
      });

      // Press ArrowRight: increment intrusion ratio by 5% (0.40 -> 0.45)
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
        );
      });

      // Confirm HUD badge remains NOT rendered throughout
      expect(document.querySelector('[data-testid="star-hud-badge"]')).toBeNull();

      // Finish drawing
      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('mouseup', { clientX: 180, clientY: 100, bubbles: true })
        );
      });

      const elements = getEditorState().doc.root.layers[0].keyframes[0].elements;
      const created = elements[elements.length - 1] as any;
      expect(created.starConfig.points).toBe(6);
      expect(created.starConfig.pointRatio).toBe(0.45);
      // 6-point star has 12 vertices
      const pathCommands = (created.paths[0].d.match(/[ML]/g) || []).length;
      expect(pathCommands).toBe(12);
    });
  });

  describe('4. Properties Panel Star & Polygon Controls', () => {
    it('renders dedicated Star & Polygon section and updateStarShape regenerates SVG path', async () => {
      // Create a star element on the stage
      const starRadius = 50;
      const pathD = generatePolygonStarPath(starRadius, starRadius, starRadius, 5, 0.5);
      const starEl: ShapeElement = {
        id: 'poly_star_test',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: starRadius,
          originY: starRadius,
        },
        paths: [{ d: pathD, fill: { type: 'solid', color: '#3b82f6' } }],
        alpha: 1,
        visible: true,
      };
      (starEl as any).starConfig = {
        points: 5,
        pointRatio: 0.5,
        outerRadius: starRadius,
        startAngle: -Math.PI / 2,
      };

      editorActions.addElement(starEl);
      editorActions.selectElement('poly_star_test', false);

      await act(async () => {
        root.render(<Properties />);
      });

      // Section must be present
      const starSection = document.querySelector('[data-testid="star-polygon-section"]');
      expect(starSection).not.toBeNull();
      expect(starSection?.textContent).toContain('Star & Polygon');

      // Ratio label reflects "Intruded" for 0.5
      const typeLabel = document.querySelector('[data-testid="star-ratio-type-label"]');
      expect(typeLabel?.textContent).toBe('Intruded');

      // Update points via updateStarShape to 8 points
      act(() => {
        editorActions.updateStarShape('poly_star_test', { points: 8 });
      });

      const updatedEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'poly_star_test'
      ) as ShapeElement;
      expect((updatedEl as any).starConfig.points).toBe(8);
      // 8 points has 16 vertices
      const ptsCount = (updatedEl.paths[0].d.match(/[ML]/g) || []).length;
      expect(ptsCount).toBe(16);
      // Position is preserved
      expect(updatedEl.transform.x).toBe(100);
      expect(updatedEl.transform.y).toBe(100);

      // Update ratio to 1.0 (regular polygon / octagon)
      act(() => {
        editorActions.updateStarShape('poly_star_test', { pointRatio: 1.0 });
      });

      const octEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'poly_star_test'
      ) as ShapeElement;
      expect((octEl as any).starConfig.pointRatio).toBe(1.0);
      // Regular polygon with ratio 1.0 has 8 vertices (isExtruded is false)
      const octPts = (octEl.paths[0].d.match(/[ML]/g) || []).length;
      expect(octPts).toBe(8);

      // Update ratio to 1.4 (extruded)
      act(() => {
        editorActions.updateStarShape('poly_star_test', { pointRatio: 1.4 });
      });

      const extEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'poly_star_test'
      ) as ShapeElement;
      expect((extEl as any).starConfig.pointRatio).toBe(1.4);
    });
  });

  describe('5. Preset Options & Clean Toolbar (Controls in Properties)', () => {
    it('defines all 7 required presets with accurate points and ratios', () => {
      const presetIds = STAR_PRESETS.map((p) => p.id);
      expect(presetIds).toContain('star-5');
      expect(presetIds).toContain('star-6');
      expect(presetIds).toContain('pentagon');
      expect(presetIds).toContain('hexagon');
      expect(presetIds).toContain('sun-12');
      expect(presetIds).toContain('burst-16');
      expect(presetIds).toContain('extruded-4');

      const p5 = STAR_PRESETS.find((p) => p.id === 'star-5')!;
      expect(p5.points).toBe(5);
      expect(p5.pointRatio).toBe(0.5);

      const p6 = STAR_PRESETS.find((p) => p.id === 'star-6')!;
      expect(p6.points).toBe(6);
      expect(p6.pointRatio).toBe(0.58);

      const pent = STAR_PRESETS.find((p) => p.id === 'pentagon')!;
      expect(pent.points).toBe(5);
      expect(pent.pointRatio).toBe(1.0);

      const hex = STAR_PRESETS.find((p) => p.id === 'hexagon')!;
      expect(hex.points).toBe(6);
      expect(hex.pointRatio).toBe(1.0);

      const sun = STAR_PRESETS.find((p) => p.id === 'sun-12')!;
      expect(sun.points).toBe(12);
      expect(sun.pointRatio).toBe(0.75);

      const burst = STAR_PRESETS.find((p) => p.id === 'burst-16')!;
      expect(burst.points).toBe(16);
      expect(burst.pointRatio).toBe(0.35);

      const ext = STAR_PRESETS.find((p) => p.id === 'extruded-4')!;
      expect(ext.points).toBe(4);
      expect(ext.pointRatio).toBe(1.4);
    });

    it('does not render Star configuration sub-panel in Tools when polygon tool is active to prevent toolbar augmentation', async () => {
      editorActions.setActiveTool('polygon');

      await act(async () => {
        root.render(<Tools />);
      });

      // The toolbar stays compact: no star configuration panel should augment the tool list
      const configPanel = document.querySelector('[data-testid="star-tool-config"]');
      expect(configPanel).toBeNull();
    });
  });

  describe('6. Modern Live Shape: Anchor Customization & Parametric Protection (Approach B)', () => {
    it('editing an anchor with Subselect tool sets isCustomizedPath: true', async () => {
      // 1. Create a star element
      const starRadius = 50;
      const pathD = generatePolygonStarPath(starRadius, starRadius, starRadius, 5, 0.5);
      const starEl: ShapeElement = {
        id: 'subselect_star_test',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: starRadius,
          originY: starRadius,
        },
        paths: [{ d: pathD, fill: { type: 'solid', color: '#3b82f6' } }],
        alpha: 1,
        visible: true,
      };
      (starEl as any).starConfig = {
        points: 5,
        pointRatio: 0.5,
        outerRadius: starRadius,
        startAngle: -Math.PI / 2,
      };

      editorActions.addElement(starEl);
      editorActions.selectElement('subselect_star_test', false);
      editorActions.setActiveTool('subselect');

      await act(async () => {
        root.render(<Stage />);
      });

      // Initially isCustomizedPath is not true
      let currentEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'subselect_star_test'
      ) as ShapeElement;
      expect(currentEl.isCustomizedPath).toBeFalsy();

      // Find an anchor node
      const anchorNode = container.querySelector('[data-testid="subselect-anchor"]') as SVGRectElement;
      expect(anchorNode).not.toBeNull();

      // Mouse down on anchor to start drag
      await act(async () => {
        anchorNode.dispatchEvent(
          new MouseEvent('mousedown', {
            clientX: 100,
            clientY: 100,
            bubbles: true,
          })
        );
      });

      // Mouse move to sculpt anchor
      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            clientX: 130,
            clientY: 130,
            bubbles: true,
          })
        );
      });

      // Mouse up to release
      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('mouseup', {
            clientX: 130,
            clientY: 130,
            bubbles: true,
          })
        );
      });

      // Verify isCustomizedPath is now true
      currentEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'subselect_star_test'
      ) as ShapeElement;
      expect(currentEl.isCustomizedPath).toBe(true);
    });

    it('locks parametric controls in Properties when customized and allows reset to parametric', async () => {
      const starRadius = 50;
      const pathD = generatePolygonStarPath(starRadius, starRadius, starRadius, 5, 0.5);
      const starEl: ShapeElement = {
        id: 'locked_star_test',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: starRadius,
          originY: starRadius,
        },
        paths: [{ d: pathD, fill: { type: 'solid', color: '#3b82f6' } }],
        alpha: 1,
        visible: true,
        isCustomizedPath: true,
      };
      (starEl as any).starConfig = {
        points: 5,
        pointRatio: 0.5,
        outerRadius: starRadius,
        startAngle: -Math.PI / 2,
      };

      editorActions.addElement(starEl);
      editorActions.selectElement('locked_star_test', false);

      await act(async () => {
        root.render(<Properties />);
      });

      // Verify custom vector path notification banner is rendered
      const banner = document.querySelector('[data-testid="star-customized-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Custom Vector Path (Anchors edited manually)');
      expect(banner?.textContent).toContain('Parametric star controls are locked to protect your hand-sculpted vector anchors.');

      // Parametric sliders and number fields are NOT rendered
      expect(document.querySelector('[data-testid="star-points-numberfield"]')).toBeNull();
      expect(document.querySelector('[data-testid="star-ratio-numberfield"]')).toBeNull();
      expect(document.querySelector('[data-testid="star-props-slider"]')).toBeNull();

      // updateStarShape without force does not overwrite the path
      const originalPathD = starEl.paths[0].d;
      act(() => {
        editorActions.updateStarShape('locked_star_test', { points: 8 });
      });
      let currentEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'locked_star_test'
      ) as ShapeElement;
      expect(currentEl.paths[0].d).toBe(originalPathD);
      expect(currentEl.isCustomizedPath).toBe(true);

      // Click "Reset to Parametric Star"
      const resetBtn = document.querySelector('[data-testid="reset-parametric-star-btn"]') as HTMLButtonElement;
      expect(resetBtn).not.toBeNull();
      expect(resetBtn.textContent).toContain('Reset to Parametric Star');

      await act(async () => {
        resetBtn.click();
      });

      // isCustomizedPath is cleared
      currentEl = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'locked_star_test'
      ) as ShapeElement;
      expect(currentEl.isCustomizedPath).toBe(false);

      // Banner is dismissed and parametric controls are restored
      expect(document.querySelector('[data-testid="star-customized-banner"]')).toBeNull();
      expect(document.querySelector('[data-testid="star-points-numberfield"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="star-ratio-numberfield"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="star-props-slider"]')).not.toBeNull();
    });

    it('when isCustomizedPath is true, resetStarShapeToParametric clears the flag and regenerates the star', () => {
      const starRadius = 50;
      const customPathD = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
      const starEl: ShapeElement = {
        id: 'reset_action_test',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: starRadius,
          originY: starRadius,
        },
        paths: [{ d: customPathD, fill: { type: 'solid', color: '#3b82f6' } }],
        alpha: 1,
        visible: true,
        isCustomizedPath: true,
      };
      (starEl as any).starConfig = {
        points: 6,
        pointRatio: 0.5,
        outerRadius: starRadius,
        startAngle: -Math.PI / 2,
      };

      editorActions.addElement(starEl);

      // updateStarShape without force does not overwrite
      editorActions.updateStarShape('reset_action_test', { points: 10 });
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'reset_action_test'
      ) as ShapeElement;
      expect(el.paths[0].d).toBe(customPathD);
      expect(el.isCustomizedPath).toBe(true);

      // Reset to parametric
      editorActions.resetStarShapeToParametric('reset_action_test');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'reset_action_test'
      ) as ShapeElement;
      expect(el.isCustomizedPath).toBe(false);
      // Path was regenerated from starConfig (6 points = 12 vertices)
      expect(el.paths[0].d).not.toBe(customPathD);
      const commandCount = (el.paths[0].d.match(/[ML]/g) || []).length;
      expect(commandCount).toBe(12);
    });
  });
});
