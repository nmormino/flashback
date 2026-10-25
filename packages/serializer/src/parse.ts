/**
 * Deterministic parser: ES module text / JS object string → EditorDocument.
 * Uses Acorn for AST parsing with zero code execution.
 */
import { parse as acornParse, type Node } from 'acorn';
import { ParseError, type EditorDocument } from './types.js';

// Acorn's ESTree node typings are loose; we narrow manually.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const ECMA = { ecmaVersion: 'latest' as const, sourceType: 'module' as const };

function findIdentifierInit(ast: AnyNode, name: string): AnyNode {
  for (const node of ast.body) {
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.id.name === name) {
          if (declarator.init) {
            if (declarator.init.type === 'ObjectExpression') {
              return declarator.init;
            }
            if (
              declarator.init.type === 'CallExpression' &&
              declarator.init.arguments.length > 0 &&
              declarator.init.arguments[0].type === 'ObjectExpression'
            ) {
              return declarator.init.arguments[0];
            }
          }
        }
      }
    }
  }
  throw new ParseError(`Could not find declaration for identifier "${name}"`);
}

function findRootObject(ast: AnyNode): AnyNode {
  // 1. Check for export default declaration
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (decl.type === 'ObjectExpression') {
        return decl;
      }
      if (decl.type === 'CallExpression') {
        if (decl.arguments.length > 0) {
          const firstArg = decl.arguments[0];
          if (firstArg.type === 'ObjectExpression') {
            return firstArg;
          }
          if (firstArg.type === 'Identifier') {
            return findIdentifierInit(ast, firstArg.name);
          }
        }
      }
      if (decl.type === 'Identifier') {
        return findIdentifierInit(ast, decl.name);
      }
      throw new ParseError('export default must export an object literal', node.start);
    }
  }

  // 2. Check for top-level ExpressionStatement (e.g. from wrapped `({ ... })`)
  for (const node of ast.body) {
    if (node.type === 'ExpressionStatement') {
      const expr = node.expression;
      if (expr.type === 'ObjectExpression') {
        return expr;
      }
      if (expr.type === 'CallExpression') {
        if (expr.arguments.length > 0 && expr.arguments[0].type === 'ObjectExpression') {
          return expr.arguments[0];
        }
      }
    }
  }

  throw new ParseError('Could not find document object in source');
}

function nodeToValue(node: AnyNode, code: string): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      if (node.name === 'undefined') return undefined;
      if (node.name === 'NaN') return NaN;
      if (node.name === 'Infinity') return Infinity;
      if (node.name === 'SCHEMA_VERSION') return 1;
      throw new ParseError(`Unknown identifier: ${node.name}`, node.start);
    case 'UnaryExpression': {
      if (node.operator === '-') {
        const val = nodeToValue(node.argument, code);
        if (typeof val === 'number') return -val;
        throw new ParseError("Invalid unary '-' on non-number", node.start);
      }
      if (node.operator === '+') {
        const val = nodeToValue(node.argument, code);
        if (typeof val === 'number') return +val;
        throw new ParseError("Invalid unary '+' on non-number", node.start);
      }
      if (node.operator === '!') {
        const val = nodeToValue(node.argument, code);
        return !val;
      }
      throw new ParseError(`Unsupported unary operator: ${node.operator}`, node.start);
    }
    case 'ArrayExpression': {
      const arr: unknown[] = [];
      for (let i = 0; i < node.elements.length; i++) {
        const el = node.elements[i];
        if (el === null) {
          throw new ParseError('Sparse arrays are not supported', node.start);
        }
        if (el.type === 'FunctionExpression' || el.type === 'ArrowFunctionExpression') {
          throw new ParseError('Scripts are not allowed inside arrays', el.start);
        }
        arr.push(nodeToValue(el, code));
      }
      return arr;
    }
    case 'ObjectExpression': {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
          throw new ParseError('Spread elements are not supported', prop.start);
        }
        if (prop.type !== 'Property') {
          throw new ParseError(`Unsupported property node type: ${prop.type}`, prop.start);
        }
        if (prop.kind === 'get' || prop.kind === 'set') {
          throw new ParseError('Getters and setters are not supported', prop.start);
        }

        let key: string;
        if (prop.key.type === 'Identifier' && !prop.computed) {
          key = prop.key.name;
        } else if (prop.key.type === 'Literal') {
          key = String(prop.key.value);
        } else {
          throw new ParseError('Computed property keys are not supported', prop.key.start);
        }

        if (prop.method || prop.value.type === 'FunctionExpression') {
          const fn = prop.value;
          if (fn.async) {
            throw new ParseError('Async functions are not allowed in scripts', fn.start);
          }
          if (fn.generator) {
            throw new ParseError('Generator functions are not allowed in scripts', fn.start);
          }
          const params = fn.params;
          const paramText = params.length
            ? code.slice(params[0].start, params[params.length - 1].end)
            : '';
          const bodyText = code.slice(fn.body.start, fn.body.end);
          obj[key] = { __fn: `function (${paramText}) ${bodyText}` };
          continue;
        }

        if (prop.value.type === 'ArrowFunctionExpression') {
          throw new ParseError(
            'Arrow functions are not allowed in scripts: `this` must be bound to the MovieClip. Use `function () { ... }` or method syntax',
            prop.value.start,
          );
        }

        obj[key] = nodeToValue(prop.value, code);
      }
      return obj;
    }
    case 'TemplateLiteral': {
      if (node.expressions.length > 0) {
        throw new ParseError('Template literals with expressions are not supported', node.start);
      }
      return node.quasis[0].value.cooked;
    }
    case 'ParenthesizedExpression':
      return nodeToValue(node.expression, code);
    default:
      throw new ParseError(`Unsupported expression type: ${node.type}`, node.start);
  }
}

/**
 * Parses an ES module or JS object string into an EditorDocument.
 * Scripts are parsed into `{ __fn: string }` objects without executing code.
 */
export function parse(source: string): EditorDocument {
  if (typeof source !== 'string') {
    throw new ParseError('Input must be a string');
  }
  const trimmed = source.trim();
  if (!trimmed) {
    throw new ParseError('Source is empty');
  }

  let ast: AnyNode | null = null;
  let code = source;

  try {
    ast = acornParse(code, ECMA) as Node;
  } catch (err: any) {
    if (!trimmed.includes('export') && !trimmed.includes('import')) {
      try {
        code = `(${trimmed}\n)`;
        ast = acornParse(code, ECMA) as Node;
      } catch {
        throw new ParseError(err.message, err.pos);
      }
    } else {
      throw new ParseError(err.message, err.pos);
    }
  }

  let rootObjNode: AnyNode | null = null;
  try {
    rootObjNode = findRootObject(ast);
  } catch (err) {
    if (code === source && !trimmed.includes('export') && !trimmed.includes('import')) {
      try {
        code = `(${trimmed}\n)`;
        ast = acornParse(code, ECMA) as Node;
        rootObjNode = findRootObject(ast);
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const result = nodeToValue(rootObjNode, code);
  return result as EditorDocument;
}
