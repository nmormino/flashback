import type {
  DisplayObjectAPI,
  MovieClipAPI,
  MovieClipContext,
  InstanceName,
} from '../schema';
import type { DisplayObject } from './DisplayObject';
import type { MovieClip } from './MovieClip';

export const RESERVED_API_KEYS = new Set<string>([
  // Identification & Hierarchy
  'name',
  'parent',
  'root',
  'stage',
  'element',
  'context',

  // Transforms & Visual
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'alpha',
  'visible',
  'width',
  'height',
  'filters',
  'colorTransform',
  'blendMode',
  'mouseX',
  'mouseY',

  // Geometry & Hit Testing
  'getBounds',
  'localToGlobal',
  'globalToLocal',
  'hitTest',

  // Events
  'on',
  'off',
  'emit',

  // Playhead (MovieClip)
  'play',
  'stop',
  'gotoAndPlay',
  'gotoAndStop',
  'nextFrame',
  'prevFrame',
  'currentFrame',
  'totalFrames',
  'currentLabel',
  'isPlaying',

  // Display List Traversal & Modification
  'getChild',
  'getChildByPath',
  'children',
  'numChildren',
  'addChild',
  'removeChild',
  'attachMovie',
  'duplicateMovieClip',
  'removeMovieClip',
  'swapDepths',
  'getNextHighestDepth',

  // Interaction & Flags
  'startDrag',
  'stopDrag',
  'buttonMode',
  'enabled',

  // Audio
  'playSound',
  'stopAllSounds',

  // Timers
  'setTimeout',
  'setInterval',
  'clearTimer',
  'clearAllTimers',

  // Variables & Internals
  'vars',
  'destroy',
  '_parent',
  '_root',
]);

const READONLY_API_PROPERTIES = new Set<string>([
  'parent',
  'root',
  'stage',
  'element',
  'context',
  'mouseX',
  'mouseY',
  'currentFrame',
  'totalFrames',
  'currentLabel',
  'isPlaying',
  'children',
  'numChildren',
  'vars',
]);

/**
 * Creates the Proxy wrapper around a DisplayObject or MovieClip.
 *
 * Proxy resolution order:
 * 1. Built-in JS symbols and reflection
 * 2. Flash / Flashback Engine API members (methods and properties)
 * 3. Flash legacy property aliases (_x, _y, _rotation, _alpha, _parent, _root, ...)
 * 4. Custom behavior methods (from SymbolDef.behavior.methods)
 * 5. Active child instances by instanceName
 * 6. Timeline-scoped variables (target.vars)
 * 7. Prototype fallback
 */
export function createContextProxy<T extends MovieClip = MovieClip>(target: T): MovieClipContext {
  const handler: ProxyHandler<T> = {
    get(t: T, prop: string | symbol, receiver: any): any {
      // 1. Built-in JS symbols & prototype inspection
      if (typeof prop === 'symbol') {
        return Reflect.get(t, prop, receiver);
      }

      if (prop === 'toJSON') {
        return () => ({
          name: t.name,
          currentFrame: (t as any).currentFrame,
          x: t.x,
          y: t.y,
        });
      }

      if (prop === 'constructor' || prop === 'toString' || prop === 'valueOf') {
        const val = Reflect.get(t, prop, receiver);
        return typeof val === 'function' ? val.bind(t) : val;
      }

      // 2. Engine API Members
      if (RESERVED_API_KEYS.has(prop)) {
        if (prop === 'parent' || prop === '_parent') {
          return t.parent; // DisplayObject.parent returns MovieClipContext | null
        }
        if (prop === 'root' || prop === '_root') {
          return t.root; // DisplayObject.root returns MovieClipContext
        }
        if (prop === 'context') {
          return receiver;
        }

        const member = (t as any)[prop];
        if (typeof member === 'function') {
          return member.bind(t);
        }
        return member;
      }

      // 3. Flash Legacy Aliases
      switch (prop) {
        case '_x':
          return t.x;
        case '_y':
          return t.y;
        case '_xscale':
          return t.scaleX * 100;
        case '_yscale':
          return t.scaleY * 100;
        case '_rotation':
          return t.rotation;
        case '_alpha':
          return t.alpha * 100;
        case '_visible':
          return t.visible;
        case '_name':
          return t.name;
        case '_currentframe':
          return (t as any).currentFrame ?? 1;
        case '_totalframes':
          return (t as any).totalFrames ?? 1;
        case '_xmouse':
          return t.mouseX;
        case '_ymouse':
          return t.mouseY;
        case '_width':
          return t.width;
        case '_height':
          return t.height;
      }

      // 4. Custom Behavior Methods
      if (t.behavior?.methods && prop in t.behavior.methods) {
        const method = t.behavior.methods[prop];
        if (typeof method === 'function') {
          return method.bind(t.context);
        }
      }

      // 5. Active Child Instances by instanceName
      const child = (t as any).getChildRaw ? (t as any).getChildRaw(prop) : null;
      if (child) {
        return child.context;
      }

      // 6. Timeline-scoped variables (target.vars)
      if (t.vars && prop in t.vars) {
        return t.vars[prop];
      }

      // 7. Fallback
      return Reflect.get(t, prop, receiver);
    },

    set(t: T, prop: string | symbol, value: any, receiver: any): boolean {
      if (typeof prop === 'symbol') {
        return Reflect.set(t, prop, value, receiver);
      }

      // Flash legacy aliases
      switch (prop) {
        case '_x':
          t.x = Number(value);
          return true;
        case '_y':
          t.y = Number(value);
          return true;
        case '_xscale':
          t.scaleX = Number(value) / 100;
          return true;
        case '_yscale':
          t.scaleY = Number(value) / 100;
          return true;
        case '_rotation':
          t.rotation = Number(value);
          return true;
        case '_alpha':
          t.alpha = Number(value) / 100;
          return true;
        case '_visible':
          t.visible = Boolean(value);
          return true;
        case '_name':
          t.name = String(value);
          return true;
        case '_width':
          t.width = Number(value);
          return true;
        case '_height':
          t.height = Number(value);
          return true;
      }

      // Engine API setters
      if (RESERVED_API_KEYS.has(prop)) {
        if (READONLY_API_PROPERTIES.has(prop)) {
          // Read-only properties cannot be overwritten
          return true;
        }
        (t as any)[prop] = value;
        return true;
      }

      // Dynamic text binding check: if child exists and is a text element or has text property
      const child = (t as any).getChildRaw ? (t as any).getChildRaw(prop) : null;
      if (child && 'text' in child) {
        (child as any).text = String(value);
      }

      // Store in timeline-scoped variables
      if (!t.vars) {
        (t as any).vars = {};
      }
      t.vars[prop] = value;
      return true;
    },

    has(t: T, prop: string | symbol): boolean {
      if (typeof prop === 'symbol') {
        return Reflect.has(t, prop);
      }

      if (RESERVED_API_KEYS.has(prop)) return true;
      if (prop.startsWith('_')) return true;
      if (t.behavior?.methods && prop in t.behavior.methods) return true;
      if ((t as any).getChildRaw && (t as any).getChildRaw(prop)) return true;
      if (t.vars && prop in t.vars) return true;

      return Reflect.has(t, prop);
    },

    deleteProperty(t: T, prop: string | symbol): boolean {
      if (typeof prop === 'string' && t.vars && prop in t.vars) {
        delete t.vars[prop];
        return true;
      }
      return Reflect.deleteProperty(t, prop);
    },
  };

  return new Proxy(target, handler) as unknown as MovieClipContext;
}
