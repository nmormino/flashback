import type { AnimDocument, DisplayElement, ID, Library, TimelineDef, TextElement, BlendMode, ShapeElement, AnimPointerEvent } from '../schema';
import type { DisplayObject } from '../display/DisplayObject';
import { MovieClip } from '../display/MovieClip';
import type { RendererHooks } from '../display/types';
import { Matrix2D } from '../math/Matrix2D';
import { cleanNumber } from '../player/easing';
import { SVG_NS, createIdScope, type IdScope } from './fills';
import { filtersToCSS } from './filters';
import { colorTransformToCSS, colorTransformToSVGFilter } from './colorTransform';
import { renderShape } from './shape';
import { renderBitmap } from './bitmap';
import { renderVideo } from './video';
import { renderText, setTextContent, resolveI18nText, type TextVariableBinding } from './text';

export interface DomRendererOptions {
  /** Used to index element definitions by id (shapes/text/bitmaps) and resolve assets. */
  doc?: AnimDocument;
  library?: Library;
  locale?: string;
  /** Custom resolver for element defs (takes precedence over the doc index). */
  resolveElement?: (id: ID) => DisplayElement | undefined;
  /** Override text variable binding. Default: reads/writes the parent clip's `vars`. */
  textBinding?: (obj: DisplayObject) => TextVariableBinding;
}

interface NodeRecord {
  wrapper: HTMLElement;
  def?: DisplayElement;
  ctFilterId?: string;
}

export function blendModeToCSS(mode: BlendMode | undefined): string {
  return !mode || mode === 'normal' ? '' : mode;
}

/**
 * DOM renderer: maintains one absolutely-positioned wrapper per DisplayObject,
 * tagged with `data-el-id`. Never reads layout.
 */
export class DomRenderer implements RendererHooks {
  public readonly root: ShadowRoot | Element;
  public readonly scope: IdScope;
  public locale: string;
  private readonly doc: Document;
  private readonly library?: Library;
  private readonly opts: DomRendererOptions;
  private readonly index = new Map<ID, DisplayElement>();
  private readonly nodes = new Map<DisplayObject, NodeRecord>();
  private readonly defs: SVGDefsElement;
  private readonly defsHost: SVGSVGElement;
  private mounted: DisplayObject | null = null;

  constructor(root: ShadowRoot | Element, opts: DomRendererOptions = {}) {
    this.root = root;
    this.opts = opts;
    this.locale = opts.locale || opts.doc?.i18n?.defaultLocale || 'en';
    this.doc = (root as Node).ownerDocument ?? document;
    this.library = opts.library ?? opts.doc?.library;
    this.scope = createIdScope();

    this.defsHost = this.doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.defsHost.setAttribute('width', '0');
    this.defsHost.setAttribute('height', '0');
    this.defsHost.setAttribute('aria-hidden', 'true');
    this.defsHost.style.position = 'absolute';
    this.defs = this.doc.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
    this.defsHost.appendChild(this.defs);
    root.appendChild(this.defsHost);

    if (opts.doc) this.indexDocument(opts.doc);
  }

  private indexDocument(doc: AnimDocument): void {
    const walk = (tl: TimelineDef) => {
      if (!tl?.layers) return;
      for (const layer of tl.layers) for (const kf of layer.keyframes) for (const el of kf.elements) this.index.set(el.id, el);
    };
    if (doc.root) walk(doc.root);
    if (doc.artboards) {
      for (const ab of doc.artboards) if (ab.root) walk(ab.root);
    }
    if (doc.library?.symbols) {
      for (const sym of Object.values(doc.library.symbols)) if (sym.timeline) walk(sym.timeline);
    }

    const registerMasks = (tl: TimelineDef) => {
      if (!tl?.layers) return;
      for (const layer of tl.layers) {
        if (layer.kind === 'mask') {
          const clipId = `mask_${layer.id}`;
          let clip = this.defs.querySelector(`#${clipId}`) as SVGClipPathElement | null;
          if (!clip) {
            clip = this.doc.createElementNS(SVG_NS, 'clipPath') as SVGClipPathElement;
            clip.setAttribute('id', clipId);
            this.defs.appendChild(clip);
          } else {
            clip.innerHTML = '';
          }
          const firstKf = layer.keyframes[0];
          if (firstKf) {
            for (const el of firstKf.elements) {
              if (el.type === 'shape') {
                const matrix = Matrix2D.fromTransform(el.transform);
                const transformStr = `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.tx} ${matrix.ty})`;
                for (const p of (el as ShapeElement).paths) {
                  const pathEl = this.doc.createElementNS(SVG_NS, 'path');
                  pathEl.setAttribute('data-mask-el-id', el.id);
                  pathEl.setAttribute('transform', transformStr);
                  pathEl.setAttribute('d', p.d);
                  if (p.fillRule) pathEl.setAttribute('fill-rule', p.fillRule);
                  clip.appendChild(pathEl);
                }
              }
            }
          }
        }
      }
    };
    if (doc.root) registerMasks(doc.root);
    if (doc.artboards) {
      for (const ab of doc.artboards) if (ab.root) registerMasks(ab.root);
    }
    if (doc.library?.symbols) {
      for (const sym of Object.values(doc.library.symbols)) if (sym.timeline) registerMasks(sym.timeline);
    }
  }

  /** Mounts a display tree (typically `pipeline.root`) into the root. */
  public attach(rootObj: DisplayObject): HTMLElement {
    if (this.mounted) this.detach();
    this.mounted = rootObj;
    if (rootObj instanceof MovieClip) {
      rootObj.vars.__locale = this.locale;
    }
    const rec = this.ensure(rootObj);
    this.root.appendChild(rec.wrapper);
    this.buildSubtree(rootObj);
    return rec.wrapper;
  }

  public detach(): void {
    if (!this.mounted) return;
    this.teardown(this.mounted);
    this.mounted = null;
  }

  public setLocale(locale: string): void {
    this.locale = locale;
    if (this.mounted instanceof MovieClip) {
      this.mounted.vars.__locale = locale;
    }
    this.syncTextVariables();
  }

  public getNode(obj: DisplayObject): HTMLElement | undefined {
    return this.nodes.get(obj)?.wrapper;
  }

  /** Re-apply all visual state (incl. blendMode, which has no hook). */
  public sync(obj: DisplayObject): void {
    this.onTransformChange(obj);
    this.onAlphaChange(obj);
    this.onVisibleChange(obj);
    this.onColorTransformChange(obj);
    this.applyBlend(obj);
    this.applyMask(obj);
  }

  private applyMask(obj: DisplayObject): void {
    const rec = this.nodes.get(obj);
    if (!rec) return;
    if (obj.layerKind === 'mask') {
      rec.wrapper.style.opacity = '0';
      rec.wrapper.style.pointerEvents = 'none';
    } else if (obj.maskLayerId) {
      rec.wrapper.style.width = '2000px';
      rec.wrapper.style.height = '2000px';
      rec.wrapper.style.clipPath = `url(#mask_${obj.maskLayerId})`;
      const childSvg = rec.wrapper.querySelector('svg');
      if (childSvg) {
        childSvg.setAttribute('clip-path', `url(#mask_${obj.maskLayerId})`);
      }
    } else {
      rec.wrapper.style.clipPath = '';
    }
  }

  /** Push current variable values into bound dynamic/input text fields. */
  public syncTextVariables(): void {
    for (const [obj, rec] of this.nodes) {
      const def = rec.def;
      if (def?.type !== 'text') continue;
      const content = rec.wrapper.firstElementChild as HTMLElement | null;
      if (!content) continue;

      let textVal: string | undefined;
      if (def.i18nKey) {
        textVal = resolveI18nText(this.opts.doc, this.locale, def.i18nKey);
      }
      if (textVal === undefined && def.variable) {
        const v = this.bindingFor(obj).get(def.variable);
        if (v !== undefined) textVal = String(v);
      }
      if (textVal !== undefined) {
        setTextContent(content, def, textVal, this.library);
      }
    }
  }

  // ---- RendererHooks -------------------------------------------------------

  public onTransformChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    const m = (target.parentLayerMatrix && !target.parentLayerMatrix.isIdentity())
      ? target.parentLayerMatrix.multiply(target.getLocalMatrix())
      : target.getLocalMatrix();
    if (rec) {
      let css = m.toCSS();
      const t = target.currentDef?.transform;
      if (t && (t.rotateX || t.rotateY)) {
        const rx = t.rotateX ? cleanNumber(t.rotateX) : 0;
        const ry = t.rotateY ? cleanNumber(t.rotateY) : 0;
        const persp = t.perspective ? cleanNumber(t.perspective) : 800;
        const ox = t.originX ?? 0;
        const oy = t.originY ?? 0;
        if (ox !== 0 || oy !== 0) {
          css = `perspective(${persp}px) ${css} translate(${cleanNumber(ox)}px, ${cleanNumber(oy)}px) rotateX(${rx}deg) rotateY(${ry}deg) translate(${cleanNumber(-ox)}px, ${cleanNumber(-oy)}px)`;
        } else {
          css = `perspective(${persp}px) ${css} rotateX(${rx}deg) rotateY(${ry}deg)`;
        }
      }
      rec.wrapper.style.transform = css;
    }
    if (target.layerKind === 'mask' && target.layerId && target.id) {
      const paths = this.defs.querySelectorAll(`#mask_${target.layerId} [data-mask-el-id="${target.id}"]`);
      const transformStr = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
      for (const p of Array.from(paths)) {
        p.setAttribute('transform', transformStr);
      }
    }
  }

  public onAlphaChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    if (rec) {
      if (target.layerKind === 'mask') {
        rec.wrapper.style.opacity = '0';
      } else {
        rec.wrapper.style.opacity = target._alpha === 1 ? '' : String(target._alpha);
      }
    }
  }

  public onVisibleChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    if (rec) rec.wrapper.style.display = target._visible ? '' : 'none';
  }

  public onFiltersChange(target: DisplayObject): void {
    this.applyFilter(target);
  }

  public onColorTransformChange(target: DisplayObject): void {
    this.applyFilter(target);
  }

  public onDefChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    if (!rec || !target.currentDef) return;
    const prevDef = rec.def;
    rec.def = target.currentDef;

    const symDef = target instanceof MovieClip ? target.symbolDef : undefined;
    const isInteractive =
      (target instanceof MovieClip && (symDef?.kind === 'button' || target.buttonMode)) ||
      Boolean(target.currentDef.events && Object.keys(target.currentDef.events).length > 0) ||
      target.hasEventListeners();

    if (isInteractive) {
      rec.wrapper.style.cursor = 'pointer';
      rec.wrapper.style.pointerEvents = 'auto';
    }

    if (target.currentDef.type === 'shape') {
      if (!prevDef || prevDef.type !== 'shape') {
        rec.wrapper.innerHTML = '';
        rec.wrapper.appendChild(renderShape(this.doc, target.currentDef, this.scope, this.library));
        return;
      }
      if (prevDef.paths === target.currentDef.paths) {
        return;
      }
      // Fast-path in-place SVG <path> update for smooth vector morphing without DOM teardown
      const nextPaths = target.currentDef.paths;
      const svgEl = rec.wrapper.querySelector('svg');
      const pathEls = svgEl ? svgEl.querySelectorAll('path') : null;
      const canPatchInPlace =
        pathEls &&
        pathEls.length === nextPaths.length &&
        nextPaths.every((np, i) => {
          const pp = prevDef.paths[i];
          const fillOk =
            (!np.fill && !pp?.fill) ||
            (np.fill?.type === 'solid' && pp?.fill?.type === 'solid') ||
            np.fill === pp?.fill;
          const strokeOk =
            (!np.stroke && !pp?.stroke) ||
            (np.stroke?.fill.type === 'solid' && pp?.stroke?.fill.type === 'solid') ||
            np.stroke === pp?.stroke;
          return fillOk && strokeOk;
        });

      if (canPatchInPlace && pathEls) {
        for (let i = 0; i < nextPaths.length; i++) {
          const np = nextPaths[i];
          const pp = prevDef.paths[i];
          const pEl = pathEls[i];
          if (np.d !== pp.d) pEl.setAttribute('d', np.d);
          if (np.fill?.type === 'solid' && (pp.fill?.type !== 'solid' || np.fill.color !== pp.fill.color)) {
            pEl.setAttribute('fill', np.fill.color);
          }
          if (np.stroke) {
            if (!pp.stroke || np.stroke.width !== pp.stroke.width) {
              pEl.setAttribute('stroke-width', String(np.stroke.width));
            }
            if (
              np.stroke.fill.type === 'solid' &&
              (pp.stroke?.fill.type !== 'solid' || np.stroke.fill.color !== pp.stroke.fill.color)
            ) {
              pEl.setAttribute('stroke', np.stroke.fill.color);
            }
          }
        }
      } else {
        rec.wrapper.innerHTML = '';
        rec.wrapper.appendChild(renderShape(this.doc, target.currentDef, this.scope, this.library));
      }
    } else if (target.currentDef.type === 'text' && prevDef?.type === 'text') {
      const content = rec.wrapper.firstElementChild as HTMLElement | null;
      if (content) {
        if (target.currentDef.fontSize !== prevDef.fontSize) {
          content.style.fontSize = `${target.currentDef.fontSize}px`;
        }
        if (target.currentDef.color !== prevDef.color) {
          content.style.color = target.currentDef.color;
        }
        if (target.currentDef.letterSpacing !== prevDef.letterSpacing) {
          content.style.letterSpacing =
            target.currentDef.letterSpacing !== undefined ? `${target.currentDef.letterSpacing}px` : '';
        }
        const textPath = content.querySelector('textPath');
        if (textPath && target.currentDef.pathConfig?.startOffset !== prevDef.pathConfig?.startOffset) {
          const off =
            target.currentDef.pathConfig?.startOffset !== undefined
              ? `${target.currentDef.pathConfig.startOffset}%`
              : '0%';
          textPath.setAttribute('startOffset', off);
        }
        if (target.currentDef.pathConfig?.pathData !== prevDef.pathConfig?.pathData) {
          const pathEl = content.querySelector('defs path');
          if (pathEl && target.currentDef.pathConfig?.pathData) {
            pathEl.setAttribute('d', target.currentDef.pathConfig.pathData);
          }
        }
      }
    }
  }

  public onChildAdded(parent: DisplayObject, child: DisplayObject): void {
    const prec = this.nodes.get(parent);
    if (!prec) return;
    this.mountChild(parent, child);
    this.buildSubtree(child);
  }

  public onChildRemoved(_parent: DisplayObject, child: DisplayObject): void {
    this.teardown(child);
  }

  public onDestroy(target: DisplayObject): void {
    this.teardown(target);
  }

  // ---- internals -----------------------------------------------------------

  private buildSubtree(obj: DisplayObject): void {
    obj.rendererHooks = this;
    if (!(obj instanceof MovieClip)) return;
    for (const child of obj._children) {
      child.rendererHooks = this;
      this.mountChild(obj, child);
      this.buildSubtree(child);
    }
  }

  private mountChild(parent: MovieClip | DisplayObject, child: DisplayObject): void {
    const prec = this.nodes.get(parent);
    if (!prec) return;
    const rec = this.ensure(child);
    const depths = (parent as MovieClip)._childDepth;
    const myDepth = depths?.get(child);
    let before: Node | null = null;
    if (myDepth !== undefined && parent instanceof MovieClip) {
      let best = Infinity;
      for (const sib of parent._children) {
        if (sib === child) continue;
        const d = depths.get(sib);
        const sn = this.nodes.get(sib)?.wrapper;
        if (d !== undefined && d > myDepth && d < best && sn && sn.parentNode === prec.wrapper) {
          best = d;
          before = sn;
        }
      }
    }
    if (rec.wrapper.parentNode !== prec.wrapper || rec.wrapper.nextSibling !== before) {
      prec.wrapper.insertBefore(rec.wrapper, before);
    }
  }

  private resolveDef(obj: DisplayObject): DisplayElement | undefined {
    if (obj.currentDef) return obj.currentDef;
    if (!obj.id) return undefined;
    return this.opts.resolveElement?.(obj.id) ?? this.index.get(obj.id);
  }

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

  private createPointerEvent(obj: DisplayObject, native: PointerEvent | MouseEvent): AnimPointerEvent {
    let stageX = (native as MouseEvent).clientX ?? 0;
    let stageY = (native as MouseEvent).clientY ?? 0;
    const rootEl = this.root instanceof Element ? this.root : this.root.host;
    if (rootEl && typeof rootEl.getBoundingClientRect === 'function') {
      const rect = rootEl.getBoundingClientRect();
      stageX -= rect.left;
      stageY -= rect.top;
    }
    const local = obj.globalToLocal({ x: stageX, y: stageY });
    return {
      target: obj.context,
      stageX,
      stageY,
      localX: local.x,
      localY: local.y,
      button: (native as MouseEvent).button ?? 0,
      native: native as PointerEvent,
      stopPropagation: () => native.stopPropagation?.(),
    };
  }

  private ensure(obj: DisplayObject): NodeRecord {
    let rec = this.nodes.get(obj);
    if (rec) return rec;
    const wrapper = this.doc.createElement('div');
    const s = wrapper.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.transformOrigin = '0 0';
    s.willChange = 'transform, opacity';
    if (obj.id) wrapper.setAttribute('data-el-id', obj.id);
    if (obj.name) wrapper.setAttribute('data-name', obj.name);

    let lastEnterTime = 0;
    const handleEnter = (e: any) => {
      const now = Date.now();
      if (now - lastEnterTime < 200) return;
      lastEnterTime = now;
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onRollOver', evt);
    };

    let lastLeaveTime = 0;
    const handleLeave = (e: any) => {
      const now = Date.now();
      if (now - lastLeaveTime < 200) return;
      lastLeaveTime = now;
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onRollOut', evt);
    };

    // Pointer / mouse interactivity
    wrapper.addEventListener('pointerenter', handleEnter);
    wrapper.addEventListener('mouseenter', handleEnter);
    wrapper.addEventListener('pointerleave', handleLeave);
    wrapper.addEventListener('mouseleave', handleLeave);

    wrapper.addEventListener('pointerdown', (e) => {
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onPress', evt);
    });
    wrapper.addEventListener('mousedown', (e) => {
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onPress', evt);
    });

    wrapper.addEventListener('pointerup', (e) => {
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onRelease', evt);
    });
    wrapper.addEventListener('mouseup', (e) => {
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onRelease', evt);
    });

    wrapper.addEventListener('click', (e) => {
      const evt = this.createPointerEvent(obj, e);
      obj.emit('onClick', evt);
    });

    const def = obj instanceof MovieClip ? undefined : this.resolveDef(obj);
    rec = { wrapper, def };
    this.nodes.set(obj, rec);

    const symDef = obj instanceof MovieClip ? obj.symbolDef : undefined;
    const hasElementEvents = Boolean(def?.events && Object.keys(def.events).length > 0);
    const hasListeners = obj.hasEventListeners();
    const isInteractive =
      (obj instanceof MovieClip && (symDef?.kind === 'button' || obj.buttonMode)) ||
      hasElementEvents ||
      hasListeners;

    if (isInteractive) {
      wrapper.style.cursor = 'pointer';
      wrapper.style.pointerEvents = 'auto';
    }

    if (def?.type === 'shape') {
      const svg = renderShape(this.doc, def, this.scope, this.library);
      if (isInteractive) {
        svg.style.cursor = 'pointer';
        svg.style.pointerEvents = 'auto';
        svg.querySelectorAll('path').forEach((p) => {
          (p as SVGElement).style.pointerEvents = 'auto';
          (p as SVGElement).style.cursor = 'pointer';
        });
      }
      wrapper.appendChild(svg);
    } else if (def?.type === 'bitmap') {
      const bm = renderBitmap(this.doc, def, this.library);
      if (isInteractive) {
        bm.style.cursor = 'pointer';
        bm.style.pointerEvents = 'auto';
      }
      wrapper.appendChild(bm);
    } else if (def?.type === 'video') {
      const vid = renderVideo(this.doc, def);
      if (isInteractive) {
        vid.style.cursor = 'pointer';
        vid.style.pointerEvents = 'auto';
      }
      wrapper.appendChild(vid);
    } else if (def?.type === 'text') {
      const txt = this.createText(obj, def);
      if (isInteractive) {
        txt.style.cursor = 'pointer';
        txt.style.pointerEvents = 'auto';
      }
      wrapper.appendChild(txt);
    }
    if (def?.cacheAsBitmap) s.willChange = 'transform';
    if (def?.blendMode) obj._blendMode = def.blendMode;

    obj.element = wrapper;
    this.sync(obj);
    this.applyFilter(obj);
    return rec;
  }

  private createText(obj: DisplayObject, def: TextElement): HTMLElement {
    let localeText: string | undefined;
    if (def.i18nKey) {
      localeText = resolveI18nText(this.opts.doc, this.locale, def.i18nKey);
    }
    return renderText(this.doc, def, {
      library: this.library,
      binding: def.variable ? this.bindingFor(obj) : undefined,
      localeText,
      onChange: (v) => obj.emit('onChange', v),
      onFocus: () => obj.emit('onFocus'),
      onBlur: () => obj.emit('onBlur'),
    });
  }

  private applyBlend(obj: DisplayObject): void {
    const rec = this.nodes.get(obj);
    if (rec) rec.wrapper.style.mixBlendMode = blendModeToCSS(obj._blendMode);
  }

  private applyFilter(obj: DisplayObject): void {
    const rec = this.nodes.get(obj);
    if (!rec) return;
    const ct = obj._colorTransform;
    let ctPart = colorTransformToCSS(ct);
    if (ctPart === null) {
      const url = colorTransformToSVGFilter(ct, this.defs, this.scope, rec.ctFilterId);
      if (url) rec.ctFilterId = url.slice(5, -1);
      ctPart = url ?? '';
    } else {
      this.removeCtFilter(rec);
    }
    const css = [ctPart, filtersToCSS(obj._filters)].filter(Boolean).join(' ');
    rec.wrapper.style.filter = css;
  }

  private removeCtFilter(rec: NodeRecord): void {
    if (!rec.ctFilterId) return;
    for (const f of Array.from(this.defs.children)) if (f.getAttribute('id') === rec.ctFilterId) f.remove();
    rec.ctFilterId = undefined;
  }

  private teardown(obj: DisplayObject): void {
    const rec = this.nodes.get(obj);
    if (!rec) return;
    if (obj instanceof MovieClip) for (const c of obj._children) this.teardown(c);
    this.removeCtFilter(rec);
    rec.wrapper.remove();
    this.nodes.delete(obj);
  }
}
