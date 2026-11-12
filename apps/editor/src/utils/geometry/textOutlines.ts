import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

export interface TextToVectorOptions {
  fontSize?: number;
  x?: number;
  y?: number;
  isWoff2?: boolean;
  decimalPlaces?: number;
}

/**
 * Converts a text string into an SVG vector path using a loaded TTF, OTF, or WOFF2 font buffer.
 *
 * @param text The string to outline into vector geometry
 * @param fontBuffer The ArrayBuffer of the font file
 * @param options Rendering options including font size, position, and WOFF2 decompression flag
 * @returns Clean SVG path data string
 */
export async function convertTextToVectorPath(
  text: string,
  fontBuffer: ArrayBuffer,
  options?: TextToVectorOptions
): Promise<string> {
  if (!text || text.length === 0) {
    return '';
  }

  if (!fontBuffer || fontBuffer.byteLength === 0) {
    throw new Error('Font buffer is empty or invalid.');
  }

  const uint8 = new Uint8Array(fontBuffer);
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
    ttfBuffer = fontBuffer;
  }

  const font = opentype.parse(ttfBuffer);
  const fontSize = options?.fontSize ?? 72;
  const x = options?.x ?? 0;
  const y = options?.y ?? fontSize;
  const decimalPlaces = options?.decimalPlaces ?? 2;

  const path = font.getPath(text, x, y, fontSize);
  return path.toPathData(decimalPlaces);
}
