import { useSyncExternalStore } from 'react';
import type {
  DisplayElement,
  KeyframeDef,
  LayerDef,
  StageDef,
  SymbolDef,
  SymbolInstance,
  SymbolKind,
  TimelineDef,
  Transform,
  Filter,
  FontAsset,
  Fill,
  ShapeElement,
  TextElement,
  TextSpan,
  BitmapElement,
  VideoElement,
  BitmapAsset,
  StageBreakpoint,
  ReducedMotionMode,
  I18nDef,
  LayoutPin,
  LayerKind,
  Easing,
  Artboard,
  CornerType,
  RectCornerRadius,
  RectCornerTypes,
  RectConfig,
  OvalConfig,
  StateVariable,
  StateVariableType,
  StateMachineDef,
  StateMachineInput,
  StateNode,
  StateNodeType,
  StateTransition,
  StateCondition,
  ConditionOperator,
  StateListener,
  StateListenerAction,
  StateListenerEventType,
  StateListenerActionType,
} from '@flashback/runtime';
import { Matrix2D } from '@flashback/runtime';
import {
  unitePaths,
  subtractPaths,
  intersectPaths,
  excludePaths,
  expandStroke,
  fitPointsToCurve,
  convertTextToVectorPath,
  getGeometryPaperScope,
  extractPathData,
} from '../utils/geometry';
import {
  serialize,
  parse,
  validate,
  type EditorDocument,
  type ScriptSource,
} from '@flashback/serializer';
import { createDefaultDocument } from './defaultDoc';
import {
  generatePolygonStarPath,
  generateRoundedRectPath,
  generateOvalPath,
  getShapeBounds,
  applyCornerRadiusToPath,
  getUniformCornerRadius,
  getUniformCornerType,
} from '../utils/shapeGenerators';
import {
  insertPointOnPathSegment,
  deletePathAnchor as deleteAnchorFromPathD,
  parseSvgPath,
  openPath,
  closePath,
  isPathClosed,
  slicePathAtPoint,
  fitCurveToPoints,
  samplePointsFromPath,
  toggleAnchorPointType,
  getAnchorPointType,
  type Vector2D,
} from '../utils/bezier';

export function createEmptyDoc(name = 'Untitled'): EditorDocument {
  const doc = createDefaultDocument();
  doc.meta.name = name;
  return doc;
}

export type EditorTool = 'select' | 'subselect' | 'rect' | 'oval' | 'polygon' | 'pen' | 'text' | 'hand' | 'pencil';

export type EditorLayer = EditorDocument['root']['layers'][number];
export type EditorKeyframe = EditorLayer['keyframes'][number];
export type EditorElement = EditorKeyframe['elements'][number];
export type EditorSymbol = EditorDocument['library']['symbols'][string];
export type EditorTimeline = EditorDocument['root'];
export type EditorArtboard = NonNullable<EditorDocument['artboards']>[number];

export interface ContextMenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export interface EditorState {
  doc: EditorDocument;
  selectedLayerId: string | null;
  selectedFrameIndex: number;
  selectedTime: number;
  selectedElementIds: string[];
  currentFrame: number;
  currentTime: number;
  isPlaying: boolean;
  activeTool: EditorTool;
  fillColor: string;
  activeFill: Fill;
  strokeColor: string;
  activeStroke: Fill;
  strokeWidth: number;
  editingTextElId: string | null;
  textSelection: { elementId: string; start: number; end: number } | null;
  loopMode: 'infinite' | number;
  undoStack: EditorDocument[];
  redoStack: EditorDocument[];
  testMovieOpen: boolean;
  exportModalOpen: boolean;
  importModalOpen: boolean;
  convertToSymbolModalOpen: boolean;
  convertToComponentModalOpen: boolean;
  activeInspectorTab: 'timeline' | 'statemachine' | 'scripts' | 'properties';
  addFontModalOpen: boolean;
  bezierModalOpen: boolean;
  activeBezierTarget: {
    layerId: string;
    kfId: string;
    initialEasing?: Easing;
  } | null;
  clipboard: EditorElement[];
  keyframeClipboard: EditorKeyframe | null;
  contextMenu: ContextMenuState | null;
  isolationStack: Array<{ symbolId: string; name: string }>;
  previewLocale?: string;
  activeBreakpointId?: string | null;
  scriptTriggerFocus: 'auto' | 'keyframe' | 'element';
  liveKeyframeScriptsEnabled: boolean;
  isLibraryOpen: boolean;
  libraryPosition: { x: number; y: number };
  isLocalizationOpen: boolean;
  localizationPosition: { x: number; y: number };
  isStateVariablesOpen: boolean;
  stateVariablesPosition: { x: number; y: number };
  starConfig: { points: number; pointRatio: number; cornerRadius?: number };
  rectConfig: { cornerRadius: number | RectCornerRadius; cornerType: CornerType | RectCornerTypes };
  ovalConfig: { innerRadiusRatio: number; startAngle: number; endAngle: number };
  pencilConfig: {
    smoothness: number;
    fillNewStrokes?: boolean;
    keepSelected?: boolean;
    editSelectedPaths?: boolean;
  };
  isPencilOptionsOpen: boolean;
  subselectedAnchor: { shapeId: string; pathIndex: number; anchorIndex: number } | null;
}

const MAX_HISTORY = 50;

/**
 * Ultra-fast recursive deep clone utility without JSON stringification.
 * Preserves functions (e.g. ScriptFn), dates, regexes, primitives, and objects.
 */
export function fastClone<T>(val: T): T {
  if (val === null || typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    const len = val.length;
    const copy = new Array(len);
    for (let i = 0; i < len; i++) {
      copy[i] = fastClone(val[i]);
    }
    return copy as unknown as T;
  }

  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T;
  }

  if (val instanceof RegExp) {
    return new RegExp(val.source, val.flags) as unknown as T;
  }

  if (val instanceof Map) {
    const copy = new Map();
    val.forEach((v, k) => copy.set(k, fastClone(v)));
    return copy as unknown as T;
  }

  if (val instanceof Set) {
    const copy = new Set();
    val.forEach((v) => copy.add(fastClone(v)));
    return copy as unknown as T;
  }

  const proto = Object.getPrototypeOf(val);
  const copy: any = proto === null || proto === Object.prototype ? {} : Object.create(proto);

  const keys = Object.keys(val);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    copy[key] = fastClone((val as any)[key]);
  }

  return copy as T;
}

function deepCloneDoc(doc: EditorDocument): EditorDocument {
  return fastClone(doc);
}

function getTransformedPath(shape: ShapeElement): string {
  const d = shape.basePathD || shape.paths?.[0]?.d || '';
  if (!d) return '';
  const t = shape.transform;
  if (!t) return d;
  const isIdentity =
    (t.x === 0 || t.x === undefined) &&
    (t.y === 0 || t.y === undefined) &&
    (!t.rotation || t.rotation === 0) &&
    (t.scaleX === 1 || t.scaleX === undefined) &&
    (t.scaleY === 1 || t.scaleY === undefined) &&
    (!t.skewX || t.skewX === 0) &&
    (!t.skewY || t.skewY === 0) &&
    (!t.originX || t.originX === 0) &&
    (!t.originY || t.originY === 0);

  if (isIdentity) return d;

  const m = Matrix2D.fromTransform(t);
  if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0) {
    return d;
  }

  try {
    const scope = getGeometryPaperScope();
    scope.activate();
    try {
      const item = new scope.CompoundPath(d);
      const pMat = new scope.Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty);
      item.transform(pMat);
      const res = extractPathData(item);
      return res || d;
    } finally {
      try {
        scope.project?.clear();
      } catch {}
    }
  } catch {
    return d;
  }
}

export function adjustElementForPin(
  el: EditorElement | DisplayElement,
  prevW: number,
  prevH: number,
  newW: number,
  newH: number
): void {
  const pin = el.transform?.pin;
  if (!pin || pin === 'none') return;
  const dx = newW - prevW;
  const dy = newH - prevH;

  switch (pin) {
    case 'center':
      el.transform.x = Math.round(el.transform.x + dx / 2);
      el.transform.y = Math.round(el.transform.y + dy / 2);
      break;
    case 'top-right':
      el.transform.x = Math.round(el.transform.x + dx);
      break;
    case 'bottom-left':
      el.transform.y = Math.round(el.transform.y + dy);
      break;
    case 'bottom-right':
      el.transform.x = Math.round(el.transform.x + dx);
      el.transform.y = Math.round(el.transform.y + dy);
      break;
    case 'stretch':
      if (prevW > 0 && prevH > 0) {
        const sx = newW / prevW;
        const sy = newH / prevH;
        el.transform.scaleX = (el.transform.scaleX ?? 1) * sx;
        el.transform.scaleY = (el.transform.scaleY ?? 1) * sy;
        el.transform.x = Math.round(el.transform.x * sx);
        el.transform.y = Math.round(el.transform.y * sy);
      }
      break;
    case 'top-left':
      break;
  }
}

let tickerTimer: ReturnType<typeof setInterval> | null = null;
let rafTimer: any = null;
let lastRafTime = 0;
let lastCustomLoopCount = 1;
const executedKfScriptsMap = new Map<string, number>();

export function createInitialState(initialDoc: EditorDocument = createDefaultDocument()): EditorState {
  return {
    doc: initialDoc,
    selectedLayerId: initialDoc.root.layers[0]?.id ?? null,
    selectedFrameIndex: 0,
    selectedTime: 0,
    selectedElementIds: [],
    currentFrame: 0,
    currentTime: 0,
    isPlaying: false,
    activeTool: 'select',
    fillColor: '#0066cc',
    activeFill: { type: 'solid', color: '#0066cc' },
    strokeColor: '#000000',
    activeStroke: { type: 'solid', color: '#000000' },
    strokeWidth: 1,
    editingTextElId: null,
    textSelection: null,
    loopMode: 'infinite',
    undoStack: [],
    redoStack: [],
    testMovieOpen: false,
    exportModalOpen: false,
    importModalOpen: false,
    convertToSymbolModalOpen: false,
    convertToComponentModalOpen: false,
    activeInspectorTab: 'timeline',
    addFontModalOpen: false,
    bezierModalOpen: false,
    activeBezierTarget: null,
    clipboard: [],
    keyframeClipboard: null,
    contextMenu: null,
    isolationStack: [],
    previewLocale: 'en',
    activeBreakpointId: null,
    scriptTriggerFocus: 'auto',
    liveKeyframeScriptsEnabled: true,
    isLibraryOpen: true,
    libraryPosition: {
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 300) : 720,
      y: 60,
    },
    isLocalizationOpen: false,
    localizationPosition: {
      x: typeof window !== 'undefined' ? Math.max(20, Math.round(window.innerWidth / 2 - 320)) : 260,
      y: 70,
    },
    isStateVariablesOpen: false,
    stateVariablesPosition: {
      x: typeof window !== 'undefined' ? Math.max(20, Math.round(window.innerWidth / 2 - 280)) : 220,
      y: 80,
    },
    starConfig: { points: 5, pointRatio: 0.5, cornerRadius: 0 },
    rectConfig: { cornerRadius: 0, cornerType: 'round' },
    ovalConfig: { innerRadiusRatio: 0, startAngle: 0, endAngle: 360 },
    pencilConfig: {
      smoothness: 50,
      fillNewStrokes: false,
      keepSelected: true,
      editSelectedPaths: true,
    },
    isPencilOptionsOpen: false,
    subselectedAnchor: null,
  };
}

const initialDoc = createDefaultDocument();

let state: EditorState = createInitialState(initialDoc);

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeEditor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEditorState(): EditorState {
  return state;
}

export function useEditorStore<T = EditorState>(
  selector: (s: EditorState) => T = (s) => s as unknown as T
): T {
  return useSyncExternalStore(
    subscribeEditor,
    () => selector(state),
    () => selector(state)
  );
}
useEditorStore.getState = getEditorState;

/** Record an undo snapshot before mutating document */
function pushHistorySnapshot(): void {
  const currentSnapshot = deepCloneDoc(state.doc);
  const newUndo = [...state.undoStack, currentSnapshot];
  if (newUndo.length > MAX_HISTORY) {
    newUndo.shift();
  }
  state = {
    ...state,
    undoStack: newUndo,
    redoStack: [],
  };
}

export function getActiveArtboard(doc: EditorDocument): {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: Fill;
  root: EditorTimeline;
  breakpoints?: StageBreakpoint[];
} {
  if (doc.artboards && doc.artboards.length > 0) {
    const activeId = doc.activeArtboardId || doc.artboards[0].id;
    const found = doc.artboards.find((a) => a.id === activeId);
    if (found) return found;
    return doc.artboards[0];
  }
  return {
    id: doc.activeArtboardId || 'artboard-1',
    name: 'Artboard 1',
    width: doc.stage.width || 550,
    height: doc.stage.height || 400,
    background: doc.stage.background,
    breakpoints: doc.stage.breakpoints,
    root: doc.root,
  };
}

export function ensureMaterializedArtboards(doc: EditorDocument): EditorArtboard[] {
  if (!doc.artboards || doc.artboards.length === 0) {
    const defaultAb: EditorArtboard = {
      id: doc.activeArtboardId || 'artboard-1',
      name: 'Artboard 1',
      width: doc.stage.width || 550,
      height: doc.stage.height || 400,
      background: doc.stage.background,
      breakpoints: doc.stage.breakpoints,
      root: doc.root,
    };
    doc.artboards = [defaultAb];
    doc.activeArtboardId = defaultAb.id;
  }
  return doc.artboards;
}

export function syncActiveArtboardToStage(doc: EditorDocument): void {
  if (doc.artboards && doc.artboards.length > 0) {
    const active = doc.artboards.find((a) => a.id === doc.activeArtboardId) || doc.artboards[0];
    doc.root = active.root;
    doc.stage.width = active.width;
    doc.stage.height = active.height;
    if (active.background) doc.stage.background = active.background;
    if (active.breakpoints) doc.stage.breakpoints = active.breakpoints;
  }
}

export function getActiveTimeline(
  doc: EditorDocument,
  isolationStack?: Array<{ symbolId: string; name: string }>
): EditorTimeline {
  const stack = isolationStack ?? state.isolationStack;
  if (stack && stack.length > 0) {
    const top = stack[stack.length - 1];
    const sym = doc.library.symbols[top.symbolId];
    if (sym?.timeline) return sym.timeline;
  }
  if (doc.artboards && doc.artboards.length > 0) {
    const activeId = doc.activeArtboardId || doc.artboards[0].id;
    const found = doc.artboards.find((a) => a.id === activeId);
    if (found?.root) return found.root;
    return doc.artboards[0].root;
  }
  return doc.root;
}

export function findLayer(
  doc: EditorDocument,
  layerId: string | null,
  isolationStack?: Array<{ symbolId: string; name: string }>
): EditorLayer | undefined {
  const tl = getActiveTimeline(doc, isolationStack);
  if (!layerId) return tl.layers[0];
  return tl.layers.find((l) => l.id === layerId);
}

export function getKeyframeTime(kf: EditorKeyframe, fps = 24): number {
  if (kf.time !== undefined) return kf.time;
  return kf.index / Math.max(1, fps);
}

export function getKeyframeDurationTime(kf: EditorKeyframe, fps = 24): number {
  if (kf.durationTime !== undefined) return kf.durationTime;
  return kf.duration / Math.max(1, fps);
}

export function findKeyframeAtTime(layer: EditorLayer, time: number, fps = 24): EditorKeyframe | undefined {
  if (!layer.keyframes || layer.keyframes.length === 0) return undefined;
  const sorted = [...layer.keyframes].sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));

  for (let i = 0; i < sorted.length; i++) {
    const kf = sorted[i];
    const nextKf = sorted[i + 1];
    const kfTime = getKeyframeTime(kf, fps);
    const nextKfTime = nextKf ? getKeyframeTime(nextKf, fps) : undefined;
    const kfDur = getKeyframeDurationTime(kf, fps);
    const endTime = nextKfTime !== undefined ? nextKfTime : kfTime + kfDur;

    if (time >= kfTime - 1e-4 && time < endTime - 1e-4) {
      return kf;
    }
  }

  // If at or past the last keyframe, hold last keyframe
  const last = sorted[sorted.length - 1];
  if (last && time >= getKeyframeTime(last, fps) - 1e-4) {
    return last;
  }
  return undefined;
}

export function normalizeLayerKeyframes(layer: EditorLayer, fps = 24): void {
  if (!layer.keyframes || layer.keyframes.length === 0) return;

  layer.keyframes.sort((a, b) => {
    const tA = getKeyframeTime(a, fps);
    const tB = getKeyframeTime(b, fps);
    if (Math.abs(tA - tB) > 1e-4) return tA - tB;
    return (a.index ?? 0) - (b.index ?? 0);
  });

  for (let i = 0; i < layer.keyframes.length - 1; i++) {
    const cur = layer.keyframes[i];
    const next = layer.keyframes[i + 1];
    const curTime = getKeyframeTime(cur, fps);
    const nextTime = getKeyframeTime(next, fps);
    cur.time = curTime;
    cur.index = Math.round(curTime * fps);
    cur.duration = Math.max(1, (next.index ?? Math.round(nextTime * fps)) - cur.index);
    cur.durationTime = Math.max(0.04, nextTime - curTime);
  }

  const lastKf = layer.keyframes[layer.keyframes.length - 1];
  if (lastKf) {
    const lastTime = getKeyframeTime(lastKf, fps);
    lastKf.time = lastTime;
    lastKf.index = Math.round(lastTime * fps);
    if (!lastKf.duration || lastKf.duration < 1) {
      lastKf.duration = fps;
    }
    if (!lastKf.durationTime || lastKf.durationTime <= 0) {
      lastKf.durationTime = lastKf.duration / fps;
    }
  }
}

interface CachedDuration {
  duration: number;
  frameCount: number;
  layerCount: number;
  kfCount: number;
}

const timelineDurationCache = new WeakMap<EditorTimeline, Map<number, CachedDuration>>();

export function invalidateTimelineDurationCache(tl?: EditorTimeline): void {
  if (tl) {
    timelineDurationCache.delete(tl);
  }
}

export function computeTotalTimelineDuration(tl: EditorTimeline, fps = 24): number {
  const fpsMap = timelineDurationCache.get(tl);
  const currentLayers = tl.layers || [];
  const layerCount = currentLayers.length;
  let kfCount = 0;
  for (let i = 0; i < layerCount; i++) {
    kfCount += currentLayers[i].keyframes?.length || 0;
  }

  if (fpsMap) {
    const entry = fpsMap.get(fps);
    if (
      entry &&
      entry.frameCount === tl.frameCount &&
      entry.layerCount === layerCount &&
      entry.kfCount === kfCount
    ) {
      return entry.duration;
    }
  }

  let maxTime = (tl.frameCount || 24) / Math.max(1, fps);
  for (const layer of currentLayers) {
    if (!layer.keyframes) continue;
    for (let i = 0; i < layer.keyframes.length; i++) {
      const kf = layer.keyframes[i];
      const isLast = i === layer.keyframes.length - 1;
      const kfTime = getKeyframeTime(kf, fps);
      const kfDur = isLast ? 0 : getKeyframeDurationTime(kf, fps);
      const end = kfTime + kfDur;
      if (end > maxTime) maxTime = end;
      if (isLast && kfTime > maxTime) maxTime = kfTime;
    }
  }
  const result = maxTime;

  const newEntry: CachedDuration = {
    duration: result,
    frameCount: tl.frameCount,
    layerCount,
    kfCount,
  };

  if (fpsMap) {
    fpsMap.set(fps, newEntry);
  } else {
    const map = new Map<number, CachedDuration>();
    map.set(fps, newEntry);
    timelineDurationCache.set(tl, map);
  }

  return result;
}

export function formatTimeInSeconds(seconds: number): string {
  const safeSec = Math.max(0, seconds || 0);
  const totalMs = Math.round(safeSec * 1000);
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60);
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function findKeyframeAt(layer: EditorLayer, frameIndex: number): EditorKeyframe | undefined {
  if (!layer.keyframes || layer.keyframes.length === 0) return undefined;
  const sorted = [...layer.keyframes].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (let i = 0; i < sorted.length; i++) {
    const kf = sorted[i];
    const nextKf = sorted[i + 1];
    const end = nextKf ? nextKf.index : kf.index + (kf.duration || 1);
    if (frameIndex >= kf.index && frameIndex < end) {
      return kf;
    }
  }
  const last = sorted[sorted.length - 1];
  if (last && frameIndex >= last.index) {
    return last;
  }
  return undefined;
}

export function getElementDefaultName(el: EditorElement, symbols?: Record<string, any>): string {
  if (el.instanceName) return el.instanceName;
  if (el.type === 'shape') {
    if (el.id.startsWith('rect_')) return 'Rectangle';
    if (el.id.startsWith('oval_')) return 'Oval';
    if (el.id.startsWith('poly_')) return 'Polygon';
    return 'Shape';
  }
  if (el.type === 'text') {
    const txt = (el as any).text;
    if (txt) {
      return txt.length > 12 ? `"${txt.slice(0, 12)}..."` : `"${txt}"`;
    }
    return 'Text';
  }
  if (el.type === 'instance') {
    const sym = symbols?.[(el as any).symbolId];
    return sym?.name ? `❖ ${sym.name}` : '❖ Component';
  }
  if (el.type === 'bitmap') {
    return (el as any).name || 'Bitmap';
  }
  if (el.type === 'video') {
    return 'Video';
  }
  return (el as any).type || 'Element';
}

export function ensureElementHasDedicatedTrack(
  tl: EditorTimeline,
  elementId: string,
  fps = 24
): EditorLayer | undefined {
  let containingLayer: EditorLayer | undefined;
  for (const layer of tl.layers) {
    for (const kf of layer.keyframes) {
      if (kf.elements.some((e) => e.id === elementId)) {
        containingLayer = layer;
        break;
      }
    }
    if (containingLayer) break;
  }

  if (!containingLayer) return undefined;

  // Case 1: The element is directly in a folder layer
  if (containingLayer.kind === 'folder') {
    const targetEl = containingLayer.keyframes.flatMap((k) => k.elements).find((e) => e.id === elementId);
    if (!targetEl) return containingLayer;

    const newLayer: EditorLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: getElementDefaultName(targetEl),
      kind: 'normal',
      visible: true,
      locked: false,
      parentLayerId: containingLayer.id,
      keyframes: containingLayer.keyframes.map((kf) => {
        const elInKf = kf.elements.find((e) => e.id === elementId);
        return {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: kf.index,
          time: kf.time,
          duration: kf.duration,
          durationTime: kf.durationTime,
          elements: elInKf ? [fastClone(elInKf)] : [],
          tween: kf.tween ? fastClone(kf.tween) : undefined,
        };
      }),
    };
    (newLayer as any).parentId = containingLayer.id;

    for (const kf of containingLayer.keyframes) {
      kf.elements = kf.elements.filter((e) => e.id !== elementId);
    }

    const parentIdx = tl.layers.indexOf(containingLayer);
    tl.layers.splice(parentIdx + 1, 0, newLayer);
    return newLayer;
  }

  // Case 2: Normal or mask layer with multiple elements
  const allElements = Array.from(
    new Map(containingLayer.keyframes.flatMap((k) => k.elements).map((e) => [e.id, e])).values()
  );

  if (allElements.length <= 1) {
    if (allElements[0] && (containingLayer.name.startsWith('Layer ') || containingLayer.name === 'Layer 1')) {
      containingLayer.name = getElementDefaultName(allElements[0]);
    }
    return containingLayer;
  }

  const layerIdx = tl.layers.indexOf(containingLayer);
  const otherElements = allElements.filter((e) => e.id !== elementId);

  for (let i = 0; i < otherElements.length; i++) {
    const otherEl = otherElements[i];
    const newLayer: EditorLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
      name: getElementDefaultName(otherEl),
      kind: containingLayer.kind,
      visible: containingLayer.visible,
      locked: containingLayer.locked,
      parentLayerId: containingLayer.parentLayerId,
      keyframes: containingLayer.keyframes.map((kf) => {
        const elInKf = kf.elements.find((e) => e.id === otherEl.id);
        return {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
          index: kf.index,
          time: kf.time,
          duration: kf.duration,
          durationTime: kf.durationTime,
          elements: elInKf ? [fastClone(elInKf)] : [],
          tween: kf.tween ? fastClone(kf.tween) : undefined,
        };
      }),
    };
    (newLayer as any).parentId = containingLayer.parentLayerId;
    tl.layers.splice(layerIdx + 1 + i, 0, newLayer);
  }

  for (const kf of containingLayer.keyframes) {
    kf.elements = kf.elements.filter((e) => e.id === elementId);
  }
  const targetEl = allElements.find((e) => e.id === elementId);
  if (targetEl && (containingLayer.name.startsWith('Layer ') || containingLayer.name === 'Layer 1')) {
    containingLayer.name = getElementDefaultName(targetEl);
  }

  return containingLayer;
}

export const editorActions = {
  commitHistorySnapshot(): void {
    pushHistorySnapshot();
  },

  setActiveTool(tool: EditorTool): void {
    state = { ...state, activeTool: tool };
    notify();
  },



  setStarConfig(config: Partial<{ points: number; pointRatio: number; cornerRadius?: number }>): void {
    state = {
      ...state,
      starConfig: {
        points: config.points !== undefined ? Math.max(3, Math.min(64, Math.round(config.points))) : state.starConfig.points,
        pointRatio: config.pointRatio !== undefined ? Math.max(0.05, Math.min(3.0, config.pointRatio)) : state.starConfig.pointRatio,
        cornerRadius: config.cornerRadius !== undefined ? Math.max(0, config.cornerRadius) : (state.starConfig.cornerRadius ?? 0),
      },
    };
    notify();
  },

  setRectConfig(config: Partial<{ width?: number; height?: number; cornerRadius: number | RectCornerRadius; cornerType: CornerType | RectCornerTypes }>): void {
    state = {
      ...state,
      rectConfig: {
        cornerRadius: config.cornerRadius !== undefined ? config.cornerRadius : state.rectConfig.cornerRadius,
        cornerType: config.cornerType !== undefined ? config.cornerType : state.rectConfig.cornerType,
      },
    };
    notify();
  },

  setOvalConfig(config: Partial<{ innerRadiusRatio: number; startAngle: number; endAngle: number }>): void {
    state = {
      ...state,
      ovalConfig: {
        innerRadiusRatio:
          config.innerRadiusRatio !== undefined
            ? Math.max(0, Math.min(0.92, config.innerRadiusRatio))
            : state.ovalConfig.innerRadiusRatio,
        startAngle:
          config.startAngle !== undefined
            ? Math.max(0, Math.min(360, config.startAngle))
            : state.ovalConfig.startAngle,
        endAngle:
          config.endAngle !== undefined
            ? Math.max(0, Math.min(360, config.endAngle))
            : state.ovalConfig.endAngle,
      },
    };
    notify();
  },

  setPencilConfig(
    config: Partial<{
      smoothness: number;
      fillNewStrokes: boolean;
      keepSelected: boolean;
      editSelectedPaths: boolean;
    }>
  ): void {
    const nextSmoothness =
      config.smoothness !== undefined
        ? Math.max(0, Math.min(100, config.smoothness))
        : state.pencilConfig.smoothness;

    state = {
      ...state,
      pencilConfig: {
        ...state.pencilConfig,
        ...config,
        smoothness: nextSmoothness,
      },
    };

    // If smoothness changed and an element is currently selected, re-smooth the selected path live!
    if (config.smoothness !== undefined && state.selectedElementIds.length > 0) {
      editorActions.reSmoothSelectedShape(nextSmoothness);
    } else {
      notify();
    }
  },

  setPencilOptionsOpen(open: boolean): void {
    state = { ...state, isPencilOptionsOpen: open };
    notify();
  },

  reSmoothSelectedShape(smoothness: number): void {
    if (state.selectedElementIds.length === 0) return;
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let modified = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;

      for (const el of kf.elements) {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          const shape = el as ShapeElement;
          const currentD = shape.basePathD || shape.paths?.[0]?.d;
          if (!currentD) continue;

          let pointsToFit: Vector2D[] = (shape as any).rawPoints;
          if (!pointsToFit || pointsToFit.length < 2) {
            pointsToFit = samplePointsFromPath(currentD, 12);
          }

          if (pointsToFit && pointsToFit.length >= 2) {
            const closed = isPathClosed(currentD);
            const tolerance = 0.5 + (smoothness / 100) * 15;
            const fitted = fitPointsToCurve(pointsToFit, tolerance, { closed });
            if (fitted) {
              shape.paths = shape.paths.map((p, idx) =>
                idx === 0 ? { ...p, d: fitted } : p
              );
              if (shape.basePathD) {
                shape.basePathD = fitted;
              }
              shape.isCustomizedPath = true;
              shape.pencilSmoothness = smoothness;
              modified = true;
            }
          }
        }
      }
    }

    if (modified) {
      state = { ...state, doc };
      notify();
    }
  },

  createPencilShape(
    points: Array<{ x: number; y: number }>,
    options?: {
      smoothness?: number;
      closed?: boolean;
      fill?: Fill;
      stroke?: any;
      strokeWidth?: number;
    }
  ): ShapeElement | null {
    if (!points || points.length < 2) return null;

    const smoothness = options?.smoothness ?? state.pencilConfig.smoothness ?? 50;
    const tolerance = 0.5 + (smoothness / 100) * 15;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const w = Math.max(8, maxX - minX);
    const h = Math.max(8, maxY - minY);
    const originX = Math.round(w / 2);
    const originY = Math.round(h / 2);

    const first = points[0];
    const last = points[points.length - 1];
    const loopDist = Math.hypot(last.x - first.x, last.y - first.y);
    const isClosed = options?.closed ?? (points.length > 3 && loopDist <= 16);

    const localRawPoints = points.map((p) => ({
      x: Math.round((p.x - minX) * 100) / 100,
      y: Math.round((p.y - minY) * 100) / 100,
    }));

    const fittedD = fitPointsToCurve(localRawPoints, tolerance, { closed: isClosed });
    if (!fittedD) return null;

    const shouldFill = options?.fill
      ? true
      : state.pencilConfig.fillNewStrokes
      ? Boolean(state.activeFill)
      : isClosed;

    const newShape: ShapeElement = {
      id: `pencil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'shape',
      visible: true,
      rawPoints: localRawPoints,
      pencilSmoothness: smoothness,
      transform: {
        x: Math.round((minX + originX) * 100) / 100,
        y: Math.round((minY + originY) * 100) / 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX,
        originY,
      },
      paths: [
        {
          d: fittedD,
          fill:
            options?.fill ??
            (shouldFill
              ? state.activeFill ?? { type: 'solid', color: state.fillColor }
              : { type: 'solid', color: 'transparent' }),
          stroke: options?.stroke ?? {
            fill: state.activeStroke ?? { type: 'solid', color: state.strokeColor },
            width: options?.strokeWidth ?? state.strokeWidth,
            cap: 'round',
            join: 'round',
          },
        },
      ],
      alpha: 1,
    };

    return newShape;
  },

  uniteSelectedShapes(): void {
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let unitedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      unitedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        unitedD = unitePaths(unitedD, nextD);
      }
    } else {
      unitedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        unitedD = unitePaths(unitedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: unitedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  subtractSelectedShapes(): void {
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let subtractedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      subtractedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        subtractedD = subtractPaths(subtractedD, nextD);
      }
    } else {
      subtractedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        subtractedD = subtractPaths(subtractedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: subtractedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  intersectSelectedShapes(): void {
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let intersectedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      intersectedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        intersectedD = intersectPaths(intersectedD, nextD);
      }
    } else {
      intersectedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        intersectedD = intersectPaths(intersectedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: intersectedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  excludeSelectedShapes(): void {
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let excludedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      excludedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        excludedD = excludePaths(excludedD, nextD);
      }
    } else {
      excludedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        excludedD = excludePaths(excludedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: excludedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  outlineSelectedStroke(): void {
    if (state.selectedElementIds.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let modified = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;

      for (let i = 0; i < kf.elements.length; i++) {
        const el = kf.elements[i];
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          const shape = el as ShapeElement;
          const currentD = shape.basePathD || shape.paths?.[0]?.d || '';
          const stroke = shape.paths?.[0]?.stroke;
          const strokeWidth = stroke?.width ?? 0;
          if (!currentD || strokeWidth <= 0) continue;

          const strokeFill =
            stroke?.fill ?? { type: 'solid', color: state.strokeColor || '#000000' };
          const cap = (stroke?.cap as 'round' | 'butt' | 'square') ?? 'round';
          const join = (stroke?.join as 'round' | 'miter' | 'bevel') ?? 'round';
          const miterLimit = (stroke as any)?.miterLimit ?? 4;

          const outlinedD = expandStroke(currentD, strokeWidth, { cap, join, miterLimit });
          if (outlinedD) {
            const updatedShape: ShapeElement = {
              ...shape,
              paths: [
                {
                  d: outlinedD,
                  fill: strokeFill,
                  stroke: undefined,
                },
              ],
              isCustomizedPath: true,
            };
            delete updatedShape.rectConfig;
            delete updatedShape.ovalConfig;
            delete updatedShape.starConfig;
            delete updatedShape.basePathD;
            delete updatedShape.pathAnchorRadii;
            delete updatedShape.pathAnchorTypes;
            delete updatedShape.rawPoints;

            kf.elements[i] = updatedShape;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      state = { ...state, doc };
      notify();
    }
  },

  async convertSelectedTextToOutlines(): Promise<void> {
    if (state.selectedElementIds.length === 0) return;
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    let targetKf: EditorKeyframe | null = null;
    let targetIndex = -1;
    let textEl: TextElement | null = null;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex(
        (e) => state.selectedElementIds.includes(e.id) && e.type === 'text'
      );
      if (idx !== -1) {
        targetKf = kf;
        targetIndex = idx;
        textEl = kf.elements[idx] as TextElement;
        break;
      }
    }

    if (!targetKf || targetIndex === -1 || !textEl) return;

    const text = textEl.text || '';
    if (!text.trim()) return;

    pushHistorySnapshot();

    let fontBuffer: ArrayBuffer | null = null;
    const fontAsset = doc.library?.fonts?.[textEl.fontId];
    if (
      fontAsset?.src &&
      !fontAsset.src.endsWith('.css') &&
      !fontAsset.src.includes('googleapis.com/css')
    ) {
      try {
        if (fontAsset.src.startsWith('data:')) {
          const base64 = fontAsset.src.split(',')[1];
          if (typeof atob === 'function') {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            fontBuffer = bytes.buffer;
          }
        } else if (typeof fetch === 'function') {
          const resp = await fetch(fontAsset.src);
          if (resp.ok) {
            fontBuffer = await resp.arrayBuffer();
          }
        }
      } catch {
        // fallback
      }
    }

    const fontSize = textEl.fontSize || 32;
    const pathData = await convertTextToVectorPath(text, fontBuffer, { fontSize });
    if (!pathData) return;

    const fill = textEl.fill || {
      type: 'solid',
      color: textEl.color || '#000000',
    };

    const newShapeId = `shape_outline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newShape: ShapeElement = {
      id: newShapeId,
      type: 'shape',
      visible: textEl.visible ?? true,
      locked: textEl.locked ?? false,
      alpha: textEl.alpha ?? 1,
      transform: { ...textEl.transform },
      paths: [
        {
          d: pathData,
          fill,
          stroke: textEl.stroke,
        },
      ],
      isCustomizedPath: true,
    };

    targetKf.elements[targetIndex] = newShape;

    state = {
      ...state,
      doc,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  openShapePath(elementId?: string): void {
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: openPath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  closeShapePath(elementId?: string): void {
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: closePath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  togglePathClosed(elementId?: string): void {
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const firstPath = shape.paths[0];
        const isClosed = isPathClosed(firstPath?.d || '');
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: isClosed ? openPath(p.d) : closePath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  slicePathAtPoint(elementId: string, pt: Vector2D): void {
    if (!elementId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === elementId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: slicePathAtPoint(p.d, pt),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  setSubselectedAnchor(anchor: { shapeId: string; pathIndex: number; anchorIndex: number } | null): void {
    state = { ...state, subselectedAnchor: anchor };
    notify();
  },

  togglePathAnchorPointType(shapeId: string, anchorIndex: number, pathIndex = 0): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === shapeId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const baseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : shape.paths[pathIndex]?.d;
        if (!baseD) return;

        const currentPointTypes = shape.pathAnchorPointTypes || {};
        const { d: newD, newType } = toggleAnchorPointType(baseD, anchorIndex);

        shape.paths = shape.paths.map((p, idx) =>
          idx === pathIndex ? { ...p, d: newD } : p
        );
        if (pathIndex === 0 && shape.basePathD) {
          shape.basePathD = newD;
        }
        shape.pathAnchorPointTypes = {
          ...currentPointTypes,
          [anchorIndex]: newType,
        };
        shape.isCustomizedPath = true;

        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  setPathAnchorPointType(shapeId: string, anchorIndex: number, pointType: 'smooth' | 'corner', pathIndex = 0): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === shapeId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const baseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : shape.paths[pathIndex]?.d;
        if (!baseD) return;

        const currentPointTypes = shape.pathAnchorPointTypes || {};
        const { d: newD, newType } = toggleAnchorPointType(baseD, anchorIndex, pointType);

        shape.paths = shape.paths.map((p, idx) =>
          idx === pathIndex ? { ...p, d: newD } : p
        );
        if (pathIndex === 0 && shape.basePathD) {
          shape.basePathD = newD;
        }
        shape.pathAnchorPointTypes = {
          ...currentPointTypes,
          [anchorIndex]: newType,
        };
        shape.isCustomizedPath = true;

        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  setFillColor(color: string): void {
    const isTransparent =
      color === 'transparent' || color === 'none' || color === 'rgba(0,0,0,0)';
    state = {
      ...state,
      fillColor: isTransparent ? 'transparent' : color,
      activeFill: isTransparent ? { type: 'none' } : { type: 'solid', color },
    };
    notify();
  },

  setActiveFill(fill: Fill): void {
    const primaryColor =
      fill.type === 'none'
        ? 'transparent'
        : fill.type === 'solid'
        ? fill.color
        : fill.type === 'linearGradient' || fill.type === 'radialGradient'
        ? fill.stops[0]?.color || state.fillColor
        : state.fillColor;
    state = { ...state, activeFill: fill, fillColor: primaryColor };
    notify();
  },

  setEditingTextElId(id: string | null): void {
    if (state.editingTextElId !== id) {
      state = { ...state, editingTextElId: id, textSelection: id ? state.textSelection : null };
      notify();
    }
  },

  setTextSelection(selection: { elementId: string; start: number; end: number } | null): void {
    state = { ...state, textSelection: selection };
    notify();
  },

  setLoopMode(mode: 'infinite' | number): void {
    let normalized: 'infinite' | number = mode;
    if ((mode as any) === 'once' || (mode as any) === '1x') {
      normalized = 1;
    } else if ((mode as any) === '3x') {
      normalized = 3;
    } else if (typeof mode === 'number') {
      normalized = Math.max(1, Math.floor(mode));
    }
    if (typeof normalized === 'number') {
      lastCustomLoopCount = normalized;
    }
    state = { ...state, loopMode: normalized };
    notify();
  },

  toggleLoopMode(): void {
    if (state.loopMode === 'infinite') {
      state = { ...state, loopMode: lastCustomLoopCount || 1 };
    } else {
      lastCustomLoopCount = state.loopMode;
      state = { ...state, loopMode: 'infinite' };
    }
    notify();
  },

  setStrokeColor(color: string): void {
    const isTransparent =
      color === 'transparent' || color === 'none' || color === 'rgba(0,0,0,0)';
    state = {
      ...state,
      strokeColor: isTransparent ? 'transparent' : color,
      activeStroke: isTransparent ? { type: 'none' } : { type: 'solid', color },
    };
    notify();
  },

  setActiveStroke(fill: Fill): void {
    const primaryColor =
      fill.type === 'none'
        ? 'transparent'
        : fill.type === 'solid'
        ? fill.color
        : fill.type === 'linearGradient' || fill.type === 'radialGradient'
        ? fill.stops[0]?.color || state.strokeColor
        : state.strokeColor;
    state = { ...state, activeStroke: fill, strokeColor: primaryColor };
    notify();
  },

  setStrokeWidth(width: number): void {
    state = { ...state, strokeWidth: width };
    notify();
  },

  setTestMovieOpen(open: boolean): void {
    state = { ...state, testMovieOpen: open };
    notify();
  },

  setExportModalOpen(open: boolean): void {
    state = { ...state, exportModalOpen: open };
    notify();
  },

  setImportModalOpen(open: boolean): void {
    state = { ...state, importModalOpen: open };
    notify();
  },

  setActiveInspectorTab(tab: 'timeline' | 'statemachine' | 'scripts' | 'properties'): void {
    state = { ...state, activeInspectorTab: tab };
    notify();
  },

  setConvertToComponentModalOpen(open: boolean): void {
    state = { ...state, convertToComponentModalOpen: open, convertToSymbolModalOpen: open };
    notify();
  },

  setConvertToSymbolModalOpen(open: boolean): void {
    state = { ...state, convertToSymbolModalOpen: open, convertToComponentModalOpen: open };
    notify();
  },

  setAddFontModalOpen(open: boolean): void {
    state = { ...state, addFontModalOpen: open };
    notify();
  },

  setLibraryOpen(open: boolean): void {
    state = { ...state, isLibraryOpen: open };
    notify();
  },

  toggleLibrary(): void {
    state = { ...state, isLibraryOpen: !state.isLibraryOpen };
    notify();
  },

  setLibraryPosition(pos: { x: number; y: number }): void {
    state = { ...state, libraryPosition: pos };
    notify();
  },

  setLocalizationOpen(open: boolean): void {
    state = { ...state, isLocalizationOpen: open };
    notify();
  },

  toggleLocalization(): void {
    state = { ...state, isLocalizationOpen: !state.isLocalizationOpen };
    notify();
  },

  setLocalizationPosition(pos: { x: number; y: number }): void {
    state = { ...state, localizationPosition: pos };
    notify();
  },

  setStateVariablesOpen(open: boolean): void {
    state = { ...state, isStateVariablesOpen: open };
    notify();
  },

  toggleStateVariables(): void {
    state = { ...state, isStateVariablesOpen: !state.isStateVariablesOpen };
    notify();
  },

  setStateVariablesPosition(pos: { x: number; y: number }): void {
    state = { ...state, stateVariablesPosition: pos };
    notify();
  },

  addStateVariable(variable: {
    name: string;
    type: StateVariableType;
    defaultValue: any;
    isPublic?: boolean;
    description?: string;
  }): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  updateStateVariable(id: string, updates: Partial<StateVariable>): void {
    pushHistorySnapshot();
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

    state = { ...state, doc };
    notify();
  },

  deleteStateVariable(id: string): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    if (!doc.stateVariables) return;
    const idx = doc.stateVariables.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const [removed] = doc.stateVariables.splice(idx, 1);
    if (doc.state && removed && removed.name in doc.state) {
      delete doc.state[removed.name];
    }
    state = { ...state, doc };
    notify();
  },

  /* ---------------- State Machine Actions ---------------- */

  addStateMachine(name?: string): StateMachineDef {
    pushHistorySnapshot();
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

    state = { ...state, doc };
    notify();
    return newSm;
  },

  setActiveStateMachine(id: string): void {
    const doc = fastClone(state.doc);
    doc.activeStateMachineId = id;
    state = { ...state, doc };
    notify();
  },

  deleteStateMachine(smId: string): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    if (!doc.stateMachines) return;
    doc.stateMachines = doc.stateMachines.filter((sm) => sm.id !== smId);
    if (doc.activeStateMachineId === smId) {
      doc.activeStateMachineId = doc.stateMachines[0]?.id || undefined;
    }
    state = { ...state, doc };
    notify();
  },

  addStateMachineInput(
    smId: string,
    input: { name: string; type: 'boolean' | 'number' | 'trigger'; value: boolean | number }
  ): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm) return;
    if (!sm.inputs) sm.inputs = [];

    const cleanName = input.name.trim().replace(/[^a-zA-Z0-9_$]/g, '_') || 'input1';
    const newInput: StateMachineInput = {
      id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      type: input.type,
      value: input.type === 'boolean' || input.type === 'trigger' ? Boolean(input.value) : Number(input.value) || 0,
    };
    sm.inputs.push(newInput);
    state = { ...state, doc };
    notify();
  },

  updateStateMachineInput(smId: string, inputId: string, updates: Partial<StateMachineInput>): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  deleteStateMachineInput(smId: string, inputId: string): void {
    pushHistorySnapshot();
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

    state = { ...state, doc };
    notify();
  },

  addStateNode(
    smId: string,
    node: { name: string; type: StateNodeType; x?: number; y?: number; clipName?: string; timelineId?: string }
  ): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  updateStateNode(smId: string, nodeId: string, updates: Partial<StateNode>): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm || !sm.states) return;
    const n = sm.states.find((it) => it.id === nodeId);
    if (!n) return;

    Object.assign(n, updates);
    state = { ...state, doc };
    notify();
  },

  deleteStateNode(smId: string, nodeId: string): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  addStateTransition(
    smId: string,
    transition: { fromStateId: string; toStateId: string; durationMs?: number; conditions?: StateCondition[] }
  ): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  updateStateTransition(smId: string, transitionId: string, updates: Partial<StateTransition>): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm || !sm.transitions) return;
    const tr = sm.transitions.find((t) => t.id === transitionId);
    if (!tr) return;

    Object.assign(tr, updates);
    state = { ...state, doc };
    notify();
  },

  deleteStateTransition(smId: string, transitionId: string): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm || !sm.transitions) return;
    sm.transitions = sm.transitions.filter((t) => t.id !== transitionId);
    state = { ...state, doc };
    notify();
  },

  addStateListener(smId: string, listener: Partial<StateListener>): void {
    pushHistorySnapshot();
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
    state = { ...state, doc };
    notify();
  },

  updateStateListener(smId: string, listenerId: string, updates: Partial<StateListener>): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm || !sm.listeners) return;
    const lis = sm.listeners.find((l) => l.id === listenerId);
    if (!lis) return;

    Object.assign(lis, updates);
    state = { ...state, doc };
    notify();
  },

  deleteStateListener(smId: string, listenerId: string): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const sm = doc.stateMachines?.find((s) => s.id === smId);
    if (!sm || !sm.listeners) return;
    sm.listeners = sm.listeners.filter((l) => l.id !== listenerId);
    state = { ...state, doc };
    notify();
  },

  setTextStateBinding(elementId: string, stateBinding?: string | null): void {
    pushHistorySnapshot();
    const doc = fastClone(state.doc);
    const activeTl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of activeTl.layers) {
      for (const kf of layer.keyframes) {
        const el = kf.elements.find((it) => it.id === elementId);
        if (el && el.type === 'text') {
          (el as TextElement).stateBinding = stateBinding || undefined;
          (el as TextElement).variable = stateBinding || undefined;
        }
      }
    }
    state = { ...state, doc };
    notify();
  },

  openBezierEditor(layerId: string, kfId: string, initialEasing?: Easing): void {
    state = {
      ...state,
      bezierModalOpen: true,
      activeBezierTarget: { layerId, kfId, initialEasing },
    };
    notify();
  },

  closeBezierEditor(): void {
    state = {
      ...state,
      bezierModalOpen: false,
      activeBezierTarget: null,
    };
    notify();
  },

  addWebFont(font: {
    name: string;
    url: string;
    format?: 'woff2' | 'css';
    weight?: number | `${number} ${number}` | number[];
    style?: 'normal' | 'italic' | 'all';
    variableRange?: { min: number; max: number; default?: number };
    availableWeights?: number[];
    availableStyles?: Array<'normal' | 'italic'>;
  }): string {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const id = `font_${font.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const isCss = font.url.includes('.css') || font.url.includes('googleapis.com');
    const format: 'woff2' | 'css' = font.format || (isCss ? 'css' : 'woff2');

    let weight: number | `${number} ${number}` | number[] = 400;
    if (font.variableRange) {
      weight = `${font.variableRange.min} ${font.variableRange.max}` as `${number} ${number}`;
    } else if (font.availableWeights && font.availableWeights.length > 0) {
      weight =
        font.availableWeights.length === 1 ? font.availableWeights[0] : font.availableWeights;
    } else if (font.weight !== undefined) {
      weight = font.weight;
    }

    const availableStyles =
      font.availableStyles ||
      (font.style === 'all'
        ? ['normal', 'italic']
        : font.style
        ? [font.style]
        : ['normal']);
    const style: 'normal' | 'italic' | 'all' =
      font.style ||
      (availableStyles.includes('italic') && availableStyles.includes('normal')
        ? 'all'
        : availableStyles.includes('italic')
        ? 'italic'
        : 'normal');

    const fontAsset: FontAsset = {
      id,
      family: font.name,
      src: font.url,
      format,
      weight,
      style,
      ...(font.variableRange ? { variableRange: font.variableRange } : {}),
      ...(font.availableWeights ? { availableWeights: font.availableWeights } : {}),
      ...(font.availableStyles ? { availableStyles } : {}),
    };

    doc.library.fonts[id] = fontAsset;

    const isTest =
      typeof (globalThis as any).process !== 'undefined' &&
      (globalThis as any).process?.env?.NODE_ENV === 'test';
    if (typeof document !== 'undefined' && !isTest) {
      if (format === 'css' || isCss) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = font.url;
        document.head.appendChild(link);
      } else if (typeof FontFace !== 'undefined') {
        try {
          const descriptors: FontFaceDescriptors = {};
          if (font.variableRange) {
            descriptors.weight = `${font.variableRange.min} ${font.variableRange.max}`;
          } else if (typeof weight === 'number') {
            descriptors.weight = String(weight);
          }
          if (style === 'all') {
            descriptors.style = 'normal italic';
          } else if (style) {
            descriptors.style = style;
          }
          const face = new FontFace(font.name, `url("${font.url}")`, descriptors);
          (document.fonts as any).add(face);
          face.load().catch(() => {});
        } catch {
          // ignore font loading error
        }
      }
    }

    state = { ...state, doc };
    notify();
    return id;
  },

  openContextMenu(menu: { x: number; y: number; items: ContextMenuItem[] }): void {
    state = {
      ...state,
      contextMenu: {
        isOpen: true,
        x: menu.x,
        y: menu.y,
        items: menu.items,
      },
    };
    notify();
  },

  closeContextMenu(): void {
    if (state.contextMenu) {
      state = { ...state, contextMenu: null };
      notify();
    }
  },




  setScriptTriggerFocus(focus: 'auto' | 'keyframe' | 'element'): void {
    state = { ...state, scriptTriggerFocus: focus };
    notify();
  },

  setLiveKeyframeScriptsEnabled(enabled: boolean): void {
    state = { ...state, liveKeyframeScriptsEnabled: enabled };
    notify();
  },

  openKeyframeScript(layerId: string, frameIndexOrTime: number, isTime?: boolean): void {
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const fps = state.doc.stage.fps || 24;
    let kf: EditorKeyframe | undefined;
    if (isTime) {
      kf =
        findKeyframeAtTime(layer, frameIndexOrTime, fps) ??
        layer.keyframes.find((k) => Math.abs(getKeyframeTime(k, fps) - frameIndexOrTime) < 0.05);
    } else {
      kf =
        findKeyframeAt(layer, frameIndexOrTime) ??
        layer.keyframes.find((k) => k.index === frameIndexOrTime);
    }

    const kfTime = kf ? getKeyframeTime(kf, fps) : isTime ? frameIndexOrTime : frameIndexOrTime / fps;
    const kfFrame = kf ? kf.index : isTime ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime;

    state = {
      ...state,
      selectedLayerId: layerId,
      selectedElementIds: [],
      currentFrame: kfFrame,
      currentTime: kfTime,
      selectedFrameIndex: kfFrame,
      selectedTime: kfTime,
      scriptTriggerFocus: 'keyframe',
      activeInspectorTab: 'scripts',
    };
    notify();
  },

  executeKeyframeScriptsInRange(prevTime: number, nextTime: number, includeZeroStart?: boolean): void {
    if (!state.liveKeyframeScriptsEnabled) return;

    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const fps = state.doc.stage.fps || 24;

    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        const fnObj = kf.actions as { __fn?: string } | undefined;
        const code = fnObj?.__fn;
        if (!code || typeof code !== 'string' || !code.trim()) continue;

        const kfTime = getKeyframeTime(kf, fps);
        let triggered = false;

        if (includeZeroStart && prevTime === 0 && Math.abs(kfTime) < 0.001) {
          triggered = true;
        } else if (nextTime > prevTime && kfTime > prevTime + 0.0001 && kfTime <= nextTime + 0.0001) {
          triggered = true;
        } else if (nextTime < prevTime && Math.abs(kfTime) <= nextTime + 0.0001) {
          triggered = true;
        }

        if (triggered) {
          const scriptKey = `${kf.id}_${kfTime.toFixed(4)}`;
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (executedKfScriptsMap.has(scriptKey) && now - executedKfScriptsMap.get(scriptKey)! < 50) {
            continue;
          }
          executedKfScriptsMap.set(scriptKey, now);

          try {
            const ctx: any = {
              stop: () => editorActions.setPlaying(false),
              play: () => editorActions.setPlaying(true),
              gotoAndStop: (f: number) => {
                editorActions.setPlaying(false);
                editorActions.setCurrentFrame(Math.max(0, Number(f) - 1));
              },
              gotoAndPlay: (f: number) => {
                editorActions.setCurrentFrame(Math.max(0, Number(f) - 1));
                editorActions.setPlaying(true);
              },
            };

            const gotoArtboard = (idOrName: string) => {
              const ab = state.doc.artboards?.find((a) => a.id === idOrName || a.name === idOrName);
              if (ab) editorActions.switchArtboard(ab.id);
            };

            const safeAlert = (msg?: any) => {
              if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(String(msg ?? ''));
              } else if (typeof console !== 'undefined' && console.log) {
                console.log('[Keyframe Script Alert]', msg);
              }
            };

            const safeConsole =
              typeof console !== 'undefined'
                ? console
                : {
                    log: () => {},
                    warn: () => {},
                    error: () => {},
                  };

            let cleanCode = code.trim();
            const fnMatch = cleanCode.match(
              /^function\s*(?:[a-zA-Z_$][\w$]*)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/
            );
            if (fnMatch) {
              cleanCode = fnMatch[2];
            }

            const runner = new Function(
              'gotoArtboard',
              'alert',
              'console',
              'stop',
              'play',
              'gotoAndStop',
              'gotoAndPlay',
              cleanCode
            );
            runner.call(
              ctx,
              gotoArtboard,
              safeAlert,
              safeConsole,
              ctx.stop,
              ctx.play,
              ctx.gotoAndStop,
              ctx.gotoAndPlay
            );
          } catch (err) {
            console.warn('[Keyframe Script Error]', err);
          }
        }
      }
    }
  },

  selectLayer(layerId: string, preserveElementSelection = false): void {
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const targetLayer = activeTl.layers.find((l) => l.id === layerId);
    const hasElementInLayer = targetLayer
      ? targetLayer.keyframes.some((kf) =>
          kf.elements.some((el) => state.selectedElementIds.includes(el.id))
        )
      : false;

    const shouldClear = !preserveElementSelection && !hasElementInLayer;
    state = {
      ...state,
      selectedLayerId: layerId,
      selectedElementIds: shouldClear ? [] : state.selectedElementIds,
    };
    notify();
  },

  setSelectedFrame(layerId: string, frameIndexOrTime: number): void {
    const fps = state.doc.stage.fps || 24;
    const isSeconds = frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const time = isSeconds ? frameIndexOrTime : frameIndexOrTime / fps;
    const frame = isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime;
    state = {
      ...state,
      selectedLayerId: layerId,
      selectedFrameIndex: frame,
      currentFrame: frame,
      selectedTime: time,
      currentTime: time,
    };
    notify();
  },

  setSelectedTime(layerId: string, time: number): void {
    const fps = state.doc.stage.fps || 24;
    const frame = Math.round(time * fps);
    state = {
      ...state,
      selectedLayerId: layerId,
      currentTime: time,
      currentFrame: frame,
      selectedTime: time,
      selectedFrameIndex: frame,
    };
    notify();
  },

  selectElement(elementId: string, multiSelect = false): void {
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const owningLayer = activeTl.layers.find((l) =>
      l.keyframes.some((kf) => kf.elements.some((el) => el.id === elementId))
    );
    const nextLayerId = owningLayer ? owningLayer.id : state.selectedLayerId;

    if (multiSelect) {
      const exists = state.selectedElementIds.includes(elementId);
      const next = exists
        ? state.selectedElementIds.filter((id) => id !== elementId)
        : [...state.selectedElementIds, elementId];
      state = {
        ...state,
        selectedElementIds: next,
        selectedLayerId: nextLayerId,
        scriptTriggerFocus: 'auto',
      };
    } else {
      state = {
        ...state,
        selectedElementIds: [elementId],
        selectedLayerId: nextLayerId,
        scriptTriggerFocus: 'auto',
      };
    }
    notify();
  },

  selectElements(elementIds: string[]): void {
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    let nextLayerId = state.selectedLayerId;
    const firstId = elementIds[0];
    if (firstId) {
      const owningLayer = activeTl.layers.find((l) =>
        l.keyframes.some((kf) => kf.elements.some((el) => el.id === firstId))
      );
      if (owningLayer) {
        nextLayerId = owningLayer.id;
      }
    }
    state = {
      ...state,
      selectedElementIds: elementIds,
      selectedLayerId: nextLayerId,
      scriptTriggerFocus: 'auto',
    };
    notify();
  },

  deselectAll(): void {
    if (state.selectedElementIds.length > 0) {
      state = { ...state, selectedElementIds: [] };
      notify();
    }
  },

  setPlayhead(frame: number): void {
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const total = activeTl.frameCount;
    const clamped = Math.max(0, Math.min(frame, Math.max(0, total - 1)));
    const fps = state.doc.stage.fps || 24;
    const time = clamped / fps;
    state = {
      ...state,
      currentFrame: clamped,
      selectedFrameIndex: clamped,
      currentTime: time,
      selectedTime: time,
    };
    notify();
  },



  setPlayheadTime(timeInSeconds: number): void {
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const fps = state.doc.stage.fps || 24;
    const totalDuration = computeTotalTimelineDuration(activeTl, fps);
    const clamped = Math.max(0, timeInSeconds);
    const frame = Math.round(clamped * fps);
    state = {
      ...state,
      currentTime: clamped,
      currentFrame: frame,
      selectedTime: clamped,
      selectedFrameIndex: frame,
    };
    notify();
  },

  setCurrentFrame(frameIndex: number): void {
    const fps = state.doc.stage.fps || 24;
    editorActions.setPlayheadTime(frameIndex / fps);
  },

  setCurrentTime(timeInSeconds: number): void {
    editorActions.setPlayheadTime(timeInSeconds);
  },

  setPlaying(playing: boolean): void {
    if (playing) {
      editorActions.play();
    } else {
      editorActions.stop();
    }
  },

  play(): void {
    if (state.isPlaying) return;
    state = { ...state, isPlaying: true };
    notify();

    if (rafTimer !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafTimer);
      else clearTimeout(rafTimer);
      rafTimer = null;
    }
    if (tickerTimer) {
      clearInterval(tickerTimer);
      tickerTimer = null;
    }

    lastRafTime = performance.now();
    let loopCycle = 0;
    let isFirstTick = true;

    const tick = (now: number) => {
      if (!state.isPlaying) return;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastRafTime) / 1000));
      lastRafTime = now;

      const activeTl = getActiveTimeline(state.doc, state.isolationStack);
      const fps = state.doc.stage.fps || 24;
      const totalDuration = computeTotalTimelineDuration(activeTl, fps);
      const prevTime = state.currentTime;
      let nextTime = state.currentTime + dt;

      if (nextTime >= totalDuration) {
        loopCycle++;
        if (typeof state.loopMode === 'number') {
          if (loopCycle >= state.loopMode) {
            editorActions.stop();
            return;
          }
        }
        nextTime = nextTime % Math.max(0.001, totalDuration);
      }

      const nextFrame = Math.round(nextTime * fps);
      state = {
        ...state,
        currentTime: nextTime,
        currentFrame: nextFrame,
        selectedFrameIndex: nextFrame,
        selectedTime: nextTime,
      };
      notify();

      editorActions.executeKeyframeScriptsInRange(prevTime, nextTime, isFirstTick);
      isFirstTick = false;

      if (typeof requestAnimationFrame !== 'undefined') {
        rafTimer = requestAnimationFrame(tick);
      } else {
        rafTimer = setTimeout(() => tick(performance.now()), 16) as any;
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      rafTimer = requestAnimationFrame(tick);
    } else {
      rafTimer = setTimeout(() => tick(performance.now()), 16) as any;
    }
  },

  stop(): void {
    executedKfScriptsMap.clear();
    if (rafTimer !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafTimer);
      else clearTimeout(rafTimer);
      rafTimer = null;
    }
    if (tickerTimer) {
      clearInterval(tickerTimer);
      tickerTimer = null;
    }
    if (state.isPlaying) {
      state = { ...state, isPlaying: false };
      notify();
    }
  },

  togglePlay(): void {
    if (state.isPlaying) {
      editorActions.stop();
    } else {
      editorActions.play();
    }
  },

  rewind(): void {
    editorActions.stop();
    editorActions.setPlayheadTime(0);
  },

  stepForward(stepSec = 0.05): void {
    editorActions.stop();
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const totalDuration = computeTotalTimelineDuration(activeTl, state.doc.stage.fps || 24);
    let nextTime = state.currentTime + stepSec;
    if (nextTime >= totalDuration) nextTime = 0;
    editorActions.setPlayheadTime(nextTime);
  },

  stepBackward(stepSec = 0.05): void {
    editorActions.stop();
    const activeTl = getActiveTimeline(state.doc, state.isolationStack);
    const totalDuration = computeTotalTimelineDuration(activeTl, state.doc.stage.fps || 24);
    let prevTime = state.currentTime - stepSec;
    if (prevTime < 0) prevTime = Math.max(0, totalDuration - stepSec);
    editorActions.setPlayheadTime(prevTime);
  },



  undo(): void {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack[state.undoStack.length - 1];
    const newUndo = state.undoStack.slice(0, -1);
    const newRedo = [deepCloneDoc(state.doc), ...state.redoStack];
    state = {
      ...state,
      doc: deepCloneDoc(last),
      undoStack: newUndo,
      redoStack: newRedo,
    };
    notify();
  },

  redo(): void {
    if (state.redoStack.length === 0) return;
    const next = state.redoStack[0];
    const newRedo = state.redoStack.slice(1);
    const newUndo = [...state.undoStack, deepCloneDoc(state.doc)];
    state = {
      ...state,
      doc: deepCloneDoc(next),
      undoStack: newUndo,
      redoStack: newRedo,
    };
    notify();
  },

  newDocument(): void {
    editorActions.stop();
    pushHistorySnapshot();
    const fresh = createDefaultDocument();
    state = {
      ...state,
      doc: fresh,
      selectedLayerId: fresh.root.layers[0].id,
      selectedFrameIndex: 0,
      selectedTime: 0,
      selectedElementIds: [],
      currentFrame: 0,
      currentTime: 0,
      isolationStack: [],
    };
    notify();
  },

  loadDocument(doc: EditorDocument): void {
    editorActions.stop();
    pushHistorySnapshot();
    state = {
      ...state,
      doc: deepCloneDoc(doc),
      selectedLayerId: doc.root.layers[0]?.id || null,
      selectedFrameIndex: 0,
      selectedTime: 0,
      selectedElementIds: [],
      currentFrame: 0,
      currentTime: 0,
      isolationStack: [],
    };
    notify();
  },

  exportToJS(format: 'esm' | 'json' = 'esm'): string {
    return serialize(state.doc, { defineAnimation: false, format });
  },

  loadFromJS(code: string): { success: boolean; error?: string } {
    try {
      const parsed = parse(code);
      const validated = validate(parsed);
      editorActions.stop();
      pushHistorySnapshot();
      state = {
        ...state,
        doc: validated,
        selectedLayerId: validated.root.layers[0]?.id ?? null,
        selectedFrameIndex: 0,
        selectedTime: 0,
        selectedElementIds: [],
        currentFrame: 0,
        currentTime: 0,
        isolationStack: [],
      };
      notify();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },

  /* ========================================================================= *
   * Timeline / Keyframe Mutations
   * ========================================================================= */

  insertKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (frameIndexOrTime > 30 ? frameIndexOrTime / fps : frameIndexOrTime)
      : state.currentTime;
    const targetFrame = Math.round(targetTime * fps);

    let layer: EditorLayer | undefined;
    if (state.selectedElementIds.length > 0) {
      layer = ensureElementHasDedicatedTrack(tl, state.selectedElementIds[0], fps);
    }
    if (!layer) {
      const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
      layer = tl.layers.find((l) => l.id === targetLayerId);
    }
    if (!layer) return;

    // Check if an element is specifically selected
    const selectedElIds = state.selectedElementIds;
    const hasElementSelection = selectedElIds.length > 0;

    // Sort keyframes by index/time ascending
    layer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));

    const existingKf = findKeyframeAtTime(layer, targetTime, fps) ?? findKeyframeAt(layer, targetFrame);
    if (existingKf) {
      const kfTime = getKeyframeTime(existingKf, fps);
      if (Math.abs(kfTime - targetTime) < 0.001 || existingKf.index === targetFrame) {
        // Already a keyframe start at this timestamp
        return;
      }
      // Split existing keyframe
      const splitOffsetFrames = targetFrame - existingKf.index;
      const originalDurationFrames = existingKf.duration;
      const originalDurationTime = getKeyframeDurationTime(existingKf, fps);
      const splitOffsetTime = targetTime - kfTime;

      existingKf.duration = splitOffsetFrames;
      existingKf.durationTime = splitOffsetTime;

      // When element(s) are selected, make sure they are preserved in the new keyframe for keyframing
      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        time: targetTime,
        duration: Math.max(1, originalDurationFrames - splitOffsetFrames),
        durationTime: Math.max(0.04, originalDurationTime - splitOffsetTime),
        elements: fastClone(existingKf.elements),
        tween: existingKf.tween ? fastClone(existingKf.tween) : undefined,
      };

      const kfIdx = layer.keyframes.indexOf(existingKf);
      layer.keyframes.splice(kfIdx + 1, 0, newKf);
    } else {
      // Extend previous or add new keyframe beyond the end of the last keyframe
      const lastKf = layer.keyframes[layer.keyframes.length - 1];
      if (lastKf && targetFrame > lastKf.index + lastKf.duration - 1) {
        const lastKfTime = getKeyframeTime(lastKf, fps);
        lastKf.duration = targetFrame - lastKf.index;
        lastKf.durationTime = targetTime - lastKfTime;

        // Carry forward selected element or all elements if none explicitly selected
        let carriedElements: EditorElement[] = [];
        if (hasElementSelection) {
          // If specific elements were selected, carry those forward so they can be keyframed beyond the previous span
          carriedElements = lastKf.elements.filter((e) => selectedElIds.includes(e.id));
          if (carriedElements.length === 0) carriedElements = lastKf.elements;
        } else {
          carriedElements = lastKf.elements;
        }

        const newKf: EditorKeyframe = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          time: targetTime,
          duration: fps,
          durationTime: 1.0,
          elements: fastClone(carriedElements),
        };
        layer.keyframes.push(newKf);
      } else {
        // Collect any elements from layer to carry forward if user has selected element
        let carriedElements: EditorElement[] = [];
        if (hasElementSelection) {
          const allLayerElements = layer.keyframes.flatMap((k) => k.elements);
          carriedElements = allLayerElements.filter((e) => selectedElIds.includes(e.id));
        }

        const newKf: EditorKeyframe = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          time: targetTime,
          duration: fps,
          durationTime: 1.0,
          elements: fastClone(carriedElements),
        };
        layer.keyframes.push(newKf);
        layer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
      }
    }

    normalizeLayerKeyframes(layer, fps);

    tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
    invalidateTimelineDurationCache(tl);
    state = { ...state, doc };
    notify();
  },

  groupLayerIntoFolder(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const nextNum = tl.layers.filter((l) => l.kind === 'folder').length + 1;
    const newFolder: EditorLayer = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `Folder ${nextNum}`,
      kind: 'folder',
      visible: true,
      locked: false,
      parentLayerId: layer.parentLayerId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ],
    };
    (newFolder as any).parentId = layer.parentLayerId;

    const layerIdx = tl.layers.findIndex((l) => l.id === layerId);
    if (layerIdx !== -1) {
      tl.layers.splice(layerIdx, 0, newFolder);
    } else {
      tl.layers.unshift(newFolder);
    }

    layer.parentLayerId = newFolder.id;
    (layer as any).parentId = newFolder.id;

    state = {
      ...state,
      doc,
      selectedLayerId: newFolder.id,
    };
    notify();
  },

  ungroupLayer(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (layer.kind === 'folder') {
      const parentId = layer.parentLayerId;
      for (const l of tl.layers) {
        if (l.parentLayerId === layer.id || (l as any).parentId === layer.id) {
          l.parentLayerId = parentId;
          (l as any).parentId = parentId;
        }
      }
      tl.layers = tl.layers.filter((l) => l.id !== layer.id);
    } else if (layer.parentLayerId || (layer as any).parentId) {
      delete layer.parentLayerId;
      delete (layer as any).parentId;
    }

    state = {
      ...state,
      doc,
      selectedLayerId: tl.layers[0]?.id ?? null,
    };
    notify();
  },

  moveLayerToFolder(layerId: string, targetFolderId?: string): void {
    editorActions.setLayerParent(layerId, targetFolderId);
  },

  insertBlankKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const layer = tl.layers.find((l) => l.id === targetLayerId);
    if (!layer) return;

    const isTime = typeof frameIndexOrTime === 'number' && frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (isTime ? frameIndexOrTime : frameIndexOrTime / fps)
      : state.currentTime;
    const targetFrame = Math.round(targetTime * fps);

    normalizeLayerKeyframes(layer, fps);

    const existingKf = findKeyframeAtTime(layer, targetTime, fps) ?? findKeyframeAt(layer, targetFrame);

    if (existingKf) {
      const kfTime = getKeyframeTime(existingKf, fps);
      if (Math.abs(kfTime - targetTime) < 1e-4 || existingKf.index === targetFrame) {
        existingKf.elements = [];
        delete existingKf.tween;
      } else {
        const splitOffsetFrames = targetFrame - existingKf.index;
        const originalDurationFrames = existingKf.duration;
        const originalDurationTime = getKeyframeDurationTime(existingKf, fps);
        const splitOffsetTime = targetTime - kfTime;

        existingKf.duration = splitOffsetFrames;
        existingKf.durationTime = splitOffsetTime;

        const newKf: EditorKeyframe = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          time: targetTime,
          duration: Math.max(1, originalDurationFrames - splitOffsetFrames),
          durationTime: Math.max(0.04, originalDurationTime - splitOffsetTime),
          elements: [],
        };

        const kfIdx = layer.keyframes.indexOf(existingKf);
        layer.keyframes.splice(kfIdx + 1, 0, newKf);
      }
    } else {
      const lastKf = layer.keyframes[layer.keyframes.length - 1];
      if (lastKf && targetFrame > lastKf.index) {
        const lastKfTime = getKeyframeTime(lastKf, fps);
        lastKf.duration = targetFrame - lastKf.index;
        lastKf.durationTime = Math.max(0.04, targetTime - lastKfTime);
      }

      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        time: targetTime,
        duration: fps,
        durationTime: 1.0,
        elements: [],
      };
      layer.keyframes.push(newKf);
    }

    normalizeLayerKeyframes(layer, fps);

    tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
    invalidateTimelineDurationCache(tl);
    state = {
      ...state,
      doc,
      selectedLayerId: layer.id,
      selectedFrameIndex: targetFrame,
      selectedTime: targetTime,
      selectedElementIds: [],
    };
    notify();
  },

  insertFrame(layerId?: string, frameIndex?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetFrame = frameIndex ?? state.currentFrame;
    const layer = tl.layers.find((l) => l.id === targetLayerId);
    if (!layer) return;

    layer.keyframes.sort((a, b) => a.index - b.index);
    const existingKf = findKeyframeAt(layer, targetFrame);

    if (existingKf) {
      existingKf.duration += 1;
      const kfIdx = layer.keyframes.indexOf(existingKf);
      for (let i = kfIdx + 1; i < layer.keyframes.length; i++) {
        layer.keyframes[i].index += 1;
      }
    } else {
      const lastKf = layer.keyframes[layer.keyframes.length - 1];
      if (lastKf) {
        lastKf.duration = targetFrame - lastKf.index + 1;
      }
    }

    let maxEnd = 1;
    for (const l of tl.layers) {
      for (const k of l.keyframes) {
        maxEnd = Math.max(maxEnd, k.index + k.duration);
      }
    }
    tl.frameCount = Math.max(tl.frameCount, maxEnd);
    state = { ...state, doc };
    notify();
  },

  removeFrame(layerId?: string, frameIndex?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetFrame = frameIndex ?? state.currentFrame;
    const layer = tl.layers.find((l) => l.id === targetLayerId);
    if (!layer) return;

    layer.keyframes.sort((a, b) => a.index - b.index);
    const existingKf = findKeyframeAt(layer, targetFrame);

    if (existingKf) {
      if (existingKf.duration > 1) {
        existingKf.duration -= 1;
        const kfIdx = layer.keyframes.indexOf(existingKf);
        for (let i = kfIdx + 1; i < layer.keyframes.length; i++) {
          layer.keyframes[i].index -= 1;
        }
      } else if (layer.keyframes.length > 1) {
        const kfIdx = layer.keyframes.indexOf(existingKf);
        layer.keyframes.splice(kfIdx, 1);
        for (let i = kfIdx; i < layer.keyframes.length; i++) {
          layer.keyframes[i].index -= 1;
        }
      }
    }

    let maxEnd = 1;
    for (const l of tl.layers) {
      for (const k of l.keyframes) {
        maxEnd = Math.max(maxEnd, k.index + k.duration);
      }
    }
    tl.frameCount = Math.max(1, maxEnd);
    if (state.currentFrame >= tl.frameCount) {
      state.currentFrame = tl.frameCount - 1;
      state.selectedFrameIndex = state.currentFrame;
    }
    state = { ...state, doc };
    notify();
  },

  createMotionTween(layerId: string, timeOrIndex?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const fps = doc.stage.fps || 24;
    const targetTime = timeOrIndex !== undefined
      ? (timeOrIndex > 30 ? timeOrIndex / fps : timeOrIndex)
      : state.currentTime;

    layer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));

    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? layer.keyframes.find((k) => k.index === timeOrIndex);
    if (!kf && layer.keyframes.length > 0) {
      kf = layer.keyframes[0];
    }
    if (!kf) return;

    const sortedKfs = [...layer.keyframes].sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
    const kfIdx = sortedKfs.indexOf(kf);
    let targetKf = kf;
    if (kfIdx === sortedKfs.length - 1 && kfIdx > 0) {
      targetKf = sortedKfs[kfIdx - 1];
    }

    targetKf.tween = {
      type: 'motion',
      easing: { type: 'linear' },
    };

    if (sortedKfs.length === 1) {
      if (targetKf.duration < 24) {
        targetKf.duration = 24;
        targetKf.durationTime = 24 / fps;
      }
      const endFrame = targetKf.index + targetKf.duration;
      const endTime = endFrame / fps;
      const endKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: endFrame,
        time: endTime,
        duration: 1,
        durationTime: 1 / fps,
        elements: fastClone(targetKf.elements),
      };
      layer.keyframes.push(endKf);
    }

    state = { ...state, doc };
    notify();
  },

  removeTween(layerId: string, timeOrIndex?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const fps = doc.stage.fps || 24;
    const targetTime = timeOrIndex !== undefined
      ? (timeOrIndex > 30 ? timeOrIndex / fps : timeOrIndex)
      : state.currentTime;

    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? layer.keyframes.find((k) => k.index === timeOrIndex);
    if (!kf) return;
    delete kf.tween;
    state = { ...state, doc };
    notify();
  },

  updateTweenRotate(
    layerId: string,
    timeOrIndex: number | undefined,
    rotate: { direction: 'cw' | 'ccw'; turns: number } | undefined
  ): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const fps = doc.stage.fps || 24;
    const targetTime = timeOrIndex !== undefined
      ? (timeOrIndex > 30 ? timeOrIndex / fps : timeOrIndex)
      : state.currentTime;

    const sortedKfs = [...layer.keyframes].sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? layer.keyframes.find((k) => k.index === timeOrIndex);
    if (!kf && sortedKfs.length > 0) {
      kf = sortedKfs[0];
    }
    if (!kf) return;

    const kfIdx = sortedKfs.indexOf(kf);
    let targetKf = kf;
    if (kfIdx === sortedKfs.length - 1 && kfIdx > 0 && !targetKf.tween) {
      targetKf = sortedKfs[kfIdx - 1];
    }

    if (!targetKf.tween) {
      targetKf.tween = { type: 'motion', easing: { type: 'linear' } };
    }

    if (rotate) {
      targetKf.tween.rotate = {
        direction: rotate.direction,
        turns: Math.max(0, rotate.turns ?? 0),
      };
    } else {
      delete targetKf.tween.rotate;
    }

    state = { ...state, doc };
    notify();
  },

  moveKeyframe(
    layerId: string,
    fromFrameIndexOrTime: number,
    toTimeSec: number,
    options?: { skipHistory?: boolean; elementId?: string }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    const targetLayer = tl.layers.find((l) => l.id === layerId);
    if (!targetLayer) return;

    const isSeconds = fromFrameIndexOrTime < 30 && !Number.isInteger(fromFrameIndexOrTime);
    const fromTime = isSeconds ? fromFrameIndexOrTime : fromFrameIndexOrTime / fps;
    const fromFrame = isSeconds ? Math.round(fromFrameIndexOrTime * fps) : fromFrameIndexOrTime;

    const kf =
      targetLayer.keyframes.find((k) => k.index === fromFrame) ??
      findKeyframeAtTime(targetLayer, fromTime, fps) ??
      targetLayer.keyframes.find((k) => Math.abs(getKeyframeTime(k, fps) - fromTime) < 0.05) ??
      targetLayer.keyframes.find((k) => k.index === fromFrameIndexOrTime);

    if (!kf) return;

    const targetTimeClamped = Math.max(0, toTimeSec);
    let targetFrame = Math.round(targetTimeClamped * fps);

    const otherKfs = targetLayer.keyframes.filter((k) => k.id !== kf.id);

    if (otherKfs.some((k) => k.index === targetFrame)) {
      if (targetFrame >= (kf.index ?? 0)) {
        while (otherKfs.some((k) => k.index === targetFrame)) {
          targetFrame++;
        }
      } else {
        while (targetFrame > 0 && otherKfs.some((k) => k.index === targetFrame)) {
          targetFrame--;
        }
        if (otherKfs.some((k) => k.index === targetFrame)) {
          targetFrame = kf.index ?? 0;
        }
      }
    }

    kf.index = targetFrame;
    kf.time = targetFrame / fps;

    targetLayer.keyframes.sort((a, b) => a.index - b.index);

    for (let i = 0; i < targetLayer.keyframes.length - 1; i++) {
      const cur = targetLayer.keyframes[i];
      const next = targetLayer.keyframes[i + 1];
      cur.duration = Math.max(1, next.index - cur.index);
      cur.durationTime = Math.max(0.04, getKeyframeTime(next, fps) - getKeyframeTime(cur, fps));
    }
    const lastKf = targetLayer.keyframes[targetLayer.keyframes.length - 1];
    if (lastKf) {
      if (!lastKf.duration || lastKf.duration < 1) {
        lastKf.duration = fps;
      }
      lastKf.durationTime = Math.max(0.04, lastKf.duration / fps);
    }

    const maxEnd = Math.max(...tl.layers.flatMap((l) => l.keyframes.map((k) => k.index)));
    tl.frameCount = Math.max(1, maxEnd);
    invalidateTimelineDurationCache(tl);

    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
      selectedFrameIndex: kf.index,
      selectedTime: kf.time,
    };
    notify();
  },

  deleteKeyframe(
    layerId: string,
    frameIndexOrTime: number,
    options?: { skipHistory?: boolean; elementId?: string }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    const targetLayer = tl.layers.find((l) => l.id === layerId);
    if (!targetLayer || targetLayer.keyframes.length <= 1) return;

    const isSeconds = frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const fromTime = isSeconds ? frameIndexOrTime : frameIndexOrTime / fps;
    const fromFrame = isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime;

    const kfIdx = targetLayer.keyframes.findIndex(
      (k) =>
        k.index === fromFrame ||
        Math.abs(getKeyframeTime(k, fps) - fromTime) < 0.05 ||
        k.index === frameIndexOrTime
    );

    if (kfIdx === -1) return;

    targetLayer.keyframes.splice(kfIdx, 1);

    for (let i = 0; i < targetLayer.keyframes.length - 1; i++) {
      const cur = targetLayer.keyframes[i];
      const next = targetLayer.keyframes[i + 1];
      cur.duration = Math.max(1, next.index - cur.index);
      cur.durationTime = Math.max(0.04, getKeyframeTime(next, fps) - getKeyframeTime(cur, fps));
    }
    const lastKf = targetLayer.keyframes[targetLayer.keyframes.length - 1];
    if (lastKf) {
      if (!lastKf.duration || lastKf.duration < 1) {
        lastKf.duration = fps;
      }
      lastKf.durationTime = Math.max(0.04, lastKf.duration / fps);
    }

    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
    };
    notify();
  },

  copyKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const fps = state.doc.stage.fps || 24;
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetLayer = tl.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const isSeconds = typeof frameIndexOrTime === 'number' && frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const fromTime = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? frameIndexOrTime : frameIndexOrTime / fps)
      : state.currentTime;
    const fromFrame = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime)
      : state.currentFrame;

    const kf = findKeyframeAtTime(targetLayer, fromTime, fps) ?? findKeyframeAt(targetLayer, fromFrame);
    if (!kf) return;

    state = {
      ...state,
      keyframeClipboard: fastClone(kf),
    };
    notify();
  },

  pasteKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    if (!state.keyframeClipboard) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetLayer = tl.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const isSeconds = typeof frameIndexOrTime === 'number' && frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? frameIndexOrTime : frameIndexOrTime / fps)
      : state.currentTime;
    const targetFrame = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime)
      : state.currentFrame;

    targetLayer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));

    const pastedKf: EditorKeyframe = fastClone(state.keyframeClipboard);
    pastedKf.id = `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pastedKf.index = targetFrame;
    pastedKf.time = targetTime;
    pastedKf.elements = pastedKf.elements.map((el) => ({
      ...el,
      id: `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    }));

    const existingKf = findKeyframeAtTime(targetLayer, targetTime, fps) ?? findKeyframeAt(targetLayer, targetFrame);
    if (existingKf) {
      if (existingKf.index === targetFrame || Math.abs(getKeyframeTime(existingKf, fps) - targetTime) < 0.001) {
        existingKf.elements = pastedKf.elements;
        existingKf.tween = pastedKf.tween ? fastClone(pastedKf.tween) : undefined;
      } else {
        const splitOffsetFrames = targetFrame - existingKf.index;
        const originalDurationFrames = existingKf.duration;
        const originalDurationTime = getKeyframeDurationTime(existingKf, fps);
        const splitOffsetTime = targetTime - getKeyframeTime(existingKf, fps);

        existingKf.duration = splitOffsetFrames;
        existingKf.durationTime = splitOffsetTime;

        pastedKf.duration = Math.max(1, originalDurationFrames - splitOffsetFrames);
        pastedKf.durationTime = Math.max(0.04, originalDurationTime - splitOffsetTime);

        const kfIdx = targetLayer.keyframes.indexOf(existingKf);
        targetLayer.keyframes.splice(kfIdx + 1, 0, pastedKf);
      }
    } else {
      const lastKf = targetLayer.keyframes[targetLayer.keyframes.length - 1];
      if (lastKf && targetFrame > lastKf.index + lastKf.duration - 1) {
        lastKf.duration = targetFrame - lastKf.index;
        lastKf.durationTime = targetTime - getKeyframeTime(lastKf, fps);
      }
      pastedKf.duration = pastedKf.duration || fps;
      pastedKf.durationTime = pastedKf.durationTime || 1;
      targetLayer.keyframes.push(pastedKf);
      targetLayer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
    }

    tl.frameCount = Math.max(tl.frameCount, targetFrame + (pastedKf.duration || 1));
    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
    };
    notify();
  },

  duplicateKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetLayer = tl.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const isSeconds = typeof frameIndexOrTime === 'number' && frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? frameIndexOrTime : frameIndexOrTime / fps)
      : state.currentTime;
    const targetFrame = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime)
      : state.currentFrame;

    targetLayer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
    const kf = findKeyframeAtTime(targetLayer, targetTime, fps) ?? findKeyframeAt(targetLayer, targetFrame);
    if (!kf) return;

    const duplicateKf: EditorKeyframe = {
      ...fastClone(kf),
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      elements: kf.elements.map((el) => ({
        ...el,
        id: `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      })),
    };

    if (kf.duration > 1) {
      const splitFrame = (targetFrame > kf.index) ? targetFrame : kf.index + 1;
      const splitTime = splitFrame / fps;
      const originalDuration = kf.duration;
      const originalDurTime = getKeyframeDurationTime(kf, fps);

      kf.duration = splitFrame - kf.index;
      kf.durationTime = splitTime - getKeyframeTime(kf, fps);

      duplicateKf.index = splitFrame;
      duplicateKf.time = splitTime;
      duplicateKf.duration = Math.max(1, originalDuration - kf.duration);
      duplicateKf.durationTime = Math.max(0.04, originalDurTime - kf.durationTime);

      const kfIdx = targetLayer.keyframes.indexOf(kf);
      targetLayer.keyframes.splice(kfIdx + 1, 0, duplicateKf);
    } else {
      duplicateKf.index = kf.index + 1;
      duplicateKf.time = (kf.index + 1) / fps;
      duplicateKf.duration = 1;
      duplicateKf.durationTime = 1 / fps;

      const kfIdx = targetLayer.keyframes.indexOf(kf);
      targetLayer.keyframes.splice(kfIdx + 1, 0, duplicateKf);
    }

    tl.frameCount = Math.max(tl.frameCount, duplicateKf.index + duplicateKf.duration);
    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
    };
    notify();
  },

  convertToBlankKeyframe(layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const targetLayer = tl.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const isSeconds = typeof frameIndexOrTime === 'number' && frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? frameIndexOrTime : frameIndexOrTime / fps)
      : state.currentTime;
    const targetFrame = typeof frameIndexOrTime === 'number'
      ? (isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime)
      : state.currentFrame;

    const kf = findKeyframeAtTime(targetLayer, targetTime, fps) ?? findKeyframeAt(targetLayer, targetFrame);
    if (!kf) return;

    kf.elements = [];
    delete kf.tween;
    delete (kf as any).transform;

    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
    };
    notify();
  },

  /* ========================================================================= *
   * Element Mutations
   * ========================================================================= */

  addElement(element: EditorElement, layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (frameIndexOrTime > 30 ? frameIndexOrTime / fps : frameIndexOrTime)
      : state.currentTime;
    const targetFrame = Math.round(targetTime * fps);

    const durationFrames = Math.max(fps, (tl.frameCount || 24) - targetFrame);
    const durationTime = durationFrames / fps;

    // Determine target/active layer
    const activeLayer = (layerId ? tl.layers.find((l) => l.id === layerId) : undefined)
      ?? (state.selectedLayerId ? tl.layers.find((l) => l.id === state.selectedLayerId) : undefined)
      ?? tl.layers[0];

    if (!activeLayer) {
      const newLayer: EditorLayer = {
        id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: getElementDefaultName(element, doc.library?.symbols),
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            index: targetFrame,
            time: targetTime,
            duration: durationFrames,
            durationTime: durationTime,
            elements: [element],
          },
        ],
      };
      tl.layers.push(newLayer);
      tl.frameCount = Math.max(tl.frameCount, targetFrame + durationFrames);
      state = {
        ...state,
        doc,
        selectedLayerId: newLayer.id,
        selectedElementIds: [element.id],
      };
      notify();
      return;
    }

    if (activeLayer.kind === 'folder') {
      const newLayer: EditorLayer = {
        id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: getElementDefaultName(element, doc.library?.symbols),
        kind: 'normal',
        visible: true,
        locked: false,
        parentLayerId: activeLayer.id,
        keyframes: [
          {
            id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            index: targetFrame,
            time: targetTime,
            duration: durationFrames,
            durationTime: durationTime,
            elements: [element],
          },
        ],
      };
      (newLayer as any).parentId = activeLayer.id;
      const folderIdx = tl.layers.indexOf(activeLayer);
      tl.layers.splice(folderIdx + 1, 0, newLayer);
      tl.frameCount = Math.max(tl.frameCount, targetFrame + durationFrames);
      state = {
        ...state,
        doc,
        selectedLayerId: newLayer.id,
        selectedElementIds: [element.id],
      };
      notify();
      return;
    }

    let targetKf = findKeyframeAtTime(activeLayer, targetTime, fps) ?? findKeyframeAt(activeLayer, targetFrame);
    const isCurrentKfBlank = Boolean(targetKf && targetKf.elements.length === 0);
    const isLayerEntirelyEmpty = activeLayer.keyframes.every((k) => k.elements.length === 0);

    if (isCurrentKfBlank || isLayerEntirelyEmpty) {
      if (isLayerEntirelyEmpty) {
        activeLayer.name = getElementDefaultName(element, doc.library?.symbols);
      }

      if (!targetKf) {
        targetKf = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          time: targetTime,
          duration: durationFrames,
          durationTime: durationTime,
          elements: [],
        };
        activeLayer.keyframes.push(targetKf);
        activeLayer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
      } else {
        if (targetKf.time === undefined) targetKf.time = targetTime;
        if (targetKf.durationTime === undefined) targetKf.durationTime = targetKf.duration ? targetKf.duration / fps : durationTime;
      }

      if (isCurrentKfBlank && !isLayerEntirelyEmpty) {
        const targetKfTime = getKeyframeTime(targetKf, fps);
        const prevKf = [...activeLayer.keyframes]
          .filter(
            (k) =>
              k !== targetKf &&
              (getKeyframeTime(k, fps) < targetKfTime - 1e-4 ||
                (k.index !== undefined && targetKf!.index !== undefined && k.index < targetKf!.index))
          )
          .sort((a, b) => getKeyframeTime(b, fps) - getKeyframeTime(a, fps))[0];
        if (prevKf && prevKf.elements.length > 0) {
          const prevElement = prevKf.elements[0];
          if (prevElement && prevElement.id) {
            element.id = prevElement.id;
          }
        }
      }

      targetKf.elements.push(element);
      tl.frameCount = Math.max(tl.frameCount, (targetKf.index ?? targetFrame) + (targetKf.duration ?? 1), targetFrame + 1);
      state = {
        ...state,
        doc,
        selectedLayerId: activeLayer.id,
        selectedElementIds: [element.id],
      };
      notify();
      return;
    }

    // Active layer already has elements on this keyframe (and is not empty): create a dedicated new layer for this element
    const parentFolderId = activeLayer.parentLayerId || (activeLayer as any).parentId;
    const newLayer: EditorLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: getElementDefaultName(element, doc.library?.symbols),
      kind: 'normal',
      visible: true,
      locked: false,
      parentLayerId: parentFolderId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          time: targetTime,
          duration: durationFrames,
          durationTime: durationTime,
          elements: [element],
        },
      ],
    };
    if (parentFolderId) {
      (newLayer as any).parentId = parentFolderId;
    }
    const activeIdx = tl.layers.indexOf(activeLayer);
    const insertIdx = activeIdx >= 0 ? activeIdx : 0;
    tl.layers.splice(insertIdx, 0, newLayer);
    tl.frameCount = Math.max(tl.frameCount, targetFrame + durationFrames);
    state = {
      ...state,
      doc,
      selectedLayerId: newLayer.id,
      selectedElementIds: [element.id],
    };
    notify();
  },

  addBitmapElement(src: string, name?: string, width?: number, height?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.library) {
      doc.library = { symbols: {}, audio: {}, fonts: {}, bitmaps: {} };
    }
    if (!doc.library.bitmaps) {
      doc.library.bitmaps = {};
    }
    const bitmapId = `bmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const w = width || 240;
    const h = height || 180;
    const assetName = name || `Bitmap ${Object.keys(doc.library.bitmaps).length + 1}`;
    doc.library.bitmaps[bitmapId] = {
      id: bitmapId,
      name: assetName,
      src,
      width: w,
      height: h,
      smoothing: true,
    };

    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = state.selectedLayerId ?? tl.layers[0]?.id;
    const fps = doc.stage.fps || 24;
    const targetTime = state.currentTime;
    const targetFrame = Math.round(targetTime * fps);
    const layer = tl.layers.find((l) => l.id === targetLayerId) ?? tl.layers[0];
    if (!layer) return;

    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? findKeyframeAt(layer, targetFrame);
    if (!kf) {
      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        time: targetTime,
        duration: fps,
        durationTime: 1.0,
        elements: [],
      };
      layer.keyframes.push(newKf);
      layer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
      tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
      kf = newKf;
    }

    const isolatedSym =
      state.isolationStack.length > 0
        ? doc.library.symbols[state.isolationStack[state.isolationStack.length - 1].symbolId]
        : undefined;
    const stageW = isolatedSym?.width || doc.stage.width || 550;
    const stageH = isolatedSym?.height || doc.stage.height || 400;

    const bitmapEl: BitmapElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'bitmap',
      bitmapId,
      src,
      width: w,
      height: h,
      alpha: 1,
      visible: true,
      transform: {
        x: Math.round((stageW - w) / 2),
        y: Math.round((stageH - h) / 2),
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: Math.round(w / 2),
        originY: Math.round(h / 2),
      },
    };

    kf.elements.push(bitmapEl as EditorElement);
    state = {
      ...state,
      doc,
      selectedLayerId: layer.id,
      selectedElementIds: [bitmapEl.id],
    };
    notify();
  },

  addVideoElement(src: string, width?: number, height?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = state.selectedLayerId ?? tl.layers[0]?.id;
    const fps = doc.stage.fps || 24;
    const targetTime = state.currentTime;
    const targetFrame = Math.round(targetTime * fps);
    const layer = tl.layers.find((l) => l.id === targetLayerId) ?? tl.layers[0];
    if (!layer) return;

    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? findKeyframeAt(layer, targetFrame);
    if (!kf) {
      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        time: targetTime,
        duration: fps,
        durationTime: 1.0,
        elements: [],
      };
      layer.keyframes.push(newKf);
      layer.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
      tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
      kf = newKf;
    }

    const w = width || 320;
    const h = height || 180;
    const videoEl: VideoElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'video',
      src,
      width: w,
      height: h,
      autoplay: true,
      loop: true,
      muted: true,
      controls: true,
      alpha: 1,
      visible: true,
      transform: {
        x: Math.round(((doc.stage.width || 550) - w) / 2),
        y: Math.round(((doc.stage.height || 400) - h) / 2),
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      },
    };

    kf.elements.push(videoEl as EditorElement);
    state = {
      ...state,
      doc,
      selectedLayerId: layer.id,
      selectedElementIds: [videoEl.id],
    };
    notify();
  },

  updateElementTransform(
    id: string,
    transform: Partial<Transform>,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    const fps = doc.stage.fps || 24;
    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === id);
      if (elIndex >= 0) {
        let targetKf = kf;
        if (state.isPlaying || kf.tween?.type === 'motion') {
          const kfTime = getKeyframeTime(kf, fps);
          const targetTime = state.currentTime;
          const targetFrame = Math.round(targetTime * fps);
          if (targetTime > kfTime + 0.001 && targetFrame > kf.index) {
            const splitOffsetFrames = targetFrame - kf.index;
            const originalDurationFrames = kf.duration;
            const originalDurationTime = getKeyframeDurationTime(kf, fps);
            const splitOffsetTime = targetTime - kfTime;

            kf.duration = splitOffsetFrames;
            kf.durationTime = splitOffsetTime;

            const newKf: EditorKeyframe = {
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              index: targetFrame,
              time: targetTime,
              duration: Math.max(1, originalDurationFrames - splitOffsetFrames),
              durationTime: Math.max(0.04, originalDurationTime - splitOffsetTime),
              elements: fastClone(kf.elements),
              tween: kf.tween ? fastClone(kf.tween) : undefined,
            };

            const kfIdx = layer.keyframes.indexOf(kf);
            layer.keyframes.splice(kfIdx + 1, 0, newKf);
            targetKf = newKf;
          }
        }
        const el = targetKf.elements.find((e) => e.id === id);
        if (el) {
          el.transform = {
            ...el.transform,
            ...transform,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateElementProps(
    id: string,
    props: Partial<EditorElement> & Record<string, any>,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === id);
      if (elIndex >= 0) {
        let targetKf = kf;
        if (state.isPlaying || kf.tween?.type === 'motion') {
          const kfTime = getKeyframeTime(kf, fps);
          const targetTime = state.currentTime;
          const targetFrame = Math.round(targetTime * fps);
          if (targetTime > kfTime + 0.001 && targetFrame > kf.index) {
            const splitOffsetFrames = targetFrame - kf.index;
            const originalDurationFrames = kf.duration;
            const originalDurationTime = getKeyframeDurationTime(kf, fps);
            const splitOffsetTime = targetTime - kfTime;

            kf.duration = splitOffsetFrames;
            kf.durationTime = splitOffsetTime;

            const newKf: EditorKeyframe = {
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              index: targetFrame,
              time: targetTime,
              duration: Math.max(1, originalDurationFrames - splitOffsetFrames),
              durationTime: Math.max(0.04, originalDurationTime - splitOffsetTime),
              elements: fastClone(kf.elements),
              tween: kf.tween ? fastClone(kf.tween) : undefined,
            };

            const kfIdx = layer.keyframes.indexOf(kf);
            layer.keyframes.splice(kfIdx + 1, 0, newKf);
            targetKf = newKf;
          }
        }
        const targetEl = targetKf.elements.find((e) => e.id === id);
        if (targetEl) {
          if (targetEl.type === 'bitmap' && (targetEl as any).bitmapId && props.src && doc.library?.bitmaps?.[(targetEl as any).bitmapId]) {
            doc.library.bitmaps[(targetEl as any).bitmapId].src = props.src;
          }
          Object.assign(targetEl, props);
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  convertTextType(
    elementId: string,
    targetType: 'point' | 'area' | 'path',
    options?: { pathData?: string; pathId?: string }
  ): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type !== 'text') break;
        const textEl = el as TextElement;

        if (targetType === 'point') {
          kf.elements[elIndex] = {
            ...textEl,
            textType: 'point',
            multiline: false,
            width: 0,
            height: 0,
            pathConfig: undefined,
          };
        } else if (targetType === 'area') {
          kf.elements[elIndex] = {
            ...textEl,
            textType: 'area',
            multiline: true,
            width: textEl.width && textEl.width > 0 ? textEl.width : 220,
            height: textEl.height && textEl.height > 0 ? textEl.height : 60,
            pathConfig: undefined,
          };
        } else if (targetType === 'path') {
          const defaultPath =
            options?.pathData ||
            textEl.pathConfig?.pathData ||
            'M 0 50 Q 150 0 300 50';
          kf.elements[elIndex] = {
            ...textEl,
            textType: 'path',
            multiline: false,
            pathConfig: {
              pathId: options?.pathId || textEl.pathConfig?.pathId,
              pathData: defaultPath,
              startOffset: textEl.pathConfig?.startOffset ?? 0,
            },
          };
        }
        updated = true;
        break;
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  attachTextToPath(
    textId: string,
    pathData: string,
    pathId?: string,
    startOffset = 0
  ): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === textId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type !== 'text') break;
        const textEl = el as TextElement;
        kf.elements[elIndex] = {
          ...textEl,
          textType: 'path',
          pathConfig: {
            pathId,
            pathData,
            startOffset,
          },
        };
        updated = true;
        break;
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  detachTextFromPath(textId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === textId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type !== 'text') break;
        const textEl = el as TextElement;
        kf.elements[elIndex] = {
          ...textEl,
          textType: 'point',
          multiline: false,
          pathConfig: undefined,
        };
        updated = true;
        break;
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateStarShape(
    elementId: string,
    config: { points?: number; pointRatio?: number; cornerRadius?: number },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && (shape as any).isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig = (shape as any).starConfig || {};
          const bounds = getShapeBounds(shape);
          const outerRadius =
            prevConfig.outerRadius ??
            Math.max(8, Math.max(bounds.width, bounds.height) / 2);
          const cx = prevConfig.cx ?? (shape.transform.originX || outerRadius);
          const cy = prevConfig.cy ?? (shape.transform.originY || outerRadius);
          const startAngle = prevConfig.startAngle ?? -Math.PI / 2;

          const prevPoints = prevConfig.points ?? 5;
          const points =
            config.points !== undefined
              ? Math.max(3, Math.min(64, Math.round(config.points)))
              : prevPoints;
          const pointRatio =
            config.pointRatio !== undefined
              ? Math.max(0.05, Math.min(3.0, config.pointRatio))
              : (prevConfig.pointRatio ?? 0.5);
          const nextCornerRadius =
            config.cornerRadius !== undefined
              ? Math.max(0, Math.min(100, config.cornerRadius))
              : (prevConfig.cornerRadius !== undefined && prevConfig.cornerRadius > 0
                  ? prevConfig.cornerRadius
                  : (shape.pathCornerRadius ?? prevConfig.cornerRadius ?? 0));

          const unroundedStarD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            0
          );

          let nextAnchorRadii = shape.pathAnchorRadii;
          let nextAnchorTypes = shape.pathAnchorTypes;
          if (config.points !== undefined && config.points !== prevPoints) {
            nextAnchorRadii = undefined;
            nextAnchorTypes = undefined;
          }

          let newD: string;
          if (
            (shape.pathCornerType && shape.pathCornerType !== 'round') ||
            nextAnchorRadii ||
            nextAnchorTypes
          ) {
            newD = applyCornerRadiusToPath(
              unroundedStarD,
              nextCornerRadius,
              shape.pathCornerType ?? 'round',
              nextAnchorRadii,
              nextAnchorTypes
            );
          } else {
            newD = generatePolygonStarPath(
              cx,
              cy,
              outerRadius,
              points,
              pointRatio,
              startAngle,
              nextCornerRadius
            );
          }

          const updatedStarConfig = {
            ...prevConfig,
            points,
            pointRatio,
            outerRadius,
            startAngle,
            cornerRadius: nextCornerRadius,
            cx,
            cy,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: { type: 'solid', color: state.fillColor },
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            starConfig: updatedStarConfig,
            basePathD: unroundedStarD,
            pathCornerRadius: nextCornerRadius,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
          } as any;

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetStarShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig = (shape as any).starConfig || {};
          const bounds = getShapeBounds(shape);
          const outerRadius =
            prevConfig.outerRadius ??
            Math.max(8, Math.max(bounds.width, bounds.height) / 2);
          const cx = prevConfig.cx ?? (shape.transform.originX || outerRadius);
          const cy = prevConfig.cy ?? (shape.transform.originY || outerRadius);
          const startAngle = prevConfig.startAngle ?? -Math.PI / 2;
          const points = prevConfig.points ?? 5;
          const pointRatio = prevConfig.pointRatio ?? 0.5;
          const cornerRadius = prevConfig.cornerRadius ?? shape.pathCornerRadius ?? 0;

          const unroundedStarD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            0
          );

          const newD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            cornerRadius
          );

          const updatedStarConfig = {
            ...prevConfig,
            points,
            pointRatio,
            outerRadius,
            startAngle,
            cornerRadius,
            cx,
            cy,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: { type: 'solid', color: state.fillColor },
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            starConfig: updatedStarConfig,
            basePathD: unroundedStarD,
            pathCornerRadius: cornerRadius,
            pathCornerType: undefined,
            pathAnchorRadii: undefined,
            pathAnchorTypes: undefined,
            isCustomizedPath: false,
          } as any;

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateRectShape(
    elementId: string,
    config: {
      width?: number;
      height?: number;
      cornerRadius?: number | RectCornerRadius;
      cornerType?: CornerType | RectCornerTypes;
    },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && shape.isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig: Partial<RectConfig> = shape.rectConfig || {};
          const bounds = getShapeBounds(shape);
          const width = Math.max(8, config.width ?? prevConfig.width ?? bounds.width);
          const height = Math.max(8, config.height ?? prevConfig.height ?? bounds.height);
          const cornerRadius =
            config.cornerRadius !== undefined
              ? config.cornerRadius
              : (prevConfig.cornerRadius ?? 0);
          const cornerType: CornerType | RectCornerTypes =
            config.cornerType ?? prevConfig.cornerType ?? 'round';

          const newD = generateRoundedRectPath(
            width,
            height,
            cornerRadius,
            cornerType,
            bounds.x,
            bounds.y
          );

          const updatedRectConfig: RectConfig = {
            width,
            height,
            cornerRadius,
            cornerType,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: state.activeFill,
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            rectConfig: updatedRectConfig,
          };

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetRectShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig: Partial<RectConfig> = shape.rectConfig || {};
          const bounds = getShapeBounds(shape);
          const width = Math.max(8, prevConfig.width ?? bounds.width);
          const height = Math.max(8, prevConfig.height ?? bounds.height);
          const cornerRadius = prevConfig.cornerRadius ?? 0;
          const cornerType: CornerType | RectCornerTypes = prevConfig.cornerType ?? 'round';

          const newD = generateRoundedRectPath(width, height, cornerRadius, cornerType, 0, 0);

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            rectConfig: { width, height, cornerRadius, cornerType },
            basePathD: undefined,
            pathCornerRadius: undefined,
            pathAnchorRadii: undefined,
            pathAnchorTypes: undefined,
            isCustomizedPath: false,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  /**
   * Inserts a new anchor point along segment `segmentIndex` of path `pathIndex` at parameter `t` (default 0.5).
   * If the shape was a parametric rectangle/star, converts its base polygon so the user can freely manipulate
   * the new anchor point while preserving Live Corner Radius support!
   */
  insertPathAnchor(
    elementId: string,
    pathIndex = 0,
    segmentIndex = 0,
    t = 0.5,
    options?: { skipHistory?: boolean }
  ): number | null {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let insertedIdx: number | null = null;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const targetPath = shape.paths[pathIndex];
          if (!targetPath) break;

          // Determine the un-rounded base path if we're editing pathIndex === 0
          let currentBaseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : targetPath.d;
          let carriedRadius = shape.pathCornerRadius ?? 0;
          let carriedType: CornerType = shape.pathCornerType ?? 'round';

          if (pathIndex === 0 && !shape.basePathD) {
            if (shape.rectConfig && !shape.isCustomizedPath) {
              const bounds = getShapeBounds(shape);
              const w = shape.rectConfig.width ?? bounds.width;
              const h = shape.rectConfig.height ?? bounds.height;
              currentBaseD = generateRoundedRectPath(w, h, 0, 'round', bounds.x, bounds.y);
              carriedRadius = getUniformCornerRadius(shape.rectConfig.cornerRadius);
              carriedType = getUniformCornerType(shape.rectConfig.cornerType);
            } else if (shape.starConfig && !shape.isCustomizedPath) {
              const sc = shape.starConfig;
              const bounds = getShapeBounds(shape);
              const outerR = sc.outerRadius ?? Math.max(8, Math.max(bounds.width, bounds.height) / 2);
              const cx = sc.cx ?? (shape.transform.originX || outerR);
              const cy = sc.cy ?? (shape.transform.originY || outerR);
              currentBaseD = generatePolygonStarPath(
                cx,
                cy,
                outerR,
                sc.points ?? 5,
                sc.pointRatio ?? 0.5,
                sc.startAngle ?? -Math.PI / 2,
                0
              );
              carriedRadius = sc.cornerRadius ?? 0;
            }
          }

          const res = insertPointOnPathSegment(currentBaseD, segmentIndex, t);
          if (res.insertedAnchorIndex < 0) break;
          insertedIdx = res.insertedAnchorIndex;

          // Shift per-anchor radius/type indices after segmentIndex
          let nextAnchorRadii: Record<number, number> | undefined;
          if (shape.pathAnchorRadii) {
            nextAnchorRadii = {};
            for (const [kStr, val] of Object.entries(shape.pathAnchorRadii)) {
              const k = Number(kStr);
              nextAnchorRadii[k > segmentIndex ? k + 1 : k] = val;
            }
          }
          let nextAnchorTypes: Record<number, CornerType> | undefined;
          if (shape.pathAnchorTypes) {
            nextAnchorTypes = {};
            for (const [kStr, val] of Object.entries(shape.pathAnchorTypes)) {
              const k = Number(kStr);
              nextAnchorTypes[k > segmentIndex ? k + 1 : k] = val;
            }
          }

          const finalD =
            pathIndex === 0
              ? applyCornerRadiusToPath(
                  res.d,
                  carriedRadius,
                  carriedType,
                  nextAnchorRadii,
                  nextAnchorTypes
                )
              : res.d;

          const newPaths = [...shape.paths];
          newPaths[pathIndex] = { ...targetPath, d: finalD };

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: pathIndex === 0 ? res.d : shape.basePathD,
            pathCornerRadius: carriedRadius,
            pathCornerType: carriedType,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
            isCustomizedPath: true,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
    return insertedIdx;
  },

  deletePathAnchor(
    elementId: string,
    pathIndex = 0,
    anchorIndex = 0,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;
    let resultingD = '';

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const targetPath = shape.paths[pathIndex];
          if (!targetPath) break;

          const sourceD = pathIndex === 0 && shape.basePathD ? shape.basePathD : targetPath.d;
          const parsed = parseSvgPath(sourceD);

          // If the path only has 2 or fewer points, deleting the anchor removes the entire shape
          if (parsed.anchors.length <= 2) {
            kf.elements.splice(elIndex, 1);
            state = {
              ...state,
              doc,
              selectedElementIds: state.selectedElementIds.filter((id) => id !== elementId),
              subselectedAnchor: null,
            };
            notify();
            return;
          }

          const newBaseD = deleteAnchorFromPathD(sourceD, anchorIndex);
          if (newBaseD === sourceD) break;

          const finalD =
            pathIndex === 0
              ? applyCornerRadiusToPath(
                  newBaseD,
                  shape.pathCornerRadius ?? 0,
                  shape.pathCornerType ?? 'round',
                  shape.pathAnchorRadii,
                  shape.pathAnchorTypes
                )
              : newBaseD;

          const newPaths = [...shape.paths];
          newPaths[pathIndex] = { ...targetPath, d: finalD };

          const shiftRecordKeys = <T>(rec?: Record<number, T>): Record<number, T> | undefined => {
            if (!rec) return undefined;
            const res: Record<number, T> = {};
            for (const [kStr, v] of Object.entries(rec)) {
              const k = Number(kStr);
              if (k < anchorIndex) res[k] = v;
              else if (k > anchorIndex) res[k - 1] = v;
            }
            return res;
          };

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: pathIndex === 0 ? newBaseD : shape.basePathD,
            pathAnchorPointTypes: shiftRecordKeys(shape.pathAnchorPointTypes),
            pathAnchorRadii: shiftRecordKeys(shape.pathAnchorRadii),
            pathAnchorTypes: shiftRecordKeys(shape.pathAnchorTypes),
            isCustomizedPath: true,
          };
          updated = true;
          resultingD = newBaseD;
          break;
        }
      }
    }

    if (updated) {
      let nextSubselectedAnchor = state.subselectedAnchor;
      if (
        state.subselectedAnchor?.shapeId === elementId &&
        state.subselectedAnchor.pathIndex === pathIndex
      ) {
        const remainingCount = parseSvgPath(resultingD).anchors.length;
        if (remainingCount > 0) {
          const nextIdx = Math.min(anchorIndex, remainingCount - 1);
          nextSubselectedAnchor = { shapeId: elementId, pathIndex, anchorIndex: nextIdx };
        } else {
          nextSubselectedAnchor = null;
        }
      }

      state = { ...state, doc, subselectedAnchor: nextSubselectedAnchor };
      notify();
    }
  },

  /**
   * Adjusts Live Corner Radius and Corner Style on ANY vector shape (rectangles, polygons, stars,
   * Pen paths, or custom paths with added anchor points).
   */
  updateShapeCornerRadius(
    elementId: string,
    config: {
      cornerRadius?: number;
      cornerType?: CornerType;
      anchorRadii?: Record<number, number>;
      anchorTypes?: Record<number, CornerType>;
    },
    options?: { skipHistory?: boolean }
  ): void {
    const tl0 = getActiveTimeline(state.doc, state.isolationStack);
    const fps0 = state.doc.stage.fps || 24;
    let foundShape: ShapeElement | undefined;
    for (const layer of tl0.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps0) ??
        findKeyframeAt(layer, state.currentFrame);
      const el = kf?.elements.find((e) => e.id === elementId);
      if (el && el.type === 'shape') {
        foundShape = el as ShapeElement;
        break;
      }
    }
    if (!foundShape) return;

    // 1. If uncustomized parametric rectangle and no per-anchor overrides, delegate to updateRectShape
    if (
      (foundShape.rectConfig || foundShape.id.startsWith('rect_')) &&
      !foundShape.isCustomizedPath &&
      !config.anchorRadii &&
      !config.anchorTypes
    ) {
      editorActions.updateRectShape(
        elementId,
        {
          cornerRadius: config.cornerRadius,
          cornerType: config.cornerType,
        },
        options
      );
      return;
    }

    // 2. If uncustomized parametric star with standard 'round' corners and no per-anchor overrides
    if (
      (foundShape.starConfig || foundShape.id.startsWith('poly_') || (foundShape as any).shapeType === 'star') &&
      !foundShape.isCustomizedPath &&
      (config.cornerType ?? foundShape.pathCornerType ?? 'round') === 'round' &&
      !config.anchorRadii &&
      !config.anchorTypes &&
      config.cornerRadius !== undefined
    ) {
      editorActions.updateStarShape(
        elementId,
        { cornerRadius: config.cornerRadius },
        options
      );
      return;
    }

    // 3. Universal vector shape corner filleting (Pen paths, customized rectangles with added points, stars, etc.)
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const isStar =
            (Boolean(shape.starConfig) ||
              shape.id.startsWith('poly_') ||
              (shape as any).shapeType === 'star') &&
            !shape.isCustomizedPath;

          let baseD: string;
          let starParams:
            | {
                sc: Partial<NonNullable<ShapeElement['starConfig']>>;
                pts: number;
                ratio: number;
                outerR: number;
                cx: number;
                cy: number;
                startAngle: number;
              }
            | undefined;

          if (isStar) {
            const sc: Partial<NonNullable<ShapeElement['starConfig']>> =
              shape.starConfig || {};
            const bounds = getShapeBounds(shape);
            const outerR =
              sc.outerRadius ??
              Math.max(8, Math.max(bounds.width, bounds.height) / 2);
            const cx = sc.cx ?? (shape.transform.originX || outerR);
            const cy = sc.cy ?? (shape.transform.originY || outerR);
            const pts = sc.points ?? 5;
            const ratio = sc.pointRatio ?? 0.5;
            const startAngle = sc.startAngle ?? -Math.PI / 2;
            starParams = { sc, pts, ratio, outerR, cx, cy, startAngle };
            baseD = generatePolygonStarPath(
              cx,
              cy,
              outerR,
              pts,
              ratio,
              startAngle,
              0
            );
          } else if (shape.basePathD) {
            baseD = shape.basePathD;
          } else if (shape.rectConfig && !shape.isCustomizedPath) {
            const bounds = getShapeBounds(shape);
            const w = shape.rectConfig.width ?? bounds.width;
            const h = shape.rectConfig.height ?? bounds.height;
            baseD = generateRoundedRectPath(w, h, 0, 'round', bounds.x, bounds.y);
          } else {
            baseD = shape.paths[0]?.d ?? '';
          }

          const nextRadius =
            config.cornerRadius !== undefined
              ? Math.max(0, config.cornerRadius)
              : (shape.pathCornerRadius ?? shape.starConfig?.cornerRadius ?? 0);
          const nextType: CornerType =
            config.cornerType ?? shape.pathCornerType ?? 'round';
          const nextAnchorRadii =
            config.anchorRadii !== undefined ? config.anchorRadii : shape.pathAnchorRadii;
          const nextAnchorTypes =
            config.anchorTypes !== undefined ? config.anchorTypes : shape.pathAnchorTypes;

          const newD = applyCornerRadiusToPath(
            baseD,
            nextRadius,
            nextType,
            nextAnchorRadii,
            nextAnchorTypes
          );

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }

          let updatedStarConfig = shape.starConfig;
          if (isStar && starParams) {
            updatedStarConfig = {
              ...starParams.sc,
              points: starParams.pts,
              pointRatio: starParams.ratio,
              outerRadius: starParams.outerR,
              startAngle: starParams.startAngle,
              cornerRadius: nextRadius,
              cx: starParams.cx,
              cy: starParams.cy,
            };
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: baseD,
            pathCornerRadius: nextRadius,
            pathCornerType: nextType,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
            ...(isStar ? { starConfig: updatedStarConfig } : {}),
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateOvalShape(
    elementId: string,
    config: {
      rx?: number;
      ry?: number;
      innerRadiusRatio?: number;
      startAngle?: number;
      endAngle?: number;
    },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && shape.isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig: Partial<OvalConfig> = shape.ovalConfig || {};
          const bounds = getShapeBounds(shape);
          const rx = Math.max(4, config.rx ?? prevConfig.rx ?? bounds.width / 2);
          const ry = Math.max(4, config.ry ?? prevConfig.ry ?? bounds.height / 2);
          const innerRadiusRatio = Math.max(
            0,
            Math.min(0.92, config.innerRadiusRatio ?? prevConfig.innerRadiusRatio ?? 0)
          );
          const startAngle = Math.max(
            0,
            Math.min(360, config.startAngle ?? prevConfig.startAngle ?? 0)
          );
          const endAngle = Math.max(
            0,
            Math.min(360, config.endAngle ?? prevConfig.endAngle ?? 360)
          );

          const updatedOvalConfig: OvalConfig = {
            rx,
            ry,
            innerRadiusRatio,
            startAngle,
            endAngle,
          };

          const newD = generateOvalPath(rx, ry, updatedOvalConfig);
          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = {
              ...newPaths[0],
              d: newD,
              fillRule: innerRadiusRatio > 0.005 ? 'evenodd' : newPaths[0].fillRule,
            };
          } else {
            newPaths.push({
              d: newD,
              fill: state.activeFill,
              fillRule: innerRadiusRatio > 0.005 ? 'evenodd' : undefined,
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            ovalConfig: updatedOvalConfig,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetOvalShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig: Partial<OvalConfig> = shape.ovalConfig || {};
          const bounds = getShapeBounds(shape);
          const rx = Math.max(4, prevConfig.rx ?? bounds.width / 2);
          const ry = Math.max(4, prevConfig.ry ?? bounds.height / 2);
          const innerRadiusRatio = prevConfig.innerRadiusRatio ?? 0;
          const startAngle = prevConfig.startAngle ?? 0;
          const endAngle = prevConfig.endAngle ?? 360;
          const updatedOvalConfig: OvalConfig = {
            rx,
            ry,
            innerRadiusRatio,
            startAngle,
            endAngle,
          };
          const newD = generateOvalPath(rx, ry, updatedOvalConfig);
          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }
          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            ovalConfig: updatedOvalConfig,
            isCustomizedPath: false,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  morphShapeTo(elementId: string, targetType: 'circle' | 'rectangle' | 'star'): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const bounds = getShapeBounds(shape);
          const starCfg = (shape as any).starConfig;
          let bw = Math.max(8, bounds.width);
          let bh = Math.max(8, bounds.height);
          let bx = bounds.x;
          let by = bounds.y;

          if (starCfg?.outerRadius) {
            const r = starCfg.outerRadius;
            const cx = starCfg.cx ?? (shape.transform.originX || r);
            const cy = starCfg.cy ?? (shape.transform.originY || r);
            bx = cx - r;
            by = cy - r;
            bw = r * 2;
            bh = r * 2;
          }

          let newD = '';
          let newStarConfig: any = undefined;
          let newRectConfig: RectConfig | undefined = undefined;
          let newOvalConfig: OvalConfig | undefined = undefined;

          if (targetType === 'circle') {
            const rX = bw / 2;
            const rY = bh / 2;
            newD = `M ${bx} ${by + rY} a ${rX} ${rY} 0 1 0 ${bw} 0 a ${rX} ${rY} 0 1 0 ${-bw} 0 Z`;
            newOvalConfig = {
              rx: rX,
              ry: rY,
              innerRadiusRatio: 0,
              startAngle: 0,
              endAngle: 360,
            };
          } else if (targetType === 'rectangle') {
            newD = generateRoundedRectPath(bw, bh, 0, 'round', bx, by);
            newRectConfig = {
              width: bw,
              height: bh,
              cornerRadius: 0,
              cornerType: 'round',
            };
          } else if (targetType === 'star') {
            const outerRadius = Math.max(bw, bh) / 2;
            const cx = bx + bw / 2;
            const cy = by + bh / 2;
            newD = generatePolygonStarPath(cx, cy, outerRadius, 5, 0.5, -Math.PI / 2, 0);
            newStarConfig = {
              points: 5,
              pointRatio: 0.5,
              outerRadius,
              startAngle: -Math.PI / 2,
              cornerRadius: 0,
              cx,
              cy,
            };
          }

          const primaryPath = shape.paths[0] || {
            fill: { type: 'solid', color: state.fillColor },
          };
          const newPaths = [{ ...primaryPath, d: newD }];

          const morphedShape: ShapeElement = {
            ...shape,
            paths: newPaths,
          };

          if (newStarConfig) {
            morphedShape.starConfig = newStarConfig;
          } else {
            delete morphedShape.starConfig;
          }
          if (newRectConfig) {
            morphedShape.rectConfig = newRectConfig;
          } else {
            delete morphedShape.rectConfig;
          }
          if (newOvalConfig) {
            morphedShape.ovalConfig = newOvalConfig;
          } else {
            delete morphedShape.ovalConfig;
          }
          (morphedShape as any).shapeType = targetType;
          morphedShape.isCustomizedPath = false;

          kf.elements[elIndex] = morphedShape;
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  formatSelectedTextRange(
    elementId: string,
    selectionStart: number,
    selectionEnd: number,
    partialSpan: Partial<TextSpan>
  ): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type !== 'text') break;
        const textEl = el as TextElement;
        const fullText = textEl.text || '';
        const start = Math.max(0, Math.min(selectionStart, selectionEnd, fullText.length));
        const end = Math.min(fullText.length, Math.max(selectionStart, selectionEnd));
        if (start >= end) break;

        interface CharRun {
          char: string;
          fontId?: string;
          fontSize?: number;
          fontWeight?: number | string;
          fontStyle?: 'normal' | 'italic';
          textDecoration?: 'none' | 'underline';
          color?: string;
          fill?: Fill;
          letterSpacing?: number;
          offsetY?: number;
          opacity?: number;
        }

        const charRuns: CharRun[] = [];
        if (textEl.spans && textEl.spans.length > 0) {
          for (const sp of textEl.spans) {
            for (const ch of sp.text) {
              charRuns.push({
                char: ch,
                fontId: sp.fontId ?? textEl.fontId,
                fontSize: sp.fontSize ?? textEl.fontSize,
                fontWeight: sp.fontWeight ?? textEl.fontWeight,
                fontStyle: sp.fontStyle ?? textEl.fontStyle,
                textDecoration: sp.textDecoration ?? textEl.textDecoration,
                color: sp.color ?? textEl.color,
                fill: sp.fill ?? textEl.fill,
                letterSpacing: sp.letterSpacing ?? textEl.letterSpacing,
                offsetY: sp.offsetY,
                opacity: sp.opacity,
              });
            }
          }
        }

        // If charRuns length doesn't match fullText length, rebuild from base textEl
        if (charRuns.length !== fullText.length) {
          charRuns.length = 0;
          for (const ch of fullText) {
            charRuns.push({
              char: ch,
              fontId: textEl.fontId,
              fontSize: textEl.fontSize,
              fontWeight: textEl.fontWeight,
              fontStyle: textEl.fontStyle,
              textDecoration: textEl.textDecoration,
              color: textEl.color,
              fill: textEl.fill,
              letterSpacing: textEl.letterSpacing,
            });
          }
        }

        // Apply partialSpan to characters in range [start, end)
        for (let i = start; i < end; i++) {
          charRuns[i] = {
            ...charRuns[i],
            ...partialSpan,
          };
        }

        // Coalesce adjacent characters into TextSpan[]
        const newSpans: TextSpan[] = [];
        let curSpan: TextSpan | null = null;

        for (let i = 0; i < charRuns.length; i++) {
          const cr = charRuns[i];
          const fillSame = JSON.stringify(cr.fill) === JSON.stringify(curSpan?.fill);
          const same =
            curSpan &&
            cr.fontId === curSpan.fontId &&
            cr.fontSize === curSpan.fontSize &&
            cr.fontWeight === curSpan.fontWeight &&
            cr.fontStyle === curSpan.fontStyle &&
            cr.textDecoration === curSpan.textDecoration &&
            cr.color === curSpan.color &&
            cr.letterSpacing === curSpan.letterSpacing &&
            cr.offsetY === curSpan.offsetY &&
            cr.opacity === curSpan.opacity &&
            fillSame;

          if (same && curSpan) {
            curSpan.text += cr.char;
          } else {
            if (curSpan) newSpans.push(curSpan);
            curSpan = {
              id: `span_${newSpans.length}`,
              text: cr.char,
              ...(cr.fontId !== undefined ? { fontId: cr.fontId } : {}),
              ...(cr.fontSize !== undefined ? { fontSize: cr.fontSize } : {}),
              ...(cr.fontWeight !== undefined ? { fontWeight: cr.fontWeight } : {}),
              ...(cr.fontStyle !== undefined ? { fontStyle: cr.fontStyle } : {}),
              ...(cr.textDecoration !== undefined ? { textDecoration: cr.textDecoration } : {}),
              ...(cr.color !== undefined ? { color: cr.color } : {}),
              ...(cr.fill !== undefined ? { fill: cr.fill } : {}),
              ...(cr.letterSpacing !== undefined ? { letterSpacing: cr.letterSpacing } : {}),
              ...(cr.offsetY !== undefined ? { offsetY: cr.offsetY } : {}),
              ...(cr.opacity !== undefined ? { opacity: cr.opacity } : {}),
            };
          }
        }
        if (curSpan) newSpans.push(curSpan);

        kf.elements[elIndex] = {
          ...textEl,
          spans: newSpans,
        } as DisplayElement;
        updated = true;
        break;
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  deleteSelectedElements(): void {
    if (state.subselectedAnchor) {
      editorActions.deletePathAnchor(
        state.subselectedAnchor.shapeId,
        state.subselectedAnchor.pathIndex ?? 0,
        state.subselectedAnchor.anchorIndex
      );
      return;
    }
    if (state.selectedElementIds.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const toDelete = new Set(state.selectedElementIds);

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements = kf.elements.filter((e) => !toDelete.has(e.id));
    }

    state = {
      ...state,
      doc,
      selectedElementIds: [],
      subselectedAnchor: null,
    };
    notify();
  },

  deleteElement(id: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        kf.elements = kf.elements.filter((e) => e.id !== id);
      }
    }
    state = {
      ...state,
      doc,
      selectedElementIds: state.selectedElementIds.filter((elId) => elId !== id),
    };
    notify();
  },

  selectAll(): void {
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const allIds: string[] = [];
    for (const layer of tl.layers) {
      if (!layer.visible) continue;
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      for (const el of kf.elements) {
        allIds.push(el.id);
      }
    }
    state = { ...state, selectedElementIds: allIds };
    notify();
  },

  copySelectedElements(): void {
    if (state.selectedElementIds.length === 0) return;
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const selected: EditorElement[] = [];
    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      for (const el of kf.elements) {
        if (state.selectedElementIds.includes(el.id)) {
          selected.push(fastClone(el));
        }
      }
    }
    state = { ...state, clipboard: selected };
    notify();
  },

  cutSelectedElements(): void {
    editorActions.copySelectedElements();
    editorActions.deleteSelectedElements();
  },

  pasteElements(): void {
    if (state.clipboard.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = state.selectedLayerId ?? tl.layers[0]?.id;
    const layer = tl.layers.find((l) => l.id === targetLayerId) ?? tl.layers[0];
    if (!layer) return;

    let kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
    if (!kf) {
      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: state.currentFrame,
        duration: 1,
        elements: [],
      };
      layer.keyframes.push(newKf);
      layer.keyframes.sort((a, b) => a.index - b.index);
      tl.frameCount = Math.max(tl.frameCount, state.currentFrame + 1);
      kf = newKf;
    }

    const newIds: string[] = [];
    for (const item of state.clipboard) {
      const clone: EditorElement = fastClone(item);
      clone.id = `${clone.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      clone.transform = {
        ...clone.transform,
        x: (clone.transform.x ?? 0) + 20,
        y: (clone.transform.y ?? 0) + 20,
      };
      kf.elements.push(clone);
      newIds.push(clone.id);
    }

    state = { ...state, doc, selectedElementIds: newIds };
    notify();
  },

  duplicateSelectedElements(): void {
    if (state.selectedElementIds.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const newIds: string[] = [];

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const toDuplicate = kf.elements.filter((e) => state.selectedElementIds.includes(e.id));
      for (const item of toDuplicate) {
        const clone: EditorElement = fastClone(item);
        clone.id = `${clone.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        clone.transform = {
          ...clone.transform,
          x: (clone.transform.x ?? 0) + 20,
          y: (clone.transform.y ?? 0) + 20,
        };
        kf.elements.push(clone);
        newIds.push(clone.id);
      }
    }

    state = { ...state, doc, selectedElementIds: newIds };
    notify();
  },

  bringToFront(elementId?: string): void {
    const targetId = elementId ?? state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex((e) => e.id === targetId);
      if (idx >= 0 && idx < kf.elements.length - 1) {
        const [el] = kf.elements.splice(idx, 1);
        kf.elements.push(el);
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  sendToBack(elementId?: string): void {
    const targetId = elementId ?? state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex((e) => e.id === targetId);
      if (idx > 0) {
        const [el] = kf.elements.splice(idx, 1);
        kf.elements.unshift(el);
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  bringElementForward(elementId?: string): void {
    const targetId = elementId ?? state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex((e) => e.id === targetId);
      if (idx >= 0 && idx < kf.elements.length - 1) {
        const [el] = kf.elements.splice(idx, 1);
        kf.elements.splice(idx + 1, 0, el);
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  sendElementBackward(elementId?: string): void {
    const targetId = elementId ?? state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex((e) => e.id === targetId);
      if (idx > 0) {
        const [el] = kf.elements.splice(idx, 1);
        kf.elements.splice(idx - 1, 0, el);
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  /* ========================================================================= *
   * Grouping & Hierarchical Nesting (Consolidated Folders / Groups)
   * ========================================================================= */

  groupSelectedElements(): void {
    if (state.selectedElementIds.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    const targetEls: EditorElement[] = [];
    const targetIds = new Set(state.selectedElementIds);

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const matching = kf.elements.filter((e) => targetIds.has(e.id));
      if (matching.length > 0) {
        targetEls.push(...matching);
        kf.elements = kf.elements.filter((e) => !targetIds.has(e.id));
      }
    }

    if (targetEls.length === 0) return;
    targetEls.sort((a, b) => state.selectedElementIds.indexOf(a.id) - state.selectedElementIds.indexOf(b.id));

    const groupNum = tl.layers.filter((l) => l.kind === 'folder').length + 1;
    const groupName = `Group ${groupNum}`;
    const newFolder: EditorLayer = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: groupName,
      kind: 'folder',
      visible: true,
      locked: false,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          time: 0,
          durationTime: computeTotalTimelineDuration(tl),
          elements: targetEls,
        },
      ],
    };

    tl.layers.unshift(newFolder);

    state = {
      ...state,
      doc,
      selectedLayerId: newFolder.id,
      selectedElementIds: targetEls.map((e) => e.id),
    };
    notify();
  },

  ungroupSelectedElements(): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    // 1. Check if a folder layer is selected
    const folderIdx = tl.layers.findIndex((l) => l.id === state.selectedLayerId && l.kind === 'folder');
    let targetFolder: EditorLayer | undefined;
    if (folderIdx !== -1) {
      targetFolder = tl.layers[folderIdx];
    } else {
      // Or check if selected elements are inside a folder layer
      for (const layer of tl.layers) {
        if (layer.kind === 'folder') {
          for (const kf of layer.keyframes) {
            if (kf.elements.some((e) => state.selectedElementIds.includes(e.id))) {
              targetFolder = layer;
              break;
            }
          }
        }
        if (targetFolder) break;
      }
    }

    if (targetFolder) {
      const elementsToExtract: EditorElement[] = [];
      for (const kf of targetFolder.keyframes) {
        elementsToExtract.push(...kf.elements);
      }

      let destLayer = tl.layers.find((l) => l.id !== targetFolder?.id && l.kind === 'normal');
      if (!destLayer) {
        destLayer = {
          id: `layer_${Date.now()}`,
          name: 'Layer 1',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: `kf_${Date.now()}`,
              index: 0,
              duration: tl.frameCount || 24,
              time: 0,
              durationTime: computeTotalTimelineDuration(tl),
              elements: [],
            },
          ],
        };
        tl.layers.push(destLayer);
      }

      const destKf = destLayer.keyframes[0];
      if (destKf) {
        destKf.elements.push(...elementsToExtract);
      }

      tl.layers = tl.layers.filter((l) => l.id !== targetFolder?.id);

      state = {
        ...state,
        doc,
        selectedLayerId: destLayer.id,
        selectedElementIds: elementsToExtract.map((e) => e.id),
      };
      notify();
      return;
    }

    // Fallback: unpack movieclip symbol instances if any
    const newlySelectedIds: string[] = [];
    let modified = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;

      const nextElements: EditorElement[] = [];
      for (const el of kf.elements) {
        if (state.selectedElementIds.includes(el.id) && el.type === 'instance') {
          const sym = doc.library.symbols[(el as SymbolInstance).symbolId];
          if (sym?.timeline) {
            modified = true;
            for (const symLayer of sym.timeline.layers) {
              const symKf = symLayer.keyframes[0];
              if (symKf) {
                for (const inner of symKf.elements) {
                  const unpackedId = `unpacked_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                  newlySelectedIds.push(unpackedId);
                  nextElements.push({
                    ...fastClone(inner),
                    id: unpackedId,
                    transform: {
                      ...inner.transform,
                      x: (inner.transform.x ?? 0) + (el.transform.x ?? 0),
                      y: (inner.transform.y ?? 0) + (el.transform.y ?? 0),
                      rotation: (((inner.transform.rotation ?? 0) + (el.transform.rotation ?? 0)) % 360 + 360) % 360,
                    },
                  });
                }
              }
            }
            continue;
          }
        }
        nextElements.push(el);
      }
      kf.elements = nextElements;
    }

    if (modified) {
      state = {
        ...state,
        doc,
        selectedElementIds: newlySelectedIds.length > 0 ? newlySelectedIds : state.selectedElementIds,
      };
      notify();
    }
  },

  moveElementToFolder(elementId: string, folderId: string): void {
    editorActions.moveElementToLayer(elementId, folderId);
  },

  moveElementToLayer(elementId: string, targetLayerId: string, targetIndex?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayer = tl.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    let foundEl: EditorElement | null = null;
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        const idx = kf.elements.findIndex((e) => e.id === elementId);
        if (idx !== -1) {
          foundEl = kf.elements.splice(idx, 1)[0];
          break;
        }
      }
      if (foundEl) break;
    }

    if (!foundEl) return;

    const fps = doc.stage.fps || 24;
    const destKf = findKeyframeAtTime(targetLayer, state.currentTime, fps) ?? targetLayer.keyframes[0];
    if (destKf) {
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= destKf.elements.length) {
        destKf.elements.splice(targetIndex, 0, foundEl);
      } else {
        destKf.elements.push(foundEl);
      }
    } else {
      targetLayer.keyframes.push({
        id: `kf_${Date.now()}`,
        index: 0,
        duration: tl.frameCount || 24,
        time: 0,
        durationTime: computeTotalTimelineDuration(tl, fps),
        elements: [foundEl],
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: targetLayer.id,
      selectedElementIds: [elementId],
    };
    notify();
  },

  reorderElement(elementId: string, targetElementId: string, position: 'before' | 'after' = 'after'): void {
    if (elementId === targetElementId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    let foundEl: EditorElement | null = null;
    // Remove element from its source keyframe
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        const idx = kf.elements.findIndex((e) => e.id === elementId);
        if (idx !== -1) {
          foundEl = kf.elements.splice(idx, 1)[0];
          break;
        }
      }
      if (foundEl) break;
    }

    if (!foundEl) return;

    // Insert relative to target element in target's keyframe
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        const targetIdx = kf.elements.findIndex((e) => e.id === targetElementId);
        if (targetIdx !== -1) {
          const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
          kf.elements.splice(insertIdx, 0, foundEl);
          state = {
            ...state,
            doc,
            selectedElementIds: [elementId],
          };
          notify();
          return;
        }
      }
    }
  },

  toggleElementVisibility(elementId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.id === elementId) {
            el.visible = el.visible === false ? true : false;
          }
        }
      }
    }
    state = { ...state, doc };
    notify();
  },

  toggleElementLock(elementId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.id === elementId) {
            (el as any).locked = !(el as any).locked;
          }
        }
      }
    }
    state = { ...state, doc };
    notify();
  },

  renameElement(elementId: string, name: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.id === elementId) {
            el.instanceName = name;
          }
        }
      }
    }
    state = { ...state, doc };
    notify();
  },

  changeElementId(
    oldId: string,
    newId: string,
    options?: { skipHistory?: boolean; scope?: 'active' | 'all' }
  ): void {
    if (!oldId || !newId || oldId === newId) return;
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    if (options?.scope === 'all') {
      for (const layer of tl.layers) {
        let matched = false;
        for (const kf of layer.keyframes) {
          for (const el of kf.elements) {
            if (el.id === oldId) {
              el.id = newId;
              matched = true;
              updated = true;
            }
          }
        }
        if (matched) break;
      }
    } else {
      // 1. Update in active keyframe at current time/frame
      for (const layer of tl.layers) {
        const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
        if (kf) {
          const el = kf.elements.find((e) => e.id === oldId);
          if (el) {
            el.id = newId;
            updated = true;
            break;
          }
        }
      }

      // 2. If not found in active keyframe, fallback to any keyframe
      if (!updated) {
        for (const layer of tl.layers) {
          for (const kf of layer.keyframes) {
            const el = kf.elements.find((e) => e.id === oldId);
            if (el) {
              el.id = newId;
              updated = true;
              break;
            }
          }
          if (updated) break;
        }
      }
    }

    if (updated) {
      state = {
        ...state,
        doc,
        selectedElementIds: state.selectedElementIds.map((id) => (id === oldId ? newId : id)),
        editingTextElId: state.editingTextElId === oldId ? newId : state.editingTextElId,
      };
      notify();
    }
  },

  enterIsolation(symbolId: string, name?: string): void {
    const sym = state.doc.library.symbols[symbolId];
    if (!sym) return;
    const nextStack = [
      ...state.isolationStack,
      { symbolId, name: name ?? sym.name ?? 'Group' },
    ];
    state = {
      ...state,
      isolationStack: nextStack,
      selectedElementIds: [],
      selectedLayerId: sym.timeline.layers[0]?.id ?? null,
    };
    notify();
  },

  exitIsolation(): void {
    if (state.isolationStack.length === 0) return;
    const nextStack = state.isolationStack.slice(0, -1);
    const nextTl = getActiveTimeline(state.doc, nextStack);
    state = {
      ...state,
      isolationStack: nextStack,
      selectedElementIds: [],
      selectedLayerId: nextTl.layers[0]?.id ?? null,
    };
    notify();
  },

  exitToIsolationLevel(index: number): void {
    const nextStack = index < 0 ? [] : state.isolationStack.slice(0, index + 1);
    const nextTl = getActiveTimeline(state.doc, nextStack);
    state = {
      ...state,
      isolationStack: nextStack,
      selectedElementIds: [],
      selectedLayerId: nextTl.layers[0]?.id ?? null,
    };
    notify();
  },

  convertToComponent(
    elementId: string,
    name: string,
    kind: SymbolKind = 'movieclip',
    width?: number,
    height?: number,
    registrationPoint?: { x: number; y: number }
  ): void {
    editorActions.convertToSymbol(elementId, name, kind, width, height, registrationPoint);
  },

  createEmptyClip(
    name?: string,
    width = 100,
    height = 100,
    registrationPoint?: { x: number; y: number }
  ): string {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const clipIndex = Object.keys(doc.library.symbols).length + 1;
    const clipName = name?.trim() || `Clip ${clipIndex}`;
    const symbolId = `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const regX = registrationPoint?.x ?? Math.round(width / 2);
    const regY = registrationPoint?.y ?? Math.round(height / 2);

    const newSymbol: EditorSymbol = {
      id: symbolId,
      name: clipName,
      kind: 'movieclip',
      registration: { x: regX, y: regY },
      width,
      height,
      timeline: {
        frameCount: 12,
        layers: [
          {
            id: `sym_layer_${Date.now()}`,
            name: 'Layer 1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: `sym_kf_${Date.now()}`,
                index: 0,
                duration: 12,
                elements: [],
              },
            ],
          },
        ],
      },
    };

    doc.library.symbols[symbolId] = newSymbol;
    state = {
      ...state,
      doc,
      isolationStack: [...state.isolationStack, { symbolId, name: clipName }],
      currentFrame: 0,
      currentTime: 0,
      selectedElementIds: [],
    };
    notify();
    return symbolId;
  },

  convertToSymbol(
    elementId: string,
    name: string,
    kind: SymbolKind = 'movieclip',
    width?: number,
    height?: number,
    registrationPoint?: { x: number; y: number }
  ): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let targetEl: EditorElement | null = null;
    let targetKf: EditorKeyframe | null = null;

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === elementId);
      if (el) {
        targetEl = el;
        targetKf = kf;
        break;
      }
    }

    if (!targetEl || !targetKf) return;

    let estWidth = 100;
    let estHeight = 100;
    if (targetEl.type === 'text') {
      estWidth = (targetEl as any).width || 120;
      estHeight = (targetEl as any).height || 28;
    } else if (targetEl.type === 'bitmap') {
      estWidth = (targetEl as any).width || 200;
      estHeight = (targetEl as any).height || 150;
    } else if (targetEl.type === 'instance') {
      const instSym = doc.library.symbols[(targetEl as any).symbolId];
      estWidth = instSym?.width || 100;
      estHeight = instSym?.height || 100;
    }
    const symWidth = width ?? estWidth;
    const symHeight = height ?? estHeight;
    const regX = registrationPoint?.x ?? Math.round(symWidth / 2);
    const regY = registrationPoint?.y ?? Math.round(symHeight / 2);

    const symbolId = `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const innerElement: EditorElement = {
      ...fastClone(targetEl),
      id: `el_inner_${Date.now()}`,
      transform: {
        ...targetEl.transform,
        x: regX,
        y: regY,
        originX: targetEl.transform.originX ?? regX,
        originY: targetEl.transform.originY ?? regY,
      },
    };

    const newSymbol: EditorSymbol = {
      id: symbolId,
      name,
      kind,
      registration: { x: regX, y: regY },
      width: symWidth,
      height: symHeight,
      timeline: {
        frameCount: 1,
        layers: [
          {
            id: `sym_layer_1`,
            name: 'Layer 1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: `sym_kf_1`,
                index: 0,
                duration: 1,
                elements: [innerElement],
              },
            ],
          },
        ],
      },
    };

    doc.library.symbols[symbolId] = newSymbol;

    const instance: EditorElement = {
      id: targetEl.id,
      type: 'instance',
      symbolId,
      instanceName: name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_'),
      transform: {
        ...targetEl.transform,
        originX: regX,
        originY: regY,
      },
      alpha: targetEl.alpha ?? 1,
      visible: targetEl.visible ?? true,
    };

    const elIdx = targetKf.elements.findIndex((e) => e.id === elementId);
    targetKf.elements[elIdx] = instance;

    state = {
      ...state,
      doc,
      selectedElementIds: [instance.id],
    };
    notify();
  },

  updateElementScript(id: string, eventName: string, code: string, skipHistory = false): void {
    if (!skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === id);
      if (el) {
        if (!el.instanceName) {
          el.instanceName = el.id;
        }
        if (!el.events) {
          (el as any).events = {};
        }
        if (!code.trim()) {
          delete (el.events as Record<string, unknown>)[eventName];
          if (el.events && Object.keys(el.events).length === 0) {
            delete el.events;
          }
        } else {
          (el.events as Record<string, ScriptSource>)[eventName] = { __fn: code };
        }

        // Also sync to doc.scripts for top-level binding lookup
        if (!(doc as any).scripts) {
          (doc as any).scripts = {};
        }
        const targetId = el.instanceName || el.id;
        if (!code.trim()) {
          if ((doc as any).scripts[targetId]) {
            delete (doc as any).scripts[targetId][eventName];
            if (Object.keys((doc as any).scripts[targetId]).length === 0) {
              delete (doc as any).scripts[targetId];
            }
          }
        } else {
          if (!(doc as any).scripts[targetId]) {
            (doc as any).scripts[targetId] = {};
          }
          (doc as any).scripts[targetId][eventName] = { __fn: code };
        }

        updated = true;
        break;
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateKeyframeScript(layerId: string, frameIndex: number, code: string, skipHistory = false): void {
    if (!skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const kf = findKeyframeAt(layer, frameIndex);
    if (!kf) return;

    if (!code.trim()) {
      delete kf.actions;
    } else {
      kf.actions = { __fn: code } as unknown as ScriptSource;
    }

    state = { ...state, doc };
    notify();
  },

  /* ========================================================================= *
   * Layer Actions
   * ========================================================================= */

  addLayer(name?: string, parentFolderId?: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    let effectiveParentId = parentFolderId;
    if (!effectiveParentId && state.selectedLayerId) {
      const sel = tl.layers.find((l) => l.id === state.selectedLayerId);
      if (sel?.kind === 'folder') {
        effectiveParentId = sel.id;
      } else if (sel && (sel.parentLayerId || (sel as any)?.parentId)) {
        effectiveParentId = sel.parentLayerId || (sel as any)?.parentId;
      }
    }

    const nextNum = tl.layers.length + 1;
    const newLayer: EditorLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name ?? `Layer ${nextNum}`,
      kind: 'normal',
      visible: true,
      locked: false,
      parentLayerId: effectiveParentId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ],
    };
    (newLayer as any).parentId = effectiveParentId;

    // If effectiveParentId is specified, place it right after the parent folder or top of folder
    if (effectiveParentId) {
      const parentIdx = tl.layers.findIndex((l) => l.id === effectiveParentId);
      if (parentIdx !== -1) {
        tl.layers.splice(parentIdx + 1, 0, newLayer);
      } else {
        tl.layers.unshift(newLayer);
      }
    } else {
      // Insert at top of stack (layers[0] is top)
      tl.layers.unshift(newLayer);
    }

    state = {
      ...state,
      doc,
      selectedLayerId: newLayer.id,
    };
    notify();
  },

  addFolder(name?: string, parentFolderId?: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);

    let effectiveParentId = parentFolderId;
    if (!effectiveParentId && state.selectedLayerId) {
      const sel = tl.layers.find((l) => l.id === state.selectedLayerId);
      if (sel) {
        if (sel.kind === 'folder') {
          effectiveParentId = sel.id;
        } else if (sel.parentLayerId || (sel as any)?.parentId) {
          effectiveParentId = sel.parentLayerId || (sel as any)?.parentId;
        }
      }
    }

    const nextNum = tl.layers.filter((l) => l.kind === 'folder').length + 1;
    const newFolder: EditorLayer = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name ?? `Folder ${nextNum}`,
      kind: 'folder',
      visible: true,
      locked: false,
      parentLayerId: effectiveParentId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ],
    };
    (newFolder as any).parentId = effectiveParentId;

    if (effectiveParentId) {
      const parentIdx = tl.layers.findIndex((l) => l.id === effectiveParentId);
      if (parentIdx !== -1) {
        tl.layers.splice(parentIdx + 1, 0, newFolder);
      } else {
        tl.layers.unshift(newFolder);
      }
    } else {
      tl.layers.unshift(newFolder);
    }

    state = {
      ...state,
      doc,
      selectedLayerId: newFolder.id,
    };
    notify();
  },

  addGroup(name?: string, parentFolderId?: string): void {
    editorActions.addFolder(name, parentFolderId);
  },

  setLayerParent(layerId: string, parentFolderId?: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (parentFolderId) {
      // Prevent cycle: parentFolderId cannot be layerId or a descendant of layerId
      let currId: string | undefined = parentFolderId;
      let isCycle = false;
      const visited = new Set<string>();
      while (currId) {
        if (currId === layerId || visited.has(currId)) {
          isCycle = true;
          break;
        }
        visited.add(currId);
        const pLayer = tl.layers.find((l) => l.id === currId);
        currId = pLayer?.parentLayerId || (pLayer as any)?.parentId;
      }
      if (!isCycle) {
        layer.parentLayerId = parentFolderId;
        (layer as any).parentId = parentFolderId;
      }
    } else {
      delete layer.parentLayerId;
      delete (layer as any).parentId;
    }
    state = { ...state, doc };
    notify();
  },

  updateFolderTransform(
    folderId: string,
    transform: Partial<Transform>,
    options?: { skipHistory?: boolean }
  ): void {
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    const folder = tl.layers.find((l) => l.id === folderId);
    if (!folder) return;

    if (!folder.keyframes || folder.keyframes.length === 0) {
      folder.keyframes = [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ];
    }

    folder.keyframes.sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
    let kf = findKeyframeAtTime(folder, state.currentTime, fps) ?? findKeyframeAt(folder, state.currentFrame);
    if (!kf) {
      kf = folder.keyframes[0];
    }

    const kfTime = getKeyframeTime(kf, fps);
    if (state.currentFrame > kf.index && state.currentTime > kfTime + 0.001) {
      const targetFrame = state.currentFrame;
      const targetTime = state.currentTime;
      const kfIdx = folder.keyframes.indexOf(kf);
      const nextKf = folder.keyframes[kfIdx + 1];

      let folderT = kf.transform ?? folder.transform ?? {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };

      if (kf.tween && nextKf) {
        const nextKfTime = getKeyframeTime(nextKf, fps);
        if (nextKfTime > kfTime) {
          const prog = Math.max(0, Math.min(1, (targetTime - kfTime) / (nextKfTime - kfTime)));
          const nextT = nextKf.transform ?? folderT;
          let deltaRot = ((nextT.rotation ?? 0) - (folderT.rotation ?? 0)) % 360;
          if (deltaRot > 180) deltaRot -= 360;
          if (deltaRot < -180) deltaRot += 360;
          folderT = {
            ...folderT,
            x: folderT.x + (nextT.x - folderT.x) * prog,
            y: folderT.y + (nextT.y - folderT.y) * prog,
            scaleX: (folderT.scaleX ?? 1) + ((nextT.scaleX ?? 1) - (folderT.scaleX ?? 1)) * prog,
            scaleY: (folderT.scaleY ?? 1) + ((nextT.scaleY ?? 1) - (folderT.scaleY ?? 1)) * prog,
            rotation: (folderT.rotation ?? 0) + deltaRot * prog,
            skewX: (folderT.skewX ?? 0) + ((nextT.skewX ?? 0) - (folderT.skewX ?? 0)) * prog,
            skewY: (folderT.skewY ?? 0) + ((nextT.skewY ?? 0) - (folderT.skewY ?? 0)) * prog,
          };
        }
      }

      const splitOffsetFrames = targetFrame - kf.index;
      const splitOffsetTime = targetTime - kfTime;
      const origDurFrames = kf.duration;
      const origDurTime = getKeyframeDurationTime(kf, fps);

      kf.duration = Math.max(1, splitOffsetFrames);
      kf.durationTime = Math.max(0.04, splitOffsetTime);
      if (!kf.tween) {
        kf.tween = { type: 'motion', easing: { type: 'linear' } };
      }

      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        time: targetTime,
        duration: Math.max(1, origDurFrames - splitOffsetFrames),
        durationTime: Math.max(0.04, origDurTime - splitOffsetTime),
        elements: [],
        transform: folderT,
        tween: nextKf && kf.tween ? fastClone(kf.tween) : undefined,
      };
      folder.keyframes.splice(kfIdx + 1, 0, newKf);
      tl.frameCount = Math.max(tl.frameCount, targetFrame + newKf.duration);
      invalidateTimelineDurationCache(tl);
      kf = newKf;
    }

    const currentT = kf.transform ?? folder.transform ?? {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      originX: 0,
      originY: 0,
    };
    const updatedT = { ...currentT, ...transform };
    kf.transform = updatedT;
    folder.transform = updatedT;

    state = { ...state, doc };
    notify();
  },

  setFolderTransform(folderId: string, frameIndex: number, partial: Partial<Transform>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const folder = tl.layers.find((l) => l.id === folderId);
    if (!folder) return;
    const kf = findKeyframeAt(folder, frameIndex);
    if (!kf) return;
    const currentT = kf.transform ?? folder.transform ?? {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      originX: 0,
      originY: 0,
    };
    const updatedT = { ...currentT, ...partial };
    kf.transform = updatedT;
    folder.transform = updatedT;
    state = { ...state, doc };
    notify();
  },

  setKeyframeEasing(layerId: string, kfIdOrTime: string | number, easing: Easing): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    let kf: EditorKeyframe | undefined;
    if (typeof kfIdOrTime === 'string') {
      kf = layer.keyframes.find((k) => k.id === kfIdOrTime);
    } else {
      kf = findKeyframeAtTime(layer, kfIdOrTime, fps) ?? findKeyframeAt(layer, kfIdOrTime);
    }
    if (!kf) return;

    if (!kf.tween) {
      kf.tween = { type: 'motion', easing };
    } else {
      kf.tween.easing = easing;
    }

    state = { ...state, doc };
    notify();
  },

  deleteLayer(layerId: string): void {
    const currentTl = getActiveTimeline(state.doc, state.isolationStack);
    if (currentTl.layers.length <= 1) return; // Prevent deleting last layer
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const deletedLayer = tl.layers.find((l) => l.id === layerId);
    tl.layers = tl.layers.filter((l) => l.id !== layerId);
    for (const l of tl.layers) {
      if (l.parentLayerId === layerId || (l as any).parentId === layerId) {
        l.parentLayerId = deletedLayer?.parentLayerId;
        (l as any).parentId = deletedLayer?.parentLayerId;
      }
    }

    const nextSelected = tl.layers[0]?.id ?? null;
    state = {
      ...state,
      doc,
      selectedLayerId: nextSelected,
    };
    notify();
  },

  duplicateLayer(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const idx = tl.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    const src = tl.layers[idx];
    const clone = fastClone(src);
    clone.id = `layer_${Math.random().toString(36).slice(2, 8)}`;
    clone.name = `${src.name} Copy`;
    if (clone.keyframes) {
      for (const kf of clone.keyframes) {
        kf.id = `kf_${Math.random().toString(36).slice(2, 8)}`;
        if (kf.elements) {
          for (const el of kf.elements) {
            el.id = `el_${Math.random().toString(36).slice(2, 8)}`;
          }
        }
      }
    }
    tl.layers.splice(idx + 1, 0, clone);
    state = { ...state, doc, selectedLayerId: clone.id };
    notify();
  },

  reorderLayers(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const [moved] = tl.layers.splice(fromIndex, 1);
    tl.layers.splice(toIndex, 0, moved);
    state = { ...state, doc };
    notify();
  },

  bringLayerForward(layerId: string): void {
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const idx = tl.layers.findIndex((l) => l.id === layerId);
    if (idx > 0) {
      editorActions.reorderLayers(idx, idx - 1);
    }
  },

  sendLayerBackward(layerId: string): void {
    const tl = getActiveTimeline(state.doc, state.isolationStack);
    const idx = tl.layers.findIndex((l) => l.id === layerId);
    if (idx >= 0 && idx < tl.layers.length - 1) {
      editorActions.reorderLayers(idx, idx + 1);
    }
  },

  toggleLayerVisibility(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    state = { ...state, doc };
    notify();
  },

  toggleLayerLock(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
    state = { ...state, doc };
    notify();
  },

  toggleLayerMask(layerId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const idx = tl.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;

    const layer = tl.layers[idx];
    const isMask = layer.kind === 'mask';

    if (isMask) {
      layer.kind = 'normal';
      for (const l of tl.layers) {
        if (l.maskLayerId === layer.id) {
          delete l.maskLayerId;
        }
      }
    } else {
      layer.kind = 'mask';
      // Automatically link the layer directly below it (Flash order: layers[idx+1] is below)
      if (idx + 1 < tl.layers.length) {
        tl.layers[idx + 1].maskLayerId = layer.id;
      }
    }

    state = { ...state, doc };
    notify();
  },

  setLayerMaskId(layerId: string, maskLayerId?: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (maskLayerId && maskLayerId !== layer.id) {
      layer.maskLayerId = maskLayerId;
    } else {
      delete layer.maskLayerId;
    }

    state = { ...state, doc };
    notify();
  },

  setLayerKind(layerId: string, kind: LayerKind): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;

    layer.kind = kind;
    if (kind !== 'mask') {
      for (const l of tl.layers) {
        if (l.maskLayerId === layer.id) {
          delete l.maskLayerId;
        }
      }
    }

    state = { ...state, doc };
    notify();
  },

  renameLayer(layerId: string, name: string): void {
    if (!name.trim()) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.name = name.trim();
    state = { ...state, doc };
    notify();
  },

  setLayerFilters(layerId: string, filters: Filter[]): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.filters = filters;
    state = { ...state, doc };
    notify();
  },

  addLayerFilter(layerId: string, filter: Filter): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.filters = [...(layer.filters ?? []), filter];
    state = { ...state, doc };
    notify();
  },

  removeLayerFilter(layerId: string, filterIndex: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer || !layer.filters) return;
    layer.filters = layer.filters.filter((_, idx) => idx !== filterIndex);
    state = { ...state, doc };
    notify();
  },

  updateLayerFilter(layerId: string, filterIndex: number, updates: Partial<Filter>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer || !layer.filters || !layer.filters[filterIndex]) return;
    layer.filters[filterIndex] = { ...layer.filters[filterIndex], ...updates } as Filter;
    state = { ...state, doc };
    notify();
  },

  /* ========================================================================= *
   * Symbol & Component Actions
   * ========================================================================= */

  addComponent(component: EditorSymbol): void {
    editorActions.addSymbol(component);
  },

  deleteComponent(componentId: string): void {
    editorActions.deleteSymbol(componentId);
  },

  addComponentToStage(componentId: string, x = 100, y = 100): void {
    editorActions.addSymbolToStage(componentId, x, y);
  },

  addSymbol(symbol: EditorSymbol): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    doc.library.symbols[symbol.id] = symbol;
    state = { ...state, doc };
    notify();
  },

  deleteSymbol(symbolId: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    delete doc.library.symbols[symbolId];
    state = { ...state, doc };
    notify();
  },

  addSymbolToStage(symbolId: string, x = 100, y = 100): void {
    const sym = state.doc.library.symbols[symbolId];
    if (!sym) return;

    const regX = sym.registration?.x ?? Math.round((sym.width || 100) / 2);
    const regY = sym.registration?.y ?? Math.round((sym.height || 100) / 2);

    const instance: EditorElement = {
      id: `instance_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'instance',
      symbolId,
      instanceName: sym.name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_'),
      playMode: 'loop',
      autoplay: true,
      loop: true,
      transform: {
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: regX,
        originY: regY,
      },
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(instance);
  },

  insertComponent(symbolId?: string, x = 100, y = 100): void {
    if (symbolId) {
      editorActions.addSymbolToStage(symbolId, x, y);
      return;
    }
    const symbols = Object.values(state.doc.library.symbols);
    if (symbols.length > 0) {
      editorActions.addSymbolToStage(symbols[0].id, x, y);
    } else {
      editorActions.setConvertToComponentModalOpen(true);
    }
  },

  updateStageProps(props: Partial<StageDef>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    doc.stage = {
      ...doc.stage,
      ...props,
    };
    if (doc.artboards && doc.artboards.length > 0) {
      const active = doc.artboards.find((a) => a.id === doc.activeArtboardId) || doc.artboards[0];
      if (props.width !== undefined) active.width = props.width;
      if (props.height !== undefined) active.height = props.height;
      if (props.background !== undefined) active.background = props.background;
      if (props.breakpoints !== undefined) active.breakpoints = props.breakpoints;
    }
    state = { ...state, doc };
    notify();
  },

  applyBreakpoint(breakpoint: StageBreakpoint): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const prevW = doc.stage.width || 550;
    const prevH = doc.stage.height || 400;
    const newW = breakpoint.width;
    const newH = breakpoint.height;

    doc.stage.width = newW;
    doc.stage.height = newH;

    const tl = getActiveTimeline(doc, state.isolationStack);
    for (const layer of tl.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          adjustElementForPin(el, prevW, prevH, newW, newH);
        }
      }
    }

    state = {
      ...state,
      doc,
      activeBreakpointId: breakpoint.id,
    };
    notify();
  },

  addBreakpoint(bp: Omit<StageBreakpoint, 'id'> & { id?: string }): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.stage.breakpoints) {
      doc.stage.breakpoints = [];
    }
    const newBp: StageBreakpoint = {
      id: bp.id || `bp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: bp.name,
      maxWidth: bp.maxWidth,
      width: bp.width,
      height: bp.height,
    };
    doc.stage.breakpoints.push(newBp);
    doc.stage.breakpoints.sort((a, b) => b.maxWidth - a.maxWidth);
    state = { ...state, doc };
    notify();
  },

  removeBreakpoint(id: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (doc.stage.breakpoints) {
      doc.stage.breakpoints = doc.stage.breakpoints.filter((b) => b.id !== id);
    }
    const activeBp = state.activeBreakpointId === id ? null : state.activeBreakpointId;
    state = { ...state, doc, activeBreakpointId: activeBp };
    notify();
  },

  setReducedMotion(reducedMotion?: StageDef['reducedMotion']): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (reducedMotion) {
      doc.stage.reducedMotion = reducedMotion;
    } else {
      delete doc.stage.reducedMotion;
    }
    state = { ...state, doc };
    notify();
  },

  setPreviewLocale(locale: string): void {
    state = { ...state, previewLocale: locale };
    notify();
  },

  updateI18n(patch: Partial<I18nDef>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = {
        defaultLocale: 'en',
        locales: { en: {} },
      };
    }
    doc.i18n = {
      ...doc.i18n,
      ...patch,
      locales: {
        ...doc.i18n.locales,
        ...(patch.locales || {}),
      },
    };
    state = { ...state, doc };
    notify();
  },

  setI18nTranslation(locale: string, key: string, translation: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = {
        defaultLocale: 'en',
        locales: { en: {} },
      };
    }
    if (!doc.i18n.locales[locale]) {
      doc.i18n.locales[locale] = {};
    }
    doc.i18n.locales[locale][key] = translation;
    state = { ...state, doc };
    notify();
  },

  removeI18nKey(key: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (doc.i18n?.locales) {
      for (const loc of Object.keys(doc.i18n.locales)) {
        delete doc.i18n.locales[loc][key];
      }
    }
    const unbind = (elements: EditorElement[]) => {
      for (const el of elements) {
        if (el.type === 'text' && (el as TextElement).i18nKey === key) {
          delete (el as TextElement).i18nKey;
        }
      }
    };
    for (const l of doc.root?.layers || []) {
      for (const kf of l.keyframes || []) unbind(kf.elements);
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const l of sym.timeline?.layers || []) {
        for (const kf of l.keyframes || []) unbind(kf.elements);
      }
    }
    state = { ...state, doc };
    notify();
  },

  addI18nLocale(locale: string): void {
    const loc = locale.trim();
    if (!loc) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = {
        defaultLocale: 'en',
        locales: { en: {} },
      };
    }
    if (!doc.i18n.locales[loc]) {
      doc.i18n.locales[loc] = {};
    }
    state = { ...state, doc, previewLocale: loc };
    notify();
  },

  removeI18nLocale(locale: string): void {
    const loc = locale.trim();
    if (!loc) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (doc.i18n?.locales?.[loc]) {
      delete doc.i18n.locales[loc];
    }
    const nextPreview =
      state.previewLocale === loc ? doc.i18n?.defaultLocale || 'en' : state.previewLocale;
    state = { ...state, doc, previewLocale: nextPreview };
    notify();
  },

  addI18nStringKey(key: string, defaultValue = ''): void {
    const cleanKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!cleanKey) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = {
        defaultLocale: 'en',
        locales: { en: {} },
      };
    }
    const defLoc = doc.i18n.defaultLocale || 'en';
    if (!doc.i18n.locales[defLoc]) {
      doc.i18n.locales[defLoc] = {};
    }
    if (doc.i18n.locales[defLoc][cleanKey] === undefined) {
      doc.i18n.locales[defLoc][cleanKey] = defaultValue;
    }
    state = { ...state, doc };
    notify();
  },

  renameI18nStringKey(oldKey: string, newKey: string): void {
    const cleanNew = newKey.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!oldKey || !cleanNew || oldKey === cleanNew) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (doc.i18n?.locales) {
      for (const loc of Object.keys(doc.i18n.locales)) {
        if (doc.i18n.locales[loc]?.[oldKey] !== undefined) {
          doc.i18n.locales[loc][cleanNew] = doc.i18n.locales[loc][oldKey];
          delete doc.i18n.locales[loc][oldKey];
        }
      }
    }
    const updateElements = (elements: EditorElement[]) => {
      for (const el of elements) {
        if (el.type === 'text' && (el as TextElement).i18nKey === oldKey) {
          (el as TextElement).i18nKey = cleanNew;
        }
      }
    };
    for (const l of doc.root?.layers || []) {
      for (const kf of l.keyframes || []) updateElements(kf.elements);
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const l of sym.timeline?.layers || []) {
        for (const kf of l.keyframes || []) updateElements(kf.elements);
      }
    }
    state = { ...state, doc };
    notify();
  },

  bindElementToI18nKey(elementId: string, key: string | null): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const cleanKey = key ? key.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : undefined;

    let targetText: string | undefined;
    const updateElements = (elements: EditorElement[]) => {
      for (const el of elements) {
        if (el.id === elementId && el.type === 'text') {
          (el as TextElement).i18nKey = cleanKey;
          targetText = (el as TextElement).text;
        }
      }
    };
    for (const l of doc.root?.layers || []) {
      for (const kf of l.keyframes || []) updateElements(kf.elements);
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const l of sym.timeline?.layers || []) {
        for (const kf of l.keyframes || []) updateElements(kf.elements);
      }
    }
    if (cleanKey && targetText !== undefined) {
      if (!doc.i18n) {
        doc.i18n = { defaultLocale: 'en', locales: { en: {} } };
      }
      const defLoc = doc.i18n.defaultLocale || 'en';
      if (!doc.i18n.locales[defLoc]) doc.i18n.locales[defLoc] = {};
      if (doc.i18n.locales[defLoc][cleanKey] === undefined) {
        doc.i18n.locales[defLoc][cleanKey] = targetText;
      }
    }
    state = { ...state, doc };
    notify();
  },

  autoExtractI18nStrings(): number {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = { defaultLocale: 'en', locales: { en: {} } };
    }
    const defLoc = doc.i18n.defaultLocale || 'en';
    if (!doc.i18n.locales[defLoc]) doc.i18n.locales[defLoc] = {};

    let count = 0;
    const processElements = (elements: EditorElement[]) => {
      for (const el of elements) {
        if (el.type === 'text') {
          const txt = el as TextElement;
          if (!txt.i18nKey) {
            const raw = (txt.text || 'text').trim().toLowerCase();
            const slug =
              raw
                .slice(0, 20)
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'text';
            let candidateKey = slug;
            let counter = 1;
            while (doc.i18n!.locales[defLoc][candidateKey] !== undefined) {
              candidateKey = `${slug}_${counter++}`;
            }
            txt.i18nKey = candidateKey;
            doc.i18n!.locales[defLoc][candidateKey] = txt.text || '';
            count++;
          } else {
            if (doc.i18n!.locales[defLoc][txt.i18nKey] === undefined) {
              doc.i18n!.locales[defLoc][txt.i18nKey] = txt.text || '';
            }
          }
        }
      }
    };

    for (const l of doc.root?.layers || []) {
      for (const kf of l.keyframes || []) processElements(kf.elements);
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const l of sym.timeline?.layers || []) {
        for (const kf of l.keyframes || []) processElements(kf.elements);
      }
    }

    state = { ...state, doc };
    notify();
    return count;
  },

  importI18nJson(jsonInput: string | Record<string, any>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    if (!doc.i18n) {
      doc.i18n = { defaultLocale: 'en', locales: { en: {} } };
    }
    let data: any = jsonInput;
    if (typeof jsonInput === 'string') {
      try {
        data = JSON.parse(jsonInput);
      } catch (err) {
        console.error('Failed to parse i18n JSON:', err);
        return;
      }
    }
    if (!data || typeof data !== 'object') return;

    if (data.locales && typeof data.locales === 'object') {
      if (data.defaultLocale) doc.i18n.defaultLocale = String(data.defaultLocale);
      for (const [loc, map] of Object.entries(data.locales)) {
        if (!doc.i18n.locales[loc]) doc.i18n.locales[loc] = {};
        if (map && typeof map === 'object') {
          Object.assign(doc.i18n.locales[loc], map);
        }
      }
    } else {
      const firstVal = Object.values(data)[0];
      const isNested = firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal);
      if (isNested) {
        for (const [loc, map] of Object.entries(data)) {
          if (!doc.i18n.locales[loc]) doc.i18n.locales[loc] = {};
          if (map && typeof map === 'object') {
            Object.assign(doc.i18n.locales[loc], map);
          }
        }
      } else {
        const targetLoc = state.previewLocale || doc.i18n.defaultLocale || 'en';
        if (!doc.i18n.locales[targetLoc]) doc.i18n.locales[targetLoc] = {};
        Object.assign(doc.i18n.locales[targetLoc], data);
      }
    }
    state = { ...state, doc };
    notify();
  },

  setDocumentName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const now = new Date().toISOString();
    if (!doc.meta) {
      doc.meta = {
        name: trimmed,
        createdAt: now,
        modifiedAt: now,
        editorVersion: '0.1.0',
      };
    } else {
      doc.meta.name = trimmed;
      doc.meta.modifiedAt = now;
    }
    state = { ...state, doc };
    notify();
  },

  /* ========================================================================= *
   * Artboards & Tab Navigation
   * ========================================================================= */

  setActiveArtboard(artboardId: string): void {
    const doc = deepCloneDoc(state.doc);
    ensureMaterializedArtboards(doc);
    const target = doc.artboards!.find((a) => a.id === artboardId);
    if (!target) return;
    doc.activeArtboardId = target.id;
    syncActiveArtboardToStage(doc);
    state = {
      ...state,
      doc,
      selectedElementIds: [],
      editingTextElId: null,
      currentFrame: 0,
      currentTime: 0,
      selectedLayerId: target.root.layers[0]?.id || null,
      selectedFrameIndex: 0,
      selectedTime: 0,
    };
    notify();
  },

  switchArtboard(artboardId: string): void {
    editorActions.setActiveArtboard(artboardId);
  },

  addArtboard(name?: string, width?: number, height?: number): string {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    const newIdx = artboards.length + 1;
    const newId = `artboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newName = name?.trim() || `Artboard ${newIdx}`;
    const abWidth = width || doc.stage.width || 550;
    const abHeight = height || doc.stage.height || 400;

    const newRoot: TimelineDef = {
      frameCount: 24,
      layers: [
        {
          id: `layer_${Math.random().toString(36).slice(2, 8)}`,
          name: 'Layer 1',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: `kf_${Math.random().toString(36).slice(2, 8)}`,
              index: 0,
              duration: 24,
              time: 0,
              durationTime: 1.0,
              elements: [],
            },
          ],
        },
      ],
    };

    const newArtboard: EditorArtboard = {
      id: newId,
      name: newName,
      width: abWidth,
      height: abHeight,
      background: doc.stage.background,
      root: newRoot as any,
    };

    artboards.push(newArtboard);
    doc.activeArtboardId = newId;
    syncActiveArtboardToStage(doc);

    state = {
      ...state,
      doc,
      selectedElementIds: [],
      editingTextElId: null,
      currentFrame: 0,
      currentTime: 0,
      selectedLayerId: newRoot.layers[0]?.id || null,
      selectedFrameIndex: 0,
      selectedTime: 0,
    };
    notify();
    return newId;
  },

  duplicateArtboard(artboardId: string): string {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    const idx = artboards.findIndex((a) => a.id === artboardId);
    if (idx === -1) return '';
    const src = artboards[idx];
    const clone = deepCloneDoc(src as any) as unknown as EditorArtboard;

    const newId = `artboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    clone.id = newId;
    clone.name = `${src.name} Copy`;

    if (clone.root?.layers) {
      for (const layer of clone.root.layers) {
        layer.id = `layer_${Math.random().toString(36).slice(2, 8)}`;
        if (layer.keyframes) {
          for (const kf of layer.keyframes) {
            kf.id = `kf_${Math.random().toString(36).slice(2, 8)}`;
            if (kf.elements) {
              for (const el of kf.elements) {
                el.id = `el_${Math.random().toString(36).slice(2, 8)}`;
              }
            }
          }
        }
      }
    }

    artboards.splice(idx + 1, 0, clone);
    doc.activeArtboardId = newId;
    syncActiveArtboardToStage(doc);

    state = {
      ...state,
      doc,
      selectedElementIds: [],
      editingTextElId: null,
      currentFrame: 0,
      currentTime: 0,
      selectedLayerId: clone.root.layers[0]?.id || null,
      selectedFrameIndex: 0,
      selectedTime: 0,
    };
    notify();
    return newId;
  },

  renameArtboard(artboardId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    const target = artboards.find((a) => a.id === artboardId);
    if (!target) return;
    target.name = trimmed;
    state = { ...state, doc };
    notify();
  },

  deleteArtboard(artboardId: string): void {
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    if (artboards.length <= 1) return;

    pushHistorySnapshot();
    const idx = artboards.findIndex((a) => a.id === artboardId);
    if (idx === -1) return;

    artboards.splice(idx, 1);
    if (doc.activeArtboardId === artboardId) {
      const nextIdx = Math.max(0, idx - 1);
      doc.activeArtboardId = artboards[nextIdx].id;
    }
    syncActiveArtboardToStage(doc);

    const activeAb = getActiveArtboard(doc);
    state = {
      ...state,
      doc,
      selectedElementIds: [],
      editingTextElId: null,
      currentFrame: 0,
      currentTime: 0,
      selectedLayerId: activeAb.root.layers[0]?.id || null,
    };
    notify();
  },

  reorderArtboards(startIndex: number, endIndex: number): void {
    if (startIndex === endIndex) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    if (
      startIndex < 0 ||
      startIndex >= artboards.length ||
      endIndex < 0 ||
      endIndex >= artboards.length
    ) {
      return;
    }
    const [removed] = artboards.splice(startIndex, 1);
    artboards.splice(endIndex, 0, removed);
    state = { ...state, doc };
    notify();
  },

  moveElementToArtboard(elementId: string, targetArtboardId: string): void {
    if (!elementId || !targetArtboardId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    const activeAb = getActiveArtboard(doc);
    if (activeAb.id === targetArtboardId) return;

    const targetAb = artboards.find((a) => a.id === targetArtboardId);
    if (!targetAb) return;

    // 1. Locate and remove element from current active artboard
    let foundEl: EditorElement | null = null;
    for (const layer of activeAb.root.layers) {
      for (const kf of layer.keyframes) {
        const elIdx = kf.elements.findIndex((e) => e.id === elementId);
        if (elIdx !== -1) {
          [foundEl] = kf.elements.splice(elIdx, 1);
          break;
        }
      }
      if (foundEl) break;
    }

    if (!foundEl) return;

    // 2. Add element to target artboard first layer, first keyframe
    let targetLayer = targetAb.root.layers[0];
    if (!targetLayer) {
      targetLayer = {
        id: `layer_${Math.random().toString(36).slice(2, 8)}`,
        name: 'Layer 1',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: `kf_${Math.random().toString(36).slice(2, 8)}`,
            index: 0,
            duration: 24,
            time: 0,
            durationTime: 1.0,
            elements: [],
          },
        ],
      };
      targetAb.root.layers.push(targetLayer);
    }

    let targetKf = targetLayer.keyframes[0];
    if (!targetKf) {
      targetKf = {
        id: `kf_${Math.random().toString(36).slice(2, 8)}`,
        index: 0,
        duration: 24,
        time: 0,
        durationTime: 1.0,
        elements: [],
      };
      targetLayer.keyframes.push(targetKf);
    }

    targetKf.elements.push(foundEl as any);
    state = {
      ...state,
      doc,
      selectedElementIds: state.selectedElementIds.filter((id) => id !== elementId),
    };
    notify();
  },

  moveLayerToArtboard(layerId: string, targetArtboardId: string): void {
    if (!layerId || !targetArtboardId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const artboards = ensureMaterializedArtboards(doc);
    const activeAb = getActiveArtboard(doc);
    if (activeAb.id === targetArtboardId) return;

    const targetAb = artboards.find((a) => a.id === targetArtboardId);
    if (!targetAb) return;

    const layerIdx = activeAb.root.layers.findIndex((l) => l.id === layerId);
    if (layerIdx === -1) return;

    const [layer] = activeAb.root.layers.splice(layerIdx, 1);
    targetAb.root.layers.push(layer as any);

    state = {
      ...state,
      doc,
      selectedLayerId: activeAb.root.layers[0]?.id || null,
    };
    notify();
  },
};

export function computeTotalTimelineFrames(tl: TimelineDef): number {
  let maxFrame = tl.frameCount || 1;
  if (tl.layers) {
    for (const layer of tl.layers) {
      if (layer.keyframes) {
        for (const kf of layer.keyframes) {
          const end = kf.index + kf.duration;
          if (end > maxFrame) maxFrame = end;
        }
      }
    }
  }
  return maxFrame;
}

export function formatTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, fps || 24);
  const totalMs = Math.round((frame / safeFps) * 1000);
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const secs = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const mins = totalMins % 60;
  const hours = Math.floor(totalMins / 60);
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}
