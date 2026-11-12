import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  editorActions,
  getEditorState,
} from '../src/state/editorStore';
import { StateMachinePanel } from '../src/panels/StateMachine/StateMachinePanel';
import { Workspace } from '../src/layout/Workspace';

describe('Phase 2.4 - Feature 3: Visual State Graph Editor', () => {
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

  /* =========================================================================
   * 1. Store Actions Unit Tests
   * ========================================================================= */
  describe('EditorStore State Machine Actions', () => {
    it('creates default state machine with Entry node, Idle clip node, and transition', () => {
      expect(getEditorState().doc.stateMachines).toBeUndefined();

      const sm = editorActions.addStateMachine('Character Controller');
      const doc = getEditorState().doc;

      expect(doc.stateMachines).toHaveLength(1);
      expect(doc.activeStateMachineId).toBe(sm.id);
      expect(sm.name).toBe('Character Controller');
      expect(sm.inputs).toEqual([]);
      expect(sm.states).toHaveLength(2);

      const entryNode = sm.states.find((s) => s.type === 'entry');
      const idleNode = sm.states.find((s) => s.name === 'Idle');
      expect(entryNode).toBeDefined();
      expect(idleNode).toBeDefined();
      expect(idleNode?.clipName).toBe('idle');
      expect(idleNode?.loop).toBe(true);

      expect(sm.transitions).toHaveLength(1);
      expect(sm.transitions[0].fromStateId).toBe(entryNode!.id);
      expect(sm.transitions[0].toStateId).toBe(idleNode!.id);
      expect(sm.listeners).toEqual([]);
    });

    it('switches active state machine and manages multiple state machines', () => {
      const sm1 = editorActions.addStateMachine('SM 1');
      const sm2 = editorActions.addStateMachine('SM 2');

      expect(getEditorState().doc.activeStateMachineId).toBe(sm2.id);

      editorActions.setActiveStateMachine(sm1.id);
      expect(getEditorState().doc.activeStateMachineId).toBe(sm1.id);
    });

    it('adds, updates, and deletes Boolean, Number, and Trigger inputs with cascading cleanup', () => {
      const sm = editorActions.addStateMachine('Test SM');

      // Add inputs
      editorActions.addStateMachineInput(sm.id, {
        name: 'isGrounded',
        type: 'boolean',
        value: true,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'speed',
        type: 'number',
        value: 5.5,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'jumpTrigger',
        type: 'trigger',
        value: false,
      });

      let updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.inputs).toHaveLength(3);
      expect(updatedSm.inputs[0].name).toBe('isGrounded');
      expect(updatedSm.inputs[0].type).toBe('boolean');
      expect(updatedSm.inputs[0].value).toBe(true);
      expect(updatedSm.inputs[1].name).toBe('speed');
      expect(updatedSm.inputs[1].type).toBe('number');
      expect(updatedSm.inputs[1].value).toBe(5.5);
      expect(updatedSm.inputs[2].name).toBe('jumpTrigger');
      expect(updatedSm.inputs[2].type).toBe('trigger');

      // Update input
      const speedId = updatedSm.inputs[1].id;
      editorActions.updateStateMachineInput(sm.id, speedId, {
        name: 'velocity',
        value: 12.0,
      });
      updatedSm = getEditorState().doc.stateMachines![0];
      const speedInp = updatedSm.inputs.find((i) => i.id === speedId);
      expect(speedInp?.name).toBe('velocity');
      expect(speedInp?.value).toBe(12.0);

      // Add a transition referencing speedId to test cascading cleanup
      const idleNode = updatedSm.states[1];
      const entryNode = updatedSm.states[0];
      editorActions.addStateTransition(sm.id, {
        fromStateId: entryNode.id,
        toStateId: idleNode.id,
        conditions: [{ inputId: speedId, op: '>', value: 10 }],
      });

      // Add a listener action referencing speedId
      editorActions.addStateListener(sm.id, {
        eventType: 'click',
        actions: [{ type: 'set_input', inputId: speedId, value: 0 }],
      });

      // Delete input
      editorActions.deleteStateMachineInput(sm.id, speedId);
      updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.inputs.find((i) => i.id === speedId)).toBeUndefined();
      // Verify condition referencing speedId was removed
      expect(
        updatedSm.transitions.some((t) => t.conditions.some((c) => c.inputId === speedId))
      ).toBe(false);
      // Verify listener action referencing speedId was removed
      expect(
        updatedSm.listeners.some((l) => l.actions.some((a) => a.inputId === speedId))
      ).toBe(false);
    });

    it('adds, updates, and deletes State Nodes with cascading transition removal', () => {
      const sm = editorActions.addStateMachine('Graph SM');
      const idleNode = sm.states.find((s) => s.name === 'Idle')!;

      // Add Run node
      editorActions.addStateNode(sm.id, {
        name: 'Run',
        type: 'clip',
        clipName: 'run_cycle',
        x: 450,
        y: 120,
      });

      let updatedSm = getEditorState().doc.stateMachines![0];
      const runNode = updatedSm.states.find((s) => s.name === 'Run');
      expect(runNode).toBeDefined();
      expect(runNode?.clipName).toBe('run_cycle');
      expect(runNode?.x).toBe(450);

      // Connect transition from Idle to Run
      editorActions.addStateTransition(sm.id, {
        fromStateId: idleNode.id,
        toStateId: runNode!.id,
        durationMs: 200,
        conditions: [],
      });

      updatedSm = getEditorState().doc.stateMachines![0];
      expect(
        updatedSm.transitions.some(
          (t) => t.fromStateId === idleNode.id && t.toStateId === runNode!.id
        )
      ).toBe(true);

      // Update Run node
      editorActions.updateStateNode(sm.id, runNode!.id, {
        name: 'Sprint',
        speed: 1.5,
      });
      updatedSm = getEditorState().doc.stateMachines![0];
      const sprintNode = updatedSm.states.find((s) => s.id === runNode!.id);
      expect(sprintNode?.name).toBe('Sprint');
      expect(sprintNode?.speed).toBe(1.5);

      // Delete Run node and verify connected transition is removed
      editorActions.deleteStateNode(sm.id, runNode!.id);
      updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.states.find((s) => s.id === runNode!.id)).toBeUndefined();
      expect(
        updatedSm.transitions.some(
          (t) => t.fromStateId === runNode!.id || t.toStateId === runNode!.id
        )
      ).toBe(false);
    });

    it('adds, updates, and deletes Transitions with condition guards', () => {
      const sm = editorActions.addStateMachine('Transition SM');
      const entryNode = sm.states[0];
      const idleNode = sm.states[1];

      editorActions.addStateMachineInput(sm.id, {
        name: 'isAlive',
        type: 'boolean',
        value: true,
      });
      const inputId = getEditorState().doc.stateMachines![0].inputs[0].id;

      // Add a transition
      editorActions.addStateTransition(sm.id, {
        fromStateId: idleNode.id,
        toStateId: entryNode.id,
        durationMs: 300,
        conditions: [{ inputId, op: '==', value: false }],
      });

      let updatedSm = getEditorState().doc.stateMachines![0];
      const newTr = updatedSm.transitions.find(
        (t) => t.fromStateId === idleNode.id && t.toStateId === entryNode.id
      );
      expect(newTr).toBeDefined();
      expect(newTr?.durationMs).toBe(300);
      expect(newTr?.conditions).toHaveLength(1);
      expect(newTr?.conditions[0].op).toBe('==');
      expect(newTr?.conditions[0].value).toBe(false);

      // Update transition duration and conditions
      editorActions.updateStateTransition(sm.id, newTr!.id, {
        durationMs: 500,
        conditions: [{ inputId, op: '!=', value: true }],
      });
      updatedSm = getEditorState().doc.stateMachines![0];
      const modifiedTr = updatedSm.transitions.find((t) => t.id === newTr!.id);
      expect(modifiedTr?.durationMs).toBe(500);
      expect(modifiedTr?.conditions[0].op).toBe('!=');

      // Delete transition
      editorActions.deleteStateTransition(sm.id, newTr!.id);
      updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.transitions.find((t) => t.id === newTr!.id)).toBeUndefined();
    });

    it('adds, updates, and deletes Game Listeners with multiple action triggers', () => {
      const sm = editorActions.addStateMachine('Listener SM');
      editorActions.addStateMachineInput(sm.id, {
        name: 'triggerJump',
        type: 'trigger',
        value: false,
      });
      const trigId = getEditorState().doc.stateMachines![0].inputs[0].id;

      // Add collision listener
      editorActions.addStateListener(sm.id, {
        eventType: 'collision',
        targetElementId: 'player',
        collisionWithElementId: 'coin_5',
        actions: [
          {
            type: 'fire_trigger',
            inputId: trigId,
          },
        ],
      });

      // Add keydown listener
      editorActions.addStateListener(sm.id, {
        eventType: 'keydown',
        keyCode: 'Space',
        actions: [
          {
            type: 'fire_trigger',
            inputId: trigId,
          },
        ],
      });

      // Add click listener
      editorActions.addStateListener(sm.id, {
        eventType: 'click',
        targetElementId: 'btn_attack',
        actions: [
          {
            type: 'spawn_clip',
            symbolId: 'slash_fx',
            x: 100,
            y: 50,
          },
        ],
      });

      let updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.listeners).toHaveLength(3);

      const collisionLis = updatedSm.listeners.find((l) => l.eventType === 'collision');
      expect(collisionLis?.collisionWithElementId).toBe('coin_5');
      expect(collisionLis?.actions[0].type).toBe('fire_trigger');

      const keyLis = updatedSm.listeners.find((l) => l.eventType === 'keydown');
      expect(keyLis?.keyCode).toBe('Space');

      const clickLis = updatedSm.listeners.find((l) => l.eventType === 'click');
      expect(clickLis?.targetElementId).toBe('btn_attack');
      expect(clickLis?.actions[0].symbolId).toBe('slash_fx');

      // Update listener
      editorActions.updateStateListener(sm.id, keyLis!.id, {
        keyCode: 'ArrowUp',
      });
      updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.listeners.find((l) => l.id === keyLis!.id)?.keyCode).toBe('ArrowUp');

      // Delete listener
      editorActions.deleteStateListener(sm.id, collisionLis!.id);
      updatedSm = getEditorState().doc.stateMachines![0];
      expect(updatedSm.listeners).toHaveLength(2);
      expect(updatedSm.listeners.find((l) => l.id === collisionLis!.id)).toBeUndefined();
    });

    it('setActiveInspectorTab accepts statemachine and switches correctly', () => {
      editorActions.setActiveInspectorTab('statemachine');
      expect(getEditorState().activeInspectorTab).toBe('statemachine');

      editorActions.setActiveInspectorTab('timeline');
      expect(getEditorState().activeInspectorTab).toBe('timeline');

      editorActions.setActiveInspectorTab('scripts');
      expect(getEditorState().activeInspectorTab).toBe('scripts');

      editorActions.setActiveInspectorTab('properties');
      expect(getEditorState().activeInspectorTab).toBe('properties');
    });
  });

  /* =========================================================================
   * 2. StateMachinePanel Component Tests
   * ========================================================================= */
  describe('StateMachinePanel Component Rendering and Interactions', () => {
    it('renders empty setup state and creates state machine on button click', async () => {
      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      expect(container.textContent).toContain('No State Machine Defined');
      expect(container.textContent).toContain('Create State Machine');

      const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create State Machine')
      );
      expect(createBtn).toBeTruthy();

      await act(async () => {
        createBtn!.click();
      });

      // Panel now renders 3 columns
      expect(container.textContent).toContain('Inputs');
      expect(container.textContent).toContain('Entry');
      expect(container.textContent).toContain('Idle');
      expect(container.textContent).toContain('Selection Inspector');
    });

    it('renders 3 columns with inputs list, visual state graph, and selection inspector', async () => {
      const sm = editorActions.addStateMachine('Interactive Graph');
      editorActions.addStateMachineInput(sm.id, {
        name: 'isRunning',
        type: 'boolean',
        value: true,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'stamina',
        type: 'number',
        value: 100,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'punchTrigger',
        type: 'trigger',
        value: false,
      });

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      // Left Column: Inputs List
      expect(container.textContent).toContain('isRunning');
      expect(container.textContent).toContain('stamina');
      expect(container.textContent).toContain('punchTrigger');
      expect(container.querySelector('button[title*="Add Boolean"]')).toBeTruthy();

      // Center Column: Visual State Graph
      expect(container.querySelector('svg')).toBeTruthy();
      expect(container.textContent).toContain('Entry');
      expect(container.textContent).toContain('Idle');

      // Right Column: Inspector & Game Listeners
      expect(container.textContent).toContain('Selection Inspector');
      expect(container.textContent).toContain('⚡ Game Listeners');
    });

    it('toggles boolean inputs, increments number inputs, and fires triggers in Left Column', async () => {
      const sm = editorActions.addStateMachine('Inputs Test SM');
      editorActions.addStateMachineInput(sm.id, {
        name: 'hovered',
        type: 'boolean',
        value: false,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'coins',
        type: 'number',
        value: 10,
      });
      editorActions.addStateMachineInput(sm.id, {
        name: 'hit',
        type: 'trigger',
        value: false,
      });

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      // 1. Toggle Boolean checkbox
      const boolCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(boolCheckbox).toBeTruthy();
      expect(boolCheckbox.checked).toBe(false);

      await act(async () => {
        boolCheckbox.click();
      });
      expect(getEditorState().doc.stateMachines![0].inputs[0].value).toBe(true);

      // 2. Step Number input (+ button)
      const plusBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '+'
      );
      expect(plusBtn).toBeTruthy();

      await act(async () => {
        plusBtn!.click();
      });
      expect(getEditorState().doc.stateMachines![0].inputs[1].value).toBe(11);

      // 3. Fire Trigger button
      const fireBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Fire')
      );
      expect(fireBtn).toBeTruthy();

      await act(async () => {
        fireBtn!.click();
      });
      expect(getEditorState().doc.stateMachines![0].inputs[2].value).toBe(true);
    });

    it('selects State Node on click and displays node properties in Right Column', async () => {
      const sm = editorActions.addStateMachine('Select Node SM');

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      // Find Idle state node card in SVG
      const idleNodeGroup = Array.from(container.querySelectorAll('g')).find((g) =>
        g.textContent?.includes('Idle')
      );
      expect(idleNodeGroup).toBeTruthy();

      await act(async () => {
        idleNodeGroup!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Right Column now inspects the Idle state node
      expect(container.textContent).toContain('State Name');
      expect(container.textContent).toContain('Clip Name');
      expect(container.textContent).toContain('Loop Animation');

      // Rename state in Inspector
      const nameInput = container.querySelector('input[data-testid="state-name-input"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();
      expect(nameInput.value).toBe('Idle');

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(nameInput, 'Idle Stance');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(getEditorState().doc.stateMachines![0].states[1].name).toBe('Idle Stance');
    });

    it('selects Transition on click and allows configuring duration and condition guards', async () => {
      const sm = editorActions.addStateMachine('Select Trans SM');
      editorActions.addStateMachineInput(sm.id, {
        name: 'hp',
        type: 'number',
        value: 100,
      });

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      // Find transition in SVG
      const transitionBadge = Array.from(container.querySelectorAll('g')).find(
        (g) => g.textContent?.includes('instant') || g.textContent?.includes('0ms')
      );
      expect(transitionBadge).toBeTruthy();

      await act(async () => {
        transitionBadge!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Right Inspector shows Transition details
      expect(container.textContent).toContain('From ➔ To');
      expect(container.textContent).toContain('Duration (ms)');
      expect(container.textContent).toContain('Conditions');

      // Add condition using data-testid
      const addCondBtn = container.querySelector('button[data-testid="add-condition-btn"]') as HTMLButtonElement;
      expect(addCondBtn).toBeTruthy();

      await act(async () => {
        addCondBtn.click();
      });

      const updatedTransition = getEditorState().doc.stateMachines![0].transitions[0];
      expect(updatedTransition.conditions.length).toBeGreaterThanOrEqual(1);
    });

    it('adds and configures Game Listeners with action triggers in Right Column', async () => {
      const sm = editorActions.addStateMachine('Game Listeners SM');
      editorActions.addStateMachineInput(sm.id, {
        name: 'score',
        type: 'number',
        value: 0,
      });

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      const addListenerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Listener')
      );
      expect(addListenerBtn).toBeTruthy();

      await act(async () => {
        addListenerBtn!.click();
      });

      expect(getEditorState().doc.stateMachines![0].listeners).toHaveLength(1);
      expect(container.textContent).toContain('Actions (0)');

      // Add an action to the listener
      const addActionBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('+ Action')
      );
      expect(addActionBtn).toBeTruthy();

      await act(async () => {
        addActionBtn!.click();
      });

      const updatedListener = getEditorState().doc.stateMachines![0].listeners[0];
      expect(updatedListener.actions).toHaveLength(1);
    });
  });

  /* =========================================================================
   * 3. Workspace Dock Tab Bar Integration Tests
   * ========================================================================= */
  describe('Workspace Tab Switching Integration', () => {
    it('renders ⚡ State Machine button in bottom dock and switches tab to StateMachinePanel', async () => {
      await act(async () => {
        root.render(<Workspace />);
      });

      // Check that ⚡ State Machine tab button exists in bottom dock
      const smTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('⚡ State Machine')
      );
      expect(smTabBtn).toBeTruthy();

      // Click the ⚡ State Machine tab
      await act(async () => {
        smTabBtn!.click();
      });

      expect(getEditorState().activeInspectorTab).toBe('statemachine');
      // State machine panel is now rendered
      expect(
        container.textContent?.includes('No State Machine Defined') ||
          container.textContent?.includes('Inputs')
      ).toBe(true);

      // Switch back to ⏱ Timeline
      const timelineTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Timeline & Layers')
      );
      expect(timelineTabBtn).toBeTruthy();

      await act(async () => {
        timelineTabBtn!.click();
      });

      expect(getEditorState().activeInspectorTab).toBe('timeline');
    });
  });
});
