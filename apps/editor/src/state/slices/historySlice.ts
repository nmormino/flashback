import type { EditorDocument } from '@flashback/serializer';
import type { HistorySliceActions, SliceContext, SliceCreator } from './types';

export const MAX_HISTORY = 50;

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

export function deepCloneDoc(doc: EditorDocument): EditorDocument {
  return fastClone(doc);
}

export interface HistorySliceResult extends HistorySliceActions {
  pushHistorySnapshot(): void;
}

export const createHistorySlice = (context: SliceContext): HistorySliceResult => {
  function pushHistorySnapshot(): void {
    const state = context.getState();
    const currentSnapshot = deepCloneDoc(state.doc);
    const newUndo = [...state.undoStack, currentSnapshot];
    if (newUndo.length > MAX_HISTORY) {
      newUndo.shift();
    }
    context.setState(
      {
        undoStack: newUndo,
        redoStack: [],
      },
      { skipNotify: true }
    );
  }

  return {
    pushHistorySnapshot,

    commitHistorySnapshot(): void {
      pushHistorySnapshot();
    },

    undo(): void {
      const state = context.getState();
      if (state.undoStack.length === 0) return;
      const last = state.undoStack[state.undoStack.length - 1];
      const newUndo = state.undoStack.slice(0, -1);
      const newRedo = [deepCloneDoc(state.doc), ...state.redoStack];
      context.setState({
        doc: deepCloneDoc(last),
        undoStack: newUndo,
        redoStack: newRedo,
      });
    },

    redo(): void {
      const state = context.getState();
      if (state.redoStack.length === 0) return;
      const next = state.redoStack[0];
      const newRedo = state.redoStack.slice(1);
      const newUndo = [...state.undoStack, deepCloneDoc(state.doc)];
      context.setState({
        doc: deepCloneDoc(next),
        undoStack: newUndo,
        redoStack: newRedo,
      });
    },
  };
};
