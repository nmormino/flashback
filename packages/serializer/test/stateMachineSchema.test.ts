import { describe, it, expect } from 'vitest';
import type { AnimDocument, StateMachineDef } from '@flashback/runtime';
import {
  serialize,
  parse,
  validate,
  hydrate,
  ValidationError,
  type EditorDocument,
} from '../src/index.js';

describe('Phase 2.4 - Feature 1: State Machine Schema & Serialization', () => {
  const baseDoc: EditorDocument = {
    version: 1,
    meta: {
      name: 'State Machine Test',
      createdAt: '2026-11-12T00:00:00.000Z',
      modifiedAt: '2026-11-12T00:00:00.000Z',
      editorVersion: '1.0.0',
    },
    stage: {
      width: 800,
      height: 600,
      fps: 60,
      background: { type: 'solid', color: '#1e293b' },
      scaleMode: 'showAll',
    },
    library: {
      symbols: {},
      audio: {},
      fonts: {},
      bitmaps: {},
    },
    root: {
      frameCount: 60,
      layers: [
        {
          id: 'l1',
          name: 'Main Layer',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf1',
              index: 0,
              duration: 60,
              time: 0,
              durationTime: 1,
              elements: [],
            },
          ],
        },
      ],
    },
  };

  const fullStateMachine: StateMachineDef = {
    id: 'sm-player',
    name: 'PlayerController',
    inputs: [
      { id: 'in-grounded', name: 'isGrounded', type: 'boolean', value: true },
      { id: 'in-speed', name: 'speed', type: 'number', value: 0 },
      { id: 'in-jump', name: 'jumpTrigger', type: 'trigger', value: false },
    ],
    states: [
      { id: 'st-entry', name: 'Entry', type: 'entry', x: 50, y: 100 },
      {
        id: 'st-idle',
        name: 'Idle',
        type: 'clip',
        clipName: 'hero_idle',
        loop: 'loop',
        speed: 1,
        x: 200,
        y: 100,
      },
      {
        id: 'st-run',
        name: 'Run',
        type: 'clip',
        clipName: 'hero_run',
        loop: 'loop',
        speed: 1.2,
        x: 400,
        y: 100,
      },
      {
        id: 'st-jump',
        name: 'Jump',
        type: 'clip',
        clipName: 'hero_jump',
        loop: 'one-shot',
        speed: 1,
        x: 300,
        y: 250,
      },
      {
        id: 'st-blend',
        name: 'LocomotionBlend',
        type: 'blend1d',
        blendInputId: 'in-speed',
        x: 300,
        y: 400,
      },
      {
        id: 'st-exit',
        name: 'Exit',
        type: 'exit',
        x: 600,
        y: 100,
      },
    ],
    transitions: [
      {
        id: 'tr-entry-idle',
        fromStateId: 'st-entry',
        toStateId: 'st-idle',
        durationMs: 0,
        conditions: [],
      },
      {
        id: 'tr-idle-run',
        fromStateId: 'st-idle',
        toStateId: 'st-run',
        durationMs: 100,
        easing: { type: 'preset', name: 'ease-out' },
        conditions: [
          { inputId: 'in-speed', op: '>', value: 0.1 },
        ],
      },
      {
        id: 'tr-run-idle',
        fromStateId: 'st-run',
        toStateId: 'st-idle',
        durationMs: 150,
        conditions: [
          { inputId: 'in-speed', op: '<=', value: 0.1 },
        ],
      },
      {
        id: 'tr-any-jump',
        fromStateId: 'st-idle',
        toStateId: 'st-jump',
        durationMs: 50,
        conditions: [
          { inputId: 'in-jump', op: '==', value: true },
          { inputId: 'in-grounded', op: '==', value: true },
        ],
      },
      {
        id: 'tr-jump-idle',
        fromStateId: 'st-jump',
        toStateId: 'st-idle',
        durationMs: 100,
        hasExitTime: true,
        exitTime: 0.95,
        conditions: [],
      },
    ],
    listeners: [
      {
        id: 'lis-click',
        eventType: 'click',
        targetElementId: 'btn-jump',
        actions: [
          { type: 'fire_trigger', inputId: 'in-jump' },
          { type: 'play_sound', soundId: 'snd-jump-whoosh' },
        ],
      },
      {
        id: 'lis-collision',
        eventType: 'collision',
        targetElementId: 'player-collider',
        collisionWithElementId: 'enemy-hazard',
        actions: [
          { type: 'change_input', inputId: 'in-speed', delta: -5 },
          { type: 'spawn_clip', symbolId: 'fx-spark-burst', x: 100, y: 150 },
        ],
      },
      {
        id: 'lis-tick',
        eventType: 'tick',
        actions: [
          { type: 'set_input', inputId: 'in-grounded', value: true },
        ],
      },
      {
        id: 'lis-keydown',
        eventType: 'keydown',
        keyCode: 'Space',
        actions: [
          { type: 'fire_trigger', inputId: 'in-jump' },
        ],
      },
    ],
  };

  it('validates a document with a complete state machine and activeStateMachineId', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 'sm-player',
    };

    const validated = validate(doc as AnimDocument);
    expect(validated.stateMachines).toBeDefined();
    expect(validated.stateMachines).toHaveLength(1);
    expect(validated.activeStateMachineId).toBe('sm-player');

    const sm = validated.stateMachines![0];
    expect(sm.id).toBe('sm-player');
    expect(sm.inputs).toHaveLength(3);
    expect(sm.states).toHaveLength(6);
    expect(sm.transitions).toHaveLength(5);
    expect(sm.listeners).toHaveLength(4);
  });

  it('rejects duplicate state machine IDs', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        { ...fullStateMachine, id: 'dup-sm' },
        { ...fullStateMachine, id: 'dup-sm' },
      ],
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('Duplicate state machine id: "dup-sm"');
  });

  it('rejects duplicate input IDs within a state machine', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          inputs: [
            { id: 'in-dup', name: 'Speed1', type: 'number', value: 0 },
            { id: 'in-dup', name: 'Speed2', type: 'number', value: 10 },
          ],
        },
      ],
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('Duplicate input id: "in-dup"');
  });

  it('rejects invalid input type', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          inputs: [
            { id: 'in-bad', name: 'BadInput', type: 'custom' as any, value: 0 },
          ],
        },
      ],
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('Invalid input type: "custom"');
  });

  it('rejects duplicate state IDs within a state machine', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          states: [
            { id: 'st-dup', name: 'Idle 1', type: 'clip' },
            { id: 'st-dup', name: 'Idle 2', type: 'clip' },
          ],
        },
      ],
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('Duplicate state id: "st-dup"');
  });

  it('rejects invalid state type', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          states: [
            { id: 'st-bad', name: 'BadState', type: 'unknown_type' as any },
          ],
        },
      ],
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('Invalid state type: "unknown_type"');
  });

  it('rejects transitions referencing non-existent states', () => {
    const docBadFrom: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          transitions: [
            {
              id: 'tr-bad',
              fromStateId: 'st-ghost',
              toStateId: 'st-idle',
              conditions: [],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadFrom as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadFrom as AnimDocument)).toThrow(
      'Transition fromStateId "st-ghost" not found in states'
    );

    const docBadTo: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          transitions: [
            {
              id: 'tr-bad-to',
              fromStateId: 'st-idle',
              toStateId: 'st-nonexistent',
              conditions: [],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadTo as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadTo as AnimDocument)).toThrow(
      'Transition toStateId "st-nonexistent" not found in states'
    );
  });

  it('rejects transition conditions referencing non-existent inputs or invalid operators', () => {
    const docBadCondInput: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          transitions: [
            {
              id: 'tr-bad-cond',
              fromStateId: 'st-idle',
              toStateId: 'st-run',
              conditions: [
                { inputId: 'in-ghost', op: '>', value: 5 },
              ],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadCondInput as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadCondInput as AnimDocument)).toThrow(
      'Condition inputId "in-ghost" not found in inputs'
    );

    const docBadCondOp: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          transitions: [
            {
              id: 'tr-bad-op',
              fromStateId: 'st-idle',
              toStateId: 'st-run',
              conditions: [
                { inputId: 'in-speed', op: '~=' as any, value: 5 },
              ],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadCondOp as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadCondOp as AnimDocument)).toThrow('Invalid condition operator: "~="');
  });

  it('rejects listeners with invalid eventType or invalid action type', () => {
    const docBadEvent: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          listeners: [
            {
              id: 'lis-bad',
              eventType: 'swipe' as any,
              actions: [],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadEvent as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadEvent as AnimDocument)).toThrow('Invalid listener eventType: "swipe"');

    const docBadAction: EditorDocument = {
      ...baseDoc,
      stateMachines: [
        {
          ...fullStateMachine,
          listeners: [
            {
              id: 'lis-bad-act',
              eventType: 'click',
              actions: [
                { type: 'teleport' as any },
              ],
            },
          ],
        },
      ],
    };

    expect(() => validate(docBadAction as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(docBadAction as AnimDocument)).toThrow('Invalid action type: "teleport"');
  });

  it('rejects activeStateMachineId that does not exist in stateMachines', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 'sm-ghost',
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow(
      'Active state machine id "sm-ghost" not found in stateMachines'
    );
  });

  it('rejects non-string activeStateMachineId', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 12345 as any,
    };

    expect(() => validate(doc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(doc as AnimDocument)).toThrow('activeStateMachineId must be a string');
  });

  it('serializes and round-trip parses a document with full StateMachineDef cleanly', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 'sm-player',
    };

    const code = serialize(doc);

    // Verify code output has state machine keys
    expect(code).toContain('stateMachines:');
    expect(code).toContain('activeStateMachineId: "sm-player"');
    expect(code).toContain('id: "sm-player"');
    expect(code).toContain('name: "PlayerController"');
    expect(code).toContain('inputs:');
    expect(code).toContain('states:');
    expect(code).toContain('transitions:');
    expect(code).toContain('listeners:');
    expect(code).toContain('eventType: "collision"');
    expect(code).toContain('type: "change_input"');
    expect(code).toContain('type: "spawn_clip"');

    // Round-trip parse
    const parsed = parse(code);
    expect(parsed.stateMachines).toBeDefined();
    expect(parsed.stateMachines).toHaveLength(1);
    expect(parsed.activeStateMachineId).toBe('sm-player');

    const sm = parsed.stateMachines![0];
    expect(sm.id).toBe(fullStateMachine.id);
    expect(sm.name).toBe(fullStateMachine.name);
    expect(sm.inputs).toEqual(fullStateMachine.inputs);
    expect(sm.states).toEqual(fullStateMachine.states);
    expect(sm.transitions).toEqual(fullStateMachine.transitions);
    expect(sm.listeners).toEqual(fullStateMachine.listeners);

    // Re-validate the parsed document
    const revalidated = validate(parsed as AnimDocument);
    expect(revalidated.stateMachines).toHaveLength(1);
  });

  it('serializes to JSON and round-trips without loss', () => {
    const doc: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 'sm-player',
    };

    const json = serialize(doc, { format: 'json' });
    const parsed = JSON.parse(json);
    expect(parsed.stateMachines).toHaveLength(1);
    expect(parsed.activeStateMachineId).toBe('sm-player');
    expect(parsed.stateMachines[0].id).toBe('sm-player');
    expect(parsed.stateMachines[0].inputs).toHaveLength(3);
    expect(parsed.stateMachines[0].listeners).toHaveLength(4);
  });

  it('hydrates a document containing StateMachineDef without mutating or corrupting definitions', () => {
    const docWithScript: EditorDocument = {
      ...baseDoc,
      stateMachines: [fullStateMachine],
      activeStateMachineId: 'sm-player',
      root: {
        frameCount: 24,
        layers: [
          {
            id: 'l1',
            name: 'Layer 1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 24,
                elements: [
                  {
                    id: 'btn1',
                    type: 'shape',
                    alpha: 1,
                    visible: true,
                    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    paths: [],
                    events: {
                      onClick: { __fn: "this.play();" } as any,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const hydrated = hydrate(docWithScript);

    // Verify scripts hydrated into functions
    const btn = hydrated.root.layers[0].keyframes[0].elements[0];
    expect(typeof btn.events?.onClick).toBe('function');

    // Verify state machine definitions survived intact
    expect(hydrated.stateMachines).toBeDefined();
    expect(hydrated.stateMachines).toHaveLength(1);
    expect(hydrated.activeStateMachineId).toBe('sm-player');

    const sm = hydrated.stateMachines![0];
    expect(sm.id).toBe('sm-player');
    expect(sm.inputs).toEqual(fullStateMachine.inputs);
    expect(sm.states).toEqual(fullStateMachine.states);
    expect(sm.transitions).toEqual(fullStateMachine.transitions);
    expect(sm.listeners).toEqual(fullStateMachine.listeners);
  });
});
