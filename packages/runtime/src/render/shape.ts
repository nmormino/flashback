import type { Library, ShapeElement, VectorPath } from '../schema';
import { SVG_NS, fillToPaint, type IdScope } from './fills';

/** Builds an inline <svg> (overflow visible, 0x0 box) containing the shape's paths. */
export function createShapeSVG(
  doc: Document,
  paths: readonly VectorPath[],
  scope: IdScope,
  library?: Library
): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1');
  svg.setAttribute('overflow', 'visible');
  svg.style.overflow = 'visible';
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';
  const defs = doc.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
  svg.appendChild(defs);
  for (const p of paths) {
    const el = doc.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('fill', fillToPaint(p.fill, defs, scope, library));
    if (p.fillRule) el.setAttribute('fill-rule', p.fillRule);
    if (p.stroke) {
      el.setAttribute('stroke', fillToPaint(p.stroke.fill, defs, scope, library));
      el.setAttribute('stroke-width', String(p.stroke.width));
      el.setAttribute('stroke-linecap', p.stroke.cap);
      el.setAttribute('stroke-linejoin', p.stroke.join);
      if (p.stroke.dash?.length) el.setAttribute('stroke-dasharray', p.stroke.dash.join(' '));
    }
    svg.appendChild(el);
  }
  if (!defs.firstChild) defs.remove();
  return svg;
}

export function renderShape(doc: Document, el: ShapeElement, scope: IdScope, library?: Library): SVGSVGElement {
  return createShapeSVG(doc, el.paths, scope, library);
}
