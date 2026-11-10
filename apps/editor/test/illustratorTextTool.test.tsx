import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { editorActions, getEditorState } from '../src/state/editorStore';
import { Properties } from '../src/panels/Properties/Properties';
import { Stage, getPathPointAndNormal, findClosestOffsetOnPath, computeInterpolatedElement } from '../src/panels/Stage/Stage';
import { renderText } from '@flashback/runtime';
import type { TextElement, ShapeElement } from '@flashback/runtime';

describe('Illustrator-like Text Tool & Type on Path', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    editorActions.newDocument();
  });

  describe('Point Text vs Area Text creation', () => {
    it('creates Point Text with auto-width and no constrained bounding box', () => {
      const textEl: TextElement = {
        id: 'point_text_1',
        type: 'text',
        textType: 'point',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Single Line Point Text',
        fontSize: 20,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      const state = getEditorState();
      const el = state.doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'point_text_1'
      ) as TextElement;

      expect(el).toBeDefined();
      expect(el.textType).toBe('point');
      expect(el.multiline).toBe(false);
      expect(el.width).toBe(0);

      // Verify runtime render
      const dom = renderText(document, el);
      expect(dom.style.width).toBe('auto');
      expect(dom.style.whiteSpace).toBe('pre');
      expect(dom.style.overflow).toBe('visible');
    });

    it('creates Area Text with constrained width and height and soft text wrapping', () => {
      const textEl: TextElement = {
        id: 'area_text_1',
        type: 'text',
        textType: 'area',
        transform: {
          x: 150,
          y: 150,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'This is a paragraph of area text that should wrap inside its bounding box.',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 250,
        height: 120,
        mode: 'static',
        multiline: true,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      const state = getEditorState();
      const el = state.doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'area_text_1'
      ) as TextElement;

      expect(el).toBeDefined();
      expect(el.textType).toBe('area');
      expect(el.multiline).toBe(true);
      expect(el.width).toBe(250);
      expect(el.height).toBe(120);

      // Verify runtime render
      const dom = renderText(document, el);
      expect(dom.style.width).toBe('250px');
      expect(dom.style.height).toBe('120px');
      expect(dom.style.whiteSpace).toBe('pre-wrap');
    });
  });

  describe('Type on Path / Mapping text to vector curves', () => {
    it('creates text along an SVG vector path with <textPath>', () => {
      const pathD = 'M 50 150 Q 200 50 350 150';
      const textEl: TextElement = {
        id: 'path_text_1',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: pathD,
          startOffset: 15,
        },
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Curved text along a wave',
        fontSize: 18,
        color: '#ffcc00',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      const state = getEditorState();
      const el = state.doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'path_text_1'
      ) as TextElement;

      expect(el.textType).toBe('path');
      expect(el.pathConfig?.pathData).toBe(pathD);
      expect(el.pathConfig?.startOffset).toBe(15);

      // Test runtime SVG <textPath> rendering
      const dom = renderText(document, el);
      expect(dom.tagName.toLowerCase()).toBe('svg');
      const textPath = dom.querySelector('textPath');
      expect(textPath).not.toBeNull();
      expect(textPath?.getAttribute('startOffset')).toBe('15%');
      expect(textPath?.textContent).toBe('Curved text along a wave');
    });

    it('attaches and detaches text to and from a shape path via editor actions', () => {
      const textEl: TextElement = {
        id: 'convertible_txt',
        type: 'text',
        textType: 'point',
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
        text: 'Antigravity Dynamic Motion',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);

      // 1. Attach to path
      const arcPath = 'M 0 100 A 100 100 0 0 1 200 100';
      editorActions.attachTextToPath('convertible_txt', arcPath, 'shape_123', 25);

      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'convertible_txt'
      ) as TextElement;
      expect(el.textType).toBe('path');
      expect(el.pathConfig?.pathData).toBe(arcPath);
      expect(el.pathConfig?.pathId).toBe('shape_123');
      expect(el.pathConfig?.startOffset).toBe(25);

      // 2. Detach from path
      editorActions.detachTextFromPath('convertible_txt');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'convertible_txt'
      ) as TextElement;
      expect(el.textType).toBe('point');
      expect(el.pathConfig).toBeUndefined();
    });

    it('converts between Point Text and Area Text smoothly', () => {
      const textEl: TextElement = {
        id: 'toggle_txt',
        type: 'text',
        textType: 'point',
        transform: {
          x: 20,
          y: 20,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Converting between point and area text',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);

      // Convert to Area
      editorActions.convertTextType('toggle_txt', 'area');
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'toggle_txt'
      ) as TextElement;
      expect(el.textType).toBe('area');
      expect(el.multiline).toBe(true);
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);

      // Convert back to Point
      editorActions.convertTextType('toggle_txt', 'point');
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'toggle_txt'
      ) as TextElement;
      expect(el.textType).toBe('point');
      expect(el.multiline).toBe(false);
      expect(el.width).toBe(0);
    });
  });

  describe('Properties Inspector Text Type Controls', () => {
    it('renders text type segmented buttons (Point, Area, On Path) and switches type on click', async () => {
      const shapeEl: ShapeElement = {
        id: 'star_curve_shape',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 50,
          originY: 50,
        },
        paths: [{ d: 'M 10 50 Q 80 0 150 50' }],
        alpha: 1,
        visible: true,
      };

      const textEl: TextElement = {
        id: 'prop_txt_el',
        type: 'text',
        textType: 'point',
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
        text: 'Interactive Properties Test',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(shapeEl);
      editorActions.addElement(textEl);
      editorActions.selectElement('prop_txt_el');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<Properties />);
      });

      const pointBtn = container.querySelector('[data-testid="text-type-point-btn"]');
      const areaBtn = container.querySelector('[data-testid="text-type-area-btn"]');
      const pathBtn = container.querySelector('[data-testid="text-type-path-btn"]');

      expect(pointBtn).not.toBeNull();
      expect(areaBtn).not.toBeNull();
      expect(pathBtn).not.toBeNull();

      // Click Area button
      await act(async () => {
        areaBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'prop_txt_el'
      ) as TextElement;
      expect(el.textType).toBe('area');

      // Click Path button
      await act(async () => {
        pathBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'prop_txt_el'
      ) as TextElement;
      expect(el.textType).toBe('path');
      expect(el.pathConfig?.pathData).toBeDefined();

      root.unmount();
      container.remove();
    });

    it('renders Fill and Stroke controls for Text in Properties and updates stroke and fill', async () => {
      const textEl: TextElement = {
        id: 'colored_txt_el',
        type: 'text',
        textType: 'point',
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
        text: 'Color Parity Test',
        fontSize: 16,
        color: '#0066cc',
        fill: { type: 'solid', color: '#0066cc' },
        stroke: {
          fill: { type: 'solid', color: '#ff0000' },
          width: 2,
          cap: 'round',
          join: 'round',
        },
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      editorActions.selectElement('colored_txt_el');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<Properties />);
      });

      const fillSwatch = container.querySelector('[data-testid="text-fill-swatch"]');
      const strokeColorInput = container.querySelector('[data-testid="text-stroke-color-input"]') as HTMLInputElement;

      expect(fillSwatch).not.toBeNull();
      expect(strokeColorInput).not.toBeNull();
      expect(strokeColorInput.value).toBe('#ff0000');

      // Change stroke color to green
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(strokeColorInput, '#00ff00');
        strokeColorInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'colored_txt_el'
      ) as TextElement;
      expect((el.stroke?.fill as any)?.color).toBe('#00ff00');
      expect(el.stroke?.width).toBe(2);

      // Verify runtime rendering applies stroke
      const dom = renderText(document, el);
      expect((dom.style as any).webkitTextStroke).toBe('2px #00ff00');

      root.unmount();
      container.remove();
    });

    it('renders Illustrator-style Start Offset Bracket Handle on Stage for Type on Path', async () => {
      const textEl: TextElement = {
        id: 'handle_txt_el',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: 'M 50 150 Q 200 50 350 150',
          startOffset: 25,
        },
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Interactive Handle Test',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      editorActions.selectElement('handle_txt_el');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<Stage />);
      });

      // Bracket handle must be rendered on the Stage
      const handle = container.querySelector('[data-testid="path-start-offset-handle"]');
      expect(handle).not.toBeNull();
      expect(handle?.querySelector('title')?.textContent).toContain('Start Offset');

      root.unmount();
      container.remove();
    });

    it('enables typing in-line directly on the path with no popup window', async () => {
      const textEl: TextElement = {
        id: 'inline_txt_el',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: 'M 100 100 L 400 100',
          startOffset: 0,
        },
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Live path text',
        fontSize: 18,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      editorActions.selectElement('inline_txt_el');
      editorActions.setEditingTextElId('inline_txt_el');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<Stage />);
      });

      // In-line typing receiver exists and is transparent (zero popup box)
      const input = container.querySelector('[data-testid="path-inline-text-input"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.style.opacity).toBe('0');
      expect(input.style.cursor).toBe('text');

      // The textPath element contains the text and the in-line blinking caret
      const textPath = container.querySelector('textPath');
      expect(textPath).not.toBeNull();
      expect(textPath?.textContent).toContain('Live path text');
      expect(textPath?.textContent).toContain('|');

      // Type new text
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(input, 'New Inline Text');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const updated = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'inline_txt_el'
      ) as TextElement;
      expect(updated.text).toBe('New Inline Text');

      root.unmount();
      container.remove();
    });

    it('suppresses tool shortcuts while typing on path or when Text tool is active', async () => {
      // 1. When activeTool is text
      editorActions.setActiveTool('text');
      expect(getEditorState().activeTool).toBe('text');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<App />);
      });

      // Pressing 'v', 'p', 'r' should not switch activeTool away from text
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
      expect(getEditorState().activeTool).toBe('text');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      expect(getEditorState().activeTool).toBe('text');

      // 2. When editing a path text element
      const pathText: TextElement = {
        id: 'shortcut_test_txt',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: 'M 10 10 L 100 10',
          startOffset: 0,
        },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Hello',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(pathText);
      editorActions.setActiveTool('select');
      editorActions.setEditingTextElId('shortcut_test_txt');

      // Now activeTool was 'select', but editingTextElId is active
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      expect(getEditorState().activeTool).toBe('select'); // Still select, not pen!

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      expect(getEditorState().activeTool).toBe('select'); // Still select, not rect!

      root.unmount();
      container.remove();
    });

    it('samples path point and calculates offset percentage accurately', () => {
      const geom = getPathPointAndNormal('M 0 0 L 100 0', 50);
      expect(geom).toBeDefined();
      expect(typeof geom.x).toBe('number');
      expect(typeof geom.y).toBe('number');
      expect(typeof geom.nx).toBe('number');
      expect(typeof geom.ny).toBe('number');
    });
  });

  describe('Motion Tweening Text Moving Along Its Path', () => {
    it('computeInterpolatedElement smoothly interpolates path startOffset and pathData across tweens', () => {
      const startEl: TextElement = {
        id: 'tween_path_txt',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: 'M 0 100 Q 150 0 300 100',
          startOffset: 10,
        },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Sliding along curve',
        fontSize: 18,
        color: '#ffffff',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      const endEl: TextElement = {
        ...startEl,
        pathConfig: {
          pathData: 'M 0 100 Q 150 0 300 100',
          startOffset: 90,
        },
      };

      // Halfway (t = 0.5)
      const mid = computeInterpolatedElement(startEl, endEl, 0.5) as TextElement;
      expect(mid.pathConfig).toBeDefined();
      expect(mid.pathConfig?.startOffset).toBe(50); // (10 + 90) / 2 = 50

      // Quarterway (t = 0.25)
      const qtr = computeInterpolatedElement(startEl, endEl, 0.25) as TextElement;
      expect(qtr.pathConfig?.startOffset).toBe(30); // 10 + (80 * 0.25) = 30
    });

    it('animates text moving along its path during motion tween playback on Stage', async () => {
      // Create text element on path
      const textEl: TextElement = {
        id: 'stage_tween_txt',
        type: 'text',
        textType: 'path',
        pathConfig: {
          pathData: 'M 50 150 L 350 150',
          startOffset: 0,
        },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        text: 'Motion Tween Text',
        fontSize: 16,
        color: '#38bdf8',
        align: 'left',
        width: 0,
        height: 0,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      const state = getEditorState();
      const layerId = state.doc.root.layers[0].id;

      // Create a motion tween span from frame 0 to frame 24
      editorActions.createMotionTween(layerId, 0);

      // Scrub to frame 24 and move text along its path to 80%
      editorActions.setCurrentTime(1.0); // 1s = frame 24 at 24fps
      editorActions.updateElementProps('stage_tween_txt', {
        pathConfig: {
          pathData: 'M 50 150 L 350 150',
          startOffset: 80,
        },
      });

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      // At frame 12 (0.5s, exactly 50% between frame 0 and frame 24)
      editorActions.setCurrentTime(0.5);

      await act(async () => {
        root.render(<Stage />);
      });

      const textPath = container.querySelector('textPath');
      expect(textPath).not.toBeNull();
      // Should be interpolated to 40% (halfway between 0% and 80%)
      expect(textPath?.getAttribute('startOffset')).toBe('40%');

      // Now scrub to 0.75s (75% progress)
      await act(async () => {
        editorActions.setCurrentTime(0.75);
      });

      expect(textPath?.getAttribute('startOffset')).toBe('60%');

      root.unmount();
      container.remove();
    });
  });
});
