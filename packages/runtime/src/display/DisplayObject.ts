import type {
  DisplayObjectAPI,
  MovieClipContext,
  InstanceName,
  Filter,
  ColorTransform,
  BlendMode,
  InstanceEvents,
  StageAPI,
  ID,
} from '../schema';
import { Matrix2D, type Point2D } from '../math/Matrix2D';
import { HeadlessStage, type RendererHooks } from './types';
import { createContextProxy } from './contextProxy';
import type { MovieClip } from './MovieClip';

export class DisplayObject implements DisplayObjectAPI {
  public id?: ID;
  public _name: InstanceName = '';
  public _parent: MovieClip | null = null;
  public _stage: StageAPI | null = null;
  public rendererHooks?: RendererHooks;

  public _x = 0;
  public _y = 0;
  public _scaleX = 1;
  public _scaleY = 1;
  public _rotation = 0;
  public _skewX = 0;
  public _skewY = 0;
  public _originX = 0;
  public _originY = 0;
  public _alpha = 1;
  public _visible = true;
  public _width = 0;
  public _height = 0;
  public _filters: Filter[] = [];
  public _colorTransform: ColorTransform = { mode: 'none' };
  public _blendMode: BlendMode = 'normal';

  protected _element?: HTMLElement | SVGElement;
  protected _context?: MovieClipContext;
  protected _eventListeners = new Map<string, Set<Function>>();

  constructor(name: InstanceName = '') {
    this._name = name;
  }

  public get context(): MovieClipContext {
    if (!this._context) {
      this._context = createContextProxy(this as unknown as MovieClip);
    }
    return this._context;
  }

  public get name(): InstanceName {
    return this._name;
  }

  public set name(val: InstanceName) {
    this._name = val;
  }

  public get parent(): MovieClipContext | null {
    return this._parent ? this._parent.context : null;
  }

  public getRoot(): DisplayObject {
    let curr: DisplayObject = this;
    while (curr._parent) {
      curr = curr._parent;
    }
    return curr;
  }

  public get root(): MovieClipContext {
    return this.getRoot().context;
  }

  public get stage(): StageAPI {
    if (this._stage) return this._stage;
    if (this._parent) return this._parent.stage;
    // Default fallback stage if not yet attached
    this._stage = new HeadlessStage();
    return this._stage;
  }

  public set stage(stage: StageAPI) {
    this._stage = stage;
  }

  // --- Transform properties ---

  public get x(): number {
    return this._x;
  }

  public set x(val: number) {
    this._x = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get y(): number {
    return this._y;
  }

  public set y(val: number) {
    this._y = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get scaleX(): number {
    return this._scaleX;
  }

  public set scaleX(val: number) {
    this._scaleX = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get scaleY(): number {
    return this._scaleY;
  }

  public set scaleY(val: number) {
    this._scaleY = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get rotation(): number {
    return this._rotation;
  }

  public set rotation(val: number) {
    this._rotation = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get skewX(): number {
    return this._skewX;
  }

  public set skewX(val: number) {
    this._skewX = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get skewY(): number {
    return this._skewY;
  }

  public set skewY(val: number) {
    this._skewY = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get originX(): number {
    return this._originX;
  }

  public set originX(val: number) {
    this._originX = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get originY(): number {
    return this._originY;
  }

  public set originY(val: number) {
    this._originY = val;
    this.rendererHooks?.onTransformChange?.(this);
  }

  public get alpha(): number {
    return this._alpha;
  }

  public set alpha(val: number) {
    this._alpha = Math.max(0, Math.min(1, val));
    this.rendererHooks?.onAlphaChange?.(this);
  }

  public get visible(): boolean {
    return this._visible;
  }

  public set visible(val: boolean) {
    this._visible = val;
    this.rendererHooks?.onVisibleChange?.(this);
  }

  public get width(): number {
    if (this._width !== 0) {
      return this._width * Math.abs(this._scaleX);
    }
    return this.getBounds().width;
  }

  public set width(val: number) {
    if (this._width !== 0) {
      this.scaleX = val / this._width;
    } else {
      this._width = val;
    }
  }

  public get height(): number {
    if (this._height !== 0) {
      return this._height * Math.abs(this._scaleY);
    }
    return this.getBounds().height;
  }

  public set height(val: number) {
    if (this._height !== 0) {
      this.scaleY = val / this._height;
    } else {
      this._height = val;
    }
  }

  public get filters(): Filter[] {
    return this._filters;
  }

  public set filters(val: Filter[]) {
    this._filters = val;
    this.rendererHooks?.onFiltersChange?.(this);
  }

  public get colorTransform(): ColorTransform {
    return this._colorTransform;
  }

  public set colorTransform(val: ColorTransform) {
    this._colorTransform = val;
    this.rendererHooks?.onColorTransformChange?.(this);
  }

  public get blendMode(): BlendMode {
    return this._blendMode;
  }

  public set blendMode(val: BlendMode) {
    this._blendMode = val;
  }

  public get mouseX(): number {
    return this.globalToLocal({ x: this.stage.mouseX, y: this.stage.mouseY }).x;
  }

  public get mouseY(): number {
    return this.globalToLocal({ x: this.stage.mouseX, y: this.stage.mouseY }).y;
  }

  // --- Coordinate Matrices & Mapping ---

  public getLocalMatrix(): Matrix2D {
    return Matrix2D.fromTransform({
      x: this._x,
      y: this._y,
      scaleX: this._scaleX,
      scaleY: this._scaleY,
      rotation: this._rotation,
      skewX: this._skewX,
      skewY: this._skewY,
      originX: this._originX,
      originY: this._originY,
    });
  }

  public getWorldMatrix(): Matrix2D {
    const local = this.getLocalMatrix();
    if (this._parent) {
      return this._parent.getWorldMatrix().multiply(local);
    }
    return local;
  }

  public localToGlobal(p: Point2D): Point2D {
    return this.getWorldMatrix().transformPoint(p);
  }

  public globalToLocal(p: Point2D): Point2D {
    return this.getWorldMatrix().inverseTransformPoint(p);
  }

  public getBounds(targetSpace?: DisplayObjectAPI): { x: number; y: number; width: number; height: number } {
    const w = this._width;
    const h = this._height;

    // Local 4 corners
    const corners: Point2D[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];

    // Transform corners to targetSpace (or global if none specified)
    const worldMatrix = this.getWorldMatrix();
    const targetInvMatrix = targetSpace && 'getWorldMatrix' in targetSpace
      ? (targetSpace as unknown as DisplayObject).getWorldMatrix().invert()
      : Matrix2D.identity();

    const matrix = targetSpace ? targetInvMatrix.multiply(worldMatrix) : worldMatrix;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const c of corners) {
      const pt = matrix.transformPoint(c);
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    if (!Number.isFinite(minX)) {
      minX = this._x;
      maxX = this._x;
      minY = this._y;
      maxY = this._y;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // --- Hit Testing ---

  public hitTest(target: DisplayObjectAPI): boolean;
  public hitTest(x: number, y: number, shapeFlag?: boolean): boolean;
  public hitTest(targetOrX: DisplayObjectAPI | number, y?: number, _shapeFlag?: boolean): boolean {
    if (typeof targetOrX === 'number') {
      const local = this.globalToLocal({ x: targetOrX, y: y ?? 0 });
      const w = this._width;
      const h = this._height;
      return local.x >= 0 && local.x <= w && local.y >= 0 && local.y <= h;
    }

    const b1 = this.getBounds();
    const b2 = targetOrX.getBounds();

    return !(
      b1.x + b1.width < b2.x ||
      b1.x > b2.x + b2.width ||
      b1.y + b1.height < b2.y ||
      b1.y > b2.y + b2.height
    );
  }

  // --- Events ---

  public on<E extends keyof InstanceEvents>(type: E, fn: NonNullable<InstanceEvents[E]>): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(fn);
  }

  public off<E extends keyof InstanceEvents>(type: E, fn?: NonNullable<InstanceEvents[E]>): void {
    if (!fn) {
      this._eventListeners.delete(type);
      return;
    }
    this._eventListeners.get(type)?.delete(fn);
  }

  public emit<E extends keyof InstanceEvents>(type: E, ...args: any[]): void {
    const listeners = this._eventListeners.get(type);
    if (!listeners) return;
    for (const fn of listeners) {
      try {
        fn.call(this.context, ...args);
      } catch (err) {
        console.error(`Error in event listener '${type}':`, err);
      }
    }
  }

  // --- DOM Element hook ---

  public get element(): HTMLElement | SVGElement {
    if (!this._element) {
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        this._element = document.createElement('div');
      } else {
        // Fallback headless mock object
        this._element = { style: {} } as unknown as HTMLElement;
      }
    }
    return this._element;
  }

  public set element(el: HTMLElement | SVGElement) {
    this._element = el;
  }
}
