import type { Fill, GradientStop, Library } from '../schema';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Generates unique ids scoped to one renderer root (avoids collisions across shadow roots). */
export class IdScope {
  private n = 0;
  constructor(public readonly prefix: string) {}
  next(kind: string): string {
    return `${this.prefix}-${kind}-${++this.n}`;
  }
}

let scopeCounter = 0;
export function createIdScope(): IdScope {
  return new IdScope(`fb${(++scopeCounter).toString(36)}`);
}

function stopsInto(doc: Document, grad: Element, stops: GradientStop[]): void {
  for (const s of stops) {
    const st = doc.createElementNS(SVG_NS, 'stop');
    st.setAttribute('offset', String(s.offset));
    st.setAttribute('stop-color', s.color);
    grad.appendChild(st);
  }
}

/**
 * Converts a Fill into an SVG paint value. Gradients/patterns are appended to `defs`
 * with ids generated from `scope`. Returns the value for `fill`/`stroke` attributes.
 */
export function fillToPaint(
  fill: Fill | undefined,
  defs: SVGDefsElement,
  scope: IdScope,
  library?: Library
): string {
  if (!fill || fill.type === 'none') return 'none';
  const doc = defs.ownerDocument;
  switch (fill.type) {
    case 'solid':
      return fill.color;
    case 'linearGradient': {
      const id = scope.next('lg');
      const g = doc.createElementNS(SVG_NS, 'linearGradient');
      g.setAttribute('id', id);
      const rad = (fill.angle * Math.PI) / 180;
      const dx = Math.cos(rad) / 2;
      const dy = Math.sin(rad) / 2;
      g.setAttribute('x1', String(0.5 - dx));
      g.setAttribute('y1', String(0.5 - dy));
      g.setAttribute('x2', String(0.5 + dx));
      g.setAttribute('y2', String(0.5 + dy));
      stopsInto(doc, g, fill.stops);
      defs.appendChild(g);
      return `url(#${id})`;
    }
    case 'radialGradient': {
      const id = scope.next('rg');
      const g = doc.createElementNS(SVG_NS, 'radialGradient');
      g.setAttribute('id', id);
      g.setAttribute('cx', String(fill.cx));
      g.setAttribute('cy', String(fill.cy));
      g.setAttribute('r', String(fill.r));
      if (fill.focalX !== undefined) g.setAttribute('fx', String(fill.focalX));
      if (fill.focalY !== undefined) g.setAttribute('fy', String(fill.focalY));
      stopsInto(doc, g, fill.stops);
      defs.appendChild(g);
      return `url(#${id})`;
    }
    case 'bitmap': {
      const asset = library?.bitmaps?.[fill.bitmapId];
      if (!asset) return 'none';
      const id = scope.next('bp');
      const p = doc.createElementNS(SVG_NS, 'pattern');
      p.setAttribute('id', id);
      p.setAttribute('patternUnits', 'userSpaceOnUse');
      p.setAttribute('width', String(fill.repeat ? asset.width : 1e6));
      p.setAttribute('height', String(fill.repeat ? asset.height : 1e6));
      const img = doc.createElementNS(SVG_NS, 'image');
      img.setAttribute('href', asset.src);
      img.setAttribute('width', String(asset.width));
      img.setAttribute('height', String(asset.height));
      if (!asset.smoothing) img.setAttribute('image-rendering', 'pixelated');
      p.appendChild(img);
      defs.appendChild(p);
      return `url(#${id})`;
    }
  }
}

/** CSS background for a stage Fill (no SVG needed). */
export function fillToCSS(fill: Fill | undefined, library?: Library): string {
  if (!fill || fill.type === 'none') return 'transparent';
  const stops = (s: GradientStop[]) => s.map((x) => `${x.color} ${x.offset * 100}%`).join(', ');
  switch (fill.type) {
    case 'solid':
      return fill.color;
    case 'linearGradient':
      return `linear-gradient(${fill.angle + 90}deg, ${stops(fill.stops)})`;
    case 'radialGradient':
      return `radial-gradient(circle at ${fill.cx * 100}% ${fill.cy * 100}%, ${stops(fill.stops)})`;
    case 'bitmap': {
      const a = library?.bitmaps?.[fill.bitmapId];
      return a ? `url("${a.src}") ${fill.repeat ? 'repeat' : 'no-repeat'}` : 'transparent';
    }
  }
}
