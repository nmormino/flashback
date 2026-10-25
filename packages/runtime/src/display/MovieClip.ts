import type {
  MovieClipAPI,
  DisplayObjectAPI,
  MovieClipContext,
  InstanceName,
  FrameRef,
  ID,
  SoundHandle,
  ScriptFn,
  TimelineDef,
  SymbolDef,
  SymbolBehavior,
  Library,
} from '../schema';
import { DisplayObject } from './DisplayObject';
import { createContextProxy } from './contextProxy';

export interface TimelineController {
  seek(frameRef: FrameRef, play: boolean): void;
  getCurrentLabel(): string | null;
}

export class MovieClip extends DisplayObject implements MovieClipAPI {
  public timeline?: TimelineDef;
  public symbolDef?: SymbolDef;
  public behavior?: SymbolBehavior;
  public library?: Library;
  public timelineController?: TimelineController;

  public _currentFrame = 1; // 1-based frame number
  public _isPlaying = true;
  public buttonMode = false;
  public enabled = true;
  public vars: Record<string, unknown> = {};

  public _children: DisplayObject[] = [];
  public _childrenByName = new Map<InstanceName, DisplayObject>();
  public _childrenByElementId = new Map<ID, DisplayObject>();
  public _depths = new Map<number, DisplayObject>();
  public _childDepth = new Map<DisplayObject, number>();

  protected _timers = new Set<number>();
  private static _nextTimerId = 1;
  private static _timerMap = new Map<number, { timer: any; isInterval: boolean }>();

  constructor(name: InstanceName = '', timeline?: TimelineDef) {
    super(name);
    this.timeline = timeline;
    this._context = createContextProxy(this);
  }

  // --- Playhead Controls ---

  public play(): void {
    this._isPlaying = true;
  }

  public stop(): void {
    this._isPlaying = false;
  }

  public gotoAndPlay(frame: FrameRef): void {
    this._isPlaying = true;
    if (this.timelineController) {
      this.timelineController.seek(frame, true);
    } else {
      this.seekInternal(frame);
    }
  }

  public gotoAndStop(frame: FrameRef): void {
    this._isPlaying = false;
    if (this.timelineController) {
      this.timelineController.seek(frame, false);
    } else {
      this.seekInternal(frame);
    }
  }

  public nextFrame(): void {
    if (this.currentFrame < this.totalFrames) {
      this.gotoAndStop(this.currentFrame + 1);
    }
  }

  public prevFrame(): void {
    if (this.currentFrame > 1) {
      this.gotoAndStop(this.currentFrame - 1);
    }
  }

  public get currentFrame(): number {
    return this._currentFrame;
  }

  public get totalFrames(): number {
    return this.timeline?.frameCount ?? 1;
  }

  public get currentLabel(): string | null {
    if (this.timelineController) {
      return this.timelineController.getCurrentLabel();
    }
    return this.resolveCurrentLabel();
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  private seekInternal(frame: FrameRef): void {
    if (typeof frame === 'number') {
      this._currentFrame = Math.max(1, Math.min(this.totalFrames, Math.floor(frame)));
    } else if (typeof frame === 'string') {
      const idx = this.timeline?.labels?.[frame];
      if (idx !== undefined) {
        this._currentFrame = idx + 1; // Convert 0-based index to 1-based frame
      }
    }
  }

  private resolveCurrentLabel(): string | null {
    if (!this.timeline) return null;
    const current0Based = this._currentFrame - 1;

    // Check timeline.labels
    if (this.timeline.labels) {
      for (const [lbl, idx] of Object.entries(this.timeline.labels)) {
        if (idx === current0Based) return lbl;
      }
    }

    // Check keyframe labels
    for (const layer of this.timeline.layers) {
      for (const kf of layer.keyframes) {
        if (kf.label && kf.index <= current0Based && current0Based < kf.index + kf.duration) {
          return kf.label;
        }
      }
    }

    return null;
  }

  // --- Display List & Children ---

  public getChild<T extends DisplayObjectAPI = MovieClipContext>(name: InstanceName): T | null {
    const child = this._childrenByName.get(name);
    return child ? (child.context as unknown as T) : null;
  }

  public getChildRaw(name: InstanceName): DisplayObject | null {
    return this._childrenByName.get(name) ?? null;
  }

  public getChildByPath<T extends DisplayObjectAPI = MovieClipContext>(path: string): T | null {
    if (!path) return null;
    const parts = path.split('.');
    let curr: DisplayObject | null = this;

    for (const part of parts) {
      if (!curr) return null;
      const trimmed = part.trim();
      if (!trimmed || trimmed === 'this') continue;

      if (trimmed === 'parent' || trimmed === '_parent') {
        curr = curr._parent;
      } else if (trimmed === 'root' || trimmed === '_root') {
        curr = curr.getRoot();
      } else if (curr instanceof MovieClip) {
        curr = curr.getChildRaw(trimmed);
      } else {
        return null;
      }
    }

    return curr ? (curr.context as unknown as T) : null;
  }

  public get children(): ReadonlyArray<DisplayObjectAPI> {
    return this._children.map((c) => c.context as DisplayObjectAPI);
  }

  public get numChildren(): number {
    return this._children.length;
  }

  public addChild(child: DisplayObject, depth?: number): void {
    if (child._parent === this) {
      if (depth !== undefined) {
        this.swapDepthsInternal(child, depth);
      }
      return;
    }

    if (child._parent) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    child.rendererHooks = this.rendererHooks;
    if (this._stage) {
      child._stage = this._stage;
    }

    this._children.push(child);
    if (child.name) {
      this._childrenByName.set(child.name, child);
    }
    if (child.id) {
      this._childrenByElementId.set(child.id, child);
    }

    const assignedDepth = depth ?? this.getNextHighestDepth();
    this.placeAtDepth(child, assignedDepth);

    this.rendererHooks?.onChildAdded?.(this, child);
  }

  public removeChild(child: DisplayObject): void {
    const idx = this._children.indexOf(child);
    if (idx === -1) return;

    this._children.splice(idx, 1);
    if (child.name && this._childrenByName.get(child.name) === child) {
      this._childrenByName.delete(child.name);
    }
    if (child.id && this._childrenByElementId.get(child.id) === child) {
      this._childrenByElementId.delete(child.id);
    }

    const d = this._childDepth.get(child);
    if (d !== undefined) {
      this._depths.delete(d);
      this._childDepth.delete(child);
    }

    child._parent = null;
    this.rendererHooks?.onChildRemoved?.(this, child);
  }

  // --- Depth Management (Flash parity) ---

  public getNextHighestDepth(): number {
    let max = -1;
    for (const d of this._depths.keys()) {
      if (d > max) max = d;
    }
    return max + 1;
  }

  public swapDepths(target: number | DisplayObjectAPI): void {
    if (typeof target === 'number') {
      if (this._parent) {
        this._parent.swapDepthsInternal(this, target);
      }
    } else {
      const other = (target as any)._target ?? target;
      if (this._parent && other instanceof DisplayObject && other._parent === this._parent) {
        const d1 = this._parent._childDepth.get(this);
        const d2 = this._parent._childDepth.get(other);
        if (d1 !== undefined && d2 !== undefined) {
          this._parent._depths.set(d1, other);
          this._parent._depths.set(d2, this);
          this._parent._childDepth.set(this, d2);
          this._parent._childDepth.set(other, d1);
        }
      }
    }
  }

  private placeAtDepth(clip: DisplayObject, depth: number): void {
    const existing = this._depths.get(depth);
    if (existing && existing !== clip) {
      if (existing instanceof MovieClip) {
        existing.removeMovieClip();
      } else {
        this.removeChild(existing);
      }
    }
    this._depths.set(depth, clip);
    this._childDepth.set(clip, depth);
  }

  private swapDepthsInternal(clip: DisplayObject, newDepth: number): void {
    const oldDepth = this._childDepth.get(clip);
    const existing = this._depths.get(newDepth);

    if (existing && existing !== clip) {
      if (oldDepth !== undefined) {
        this._depths.set(oldDepth, existing);
        this._childDepth.set(existing, oldDepth);
      } else {
        this._depths.delete(newDepth);
      }
    } else if (oldDepth !== undefined) {
      this._depths.delete(oldDepth);
    }

    this._depths.set(newDepth, clip);
    this._childDepth.set(clip, newDepth);
  }

  // --- Dynamic MovieClips ---

  public attachMovie(
    linkageId: string,
    name: InstanceName,
    depth?: number,
    init?: Partial<DisplayObjectAPI> & Record<string, unknown>
  ): MovieClipContext {
    const lib = this.findLibrary();
    let symbolDef: SymbolDef | undefined;

    if (lib) {
      for (const sym of Object.values(lib.symbols)) {
        if (sym.linkageId === linkageId || sym.id === linkageId || sym.name === linkageId) {
          symbolDef = sym;
          break;
        }
      }
    }

    const clip = new MovieClip(name, symbolDef?.timeline);
    clip.symbolDef = symbolDef;
    clip.behavior = symbolDef?.behavior;
    clip.library = lib;

    if (init) {
      for (const [k, v] of Object.entries(init)) {
        (clip.context as any)[k] = v;
      }
    }

    this.addChild(clip, depth);

    // Run onConstruct lifecycle
    if (symbolDef?.behavior?.onConstruct) {
      try {
        symbolDef.behavior.onConstruct.call(clip.context);
      } catch (err) {
        console.error(`Error in onConstruct for attached clip ${name}:`, err);
      }
    }

    return clip.context;
  }

  public duplicateMovieClip(name: InstanceName, depth?: number): MovieClipContext {
    if (!this._parent) {
      throw new Error('Cannot duplicate a root MovieClip with no parent');
    }
    return this._parent.attachMovie(
      this.symbolDef?.linkageId ?? this.symbolDef?.id ?? this.name,
      name,
      depth ?? this._parent.getNextHighestDepth(),
      {
        x: this.x,
        y: this.y,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
        rotation: this.rotation,
        alpha: this.alpha,
        visible: this.visible,
        vars: { ...this.vars },
      }
    );
  }

  public removeMovieClip(): void {
    if (this._parent) {
      this.destroy();
      this._parent.removeChild(this);
    }
  }

  private findLibrary(): Library | undefined {
    let curr: DisplayObject | null = this;
    while (curr) {
      if (curr instanceof MovieClip && curr.library) {
        return curr.library;
      }
      curr = curr._parent;
    }
    return undefined;
  }

  // --- Interaction & Drag ---

  public startDrag(_lockCenter?: boolean, _bounds?: { left: number; top: number; right: number; bottom: number }): void {
    // Basic headless drag marker (full pointer tracking implemented in InputManager)
    (this.stage as any)._draggingClip = this;
  }

  public stopDrag(): void {
    if ((this.stage as any)._draggingClip === this) {
      (this.stage as any)._draggingClip = null;
    }
  }

  // --- Audio ---

  public playSound(_audioId: ID, _opts?: { loops?: number; volume?: number; pan?: number }): SoundHandle {
    // Headless stub for SoundHandle
    return {
      stop() {},
      volume: _opts?.volume ?? 1,
      pan: _opts?.pan ?? 0,
      position: 0,
    };
  }

  public stopAllSounds(): void {}

  // --- Timers Scoped to this MovieClip ---

  public setTimeout(fn: ScriptFn<MovieClipContext>, ms: number): number {
    const id = MovieClip._nextTimerId++;
    const timer = setTimeout(() => {
      this._timers.delete(id);
      MovieClip._timerMap.delete(id);
      try {
        fn.call(this.context);
      } catch (err) {
        console.error('Error in MovieClip.setTimeout callback:', err);
      }
    }, ms);

    this._timers.add(id);
    MovieClip._timerMap.set(id, { timer, isInterval: false });
    return id;
  }

  public setInterval(fn: ScriptFn<MovieClipContext>, ms: number): number {
    const id = MovieClip._nextTimerId++;
    const timer = setInterval(() => {
      try {
        fn.call(this.context);
      } catch (err) {
        console.error('Error in MovieClip.setInterval callback:', err);
      }
    }, ms);

    this._timers.add(id);
    MovieClip._timerMap.set(id, { timer, isInterval: true });
    return id;
  }

  public clearTimer(id: number): void {
    this._timers.delete(id);
    const entry = MovieClip._timerMap.get(id);
    if (entry) {
      if (entry.isInterval) {
        clearInterval(entry.timer);
      } else {
        clearTimeout(entry.timer);
      }
      MovieClip._timerMap.delete(id);
    }
  }

  public clearAllTimers(): void {
    for (const id of this._timers) {
      const entry = MovieClip._timerMap.get(id);
      if (entry) {
        if (entry.isInterval) {
          clearInterval(entry.timer);
        } else {
          clearTimeout(entry.timer);
        }
        MovieClip._timerMap.delete(id);
      }
    }
    this._timers.clear();
  }

  // --- Lifecycle & Destruction ---

  public destroy(): void {
    this.clearAllTimers();

    // Destroy children recursively
    for (const child of [...this._children]) {
      if (child instanceof MovieClip) {
        child.destroy();
      }
    }

    // Emit unload event
    this.emit('onUnload');
    this.rendererHooks?.onDestroy?.(this);
  }
}
