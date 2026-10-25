import type {
  AnimDocument,
  TimelineDef,
  LayerDef,
  KeyframeDef,
  DisplayElement,
  FrameRef,
  FrameIndex,
  Library,
  MovieClipContext,
  ScriptFn,
} from '../schema';
import { MovieClip, type TimelineController } from '../display/MovieClip';
import { DisplayObject } from '../display/DisplayObject';

/**
 * Script execution order strategy:
 * - 'parent-first': Pre-order traversal. The parent's script executes before its children.
 *   This is the default strategy in Flashback.
 * - 'children-first': Post-order traversal (Flash MX / AVM1 bottom-up parity proposal).
 *   Inner child clips run before outer parent clips.
 */
export type ScriptExecutionOrder = 'parent-first' | 'children-first';

export type ScriptErrorHandler = (
  error: unknown,
  clip: MovieClipContext,
  scriptName: string
) => void;

export function resolveKeyframe(layer: LayerDef, frameIndex: number): KeyframeDef | null {
  for (const kf of layer.keyframes) {
    if (frameIndex >= kf.index && frameIndex < kf.index + kf.duration) {
      return kf;
    }
  }
  return null;
}

export function resolveFrameIndex(timeline: TimelineDef, frameRef: FrameRef): number | null {
  if (typeof frameRef === 'number') {
    const idx = Math.floor(frameRef) - 1;
    if (idx >= 0 && idx < timeline.frameCount) {
      return idx;
    }
    return null;
  }

  if (typeof frameRef === 'string') {
    if (timeline.labels && frameRef in timeline.labels) {
      return timeline.labels[frameRef];
    }
    for (const layer of timeline.layers) {
      for (const kf of layer.keyframes) {
        if (kf.label === frameRef) {
          return kf.index;
        }
      }
    }
  }

  return null;
}

/**
 * Manages the playhead and keyframe reconciliation for a single MovieClip.
 */
export class Timeline implements TimelineController {
  public clip: MovieClip;
  public timelineDef: TimelineDef;
  public library?: Library;
  public pipeline?: TimelinePipeline;

  // Mid-script recursion / infinite loop guard (reset each tick)
  public visitedFramesInCurrentTick = new Set<number>();

  constructor(
    clip: MovieClip,
    timelineDef: TimelineDef,
    library?: Library,
    pipeline?: TimelinePipeline
  ) {
    this.clip = clip;
    this.timelineDef = timelineDef;
    this.library = library;
    this.pipeline = pipeline;
    this.clip.timeline = timelineDef;
    this.clip.timelineController = this;
  }

  public getCurrentLabel(): string | null {
    const current0Based = this.clip.currentFrame - 1;
    if (this.timelineDef.labels) {
      for (const [lbl, idx] of Object.entries(this.timelineDef.labels)) {
        if (idx === current0Based) return lbl;
      }
    }
    for (const layer of this.timelineDef.layers) {
      for (const kf of layer.keyframes) {
        if (kf.label && kf.index <= current0Based && current0Based < kf.index + kf.duration) {
          return kf.label;
        }
      }
    }
    return null;
  }

  /**
   * Mid-script seek semantics:
   * 1. Updates playhead position immediately
   * 2. Reconciles display list immediately so following code in the current script
   *    can access child instances present on the target frame
   * 3. Executes target frame actions (guarded against infinite recursion)
   */
  public seek(frameRef: FrameRef, play: boolean): void {
    const targetIdx = resolveFrameIndex(this.timelineDef, frameRef);
    if (targetIdx === null) return;

    const targetFrame = targetIdx + 1; // 1-based
    this.clip._currentFrame = targetFrame;
    this.clip._isPlaying = play;

    // Immediately reconcile display list
    const { addedClips } = this.reconcileDisplayList(targetIdx);

    // Run onConstruct on new clips immediately
    for (const newClip of addedClips) {
      if (newClip.behavior?.onConstruct) {
        this.pipeline?.callUserScript(
          newClip.behavior.onConstruct,
          newClip.context,
          'onConstruct'
        );
      }
    }

    // Guard against infinite cycles in a single tick
    if (!this.visitedFramesInCurrentTick.has(targetFrame)) {
      this.visitedFramesInCurrentTick.add(targetFrame);
      this.executeFrameActions(targetIdx);
      this.clip.emit('onFrameEnter', targetFrame);
    }
  }

  public advancePlayhead(): boolean {
    if (!this.clip.isPlaying || this.timelineDef.frameCount <= 1) {
      return false;
    }
    const next = (this.clip.currentFrame % this.timelineDef.frameCount) + 1;
    this.clip._currentFrame = next;
    return true;
  }

  /**
   * Reconciles the display list for frameIndex (0-based).
   * Elements with stable ID across keyframes persist their instance, vars, and timers.
   */
  public reconcileDisplayList(frameIndex: number): {
    addedClips: MovieClip[];
    removedClips: DisplayObject[];
  } {
    const activeElements = new Map<string, DisplayElement>();

    // Collect active elements from all layers
    for (const layer of this.timelineDef.layers) {
      if (layer.kind === 'guide') continue; // Guide layers omitted from visual display
      const kf = resolveKeyframe(layer, frameIndex);
      if (kf) {
        for (const el of kf.elements) {
          activeElements.set(el.id, el);
        }
      }
    }

    const removedClips: DisplayObject[] = [];
    const addedClips: MovieClip[] = [];

    // 1. Remove elements that are no longer active
    for (const [id, child] of Array.from(this.clip._childrenByElementId.entries())) {
      if (!activeElements.has(id)) {
        if (child instanceof MovieClip) {
          child.destroy();
          removedClips.push(child);
        } else {
          child.emit('onUnload');
        }
        this.clip.removeChild(child);
      }
    }

    // 2. Add new elements or update persistent ones
    for (const [id, el] of activeElements.entries()) {
      const existing = this.clip._childrenByElementId.get(id);

      if (existing) {
        // --- PERSISTENT ELEMENT ---
        // Retains instance identity, vars, timers; updates visual transform & filters
        this.applyElementProperties(existing, el);
      } else {
        // --- NEW ELEMENT ---
        const newObj = this.instantiateElement(el);
        if (newObj) {
          this.clip.addChild(newObj);
          if (newObj instanceof MovieClip) {
            addedClips.push(newObj);
          }
        }
      }
    }

    return { addedClips, removedClips };
  }

  public executeFrameActions(frameIndex: number): void {
    for (const layer of this.timelineDef.layers) {
      const kf = resolveKeyframe(layer, frameIndex);
      if (kf && kf.index === frameIndex && kf.actions) {
        this.pipeline?.callUserScript(kf.actions, this.clip.context, 'actions');
      }
    }
  }

  private applyElementProperties(target: DisplayObject, el: DisplayElement): void {
    target.x = el.transform.x;
    target.y = el.transform.y;
    target.scaleX = el.transform.scaleX;
    target.scaleY = el.transform.scaleY;
    target.rotation = el.transform.rotation;
    target.skewX = el.transform.skewX ?? 0;
    target.skewY = el.transform.skewY ?? 0;
    target.originX = el.transform.originX ?? 0;
    target.originY = el.transform.originY ?? 0;
    target.alpha = el.alpha;
    target.visible = el.visible;
    if (el.filters) target.filters = el.filters;
    if (el.colorTransform) target.colorTransform = el.colorTransform;
    if (el.blendMode) target.blendMode = el.blendMode;
    if (el.instanceName) {
      target.name = el.instanceName;
      this.clip._childrenByName.set(el.instanceName, target);
    }
  }

  private instantiateElement(el: DisplayElement): DisplayObject | null {
    if (el.type === 'instance') {
      const lib = this.library ?? this.clip.library;
      const symbolDef = lib?.symbols?.[el.symbolId];

      const childClip = new MovieClip(el.instanceName ?? '', symbolDef?.timeline);
      childClip.id = el.id;
      childClip.symbolDef = symbolDef;
      childClip.behavior = symbolDef?.behavior;
      childClip.library = lib;

      if (symbolDef?.timeline) {
        const childTimeline = new Timeline(
          childClip,
          symbolDef.timeline,
          lib,
          this.pipeline
        );
        childTimeline.reconcileDisplayList(0);
      }

      this.applyElementProperties(childClip, el);

      // Register instance event handlers
      if (el.events) {
        for (const [evtName, handler] of Object.entries(el.events)) {
          if (typeof handler === 'function') {
            childClip.on(evtName as any, handler as any);
          }
        }
      }

      return childClip;
    }

    // Shape, Text, or Bitmap display nodes
    const obj = new DisplayObject(el.instanceName ?? '');
    obj.id = el.id;
    this.applyElementProperties(obj, el);
    return obj;
  }
}

/**
 * Orchestrates document lifecycle, ticking, display tree synchronization,
 * and multi-phase script execution across all active timelines.
 */
export class TimelinePipeline {
  public root: MovieClip;
  public doc: AnimDocument;
  public rootTimeline: Timeline;
  public executionOrder: ScriptExecutionOrder;
  public errorHandler: ScriptErrorHandler;

  private initialized = false;

  constructor(
    doc: AnimDocument,
    options?: {
      executionOrder?: ScriptExecutionOrder;
      errorHandler?: ScriptErrorHandler;
    }
  ) {
    this.doc = doc;
    this.executionOrder = options?.executionOrder ?? 'parent-first';
    this.errorHandler =
      options?.errorHandler ??
      ((err, clip, script) => {
        console.error(`[Flashback Script Error] ${script} on "${clip.name}":`, err);
      });

    this.root = new MovieClip('root', doc.root);
    this.root.library = doc.library;
    this.rootTimeline = new Timeline(this.root, doc.root, doc.library, this);
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Phase 0: Document onInit
    if (this.doc.onInit) {
      this.callUserScript(this.doc.onInit, this.root.context, 'onInit');
    }

    // Phase 1: Reconcile frame 1 of root
    const { addedClips } = this.rootTimeline.reconcileDisplayList(0);

    // Phase 2: Run onConstruct for frame 1 instances
    for (const clip of addedClips) {
      if (clip.behavior?.onConstruct) {
        this.callUserScript(clip.behavior.onConstruct, clip.context, 'onConstruct');
      }
    }

    // Phase 3: Run onLoad for frame 1 instances
    for (const clip of addedClips) {
      clip.emit('onLoad');
    }

    // Phase 4: Run frame 1 actions across all active clips according to executionOrder
    const activeClips = this.collectClips(this.root, this.executionOrder);
    for (const clip of activeClips) {
      if (clip.timelineController instanceof Timeline) {
        clip.timelineController.executeFrameActions(0);
        clip.emit('onFrameEnter', 1);
      }
    }

    this.clearCycleGuards();
  }

  /**
   * Executes a single frame tick across the entire animation tree:
   * 1. Advance playheads of playing clips
   * 2. Reconcile display lists for clips that moved
   * 3. Run onConstruct for newly instantiated clips
   * 4. Run onLoad for newly added instances
   * 5. Dispatch onEnterFrame across all clips (even if stopped)
   * 6. Dispatch frame actions & onFrameEnter
   * 7. Clear cycle guards
   */
  public tick(): void {
    if (!this.initialized) {
      this.init();
      return;
    }

    // Collect all MovieClips in tree
    const allClips = this.collectClips(this.root, this.executionOrder);

    // 1. Advance playheads
    const advancedClips: MovieClip[] = [];
    for (const clip of allClips) {
      if (clip.timelineController instanceof Timeline) {
        if (clip.timelineController.advancePlayhead()) {
          advancedClips.push(clip);
        }
      }
    }

    // 2. Reconcile display lists & collect new clips
    const newClips: MovieClip[] = [];
    for (const clip of advancedClips) {
      if (clip.timelineController instanceof Timeline) {
        const { addedClips } = clip.timelineController.reconcileDisplayList(
          clip.currentFrame - 1
        );
        newClips.push(...addedClips);
      }
    }

    // 3. Run onConstruct on new clips immediately
    for (const clip of newClips) {
      if (clip.behavior?.onConstruct) {
        this.callUserScript(clip.behavior.onConstruct, clip.context, 'onConstruct');
      }
    }

    // 4. Run onLoad on new clips
    for (const clip of newClips) {
      clip.emit('onLoad');
    }

    // 5. Run onEnterFrame on all active clips in tree (Flash parity: even if stopped)
    const activeClipsForEnterFrame = this.collectClips(this.root, this.executionOrder);
    for (const clip of activeClipsForEnterFrame) {
      clip.emit('onEnterFrame');
    }

    // 6. Run frame actions and onFrameEnter for clips that entered a new frame
    const clipsForFrameActions = this.filterClipsByOrder(advancedClips, this.executionOrder);
    for (const clip of clipsForFrameActions) {
      if (clip.timelineController instanceof Timeline) {
        const frame0 = clip.currentFrame - 1;
        clip.timelineController.executeFrameActions(frame0);
        clip.emit('onFrameEnter', clip.currentFrame);
      }
    }

    // 7. Clear cycle guards
    this.clearCycleGuards();
  }

  public callUserScript(
    fn: ScriptFn<MovieClipContext, any[], any>,
    context: MovieClipContext,
    scriptName: string,
    ...args: any[]
  ): void {
    try {
      fn.call(context, ...args);
    } catch (err) {
      this.errorHandler(err, context, scriptName);
    }
  }

  public setExecutionOrder(order: ScriptExecutionOrder): void {
    this.executionOrder = order;
  }

  public clearCycleGuards(): void {
    const clips = this.collectClips(this.root, 'parent-first');
    for (const clip of clips) {
      if (clip.timelineController instanceof Timeline) {
        clip.timelineController.visitedFramesInCurrentTick.clear();
      }
    }
  }

  private collectClips(node: MovieClip, order: ScriptExecutionOrder): MovieClip[] {
    const result: MovieClip[] = [];

    const traverse = (clip: MovieClip) => {
      if (order === 'parent-first') {
        result.push(clip);
      }
      for (const child of clip._children) {
        if (child instanceof MovieClip) {
          traverse(child);
        }
      }
      if (order === 'children-first') {
        result.push(clip);
      }
    };

    traverse(node);
    return result;
  }

  private filterClipsByOrder(clips: MovieClip[], order: ScriptExecutionOrder): MovieClip[] {
    const all = this.collectClips(this.root, order);
    const set = new Set(clips);
    return all.filter((c) => set.has(c));
  }
}
