import * as opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

export interface TextToVectorOptions {
  fontSize?: number;
  x?: number;
  y?: number;
  isWoff2?: boolean;
  decimalPlaces?: number;
}

let cachedFallbackBuffer: ArrayBuffer | null = null;

/**
 * Returns a valid in-memory fallback font buffer with glyphs for ASCII characters.
 */
export function getStandardFallbackFontBuffer(): ArrayBuffer {
  if (cachedFallbackBuffer) {
    return cachedFallbackBuffer;
  }

  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 600,
    path: new opentype.Path(),
  });
  notdef.path.moveTo(50, 0);
  notdef.path.lineTo(50, 700);
  notdef.path.lineTo(550, 700);
  notdef.path.lineTo(550, 0);
  notdef.path.close();

  const glyphs: opentype.Glyph[] = [notdef];

  const pSpace = new opentype.Path();
  glyphs.push(
    new opentype.Glyph({
      name: 'space',
      unicode: 32,
      advanceWidth: 300,
      path: pSpace,
    })
  );

  for (let c = 33; c <= 126; c++) {
    const p = new opentype.Path();
    p.moveTo(100, 0);
    p.lineTo(100, 700);
    p.lineTo(500, 700);
    p.lineTo(500, 0);
    p.close();

    const char = String.fromCharCode(c);
    if (
      ['A', 'B', 'D', 'O', 'P', 'Q', 'R', '0', '4', '6', '8', '9', 'a', 'b', 'd', 'e', 'g', 'o', 'p', 'q'].includes(
        char
      )
    ) {
      p.moveTo(200, 200);
      p.lineTo(400, 200);
      p.lineTo(400, 500);
      p.lineTo(200, 500);
      p.close();
    }

    glyphs.push(
      new opentype.Glyph({
        name: char,
        unicode: c,
        advanceWidth: 600,
        path: p,
      })
    );
  }

  const font = new opentype.Font({
    familyName: 'FlashbackStandardFallback',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  });

  cachedFallbackBuffer = font.toArrayBuffer();
  return cachedFallbackBuffer;
}

/**
 * Converts a text string into an SVG vector path using a loaded TTF, OTF, or WOFF2 font buffer.
 * If fontBuffer is omitted or invalid, uses the standard fallback font.
 *
 * @param text The string to outline into vector geometry
 * @param fontBuffer The ArrayBuffer of the font file (optional)
 * @param options Rendering options including font size, position, and WOFF2 decompression flag
 * @returns Clean SVG path data string
 */
export async function convertTextToVectorPath(
  text: string,
  fontBuffer?: ArrayBuffer | null,
  options?: TextToVectorOptions
): Promise<string> {
  if (!text || text.length === 0) {
    return '';
  }

  const effectiveBuffer =
    fontBuffer && fontBuffer.byteLength > 0
      ? fontBuffer
      : getStandardFallbackFontBuffer();

  const uint8 = new Uint8Array(effectiveBuffer);
  // Detect WOFF2 magic bytes ('wOF2' -> 0x77, 0x4f, 0x46, 0x32) or use explicit option
  const isWoff2 =
    options?.isWoff2 ??
    (uint8.length >= 4 &&
      uint8[0] === 0x77 &&
      uint8[1] === 0x4f &&
      uint8[2] === 0x46 &&
      uint8[3] === 0x32);

  let ttfBuffer: ArrayBuffer;
  if (isWoff2) {
    const decompressed = await wawoff2.decompress(uint8);
    // wawoff2 returns a Uint8Array view into WebAssembly memory; slice the exact bytes
    ttfBuffer = decompressed.buffer.slice(
      decompressed.byteOffset,
      decompressed.byteOffset + decompressed.byteLength
    ) as ArrayBuffer;
  } else {
    ttfBuffer = effectiveBuffer;
  }

  const font = opentype.parse(ttfBuffer);
  const fontSize = options?.fontSize ?? 72;
  const x = options?.x ?? 0;
  const y = options?.y ?? fontSize;
  const decimalPlaces = options?.decimalPlaces ?? 2;

  const path = font.getPath(text, x, y, fontSize);
  return path.toPathData(decimalPlaces);
}
