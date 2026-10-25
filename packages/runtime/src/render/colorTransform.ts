import type { ColorTransform } from '../schema';
import { SVG_NS, type IdScope } from './fills';

export interface RGB { r: number; g: number; b: number }

/** Parses #rgb/#rrggbb/#rrggbbaa/rgb()/rgba(). Returns 0–1 channels; unknown → black. */
export function parseColor(c: string): RGB {
  const s = c.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return {
      r: Number.isFinite(r) ? r / 255 : 0,
      g: Number.isFinite(g) ? g / 255 : 0,
      b: Number.isFinite(b) ? b / 255 : 0,
    };
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const [r, g, b] = m[1]!
      .trim()
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((v) => parseFloat(v) / 255);
    return {
      r: Number.isFinite(r) ? r! : 0,
      g: Number.isFinite(g) ? g! : 0,
      b: Number.isFinite(b) ? b! : 0,
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/** Returns the 4x5 feColorMatrix values (20 numbers), or null for identity. */
export function colorTransformToMatrix(ct: ColorTransform | undefined): number[] | null {
  if (!ct || ct.mode === 'none') return null;
  let rm = 1, gm = 1, bm = 1, am = 1, ra = 0, ga = 0, ba = 0, aa = 0;
  if (ct.mode === 'brightness') {
    const v = Math.max(-1, Math.min(1, ct.brightness ?? 0));
    if (v >= 0) { rm = gm = bm = 1 - v; ra = ga = ba = v; }
    else { rm = gm = bm = 1 + v; }
  } else if (ct.mode === 'tint' && ct.tint) {
    const a = Math.max(0, Math.min(1, ct.tint.amount));
    const c = parseColor(ct.tint.color);
    rm = gm = bm = 1 - a;
    ra = c.r * a; ga = c.g * a; ba = c.b * a;
  } else if (ct.mode === 'advanced' && ct.advanced) {
    const x = ct.advanced;
    rm = x.rMul; gm = x.gMul; bm = x.bMul; am = x.aMul;
    ra = x.rAdd / 255; ga = x.gAdd / 255; ba = x.bAdd / 255; aa = x.aAdd / 255;
  } else return null;
  return [rm, 0, 0, 0, ra, 0, gm, 0, 0, ga, 0, 0, bm, 0, ba, 0, 0, 0, am, aa];
}

/**
 * Cheap CSS-only approximation when possible (brightness ≤ 0 → brightness()).
 * Returns null when an SVG feColorMatrix is required.
 */
export function colorTransformToCSS(ct: ColorTransform | undefined): string | null {
  if (!ct || ct.mode === 'none') return '';
  if (ct.mode === 'brightness' && (ct.brightness ?? 0) <= 0) {
    return `brightness(${1 + (ct.brightness ?? 0)})`;
  }
  return null;
}

/** Creates/updates an SVG <filter> with feColorMatrix in `defs`; returns `url(#id)`. */
export function colorTransformToSVGFilter(
  ct: ColorTransform,
  defs: SVGDefsElement,
  scope: IdScope,
  existingId?: string
): string | null {
  const values = colorTransformToMatrix(ct);
  if (!values) return null;
  const doc = defs.ownerDocument;
  const id = existingId ?? scope.next('ct');
  let filter = existingId ? (defs.querySelector(`#${existingId}`) as Element | null) : null;
  if (!filter) {
    filter = doc.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.appendChild(doc.createElementNS(SVG_NS, 'feColorMatrix'));
    defs.appendChild(filter);
  }
  const fm = filter.firstElementChild!;
  fm.setAttribute('type', 'matrix');
  fm.setAttribute('values', values.map((v) => +v.toFixed(6)).join(' '));
  return `url(#${id})`;
}
