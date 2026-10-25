// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createShapeSVG, renderShape } from '../../src/render/shape';
import { IdScope } from '../../src/render/fills';
import type { ShapeElement, VectorPath, Library } from '../../src/schema';

describe('shape renderer', () => {
  it('creates an SVG with default positioning and attributes', () => {
    const scope = new IdScope('sh');
    const svg = createShapeSVG(document, [], scope);

    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('1');
    expect(svg.getAttribute('height')).toBe('1');
    expect(svg.getAttribute('overflow')).toBe('visible');
    expect(svg.style.position).toBe('absolute');
    expect(['0', '0px']).toContain(svg.style.left);
    expect(['0', '0px']).toContain(svg.style.top);
    expect(svg.style.overflow).toBe('visible');
  });

  it('removes defs element if no gradients/patterns are used', () => {
    const scope = new IdScope('sh');
    const paths: VectorPath[] = [
      {
        d: 'M 0 0 L 100 0 L 100 100 Z',
        fill: { type: 'solid', color: '#ff0000' },
      },
    ];

    const svg = createShapeSVG(document, paths, scope);
    expect(svg.querySelector('defs')).toBeNull();
    expect(svg.children.length).toBe(1);

    const path = svg.firstElementChild as SVGPathElement;
    expect(path.tagName.toLowerCase()).toBe('path');
    expect(path.getAttribute('d')).toBe('M 0 0 L 100 0 L 100 100 Z');
    expect(path.getAttribute('fill')).toBe('#ff0000');
  });

  it('preserves defs when paths use gradient fills', () => {
    const scope = new IdScope('sh');
    const paths: VectorPath[] = [
      {
        d: 'M 0 0 L 50 50 Z',
        fill: {
          type: 'linearGradient',
          angle: 45,
          stops: [
            { offset: 0, color: '#000' },
            { offset: 1, color: '#fff' },
          ],
        },
      },
    ];

    const svg = createShapeSVG(document, paths, scope);
    const defs = svg.querySelector('defs');
    expect(defs).not.toBeNull();
    expect(defs!.children.length).toBe(1);

    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('fill')).toBe('url(#sh-lg-1)');
  });

  it('renders stroke properties including caps, joins, and dasharray', () => {
    const scope = new IdScope('sh');
    const paths: VectorPath[] = [
      {
        d: 'M 10 10 L 90 90',
        stroke: {
          fill: { type: 'solid', color: '#00ff00' },
          width: 3,
          cap: 'round',
          join: 'bevel',
          dash: [5, 2, 10],
        },
        fillRule: 'evenodd',
      },
    ];

    const svg = createShapeSVG(document, paths, scope);
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('stroke')).toBe('#00ff00');
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-linejoin')).toBe('bevel');
    expect(path.getAttribute('stroke-dasharray')).toBe('5 2 10');
  });

  it('renderShape delegates to createShapeSVG', () => {
    const scope = new IdScope('sh');
    const el: ShapeElement = {
      id: 'shape1',
      type: 'shape',
      paths: [
        {
          d: 'M 0 0 L 20 20',
          fill: { type: 'solid', color: '#123456' },
        },
      ],
    };

    const svg = renderShape(document, el, scope);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const path = svg.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M 0 0 L 20 20');
    expect(path?.getAttribute('fill')).toBe('#123456');
  });
});
