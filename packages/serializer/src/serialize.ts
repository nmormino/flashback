/**
 * Deterministic emitter: AnimDocument (live functions or `{ __fn }`) → ES module text.
 */
import { normalizeScript } from './script.js';
import { isScriptSource, SerializeError, type EditorDocument } from './types.js';

export interface SerializeOptions {
  /** Wrap in `defineAnimation(...)` with the runtime import. Default false → `export default {...}`. */
  defineAnimation?: boolean;
}

type Kind =
  | 'doc' | 'meta' | 'stage' | 'library' | 'symbol' | 'timeline' | 'layer' | 'keyframe'
  | 'element' | 'transform' | 'behavior' | 'events' | 'methods' | 'idmap' | 'labels'
  | 'folder' | 'tween' | 'sound' | 'audio' | 'font' | 'bitmap' | 'path' | 'stroke'
  | 'colorTransform' | 'variableRange' | 'generic';

/** Canonical key orders. Unknown keys follow, sorted alphabetically. */
const ORDER: Partial<Record<Kind, string[]>> = {
  doc: ['version', 'meta', 'stage', 'library', 'root', 'onInit'],
  meta: ['name', 'author', 'createdAt', 'modifiedAt', 'editorVersion'],
  stage: ['width', 'height', 'fps', 'background', 'scaleMode'],
  library: ['symbols', 'audio', 'fonts', 'bitmaps', 'folders'],
  symbol: ['id', 'name', 'kind', 'linkageId', 'registration', 'behavior', 'timeline'],
  behavior: ['onConstruct', 'methods'],
  timeline: ['frameCount', 'labels', 'layers'],
  layer: ['id', 'name', 'kind', 'visible', 'locked', 'outline', 'filters', 'maskLayerId', 'parentLayerId', 'keyframes'],
  keyframe: ['id', 'index', 'duration', 'label', 'sound', 'tween', 'actions', 'transform', 'elements'],
  element: [
    'id', 'type', 'instanceName', 'symbolId', 'bitmapId', 'transform', 'alpha', 'visible',
    'colorTransform', 'filters', 'blendMode', 'cacheAsBitmap', 'graphicPlayback', 'trackAsMenu',
    'tabIndex', 'paths', 'mode', 'text', 'html', 'fontId', 'fontSize', 'color', 'fill', 'align', 'width',
    'height', 'multiline', 'selectable', 'fontWeight', 'fontStyle', 'textDecoration', 'lineHeight', 'letterSpacing', 'pathConfig', 'variable', 'events',
  ],
  transform: ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'rotateX', 'rotateY', 'perspective', 'originX', 'originY'],
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
  path: ['d', 'fill', 'stroke', 'fillRule'],
  stroke: ['fill', 'width', 'cap', 'join', 'dash'],
  colorTransform: ['mode', 'brightness', 'tint', 'advanced'],
  generic: ['type', 'id', 'name'],
};

/** Child kind for (parentKind, key). Arrays use the element kind. */
function childKind(parent: Kind, key: string): Kind {
  switch (parent) {
    case 'doc':
      return key === 'meta' ? 'meta' : key === 'stage' ? 'stage' : key === 'library' ? 'library' : key === 'root' ? 'timeline' : 'generic';
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
      return key === 'keyframes' ? 'keyframe' : 'generic';
    case 'keyframe':
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

function orderedKeys(obj: Record<string, unknown>, kind: Kind): string[] {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
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
 * Serialize a document to deterministic ES module source. Accepts live
 * functions (method/function expressions only) and editor `{ __fn }` scripts.
 */
export function serialize(doc: EditorDocument | Record<string, unknown>, options: SerializeOptions = {}): string {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new SerializeError('Document must be an object', '');
  }
  const body = emitObject(doc as Record<string, unknown>, 'doc', '', '', new Set());
  if (options.defineAnimation) {
    return `import { defineAnimation } from "@flashback/runtime";\n\nexport default defineAnimation(${body});\n`;
  }
  return `export default ${body};\n`;
}
