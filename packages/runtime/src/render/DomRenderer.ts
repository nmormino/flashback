import type { AnimDocument, DisplayElement, ID, Library, TimelineDef, TextElement, BlendMode } from '../schema';
import type { DisplayObject } from '../display/DisplayObject';
import { MovieClip } from '../display/MovieClip';
import type { RendererHooks } from '../display/types';
import { SVG_NS, createIdScope, type IdScope } from './fills';
import { filtersToCSS } from './filters';
import { colorTransformToCSS, colorTransformToSVGFilter } from './colorTransform';
import { renderShape } from './shape';
import { renderBitmap } from './bitmap';
import { renderText, setTextContent, type TextVariableBinding } from './text';

export interface DomRendererOptions {
  /** Used to index element definitions by id (shapes/text/bitmaps) and resolve assets. */
  doc?: AnimDocument;
  library?: Library;
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
    this.doc = (root as Node).ownerDocument ?? document;
    this.library = opts.library ?? opts.doc?.library;
    this.scope = createIdScope();
    if (opts.doc) this.indexDocument(opts.doc);

    this.defsHost = this.doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.defsHost.setAttribute('width', '0');
    this.defsHost.setAttribute('height', '0');
    this.defsHost.setAttribute('aria-hidden', 'true');
    this.defsHost.style.position = 'absolute';
    this.defs = this.doc.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
    this.defsHost.appendChild(this.defs);
    root.appendChild(this.defsHost);
  }

  private indexDocument(doc: AnimDocument): void {
    const walk = (tl: TimelineDef) => {
      if (!tl?.layers) return;
      for (const layer of tl.layers) for (const kf of layer.keyframes) for (const el of kf.elements) this.index.set(el.id, el);
    };
    if (doc.root) walk(doc.root);
    if (doc.library?.symbols) {
      for (const sym of Object.values(doc.library.symbols)) if (sym.timeline) walk(sym.timeline);
    }
  }

  /** Mounts a display tree (typically `pipeline.root`) into the root. */
  public attach(rootObj: DisplayObject): HTMLElement {
    if (this.mounted) this.detach();
    this.mounted = rootObj;
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
  }

  /** Push current variable values into bound dynamic/input text fields. */
  public syncTextVariables(): void {
    for (const [obj, rec] of this.nodes) {
      const def = rec.def;
      if (def?.type !== 'text' || !def.variable) continue;
      const v = this.bindingFor(obj).get(def.variable);
      const content = rec.wrapper.firstElementChild as HTMLElement | null;
      if (content && v !== undefined) setTextContent(content, def, String(v));
    }
  }

  // ---- RendererHooks -------------------------------------------------------

  public onTransformChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    if (rec) rec.wrapper.style.transform = target.getLocalMatrix().toCSS();
  }

  public onAlphaChange(target: DisplayObject): void {
    const rec = this.nodes.get(target);
    if (rec) rec.wrapper.style.opacity = target._alpha === 1 ? '' : String(target._alpha);
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

  private ensure(obj: DisplayObject): NodeRecord {
    let rec = this.nodes.get(obj);
    if (rec) return rec;
    const wrapper = this.doc.createElement('div');
    const s = wrapper.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.transformOrigin = '0 0';
    if (obj.id) wrapper.setAttribute('data-el-id', obj.id);
    if (obj.name) wrapper.setAttribute('data-name', obj.name);

    const def = obj instanceof MovieClip ? undefined : this.resolveDef(obj);
    rec = { wrapper, def };
    this.nodes.set(obj, rec);

    if (def?.type === 'shape') {
      wrapper.appendChild(renderShape(this.doc, def, this.scope, this.library));
    } else if (def?.type === 'bitmap') {
      wrapper.appendChild(renderBitmap(this.doc, def, this.library));
    } else if (def?.type === 'text') {
      wrapper.appendChild(this.createText(obj, def));
    }
    if (def?.cacheAsBitmap) s.willChange = 'transform';
    if (def?.blendMode) obj._blendMode = def.blendMode;

    obj.element = wrapper;
    this.sync(obj);
    this.applyFilter(obj);
    return rec;
  }

  private createText(obj: DisplayObject, def: TextElement): HTMLElement {
    return renderText(this.doc, def, {
      library: this.library,
      binding: def.variable ? this.bindingFor(obj) : undefined,
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
