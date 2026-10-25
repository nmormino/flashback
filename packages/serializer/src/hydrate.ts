/**
 * Hydration helper: compiles `{ __fn: string }` script sources into real
 * JavaScript Function objects using `new Function(...)`.
 */
import type { AnimDocument } from '@flashback/runtime';
import { normalizeSource, toFunctionSource } from './script.js';
import { isScriptSource, type EditorDocument } from './types.js';

/**
 * Compiles a single script source string into a real executable Function.
 */
export function compileScript(source: string, path: string = ''): Function {
  const norm = normalizeSource(source, path, true);
  try {
    return new Function(`return (${toFunctionSource(norm)});`)();
  } catch (err: any) {
    throw new Error(
      path
        ? `Failed to compile script at ${path}: ${err.message}`
        : `Failed to compile script: ${err.message}`,
    );
  }
}

function hydrateValue(v: unknown, path: string): unknown {
  if (v === null || typeof v !== 'object') {
    return v;
  }

  if (isScriptSource(v)) {
    return compileScript(v.__fn, path);
  }

  if (Array.isArray(v)) {
    return v.map((item, i) => hydrateValue(item, `${path}[${i}]`));
  }

  const result: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    result[k] = hydrateValue(val, p);
  }
  return result;
}

/**
 * Recursively hydrates an EditorDocument into an AnimDocument by compiling
 * all `{ __fn: string }` ScriptSource representations into real Functions.
 */
export function hydrate<T extends EditorDocument | AnimDocument>(doc: T): AnimDocument {
  return hydrateValue(doc, '') as AnimDocument;
}
