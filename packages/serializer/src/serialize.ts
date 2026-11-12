/**
 * Deterministic emitter: AnimDocument (live functions or `{ __fn }`) → ES module text.
 */
import { normalizeScript } from './script.js';
import { isScriptSource, SerializeError, type EditorDocument } from './types.js';

export interface SerializeOptions {
  /** Wrap in `defineAnimation(...)` with the runtime import. Default false → `export default {...}`. */
  defineAnimation?: boolean;
  /** Output format: 'esm' (default) or 'json' (compact JSON). */
  format?: 'esm' | 'json';
}

type Kind =
  | 'doc' | 'meta' | 'stage' | 'library' | 'symbol' | 'timeline' | 'layer' | 'keyframe'
  | 'element' | 'transform' | 'behavior' | 'events' | 'methods' | 'idmap' | 'labels'
  | 'folder' | 'tween' | 'sound' | 'audio' | 'font' | 'bitmap' | 'path' | 'stroke'
  | 'colorTransform' | 'variableRange' | 'breakpoint' | 'artboard'
  | 'stateMachine' | 'stateInput' | 'stateNode' | 'stateTransition' | 'stateCondition'
  | 'stateListener' | 'stateListenerAction'
  | 'generic';

/** Canonical key orders. Unknown keys follow, sorted alphabetically. */
const ORDER: Partial<Record<Kind, string[]>> = {
  doc: [
    'version',
    'meta',
    'stage',
    'library',
    'artboards',
    'activeArtboardId',
    'stateMachines',
    'activeStateMachineId',
    'root',
    'i18n',
    'onInit',
    'scripts',
  ],
  meta: ['name', 'author', 'createdAt', 'modifiedAt', 'editorVersion'],
  stage: ['width', 'height', 'fps', 'background', 'scaleMode', 'reducedMotion', 'breakpoints'],
  artboard: ['id', 'name', 'width', 'height', 'background', 'breakpoints', 'root'],
  stateMachine: ['id', 'name', 'inputs', 'states', 'transitions', 'listeners'],
  stateInput: ['id', 'name', 'type', 'value'],
  stateNode: [
    'id',
    'name',
    'type',
    'clipName',
    'timelineId',
    'loop',
    'speed',
    'blendInputId',
    'poseInputId',
    'x',
    'y',
  ],
  stateTransition: [
    'id',
    'fromStateId',
    'toStateId',
    'durationMs',
    'easing',
    'exitTime',
    'hasExitTime',
    'conditions',
  ],
  stateCondition: ['inputId', 'op', 'value'],
  stateListener: [
    'id',
    'eventType',
    'targetElementId',
    'collisionWithElementId',
    'keyCode',
    'actions',
  ],
  stateListenerAction: ['type', 'inputId', 'value', 'delta', 'symbolId', 'soundId', 'x', 'y'],
  library: ['symbols', 'audio', 'fonts', 'bitmaps', 'folders'],
  symbol: ['id', 'name', 'kind', 'linkageId', 'registration', 'behavior', 'timeline'],
  behavior: ['onConstruct', 'methods'],
  timeline: ['frameCount', 'labels', 'layers'],
  layer: ['id', 'name', 'kind', 'visible', 'locked', 'outline', 'filters', 'maskLayerId', 'parentLayerId', 'transform', 'keyframes'],
  keyframe: ['id', 'index', 'duration', 'time', 'durationTime', 'label', 'sound', 'tween', 'actions', 'transform', 'elements'],
  element: [
    'id', 'type', 'instanceName', 'symbolId', 'playMode', 'bitmapId', 'src', 'width', 'height', 'autoplay', 'loop', 'muted', 'controls', 'poster',
    'transform', 'alpha', 'visible', 'locked', 'colorTransform', 'filters', 'blendMode', 'cacheAsBitmap',
    'graphicPlayback', 'events', 'trackAsMenu', 'tabIndex', 'paths', 'mode', 'text', 'spans', 'html', 'fontId', 'fontSize',
    'color', 'fill', 'align', 'multiline', 'selectable', 'fontWeight', 'fontStyle', 'textDecoration', 'lineHeight',
    'letterSpacing', 'pathConfig', 'variable', 'i18nKey',
  ],
  transform: ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'rotateX', 'rotateY', 'perspective', 'originX', 'originY', 'pin'],
  events: [
    'onPress', 'onRelease', 'onClick', 'onReleaseOutside', 'onRollOver', 'onRollOut', 'onDragOver',
    'onDragOut', 'onMouseMove', 'onKeyDown', 'onKeyUp', 'onLoad', 'onUnload', 'onEnterFrame',
    'onFrameEnter', 'onChange', 'onFocus', 'onBlur',
  ],
  folder: ['id', 'name', 'items', 'children'],
  tween: ['type', 'easing', 'rotate', 'motionGuide', 'properties'],
  sound: ['audioId', 'sync', 'loops', 'volume', 'pan'],
  audio: ['id', 'name', 'src', 'format', 'durationMs', 'preload'],
  font: [
    'id',
    'family',
    'src',
    'format',
    'weight',
    'style',
    'variableRange',
    'availableWeights',
    'availableStyles',
    'display',
    'unicodeRange',
  ],
  variableRange: ['min', 'max', 'default'],
  bitmap: ['id', 'name', 'src', 'width', 'height', 'smoothing'],
  breakpoint: ['id', 'name', 'maxWidth', 'width', 'height'],
  path: ['d', 'fill', 'stroke', 'fillRule'],
  stroke: ['fill', 'width', 'cap', 'join', 'dash'],
  colorTransform: ['mode', 'brightness', 'tint', 'advanced'],
  generic: ['type', 'id', 'name'],
};

/** Child kind for (parentKind, key). Arrays use the element kind. */
function childKind(parent: Kind, key: string): Kind {
  switch (parent) {
    case 'doc':
      return key === 'meta'
        ? 'meta'
        : key === 'stage'
        ? 'stage'
        : key === 'library'
        ? 'library'
        : key === 'root'
        ? 'timeline'
        : key === 'artboards'
        ? 'artboard'
        : key === 'stateMachines'
        ? 'stateMachine'
        : 'generic';
    case 'stateMachine':
      return key === 'inputs'
        ? 'stateInput'
        : key === 'states'
        ? 'stateNode'
        : key === 'transitions'
        ? 'stateTransition'
        : key === 'listeners'
        ? 'stateListener'
        : 'generic';
    case 'stateTransition':
      return key === 'conditions' ? 'stateCondition' : 'generic';
    case 'stateListener':
      return key === 'actions' ? 'stateListenerAction' : 'generic';
    case 'artboard':
      return key === 'root' ? 'timeline' : key === 'breakpoints' ? 'breakpoint' : 'generic';
    case 'stage':
      return key === 'breakpoints' ? 'breakpoint' : 'generic';
    case 'library':
      if (key === 'symbols' || key === 'audio' || key === 'fonts' || key === 'bitmaps') return 'idmap';
      if (key === 'folders') return 'folder';
      return 'generic';
    case 'symbol':
      return key === 'timeline' ? 'timeline' : key === 'behavior' ? 'behavior' : 'generic';
    case 'behavior':
      return key === 'methods' ? 'methods' : 'generic';
    case 'timeline':
      return key === 'layers' ? 'layer' : key === 'labels' ? 'labels' : 'generic';
    case 'layer':
      if (key === 'transform') return 'transform';
      return key === 'keyframes' ? 'keyframe' : 'generic';
    case 'keyframe':
      if (key === 'transform') return 'transform';
      return key === 'elements' ? 'element' : key === 'tween' ? 'tween' : key === 'sound' ? 'sound' : 'generic';
    case 'element':
      if (key === 'transform') return 'transform';
      if (key === 'events') return 'events';
      if (key === 'paths') return 'path';
      if (key === 'colorTransform') return 'colorTransform';
      return 'generic';
    case 'folder':
      return key === 'children' ? 'folder' : 'generic';
    case 'font':
      return key === 'variableRange' ? 'variableRange' : 'generic';
    case 'path':
      return key === 'stroke' ? 'stroke' : 'generic';
    default:
      return 'generic';
  }
}

const IDMAP_ITEM: Record<string, Kind> = { symbols: 'symbol', audio: 'audio', fonts: 'font', bitmaps: 'bitmap' };

/* ----- Numbers ---------------------------------------------------------- */

const PRECISION: Record<string, number> = {
  x: 4, y: 4, scaleX: 4, scaleY: 4, originX: 4, originY: 4,
  rotation: 2, skewX: 2, skewY: 2, rotateX: 2, rotateY: 2, perspective: 1,
  alpha: 3,
};

export function formatNumber(n: number, key: string | undefined, path: string): string {
  if (Number.isNaN(n)) throw new SerializeError('NaN is not serializable', path);
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  const digits = key !== undefined ? PRECISION[key] : undefined;
  let v = n;
  if (digits !== undefined) {
    const f = 10 ** digits;
    v = Math.round(v * f) / f;
  }
  if (Object.is(v, -0)) v = 0;
  return String(v);
}

/* ----- Emission --------------------------------------------------------- */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const fmtKey = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));
const fmtString = (s: string) =>
  JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const isFn = (v: unknown) => typeof v === 'function' || isScriptSource(v);

function isIdentityTransform(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false;
  const tr = t as Record<string, unknown>;
  return (
    (tr.x === undefined || tr.x === 0) &&
    (tr.y === undefined || tr.y === 0) &&
    (tr.scaleX === undefined || tr.scaleX === 1) &&
    (tr.scaleY === undefined || tr.scaleY === 1) &&
    (tr.rotation === undefined || tr.rotation === 0) &&
    (tr.skewX === undefined || tr.skewX === 0) &&
    (tr.skewY === undefined || tr.skewY === 0) &&
    (tr.rotateX === undefined || tr.rotateX === 0) &&
    (tr.rotateY === undefined || tr.rotateY === 0) &&
    (tr.perspective === undefined || tr.perspective === 0) &&
    (tr.originX === undefined || tr.originX === 0) &&
    (tr.originY === undefined || tr.originY === 0) &&
    (tr.pin === undefined || tr.pin === 'none')
  );
}

function isDefaultProperty(kind: Kind, k: string, v: unknown, obj: Record<string, unknown>): boolean {
  if (kind === 'transform') {
    if ((k === 'scaleX' || k === 'scaleY') && v === 1) return true;
    if (
      (k === 'rotation' ||
        k === 'skewX' ||
        k === 'skewY' ||
        k === 'rotateX' ||
        k === 'rotateY' ||
        k === 'originX' ||
        k === 'originY') &&
      v === 0
    ) {
      return true;
    }
    if (k === 'pin' && v === 'none') return true;
  } else if (kind === 'element') {
    if (k === 'alpha' && v === 1) return true;
    if (k === 'visible' && v === true) return true;
    if (k === 'locked' && v === false) return true;
    if (k === 'blendMode' && v === 'normal') return true;
    if (k === 'playMode' && v === 'loop') return true;
    if (k === 'autoplay' && v === true) return true;
    if (k === 'loop' && v === true) return true;
    if (k === 'filters' && Array.isArray(v) && v.length === 0) return true;
    if (
      k === 'colorTransform' &&
      typeof v === 'object' &&
      v !== null &&
      (v as Record<string, unknown>).mode === 'none'
    ) {
      return true;
    }
  } else if (kind === 'layer') {
    if (k === 'kind' && v === 'normal') return true;
    if (k === 'visible' && v === true) return true;
    if (k === 'locked' && v === false) return true;
    if (k === 'filters' && Array.isArray(v) && v.length === 0) return true;
    if (k === 'transform' && isIdentityTransform(v)) return true;
  } else if (kind === 'keyframe') {
    if (k === 'time' && typeof obj.index === 'number') return true;
    if (k === 'durationTime' && typeof obj.duration === 'number') return true;
    if (k === 'transform' && isIdentityTransform(v)) return true;
  } else if (kind === 'library') {
    if (
      (k === 'symbols' || k === 'audio' || k === 'fonts' || k === 'bitmaps') &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0
    ) {
      return true;
    }
    if (k === 'folders' && Array.isArray(v) && v.length === 0) return true;
  } else if (kind === 'artboard') {
    if (k === 'breakpoints' && Array.isArray(v) && v.length === 0) return true;
  } else if (kind === 'doc') {
    if (k === 'artboards') {
      if (!Array.isArray(v) || v.length === 0) return true;
      if (v.length === 1) {
        const ab = v[0] as Record<string, unknown>;
        const stage = obj.stage as Record<string, unknown> | undefined;
        const isDefault =
          (!ab.name || ab.name === 'Artboard 1' || ab.name === 'Default') &&
          (!stage || (ab.width === stage.width && ab.height === stage.height)) &&
          (!ab.background || !stage || JSON.stringify(ab.background) === JSON.stringify(stage.background)) &&
          (!ab.root || !obj.root || JSON.stringify(ab.root) === JSON.stringify(obj.root));
        if (isDefault) return true;
      }
    }
    if (k === 'activeArtboardId') {
      if (!obj.artboards || isDefaultProperty('doc', 'artboards', obj.artboards, obj)) {
        return true;
      }
    }
  }
  return false;
}

function orderedKeys(obj: Record<string, unknown>, kind: Kind): string[] {
  const keys = Object.keys(obj).filter(
    (k) => obj[k] !== undefined && !isDefaultProperty(kind, k, obj[k], obj)
  );
  if (kind === 'idmap' || kind === 'methods') return keys.sort(cmpStr);
  if (kind === 'labels') {
    return keys.sort((a, b) => (obj[a] as number) - (obj[b] as number) || cmpStr(a, b));
  }
  const order = ORDER[kind] ?? ORDER.generic!;
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return keys.sort((a, b) => rank(a) - rank(b) || cmpStr(a, b));
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emitValue(v: unknown, kind: Kind, key: string | undefined, indent: string, path: string, seen: Set<object>): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
      return fmtString(v);
    case 'number':
      return formatNumber(v, key, path);
    case 'boolean':
      return String(v);
    case 'object':
      break;
    case 'function':
      throw new SerializeError('Function in non-property position', path);
    default:
      throw new SerializeError(`Unsupported value of type ${typeof v}`, path);
  }
  const obj = v as object;
  if (seen.has(obj)) throw new SerializeError('Circular reference', path);
  seen.add(obj);
  try {
    if (Array.isArray(obj)) return emitArray(obj, kind, key, indent, path, seen);
    if (isScriptSource(obj)) throw new SerializeError('Script in non-property position', path);
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      throw new SerializeError('Only plain objects are serializable', path);
    }
    return emitObject(obj as Record<string, unknown>, kind, indent, path, seen);
  } finally {
    seen.delete(obj);
  }
}

function emitArray(arr: unknown[], kind: Kind, key: string | undefined, indent: string, path: string, seen: Set<object>): string {
  if (arr.length === 0) return '[]';
  for (let i = 0; i < arr.length; i++) if (!(i in arr)) throw new SerializeError('Sparse arrays are not serializable', `${path}[${i}]`);
  const flat = arr.every((x) => x === null || ['number', 'string', 'boolean'].includes(typeof x));
  if (flat) {
    // Precision rules don't apply per-index; pass no key.
    return `[${arr.map((x, i) => emitValue(x, 'generic', undefined, indent, `${path}[${i}]`, seen)).join(', ')}]`;
  }
  const inner = indent + '  ';
  const sep = kind === 'layer' ? ',\n\n' : ',\n';
  const items = arr.map((x, i) => {
    if (isFn(x)) throw new SerializeError('Scripts are not allowed inside arrays', `${path}[${i}]`);
    return inner + emitValue(x, kind, undefined, inner, `${path}[${i}]`, seen);
  });
  void key;
  return `[\n${items.join(sep)},\n${indent}]`;
}

function emitObject(obj: Record<string, unknown>, kind: Kind, indent: string, path: string, seen: Set<object>): string {
  const keys = orderedKeys(obj, kind);
  if (keys.length === 0) return '{}';

  const isCompactLeaf =
    kind !== 'doc' &&
    kind !== 'timeline' &&
    kind !== 'layer' &&
    kind !== 'keyframe' &&
    kind !== 'element' &&
    kind !== 'symbol' &&
    kind !== 'library' &&
    kind !== 'idmap' &&
    kind !== 'events' &&
    kind !== 'methods' &&
    kind !== 'behavior' &&
    kind !== 'stateMachine' &&
    keys.length <= 6 &&
    keys.every((k) => {
      const val = obj[k];
      return val === null || ['number', 'string', 'boolean'].includes(typeof val);
    });

  if (isCompactLeaf) {
    const inlineParts = keys.map((k) => {
      const v = obj[k];
      const p = path ? `${path}.${k}` : k;
      const ck = childKind(kind, k);
      return `${fmtKey(k)}: ${emitValue(v, ck, k, indent, p, seen)}`;
    });
    const inlineStr = `{ ${inlineParts.join(', ')} }`;
    if (inlineStr.length <= 100) {
      return inlineStr;
    }
  }

  const inner = indent + '  ';
  const lines = keys.map((k) => {
    const v = obj[k];
    const p = path ? `${path}.${k}` : k;
    if (isFn(v)) {
      const { params, body } = normalizeScript(v, p);
      return `${inner}${fmtKey(k)}(${params}) ${body}`;
    }
    const ck = kind === 'idmap' ? IDMAP_ITEM[path.split('.').pop() ?? ''] ?? 'generic' : childKind(kind, k);
    return `${inner}${fmtKey(k)}: ${emitValue(v, ck, k, inner, p, seen)}`;
  });
  const sep = kind === 'idmap' && path.endsWith('symbols') ? ',\n\n' : ',\n';
  return `{\n${lines.join(sep)},\n${indent}}`;
}

/**
 * Serialize a document to deterministic ES module source (or compact JSON). Accepts live
 * functions (method/function expressions only) and editor `{ __fn }` scripts.
 */
export function serialize(doc: EditorDocument | Record<string, unknown>, options: SerializeOptions = {}): string {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new SerializeError('Document must be an object', '');
  }
  if (options.format === 'json') {
    const prune = (val: unknown, kind: Kind, key?: string, path = ''): unknown => {
      if (val === null || typeof val !== 'object') {
        if (typeof val === 'number') return Number(formatNumber(val, key, path));
        if (typeof val === 'function') {
          const { params, body } = normalizeScript(val, path);
          return { __fn: `function (${params}) ${body}` };
        }
        return val;
      }
      if (Array.isArray(val)) {
        return val.map((item, i) => prune(item, kind, undefined, `${path}[${i}]`));
      }
      const rec = val as Record<string, unknown>;
      if (isScriptSource(rec)) return rec;
      const out: Record<string, unknown> = {};
      for (const k of orderedKeys(rec, kind)) {
        const p = path ? `${path}.${k}` : k;
        const ck = kind === 'idmap' ? IDMAP_ITEM[path.split('.').pop() ?? ''] ?? 'generic' : childKind(kind, k);
        out[k] = prune(rec[k], ck, k, p);
      }
      return out;
    };
    return JSON.stringify(prune(doc, 'doc'), null, 2) + '\n';
  }
  const body = emitObject(doc as Record<string, unknown>, 'doc', '', '', new Set());
  if (options.defineAnimation) {
    return `import { defineAnimation } from "@flashback/runtime";\n\nexport default defineAnimation(${body});\n`;
  }
  return `export default ${body};\n`;
}
