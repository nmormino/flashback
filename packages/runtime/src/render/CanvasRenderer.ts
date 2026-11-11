import type {
  AnimDocument,
  DisplayElement,
  ID,
  Library,
  BlendMode,
  ShapeElement,
  BitmapElement,
  TextElement,
  Fill,
  VectorPath,
} from '../schema';
import type { DisplayObject } from '../display/DisplayObject';
import { MovieClip } from '../display/MovieClip';
import type { RendererHooks } from '../display/types';
import { filtersToCSS } from './filters';
import { colorTransformToCSS } from './colorTransform';
import { resolveI18nText, resolveInterpolatedText, type TextVariableBinding } from './text';

export interface CanvasRendererOptions {
  /** Used to index element definitions by id, resolve stage dimensions/background, and resolve assets. */
  doc?: AnimDocument;
  width?: number;
  height?: number;
  dpr?: number;
  library?: Library;
  locale?: string;
  /** Override text variable binding. Default: reads/writes the parent clip's `vars`. */
  textBinding?: (obj: DisplayObject) => TextVariableBinding;
}

/**
 * Maps Flash blend mode strings to standard HTML5 Canvas 2D globalCompositeOperation values.
 */
export function blendModeToCompositeOperation(mode: BlendMode | string | undefined): GlobalCompositeOperation {
  if (!mode || mode === 'normal') return 'source-over';
  switch (mode) {
    case 'multiply':
    case 'screen':
    case 'overlay':
    case 'darken':
    case 'lighten':
    case 'color-dodge':
    case 'color-burn':
    case 'hard-light':
    case 'soft-light':
    case 'difference':
    case 'exclusion':
      return mode as GlobalCompositeOperation;
    default:
      return 'source-over';
  }
}

/**
 * Hardware-accelerated Canvas 2D + Path2D renderer for Flashback runtime.
 * Implements dirty-flagged batch rendering, Path2D hardware caching,
 * recursive matrix transformation stacks, and blend mode compositing.
 */
export class CanvasRenderer implements RendererHooks {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D | null;
  public readonly pathCache = new Map<string, Path2D>();
  public width = 0;
  public height = 0;
  public dpr = 1;
  public locale: string;
  public doc?: AnimDocument;
  public library?: Library;
  public isDirty = true;

  private mounted: DisplayObject | null = null;
  private readonly opts: CanvasRendererOptions;
  private readonly imageMap = new Map<string, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement, opts: CanvasRendererOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.ctx = canvas.getContext('2d');
    this.doc = opts.doc;
    this.library = opts.library ?? opts.doc?.library;
    this.locale = opts.locale || opts.doc?.i18n?.defaultLocale || 'en';
    this.dpr = opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

    const initialWidth = opts.width ?? opts.doc?.stage?.width ?? 550;
    const initialHeight = opts.height ?? opts.doc?.stage?.height ?? 400;
    this.resize(initialWidth, initialHeight, this.dpr);
  }

  /**
   * Resizes the canvas with physical DPR scaling and CSS pixel dimensions.
   */
  public resize(width: number, height: number, dpr?: number): void {
    if (dpr !== undefined) {
      this.dpr = dpr;
    }
    this.width = width;
    this.height = height;
    const scale = this.dpr;
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    if (this.canvas.style) {
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
    }
    this.markDirty();
  }

  /**
   * Hardware Path2D Cache: retrieves or creates a cached Path2D for an SVG path string `d`.
   */
  public getPath2D(d: string): Path2D | null {
    if (this.pathCache.has(d)) {
      return this.pathCache.get(d)!;
    }

    const Path2DConstructor =
      typeof Path2D !== 'undefined'
        ? Path2D
        : typeof window !== 'undefined' && (window as any).Path2D
          ? (window as any).Path2D
          : typeof globalThis !== 'undefined' && (globalThis as any).Path2D
            ? (globalThis as any).Path2D
            : null;

    if (Path2DConstructor) {
      try {
        const path = new Path2DConstructor(d);
        this.pathCache.set(d, path);
        return path;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Attaches a root DisplayObject to the renderer.
   */
  public attach(rootObj: DisplayObject): void {
    if (this.mounted) {
      this.detach();
    }
    this.mounted = rootObj;
    if (rootObj instanceof MovieClip) {
      rootObj.vars.__locale = this.locale;
    }
    this.buildSubtree(rootObj);
    this.markDirty();
  }

  /**
   * Detaches the currently mounted root DisplayObject.
   */
  public detach(): void {
    if (!this.mounted) return;
    this.teardown(this.mounted);
    this.mounted = null;
    this.markDirty();
  }

  /**
   * Synchronizes renderer hooks and flags for the given display object.
   */
  public sync(obj: DisplayObject): void {
    if (obj.rendererHooks !== this) {
      this.buildSubtree(obj);
    }
    this.markDirty();
  }

  /**
   * Marks the canvas state dirty, requesting a re-render.
   */
  public markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Renders the scene only if the dirty flag is set. Returns true if a render occurred.
   */
  public renderIfNeeded(): boolean {
    if (!this.isDirty) {
      return false;
    }
    this.render();
    return true;
  }

  /**
   * Sets the active locale and marks the canvas dirty for text re-rendering.
   */
  public setLocale(locale: string): void {
    this.locale = locale;
    if (this.mounted instanceof MovieClip) {
      this.mounted.vars.__locale = locale;
    }
    this.markDirty();
  }

  /**
   * Executes the full Canvas 2D drawing pipeline.
   */
  public render(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.isDirty = false;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Optional stage background fill
    const bg = this.doc?.stage?.background;
    if (bg && bg.type !== 'none') {
      const bgStyle = this.createCanvasStyle(ctx, bg, null);
      if (bgStyle) {
        ctx.fillStyle = bgStyle;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    if (this.mounted) {
      this.renderObject(ctx, this.mounted);
    }

    ctx.restore();
  }

  /**
   * Recursively renders a DisplayObject and its children.
   */
  private renderObject(ctx: CanvasRenderingContext2D, obj: DisplayObject): void {
    if (!obj._visible || obj._alpha <= 0) {
      return;
    }

    // Masks are not directly rendered
    if (obj.layerKind === 'mask') {
      return;
    }

    ctx.save();

    // Mask clipping: if object is constrained by a mask layer
    if (obj.maskLayerId && obj._parent) {
      const maskObj = obj._parent._children.find(
        (c) => c.layerId === obj.maskLayerId && c.layerKind === 'mask'
      );
      if (maskObj && maskObj.currentDef?.type === 'shape') {
        const maskM =
          maskObj.parentLayerMatrix && !maskObj.parentLayerMatrix.isIdentity()
            ? maskObj.parentLayerMatrix.multiply(maskObj.getLocalMatrix())
            : maskObj.getLocalMatrix();
        ctx.transform(maskM.a, maskM.b, maskM.c, maskM.d, maskM.tx, maskM.ty);
        for (const p of maskObj.currentDef.paths) {
          const p2d = this.getPath2D(p.d);
          if (p2d) {
            ctx.clip(p2d, p.fillRule ?? 'nonzero');
          }
        }
        const inv = maskM.invert();
        ctx.transform(inv.a, inv.b, inv.c, inv.d, inv.tx, inv.ty);
      }
    }

    // Effective matrix transformation
    const m =
      obj.parentLayerMatrix && !obj.parentLayerMatrix.isIdentity()
        ? obj.parentLayerMatrix.multiply(obj.getLocalMatrix())
        : obj.getLocalMatrix();
    const cleanZero = (n: number) => (n === 0 ? 0 : n);
    ctx.transform(
      cleanZero(m.a),
      cleanZero(m.b),
      cleanZero(m.c),
      cleanZero(m.d),
      cleanZero(m.tx),
      cleanZero(m.ty)
    );

    // Alpha compounding
    ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * obj._alpha));

    // Blend mode
    if (obj._blendMode && obj._blendMode !== 'normal') {
      ctx.globalCompositeOperation = blendModeToCompositeOperation(obj._blendMode);
    }

    // Filters and ColorTransform
    if (obj._filters && obj._filters.length > 0) {
      const fCss = filtersToCSS(obj._filters);
      if (fCss && 'filter' in ctx) {
        ctx.filter = fCss;
      }
    }
    if (obj._colorTransform && obj._colorTransform.mode !== 'none') {
      const ctCss = colorTransformToCSS(obj._colorTransform);
      if (ctCss && 'filter' in ctx) {
        ctx.filter = ctx.filter && ctx.filter !== 'none' ? `${ctx.filter} ${ctCss}` : ctCss;
      }
    }

    // Render DisplayElement definition if present
    const def = obj.currentDef;
    if (def) {
      switch (def.type) {
        case 'shape':
          this.renderShape(ctx, def, obj);
          break;
        case 'bitmap':
          this.renderBitmap(ctx, def, obj);
          break;
        case 'text':
          this.renderText(ctx, def, obj);
          break;
      }
    }

    // Recursively render children
    if (obj instanceof MovieClip && obj._children && obj._children.length > 0) {
      for (const child of obj._children) {
        this.renderObject(ctx, child);
      }
    }

    ctx.restore();
  }

  /**
   * Renders a shape element with fill and stroke styling.
   */
  private renderShape(ctx: CanvasRenderingContext2D, def: ShapeElement, obj: DisplayObject): void {
    if (!def.paths || def.paths.length === 0) return;

    for (const p of def.paths) {
      if (!p.d) continue;
      const cachedPath = this.getPath2D(p.d);

      // Fill
      if (p.fill && p.fill.type !== 'none') {
        const style = this.createCanvasStyle(ctx, p.fill, obj);
        if (style) {
          ctx.fillStyle = style;
          if (cachedPath) {
            ctx.fill(cachedPath, p.fillRule ?? 'nonzero');
          } else {
            (ctx as any).fill(p.fillRule ?? 'nonzero');
          }
        }
      }

      // Stroke
      if (p.stroke && p.stroke.width > 0) {
        const style = this.createCanvasStyle(ctx, p.stroke.fill, obj) ?? (p.stroke.fill as any)?.color ?? '#000000';
        if (style) {
          ctx.strokeStyle = style;
          ctx.lineWidth = p.stroke.width;
          ctx.lineCap = p.stroke.cap;
          ctx.lineJoin = p.stroke.join;
          if ('miterLimit' in ctx) {
            ctx.miterLimit = 10;
          }
          if (p.stroke.dash && p.stroke.dash.length > 0) {
            ctx.setLineDash(p.stroke.dash);
          } else {
            ctx.setLineDash([]);
          }

          if (cachedPath) {
            ctx.stroke(cachedPath);
          } else {
            ctx.stroke();
          }
        }
      }
    }
  }

  /**
   * Renders a bitmap element using drawImage.
   */
  private renderBitmap(ctx: CanvasRenderingContext2D, el: BitmapElement, _obj: DisplayObject): void {
    const asset = this.library?.bitmaps?.[el.bitmapId];
    const src = el.src ?? asset?.src;
    if (!src) return;

    let img = this.imageMap.get(src);
    if (!img) {
      if (typeof Image !== 'undefined') {
        img = new Image();
        img.src = src;
        img.onload = () => this.markDirty();
        this.imageMap.set(src, img);
      }
    }

    if (img) {
      if (asset?.smoothing !== undefined && 'imageSmoothingEnabled' in ctx) {
        ctx.imageSmoothingEnabled = asset.smoothing;
      }
      const w = el.width ?? asset?.width ?? (img.width || (img as any).naturalWidth);
      const h = el.height ?? asset?.height ?? (img.height || (img as any).naturalHeight);
      if (w !== undefined && h !== undefined && w > 0 && h > 0) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.drawImage(img, 0, 0);
      }
    }
  }

  /**
   * Renders a text element supporting font, size, weight, letter spacing, alignment, and fill/stroke.
   */
  private renderText(ctx: CanvasRenderingContext2D, el: TextElement, obj: DisplayObject): void {
    const textVal = this.resolveTextValue(el, obj);
    if (!textVal && (!el.spans || el.spans.length === 0)) return;

    const fontStyle = el.fontStyle || 'normal';
    const fontWeight = el.fontWeight || 'normal';
    const fontSize = el.fontSize || 16;
    const fontFamily = el.fontId || 'sans-serif';

    ctx.font = `${fontStyle !== 'normal' ? fontStyle + ' ' : ''}${fontWeight !== 'normal' ? fontWeight + ' ' : ''}${fontSize}px ${fontFamily}`;

    if (el.letterSpacing !== undefined && 'letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${el.letterSpacing}px`;
    }

    if (el.align === 'center') {
      ctx.textAlign = 'center';
    } else if (el.align === 'right') {
      ctx.textAlign = 'right';
    } else {
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'top';

    let textX = 0;
    if (el.align === 'center' && el.width) {
      textX = el.width / 2;
    } else if (el.align === 'right' && el.width) {
      textX = el.width;
    }
    const textY = 0;

    const fillStyle = el.fill ? this.createCanvasStyle(ctx, el.fill, obj) : (el.color || '#000000');
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
    }

    if (el.stroke) {
      const strokeStyle =
        this.createCanvasStyle(ctx, el.stroke.fill, obj) ?? (el.stroke.fill as any)?.color ?? '#000000';
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = el.stroke.width;
      ctx.lineCap = el.stroke.cap;
      ctx.lineJoin = el.stroke.join;
      if (!el.spans || el.spans.length === 0) {
        ctx.strokeText(textVal, textX, textY);
      }
    }

    if (el.spans && el.spans.length > 0) {
      let currX = textX;
      for (const span of el.spans) {
        const sStyle = span.fontStyle || fontStyle;
        const sWeight = span.fontWeight || fontWeight;
        const sSize = span.fontSize || fontSize;
        const sFamily = span.fontId || fontFamily;
        ctx.font = `${sStyle !== 'normal' ? sStyle + ' ' : ''}${sWeight !== 'normal' ? sWeight + ' ' : ''}${sSize}px ${sFamily}`;
        if (span.letterSpacing !== undefined && 'letterSpacing' in ctx) {
          (ctx as any).letterSpacing = `${span.letterSpacing}px`;
        }
        const spanFill = span.fill ? this.createCanvasStyle(ctx, span.fill, obj) : (span.color || fillStyle);
        if (spanFill) ctx.fillStyle = spanFill;
        ctx.fillText(span.text, currX, textY + (span.offsetY || 0));
        currX +=
          (ctx.measureText(span.text).width || span.text.length * (sSize * 0.6)) +
          (span.letterSpacing || el.letterSpacing || 0);
      }
    } else {
      if (el.multiline && textVal.includes('\n')) {
        const lines = textVal.split('\n');
        const lineHeight = el.lineHeight ?? fontSize * 1.2;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], textX, textY + i * lineHeight);
        }
      } else {
        ctx.fillText(textVal, textX, textY);
      }
    }
  }

  /**
   * Resolves the rendered string value for text elements from i18n, variables, or state bindings.
   */
  private resolveTextValue(def: TextElement, obj: DisplayObject): string {
    const rootState = this.mounted instanceof MovieClip ? this.mounted.state : undefined;
    let textVal: string | undefined;

    if (def.i18nKey) {
      textVal = resolveI18nText(this.doc, this.locale, def.i18nKey);
    }
    if (textVal === undefined && def.stateBinding && rootState && rootState[def.stateBinding] !== undefined) {
      textVal = String(rootState[def.stateBinding]);
    }
    if (textVal === undefined && def.variable && rootState && rootState[def.variable] !== undefined) {
      textVal = String(rootState[def.variable]);
    }
    if (textVal === undefined && def.variable) {
      const v = this.bindingFor(obj).get(def.variable);
      if (v !== undefined) textVal = String(v);
    }
    if (textVal === undefined && def.text && def.text.includes('{')) {
      textVal = resolveInterpolatedText(def.text, rootState, this.bindingFor(obj));
    }
    if (textVal === undefined) {
      textVal = def.text ?? '';
    }
    return textVal;
  }

  /**
   * Helper to resolve variable binding for an element from its parent MovieClip.
   */
  private bindingFor(obj: DisplayObject): TextVariableBinding {
    if (this.opts.textBinding) return this.opts.textBinding(obj);
    const clip = obj._parent;
    return {
      get: (n) => clip?.vars[n],
      set: (n, v) => {
        if (clip) clip.vars[n] = v;
      },
    };
  }

  /**
   * Converts a Fill into a Canvas 2D style (color, CanvasGradient, or CanvasPattern).
   */
  private createCanvasStyle(
    ctx: CanvasRenderingContext2D,
    fill: Fill | undefined,
    obj: DisplayObject | null
  ): string | CanvasGradient | CanvasPattern | null {
    if (!fill || fill.type === 'none') return null;

    switch (fill.type) {
      case 'solid':
        return fill.color;

      case 'linearGradient': {
        const w = obj && obj._width > 0 ? obj._width : this.width || 100;
        const h = obj && obj._height > 0 ? obj._height : this.height || 100;
        const rad = (fill.angle * Math.PI) / 180;
        const dx = Math.cos(rad) / 2;
        const dy = Math.sin(rad) / 2;
        const x0 = (0.5 - dx) * w;
        const y0 = (0.5 - dy) * h;
        const x1 = (0.5 + dx) * w;
        const y1 = (0.5 + dy) * h;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        if (fill.stops) {
          for (const s of fill.stops) {
            grad.addColorStop(s.offset, s.color);
          }
        }
        return grad;
      }

      case 'radialGradient': {
        const w = obj && obj._width > 0 ? obj._width : this.width || 100;
        const h = obj && obj._height > 0 ? obj._height : this.height || 100;
        const maxDim = Math.max(w, h);
        const cx = fill.cx <= 1 && w > 1 ? fill.cx * w : fill.cx;
        const cy = fill.cy <= 1 && h > 1 ? fill.cy * h : fill.cy;
        const r = fill.r <= 1 && maxDim > 1 ? fill.r * maxDim : fill.r;
        const fx =
          fill.focalX !== undefined ? (fill.focalX <= 1 && w > 1 ? fill.focalX * w : fill.focalX) : cx;
        const fy =
          fill.focalY !== undefined ? (fill.focalY <= 1 && h > 1 ? fill.focalY * h : fill.focalY) : cy;
        const grad = ctx.createRadialGradient(fx, fy, 0, cx, cy, r);
        if (fill.stops) {
          for (const s of fill.stops) {
            grad.addColorStop(s.offset, s.color);
          }
        }
        return grad;
      }

      case 'bitmap': {
        const asset = this.library?.bitmaps?.[fill.bitmapId];
        if (asset) {
          let img = this.imageMap.get(asset.src);
          if (!img && typeof Image !== 'undefined') {
            img = new Image();
            img.src = asset.src;
            img.onload = () => this.markDirty();
            this.imageMap.set(asset.src, img);
          }
          if (img) {
            try {
              return ctx.createPattern(img, fill.repeat ? 'repeat' : 'no-repeat');
            } catch {
              return null;
            }
          }
        }
        return null;
      }

      default:
        return null;
    }
  }

  // ---- Tree Traversal & Hooks ----------------------------------------------

  private buildSubtree(obj: DisplayObject): void {
    obj.rendererHooks = this;
    if (obj instanceof MovieClip && obj._children) {
      for (const child of obj._children) {
        this.buildSubtree(child);
      }
    }
  }

  private teardown(obj: DisplayObject): void {
    if (obj.rendererHooks === this) {
      obj.rendererHooks = undefined;
    }
    if (obj instanceof MovieClip && obj._children) {
      for (const child of obj._children) {
        this.teardown(child);
      }
    }
  }

  public onTransformChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onAlphaChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onVisibleChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onFiltersChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onColorTransformChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onDefChange(_target: DisplayObject): void {
    this.markDirty();
  }

  public onChildAdded(_parent: DisplayObject, child: DisplayObject): void {
    this.buildSubtree(child);
    this.markDirty();
  }

  public onChildRemoved(_parent: DisplayObject, child: DisplayObject): void {
    this.teardown(child);
    this.markDirty();
  }

  public onDestroy(target: DisplayObject): void {
    if (target === this.mounted) {
      this.detach();
    } else {
      this.teardown(target);
      this.markDirty();
    }
  }
}
