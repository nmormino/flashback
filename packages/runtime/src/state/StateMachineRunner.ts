import type {
  StateMachineDef,
  StateMachineInput,
  StateNode,
  StateTransition,
  StateCondition,
  StateListenerAction,
} from '../schema';

export interface StateMachineContext {
  onPlayClip?: (clipName: string, loop?: boolean | string, speed?: number) => void;
  onBlendClips?: (fromClip: string, toClip: string, weight: number) => void;
  onPoseProgress?: (clipName: string, progress: number) => void;
  onSpawnSymbol?: (symbolId: string, x?: number, y?: number) => void;
  onPlaySound?: (soundId: string) => void;
  onCustomEvent?: (name: string, payload?: any) => void;
  onStateChange?: (fromState: string | null, toState: string) => void;
  getCurrentClipProgress?: () => number;
}

export class StateMachineRunner {
  public readonly def: StateMachineDef;
  public context?: StateMachineContext;
  public inputs = new Map<string, StateMachineInput>();
  public currentState: StateNode | null = null;
  public activeTransition: {
    fromState: StateNode;
    toState: StateNode;
    durationMs: number;
    elapsedMs: number;
  } | null = null;
  public consumedTriggers = new Set<string>();

  private _stateMap = new Map<string, StateNode>();
  public currentClipProgress = 0;

  constructor(def: StateMachineDef, context?: StateMachineContext) {
    this.def = def;
    this.context = context;

    // Index inputs by both id and name
    if (def.inputs) {
      for (const input of def.inputs) {
        const copy: StateMachineInput = {
          id: input.id,
          name: input.name,
          type: input.type,
          value: input.value,
        };
        this.inputs.set(copy.id, copy);
        this.inputs.set(copy.name, copy);
      }
    }

    // Index states by both id and name
    if (def.states) {
      for (const state of def.states) {
        this._stateMap.set(state.id, state);
        this._stateMap.set(state.name, state);
      }
    }

    // Current state starts at 'entry' node or first state
    const entryNode = def.states?.find((s) => s.type === 'entry') || def.states?.[0] || null;
    this.currentState = entryNode;

    if (this.currentState) {
      this.context?.onStateChange?.(null, this.currentState.name);
      if (this.currentState.clipName) {
        this.context?.onPlayClip?.(
          this.currentState.clipName,
          this.currentState.loop,
          this.currentState.speed
        );
      }
    }
  }

  public getInputValue(nameOrId: string): boolean | number | undefined {
    return this.inputs.get(nameOrId)?.value;
  }

  public setInputValue(nameOrId: string, value: boolean | number): void {
    const input = this.inputs.get(nameOrId);
    if (!input) return;
    if (input.type === 'boolean') {
      input.value = Boolean(value);
    } else if (input.type === 'number') {
      input.value = Number(value);
    } else if (input.type === 'trigger') {
      input.value = Boolean(value);
      if (input.value) {
        this.consumedTriggers.delete(input.id);
        this.consumedTriggers.delete(input.name);
      }
    } else {
      input.value = value;
    }
  }

  public changeInputValue(nameOrId: string, delta: number): void {
    const input = this.inputs.get(nameOrId);
    if (!input) return;
    if (typeof input.value === 'number') {
      input.value += delta;
    } else if (typeof input.value === 'boolean') {
      input.value = Number(input.value) + delta !== 0;
    }
  }

  public fireTrigger(nameOrId: string): void {
    const input = this.inputs.get(nameOrId);
    if (!input) return;
    input.value = true;
    this.consumedTriggers.delete(input.id);
    this.consumedTriggers.delete(input.name);
  }

  public evaluateConditions(conditions: StateCondition[]): boolean {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    for (const cond of conditions) {
      const input = this.inputs.get(cond.inputId);
      if (!input) {
        return false;
      }

      const currentVal = input.value;
      const targetVal = cond.value;

      switch (cond.op) {
        case '==':
          if (typeof targetVal === 'boolean') {
            if (Boolean(currentVal) !== targetVal) return false;
          } else if (typeof targetVal === 'number') {
            if (Number(currentVal) !== targetVal) return false;
          } else {
            if (currentVal != targetVal) return false;
          }
          break;

        case '!=':
          if (typeof targetVal === 'boolean') {
            if (Boolean(currentVal) === targetVal) return false;
          } else if (typeof targetVal === 'number') {
            if (Number(currentVal) === targetVal) return false;
          } else {
            if (currentVal == targetVal) return false;
          }
          break;

        case '>':
          if (Number(currentVal) <= Number(targetVal)) return false;
          break;

        case '<':
          if (Number(currentVal) >= Number(targetVal)) return false;
          break;

        case '>=':
          if (Number(currentVal) < Number(targetVal)) return false;
          break;

        case '<=':
          if (Number(currentVal) > Number(targetVal)) return false;
          break;

        default:
          return false;
      }
    }

    return true;
  }

  public evaluateTransitions(): boolean {
    if (!this.currentState || !this.def.transitions) {
      return false;
    }

    // If currently in an active blend transition, do not initiate another transition
    if (this.activeTransition !== null) {
      return false;
    }

    for (const transition of this.def.transitions) {
      // Check fromState
      const matchesFrom =
        transition.fromStateId === '*' ||
        transition.fromStateId === this.currentState.id ||
        transition.fromStateId === this.currentState.name;

      if (!matchesFrom) {
        continue;
      }

      // Check exitTime if configured
      if (transition.hasExitTime) {
        const requiredExitTime = transition.exitTime ?? 1.0;
        const progress = this.context?.getCurrentClipProgress
          ? this.context.getCurrentClipProgress()
          : this.currentClipProgress;
        if (progress < requiredExitTime) {
          continue;
        }
      }

      // Check transition conditions
      if (!this.evaluateConditions(transition.conditions)) {
        continue;
      }

      // Locate destination state
      const toState =
        this._stateMap.get(transition.toStateId) ||
        this.def.states?.find(
          (s) => s.id === transition.toStateId || s.name === transition.toStateId
        );
      if (!toState) {
        continue;
      }

      // Consume one-shot triggers verified in matched conditions
      if (transition.conditions) {
        for (const cond of transition.conditions) {
          const input = this.inputs.get(cond.inputId);
          if (input && input.type === 'trigger') {
            this.consumedTriggers.add(input.id);
            this.consumedTriggers.add(input.name);
          }
        }
      }

      // Execute state transition
      this.transitionTo(toState, transition);
      return true;
    }

    return false;
  }

  private transitionTo(toState: StateNode, transition?: StateTransition): void {
    const fromState = this.currentState;
    this.currentState = toState;
    this.currentClipProgress = 0;

    if (transition && transition.durationMs && transition.durationMs > 0 && fromState) {
      this.activeTransition = {
        fromState,
        toState,
        durationMs: transition.durationMs,
        elapsedMs: 0,
      };
      if (fromState.clipName && toState.clipName) {
        this.context?.onBlendClips?.(fromState.clipName, toState.clipName, 0);
      }
    } else {
      this.activeTransition = null;
    }

    this.context?.onStateChange?.(fromState ? fromState.name : null, toState.name);

    if (toState.clipName) {
      this.context?.onPlayClip?.(toState.clipName, toState.loop, toState.speed);
    }

    if (toState.type === 'pose' && toState.poseInputId && toState.clipName) {
      const progress = Number(this.getInputValue(toState.poseInputId) ?? 0);
      this.context?.onPoseProgress?.(toState.clipName, progress);
    }
  }

  public tick(deltaMs: number): void {
    // 1. Evaluates 'tick' listeners (e.g. game counters, speed increments)
    if (this.def.listeners) {
      for (const listener of this.def.listeners) {
        if (listener.eventType === 'tick') {
          this.executeActions(listener.actions);
        }
      }
    }

    // 2. Advances active transition if in blend
    if (this.activeTransition) {
      this.activeTransition.elapsedMs += deltaMs;
      const progress = Math.min(
        1,
        this.activeTransition.elapsedMs / this.activeTransition.durationMs
      );
      if (this.activeTransition.fromState.clipName && this.activeTransition.toState.clipName) {
        this.context?.onBlendClips?.(
          this.activeTransition.fromState.clipName,
          this.activeTransition.toState.clipName,
          progress
        );
      }
      if (this.activeTransition.elapsedMs >= this.activeTransition.durationMs) {
        this.activeTransition = null;
      }
    }

    // Update pose progress if in pose state
    if (
      this.currentState?.type === 'pose' &&
      this.currentState.poseInputId &&
      this.currentState.clipName
    ) {
      const progress = Number(this.getInputValue(this.currentState.poseInputId) ?? 0);
      this.context?.onPoseProgress?.(this.currentState.clipName, progress);
    }

    // 3. Evaluates transitions: checks exit time and condition operators
    this.evaluateTransitions();

    // 4. Clears consumed one-shot triggers at end of tick
    if (this.consumedTriggers.size > 0) {
      for (const triggerId of this.consumedTriggers) {
        const input = this.inputs.get(triggerId);
        if (input && input.type === 'trigger') {
          input.value = false;
        }
      }
      this.consumedTriggers.clear();
    }
  }

  public handlePointerEvent(
    eventType: 'pointerdown' | 'pointerup' | 'pointerenter' | 'pointerleave' | 'click',
    targetElementId?: string
  ): void {
    if (!this.def.listeners) return;
    for (const listener of this.def.listeners) {
      if (listener.eventType === eventType) {
        if (!listener.targetElementId || listener.targetElementId === targetElementId) {
          this.executeActions(listener.actions);
        }
      }
    }
    this.evaluateTransitions();
  }

  public handleKeyEvent(eventType: 'keydown' | 'keyup', keyCode: string): void {
    if (!this.def.listeners) return;
    for (const listener of this.def.listeners) {
      if (listener.eventType === eventType) {
        if (
          !listener.keyCode ||
          listener.keyCode.toLowerCase() === keyCode.toLowerCase()
        ) {
          this.executeActions(listener.actions);
        }
      }
    }
    this.evaluateTransitions();
  }

  public handleCollisionEvent(elementIdA: string, elementIdB: string): void {
    if (!this.def.listeners) return;
    for (const listener of this.def.listeners) {
      if (listener.eventType === 'collision') {
        const matches =
          (!listener.targetElementId && !listener.collisionWithElementId) ||
          (listener.targetElementId === elementIdA &&
            (!listener.collisionWithElementId || listener.collisionWithElementId === elementIdB)) ||
          (listener.targetElementId === elementIdB &&
            (!listener.collisionWithElementId || listener.collisionWithElementId === elementIdA));

        if (matches) {
          this.executeActions(listener.actions);
        }
      }
    }
    this.evaluateTransitions();
  }

  public executeActions(actions: StateListenerAction[]): void {
    if (!actions) return;
    for (const action of actions) {
      switch (action.type) {
        case 'fire_trigger':
          if (action.inputId) {
            this.fireTrigger(action.inputId);
          }
          break;
        case 'set_input':
          if (action.inputId && action.value !== undefined) {
            this.setInputValue(action.inputId, action.value);
          }
          break;
        case 'change_input':
          if (action.inputId && action.delta !== undefined) {
            this.changeInputValue(action.inputId, action.delta);
          }
          break;
        case 'spawn_clip':
          if (action.symbolId) {
            this.context?.onSpawnSymbol?.(action.symbolId, action.x, action.y);
          }
          break;
        case 'play_sound':
          if (action.soundId) {
            this.context?.onPlaySound?.(action.soundId);
          }
          break;
        default:
          this.context?.onCustomEvent?.((action as any).name || action.type, action);
          break;
      }
    }
  }
}
