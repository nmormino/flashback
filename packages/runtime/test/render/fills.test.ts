// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  IdScope,
  createIdScope,
  fillToPaint,
  fillToCSS,
  SVG_NS,
} from '../../src/render/fills';
import type { Library, LinearGradientFill, RadialGradientFill, BitmapFill } from '../../src/schema';

describe('fills renderer', () => {
  describe('IdScope', () => {
    it('generates sequential scoped IDs', () => {
      const scope = new IdScope('test');
      expect(scope.next('lg')).toBe('test-lg-1');
      expect(scope.next('lg')).toBe('test-lg-2');
      expect(scope.next('filter')).toBe('test-filter-3');
    });

    it('createIdScope generates unique prefixes with fb prefix', () => {
      const s1 = createIdScope();
      const s2 = createIdScope();
      expect(s1.prefix.startsWith('fb')).toBe(true);
      expect(s2.prefix.startsWith('fb')).toBe(true);
      expect(s1.prefix).not.toBe(s2.prefix);
      expect(s1.next('a')).not.toBe(s2.next('a'));
    });
  });

  describe('fillToPaint', () => {
    function setupDefs() {
      const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      const defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
      svg.appendChild(defs);
      const scope = new IdScope('sc');
      return { defs, scope };
    }

    it('returns "none" for undefined or none fills', () => {
      const { defs, scope } = setupDefs();
      expect(fillToPaint(undefined, defs, scope)).toBe('none');
      expect(fillToPaint({ type: 'none' }, defs, scope)).toBe('none');
      expect(defs.children.length).toBe(0);
    });

    it('returns color directly for solid fill', () => {
      const { defs, scope } = setupDefs();
      expect(fillToPaint({ type: 'solid', color: '#ff5500' }, defs, scope)).toBe('#ff5500');
      expect(defs.children.length).toBe(0);
    });

    it('creates linearGradient element in defs and returns url', () => {
      const { defs, scope } = setupDefs();
      const fill: LinearGradientFill = {
        type: 'linearGradient',
        angle: 0,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ],
      };

      const url = fillToPaint(fill, defs, scope);
      expect(url).toBe('url(#sc-lg-1)');
      expect(defs.children.length).toBe(1);

      const grad = defs.firstElementChild as SVGLinearGradientElement;
      expect(grad.tagName.toLowerCase()).toBe('lineargradient');
      expect(grad.getAttribute('id')).toBe('sc-lg-1');
      expect(grad.children.length).toBe(2);

      const stop1 = grad.children[0] as SVGStopElement;
      expect(stop1.getAttribute('offset')).toBe('0');
      expect(stop1.getAttribute('stop-color')).toBe('#000000');

      const stop2 = grad.children[1] as SVGStopElement;
      expect(stop2.getAttribute('offset')).toBe('1');
      expect(stop2.getAttribute('stop-color')).toBe('#ffffff');
    });

    it('calculates linearGradient angles correctly', () => {
      const { defs, scope } = setupDefs();
      const fill: LinearGradientFill = {
        type: 'linearGradient',
        angle: 90,
        stops: [{ offset: 0, color: '#000' }],
      };

      fillToPaint(fill, defs, scope);
      const grad = defs.firstElementChild as SVGLinearGradientElement;
      expect(Number(grad.getAttribute('x1'))).toBeCloseTo(0.5, 4);
      expect(Number(grad.getAttribute('y1'))).toBeCloseTo(0, 4);
      expect(Number(grad.getAttribute('x2'))).toBeCloseTo(0.5, 4);
      expect(Number(grad.getAttribute('y2'))).toBeCloseTo(1, 4);
    });

    it('creates radialGradient element in defs with focal points if provided', () => {
      const { defs, scope } = setupDefs();
      const fill: RadialGradientFill = {
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        focalX: 0.3,
        focalY: 0.4,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#0000ff' },
        ],
      };

      const url = fillToPaint(fill, defs, scope);
      expect(url).toBe('url(#sc-rg-1)');

      const grad = defs.firstElementChild as SVGRadialGradientElement;
      expect(grad.tagName.toLowerCase()).toBe('radialgradient');
      expect(grad.getAttribute('cx')).toBe('0.5');
      expect(grad.getAttribute('cy')).toBe('0.5');
      expect(grad.getAttribute('r')).toBe('0.5');
      expect(grad.getAttribute('fx')).toBe('0.3');
      expect(grad.getAttribute('fy')).toBe('0.4');
      expect(grad.children.length).toBe(2);
    });

    it('omits fx/fy in radialGradient if not provided', () => {
      const { defs, scope } = setupDefs();
      const fill: RadialGradientFill = {
        type: 'radialGradient',
        cx: 0.2,
        cy: 0.8,
        r: 0.4,
        stops: [{ offset: 0, color: '#fff' }],
      };

      fillToPaint(fill, defs, scope);
      const grad = defs.firstElementChild as SVGRadialGradientElement;
      expect(grad.getAttribute('fx')).toBeNull();
      expect(grad.getAttribute('fy')).toBeNull();
    });

    it('creates pattern for bitmap fill with asset in library', () => {
      const { defs, scope } = setupDefs();
      const lib: Library = {
        symbols: {},
        bitmaps: {
          bmp1: {
            id: 'bmp1',
            name: 'texture',
            src: 'data:image/png;base64,abc',
            width: 64,
            height: 64,
            smoothing: false,
          },
        },
        sounds: {},
        fonts: {},
      };

      const fill: BitmapFill = {
        type: 'bitmap',
        bitmapId: 'bmp1',
        repeat: true,
      };

      const url = fillToPaint(fill, defs, scope, lib);
      expect(url).toBe('url(#sc-bp-1)');

      const pattern = defs.firstElementChild as SVGPatternElement;
      expect(pattern.tagName.toLowerCase()).toBe('pattern');
      expect(pattern.getAttribute('width')).toBe('64');
      expect(pattern.getAttribute('height')).toBe('64');
      expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse');

      const img = pattern.firstElementChild as SVGImageElement;
      expect(img.tagName.toLowerCase()).toBe('image');
      expect(img.getAttribute('href')).toBe('data:image/png;base64,abc');
      expect(img.getAttribute('width')).toBe('64');
      expect(img.getAttribute('height')).toBe('64');
      expect(img.getAttribute('image-rendering')).toBe('pixelated');
    });

    it('uses large dimensions for non-repeating bitmap pattern and standard smoothing', () => {
      const { defs, scope } = setupDefs();
      const lib: Library = {
        symbols: {},
        bitmaps: {
          bmp2: {
            id: 'bmp2',
            name: 'photo',
            src: 'photo.jpg',
            width: 100,
            height: 80,
            smoothing: true,
          },
        },
        sounds: {},
        fonts: {},
      };

      const fill: BitmapFill = {
        type: 'bitmap',
        bitmapId: 'bmp2',
        repeat: false,
      };

      const url = fillToPaint(fill, defs, scope, lib);
      expect(url).toBe('url(#sc-bp-1)');

      const pattern = defs.firstElementChild as SVGPatternElement;
      expect(pattern.getAttribute('width')).toBe('1000000');
      expect(pattern.getAttribute('height')).toBe('1000000');

      const img = pattern.firstElementChild as SVGImageElement;
      expect(img.getAttribute('image-rendering')).toBeNull();
    });

    it('returns "none" for bitmap fill when asset is not found in library', () => {
      const { defs, scope } = setupDefs();
      const fill: BitmapFill = {
        type: 'bitmap',
        bitmapId: 'missing',
        repeat: true,
      };

      expect(fillToPaint(fill, defs, scope)).toBe('none');
      expect(defs.children.length).toBe(0);
    });
  });

  describe('fillToCSS', () => {
    it('returns "transparent" for undefined or none fills', () => {
      expect(fillToCSS(undefined)).toBe('transparent');
      expect(fillToCSS({ type: 'none' })).toBe('transparent');
    });

    it('returns color directly for solid fill', () => {
      expect(fillToCSS({ type: 'solid', color: '#ff0000' })).toBe('#ff0000');
    });

    it('formats linear gradient correctly in CSS', () => {
      const css = fillToCSS({
        type: 'linearGradient',
        angle: 0,
        stops: [
          { offset: 0, color: 'red' },
          { offset: 1, color: 'blue' },
        ],
      });
      expect(css).toBe('linear-gradient(90deg, red 0%, blue 100%)');
    });

    it('formats radial gradient correctly in CSS', () => {
      const css = fillToCSS({
        type: 'radialGradient',
        cx: 0.25,
        cy: 0.75,
        r: 0.5,
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 1, color: '#000' },
        ],
      });
      expect(css).toBe('radial-gradient(circle at 25% 75%, #fff 0%, #000 100%)');
    });

    it('formats bitmap background with repeat or no-repeat', () => {
      const lib: Library = {
        symbols: {},
        bitmaps: {
          bg: {
            id: 'bg',
            name: 'bg',
            src: '/assets/bg.png',
            width: 100,
            height: 100,
            smoothing: true,
          },
        },
        sounds: {},
        fonts: {},
      };

      expect(fillToCSS({ type: 'bitmap', bitmapId: 'bg', repeat: true }, lib)).toBe('url("/assets/bg.png") repeat');
      expect(fillToCSS({ type: 'bitmap', bitmapId: 'bg', repeat: false }, lib)).toBe('url("/assets/bg.png") no-repeat');
      expect(fillToCSS({ type: 'bitmap', bitmapId: 'missing', repeat: true }, lib)).toBe('transparent');
    });
  });
});
