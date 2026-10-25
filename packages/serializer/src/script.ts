/**
 * Script normalization: turns a live function or `{ __fn }` source string into
 * a canonical `{ params, body }` pair using Acorn (no execution).
 */
import { parse as acornParse, type Node } from 'acorn';
import { isScriptSource, SerializeError } from './types.js';

export interface NormalizedScript {
  /** Raw parameter list text, without parentheses. */
  params: string;
  /** Raw body text INCLUDING the surrounding braces. */
  body: string;
}

const ECMA = { ecmaVersion: 'latest' as const, sourceType: 'script' as const };

// Acorn's ESTree node typings are loose; we narrow manually.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

function tryParse(code: string): AnyNode | null {
  try {
    return acornParse(code, ECMA) as Node;
  } catch {
    return null;
  }
}

function sliceFn(code: string, fn: AnyNode, path: string): NormalizedScript {
  if (fn.async) throw new SerializeError('Async functions are not allowed in scripts (frame execution is synchronous)', path);
  if (fn.generator) throw new SerializeError('Generator functions are not allowed in scripts', path);
  const params: AnyNode[] = fn.params;
  const paramText = params.length ? code.slice(params[0].start, params[params.length - 1].end) : '';
  return { params: paramText, body: code.slice(fn.body.start, fn.body.end) };
}

/** Normalize arbitrary script source (full function, method, or bare body). */
export function normalizeSource(src: string, path: string, allowBody: boolean): NormalizedScript {
  const trimmed = src.trim();
  if (/\[native code\]\s*\}\s*$/.test(trimmed)) {
    throw new SerializeError('Cannot serialize native or bound function (source is "[native code]")', path);
  }

  // 1. As an expression: `function (...) {...}` / arrow / class.
  const exprCode = `(${trimmed}\n)`;
  const exprAst = tryParse(exprCode);
  if (exprAst && exprAst.body.length === 1 && exprAst.body[0].type === 'ExpressionStatement') {
    const e = exprAst.body[0].expression;
    if (e.type === 'FunctionExpression') return sliceFn(exprCode, e, path);
    if (e.type === 'ArrowFunctionExpression') {
      throw new SerializeError(
        'Arrow functions are not allowed in scripts: `this` must be bound to the MovieClip. Use `function () { ... }` or method syntax',
        path,
      );
    }
    if (e.type === 'ClassExpression') throw new SerializeError('Classes are not valid scripts', path);
  }

  // 2. As a method: `name(...) {...}` (what Function#toString gives for shorthand).
  const methodCode = `({${trimmed}\n})`;
  const methodAst = tryParse(methodCode);
  if (methodAst && methodAst.body.length === 1 && methodAst.body[0].type === 'ExpressionStatement') {
    const obj = methodAst.body[0].expression;
    if (obj.type === 'ObjectExpression' && obj.properties.length === 1) {
      const p = obj.properties[0];
      if (p.type === 'Property' && (p.kind === 'get' || p.kind === 'set')) {
        throw new SerializeError('Getters/setters are not valid scripts', path);
      }
      if (p.type === 'Property' && p.method) return sliceFn(methodCode, p.value, path);
    }
  }

  // 3. As a bare function body.
  if (allowBody) {
    const bodyCode = `(function () {\n${src}\n})`;
    const bodyAst = tryParse(bodyCode);
    if (!bodyAst || bodyAst.body.length !== 1) throw new SerializeError('Script source has a syntax error', path);
    const fn = bodyAst.body[0].expression;
    return sliceFn(bodyCode, fn, path);
  }
  throw new SerializeError('Could not parse function source', path);
}

export function normalizeScript(value: unknown, path: string): NormalizedScript {
  if (typeof value === 'function') {
    const src = Function.prototype.toString.call(value);
    return normalizeSource(src, path, false);
  }
  if (isScriptSource(value)) return normalizeSource(value.__fn, path, true);
  throw new SerializeError('Expected a function or { __fn } script', path);
}

/** Canonical `{ __fn }` text for a normalized script. */
export function toFunctionSource(s: NormalizedScript): string {
  return `function (${s.params}) ${s.body}`;
}
