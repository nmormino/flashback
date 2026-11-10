import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TextElement } from '@flashback/runtime';
import {
  editorActions,
  getEditorState,
  getActiveTimeline,
} from '../src/state/editorStore';
import { StateVariables } from '../src/panels/StateVariables/StateVariables';
import { Properties } from '../src/panels/Properties/Properties';
import { Scripts } from '../src/panels/Scripts/Scripts';
import { MenuBar } from '../src/layout/MenuBar';
import {
  compileBlocksToJS,
  parseJSIntoBlocks,
  createBlock,
} from '../src/panels/Scripts/scriptBlocks';

const createSampleText = (id: string, text: string): TextElement => ({
  id,
  type: 'text',
  mode: 'static',
  text,
  fontId: 'default',
  fontSize: 20,
  color: '#ffffff',
  align: 'left',
  width: 140,
  height: 28,
  multiline: false,
  selectable: true,
  transform: {
    x: 100,
    y: 200,
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
});

describe('Editor State & Variables, Custom Events, and Script Blocks', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    editorActions.newDocument();
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

  describe('Store Actions', () => {
    it('manages state variables lifecycle and initial document state', () => {
      expect(getEditorState().doc.stateVariables).toBeUndefined();

      // Add a number variable
      editorActions.addStateVariable({
        name: 'score',
        type: 'number',
        defaultValue: 100,
        isPublic: true,
      });

      let state = getEditorState();
      expect(state.doc.stateVariables).toHaveLength(1);
      expect(state.doc.stateVariables![0].name).toBe('score');
      expect(state.doc.stateVariables![0].type).toBe('number');
      expect(state.doc.stateVariables![0].defaultValue).toBe(100);
      expect(state.doc.stateVariables![0].isPublic).toBe(true);
      expect(state.doc.state?.score).toBe(100);

      // Add a string variable
      editorActions.addStateVariable({
        name: 'playerName',
        type: 'string',
        defaultValue: 'Player 1',
        isPublic: false,
      });

      state = getEditorState();
      expect(state.doc.stateVariables).toHaveLength(2);
      expect(state.doc.state?.playerName).toBe('Player 1');

      // Update variable
      const scoreId = state.doc.stateVariables![0].id;
      editorActions.updateStateVariable(scoreId, {
        defaultValue: 250,
      });

      state = getEditorState();
      expect(state.doc.stateVariables![0].defaultValue).toBe(250);
      expect(state.doc.state?.score).toBe(250);

      // Delete variable
      editorActions.deleteStateVariable(scoreId);
      state = getEditorState();
      expect(state.doc.stateVariables).toHaveLength(1);
      expect(state.doc.stateVariables![0].name).toBe('playerName');
      expect(state.doc.state?.score).toBeUndefined();
    });

    it('binds text elements to state variables via setTextStateBinding', () => {
      const textEl = createSampleText('txt_test_1', 'Hello World');
      editorActions.addElement(textEl);

      editorActions.setTextStateBinding(textEl.id, 'score');

      const tl = getActiveTimeline(getEditorState().doc);
      const updatedTextEl = tl.layers[0].keyframes[0].elements.find((e) => e.id === textEl.id) as any;
      expect(updatedTextEl.stateBinding).toBe('score');
      expect(updatedTextEl.variable).toBe('score');

      // Unbind
      editorActions.setTextStateBinding(textEl.id, null);
      const tl2 = getActiveTimeline(getEditorState().doc);
      const unbindTextEl = tl2.layers[0].keyframes[0].elements.find((e) => e.id === textEl.id) as any;
      expect(unbindTextEl.stateBinding).toBeUndefined();
    });

    it('toggles State & Variables floating panel state', () => {
      expect(getEditorState().isStateVariablesOpen).toBe(false);

      editorActions.toggleStateVariables();
      expect(getEditorState().isStateVariablesOpen).toBe(true);

      editorActions.setStateVariablesOpen(false);
      expect(getEditorState().isStateVariablesOpen).toBe(false);
    });
  });

  describe('MenuBar Window Integration', () => {
    it('renders State & Variables Window menu item in MenuBar', async () => {
      await act(async () => {
        root.render(<MenuBar />);
      });

      // Open hamburger menu button
      const menuBtn = container.querySelector('[title="Menu & Settings"]') as HTMLButtonElement;
      expect(menuBtn).not.toBeNull();

      await act(async () => {
        menuBtn.click();
      });

      const menuItems = Array.from(container.querySelectorAll('button'));
      const stateVarItem = menuItems.find((el) => el.textContent?.includes('State & Variables Window'));
      expect(stateVarItem).toBeDefined();

      await act(async () => {
        stateVarItem!.click();
      });

      expect(getEditorState().isStateVariablesOpen).toBe(true);
    });
  });

  describe('StateVariables UI Panel', () => {
    it('allows adding and managing variables from the floating panel', async () => {
      editorActions.setStateVariablesOpen(true);
      await act(async () => {
        root.render(<StateVariables />);
      });

      // Click "New Variable" button to reveal form
      const toggleBtn = container.querySelector('[data-testid="toggle-add-variable-btn"]') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();

      await act(async () => {
        toggleBtn.click();
      });

      // Find Name input and add button
      const nameInput = container.querySelector('input[placeholder*="Variable name"]') as HTMLInputElement;
      expect(nameInput).not.toBeNull();

      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).not.toBeNull();

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeSetter?.call(nameInput, 'levelNumber');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(getEditorState().doc.stateVariables).toHaveLength(1);
      expect(getEditorState().doc.stateVariables![0].name).toBe('levelNumber');

      // Toggle code snippet drawer
      const codeBtn = container.querySelector('[data-testid="toggle-code-snippets-btn"]') as HTMLButtonElement;
      expect(codeBtn).not.toBeNull();

      await act(async () => {
        codeBtn.click();
      });

      expect(container.textContent).toContain('this.state.score');
    });
  });

  describe('Properties Panel Text Binding', () => {
    it('displays Variable & State Binding section for selected Text element', async () => {
      editorActions.addStateVariable({
        name: 'score',
        type: 'number',
        defaultValue: 0,
        isPublic: true,
      });

      // Add text element and select it
      const textEl = createSampleText('txt_test_props', 'Score: 0');
      editorActions.addElement(textEl);
      editorActions.selectElements([textEl.id]);

      await act(async () => {
        root.render(<Properties />);
      });

      // Find the binding select dropdown
      const bindingSelect = container.querySelector('[data-testid="text-state-binding-select"]') as HTMLSelectElement;
      expect(bindingSelect).not.toBeNull();

      await act(async () => {
        bindingSelect.value = 'score';
        bindingSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const tl = getActiveTimeline(getEditorState().doc);
      const updatedTextEl = tl.layers[0].keyframes[0].elements.find((e) => e.id === textEl.id) as any;
      expect(updatedTextEl.stateBinding).toBe('score');
    });
  });

  describe('Scratch Visual Scripting Blocks', () => {
    it('compiles state variable blocks to JavaScript', () => {
      const setBlock = createBlock('set_state_var', { variable: 'score', value: '100' });
      const changeBlock = createBlock('change_state_var', { variable: 'score', delta: 5 });

      const js = compileBlocksToJS([setBlock, changeBlock]);
      expect(js).toContain('this.state.score = 100;');
      expect(js).toContain('this.state.score += 5;');
    });

    it('compiles custom event broadcast and listener blocks to JavaScript', () => {
      const emitBlock = createBlock('emit_custom_event', { event: 'level_cleared', payload: '{ bonus: 50 }' });
      const onBlock = createBlock('on_custom_event', { event: 'level_cleared', action: 'this.play();' });

      const js = compileBlocksToJS([emitBlock, onBlock]);
      expect(js).toContain("this.emit('level_cleared', { bonus: 50 });");
      expect(js).toContain("this.on('level_cleared', () => {\n  this.play();\n});");
    });

    it('compiles clip spawning and particle generator blocks to JavaScript', () => {
      const spawnBlock = createBlock('spawn_clip', { clipName: 'Fly', x: 120, y: 80 });
      const particleBlock = createBlock('emit_particles', { preset: 'splat', x: 120, y: 80, particleCount: 30 });

      const js = compileBlocksToJS([spawnBlock, particleBlock]);
      expect(js).toContain("this.spawnClip('Fly', { x: 120, y: 80 });");
      expect(js).toContain("this.emitParticles({ preset: 'splat', x: 120, y: 80, particleCount: 30 });");
    });

    it('parses JavaScript statements back into interactive block objects', () => {
      const code = `
        this.state.score = 50;
        this.state.score += 10;
        this.emit('score_updated');
        this.on('swat_bug', () => {
          this.gotoAndStop(2);
        });
        this.spawnClip('Bug', { x: 50, y: 50 });
        this.emitParticles({ preset: 'splat', x: 50, y: 50, particleCount: 40 });
      `;

      const blocks = parseJSIntoBlocks(code);
      expect(blocks).toHaveLength(6);
      expect(blocks[0].type).toBe('set_state_var');
      expect(blocks[0].params.variable).toBe('score');
      expect(blocks[0].params.value).toBe('50');

      expect(blocks[1].type).toBe('change_state_var');
      expect(blocks[1].params.variable).toBe('score');
      expect(blocks[1].params.delta).toBe(10);

      expect(blocks[2].type).toBe('emit_custom_event');
      expect(blocks[2].params.event).toBe('score_updated');

      expect(blocks[3].type).toBe('on_custom_event');
      expect(blocks[3].params.event).toBe('swat_bug');
      expect(blocks[3].params.action).toContain('this.gotoAndStop(2);');

      expect(blocks[4].type).toBe('spawn_clip');
      expect(blocks[4].params.clipName).toBe('Bug');
      expect(blocks[4].params.x).toBe(50);
      expect(blocks[4].params.y).toBe(50);

      expect(blocks[5].type).toBe('emit_particles');
      expect(blocks[5].params.preset).toBe('splat');
      expect(blocks[5].params.particleCount).toBe(40);
    });

    it('compiles control flow blocks (if, if/else, switch, foreach, repeat, while, do/while) to JavaScript', () => {
      const ifBlock = createBlock('if_condition', {
        condition: 'this.state.score >= 100',
        thenAction: "this.gotoAndPlay('win');",
      });
      const ifElseBlock = createBlock('if_else', {
        condition: 'this.state.lives > 0',
        thenAction: 'this.play();',
        elseAction: "this.gotoAndStop('gameover');",
      });
      const switchBlock = createBlock('switch_case', {
        expression: 'this.state.level',
        case1: '1',
        action1: 'this.play();',
        defaultAction: 'this.stop();',
      });
      const forEachBlock = createBlock('for_each', {
        item: 'fly',
        array: 'this.flies',
        body: 'fly.x += 5;',
      });
      const repeatBlock = createBlock('repeat_times', {
        times: 3,
        indexVar: 'i',
        body: "this.spawnClip('Fly', { x: i * 30, y: 100 });",
      });
      const whileBlock = createBlock('while_loop', {
        condition: 'this.x < 200',
        body: 'this.x += 10;',
      });
      const doWhileBlock = createBlock('do_while', {
        condition: 'this.y < 150',
        body: 'this.y += 5;',
      });

      const js = compileBlocksToJS([
        ifBlock,
        ifElseBlock,
        switchBlock,
        forEachBlock,
        repeatBlock,
        whileBlock,
        doWhileBlock,
      ]);

      expect(js).toContain("if (this.state.score >= 100) {\n  this.gotoAndPlay('win');\n}");
      expect(js).toContain("if (this.state.lives > 0) {\n  this.play();\n} else {\n  this.gotoAndStop('gameover');\n}");
      expect(js).toContain('switch (this.state.level) {');
      expect(js).toContain('for (const fly of this.flies) {\n  fly.x += 5;\n}');
      expect(js).toContain("for (let i = 0; i < 3; i++) {\n  this.spawnClip('Fly', { x: i * 30, y: 100 });\n}");
      expect(js).toContain('while (this.x < 200) {\n  this.x += 10;\n}');
      expect(js).toContain('do {\n  this.y += 5;\n} while (this.y < 150);');
    });

    it('parses control flow statements back into visual blocks', () => {
      const code = `
        if (this.state.score >= 50) {
          this.play();
        } else {
          this.stop();
        }
        if (this.state.lives <= 0) {
          this.gotoAndStop(10);
        }
        for (const fly of swarm) {
          fly.alpha = 0.5;
        }
        for (let i = 0; i < 4; i++) {
          this.x += 10;
        }
        while (this.alpha < 1) {
          this.alpha += 0.1;
        }
        do {
          this.rotation += 5;
        } while (this.rotation < 180);
      `;

      const blocks = parseJSIntoBlocks(code);
      expect(blocks).toHaveLength(6);
      expect(blocks[0].type).toBe('if_else');
      expect(blocks[0].params.condition).toBe('this.state.score >= 50');
      expect(blocks[0].params.thenAction).toBe('this.play();');
      expect(blocks[0].params.elseAction).toBe('this.stop();');

      expect(blocks[1].type).toBe('if_condition');
      expect(blocks[1].params.condition).toBe('this.state.lives <= 0');
      expect(blocks[1].params.thenAction).toBe('this.gotoAndStop(10);');

      expect(blocks[2].type).toBe('for_each');
      expect(blocks[2].params.item).toBe('fly');
      expect(blocks[2].params.array).toBe('swarm');
      expect(blocks[2].params.body).toBe('fly.alpha = 0.5;');

      expect(blocks[3].type).toBe('repeat_times');
      expect(blocks[3].params.indexVar).toBe('i');
      expect(blocks[3].params.times).toBe(4);

      expect(blocks[4].type).toBe('while_loop');
      expect(blocks[4].params.condition).toBe('this.alpha < 1');

      expect(blocks[5].type).toBe('do_while');
      expect(blocks[5].params.condition).toBe('this.rotation < 180');
    });
  });

  describe('Scripts Panel UI (Variables View & Code Toggle)', () => {
    it('displays State & Variables section in Scripts palette and inserts quick variable blocks', async () => {
      editorActions.addStateVariable({
        name: 'score',
        type: 'number',
        defaultValue: 10,
        isPublic: true,
      });

      await act(async () => {
        root.render(<Scripts />);
      });

      const varSection = container.querySelector('[data-testid="scripts-variables-section"]');
      expect(varSection).not.toBeNull();
      expect(varSection?.textContent).toContain('score');
      expect(varSection?.textContent).toContain('= 10');

      // Click "+1" quick action pill
      const plusOneBtn = Array.from(varSection!.querySelectorAll('button')).find(
        (b) => b.textContent === '+1'
      );
      expect(plusOneBtn).toBeDefined();

      await act(async () => {
        plusOneBtn!.click();
      });

      // Verify that a block was added into the block stack
      expect(container.textContent).toContain('Change:');
    });

    it('hides code view by default and toggles view via </> button', async () => {
      await act(async () => {
        root.render(<Scripts />);
      });

      // Code view column must be hidden by default
      expect(container.querySelector('[data-testid="scripts-code-column"]')).toBeNull();

      // Find </> toggle button
      const toggleBtn = container.querySelector('[data-testid="toggle-code-view-btn"]') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
      expect(toggleBtn.textContent).toContain('</>');
      expect(toggleBtn.textContent).toContain('View Code');

      // Click to open code view
      await act(async () => {
        toggleBtn.click();
      });

      expect(container.querySelector('[data-testid="scripts-code-column"]')).not.toBeNull();
      expect(toggleBtn.textContent).toContain('Hide Code');

      // Click to hide again
      await act(async () => {
        toggleBtn.click();
      });

      expect(container.querySelector('[data-testid="scripts-code-column"]')).toBeNull();
    });
  });
});
