/**
 * @flashback/runtime — schema.ts
 *
 * THE FILE FORMAT. A Flashback document is a native ES module whose default
 * export satisfies `AnimDocument`. The editor writes it, the runtime imports it.
 *
 *   // my-game.anim.js
 *   export default { version: 1, stage: {...}, library: {...}, root: {...} };
 *
 * Design rules:
 *  1. Everything is plain, JSON-like data EXCEPT `ScriptFn` fields, which are
 *     real JS functions (serialized via Function.prototype.toString()).
 *  2. Everything is referenced by stable string IDs (never array indices) so
 *     the editor can diff/patch and the MCP server can address nodes.
 *  3. Frames are 0-based internally; the API exposes 1-based frames (Flash parity).
 *  4. Layer order: `layers[0]` is the TOP of the stack (Flash timeline order).
 */

/* ========================================================================== *
 * 0. Primitives
 * ========================================================================== */

export type ID = string;
/** Flash-style instance name. Must be a valid JS identifier, unique per timeline frame. */
export type InstanceName = string;
/** Any CSS color string: `#rrggbb`, `#rrggbbaa`, `rgb()`, `oklch()`… */
export type Color = string;
/** 0-based frame index. */
export type FrameIndex = number;

export const SCHEMA_VERSION = 1 as const;

/* ========================================================================== *
 * 1. Document root
 * ========================================================================== */

export interface AnimDocument {
  version: typeof SCHEMA_VERSION;
  meta: DocumentMeta;
  stage: StageDef;
  library: Library;
  /** The main timeline (Flash `_root`). Structurally identical to a MovieClip symbol. */
  root: TimelineDef;
  /** Runs once before frame 1 of root. `this` = root MovieClipAPI. */
  onInit?: ScriptFn<MovieClipContext>;
}

export interface DocumentMeta {
  name: string;
  author?: string;
  createdAt: string; // ISO-8601
  modifiedAt: string;
  editorVersion: string;
}

export interface StageDef {
  width: number;
  height: number;
  fps: number;
  background: Fill;
  scaleMode: 'showAll' | 'noBorder' | 'exactFit' | 'noScale';
}

/* ========================================================================== *
 * 2. Library (assets + symbols)
 * ========================================================================== */

export interface Library {
  symbols: Record<ID, SymbolDef>;
  audio: Record<ID, AudioAsset>;
  fonts: Record<ID, FontAsset>;
  bitmaps: Record<ID, BitmapAsset>;
  /** Purely editorial folder tree for the Library panel. */
  folders?: LibraryFolder[];
}

export interface LibraryFolder {
  id: ID;
  name: string;
  items: ID[];
  children?: LibraryFolder[];
}

export type SymbolKind = 'movieclip' | 'button' | 'graphic';

export interface SymbolDef {
  id: ID;
  name: string;
  kind: SymbolKind;
  /** Registration point, in symbol-local px. */
  registration: { x: number; y: number };
  /**
   * For `button` symbols the runtime treats frames 1–4 as
   * Up / Over / Down / Hit (Flash parity; 0-based indices 0–3). The Hit frame
   * is never rendered — it only defines the pointer hit area. For `graphic`, the timeline is
   * slaved to the parent's playhead and has no scripts/instance API.
   */
  timeline: TimelineDef;
  /** "Export for ActionScript" — enables `this.attachMovie(linkageId, ...)`. */
  linkageId?: string;
  /** Optional class-like behavior, mixed into every instance's API. */
  behavior?: SymbolBehavior;
}

export interface SymbolBehavior {
  /** Runs once per instance on construction. `this` = that instance. */
  onConstruct?: ScriptFn<MovieClipContext>;
  /** Extra methods attached to each instance (`this.jump()`). */
  methods?: Record<string, ScriptFn<MovieClipContext, any[], unknown>>;
}

export interface AudioAsset {
  id: ID;
  name: string;
  src: string; // URL or data: URI
  format: 'mp3' | 'ogg' | 'wav' | 'aac' | 'opus';
  durationMs: number;
  /** Decode eagerly before playback starts (frame-synced 'stream' sounds need this). */
  preload: boolean;
}

export interface FontAsset {
  id: ID;
  family: string;
  src: string;
  format: 'woff2' | 'css';
  weight?: number | `${number} ${number}` | number[]; // e.g. 400, "100 900" for variable, or [400, 700] for multi-weight
  style?: 'normal' | 'italic' | 'all';
  variableRange?: { min: number; max: number; default?: number };
  availableWeights?: number[]; // list of discrete weights if not continuous
  availableStyles?: Array<'normal' | 'italic'>;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  unicodeRange?: string;
}

export interface BitmapAsset {
  id: ID;
  name: string;
  src: string;
  width: number;
  height: number;
  smoothing: boolean;
}

/* ========================================================================== *
 * 3. Timeline → Layers → Keyframes
 * ========================================================================== */

export interface TimelineDef {
  /** Total frames. Must be >= the end of the last keyframe span on any layer. */
  frameCount: number;
  /** Top-most first. */
  layers: LayerDef[];
  /** Named frames → `gotoAndPlay('intro')`. */
  labels?: Record<string, FrameIndex>;
}

export type LayerKind = 'normal' | 'guide' | 'mask' | 'folder';

export interface LayerDef {
  id: ID;
  name: string;
  kind: LayerKind;
  visible: boolean; // editor-only visibility (runtime always renders non-guide layers)
  locked: boolean; // editor-only
  outline?: boolean; // editor-only
  filters?: Filter[];
  /** For layers clipped by a mask layer. */
  maskLayerId?: ID;
  /** For layers inside a folder layer. */
  parentLayerId?: ID;
  /** Sorted by `index`, non-overlapping. Gaps = empty frames. */
  keyframes: KeyframeDef[];
}

export interface KeyframeDef {
  id: ID;
  /** Start frame (0-based). */
  index: FrameIndex;
  /** Span in frames (Flash "frame sequence" length). */
  duration: number;
  /** Continuous timestamp in seconds. */
  time?: number;
  /** Continuous duration in seconds. */
  durationTime?: number;
  /** Display objects present during this span. Array order = z-order (last = top). */
  elements: DisplayElement[];
  /** Tween from this keyframe to the next keyframe on the same layer. */
  tween?: TweenDef;
  /** Frame script. Runs when the playhead ENTERS `index`. `this` = owning MovieClip. */
  actions?: ScriptFn<MovieClipContext>;
  /** Sound attached to the frame. */
  sound?: FrameSound;
  label?: string;
  /** Optional layer/folder-level transform for this keyframe. */
  transform?: Transform;
}

export interface FrameSound {
  audioId: ID;
  /** event: fire & forget · start: like event but no overlap · stop · stream: synced to playhead */
  sync: 'event' | 'start' | 'stop' | 'stream';
  loops: number; // 0 = once, Infinity = forever
  volume: number; // 0–1
  pan?: number; // -1..1
}

/* ----- Tweening (compiled to WAAPI) ------------------------------------- */

export interface TweenDef {
  type: 'motion' | 'shape';
  easing: Easing;
  /** Extra rotation during the tween (Flash "Rotate: CW 2 times"). */
  rotate?: { direction: 'cw' | 'ccw'; turns: number };
  /** Follow a guide layer's path. */
  motionGuide?: { layerId: ID; orientToPath: boolean };
  /** Interpolate these properties only (default: all). */
  properties?: TweenableProperty[];
}

export type TweenableProperty =
  | 'transform'
  | 'alpha'
  | 'colorTransform'
  | 'filters'
  | 'fill'
  | 'path';

export type Easing =
  | { type: 'linear' }
  | { type: 'preset'; name: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' }
  | { type: 'cubic-bezier'; p: [number, number, number, number] }
  | { type: 'steps'; count: number; position: 'start' | 'end' }
  /** CSS `linear()` easing — lets the curve editor export arbitrary curves/springs. */
  | { type: 'linear-points'; points: Array<[value: number, progress: number]> };

/**
 * Runtime-compiled WAAPI track (NOT stored in the file — derived from
 * keyframes + tweens at load). Exposed so tooling/MCP can inspect output.
 */
export interface CompiledTrack {
  elementId: ID;
  keyframes: Keyframe[]; // lib.dom Keyframe: { offset, transform, opacity, filter, easing }
  timing: KeyframeEffectOptions;
}

/* ========================================================================== *
 * 4. Display elements (what sits on a keyframe)
 * ========================================================================== */

export type DisplayElement =
  | SymbolInstance
  | ShapeElement
  | TextElement
  | BitmapElement;

interface ElementBase {
  /**
   * Stable identity ACROSS keyframes. Tweens match elements in consecutive
   * keyframes by `id` — this is how the runtime knows "same object, moved".
   */
  id: ID;
  /** Exposed to scripts as `this.<name>` on the parent MovieClip. */
  instanceName?: InstanceName;
  transform: Transform;
  alpha: number; // 0–1
  visible: boolean;
  /** Editor-only lock flag preventing manipulation when locked. */
  locked?: boolean;
  colorTransform?: ColorTransform;
  filters?: Filter[];
  blendMode?: BlendMode;
  /** Render this element as a bitmap layer (`will-change: transform`). */
  cacheAsBitmap?: boolean;
}

export interface SymbolInstance extends ElementBase {
  type: 'instance';
  symbolId: ID;
  /** Graphic symbols: which inner frame to show & loop mode. */
  graphicPlayback?: { mode: 'loop' | 'playOnce' | 'singleFrame'; firstFrame: FrameIndex };
  /** Instance-level event handlers. `this` = THIS instance (Flash `on(release){}` semantics). */
  events?: InstanceEvents;
  /** Buttons only: track as menu item vs. button. */
  trackAsMenu?: boolean;
  tabIndex?: number;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  /** One or more SVG paths, rendered in order inside an inline <svg>. */
  paths: VectorPath[];
}

export interface VectorPath {
  d: string; // SVG path data
  fill?: Fill;
  stroke?: Stroke;
  fillRule?: 'nonzero' | 'evenodd';
}

export interface TextSpan {
  id?: string;
  text: string;
  fontId?: ID;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  color?: Color;
  fill?: Fill;
  letterSpacing?: number;
  // Continuous character animation offset
  offsetY?: number;
  opacity?: number;
}

export interface TextPathConfig {
  pathId?: ID;
  pathData?: string;
  startOffset?: number; // percentage (0..100) or px along path
  side?: 'left' | 'right';
}

export interface TextElement extends ElementBase {
  type: 'text';
  mode: 'static' | 'dynamic' | 'input';
  text: string; // or sanitized rich HTML subset when `html: true`
  spans?: TextSpan[];
  html?: boolean;
  fontId: ID;
  fontSize: number;
  color: Color;
  /** Fill specification (solid color or linear/radial gradient). */
  fill?: Fill;
  align: 'left' | 'center' | 'right' | 'justify';
  width: number;
  height: number;
  multiline: boolean;
  selectable: boolean;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  lineHeight?: number;
  letterSpacing?: number;
  /** Text aligned to an undulating or arbitrary path. */
  pathConfig?: TextPathConfig;
  /** Dynamic/Input text: bind to a variable on the parent timeline (Flash "Var:"). */
  variable?: string;
  events?: Pick<InstanceEvents, 'onChange' | 'onFocus' | 'onBlur'>;
}

export interface BitmapElement extends ElementBase {
  type: 'bitmap';
  bitmapId: ID;
}

/* ----- Visual properties ------------------------------------------------ */

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  skewX: number; // degrees
  skewY: number; // degrees
  /** 3D Perspective & tilt angles (degrees) */
  rotateX?: number;
  rotateY?: number;
  perspective?: number; // px focal distance (default: 800)
  /** Transform point, element-local px (Flash's white circle). */
  originX: number;
  originY: number;
}

export interface ColorTransform {
  mode: 'none' | 'brightness' | 'tint' | 'advanced';
  brightness?: number; // -1..1
  tint?: { color: Color; amount: number };
  advanced?: { rMul: number; gMul: number; bMul: number; aMul: number; rAdd: number; gAdd: number; bAdd: number; aAdd: number };
}

export type Filter =
  | { type: 'blur'; radius: number } // → CSS blur()
  | { type: 'dropShadow'; x: number; y: number; blur: number; color: Color } // → drop-shadow()
  | { type: 'glow'; blur: number; color: Color; strength: number } // → stacked drop-shadow
  | { type: 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'sepia' | 'invert' | 'opacity'; amount: number }
  | { type: 'hueRotate'; degrees: number };

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'difference' | 'hard-light' | 'color-dodge' | 'color-burn';

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: Color }
  | { type: 'linearGradient'; angle: number; stops: GradientStop[] }
  | { type: 'radialGradient'; cx: number; cy: number; r: number; focalX?: number; focalY?: number; stops: GradientStop[] }
  | { type: 'bitmap'; bitmapId: ID; repeat: boolean };

export interface GradientStop {
  offset: number; // 0–1
  color: Color;
}

export interface Stroke {
  fill: Fill;
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  dash?: number[];
}

/* ========================================================================== *
 * 5. Scripts
 * ========================================================================== */

/**
 * A user-authored function from the Actions Panel. Stored as a REAL function
 * in the module. `this` is bound by the runtime — never call it directly.
 */
export type ScriptFn<TThis = MovieClipContext, TArgs extends unknown[] = [], TReturn = void> =
  (this: TThis, ...args: TArgs) => TReturn;

export interface InstanceEvents {
  // Pointer (Flash: press / release / releaseOutside / rollOver / rollOut / dragOver / dragOut)
  onPress?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onRelease?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onClick?: ScriptFn<MovieClipContext, [AnimPointerEvent]>; // alias of onRelease
  onReleaseOutside?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onRollOver?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onRollOut?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onDragOver?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onDragOut?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  onMouseMove?: ScriptFn<MovieClipContext, [AnimPointerEvent]>;
  // Keyboard (global, delivered to every listening instance)
  onKeyDown?: ScriptFn<MovieClipContext, [AnimKeyEvent]>;
  onKeyUp?: ScriptFn<MovieClipContext, [AnimKeyEvent]>;
  // Lifecycle (Flash onClipEvent)
  onLoad?: ScriptFn<MovieClipContext>;
  onUnload?: ScriptFn<MovieClipContext>;
  /** Every tick at stage fps, even when stopped (Flash onEnterFrame). */
  onEnterFrame?: ScriptFn<MovieClipContext>;
  /** Fires only when the playhead actually advances to a new frame. */
  onFrameEnter?: ScriptFn<MovieClipContext, [frame: number]>;
  // Text
  onChange?: ScriptFn<MovieClipContext, [value: string]>;
  onFocus?: ScriptFn<MovieClipContext>;
  onBlur?: ScriptFn<MovieClipContext>;
}

export type AnimEventType = keyof InstanceEvents extends `on${infer E}` ? Uncapitalize<E> : never;

export interface AnimPointerEvent {
  readonly target: DisplayObjectAPI;
  readonly stageX: number;
  readonly stageY: number;
  readonly localX: number;
  readonly localY: number;
  readonly button: number;
  readonly native: PointerEvent;
  stopPropagation(): void;
}

export interface AnimKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly native: KeyboardEvent;
}

/* ========================================================================== *
 * 6. API CONTEXT — the object bound to `this` in every user script
 * ========================================================================== */

/** Frame reference: 1-based number or a label string (Flash parity). */
export type FrameRef = number | string;

export interface DisplayObjectAPI {
  /** Instance name (`_name`). */
  name: InstanceName;
  readonly parent: MovieClipContext | null; // `_parent`
  readonly root: MovieClipContext; // `_root`
  readonly stage: StageAPI;

  // Transform (`_x`, `_y`, `_xscale`, `_rotation`, `_alpha`, `_visible`…)
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  visible: boolean;
  /** Read-only in Flash spirit; setting rescales. */
  width: number;
  height: number;
  filters: Filter[];
  colorTransform: ColorTransform;
  blendMode: BlendMode;

  readonly mouseX: number; // `_xmouse` local
  readonly mouseY: number;

  getBounds(targetSpace?: DisplayObjectAPI): { x: number; y: number; width: number; height: number };
  localToGlobal(p: { x: number; y: number }): { x: number; y: number };
  globalToLocal(p: { x: number; y: number }): { x: number; y: number };
  hitTest(target: DisplayObjectAPI): boolean;
  hitTest(x: number, y: number, shapeFlag?: boolean): boolean;

  on<E extends keyof InstanceEvents>(type: E, fn: NonNullable<InstanceEvents[E]>): void;
  off<E extends keyof InstanceEvents>(type: E, fn?: NonNullable<InstanceEvents[E]>): void;

  /** Escape hatch for power users. Undocumented in the Actions panel by default. */
  readonly element: HTMLElement | SVGElement;
}

export interface MovieClipAPI extends DisplayObjectAPI {
  // Playhead
  play(): void;
  stop(): void;
  gotoAndPlay(frame: FrameRef): void;
  gotoAndStop(frame: FrameRef): void;
  nextFrame(): void;
  prevFrame(): void;
  readonly currentFrame: number; // 1-based (`_currentframe`)
  readonly totalFrames: number; // `_totalframes`
  readonly currentLabel: string | null;
  readonly isPlaying: boolean;

  // Display list traversal
  getChild<T extends DisplayObjectAPI = MovieClipContext>(name: InstanceName): T | null;
  /** Dot-path lookup: `this.getChildByPath('menu.btnStart')`. Supports `_parent`/`_root`. */
  getChildByPath<T extends DisplayObjectAPI = MovieClipContext>(path: string): T | null;
  readonly children: ReadonlyArray<DisplayObjectAPI>;
  readonly numChildren: number;

  // Dynamic display list (attachMovie / duplicateMovieClip / removeMovieClip)
  attachMovie(linkageId: string, name: InstanceName, depth?: number, init?: Partial<DisplayObjectAPI> & Record<string, unknown>): MovieClipContext;
  duplicateMovieClip(name: InstanceName, depth?: number): MovieClipContext;
  removeMovieClip(): void;
  swapDepths(target: number | DisplayObjectAPI): void;
  getNextHighestDepth(): number;

  // Interaction
  startDrag(lockCenter?: boolean, bounds?: { left: number; top: number; right: number; bottom: number }): void;
  stopDrag(): void;
  buttonMode: boolean;
  enabled: boolean;

  // Audio
  playSound(audioId: ID, opts?: { loops?: number; volume?: number; pan?: number }): SoundHandle;
  stopAllSounds(): void;

  // Timers scoped to this clip (auto-cleared on removeMovieClip / unload)
  setTimeout(fn: ScriptFn<MovieClipContext>, ms: number): number;
  setInterval(fn: ScriptFn<MovieClipContext>, ms: number): number;
  clearTimer(id: number): void;

  /** Timeline-scoped variables (`var score = 0` on a frame lives here). */
  readonly vars: Record<string, unknown>;
}

export interface SoundHandle {
  stop(): void;
  volume: number;
  pan: number;
  readonly position: number; // ms
}

export interface StageAPI {
  readonly width: number;
  readonly height: number;
  fps: number;
  readonly mouseX: number;
  readonly mouseY: number;
  isKeyDown(code: string): boolean; // Flash `Key.isDown`
  readonly global: Record<string, unknown>; // `_global`
}

/**
 * What `this` actually is inside a script. At runtime it's a Proxy: unknown
 * property reads resolve to child instances by instance name, so
 * `this.myButton.play()` and `this.parent.gotoAndStop(5)` both work.
 *
 * `TChildren` lets the editor emit precise typings per symbol (Phase 2:
 * Monaco gets a generated .d.ts so `this.` autocompletes real instance names).
 */
export type MovieClipContext<TChildren extends Record<string, DisplayObjectAPI> = ChildLookup> =
  MovieClipAPI & TChildren;

/** Default (untyped) child lookup — any instance name resolves to a MovieClip. */
export interface ChildLookup {
  [instanceName: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/* ========================================================================== *
 * 7. Helper for authoring files by hand / by AI (gives full type-checking)
 * ========================================================================== */

export function defineAnimation(doc: AnimDocument): AnimDocument {
  return doc;
}
