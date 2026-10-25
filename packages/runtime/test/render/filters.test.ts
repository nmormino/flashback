// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { filtersToCSS } from '../../src/render/filters';
import type { Filter } from '../../src/schema';

describe('filters renderer', () => {
  it('returns empty string for undefined or empty filters', () => {
    expect(filtersToCSS(undefined)).toBe('');
    expect(filtersToCSS([])).toBe('');
  });

  it('formats blur filter', () => {
    const filters: Filter[] = [{ type: 'blur', radius: 8 }];
    expect(filtersToCSS(filters)).toBe('blur(8px)');
  });

  it('formats dropShadow filter', () => {
    const filters: Filter[] = [
      {
        type: 'dropShadow',
        x: 4,
        y: 6,
        blur: 10,
        color: 'rgba(0, 0, 0, 0.4)',
      },
    ];
    expect(filtersToCSS(filters)).toBe('drop-shadow(4px 6px 10px rgba(0, 0, 0, 0.4))');
  });

  it('formats glow filter as stacked drop-shadows', () => {
    const glow3: Filter[] = [
      {
        type: 'glow',
        blur: 5,
        color: '#ff00ff',
        strength: 3,
      },
    ];
    expect(filtersToCSS(glow3)).toBe(
      'drop-shadow(0px 0px 5px #ff00ff) drop-shadow(0px 0px 5px #ff00ff) drop-shadow(0px 0px 5px #ff00ff)'
    );

    // Clamped minimum strength (0 or negative clamps to 1)
    const glowMin: Filter[] = [
      {
        type: 'glow',
        blur: 2,
        color: '#fff',
        strength: 0,
      },
    ];
    expect(filtersToCSS(glowMin)).toBe('drop-shadow(0px 0px 2px #fff)');

    // Clamped maximum strength (> 8 clamps to 8)
    const glowMax: Filter[] = [
      {
        type: 'glow',
        blur: 4,
        color: '#000',
        strength: 15,
      },
    ];
    const parts = filtersToCSS(glowMax).split(' drop-shadow');
    expect(parts.length).toBe(8);
  });

  it('formats hueRotate filter', () => {
    const filters: Filter[] = [{ type: 'hueRotate', degrees: 120 }];
    expect(filtersToCSS(filters)).toBe('hue-rotate(120deg)');
  });

  it('formats standard adjustment filters (brightness, contrast, saturate, etc.)', () => {
    expect(filtersToCSS([{ type: 'brightness', amount: 1.2 }])).toBe('brightness(1.2)');
    expect(filtersToCSS([{ type: 'contrast', amount: 1.5 }])).toBe('contrast(1.5)');
    expect(filtersToCSS([{ type: 'saturate', amount: 2 }])).toBe('saturate(2)');
    expect(filtersToCSS([{ type: 'grayscale', amount: 0.8 }])).toBe('grayscale(0.8)');
    expect(filtersToCSS([{ type: 'sepia', amount: 0.5 }])).toBe('sepia(0.5)');
    expect(filtersToCSS([{ type: 'invert', amount: 1 }])).toBe('invert(1)');
    expect(filtersToCSS([{ type: 'opacity', amount: 0.6 }])).toBe('opacity(0.6)');
  });

  it('combines multiple filters separated by space in order', () => {
    const filters: Filter[] = [
      { type: 'blur', radius: 4 },
      { type: 'contrast', amount: 1.1 },
      { type: 'hueRotate', degrees: 45 },
    ];
    expect(filtersToCSS(filters)).toBe('blur(4px) contrast(1.1) hue-rotate(45deg)');
  });
});
