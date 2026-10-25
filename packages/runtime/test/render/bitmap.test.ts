// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderBitmap } from '../../src/render/bitmap';
import type { BitmapElement, Library } from '../../src/schema';

describe('bitmap renderer', () => {
  it('creates an img element with basic positioning and attributes', () => {
    const el: BitmapElement = { id: 'b1', type: 'bitmap', bitmapId: 'bmp1' };
    const img = renderBitmap(document, el);

    expect(img.tagName.toLowerCase()).toBe('img');
    expect(img.draggable).toBe(false);
    expect(img.alt).toBe('');
    expect(img.style.position).toBe('absolute');
    expect(['0', '0px']).toContain(img.style.left);
    expect(['0', '0px']).toContain(img.style.top);
    expect(img.style.display).toBe('block');
  });

  it('populates src, dimensions, and smoothing from library asset', () => {
    const lib: Library = {
      symbols: {},
      bitmaps: {
        bmp1: {
          id: 'bmp1',
          name: 'hero',
          src: 'https://example.com/hero.png',
          width: 320,
          height: 240,
          smoothing: true,
        },
      },
      sounds: {},
      fonts: {},
    };

    const el: BitmapElement = { id: 'b1', type: 'bitmap', bitmapId: 'bmp1' };
    const img = renderBitmap(document, el, lib);

    expect(img.src).toBe('https://example.com/hero.png');
    expect(img.width).toBe(320);
    expect(img.height).toBe(240);
    expect(img.style.imageRendering).not.toBe('pixelated');
  });

  it('sets image-rendering to pixelated when smoothing is disabled', () => {
    const lib: Library = {
      symbols: {},
      bitmaps: {
        pixelBmp: {
          id: 'pixelBmp',
          name: 'sprite',
          src: 'sprite.png',
          width: 32,
          height: 32,
          smoothing: false,
        },
      },
      sounds: {},
      fonts: {},
    };

    const el: BitmapElement = { id: 'b2', type: 'bitmap', bitmapId: 'pixelBmp' };
    const img = renderBitmap(document, el, lib);

    expect(img.src).toContain('sprite.png');
    expect(img.width).toBe(32);
    expect(img.height).toBe(32);
    expect(img.style.imageRendering).toBe('pixelated');
  });

  it('gracefully handles missing bitmap in library', () => {
    const lib: Library = {
      symbols: {},
      bitmaps: {},
      sounds: {},
      fonts: {},
    };

    const el: BitmapElement = { id: 'b3', type: 'bitmap', bitmapId: 'nonexistent' };
    const img = renderBitmap(document, el, lib);

    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBeNull();
  });
});
