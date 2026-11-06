import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  findKeyframeAt,
} from '../src/state/editorStore';
import { Scripts } from '../src/panels/Scripts/Scripts';
import {
  createBlock,
  compileBlocksToJS,
  parseJSIntoBlocks,
  BLOCK_CATALOG,
} from '../src/panels/Scripts/scriptBlocks';
import type { ShapeElement } from '@flashback/runtime';

describe('Scratch-Style Block Scripting & Keyframe Event Triggers', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  /* ========================================================================= *
   * Requirement 1: Compiler & Parser Round-Trip Accuracy
   * ========================================================================= */
  describe('compileBlocksToJS & parseJSIntoBlocks round-trip accuracy', () => {
    it('round-trips alert block', () => {
      const block = createBlock('alert', { message: 'Roundtrip Alert' });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe("alert('Roundtrip Alert');");

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('alert');
      expect(parsed[0].params.message).toBe('Roundtrip Alert');
    });

    it('round-trips stop block', () => {
      const block = createBlock('stop');
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe('this.stop();');

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('stop');
    });

    it('round-trips play block', () => {
      const block = createBlock('play');
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe('this.play();');

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('play');
    });

    it('round-trips goto_artboard block with transition', () => {
      const block = createBlock('goto_artboard', {
        artboardId: 'artboard_menu',
        transition: 'fade',
        duration: 400,
      });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe("gotoArtboard('artboard_menu', { type: 'fade', duration: 400 });");

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('goto_artboard');
      expect(parsed[0].params.artboardId).toBe('artboard_menu');
      expect(parsed[0].params.transition).toBe('fade');
      expect(parsed[0].params.duration).toBe(400);
    });

    it('round-trips goto_artboard block with no transition', () => {
      const block = createBlock('goto_artboard', {
        artboardId: 'artboard_scene2',
        transition: 'none',
      });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe("gotoArtboard('artboard_scene2');");

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('goto_artboard');
      expect(parsed[0].params.artboardId).toBe('artboard_scene2');
      expect(parsed[0].params.transition).toBe('none');
    });

    it('round-trips move_by block for both X and Y', () => {
      const block = createBlock('move_by', { dx: 15, dy: -25 });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe('this.x += 15;\nthis.y += -25;');

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('move_by');
      expect(parsed[0].params.dx).toBe(15);
      expect(parsed[0].params.dy).toBe(-25);
    });

    it('round-trips move_by block for single axis', () => {
      const blockX = createBlock('move_by', { dx: 30, dy: 0 });
      const compiledX = compileBlocksToJS([blockX]);
      expect(compiledX).toBe('this.x += 30;');
      const parsedX = parseJSIntoBlocks(compiledX);
      expect(parsedX).toHaveLength(1);
      expect(parsedX[0].params.dx).toBe(30);
      expect(parsedX[0].params.dy).toBe(0);

      const blockY = createBlock('move_by', { dx: 0, dy: -12 });
      const compiledY = compileBlocksToJS([blockY]);
      expect(compiledY).toBe('this.y += -12;');
      const parsedY = parseJSIntoBlocks(compiledY);
      expect(parsedY).toHaveLength(1);
      expect(parsedY[0].params.dx).toBe(0);
      expect(parsedY[0].params.dy).toBe(-12);
    });

    it('round-trips rotate_by block', () => {
      const block = createBlock('rotate_by', { degrees: 45 });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe('this.rotation += 45;');

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('rotate_by');
      expect(parsed[0].params.degrees).toBe(45);
    });

    it('round-trips custom_js block', () => {
      const block = createBlock('custom_js', { code: 'myGlobalSoundEffect.play();' });
      const compiled = compileBlocksToJS([block]);
      expect(compiled).toBe('myGlobalSoundEffect.play();');

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('custom_js');
      expect(parsed[0].params.code).toBe('myGlobalSoundEffect.play();');
    });

    it('round-trips multi-block script pipeline', () => {
      const stack = [
        createBlock('alert', { message: 'First Step' }),
        createBlock('move_by', { dx: 10, dy: 20 }),
        createBlock('stop'),
        createBlock('custom_js', { code: 'doSpecialAnimation();' }),
      ];

      const compiled = compileBlocksToJS(stack);
      expect(compiled).toBe(
        "alert('First Step');\nthis.x += 10;\nthis.y += 20;\nthis.stop();\ndoSpecialAnimation();"
      );

      const parsed = parseJSIntoBlocks(compiled);
      expect(parsed).toHaveLength(4);
      expect(parsed.map((b) => b.type)).toEqual(['alert', 'move_by', 'stop', 'custom_js']);
    });
  });

  /* ========================================================================= *
   * Requirement 2: Visual Block Palette & Canvas Interactions
   * ========================================================================= */
  describe('Scripts panel palette clicking, param editing, reordering & deletion', () => {
    it('allows clicking block cards in palette, editing inline params, and auto-persisting', () => {
      editorActions.newDocument();
      const doc = getEditorState().doc;
      const layer = doc.root.layers[0];
      const kf = layer.keyframes[0];

      const shapeId = 'shape_test_btn';
      const shape: ShapeElement = {
        id: shapeId,
        type: 'shape',
        paths: [{ d: 'M 0 0 L 50 50 Z', fill: { type: 'solid', color: '#ffcc00' } }],
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
        alpha: 1,
        visible: true,
      };
      kf.elements.push(shape);
      editorActions.selectElement(shapeId);

      const root = createRoot(container);
      act(() => {
        root.render(<Scripts />);
      });

      // Target badge shows Shape
      expect(container.textContent).toContain('Target: ⬡');
      expect(container.textContent).toContain('Shape');

      // 1. Click Alert block card in the palette
      const alertPaletteBtn = container.querySelector(
        'button[data-block-type="alert"]'
      ) as HTMLButtonElement;
      expect(alertPaletteBtn).not.toBeNull();

      act(() => {
        alertPaletteBtn.click();
      });

      // Check document was immediately auto-saved with default alert block
      let currentDoc = getEditorState().doc;
      let currentLayer = currentDoc.root.layers[0];
      let currentKf = findKeyframeAt(currentLayer, 0);
      let savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick).toEqual({ __fn: "alert('Hello!');" });

      // 2. Edit Alert message inline to 'Keyframe Reached!'
      const alertParamInput = container.querySelector(
        'input[placeholder="Message to display"]'
      ) as HTMLInputElement;
      expect(alertParamInput).not.toBeNull();

      act(() => {
        const inputSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        inputSetter?.call(alertParamInput, 'Keyframe Reached!');
        alertParamInput.dispatchEvent(new Event('input', { bubbles: true }));
        alertParamInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      currentDoc = getEditorState().doc;
      currentLayer = currentDoc.root.layers[0];
      currentKf = findKeyframeAt(currentLayer, 0);
      savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick).toEqual({ __fn: "alert('Keyframe Reached!');" });

      // 3. Click Stop block card in palette
      const stopPaletteBtn = container.querySelector(
        'button[data-block-type="stop"]'
      ) as HTMLButtonElement;
      expect(stopPaletteBtn).not.toBeNull();

      act(() => {
        stopPaletteBtn.click();
      });

      currentDoc = getEditorState().doc;
      currentLayer = currentDoc.root.layers[0];
      currentKf = findKeyframeAt(currentLayer, 0);
      savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick?.__fn).toBe("alert('Keyframe Reached!');\nthis.stop();");

      // 4. Click "+ Custom JS Block" button
      const customJsBtn = container.querySelector('button[title*="custom JavaScript"]') as HTMLButtonElement;
      expect(customJsBtn).not.toBeNull();

      act(() => {
        customJsBtn.click();
      });

      // Find the custom JS input in the stack
      const customInputs = container.querySelectorAll('input[placeholder="// JavaScript statement"]');
      expect(customInputs.length).toBeGreaterThan(0);
      const customInput = customInputs[customInputs.length - 1] as HTMLInputElement;

      act(() => {
        const inputSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        inputSetter?.call(customInput, 'console.log("Custom Ran");');
        customInput.dispatchEvent(new Event('input', { bubbles: true }));
        customInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      currentDoc = getEditorState().doc;
      currentLayer = currentDoc.root.layers[0];
      currentKf = findKeyframeAt(currentLayer, 0);
      savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick?.__fn).toBe(
        "alert('Keyframe Reached!');\nthis.stop();\nconsole.log(\"Custom Ran\");"
      );

      // 5. Reorder blocks: Move "Stop Timeline" up so it comes before alert
      // The second block in the stack has index 1, its Move Up button is title="Move Up"
      const moveUpBtns = container.querySelectorAll('button[title="Move Up"]');
      expect(moveUpBtns.length).toBeGreaterThanOrEqual(2);
      const secondBlockMoveUp = moveUpBtns[1] as HTMLButtonElement;

      act(() => {
        secondBlockMoveUp.click();
      });

      currentDoc = getEditorState().doc;
      currentLayer = currentDoc.root.layers[0];
      currentKf = findKeyframeAt(currentLayer, 0);
      savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick?.__fn).toBe(
        "this.stop();\nalert('Keyframe Reached!');\nconsole.log(\"Custom Ran\");"
      );

      // 6. Delete the first block ("this.stop();")
      const deleteBtns = container.querySelectorAll('button[title="Delete Block"]');
      expect(deleteBtns.length).toBe(3);
      const firstDeleteBtn = deleteBtns[0] as HTMLButtonElement;

      act(() => {
        firstDeleteBtn.click();
      });

      currentDoc = getEditorState().doc;
      currentLayer = currentDoc.root.layers[0];
      currentKf = findKeyframeAt(currentLayer, 0);
      savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick?.__fn).toBe(
        "alert('Keyframe Reached!');\nconsole.log(\"Custom Ran\");"
      );

      act(() => {
        root.unmount();
      });
    });
  });

  /* ========================================================================= *
   * Requirement 3: Keyframe Trigger Option ('__keyframe__')
   * ========================================================================= */
  describe('Keyframe trigger selector and persistence', () => {
    it('switches trigger to __keyframe__ while an element is selected and binds to kf.actions', () => {
      editorActions.newDocument();
      const doc = getEditorState().doc;
      const layer = doc.root.layers[0];
      const kf = layer.keyframes[0];

      const shapeId = 'shape_with_kf_action';
      const shape: ShapeElement = {
        id: shapeId,
        type: 'shape',
        paths: [{ d: 'M 0 0 L 10 10 Z', fill: { type: 'solid', color: '#00ffff' } }],
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
        alpha: 1,
        visible: true,
      };
      kf.elements.push(shape);
      editorActions.selectElement(shapeId);

      const root = createRoot(container);
      act(() => {
        root.render(<Scripts />);
      });

      // 1. Initial trigger is onClick on the element
      const triggerSelect = container.querySelector('select') as HTMLSelectElement;
      expect(triggerSelect).not.toBeNull();
      expect(triggerSelect.value).toBe('onClick');

      // 2. Select "__keyframe__" in the trigger dropdown
      act(() => {
        const selectSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value'
        )?.set;
        selectSetter?.call(triggerSelect, '__keyframe__');
        triggerSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Target badge switches to Keyframe / Frame 1
      expect(container.textContent).toContain('Frame 1');

      // Hat block in Center column switches to Keyframe
      expect(container.textContent).toContain('When Playhead Enters Keyframe');

      // 3. Add an Alert block from palette
      const alertPaletteBtn = container.querySelector(
        'button[data-block-type="alert"]'
      ) as HTMLButtonElement;
      expect(alertPaletteBtn).not.toBeNull();

      act(() => {
        alertPaletteBtn.click();
      });

      // 4. Edit Alert message inline to 'Frame Action Triggered'
      const alertParamInput = container.querySelector(
        'input[placeholder="Message to display"]'
      ) as HTMLInputElement;
      expect(alertParamInput).not.toBeNull();

      act(() => {
        const inputSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        inputSetter?.call(alertParamInput, 'Frame Action Triggered');
        alertParamInput.dispatchEvent(new Event('input', { bubbles: true }));
        alertParamInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Verify kf.actions.__fn is saved on the KEYFRAME!
      const currentDoc = getEditorState().doc;
      const currentLayer = currentDoc.root.layers[0];
      const currentKf = findKeyframeAt(currentLayer, 0);
      expect((currentKf?.actions as any)?.__fn).toBe("alert('Frame Action Triggered');");

      // Verify the element's event script was NOT modified by the keyframe action
      const savedShape = currentKf?.elements.find((e) => e.id === shapeId);
      expect(savedShape?.events?.onClick).toBeUndefined();

      // 5. Switch back to onClick and add a script to the element
      act(() => {
        const selectSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value'
        )?.set;
        selectSetter?.call(triggerSelect, 'onClick');
        triggerSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const stopPaletteBtn = container.querySelector(
        'button[data-block-type="stop"]'
      ) as HTMLButtonElement;
      act(() => {
        stopPaletteBtn.click();
      });

      // Both scripts exist in harmony:
      const updatedDoc = getEditorState().doc;
      const updatedLayer = updatedDoc.root.layers[0];
      const updatedKf = findKeyframeAt(updatedLayer, 0);
      const updatedShape = updatedKf?.elements.find((e) => e.id === shapeId);

      // Keyframe script still preserved:
      expect((updatedKf?.actions as any)?.__fn).toBe("alert('Frame Action Triggered');");
      // Element onClick script saved:
      expect(updatedShape?.events?.onClick?.__fn).toBe('this.stop();');

      act(() => {
        root.unmount();
      });
    });

    it('opens keyframe script via openKeyframeScript and executes keyframe actions when crossing keyframe time', () => {
      editorActions.newDocument();
      const layerId = getEditorState().doc.root.layers[0].id;

      // Insert a second keyframe at 1.0s (frame 24)
      editorActions.insertKeyframe(layerId, 1.0);
      editorActions.updateKeyframeScript(
        layerId,
        24,
        "alert('Triggered at 1s!');\nthis.stop();"
      );

      // Open keyframe script via Timeline context menu / badge action
      editorActions.openKeyframeScript(layerId, 24);
      expect(getEditorState().activeInspectorTab).toBe('scripts');
      expect(getEditorState().scriptTriggerFocus).toBe('keyframe');
      expect(getEditorState().currentFrame).toBe(24);

      const alertSpy = vi.fn();
      (globalThis as any).window.alert = alertSpy;

      // Playhead crosses from 0.8s to 1.1s while playing
      editorActions.setPlaying(true);
      editorActions.executeKeyframeScriptsInRange(0.8, 1.1, false);

      expect(alertSpy).toHaveBeenCalledWith('Triggered at 1s!');
      expect(getEditorState().isPlaying).toBe(false);

      // When liveKeyframeScriptsEnabled is muted, script does not fire
      alertSpy.mockClear();
      editorActions.setLiveKeyframeScriptsEnabled(false);
      editorActions.executeKeyframeScriptsInRange(0.8, 1.1, false);
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});
