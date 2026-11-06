import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  NumberField,
  evaluateMathExpression,
} from '../src/ui/NumberField';
import {
  computeInterpolatedTransform,
  scaleSvgPathD,
} from '../src/panels/Stage/Stage';
import {
  editorActions,
  getEditorState,
  getKeyframeTime,
  type EditorElement,
  type ShapeElement,
} from '../src/state/editorStore';

describe('Precision Controls, Math Input & Unbounded Rotation', () => {
  describe('1. Math Expression Evaluator', () => {
    it('evaluates arithmetic operations with correct operator precedence', () => {
      expect(evaluateMathExpression('360 * 3')).toBe(1080);
      expect(evaluateMathExpression('360*3')).toBe(1080);
      expect(evaluateMathExpression('100 / 2 + 5')).toBe(55);
      expect(evaluateMathExpression('(50 + 25) * 2')).toBe(150);
      expect(evaluateMathExpression('10 + 20 * 3')).toBe(70);
    });

    it('handles negative numbers, decimals, and leading unary operators', () => {
      expect(evaluateMathExpression('-90')).toBe(-90);
      expect(evaluateMathExpression('-360 * 2')).toBe(-720);
      expect(evaluateMathExpression('1.5 * 2')).toBe(3);
      expect(evaluateMathExpression('45.5 + 4.5')).toBe(50);
    });

    it('supports relative adjustments based on baseValue', () => {
      expect(evaluateMathExpression('+45', 100)).toBe(145);
      expect(evaluateMathExpression('+=45', 100)).toBe(145);
      expect(evaluateMathExpression('-=30', 100)).toBe(70);
      expect(evaluateMathExpression('*=2', 50)).toBe(100);
      expect(evaluateMathExpression('/=2', 50)).toBe(25);
    });

    it('returns null for invalid inputs', () => {
      expect(evaluateMathExpression('')).toBeNull();
      expect(evaluateMathExpression('abc')).toBeNull();
      expect(evaluateMathExpression('10 / 0')).toBeNull();
      expect(evaluateMathExpression('(((')).toBeNull();
    });
  });

  describe('2. NumberField Component Keyboard & Lifecycle Interactions', () => {
    it('renders with accessible spinbutton role and handles Enter commit and Escape revert', async () => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const handleChange = vi.fn();
      const handleCommit = vi.fn();

      const TestWrapper = () => {
        const [val, setVal] = React.useState(100);
        return (
          <NumberField
            label="Rot:"
            ariaLabel="Rotation"
            value={val}
            onChange={(v) => {
              setVal(v);
              handleChange(v);
            }}
            onCommit={handleCommit}
            unit="°"
          />
        );
      };

      await act(async () => {
        root.render(<TestWrapper />);
      });

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.getAttribute('role')).toBe('spinbutton');
      expect(input.getAttribute('aria-label')).toBe('Rotation');
      expect(input.getAttribute('aria-valuenow')).toBe('100');

      const setInput = (val: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, val);
        } else {
          input.value = val;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Test typing math expression and pressing Enter to commit
      await act(async () => {
        input.focus();
        setInput('360*3');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(handleChange).toHaveBeenCalledWith(1080);
      expect(handleCommit).toHaveBeenCalledWith(1080);

      // Now test Escape reverts without committing new value
      handleChange.mockClear();
      handleCommit.mockClear();

      await act(async () => {
        input.focus();
        setInput('9999');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(handleCommit).not.toHaveBeenCalled();
      expect(input.value).toBe('1080');

      root.unmount();
      container.remove();
    });

    it('steps by 1 with ArrowUp/Down, 10 with Shift, and 0.1 with Alt', async () => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      let val = 50;
      const handleChange = vi.fn((v: number) => {
        val = v;
      });

      await act(async () => {
        root.render(
          <NumberField
            label="X:"
            value={val}
            onChange={handleChange}
            step={1}
            shiftStep={10}
            altStep={0.1}
          />
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;

      // Regular ArrowUp -> +1
      await act(async () => {
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });
      expect(handleChange).toHaveBeenLastCalledWith(51);

      // Shift + ArrowUp -> +10
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
      });
      expect(handleChange).toHaveBeenLastCalledWith(61);

      // Alt + ArrowDown -> -0.1
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      });
      expect(handleChange).toHaveBeenLastCalledWith(60.9);

      root.unmount();
      container.remove();
    });
  });

  describe('3. Unbounded Rotation in Editor and Linear Interpolation', () => {
    it('stores negative and >360 rotations and interpolates linearly (0 -> 720, 0 -> -450)', () => {
      editorActions.newDocument();
      const shape: ShapeElement = {
        id: 'spin_box',
        type: 'shape',
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 L 0 50 Z' }],
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(shape);

      // Verify storing 720 deg
      editorActions.updateElementTransform('spin_box', { rotation: 720 });
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.rotation).toBe(720);

      // Verify storing -450 deg
      editorActions.updateElementTransform('spin_box', { rotation: -450 });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.rotation).toBe(-450);

      // Verify linear interpolation from 0 to 720 at t=0.5 -> 360 (1 full turn)
      const startEl: EditorElement = { ...shape, transform: { ...shape.transform, rotation: 0 } };
      const endEl720: EditorElement = { ...shape, transform: { ...shape.transform, rotation: 720 } };
      const midT = computeInterpolatedTransform(startEl, endEl720, 0.5);
      expect(midT.rotation).toBe(360);

      // Verify linear interpolation from 0 to -450 at t=0.5 -> -225
      const endElNeg: EditorElement = { ...shape, transform: { ...shape.transform, rotation: -450 } };
      const midTNeg = computeInterpolatedTransform(startEl, endElNeg, 0.5);
      expect(midTNeg.rotation).toBe(-225);
    });

    it('honors explicit tween rotate options (CW/CCW and extra turns)', () => {
      const startEl: EditorElement = {
        id: 'test',
        type: 'shape',
        paths: [],
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };
      const endEl: EditorElement = {
        ...startEl,
        transform: { ...startEl.transform, rotation: 90 },
      };

      // CW with 2 extra turns: 0 -> (90 + 720) = 810 deg
      const tCw = computeInterpolatedTransform(startEl, endEl, 1, { direction: 'cw', turns: 2 });
      expect(tCw.rotation).toBe(810);

      // CCW with 1 extra turn from 90 to 0: 90 -> -360 deg
      const start90: EditorElement = { ...startEl, transform: { ...startEl.transform, rotation: 90 } };
      const end0: EditorElement = { ...startEl, transform: { ...startEl.transform, rotation: 0 } };
      const tCcw = computeInterpolatedTransform(start90, end0, 1, { direction: 'ccw', turns: 1 });
      expect(tCcw.rotation).toBe(-360);
    });
  });

  describe('4. True Geometry Resizing (W & H) via scaleSvgPathD', () => {
    it('scales SVG path coordinates accurately when resizing width and height', () => {
      const initialD = 'M 0 0 L 50 0 L 50 50 L 0 50 Z';
      const initialBounds = { x: 0, y: 0, width: 50, height: 50 };

      // Double width to 100 and triple height to 150
      const scaledD = scaleSvgPathD(initialD, initialBounds, 100, 150);
      expect(scaledD).toContain('100');
      expect(scaledD).toContain('150');

      // Verify scaling handles relative/absolute segments
      const initialPath2 = 'M 10 10 H 60 V 60 H 10 Z';
      const bounds2 = { x: 10, y: 10, width: 50, height: 50 };
      const scaledD2 = scaleSvgPathD(initialPath2, bounds2, 100, 100);
      expect(scaledD2).toBeDefined();
      expect(scaledD2).toContain('H 110');
      expect(scaledD2).toContain('V 110');
    });
  });

  describe('5. Auto-Keyframing During Playback & History Commit', () => {
    it('auto-inserts a keyframe at currentTime during playback with a single undo step per commit', () => {
      editorActions.newDocument();
      const el: ShapeElement = {
        id: 'auto_kf_el',
        type: 'shape',
        paths: [{ d: 'M 0 0 L 40 40 Z' }],
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(el);
      const layer = getEditorState().doc.root.layers[0];
      expect(layer.keyframes.length).toBe(1);

      // Start playback and advance to 1.0s
      editorActions.play();
      editorActions.setPlayheadTime(1.0);
      expect(getEditorState().isPlaying).toBe(true);

      // Edit rotation while playing: should auto-keyframe at 1.0s
      editorActions.updateElementTransform('auto_kf_el', { rotation: 720 });

      const updatedLayer = getEditorState().doc.root.layers[0];
      expect(updatedLayer.keyframes.length).toBe(2);

      const kf0 = updatedLayer.keyframes[0];
      const kf1 = updatedLayer.keyframes[1];
      expect(getKeyframeTime(kf0)).toBe(0);
      expect(getKeyframeTime(kf1)).toBeCloseTo(1.0, 2);

      expect(kf0.elements[0].transform.rotation).toBe(0);
      expect(kf1.elements[0].transform.rotation).toBe(720);

      // Undo returns to single keyframe before playback edit
      editorActions.stop();
      editorActions.undo();
      const revertedLayer = getEditorState().doc.root.layers[0];
      expect(revertedLayer.keyframes.length).toBe(1);
    });
  });

  describe('6. True Geometry Resizing W & H with Aspect Ratio Locking', () => {
    it('scales shape SVG path dimensions while preserving element scale at 1', () => {
      editorActions.newDocument();
      const shape: ShapeElement = {
        id: 'resize_shape',
        type: 'shape',
        paths: [{ d: 'M 0 0 L 100 0 L 100 50 L 0 50 Z' }],
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(shape);
      const bounds = { x: 0, y: 0, width: 100, height: 50 };

      // Resizing to W=200 with locked aspect ratio 2:1 -> H=100
      const newW = 200;
      const newH = Math.round(bounds.height * (newW / bounds.width));
      expect(newH).toBe(100);

      const scaledPaths = shape.paths.map((p) => ({
        ...p,
        d: scaleSvgPathD(p.d, bounds, newW, newH),
      }));

      editorActions.updateElementProps('resize_shape', { paths: scaledPaths });

      const updated = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as ShapeElement;
      expect(updated.transform.scaleX).toBe(1);
      expect(updated.transform.scaleY).toBe(1);
      expect(updated.paths[0].d).toContain('200');
      expect(updated.paths[0].d).toContain('100');
    });

    it('updates width and height properties directly for bitmaps and text', () => {
      editorActions.newDocument();
      const textEl: EditorElement = {
        id: 'resize_txt',
        type: 'text',
        mode: 'static',
        text: 'Flashback',
        fontId: 'default',
        fontSize: 20,
        color: '#ffffff',
        align: 'left',
        width: 120,
        height: 30,
        multiline: false,
        selectable: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);
      editorActions.updateElementProps('resize_txt', { width: 240, height: 60, multiline: true });

      const updated = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as any;
      expect(updated.width).toBe(240);
      expect(updated.height).toBe(60);
      expect(updated.multiline).toBe(true);
      expect(updated.transform.scaleX).toBe(1);
    });

    it('guarantees centerpoint/pivot does not move on its own during a tween while spinning multiple times', () => {
      editorActions.newDocument();
      // Rectangle with dimensions 100x80, centered pivot at (50, 40)
      const rectEl: ShapeElement = {
        id: 'spin_rect',
        type: 'shape',
        transform: {
          x: 150,
          y: 140,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 50,
          originY: 40,
        },
        paths: [{ d: 'M 0 0 L 100 0 L 100 80 L 0 80 Z' }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(rectEl);
      editorActions.selectElement('spin_rect');

      // Insert Keyframe 2 at 2.0s
      editorActions.setPlayheadTime(2.0);
      editorActions.insertKeyframe(undefined, 2.0);

      // Move rectangle across screen to x=650 and spin 720 degrees (2 full turns)
      editorActions.updateElementTransform('spin_rect', {
        x: 650,
        y: 140,
        rotation: 720,
      });

      const root = getEditorState().doc.root;
      const layer = root.layers[0];
      const kf1El = layer.keyframes[0].elements[0];
      const kf2El = layer.keyframes[1].elements[0];

      // Neither keyframe had its pivot modified by the rotation
      expect(kf1El.transform.originX).toBe(50);
      expect(kf1El.transform.originY).toBe(40);
      expect(kf2El.transform.originX).toBe(50);
      expect(kf2El.transform.originY).toBe(40);

      // Throughout the tween at any progress t, the centerpoint remains locked at (50, 40)
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
        const interpT = computeInterpolatedTransform(kf1El, kf2El, t);
        expect(interpT.originX).toBe(50);
        expect(interpT.originY).toBe(40);
        expect(interpT.rotation).toBeCloseTo(720 * t, 3);
        expect(interpT.x).toBeCloseTo(150 + 500 * t, 3);
        expect(interpT.y).toBe(140);
      }

      // If the user explicitly moves the centerpoint on Keyframe 2 to (0, 0), it ONLY then moves
      editorActions.updateElementTransform('spin_rect', {
        originX: 0,
        originY: 0,
      });
      const updatedKf2El = getEditorState().doc.root.layers[0].keyframes[1].elements[0];
      const midT = computeInterpolatedTransform(kf1El, updatedKf2El, 0.5);
      expect(midT.originX).toBe(25);
      expect(midT.originY).toBe(20);
    });
  });
});
