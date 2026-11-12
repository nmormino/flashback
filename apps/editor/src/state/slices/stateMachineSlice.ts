import type {
  StateMachineDef,
  StateMachineInput,
  StateNode,
  StateNodeType,
  StateTransition,
  StateCondition,
  StateListener,
  StateVariable,
  StateVariableType,
  TextElement,
} from '@flashback/runtime';
import type { SliceContext, SliceCreator, StateMachineSliceActions } from './types';
import { fastClone } from './historySlice';

export const createStateMachineSlice: SliceCreator<StateMachineSliceActions> = (
  context: SliceContext
): StateMachineSliceActions => {
  return {
    addStateVariable(variable: {
      name: string;
      type: StateVariableType;
      defaultValue: any;
      isPublic?: boolean;
      description?: string;
    }): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      if (!doc.stateVariables) {
        doc.stateVariables = [];
      }
      const cleanName = variable.name.trim().replace(/[^a-zA-Z0-9_$]/g, '_') || 'myVar';
      const newVar: StateVariable = {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        type: variable.type || 'number',
        defaultValue: variable.defaultValue ?? 0,
        isPublic: variable.isPublic ?? true,
        description: variable.description,
      };
      doc.stateVariables.push(newVar);
      if (!doc.state) {
        doc.state = {};
      }
      doc.state[cleanName] = newVar.defaultValue;
      context.setState({ doc });
    },

    updateStateVariable(id: string, updates: Partial<StateVariable>): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      if (!doc.stateVariables) return;
      const v = doc.stateVariables.find((it) => it.id === id);
      if (!v) return;

      const oldName = v.name;
      Object.assign(v, updates);
      if (updates.name && updates.name !== oldName) {
        v.name = updates.name.trim().replace(/[^a-zA-Z0-9_$]/g, '_');
        if (doc.state && oldName in doc.state) {
          doc.state[v.name] = doc.state[oldName];
          delete doc.state[oldName];
        }
      }
      if (updates.defaultValue !== undefined && doc.state) {
        doc.state[v.name] = updates.defaultValue;
      }

      context.setState({ doc });
    },

    deleteStateVariable(id: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      if (!doc.stateVariables) return;
      const idx = doc.stateVariables.findIndex((it) => it.id === id);
      if (idx === -1) return;
      const [removed] = doc.stateVariables.splice(idx, 1);
      if (doc.state && removed && removed.name in doc.state) {
        delete doc.state[removed.name];
      }
      context.setState({ doc });
    },

    addStateMachine(name?: string): StateMachineDef {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      if (!doc.stateMachines) {
        doc.stateMachines = [];
      }
      const smIdx = doc.stateMachines.length + 1;
      const smId = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const entryNodeId = `state_entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const idleNodeId = `state_idle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const transId = `trans_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const entryNode: StateNode = {
        id: entryNodeId,
        name: 'Entry',
        type: 'entry',
        x: 80,
        y: 120,
      };

      const idleNode: StateNode = {
        id: idleNodeId,
        name: 'Idle',
        type: 'clip',
        clipName: 'idle',
        loop: true,
        x: 280,
        y: 120,
      };

      const transition: StateTransition = {
        id: transId,
        fromStateId: entryNodeId,
        toStateId: idleNodeId,
        durationMs: 0,
        conditions: [],
      };

      const newSm: StateMachineDef = {
        id: smId,
        name: name?.trim() || `State Machine ${smIdx}`,
        inputs: [],
        states: [entryNode, idleNode],
        transitions: [transition],
        listeners: [],
      };

      doc.stateMachines.push(newSm);
      doc.activeStateMachineId = smId;

      context.setState({ doc });
      return newSm;
    },

    setActiveStateMachine(id: string): void {
      const state = context.getState();
      const doc = fastClone(state.doc);
      doc.activeStateMachineId = id;
      context.setState({ doc });
    },

    deleteStateMachine(smId: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      if (!doc.stateMachines) return;
      doc.stateMachines = doc.stateMachines.filter((s) => s.id !== smId);
      if (doc.activeStateMachineId === smId) {
        doc.activeStateMachineId = doc.stateMachines[0]?.id;
      }
      context.setState({ doc });
    },

    addStateMachineInput(
      smId: string,
      input: { name: string; type: 'boolean' | 'number' | 'trigger'; value: boolean | number }
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm) return;
      if (!sm.inputs) sm.inputs = [];

      const cleanName = input.name.trim().replace(/[^a-zA-Z0-9_$]/g, '_') || 'input1';
      const newInput: StateMachineInput = {
        id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        type: input.type,
        value:
          input.type === 'boolean' || input.type === 'trigger'
            ? Boolean(input.value)
            : Number(input.value) || 0,
      };
      sm.inputs.push(newInput);
      context.setState({ doc });
    },

    updateStateMachineInput(
      smId: string,
      inputId: string,
      updates: Partial<StateMachineInput>
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.inputs) return;
      const inp = sm.inputs.find((i) => i.id === inputId);
      if (!inp) return;

      if (updates.name !== undefined) {
        inp.name = updates.name.trim().replace(/[^a-zA-Z0-9_$]/g, '_');
      }
      if (updates.type !== undefined) {
        inp.type = updates.type;
      }
      if (updates.value !== undefined) {
        inp.value =
          inp.type === 'boolean' || inp.type === 'trigger'
            ? Boolean(updates.value)
            : Number(updates.value) || 0;
      }
      context.setState({ doc });
    },

    deleteStateMachineInput(smId: string, inputId: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.inputs) return;
      sm.inputs = sm.inputs.filter((i) => i.id !== inputId);

      // Clean up conditions referencing this input
      if (sm.transitions) {
        for (const tr of sm.transitions) {
          if (tr.conditions) {
            tr.conditions = tr.conditions.filter((c) => c.inputId !== inputId);
          }
        }
      }
      // Clean up listener actions referencing this input
      if (sm.listeners) {
        for (const lis of sm.listeners) {
          if (lis.actions) {
            lis.actions = lis.actions.filter((a) => a.inputId !== inputId);
          }
        }
      }

      context.setState({ doc });
    },

    addStateNode(
      smId: string,
      node: {
        name: string;
        type: StateNodeType;
        x?: number;
        y?: number;
        clipName?: string;
        timelineId?: string;
      }
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm) return;
      if (!sm.states) sm.states = [];

      const newNode: StateNode = {
        id: `state_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: node.name.trim() || 'New State',
        type: node.type,
        x: node.x ?? 250,
        y: node.y ?? 150,
        clipName: node.clipName,
        timelineId: node.timelineId,
        loop: true,
      };
      sm.states.push(newNode);
      context.setState({ doc });
    },

    updateStateNode(smId: string, nodeId: string, updates: Partial<StateNode>): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.states) return;
      const n = sm.states.find((it) => it.id === nodeId);
      if (!n) return;

      Object.assign(n, updates);
      context.setState({ doc });
    },

    deleteStateNode(smId: string, nodeId: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.states) return;
      sm.states = sm.states.filter((n) => n.id !== nodeId);

      // Also remove transitions connecting to or from this node
      if (sm.transitions) {
        sm.transitions = sm.transitions.filter(
          (t) => t.fromStateId !== nodeId && t.toStateId !== nodeId
        );
      }
      context.setState({ doc });
    },

    addStateTransition(
      smId: string,
      transition: {
        fromStateId: string;
        toStateId: string;
        durationMs?: number;
        conditions?: StateCondition[];
      }
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm) return;
      if (!sm.transitions) sm.transitions = [];

      const newTrans: StateTransition = {
        id: `trans_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fromStateId: transition.fromStateId,
        toStateId: transition.toStateId,
        durationMs: transition.durationMs ?? 150,
        conditions: transition.conditions ? [...transition.conditions] : [],
      };
      sm.transitions.push(newTrans);
      context.setState({ doc });
    },

    updateStateTransition(
      smId: string,
      transitionId: string,
      updates: Partial<StateTransition>
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.transitions) return;
      const tr = sm.transitions.find((t) => t.id === transitionId);
      if (!tr) return;

      Object.assign(tr, updates);
      context.setState({ doc });
    },

    deleteStateTransition(smId: string, transitionId: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.transitions) return;
      sm.transitions = sm.transitions.filter((t) => t.id !== transitionId);
      context.setState({ doc });
    },

    addStateListener(smId: string, listener: Partial<StateListener>): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm) return;
      if (!sm.listeners) sm.listeners = [];

      const newLis: StateListener = {
        id: listener.id || `listener_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        eventType: listener.eventType || 'click',
        targetElementId: listener.targetElementId,
        collisionWithElementId: listener.collisionWithElementId,
        keyCode: listener.keyCode,
        actions: listener.actions ? [...listener.actions] : [],
      };
      sm.listeners.push(newLis);
      context.setState({ doc });
    },

    updateStateListener(
      smId: string,
      listenerId: string,
      updates: Partial<StateListener>
    ): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.listeners) return;
      const lis = sm.listeners.find((l) => l.id === listenerId);
      if (!lis) return;

      Object.assign(lis, updates);
      context.setState({ doc });
    },

    deleteStateListener(smId: string, listenerId: string): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const sm = doc.stateMachines?.find((s) => s.id === smId);
      if (!sm || !sm.listeners) return;
      sm.listeners = sm.listeners.filter((l) => l.id !== listenerId);
      context.setState({ doc });
    },

    setTextStateBinding(elementId: string, stateBinding?: string | null): void {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const activeTl = context.getActiveTimeline(doc, state.isolationStack);
      for (const layer of activeTl.layers) {
        for (const kf of layer.keyframes) {
          const el = kf.elements.find((it) => it.id === elementId);
          if (el && el.type === 'text') {
            (el as TextElement).stateBinding = stateBinding || undefined;
            (el as TextElement).variable = stateBinding || undefined;
          }
        }
      }
      context.setState({ doc });
    },
  };
};
