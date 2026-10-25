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
  TextElement,
  TextSpan,
} from '@flashback/runtime';
import {
  serialize,
  parse,
  validate,
  type EditorDocument,
  type ScriptSource,
} from '@flashback/serializer';
import { createDefaultDocument } from './defaultDoc';

export type EditorTool = 'select' | 'subselect' | 'rect' | 'oval' | 'polygon' | 'pen' | 'text' | 'hand';

export type EditorLayer = EditorDocument['root']['layers'][number];
export type EditorKeyframe = EditorLayer['keyframes'][number];
export type EditorElement = EditorKeyframe['elements'][number];
export type EditorSymbol = EditorDocument['library']['symbols'][string];
export type EditorTimeline = EditorDocument['root'];

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
  activeInspectorTab: 'timeline' | 'properties' | 'scripts';
  addFontModalOpen: boolean;
  clipboard: EditorElement[];
  contextMenu: ContextMenuState | null;
  isolationStack: Array<{ symbolId: string; name: string }>;
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

let tickerTimer: ReturnType<typeof setInterval> | null = null;
let rafTimer: any = null;
let lastRafTime = 0;
let lastCustomLoopCount = 1;

const initialDoc = createDefaultDocument();

let state: EditorState = {
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
  clipboard: [],
  contextMenu: null,
  isolationStack: [],
};

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
  const match = layer.keyframes.find((kf) => {
    const kfTime = getKeyframeTime(kf, fps);
    const kfDur = getKeyframeDurationTime(kf, fps);
    return time >= kfTime && time < kfTime + kfDur;
  });
  if (match) return match;
  // If at or past the last keyframe
  const sorted = [...layer.keyframes].sort((a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps));
  const last = sorted[sorted.length - 1];
  if (last && time >= getKeyframeTime(last, fps)) {
    return last;
  }
  return undefined;
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
    for (const kf of layer.keyframes) {
      const kfTime = getKeyframeTime(kf, fps);
      const kfDur = getKeyframeDurationTime(kf, fps);
      const end = kfTime + kfDur;
      if (end > maxTime) maxTime = end;
    }
  }
  const result = Math.max(2.0, maxTime);

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
  return layer.keyframes.find((kf) => frameIndex >= kf.index && frameIndex < kf.index + kf.duration);
}

export const editorActions = {
  setActiveTool(tool: EditorTool): void {
    state = { ...state, activeTool: tool };
    notify();
  },

  setFillColor(color: string): void {
    state = { ...state, fillColor: color, activeFill: { type: 'solid', color } };
    notify();
  },

  setActiveFill(fill: Fill): void {
    const primaryColor =
      fill.type === 'solid'
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
    state = { ...state, strokeColor: color };
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

  setActiveInspectorTab(tab: 'timeline' | 'properties' | 'scripts'): void {
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

  selectLayer(layerId: string): void {
    state = { ...state, selectedLayerId: layerId };
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
    if (multiSelect) {
      const exists = state.selectedElementIds.includes(elementId);
      const next = exists
        ? state.selectedElementIds.filter((id) => id !== elementId)
        : [...state.selectedElementIds, elementId];
      state = { ...state, selectedElementIds: next };
    } else {
      state = { ...state, selectedElementIds: [elementId] };
    }
    notify();
  },

  selectElements(elementIds: string[]): void {
    state = { ...state, selectedElementIds: elementIds };
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
    const clamped = Math.max(0, Math.min(timeInSeconds, totalDuration));
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

    const tick = (now: number) => {
      if (!state.isPlaying) return;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastRafTime) / 1000));
      lastRafTime = now;

      const activeTl = getActiveTimeline(state.doc, state.isolationStack);
      const fps = state.doc.stage.fps || 24;
      const totalDuration = computeTotalTimelineDuration(activeTl, fps);
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

  exportToJS(): string {
    return serialize(state.doc, { defineAnimation: false });
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
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const fps = doc.stage.fps || 24;
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (frameIndexOrTime > 30 ? frameIndexOrTime / fps : frameIndexOrTime)
      : state.currentTime;
    const targetFrame = Math.round(targetTime * fps);
    const layer = tl.layers.find((l) => l.id === targetLayerId);
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

    tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
    state = { ...state, doc };
    notify();
  },

  insertBlankKeyframe(layerId?: string, frameIndex?: number): void {
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
      if (existingKf.index === targetFrame) {
        existingKf.elements = [];
        delete existingKf.tween;
      } else {
        const splitOffset = targetFrame - existingKf.index;
        const originalDuration = existingKf.duration;
        existingKf.duration = splitOffset;

        const newKf: EditorKeyframe = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: targetFrame,
          duration: originalDuration - splitOffset,
          elements: [],
        };

        const kfIdx = layer.keyframes.indexOf(existingKf);
        layer.keyframes.splice(kfIdx + 1, 0, newKf);
      }
    } else {
      const newKf: EditorKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: targetFrame,
        duration: 1,
        elements: [],
      };
      layer.keyframes.push(newKf);
      layer.keyframes.sort((a, b) => a.index - b.index);
    }

    tl.frameCount = Math.max(tl.frameCount, targetFrame + 1);
    state = { ...state, doc, selectedElementIds: [] };
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

  /* ========================================================================= *
   * Element Mutations
   * ========================================================================= */

  addElement(element: EditorElement, layerId?: string, frameIndexOrTime?: number): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const targetLayerId = layerId ?? state.selectedLayerId ?? tl.layers[0]?.id;
    const fps = doc.stage.fps || 24;
    const targetTime = typeof frameIndexOrTime === 'number'
      ? (frameIndexOrTime > 30 ? frameIndexOrTime / fps : frameIndexOrTime)
      : state.currentTime;
    const targetFrame = Math.round(targetTime * fps);
    const layer = tl.layers.find((l) => l.id === targetLayerId) ?? tl.layers[0];
    if (!layer) return;

    let kf = findKeyframeAtTime(layer, targetTime, fps) ?? findKeyframeAt(layer, targetFrame);
    if (!kf) {
      // Create a keyframe at targetFrame / targetTime
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

    kf.elements.push(element);
    state = {
      ...state,
      doc,
      selectedLayerId: layer.id,
      selectedElementIds: [element.id],
    };
    notify();
  },

  updateElementTransform(id: string, transform: Partial<Transform>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === id);
      if (el) {
        el.transform = {
          ...el.transform,
          ...transform,
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

  updateElementProps(id: string, props: Partial<EditorElement>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === id);
      if (elIndex >= 0) {
        kf.elements[elIndex] = {
          ...kf.elements[elIndex],
          ...props,
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

  convertToComponent(elementId: string, name: string, kind: SymbolKind = 'movieclip'): void {
    editorActions.convertToSymbol(elementId, name, kind);
  },

  convertToSymbol(elementId: string, name: string, kind: SymbolKind = 'movieclip'): void {
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

    const symbolId = `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const innerElement: EditorElement = {
      ...fastClone(targetEl),
      id: `el_inner_${Date.now()}`,
      transform: {
        ...targetEl.transform,
        x: 0,
        y: 0,
      },
    };

    const newSymbol: EditorSymbol = {
      id: symbolId,
      name,
      kind,
      registration: { x: 0, y: 0 },
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

  updateElementScript(id: string, eventName: string, code: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    let updated = false;

    for (const layer of tl.layers) {
      const kf = findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === id);
      if (el && el.type === 'instance') {
        const instance = el as SymbolInstance;
        if (!instance.events) {
          instance.events = {};
        }
        if (!code.trim()) {
          delete (instance.events as Record<string, unknown>)[eventName];
        } else {
          (instance.events as Record<string, ScriptSource>)[eventName] = { __fn: code };
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

  updateKeyframeScript(layerId: string, frameIndex: number, code: string): void {
    pushHistorySnapshot();
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
    const nextNum = tl.layers.length + 1;
    const newLayer: EditorLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name ?? `Layer ${nextNum}`,
      kind: 'normal',
      visible: true,
      locked: false,
      parentLayerId: parentFolderId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ],
    };

    // If parentFolderId is specified, place it right after the parent folder or top of folder
    if (parentFolderId) {
      const parentIdx = tl.layers.findIndex((l) => l.id === parentFolderId);
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
    const nextNum = tl.layers.filter((l) => l.kind === 'folder').length + 1;
    const newFolder: EditorLayer = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name ?? `Folder ${nextNum}`,
      kind: 'folder',
      visible: true,
      locked: false,
      parentLayerId: parentFolderId,
      keyframes: [
        {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          index: 0,
          duration: tl.frameCount || 24,
          elements: [],
        },
      ],
    };

    if (parentFolderId) {
      const parentIdx = tl.layers.findIndex((l) => l.id === parentFolderId);
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

  setLayerParent(layerId: string, parentFolderId?: string): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const layer = tl.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (parentFolderId) {
      layer.parentLayerId = parentFolderId;
    } else {
      delete layer.parentLayerId;
    }
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
    const currentT = kf.transform ?? {
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
    kf.transform = { ...currentT, ...partial };
    state = { ...state, doc };
    notify();
  },

  deleteLayer(layerId: string): void {
    const currentTl = getActiveTimeline(state.doc, state.isolationStack);
    if (currentTl.layers.length <= 1) return; // Prevent deleting last layer
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    tl.layers = tl.layers.filter((l) => l.id !== layerId);

    const nextSelected = tl.layers[0]?.id ?? null;
    state = {
      ...state,
      doc,
      selectedLayerId: nextSelected,
    };
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

    const instance: EditorElement = {
      id: `instance_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'instance',
      symbolId,
      instanceName: sym.name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_'),
      transform: {
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: sym.registration?.x ?? 0,
        originY: sym.registration?.y ?? 0,
      },
      alpha: 1,
      visible: true,
    };

    editorActions.addElement(instance);
  },

  updateStageProps(props: Partial<StageDef>): void {
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    doc.stage = {
      ...doc.stage,
      ...props,
    };
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
