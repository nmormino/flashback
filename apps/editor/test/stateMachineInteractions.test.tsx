import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TextElement, ShapeElement } from '@flashback/runtime';
import {
  editorActions,
  getEditorState,
  getActiveTimeline,
} from '../src/state/editorStore';
import { StateMachinePanel } from '../src/panels/StateMachine/StateMachinePanel';
import { Properties } from '../src/panels/Properties/Properties';
import { StateVariables } from '../src/panels/StateVariables/StateVariables';
import { Workspace } from '../src/layout/Workspace';

const createSampleShape = (id: string): ShapeElement => ({
  id,
  type: 'shape',
  paths: [
    {
      d: 'M 0 0 L 100 0 L 100 100 Z',
      fill: { type: 'solid', color: '#3b82f6' },
    },
  ],
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
  alpha: 1,
  visible: true,
});

const createSampleText = (id: string, text: string): TextElement => ({
  id,
  type: 'text',
  text,
  fontSize: 20,
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

describe('Rive-Style State Machine & Interactions Engine', () => {
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
   * 1. State Machine Inputs: Boolean, Number & Trigger
   * ========================================================================= */
  describe('State Machine Inputs Management', () => {
    it('adds, updates, and deletes boolean, number, and trigger inputs', () => {
      const sm = editorActions.addStateMachine('Gameplay SM');
      expect(sm.inputs).toHaveLength(0);

      // 1. Add boolean input
      editorActions.addStateMachineInput(sm.id, {
        name: 'isAlive',
        type: 'boolean',
        value: true,
      });

      // 2. Add number input
      editorActions.addStateMachineInput(sm.id, {
        name: 'health',
        type: 'number',
        value: 100,
      });

      // 3. Add trigger input
      editorActions.addStateMachineInput(sm.id, {
        name: 'takeDamage',
        type: 'trigger',
        value: false,
      });

      let currentSm = getEditorState().doc.stateMachines![0];
      expect(currentSm.inputs).toHaveLength(3);

      const boolInp = currentSm.inputs.find((i) => i.name === 'isAlive');
      const numInp = currentSm.inputs.find((i) => i.name === 'health');
      const trigInp = currentSm.inputs.find((i) => i.name === 'takeDamage');

      expect(boolInp?.type).toBe('boolean');
      expect(boolInp?.value).toBe(true);
      expect(numInp?.type).toBe('number');
      expect(numInp?.value).toBe(100);
      expect(trigInp?.type).toBe('trigger');
      expect(trigInp?.value).toBe(false);

      // Update input value and name
      editorActions.updateStateMachineInput(sm.id, numInp!.id, {
        name: 'currentHealth',
        value: 75,
      });

      currentSm = getEditorState().doc.stateMachines![0];
      const updatedNumInp = currentSm.inputs.find((i) => i.id === numInp!.id);
      expect(updatedNumInp?.name).toBe('currentHealth');
      expect(updatedNumInp?.value).toBe(75);

      // Cascading cleanup when input is deleted
      const entryNode = currentSm.states[0];
      const idleNode = currentSm.states[1];
      editorActions.addStateTransition(sm.id, {
        fromStateId: entryNode.id,
        toStateId: idleNode.id,
        conditions: [{ inputId: numInp!.id, op: '<=', value: 0 }],
      });

      editorActions.addStateListener(sm.id, {
        eventType: 'click',
        actions: [{ type: 'set_input', inputId: numInp!.id, value: 50 }],
      });

      editorActions.deleteStateMachineInput(sm.id, numInp!.id);
      currentSm = getEditorState().doc.stateMachines![0];
      expect(currentSm.inputs.find((i) => i.id === numInp!.id)).toBeUndefined();
      // Condition referencing deleted input is pruned
      expect(currentSm.transitions[1]?.conditions).toHaveLength(0);
      // Listener action referencing deleted input is pruned
      expect(currentSm.listeners[0]?.actions).toHaveLength(0);
    });
  });

  /* =========================================================================
   * 2. State Graph Nodes: Creation, Positioning, Deletion
   * ========================================================================= */
  describe('State Graph Nodes Lifecycle', () => {
    it('creates state nodes, moves them, and handles cascading transitions cleanup', () => {
      const sm = editorActions.addStateMachine('Motion Graph');
      expect(sm.states).toHaveLength(2); // Entry + Idle

      // Add a walk clip node
      editorActions.addStateNode(sm.id, {
        name: 'Walk',
        type: 'clip',
        clipName: 'walk_anim',
        loop: true,
        x: 400,
        y: 200,
      });

      let currentSm = getEditorState().doc.stateMachines![0];
      expect(currentSm.states).toHaveLength(3);
      const walkNode = currentSm.states.find((s) => s.name === 'Walk')!;
      expect(walkNode).toBeDefined();
      expect(walkNode.name).toBe('Walk');
      expect(walkNode.clipName).toBe('walk_anim');

      // Move state node
      editorActions.updateStateNode(sm.id, walkNode.id, { x: 450, y: 250 });
      currentSm = getEditorState().doc.stateMachines![0];
      const movedNode = currentSm.states.find((s) => s.id === walkNode.id);
      expect(movedNode?.x).toBe(450);
      expect(movedNode?.y).toBe(250);

      // Update state node properties
      editorActions.updateStateNode(sm.id, walkNode.id, {
        name: 'Running',
        speed: 1.5,
      });
      currentSm = getEditorState().doc.stateMachines![0];
      const updatedNode = currentSm.states.find((s) => s.id === walkNode.id);
      expect(updatedNode?.name).toBe('Running');
      expect(updatedNode?.speed).toBe(1.5);

      // Create transitions connected to this node
      const idleNode = currentSm.states[1];
      editorActions.addStateTransition(sm.id, {
        fromStateId: idleNode.id,
        toStateId: walkNode.id,
        durationMs: 200,
      });
      currentSm = getEditorState().doc.stateMachines![0];
      expect(currentSm.transitions).toHaveLength(2);
      const trans = currentSm.transitions.find(
        (t) => t.fromStateId === idleNode.id && t.toStateId === walkNode.id
      )!;
      expect(trans).toBeDefined();

      // Deleting state node removes connected transitions
      editorActions.deleteStateNode(sm.id, walkNode.id);
      currentSm = getEditorState().doc.stateMachines![0];
      expect(currentSm.states.find((s) => s.id === walkNode.id)).toBeUndefined();
      expect(currentSm.transitions.find((t) => t.id === trans.id)).toBeUndefined();
    });
  });

  /* =========================================================================
   * 3. Transitions & Condition Guards
   * ========================================================================= */
  describe('State Transitions & Condition Guards', () => {
    it('manages transitions and multi-condition guard rules', () => {
      const sm = editorActions.addStateMachine('Combat SM');
      const input = editorActions.addStateMachineInput(sm.id, {
        name: 'comboCounter',
        type: 'number',
        value: 0,
      });

      editorActions.addStateNode(sm.id, {
        name: 'Attack',
        type: 'clip',
        clipName: 'punch',
      });

      let curSm = getEditorState().doc.stateMachines![0];
      const attackNode = curSm.states.find((s) => s.name === 'Attack')!;
      const idleNode = curSm.states[1];

      // Add transition
      editorActions.addStateTransition(sm.id, {
        fromStateId: idleNode.id,
        toStateId: attackNode.id,
        durationMs: 150,
      });

      curSm = getEditorState().doc.stateMachines![0];
      const transition = curSm.transitions.find(
        (t) => t.fromStateId === idleNode.id && t.toStateId === attackNode.id
      )!;
      expect(transition).toBeDefined();
      expect(transition.durationMs).toBe(150);

      // Add condition via updateStateTransition
      const condId = 'cond_combo_test';
      editorActions.updateStateTransition(sm.id, transition.id, {
        conditions: [
          {
            id: condId,
            inputId: curSm.inputs[0].id,
            op: '>',
            value: 2,
          },
        ],
      });

      curSm = getEditorState().doc.stateMachines![0];
      let curTrans = curSm.transitions.find((t) => t.id === transition.id);
      expect(curTrans?.conditions).toHaveLength(1);
      expect(curTrans?.conditions[0].op).toBe('>');
      expect(curTrans?.conditions[0].value).toBe(2);

      // Update condition
      editorActions.updateStateTransition(sm.id, transition.id, {
        conditions: [
          {
            id: condId,
            inputId: curSm.inputs[0].id,
            op: '>=',
            value: 3,
          },
        ],
      });

      curSm = getEditorState().doc.stateMachines![0];
      curTrans = curSm.transitions.find((t) => t.id === transition.id);
      expect(curTrans?.conditions[0].op).toBe('>=');
      expect(curTrans?.conditions[0].value).toBe(3);

      // Delete condition
      editorActions.updateStateTransition(sm.id, transition.id, {
        conditions: [],
      });
      curSm = getEditorState().doc.stateMachines![0];
      curTrans = curSm.transitions.find((t) => t.id === transition.id);
      expect(curTrans?.conditions).toHaveLength(0);

      // Delete transition
      editorActions.deleteStateTransition(sm.id, transition.id);
      curSm = getEditorState().doc.stateMachines![0];
      expect(curSm.transitions.find((t) => t.id === transition.id)).toBeUndefined();
    });
  });

  /* =========================================================================
   * 4. Game Listeners & Element Targeting
   * ========================================================================= */
  describe('Game Listeners & Element Interaction Targeting', () => {
    it('binds listeners targeting elements with diverse event types and actions', () => {
      const sm = editorActions.addStateMachine('UI Interaction SM');
      const shape = createSampleShape('hero_btn');
      const doc = getEditorState().doc;
      doc.root.layers[0].keyframes[0].elements.push(shape);

      // Add click listener targeting hero_btn
      editorActions.addStateListener(sm.id, {
        eventType: 'click',
        targetElementId: shape.id,
        actions: [{ type: 'fire_trigger', inputId: 'inp_1' }],
      });

      // Add hover (pointerenter) listener targeting hero_btn
      editorActions.addStateListener(sm.id, {
        eventType: 'pointerenter',
        targetElementId: shape.id,
        actions: [{ type: 'set_input', inputId: 'inp_hover', value: true }],
      });

      // Add keyboard listener
      editorActions.addStateListener(sm.id, {
        eventType: 'keydown',
        keyCode: 'Space',
        actions: [{ type: 'fire_trigger', inputId: 'inp_jump' }],
      });

      const listeners = getEditorState().doc.stateMachines![0].listeners;
      expect(listeners).toHaveLength(3);

      const clickLis = listeners.find((l) => l.eventType === 'click');
      expect(clickLis?.targetElementId).toBe('hero_btn');
      expect(clickLis?.actions[0].type).toBe('fire_trigger');

      const hoverLis = listeners.find((l) => l.eventType === 'pointerenter');
      expect(hoverLis?.targetElementId).toBe('hero_btn');
      expect(hoverLis?.actions[0].type).toBe('set_input');

      const keyLis = listeners.find((l) => l.eventType === 'keydown');
      expect(keyLis?.keyCode).toBe('Space');

      // Update listener
      editorActions.updateStateListener(sm.id, keyLis!.id, {
        keyCode: 'KeyW',
      });
      const updatedKeyLis = getEditorState().doc.stateMachines![0].listeners.find(
        (l) => l.id === keyLis!.id
      );
      expect(updatedKeyLis?.keyCode).toBe('KeyW');

      // Delete listener
      editorActions.deleteStateListener(sm.id, hoverLis!.id);
      expect(
        getEditorState().doc.stateMachines![0].listeners.find((l) => l.id === hoverLis!.id)
      ).toBeUndefined();
    });
  });

  /* =========================================================================
   * 5. UI Integration: StateMachinePanel & Properties Inspector
   * ========================================================================= */
  describe('StateMachinePanel & Properties Inspector UI Integration', () => {
    it('renders StateMachinePanel with inputs, state graph, and listener cards', async () => {
      const sm = editorActions.addStateMachine('Interactive Character');
      editorActions.addStateMachineInput(sm.id, {
        name: 'isRunning',
        type: 'boolean',
        value: false,
      });

      await act(async () => {
        root.render(<StateMachinePanel />);
      });

      // 1. Header shows state machine title
      expect(container.textContent).toContain('Interactive Character');

      // 2. Left column shows Inputs section
      expect(container.textContent).toContain('Inputs');
      expect(container.textContent).toContain('1 Inputs');
      expect(container.textContent).toContain('isRunning');

      // 3. Center SVG graph shows Entry and Idle states
      expect(container.textContent).toContain('Entry');
      expect(container.textContent).toContain('Idle');

      // 4. Add listener via UI
      const addListenerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Listener')
      );
      expect(addListenerBtn).toBeDefined();

      await act(async () => {
        addListenerBtn!.click();
      });

      expect(getEditorState().doc.stateMachines![0].listeners).toHaveLength(1);
    });

    it('adds click and hover interactions from Properties inspector targeting selected element', async () => {
      const shape = createSampleShape('interactive_star');
      const doc = getEditorState().doc;
      doc.root.layers[0].keyframes[0].elements.push(shape);
      editorActions.selectElement(shape.id);

      await act(async () => {
        root.render(<Properties />);
      });

      expect(container.textContent).toContain('Interactions & State Machine');

      // Click "+ Add Click Interaction"
      const addClickBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('+ Add Click Interaction')
      );
      expect(addClickBtn).toBeDefined();

      await act(async () => {
        addClickBtn!.click();
      });

      // State machine tab activated
      expect(getEditorState().activeInspectorTab).toBe('statemachine');

      // Listener created with shape target
      const sm = getEditorState().doc.stateMachines![0];
      const clickLis = sm.listeners?.find((l) => l.targetElementId === shape.id);
      expect(clickLis).toBeDefined();
      expect(clickLis?.eventType).toBe('click');

      // Switch back to properties and verify interaction is listed
      await act(async () => {
        root.render(<Properties />);
      });

      expect(container.textContent).toContain('⚡ click');
      expect(container.textContent).toContain('(0 actions)');

      // Click "+ Add Hover Interaction"
      const addHoverBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('+ Add Hover Interaction')
      );
      expect(addHoverBtn).toBeDefined();

      await act(async () => {
        addHoverBtn!.click();
      });

      const hoverLis = getEditorState().doc.stateMachines![0].listeners?.find(
        (l) => l.targetElementId === shape.id && l.eventType === 'pointerenter'
      );
      expect(hoverLis).toBeDefined();
    });
  });

  /* =========================================================================
   * 6. State Variables & Text Data Binding
   * ========================================================================= */
  describe('State Variables & Text State Binding', () => {
    it('binds text element to state variables via setTextStateBinding', () => {
      editorActions.addStateVariable({
        name: 'highScore',
        type: 'number',
        defaultValue: 9999,
        isPublic: true,
      });

      const textEl = createSampleText('txt_score', 'Score: 0');
      editorActions.addElement(textEl);
      editorActions.setTextStateBinding(textEl.id, 'highScore');

      const tl = getActiveTimeline(getEditorState().doc);
      const updatedTextEl = tl.layers[0].keyframes[0].elements.find(
        (e) => e.id === textEl.id
      ) as any;
      expect(updatedTextEl.stateBinding).toBe('highScore');

      // Unbind
      editorActions.setTextStateBinding(textEl.id, null);
      const tl2 = getActiveTimeline(getEditorState().doc);
      const unbound = tl2.layers[0].keyframes[0].elements.find(
        (e) => e.id === textEl.id
      ) as any;
      expect(unbound.stateBinding).toBeUndefined();
    });

    it('toggles floating StateVariables panel', () => {
      expect(getEditorState().isStateVariablesOpen).toBe(false);
      editorActions.toggleStateVariables();
      expect(getEditorState().isStateVariablesOpen).toBe(true);
      editorActions.setStateVariablesOpen(false);
      expect(getEditorState().isStateVariablesOpen).toBe(false);
    });
  });

  /* =========================================================================
   * 7. Workspace Dock Tabs: Exclusively Timeline & State Machine
   * ========================================================================= */
  describe('Workspace Dock Integration: Timeline & State Machine', () => {
    it('only renders Timeline & Layers and State Machine tabs in bottom dock', async () => {
      await act(async () => {
        root.render(<Workspace />);
      });

      // Bottom dock tabs
      const timelineBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Timeline & Layers')
      );
      const smBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('State Machine')
      );
      const scriptsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Scripts')
      );

      expect(timelineBtn).toBeTruthy();
      expect(smBtn).toBeTruthy();
      // Legacy Scripts tab is completely gone!
      expect(scriptsBtn).toBeUndefined();
    });
  });
});
