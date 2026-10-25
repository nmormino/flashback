// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  parseColor,
  colorTransformToMatrix,
  colorTransformToCSS,
  colorTransformToSVGFilter,
} from '../../src/render/colorTransform';
import { IdScope, SVG_NS } from '../../src/render/fills';
import type { ColorTransform } from '../../src/schema';

describe('colorTransform renderer', () => {
  describe('parseColor', () => {
    it('parses 3-character hex color', () => {
      const c = parseColor('#f00');
      expect(c.r).toBeCloseTo(1, 4);
      expect(c.g).toBe(0);
      expect(c.b).toBe(0);
    });

    it('parses 4-character hex color with alpha', () => {
      const c = parseColor('#0f0a');
      expect(c.r).toBe(0);
      expect(c.g).toBeCloseTo(1, 4);
      expect(c.b).toBe(0);
    });

    it('parses 6-character hex color', () => {
      const c = parseColor('#0000ff');
      expect(c.r).toBe(0);
      expect(c.g).toBe(0);
      expect(c.b).toBeCloseTo(1, 4);
    });

    it('parses 8-character hex color', () => {
      const c = parseColor('#80ff00ff');
      expect(c.r).toBeCloseTo(128 / 255, 4);
      expect(c.g).toBeCloseTo(1, 4);
      expect(c.b).toBe(0);
    });

    it('parses rgb() and rgba() strings', () => {
      const rgb = parseColor('rgb(255, 128, 0)');
      expect(rgb.r).toBeCloseTo(1, 4);
      expect(rgb.g).toBeCloseTo(128 / 255, 4);
      expect(rgb.b).toBe(0);

      const rgba = parseColor('rgba( 0 , 255 , 64 , 0.8 )');
      expect(rgba.r).toBe(0);
      expect(rgba.g).toBeCloseTo(1, 4);
      expect(rgba.b).toBeCloseTo(64 / 255, 4);
    });

    it('returns black for invalid color strings', () => {
      expect(parseColor('')).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseColor('invalid')).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseColor('#xyz')).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('colorTransformToMatrix', () => {
    it('returns null for undefined or mode none', () => {
      expect(colorTransformToMatrix(undefined)).toBeNull();
      expect(colorTransformToMatrix({ mode: 'none' })).toBeNull();
    });

    it('computes matrix for positive brightness (white tint)', () => {
      const ct: ColorTransform = { mode: 'brightness', brightness: 0.4 };
      const m = colorTransformToMatrix(ct)!;
      expect(m).not.toBeNull();
      // Row 1: R_out = 0.6 * R + 0.4
      expect(m[0]).toBeCloseTo(0.6, 4);
      expect(m[4]).toBeCloseTo(0.4, 4);
      // Row 2: G_out = 0.6 * G + 0.4
      expect(m[6]).toBeCloseTo(0.6, 4);
      expect(m[9]).toBeCloseTo(0.4, 4);
      // Row 3: B_out = 0.6 * B + 0.4
      expect(m[12]).toBeCloseTo(0.6, 4);
      expect(m[14]).toBeCloseTo(0.4, 4);
      // Row 4: A_out = 1 * A
      expect(m[18]).toBe(1);
      expect(m[19]).toBe(0);
    });

    it('computes matrix for negative brightness (darkening)', () => {
      const ct: ColorTransform = { mode: 'brightness', brightness: -0.5 };
      const m = colorTransformToMatrix(ct)!;
      expect(m[0]).toBeCloseTo(0.5, 4);
      expect(m[4]).toBe(0);
      expect(m[6]).toBeCloseTo(0.5, 4);
      expect(m[9]).toBe(0);
      expect(m[12]).toBeCloseTo(0.5, 4);
      expect(m[14]).toBe(0);
    });

    it('computes matrix for tint mode', () => {
      const ct: ColorTransform = {
        mode: 'tint',
        tint: { color: '#ff0000', amount: 0.8 },
      };
      const m = colorTransformToMatrix(ct)!;
      // 1 - 0.8 = 0.2 multipliers
      expect(m[0]).toBeCloseTo(0.2, 4);
      expect(m[6]).toBeCloseTo(0.2, 4);
      expect(m[12]).toBeCloseTo(0.2, 4);
      // Additive channels: r=1*0.8=0.8, g=0, b=0
      expect(m[4]).toBeCloseTo(0.8, 4);
      expect(m[9]).toBe(0);
      expect(m[14]).toBe(0);
    });

    it('computes matrix for advanced mode', () => {
      const ct: ColorTransform = {
        mode: 'advanced',
        advanced: {
          rMul: 0.5,
          gMul: 0.8,
          bMul: 1.2,
          aMul: 0.9,
          rAdd: 25.5,
          gAdd: -51,
          bAdd: 102,
          aAdd: 0,
        },
      };
      const m = colorTransformToMatrix(ct)!;
      expect(m[0]).toBe(0.5);
      expect(m[4]).toBeCloseTo(0.1, 4); // 25.5 / 255
      expect(m[6]).toBe(0.8);
      expect(m[9]).toBeCloseTo(-0.2, 4); // -51 / 255
      expect(m[12]).toBe(1.2);
      expect(m[14]).toBeCloseTo(0.4, 4); // 102 / 255
      expect(m[18]).toBe(0.9);
      expect(m[19]).toBe(0);
    });

    it('returns null if mode is tint or advanced without definition', () => {
      expect(colorTransformToMatrix({ mode: 'tint' })).toBeNull();
      expect(colorTransformToMatrix({ mode: 'advanced' })).toBeNull();
    });
  });

  describe('colorTransformToCSS', () => {
    it('returns empty string for none or undefined', () => {
      expect(colorTransformToCSS(undefined)).toBe('');
      expect(colorTransformToCSS({ mode: 'none' })).toBe('');
    });

    it('returns CSS brightness for brightness <= 0', () => {
      expect(colorTransformToCSS({ mode: 'brightness', brightness: -0.3 })).toBe('brightness(0.7)');
      expect(colorTransformToCSS({ mode: 'brightness', brightness: 0 })).toBe('brightness(1)');
    });

    it('returns null for positive brightness, tint, and advanced', () => {
      expect(colorTransformToCSS({ mode: 'brightness', brightness: 0.5 })).toBeNull();
      expect(colorTransformToCSS({ mode: 'tint', tint: { color: '#f00', amount: 0.5 } })).toBeNull();
      expect(
        colorTransformToCSS({
          mode: 'advanced',
          advanced: { rMul: 1, gMul: 1, bMul: 1, aMul: 1, rAdd: 0, gAdd: 0, bAdd: 0, aAdd: 0 },
        })
      ).toBeNull();
    });
  });

  describe('colorTransformToSVGFilter', () => {
    function setupDefs() {
      const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      const defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
      svg.appendChild(defs);
      const scope = new IdScope('ct-test');
      return { defs, scope };
    }

    it('returns null for none mode', () => {
      const { defs, scope } = setupDefs();
      expect(colorTransformToSVGFilter({ mode: 'none' }, defs, scope)).toBeNull();
      expect(defs.children.length).toBe(0);
    });

    it('creates SVG filter with feColorMatrix', () => {
      const { defs, scope } = setupDefs();
      const ct: ColorTransform = {
        mode: 'tint',
        tint: { color: '#00ff00', amount: 0.5 },
      };

      const url = colorTransformToSVGFilter(ct, defs, scope);
      expect(url).toBe('url(#ct-test-ct-1)');
      expect(defs.children.length).toBe(1);

      const filter = defs.firstElementChild as SVGFilterElement;
      expect(filter.tagName.toLowerCase()).toBe('filter');
      expect(filter.getAttribute('id')).toBe('ct-test-ct-1');
      expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');

      const matrix = filter.firstElementChild as SVGFEColorMatrixElement;
      expect(matrix.tagName.toLowerCase()).toBe('fecolormatrix');
      expect(matrix.getAttribute('type')).toBe('matrix');
      const vals = matrix.getAttribute('values')!.split(' ').map(Number);
      expect(vals.length).toBe(20);
      expect(vals[0]).toBeCloseTo(0.5, 4); // rm
      expect(vals[9]).toBeCloseTo(0.5, 4); // ga
    });

    it('updates existing filter if existingId is supplied', () => {
      const { defs, scope } = setupDefs();
      const ct1: ColorTransform = { mode: 'brightness', brightness: 0.2 };
      const url1 = colorTransformToSVGFilter(ct1, defs, scope);
      expect(url1).toBe('url(#ct-test-ct-1)');
      expect(defs.children.length).toBe(1);

      const ct2: ColorTransform = { mode: 'brightness', brightness: 0.8 };
      const url2 = colorTransformToSVGFilter(ct2, defs, scope, 'ct-test-ct-1');
      expect(url2).toBe('url(#ct-test-ct-1)');
      expect(defs.children.length).toBe(1); // Didn't create a new filter element

      const matrix = defs.querySelector('feColorMatrix') as SVGFEColorMatrixElement;
      const vals = matrix.getAttribute('values')!.split(' ').map(Number);
      expect(vals[0]).toBeCloseTo(0.2, 4); // 1 - 0.8 = 0.2
      expect(vals[4]).toBeCloseTo(0.8, 4); // ra = 0.8
    });
  });
});
