import type {
  AnimDocument,
  TimelineDef,
  LayerDef,
  KeyframeDef,
  DisplayElement,
  SymbolInstance,
  ShapeElement,
  TextElement,
  BitmapElement,
  VideoElement,
  TweenDef,
  FrameRef,
  FrameIndex,
  Library,
  MovieClipContext,
  ScriptFn,
  ReducedMotionMode,
  Easing,
  ID,
  Transform,
  ArtboardTransition,
} from '../schema';
import { MovieClip, type TimelineController } from '../display/MovieClip';
import { DisplayObject } from '../display/DisplayObject';
import { Matrix2D } from '../math/Matrix2D';
import { evaluateEasing } from './easing';
import { normalizeRotation } from './compileTracks';
import { ScriptVM } from '../script/ScriptVM';
import * as flubberModule from 'flubber';

const flubberInterpolate: typeof flubberModule.interpolate =
  (flubberModule as any).interpolate ?? (flubberModule as any).default?.interpolate;

export const morphCache = new Map<string, (t: number) => string>();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function parseColorRGBA(color: string): { r: number; g: number; b: number; a: number } | null {
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (c === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (c === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return {
      r: parseInt(c[1] + c[1], 16),
      g: parseInt(c[2] + c[2], 16),
      b: parseInt(c[3] + c[3], 16),
      a: 1,
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: 1,
    };
  }
  if (/^#[0-9a-f]{8}$/i.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: parseInt(c.slice(7, 9), 16) / 255,
    };
  }
  const rgbMatch = c.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/
  );
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]),
      g: parseFloat(rgbMatch[2]),
      b: parseFloat(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }
  return null;
}

export function interpolateColorString(c1: string, c2: string, t: number): string {
  if (c1 === c2 || t <= 0) return c1;
  if (t >= 1) return c2;
  const p1 = parseColorRGBA(c1);
  const p2 = parseColorRGBA(c2);
  if (!p1 || !p2) return t < 0.5 ? c1 : c2;
  const r = Math.round(lerp(p1.r, p2.r, t));
  const g = Math.round(lerp(p1.g, p2.g, t));
  const b = Math.round(lerp(p1.b, p2.b, t));
  const a = +(lerp(p1.a, p2.a, t)).toFixed(3);
  if (a >= 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Interpolates between two SVG path `d` strings when their command structures match,
 * or when both can be normalized to matching anchor/cubic-bezier segments.
 */
export function interpolateSvgPathD(d1: string, d2: string, t: number): string {
  if (d1 === d2 || t <= 0) return d1;
  if (t >= 1) return d2;

  const tokenRegex = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const t1 = d1.match(tokenRegex);
  const t2 = d2.match(tokenRegex);
  if (!t1 || !t2) return t < 0.5 ? d1 : d2;

  // Fast path: identical token count and command sequence
  if (t1.length === t2.length) {
    let compatible = true;
    const out: string[] = new Array(t1.length);
    let currentCmd = '';
    let argIndex = 0;

    for (let i = 0; i < t1.length; i++) {
      const a = t1[i];
      const b = t2[i];
      const isCmdA = /^[a-zA-Z]$/.test(a);
      const isCmdB = /^[a-zA-Z]$/.test(b);
      if (isCmdA || isCmdB) {
        if (a !== b) {
          compatible = false;
          break;
        }
        currentCmd = a.toUpperCase();
        argIndex = 0;
        out[i] = a;
      } else {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (Number.isNaN(na) || Number.isNaN(nb)) {
          compatible = false;
          break;
        }
        // Preserve boolean integer flags for SVG Arc (A/a) at arg positions 3 & 4 (modulo 7)
        if (currentCmd === 'A' && (argIndex % 7 === 3 || argIndex % 7 === 4)) {
          out[i] = String(t < 0.5 ? na : nb);
        } else {
          const val = Math.round((na + (nb - na) * t) * 100) / 100;
          out[i] = String(val);
        }
        argIndex++;
      }
    }

    if (compatible) {
      return out.join(' ');
    }
  }

  // Differing vertex counts or incompatible command structures: flubber morphing with caching
  const cacheKey = `${d1}__FLUBBER__${d2}`;
  try {
    let interpolator = morphCache.get(cacheKey);
    if (!interpolator) {
      if (typeof flubberInterpolate === 'function') {
        interpolator = flubberInterpolate(d1, d2, { maxSegmentLength: 4 });
        if (morphCache.size > 2000) morphCache.clear();
        morphCache.set(cacheKey, interpolator);
      }
    }
    if (interpolator) {
      const result = interpolator(t);
      if (result) return result;
    }
  } catch {
    // Degenerate/invalid shape fallback
  }

  return t < 0.5 ? d1 : d2;
}

export function computeEasingProgress(easing: Easing | undefined, t: number): number {
  if (!easing) return t;
  if (typeof (easing as any) === 'string') {
    const s = easing as unknown as string;
    if (s === 'ease-in') return t * t;
    if (s === 'ease-out') return 1 - (1 - t) * (1 - t);
    if (s === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (s === 'linear') return t;
    return evaluateEasing({ type: 'preset', name: s as any }, t);
  }
  if (easing.type === 'preset') {
    if (easing.name === 'ease-in') return t * t;
    if (easing.name === 'ease-out') return 1 - (1 - t) * (1 - t);
    if (easing.name === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  return evaluateEasing(easing, t);
}

export function getParentLayerMatrix(
  layerId: string | undefined,
  timeline: TimelineDef,
  exactFrame: number
): Matrix2D {
  if (!layerId || !timeline?.layers) return Matrix2D.identity();
  const layer = timeline.layers.find((l) => l.id === layerId);
  if (!layer || !layer.parentLayerId) return Matrix2D.identity();

  const ancestorLayers: LayerDef[] = [];
  let currId: string | undefined = layer.parentLayerId;
  const visited = new Set<string>();
  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const parent = timeline.layers.find((l) => l.id === currId);
    if (!parent) break;
    ancestorLayers.unshift(parent);
    currId = parent.parentLayerId;
  }

  let composed = Matrix2D.identity();
  for (const ancestor of ancestorLayers) {
    const kf = resolveKeyframe(ancestor, Math.floor(exactFrame));
    let t: Transform | undefined;
    if (kf) {
      if (kf.tween && kf.tween.type === 'motion') {
        const kfIdx = ancestor.keyframes.indexOf(kf);
        const nextKf = ancestor.keyframes[kfIdx + 1];
        if (nextKf && kf.duration > 0 && exactFrame >= kf.index) {
          const rawProg = Math.min(1, Math.max(0, (exactFrame - kf.index) / kf.duration));
          const prog = computeEasingProgress(kf.tween.easing, rawProg);
          const startT = kf.transform ?? ancestor.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 };
          const endT = nextKf.transform ?? ancestor.transform ?? startT;
          const { startRot, endRot } = normalizeRotation(startT.rotation ?? 0, endT.rotation ?? 0, kf.tween.rotate);
          t = {
            x: lerp(startT.x ?? 0, endT.x ?? 0, prog),
            y: lerp(startT.y ?? 0, endT.y ?? 0, prog),
            scaleX: lerp(startT.scaleX ?? 1, endT.scaleX ?? 1, prog),
            scaleY: lerp(startT.scaleY ?? 1, endT.scaleY ?? 1, prog),
            rotation: lerp(startRot, endRot, prog),
            skewX: lerp(startT.skewX ?? 0, endT.skewX ?? 0, prog),
            skewY: lerp(startT.skewY ?? 0, endT.skewY ?? 0, prog),
            originX: lerp(startT.originX ?? 0, endT.originX ?? 0, prog),
            originY: lerp(startT.originY ?? 0, endT.originY ?? 0, prog),
          };
        } else {
          t = kf.transform ?? ancestor.transform;
        }
      } else {
        t = kf.transform ?? ancestor.transform;
      }
    } else {
      t = ancestor.transform;
    }

    if (t) {
      const ancestorM = Matrix2D.fromTransform(t);
      composed = composed.multiply(ancestorM);
    }
  }

  return composed;
}

export function interpolateElement(
  el: DisplayElement,
  nextEl: DisplayElement,
  t: number,
  tween?: TweenDef
): DisplayElement {
  const tA = el.transform;
  const tB = nextEl.transform;

  const { startRot, endRot } = normalizeRotation(
    tA.rotation ?? 0,
    tB.rotation ?? 0,
    tween?.rotate
  );

  const interpolatedTransform = {
    ...tA,
    x: lerp(tA.x ?? 0, tB.x ?? 0, t),
    y: lerp(tA.y ?? 0, tB.y ?? 0, t),
    scaleX: lerp(tA.scaleX ?? 1, tB.scaleX ?? 1, t),
    scaleY: lerp(tA.scaleY ?? 1, tB.scaleY ?? 1, t),
    rotation: lerp(startRot, endRot, t),
    skewX: lerp(tA.skewX ?? 0, tB.skewX ?? 0, t),
    skewY: lerp(tA.skewY ?? 0, tB.skewY ?? 0, t),
    originX: lerp(tA.originX ?? tB.originX ?? 0, tB.originX ?? tA.originX ?? 0, t),
    originY: lerp(tA.originY ?? tB.originY ?? 0, tB.originY ?? tA.originY ?? 0, t),
    ...(tA.rotateX !== undefined || tB.rotateX !== undefined
      ? { rotateX: lerp(tA.rotateX ?? 0, tB.rotateX ?? 0, t) }
      : {}),
    ...(tA.rotateY !== undefined || tB.rotateY !== undefined
      ? { rotateY: lerp(tA.rotateY ?? 0, tB.rotateY ?? 0, t) }
      : {}),
    ...(tA.perspective !== undefined || tB.perspective !== undefined
      ? { perspective: lerp(tA.perspective ?? 800, tB.perspective ?? 800, t) }
      : {}),
  };

  const interpolatedAlpha = lerp(el.alpha ?? 1, nextEl.alpha ?? 1, t);

  if (el.type === 'shape' && nextEl.type === 'shape') {
    const sShape = el as ShapeElement;
    const eShape = nextEl as ShapeElement;
    let pathsChanged = false;
    const interpPaths = sShape.paths.map((pA, idx) => {
      const pB = eShape.paths[idx];
      if (!pB) return pA;
      const newD = pA.d !== pB.d ? interpolateSvgPathD(pA.d, pB.d, t) : pA.d;
      let newFill = pA.fill;
      if (
        pA.fill?.type === 'solid' &&
        pB.fill?.type === 'solid' &&
        pA.fill.color !== pB.fill.color
      ) {
        newFill = { type: 'solid', color: interpolateColorString(pA.fill.color, pB.fill.color, t) };
      }
      let newStroke = pA.stroke;
      if (pA.stroke && pB.stroke) {
        const sW = pA.stroke.width !== pB.stroke.width ? lerp(pA.stroke.width, pB.stroke.width, t) : pA.stroke.width;
        let sFill = pA.stroke.fill;
        if (
          pA.stroke.fill.type === 'solid' &&
          pB.stroke.fill.type === 'solid' &&
          pA.stroke.fill.color !== pB.stroke.fill.color
        ) {
          sFill = {
            type: 'solid',
            color: interpolateColorString(pA.stroke.fill.color, pB.stroke.fill.color, t),
          };
        }
        if (sW !== pA.stroke.width || sFill !== pA.stroke.fill) {
          newStroke = { ...pA.stroke, width: sW, fill: sFill };
        }
      }
      if (newD !== pA.d || newFill !== pA.fill || newStroke !== pA.stroke) {
        pathsChanged = true;
        return {
          ...pA,
          d: newD,
          ...(newFill ? { fill: newFill } : {}),
          ...(newStroke ? { stroke: newStroke } : {}),
        };
      }
      return pA;
    });

    return {
      ...sShape,
      transform: interpolatedTransform,
      alpha: interpolatedAlpha,
      paths: pathsChanged ? interpPaths : sShape.paths,
    };
  }

  if (el.type === 'bitmap' && nextEl.type === 'bitmap') {
    const sBmp = el as BitmapElement;
    const eBmp = nextEl as BitmapElement;
    return {
      ...sBmp,
      transform: interpolatedTransform,
      alpha: interpolatedAlpha,
      ...(sBmp.width !== undefined || eBmp.width !== undefined
        ? { width: lerp(sBmp.width ?? 200, eBmp.width ?? 200, t) }
        : {}),
      ...(sBmp.height !== undefined || eBmp.height !== undefined
        ? { height: lerp(sBmp.height ?? 150, eBmp.height ?? 150, t) }
        : {}),
    };
  }

  if (el.type === 'video' && nextEl.type === 'video') {
    const sVid = el as VideoElement;
    const eVid = nextEl as VideoElement;
    return {
      ...sVid,
      transform: interpolatedTransform,
      alpha: interpolatedAlpha,
      width: lerp(sVid.width ?? 320, eVid.width ?? 320, t),
      height: lerp(sVid.height ?? 180, eVid.height ?? 180, t),
    };
  }

  if (el.type === 'text' && nextEl.type === 'text') {
    const sTxt = el as TextElement;
    const eTxt = nextEl as TextElement;
    const fontSize = lerp(sTxt.fontSize || 16, eTxt.fontSize || 16, t);
    const color =
      sTxt.color && eTxt.color && sTxt.color !== eTxt.color
        ? interpolateColorString(sTxt.color, eTxt.color, t)
        : sTxt.color;
    return {
      ...sTxt,
      transform: interpolatedTransform,
      alpha: interpolatedAlpha,
      fontSize,
      ...(color ? { color } : {}),
      ...(sTxt.letterSpacing !== undefined || eTxt.letterSpacing !== undefined
        ? { letterSpacing: lerp(sTxt.letterSpacing ?? 0, eTxt.letterSpacing ?? 0, t) }
        : {}),
    };
  }

  return {
    ...el,
    transform: interpolatedTransform,
    alpha: interpolatedAlpha,
  };
}

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
  if (!layer.keyframes || layer.keyframes.length === 0) return null;
  const kfs = layer.keyframes;
  for (let i = 0; i < kfs.length; i++) {
    const kf = kfs[i];
    const nextKf = i < kfs.length - 1 ? kfs[i + 1] : null;
    const end = nextKf ? nextKf.index : kf.index + (kf.duration || 1);
    if (frameIndex >= kf.index && frameIndex < end) {
      return kf;
    }
  }
  const last = kfs[kfs.length - 1];
  if (last && frameIndex >= last.index && frameIndex < last.index + (last.duration || 1)) {
    return last;
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
  public layerByElementId = new Map<ID, LayerDef>();

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
    if (this.pipeline?.getEffectiveReducedMotion() === 'fixed') {
      return false;
    }
    const playMode = this.clip.playMode ?? (this.clip.loop === false ? 'once' : 'loop');
    if (playMode === 'stop') {
      this.clip._isPlaying = false;
      return false;
    }
    if (playMode === 'sync') {
      if (this.clip._parent instanceof MovieClip) {
        const parentFrame = this.clip._parent.currentFrame;
        const target = ((parentFrame - 1) % this.timelineDef.frameCount) + 1;
        if (target !== this.clip._currentFrame) {
          this.clip._currentFrame = target;
          return true;
        }
        return false;
      }
    }
    if (playMode === 'once') {
      if (this.clip.currentFrame >= this.timelineDef.frameCount) {
        this.clip._isPlaying = false;
        return false;
      }
      this.clip._currentFrame = this.clip.currentFrame + 1;
      return true;
    }
    const next = (this.clip.currentFrame % this.timelineDef.frameCount) + 1;
    this.clip._currentFrame = next;
    return true;
  }

  /**
   * Reconciles the display list for frameIndex (0-based) with optional subFrameProgress [0, 1)
   * for continuous 60Hz–120Hz+ rAF interpolation between start and end states.
   * Elements with stable ID across keyframes persist their instance, vars, and timers.
   */
  public reconcileDisplayList(frameIndex: number, subFrameProgress = 0): {
    addedClips: MovieClip[];
    removedClips: DisplayObject[];
  } {
    const effectiveMotion = this.pipeline?.getEffectiveReducedMotion() ?? 'full';
    let evalFrameIndex = frameIndex;

    if (effectiveMotion === 'fixed') {
      const poster = this.pipeline?.posterFrame ?? this.pipeline?.doc.stage.reducedMotion?.posterFrame ?? 1;
      evalFrameIndex = Math.max(0, poster - 1);
      if (this.clip._currentFrame !== evalFrameIndex + 1) {
        this.clip._currentFrame = evalFrameIndex + 1;
        this.clip._isPlaying = false;
      }
    } else if (effectiveMotion === 'stop-motion') {
      const step = 6;
      evalFrameIndex = Math.floor(frameIndex / step) * step;
    }

    const effectiveSubFrame =
      effectiveMotion === 'full' ? Math.max(0, Math.min(1, subFrameProgress)) : 0;
    const exactFrame = evalFrameIndex + effectiveSubFrame;

    const activeElements = new Map<string, DisplayElement>();
    const elementLayerInfo = new Map<string, { layerId: string; layerKind: string; maskLayerId?: string; depth: number }>();

    // Collect active elements from bottom layer to top layer (layers[0] is TOP in Flash schema)
    const layers = this.timelineDef.layers;
    for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
      const layer = layers[layerIdx];
      if (layer.kind === 'guide') continue; // Guide layers omitted from visual display
      const kf = resolveKeyframe(layer, evalFrameIndex);
      if (!kf) continue;

      let nextKf: KeyframeDef | null = null;
      if (kf.tween && (kf.tween.type === 'motion' || kf.tween.type === 'shape')) {
        const kfIdx = layer.keyframes.indexOf(kf);
        if (kfIdx >= 0 && kfIdx < layer.keyframes.length - 1) {
          nextKf = layer.keyframes[kfIdx + 1];
        }
      }

      const baseDepth = (layers.length - 1 - layerIdx) * 1000;
      for (let elIdx = 0; elIdx < kf.elements.length; elIdx++) {
        const el = kf.elements[elIdx];
        this.layerByElementId.set(el.id, layer);
        elementLayerInfo.set(el.id, {
          layerId: layer.id,
          layerKind: layer.kind,
          maskLayerId: layer.maskLayerId,
          depth: baseDepth + elIdx,
        });

        let activeEl = el;
        if (nextKf && exactFrame > kf.index) {
          const nextEl = nextKf.elements.find((e) => e.id === el.id);
          if (nextEl) {
            const spanFrames = Math.max(1, nextKf.index - kf.index);
            const rawT = Math.min(1, Math.max(0, (exactFrame - kf.index) / spanFrames));
            const easedT = computeEasingProgress(kf.tween?.easing, rawT);
            activeEl = interpolateElement(el, nextEl, easedT, kf.tween);
          }
        }

        activeElements.set(el.id, activeEl);
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
      const layerInfo = elementLayerInfo.get(id);

      if (existing) {
        // --- PERSISTENT ELEMENT ---
        // Retains instance identity, vars, timers; updates visual transform & filters
        const parentM = getParentLayerMatrix(layerInfo?.layerId, this.timelineDef, exactFrame);
        const parentMatrixChanged = !existing.parentLayerMatrix.equals(parentM);
        existing.parentLayerMatrix = parentM;
        if (layerInfo) {
          existing.layerId = layerInfo.layerId;
          existing.layerKind = layerInfo.layerKind;
          existing.maskLayerId = layerInfo.maskLayerId;
        }
        this.applyElementProperties(existing, el, parentMatrixChanged);
      } else {
        // --- NEW ELEMENT ---
        const newObj = this.instantiateElement(el);
        if (newObj) {
          const parentM = getParentLayerMatrix(layerInfo?.layerId, this.timelineDef, exactFrame);
          newObj.parentLayerMatrix = parentM;
          if (layerInfo) {
            newObj.layerId = layerInfo.layerId;
            newObj.layerKind = layerInfo.layerKind;
            newObj.maskLayerId = layerInfo.maskLayerId;
            this.clip.addChild(newObj, layerInfo.depth);
          } else {
            this.clip.addChild(newObj);
          }
          if (newObj instanceof MovieClip) {
            addedClips.push(newObj);
          }
        }
      }
    }

    return { addedClips, removedClips };
  }

  public executeFrameActions(frameIndex: number): void {
    if (!this.timelineDef?.layers) return;
    for (const layer of this.timelineDef.layers) {
      const kf = resolveKeyframe(layer, frameIndex);
      if (kf && kf.index === frameIndex && kf.actions) {
        const action = (kf.actions as any)?.__fn !== undefined ? (kf.actions as any).__fn : kf.actions;
        if (action) {
          if (this.pipeline) {
            this.pipeline.callUserScript(action, this.clip.context, 'actions');
          } else {
            ScriptVM.execute(action, this.clip.context);
          }
        }
      }
    }
  }

  private applyElementProperties(
    target: DisplayObject,
    el: DisplayElement,
    forceTransformUpdate = false
  ): void {
    const prevDef = target.currentDef;
    target.currentDef = el;

    const nx = el.transform.x;
    const ny = el.transform.y;
    const nsx = el.transform.scaleX;
    const nsy = el.transform.scaleY;
    const nrot = el.transform.rotation;
    const nkx = el.transform.skewX ?? 0;
    const nky = el.transform.skewY ?? 0;
    const nox = el.transform.originX ?? 0;
    const noy = el.transform.originY ?? 0;
    const prev3D = prevDef?.transform;
    const has3DChange =
      (prev3D?.rotateX ?? 0) !== (el.transform.rotateX ?? 0) ||
      (prev3D?.rotateY ?? 0) !== (el.transform.rotateY ?? 0) ||
      (prev3D?.perspective ?? 0) !== (el.transform.perspective ?? 0);

    const transformChanged =
      !prevDef ||
      target._x !== nx ||
      target._y !== ny ||
      target._scaleX !== nsx ||
      target._scaleY !== nsy ||
      target._rotation !== nrot ||
      target._skewX !== nkx ||
      target._skewY !== nky ||
      target._originX !== nox ||
      target._originY !== noy ||
      has3DChange;

    target._x = nx;
    target._y = ny;
    target._scaleX = nsx;
    target._scaleY = nsy;
    target._rotation = nrot;
    target._skewX = nkx;
    target._skewY = nky;
    target._originX = nox;
    target._originY = noy;

    if (transformChanged || forceTransformUpdate) {
      target.rendererHooks?.onTransformChange?.(target);
    }

    if (!prevDef || target._alpha !== el.alpha) {
      target.alpha = el.alpha;
    }
    if (!prevDef || target._visible !== el.visible) {
      target.visible = el.visible;
    }
    if (el.filters && el.filters !== prevDef?.filters) target.filters = el.filters;
    if (el.colorTransform && el.colorTransform !== prevDef?.colorTransform) {
      target.colorTransform = el.colorTransform;
    }
    if (el.blendMode && el.blendMode !== prevDef?.blendMode) target.blendMode = el.blendMode;
    if (el.instanceName) {
      target.name = el.instanceName;
      this.clip._childrenByName.set(el.instanceName, target);
    }
    if (el.id) {
      this.clip._childrenByName.set(el.id, target);
    }
    if (target instanceof MovieClip && el.type === 'instance') {
      const inst = el as SymbolInstance;
      if (inst.playMode !== undefined) target.playMode = inst.playMode;
      if (inst.loop !== undefined) target.loop = inst.loop;
      if (inst.autoplay !== undefined && !prevDef) {
        target.autoplay = inst.autoplay;
        if (inst.autoplay === false || inst.playMode === 'stop') {
          target._isPlaying = false;
        }
      }
    }
    if (el.events && (!prevDef || prevDef.events !== el.events)) {
      target.clearEventListeners();
      for (const [evtName, handler] of Object.entries(el.events)) {
        if (typeof handler === 'function') {
          target.on(evtName as any, handler as any);
        }
      }
    }
    if (prevDef && prevDef !== el) {
      target.rendererHooks?.onDefChange?.(target);
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
      if (el.playMode !== undefined) childClip.playMode = el.playMode;
      if (el.loop !== undefined) childClip.loop = el.loop;
      if (el.autoplay !== undefined) childClip.autoplay = el.autoplay;
      if (el.autoplay === false || el.playMode === 'stop') {
        childClip._isPlaying = false;
      }

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

    // Register event handlers on Shape, Text, Bitmap, Video elements
    if (el.events) {
      for (const [evtName, handler] of Object.entries(el.events)) {
        if (typeof handler === 'function') {
          obj.on(evtName as any, handler as any);
        }
      }
    }

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
  public reducedMotion: ReducedMotionMode = 'auto';
  public posterFrame: number = 1;

  private initialized = false;

  constructor(
    doc: AnimDocument,
    options?: {
      executionOrder?: ScriptExecutionOrder;
      errorHandler?: ScriptErrorHandler;
      reducedMotion?: ReducedMotionMode;
      posterFrame?: number;
    }
  ) {
    this.doc = doc;
    this.executionOrder = options?.executionOrder ?? 'parent-first';
    this.reducedMotion = options?.reducedMotion ?? doc.stage.reducedMotion?.mode ?? 'auto';
    this.posterFrame = options?.posterFrame ?? doc.stage.reducedMotion?.posterFrame ?? 1;
    this.errorHandler =
      options?.errorHandler ??
      ((err, clip, script) => {
        console.error(`[Flashback Script Error] ${script} on "${clip.name}":`, err);
      });

    const activeArtboard =
      doc.artboards && doc.artboards.length > 0
        ? doc.artboards.find((a) => a.id === doc.activeArtboardId) || doc.artboards[0]
        : undefined;
    const rootTimelineDef = activeArtboard?.root ?? doc.root;

    this.root = new MovieClip('root', rootTimelineDef);
    this.root.library = doc.library;
    this.root.vars.__locale = doc.i18n?.defaultLocale || 'en';
    this.rootTimeline = new Timeline(this.root, rootTimelineDef, doc.library, this);
  }

  public onGotoArtboard?: (idOrName: string, transition?: ArtboardTransition) => void;

  public gotoArtboard(idOrName: string, transition?: ArtboardTransition): void {
    if (this.onGotoArtboard) {
      this.onGotoArtboard(idOrName, transition);
    } else {
      this.switchArtboard(idOrName);
    }
  }

  public switchArtboard(idOrName: string): boolean {
    if (!this.doc.artboards || this.doc.artboards.length === 0) return false;
    const found =
      this.doc.artboards.find((a) => a.id === idOrName) ||
      this.doc.artboards.find((a) => a.name.toLowerCase() === idOrName.toLowerCase());
    if (!found) return false;

    this.doc.activeArtboardId = found.id;
    this.root.destroy();
    this.root = new MovieClip('root', found.root);
    this.root.library = this.doc.library;
    this.root.vars.__locale = this.doc.i18n?.defaultLocale || 'en';
    this.rootTimeline = new Timeline(this.root, found.root, this.doc.library, this);
    this.initialized = false;
    this.init();
    return true;
  }

  public getEffectiveReducedMotion(): 'full' | 'stop-motion' | 'fixed' {
    const mode = this.reducedMotion || this.doc.stage.reducedMotion?.mode || 'auto';
    if (mode === 'auto') {
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return 'fixed';
      }
      return 'full';
    }
    return mode;
  }

  public setReducedMotion(mode: ReducedMotionMode): void {
    this.reducedMotion = mode;
    if (this.getEffectiveReducedMotion() === 'fixed') {
      this.root.gotoAndStop(this.posterFrame);
    }
  }

  public setPosterFrame(frame: number): void {
    this.posterFrame = frame;
    if (this.getEffectiveReducedMotion() === 'fixed') {
      this.root.gotoAndStop(this.posterFrame);
    }
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

  /**
   * Renders continuous sub-frame tween interpolation at native display refresh rate (60Hz-120Hz+)
   * without advancing discrete frame numbers or re-firing frame scripts.
   */
  public render(subFrameProgress: number): void {
    if (!this.initialized) return;
    if (this.getEffectiveReducedMotion() !== 'full') return;

    const allClips = this.collectClips(this.root, 'parent-first');
    for (const clip of allClips) {
      if (clip.timelineController instanceof Timeline && clip.isPlaying) {
        clip.timelineController.reconcileDisplayList(
          Math.max(0, clip.currentFrame - 1),
          subFrameProgress
        );
      }
    }
  }

  public callUserScript(
    fn: ScriptFn<MovieClipContext, any[], any> | { __fn: string } | string,
    context: MovieClipContext,
    scriptName: string,
    ...args: any[]
  ): void {
    try {
      const codeOrFn =
        typeof fn === 'object' && fn !== null && '__fn' in fn
          ? (fn as any).__fn
          : fn;
      ScriptVM.execute(codeOrFn, context, args[0]);
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
