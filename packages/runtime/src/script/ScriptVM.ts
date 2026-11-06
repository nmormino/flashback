/**
 * ScriptVM: Safe execution sandbox and compiler for Flashback animations.
 * Provides standard browser globals and Flashback runtime APIs to user scripts.
 */
import type { MovieClipContext, DisplayObjectAPI } from '../schema';

export interface ScriptSandboxOptions {
  alert?: (message?: any) => void;
  confirm?: (message?: string) => boolean;
  prompt?: (message?: string, defaultVal?: string) => string | null;
  console?: Console | Partial<Console>;
  customGlobals?: Record<string, any>;
}

export class ScriptVM {
  private static defaultGlobals: Record<string, any> = {
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
  };

  /**
   * Ensures browser globals like `alert` and `confirm` are safely present even in
   * headless/Node test environments so `alert('test')` executes without ReferenceError.
   */
  public static ensureGlobals(): void {
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as any;
      if (typeof g.alert === 'undefined') {
        g.alert = (msg?: any) => {
          if (typeof console !== 'undefined' && console.log) {
            console.log('[ScriptVM alert]:', msg);
          }
        };
      }
      if (typeof g.confirm === 'undefined') {
        g.confirm = () => true;
      }
    }
  }

  /**
   * Builds the sandbox environment object with safe browser globals and Flashback APIs.
   */
  public static createSandbox(
    context: any,
    event?: any,
    options?: ScriptSandboxOptions
  ): Record<string, any> {
    this.ensureGlobals();

    const safeAlert =
      options?.alert ??
      (typeof window !== 'undefined' && window.alert ? window.alert.bind(window) : undefined) ??
      (typeof globalThis !== 'undefined' && (globalThis as any).alert ? (globalThis as any).alert : undefined) ??
      ((msg: any) => console.log('[ScriptVM alert]:', msg));

    const safeConfirm =
      options?.confirm ??
      (typeof window !== 'undefined' && window.confirm ? window.confirm.bind(window) : undefined) ??
      (typeof globalThis !== 'undefined' && (globalThis as any).confirm ? (globalThis as any).confirm : undefined) ??
      (() => true);

    const safeConsole = options?.console ?? (typeof console !== 'undefined' ? console : {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    });

    const safeSetTimeout =
      typeof setTimeout !== 'undefined' ? setTimeout.bind(globalThis) : ((cb: any) => setTimeout(cb, 0));
    const safeClearTimeout =
      typeof clearTimeout !== 'undefined' ? clearTimeout.bind(globalThis) : ((id: any) => clearTimeout(id));
    const safeSetInterval =
      typeof setInterval !== 'undefined' ? setInterval.bind(globalThis) : ((cb: any) => setInterval(cb, 0));
    const safeClearInterval =
      typeof clearInterval !== 'undefined' ? clearInterval.bind(globalThis) : ((id: any) => clearInterval(id));

    const sandboxBase: Record<string, any> = {
      ...this.defaultGlobals,
      alert: safeAlert,
      confirm: safeConfirm,
      console: safeConsole,
      setTimeout: safeSetTimeout,
      clearTimeout: safeClearTimeout,
      setInterval: safeSetInterval,
      clearInterval: safeClearInterval,
      play: (...args: any[]) => (typeof context?.play === 'function' ? context.play(...args) : undefined),
      stop: (...args: any[]) => (typeof context?.stop === 'function' ? context.stop(...args) : undefined),
      gotoAndPlay: (...args: any[]) => (typeof context?.gotoAndPlay === 'function' ? context.gotoAndPlay(...args) : undefined),
      gotoAndStop: (...args: any[]) => (typeof context?.gotoAndStop === 'function' ? context.gotoAndStop(...args) : undefined),
      gotoArtboard: (...args: any[]) => {
        if (typeof context?.gotoArtboard === 'function') {
          return context.gotoArtboard(...args);
        }
        const stage = context?.stage || context?._stage || context?._root?.stage || context?.root?.stage;
        if (typeof stage?.gotoArtboard === 'function') {
          return stage.gotoArtboard(...args);
        }
        return undefined;
      },
      getInstance: (...args: any[]) => (typeof context?.getInstance === 'function' ? context.getInstance(...args) : undefined),
      event,
      e: event,
      this: context,
      ...options?.customGlobals,
    };

    if (!context || typeof context !== 'object') {
      return sandboxBase;
    }

    return new Proxy(context, {
      has(t: any, prop: string | symbol) {
        if (typeof prop === 'string') {
          if (prop === '__scope__' || prop === 'targetThis') return false;
          if (prop in sandboxBase) return true;
          if (prop in t) return true;
          if (typeof t.getChild === 'function' && t.getChild(prop)) return true;
        }
        return Reflect.has(t, prop);
      },
      get(t: any, prop: string | symbol) {
        if (typeof prop === 'string' && prop in sandboxBase) {
          return sandboxBase[prop];
        }
        return Reflect.get(t, prop);
      },
      set(t: any, prop: string | symbol, value: any) {
        if (typeof prop === 'string' && prop in sandboxBase && !(prop in t)) {
          sandboxBase[prop] = value;
          return true;
        }
        return Reflect.set(t, prop, value);
      },
    });
  }

  /**
   * Compiles user script source into an executable function executing inside the sandbox.
   */
  public static compile(source: string, path = ''): Function {
    this.ensureGlobals();
    const trimmed = source.trim();

    // Parse parameters if function/method syntax: e.g. `function(a, b) { ... }` or `add(a, b) { ... }`
    let params: string[] = ['event', 'e'];
    let body = trimmed;

    const methodMatch = trimmed.match(/^([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
    const fnMatch = trimmed.match(/^function\s*(?:[a-zA-Z_$][\w$]*)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);

    if (methodMatch) {
      params = methodMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
      body = methodMatch[3];
    } else if (fnMatch) {
      params = fnMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      body = fnMatch[2];
    } else {
      // Check if body is enclosed in braces: `{ ... }`
      const braceMatch = trimmed.match(/^\{([\s\S]*)\}$/);
      if (braceMatch) {
        body = braceMatch[1];
      }
    }

    try {
      const fnParams = params.length ? params : ['event', 'e'];
      const allParams = ['__scope__', 'targetThis', ...fnParams];
      const runner = new Function(
        ...allParams,
        `with (__scope__) {
          return (function(${fnParams.join(',')}) {
            ${body}
          }).call(targetThis, ${fnParams.join(',')});
        }`
      );

      const compiled = function (this: any, ...args: any[]) {
        const ctx = this || {};
        const evt = args[0];
        const sandbox = ScriptVM.createSandbox(ctx, evt);
        const callArgs = args.length ? args : [evt, evt];
        return runner.call(ctx, sandbox, ctx, ...callArgs);
      };

      (compiled as any).__fn = source;
      return compiled;
    } catch (err: any) {
      throw new Error(
        path
          ? `Failed to compile script at ${path}: ${err.message}`
          : `Failed to compile script: ${err.message}`
      );
    }
  }

  /**
   * Executes a script function or raw code inside the sandbox.
   */
  public static execute(
    fnOrCode: Function | string,
    context: any,
    event?: any,
    options?: ScriptSandboxOptions
  ): any {
    this.ensureGlobals();
    if (typeof fnOrCode === 'string') {
      const compiled = this.compile(fnOrCode);
      return compiled.call(context, event);
    }

    if (typeof fnOrCode === 'function') {
      // If function has already been compiled with ScriptVM, execute directly
      return fnOrCode.call(context, event);
    }

    return undefined;
  }
}
