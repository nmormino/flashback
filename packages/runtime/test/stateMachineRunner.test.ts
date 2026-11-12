import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateMachineRunner } from '../src/state/StateMachineRunner';
import { WebAnim } from '../src/WebAnim';
import { defineAnimation, type AnimDocument, type StateMachineDef } from '../src/schema';

describe('StateMachineRunner & <web-anim> Integration', () => {
  const sampleStateMachine: StateMachineDef = {
    id: 'sm-player',
    name: 'PlayerController',
    inputs: [
      { id: 'in-grounded', name: 'isGrounded', type: 'boolean', value: true },
      { id: 'in-speed', name: 'speed', type: 'number', value: 0 },
      { id: 'in-jump', name: 'jumpTrigger', type: 'trigger', value: false },
      { id: 'in-aim', name: 'aimAngle', type: 'number', value: 0.5 },
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
        id: 'st-aim',
        name: 'AimPose',
        type: 'pose',
        clipName: 'hero_aim',
        poseInputId: 'in-aim',
        x: 500,
        y: 250,
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
        conditions: [{ inputId: 'in-speed', op: '>', value: 0.1 }],
      },
      {
        id: 'tr-run-idle',
        fromStateId: 'st-run',
        toStateId: 'st-idle',
        durationMs: 150,
        conditions: [{ inputId: 'in-speed', op: '<=', value: 0.1 }],
      },
      {
        id: 'tr-idle-jump',
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
        durationMs: 0,
        hasExitTime: true,
        exitTime: 0.9,
        conditions: [],
      },
      {
        id: 'tr-idle-aim',
        fromStateId: 'st-idle',
        toStateId: 'st-aim',
        durationMs: 0,
        conditions: [{ inputId: 'in-speed', op: '==', value: -1 }],
      },
    ],
    listeners: [
      {
        id: 'lis-click',
        eventType: 'click',
        targetElementId: 'btn-jump',
        actions: [
          { type: 'fire_trigger', inputId: 'in-jump' },
          { type: 'play_sound', soundId: 'snd-whoosh' },
        ],
      },
      {
        id: 'lis-pointerdown',
        eventType: 'pointerdown',
        targetElementId: 'btn-sprint',
        actions: [{ type: 'set_input', inputId: 'in-speed', value: 5 }],
      },
      {
        id: 'lis-collision',
        eventType: 'collision',
        targetElementId: 'player-collider',
        collisionWithElementId: 'enemy-hazard',
        actions: [
          { type: 'change_input', inputId: 'in-speed', delta: -2 },
          { type: 'spawn_clip', symbolId: 'fx-sparks', x: 100, y: 150 },
        ],
      },
      {
        id: 'lis-keydown',
        eventType: 'keydown',
        keyCode: 'Space',
        actions: [{ type: 'fire_trigger', inputId: 'in-jump' }],
      },
      {
        id: 'lis-tick',
        eventType: 'tick',
        actions: [{ type: 'change_input', inputId: 'in-speed', delta: 0.05 }],
      },
    ],
  };

  describe('1. Input Access and Mutation', () => {
    it('indexes inputs by both id and name', () => {
      const runner = new StateMachineRunner(sampleStateMachine);

      expect(runner.getInputValue('in-grounded')).toBe(true);
      expect(runner.getInputValue('isGrounded')).toBe(true);

      expect(runner.getInputValue('in-speed')).toBe(0);
      expect(runner.getInputValue('speed')).toBe(0);

      expect(runner.getInputValue('in-jump')).toBe(false);
      expect(runner.getInputValue('jumpTrigger')).toBe(false);

      expect(runner.getInputValue('non-existent')).toBeUndefined();
    });

    it('mutates inputs via setInputValue across id and name aliases', () => {
      const runner = new StateMachineRunner(sampleStateMachine);

      runner.setInputValue('speed', 10);
      expect(runner.getInputValue('in-speed')).toBe(10);
      expect(runner.getInputValue('speed')).toBe(10);

      runner.setInputValue('in-grounded', false);
      expect(runner.getInputValue('in-grounded')).toBe(false);
      expect(runner.getInputValue('isGrounded')).toBe(false);
    });

    it('modifies numeric inputs via changeInputValue', () => {
      const runner = new StateMachineRunner(sampleStateMachine);

      runner.changeInputValue('speed', 5);
      expect(runner.getInputValue('speed')).toBe(5);

      runner.changeInputValue('in-speed', -2);
      expect(runner.getInputValue('speed')).toBe(3);
    });

    it('fires triggers via fireTrigger', () => {
      const runner = new StateMachineRunner(sampleStateMachine);

      expect(runner.getInputValue('jumpTrigger')).toBe(false);
      runner.fireTrigger('jumpTrigger');
      expect(runner.getInputValue('in-jump')).toBe(true);
    });
  });

  describe('2. Condition Evaluations with all operators (==, !=, >, <, >=, <=)', () => {
    it('evaluates equality and inequality operators cleanly', () => {
      const runner = new StateMachineRunner(sampleStateMachine);

      expect(runner.evaluateConditions([])).toBe(true);

      // == boolean
      expect(runner.evaluateConditions([{ inputId: 'in-grounded', op: '==', value: true }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'in-grounded', op: '==', value: false }])).toBe(false);

      // != boolean
      expect(runner.evaluateConditions([{ inputId: 'in-grounded', op: '!=', value: false }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'in-grounded', op: '!=', value: true }])).toBe(false);

      // == and != number
      runner.setInputValue('speed', 5);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '==', value: 5 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '==', value: 6 }])).toBe(false);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '!=', value: 6 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '!=', value: 5 }])).toBe(false);
    });

    it('evaluates numeric comparison operators (>, <, >=, <=)', () => {
      const runner = new StateMachineRunner(sampleStateMachine);
      runner.setInputValue('speed', 10);

      // >
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>', value: 5 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>', value: 10 }])).toBe(false);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>', value: 15 }])).toBe(false);

      // <
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<', value: 15 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<', value: 10 }])).toBe(false);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<', value: 5 }])).toBe(false);

      // >=
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>=', value: 10 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>=', value: 5 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '>=', value: 15 }])).toBe(false);

      // <=
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<=', value: 10 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<=', value: 15 }])).toBe(true);
      expect(runner.evaluateConditions([{ inputId: 'speed', op: '<=', value: 5 }])).toBe(false);
    });

    it('returns false when referencing an unknown input', () => {
      const runner = new StateMachineRunner(sampleStateMachine);
      expect(runner.evaluateConditions([{ inputId: 'unknown-id', op: '==', value: 1 }])).toBe(false);
    });
  });

  describe('3. State Transitions and Context Callbacks', () => {
    it('starts at entry node and transitions to idle on first transition evaluation', () => {
      const onStateChange = vi.fn();
      const onPlayClip = vi.fn();

      const runner = new StateMachineRunner(sampleStateMachine, {
        onStateChange,
        onPlayClip,
      });

      expect(runner.currentState?.name).toBe('Entry');
      expect(onStateChange).toHaveBeenCalledWith(null, 'Entry');

      const transitioned = runner.evaluateTransitions();
      expect(transitioned).toBe(true);
      expect(runner.currentState?.name).toBe('Idle');
      expect(onStateChange).toHaveBeenCalledWith('Entry', 'Idle');
      expect(onPlayClip).toHaveBeenCalledWith('hero_idle', 'loop', 1);
    });

    it('transitions to run when speed input increases and back to idle when speed drops', () => {
      const onStateChange = vi.fn();
      const onPlayClip = vi.fn();

      const runner = new StateMachineRunner(sampleStateMachine, {
        onStateChange,
        onPlayClip,
      });

      // Entry -> Idle
      runner.evaluateTransitions();
      expect(runner.currentState?.name).toBe('Idle');

      // Set speed to trigger Idle -> Run
      runner.setInputValue('speed', 2.0);
      const transitionedToRun = runner.evaluateTransitions();
      expect(transitionedToRun).toBe(true);
      expect(runner.currentState?.name).toBe('Run');
      expect(onPlayClip).toHaveBeenCalledWith('hero_run', 'loop', 1.2);

      // Drop speed to <= 0.1 to trigger Run -> Idle
      runner.setInputValue('speed', 0.05);
      // Wait for any active blend transition (100ms) to finish
      runner.tick(150);
      expect(runner.currentState?.name).toBe('Idle');
    });

    it('handles blend transitions over durationMs and emits onBlendClips', () => {
      const onBlendClips = vi.fn();
      const runner = new StateMachineRunner(sampleStateMachine, {
        onBlendClips,
      });

      runner.evaluateTransitions(); // Entry -> Idle
      runner.setInputValue('speed', 2);
      runner.evaluateTransitions(); // Idle -> Run with durationMs: 100

      expect(runner.activeTransition).not.toBeNull();
      expect(runner.activeTransition?.durationMs).toBe(100);

      // Advance halfway
      runner.tick(50);
      expect(runner.activeTransition?.elapsedMs).toBe(50);
      expect(onBlendClips).toHaveBeenCalledWith('hero_idle', 'hero_run', 0.5);

      // Advance past duration
      runner.tick(60);
      expect(runner.activeTransition).toBeNull();
    });

    it('respects exitTime when hasExitTime is enabled', () => {
      let clipProgress = 0.5;
      const runner = new StateMachineRunner(sampleStateMachine, {
        getCurrentClipProgress: () => clipProgress,
      });

      runner.evaluateTransitions(); // Entry -> Idle
      runner.fireTrigger('jumpTrigger');
      runner.evaluateTransitions(); // Idle -> Jump
      expect(runner.currentState?.name).toBe('Jump');

      // Finish active transition blend
      runner.tick(50);

      // Jump has transition to Idle with hasExitTime: true, exitTime: 0.9
      clipProgress = 0.5;
      expect(runner.evaluateTransitions()).toBe(false);
      expect(runner.currentState?.name).toBe('Jump');

      clipProgress = 0.95;
      expect(runner.evaluateTransitions()).toBe(true);
      expect(runner.currentState?.name).toBe('Idle');
    });

    it('updates pose progress for pose state nodes', () => {
      const onPoseProgress = vi.fn();
      const runner = new StateMachineRunner(sampleStateMachine, {
        onPoseProgress,
      });

      runner.evaluateTransitions(); // Entry -> Idle
      runner.setInputValue('speed', -1);
      runner.setInputValue('aimAngle', 0.75);
      runner.evaluateTransitions(); // Idle -> AimPose

      expect(runner.currentState?.name).toBe('AimPose');
      expect(onPoseProgress).toHaveBeenCalledWith('hero_aim', 0.75);

      // Tick updates pose when input changes
      runner.setInputValue('aimAngle', 0.9);
      runner.tick(16);
      expect(onPoseProgress).toHaveBeenCalledWith('hero_aim', 0.9);
    });
  });

  describe('4. Pointer, Keyboard, and Collision Listeners', () => {
    it('executes pointerdown and click listener actions', () => {
      const onPlaySound = vi.fn();
      const runner = new StateMachineRunner(sampleStateMachine, {
        onPlaySound,
      });

      runner.evaluateTransitions(); // Entry -> Idle

      // Pointerdown on btn-sprint sets speed to 5 and transitions to Run
      runner.handlePointerEvent('pointerdown', 'btn-sprint');
      expect(runner.getInputValue('speed')).toBe(5);
      expect(runner.currentState?.name).toBe('Run');

      // Click on non-matching target should do nothing
      runner.handlePointerEvent('click', 'btn-other');
      expect(runner.getInputValue('jumpTrigger')).toBe(false);

      // Click on btn-jump fires jump trigger and plays sound
      runner.handlePointerEvent('click', 'btn-jump');
      expect(onPlaySound).toHaveBeenCalledWith('snd-whoosh');
    });

    it('executes keydown listeners matching keyCode case-insensitively', () => {
      const runner = new StateMachineRunner(sampleStateMachine);
      runner.evaluateTransitions(); // Entry -> Idle

      expect(runner.getInputValue('jumpTrigger')).toBe(false);
      runner.handleKeyEvent('keydown', 'Space');
      expect(runner.getInputValue('jumpTrigger')).toBe(true);

      // Non-matching key
      runner.setInputValue('jumpTrigger', false);
      runner.handleKeyEvent('keydown', 'KeyX');
      expect(runner.getInputValue('jumpTrigger')).toBe(false);
    });

    it('executes collision listeners commutatively', () => {
      const onSpawnSymbol = vi.fn();
      const runner = new StateMachineRunner(sampleStateMachine, {
        onSpawnSymbol,
      });

      runner.setInputValue('speed', 10);

      // elementIdA = player-collider, elementIdB = enemy-hazard
      runner.handleCollisionEvent('player-collider', 'enemy-hazard');
      expect(runner.getInputValue('speed')).toBe(8);
      expect(onSpawnSymbol).toHaveBeenCalledWith('fx-sparks', 100, 150);

      // Commutative reverse: elementIdA = enemy-hazard, elementIdB = player-collider
      runner.handleCollisionEvent('enemy-hazard', 'player-collider');
      expect(runner.getInputValue('speed')).toBe(6);
      expect(onSpawnSymbol).toHaveBeenCalledTimes(2);
    });
  });

  describe('5. Ticker, Tick Listeners, and One-Shot Trigger Consumption', () => {
    it('executes tick listener actions and consumes one-shot triggers at end of tick', () => {
      const runner = new StateMachineRunner(sampleStateMachine);
      runner.evaluateTransitions(); // Entry -> Idle

      const initialSpeed = Number(runner.getInputValue('speed'));
      runner.tick(16);
      // lis-tick adds 0.05 to speed on every tick
      expect(runner.getInputValue('speed')).toBeCloseTo(initialSpeed + 0.05, 5);

      // Fire trigger
      runner.fireTrigger('jumpTrigger');
      expect(runner.getInputValue('jumpTrigger')).toBe(true);

      // Tick evaluates transitions: Idle -> Jump consumes jumpTrigger
      runner.tick(16);
      expect(runner.currentState?.name).toBe('Jump');
      // After tick, jumpTrigger was consumed and reset to false
      expect(runner.getInputValue('jumpTrigger')).toBe(false);
    });
  });

  describe('6. <web-anim> Component Integration', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      if (!customElements.get('web-anim')) {
        customElements.define('web-anim', WebAnim);
      }
    });

    afterEach(() => {
      container.remove();
    });

    const testDoc: AnimDocument = defineAnimation({
      version: 1,
      meta: {
        name: 'State Machine Component Test',
        createdAt: '2026-11-10T12:00:00Z',
        modifiedAt: '2026-11-10T12:00:00Z',
        editorVersion: '0.1.0',
      },
      stage: {
        width: 500,
        height: 400,
        fps: 30,
        background: { type: 'solid', color: '#111827' },
        scaleMode: 'showAll',
      },
      stateMachines: [sampleStateMachine],
      activeStateMachineId: 'sm-player',
      library: {
        symbols: {},
        fonts: {},
        bitmaps: {},
        sounds: {},
        videos: {},
      },
      root: {
        frameCount: 10,
        fps: 30,
        layers: [
          {
            id: 'l1',
            name: 'Layer 1',
            type: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 5,
                label: 'hero_idle',
                elements: [],
              },
              {
                id: 'kf2',
                index: 5,
                duration: 5,
                label: 'hero_run',
                elements: [],
              },
            ],
          },
        ],
      },
    });

    it('initializes StateMachineRunner and exposes helper methods on <web-anim>', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = testDoc;

      expect(el.stateMachineRunner).not.toBeNull();
      expect(el.stateMachineRunner?.currentState?.name).toBe('Entry');

      expect(el.getInputValue('speed')).toBe(0);
      el.setInputValue('speed', 10);
      expect(el.getInputValue('speed')).toBe(10);

      expect(el.getInputValue('jumpTrigger')).toBe(false);
      el.fireTrigger('jumpTrigger');
      expect(el.getInputValue('jumpTrigger')).toBe(true);
    });

    it('dispatches statechange, stateclipchange, and sound DOM events', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      const stateChangeSpy = vi.fn();
      const stateClipChangeSpy = vi.fn();
      const soundSpy = vi.fn();

      el.addEventListener('statechange', (e: any) => stateChangeSpy(e.detail));
      el.addEventListener('stateclipchange', (e: any) => stateClipChangeSpy(e.detail));
      el.addEventListener('sound', (e: any) => soundSpy(e.detail));

      el.animation = testDoc;

      // Initial entry state dispatched
      expect(stateChangeSpy).toHaveBeenCalledWith({ fromState: null, toState: 'Entry' });

      // Trigger first tick to transition from Entry to Idle
      el.stateMachineRunner?.tick(16);
      expect(stateChangeSpy).toHaveBeenCalledWith({ fromState: 'Entry', toState: 'Idle' });
      expect(stateClipChangeSpy).toHaveBeenCalledWith({
        clipName: 'hero_idle',
        loop: 'loop',
        speed: 1,
      });

      // Pointer event on jump button triggers sound event
      el.stateMachineRunner?.handlePointerEvent('click', 'btn-jump');
      expect(soundSpy).toHaveBeenCalledWith({ soundId: 'snd-whoosh' });
    });

    it('forwards window keyboard events to state machine when key listeners are declared', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = testDoc;

      el.stateMachineRunner?.tick(16); // Entry -> Idle
      expect(el.getInputValue('jumpTrigger')).toBe(false);

      // Dispatch Space keydown event on window
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(el.getInputValue('jumpTrigger')).toBe(true);
    });

    it('cleans up state machine and listeners on destroy()', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = testDoc;

      expect(el.stateMachineRunner).not.toBeNull();
      el.destroy();
      expect(el.stateMachineRunner).toBeNull();
    });

    it('selects state machine by name or id using state-machine attribute or property', () => {
      const combatStateMachine: StateMachineDef = {
        id: 'sm-combat',
        name: 'Combat',
        inputs: [{ id: 'in-combo', name: 'combo', type: 'number', value: 3 }],
        states: [
          { id: 'st-attack', name: 'Attack', type: 'clip', clipName: 'hero_attack' },
        ],
        transitions: [],
        listeners: [],
      };

      const multiDoc: AnimDocument = {
        ...testDoc,
        stateMachines: [sampleStateMachine, combatStateMachine],
        activeStateMachineId: 'sm-player',
      };

      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('state-machine', 'Combat');
      container.appendChild(el);
      el.animation = multiDoc;

      expect(el.stateMachineRunner?.def.name).toBe('Combat');
      expect(el.getInputValue('combo')).toBe(3);

      // Dynamically switch state machine via property
      el.stateMachine = 'PlayerController';
      expect(el.stateMachineRunner?.def.name).toBe('PlayerController');
      expect(el.getInputValue('speed')).toBe(0);
    });

    it('forwards pointer clicks from shadow DOM elements with data-el-id', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = testDoc;

      el.stateMachineRunner?.tick(16); // Entry -> Idle

      const shadow = el.shadowRoot!;
      const btn = document.createElement('button');
      btn.setAttribute('data-el-id', 'btn-jump');
      shadow.querySelector('.stage-viewport')?.appendChild(btn);

      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      expect(el.getInputValue('jumpTrigger')).toBe(true);
    });
  });
});
