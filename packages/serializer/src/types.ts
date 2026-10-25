import type { AnimDocument } from '@flashback/runtime';

/**
 * Editor-side representation of a script: raw source text, never executed
 * until explicitly hydrated. `__fn` is either a full function expression
 * (`function (e) { ... }`), a method (`onPress(e) { ... }`), or a bare body
 * (`this.stop();`).
 */
export interface ScriptSource {
  __fn: string;
}

/** Replaces every function type in T with `T | ScriptSource` (deeply). */
export type WithScriptSource<T> = T extends (...args: never[]) => unknown
  ? T | ScriptSource
  : T extends object
    ? { [K in keyof T]: WithScriptSource<T[K]> }
    : T;

/** A document whose scripts may be live functions or `{ __fn }` source. */
export type EditorDocument = WithScriptSource<AnimDocument>;

export class SerializeError extends Error {
  constructor(message: string, public readonly path: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = 'SerializeError';
  }
}

export class ParseError extends Error {
  constructor(message: string, public readonly pos?: number) {
    super(pos === undefined ? message : `${message} (at offset ${pos})`);
    this.name = 'ParseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = 'ValidationError';
  }
}

export function isScriptSource(v: unknown): v is ScriptSource {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as ScriptSource).__fn === 'string' &&
    Object.keys(v).length === 1
  );
}
