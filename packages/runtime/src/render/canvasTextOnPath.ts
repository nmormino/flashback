import { createPathSampler, type PathSampler, type PathSample } from '../player/pathSampling';

export interface TextOnPathOptions {
  startOffset?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  fill?: string | CanvasGradient | CanvasPattern;
  stroke?: string | CanvasGradient | CanvasPattern;
  strokeWidth?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TextOnPathCaretOptions {
  startOffset?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
  width?: number;
}

export interface TextOnPathSelectionOptions {
  startOffset?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  fill?: string;
}

export interface GetCursorIndexOptions {
  startOffset?: number;
  letterSpacing?: number;
  ctx: CanvasRenderingContext2D;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  align?: 'left' | 'center' | 'right';
}

export interface CaretInfo {
  x: number;
  y: number;
  tangentDeg: number;
  normal: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
}

export interface TextPathLayout {
  sampler: PathSampler;
  chars: string[];
  charWidths: number[];
  totalSpan: number;
  baseOffset: number;
  charStarts: number[];
  charCenters: number[];
  boundaries: number[];
  fontSize: number;
  letterSpacing: number;
}

/**
 * Computes character widths, boundaries, and arc-length distances along the path.
 */
export function computeTextPathLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  pathD: string,
  options: {
    startOffset?: number;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: string;
    letterSpacing?: number;
    align?: 'left' | 'center' | 'right';
  } = {}
): TextPathLayout | null {
  if (!pathD) return null;

  const sampler = createPathSampler(pathD);
  if (sampler.totalLength <= 0) return null;

  const fontSize = options.fontSize ?? 16;
  const fontFamily = options.fontFamily ?? 'sans-serif';
  const fontWeight = options.fontWeight ?? 'normal';
  const fontStyle = options.fontStyle ?? 'normal';
  const letterSpacing = options.letterSpacing ?? 0;

  ctx.font = `${fontStyle !== 'normal' ? fontStyle + ' ' : ''}${
    fontWeight !== 'normal' ? fontWeight + ' ' : ''
  }${fontSize}px ${fontFamily}`;

  const chars = Array.from(text || '');
  const charWidths = chars.map((ch) => ctx.measureText(ch).width);
  const totalSpan =
    charWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, chars.length - 1) * letterSpacing;

  let baseOffset = options.startOffset ?? 0;
  if (options.align === 'center') {
    if (options.startOffset === undefined) {
      baseOffset = (sampler.totalLength - totalSpan) / 2;
    } else {
      baseOffset = options.startOffset - totalSpan / 2;
    }
  } else if (options.align === 'right') {
    if (options.startOffset === undefined) {
      baseOffset = sampler.totalLength - totalSpan;
    } else {
      baseOffset = options.startOffset - totalSpan;
    }
  }

  const charStarts: number[] = [];
  const charCenters: number[] = [];
  const boundaries: number[] = [baseOffset];

  let curr = baseOffset;
  for (let i = 0; i < chars.length; i++) {
    const w = charWidths[i];
    charStarts.push(curr);
    charCenters.push(curr + w / 2);
    curr += w + letterSpacing;
    boundaries.push(curr - (i === chars.length - 1 ? letterSpacing : 0));
  }

  return {
    sampler,
    chars,
    charWidths,
    totalSpan,
    baseOffset,
    charStarts,
    charCenters,
    boundaries,
    fontSize,
    letterSpacing,
  };
}

/**
 * Renders text along an SVG vector path using arc-length sampling, tangent rotation, and Canvas 2D.
 */
export function renderTextOnPath(
  ctx: CanvasRenderingContext2D,
  text: string,
  pathD: string,
  options: TextOnPathOptions = {}
): void {
  if (!text || !pathD) return;

  ctx.save();
  const layout = computeTextPathLayout(ctx, text, pathD, options);
  if (!layout || layout.chars.length === 0) {
    ctx.restore();
    return;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  if (options.fill) {
    ctx.fillStyle = options.fill;
  }
  const hasStroke = options.stroke && options.strokeWidth && options.strokeWidth > 0;
  if (hasStroke) {
    ctx.strokeStyle = options.stroke!;
    ctx.lineWidth = options.strokeWidth!;
  }

  const { sampler, chars, charWidths, charCenters } = layout;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const w = charWidths[i];
    const s = charCenters[i];

    const sample = sampler.sampleAtDistance(s);
    ctx.save();
    ctx.translate(sample.x, sample.y);
    ctx.rotate((sample.tangentDeg * Math.PI) / 180);

    if (options.fill !== 'none') {
      ctx.fillText(char, -w / 2, 0);
    }
    if (hasStroke) {
      ctx.strokeText(char, -w / 2, 0);
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Renders an oriented text editing cursor line perpendicular to the path at the given cursorIndex.
 * Calculates arc length for cursor index: s_caret = startOffset + sum_{k < cursorIndex} (w_k + letterSpacing).
 */
export function renderTextOnPathCaret(
  ctx: CanvasRenderingContext2D,
  text: string,
  pathD: string,
  cursorIndex: number,
  options: TextOnPathCaretOptions = {}
): CaretInfo | null {
  if (!pathD) return null;

  ctx.save();
  const layout = computeTextPathLayout(ctx, text, pathD, options);
  if (!layout) {
    ctx.restore();
    return null;
  }

  const { sampler, chars, charWidths, baseOffset, letterSpacing, fontSize } = layout;
  const clampedIdx = Math.max(0, Math.min(chars.length, cursorIndex));

  let sCaret = baseOffset;
  for (let k = 0; k < clampedIdx; k++) {
    sCaret += charWidths[k] + letterSpacing;
  }

  const sample = sampler.sampleAtDistance(sCaret);
  const theta = (sample.tangentDeg * Math.PI) / 180;
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);

  const halfLen = fontSize / 2;
  const p1 = { x: sample.x - halfLen * nx, y: sample.y - halfLen * ny };
  const p2 = { x: sample.x + halfLen * nx, y: sample.y + halfLen * ny };

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = options.color || '#000000';
  ctx.lineWidth = options.width || 1.5;
  ctx.stroke();
  ctx.restore();

  return {
    x: sample.x,
    y: sample.y,
    tangentDeg: sample.tangentDeg,
    normal: { x: nx, y: ny },
    p1,
    p2,
  };
}

/**
 * Renders oriented quad highlights along the path for character selection between selStart and selEnd.
 */
export function renderTextOnPathSelection(
  ctx: CanvasRenderingContext2D,
  text: string,
  pathD: string,
  selStart: number,
  selEnd: number,
  options: TextOnPathSelectionOptions = {}
): void {
  if (!text || !pathD) return;

  const startIdx = Math.min(selStart, selEnd);
  const endIdx = Math.max(selStart, selEnd);
  if (startIdx >= endIdx) return;

  ctx.save();
  const layout = computeTextPathLayout(ctx, text, pathD, options);
  if (!layout || layout.chars.length === 0) {
    ctx.restore();
    return;
  }

  const { sampler, chars, charWidths, charStarts, fontSize, letterSpacing } = layout;
  const clampedStart = Math.max(0, Math.min(chars.length, startIdx));
  const clampedEnd = Math.max(0, Math.min(chars.length, endIdx));
  if (clampedStart >= clampedEnd) {
    ctx.restore();
    return;
  }

  const halfH = fontSize / 2;
  ctx.fillStyle = options.fill || 'rgba(0, 120, 215, 0.3)';

  for (let k = clampedStart; k < clampedEnd; k++) {
    const s0 = charStarts[k];
    const s1 = s0 + charWidths[k] + (k < clampedEnd - 1 ? letterSpacing : 0);

    const p0 = sampler.sampleAtDistance(s0);
    const p1 = sampler.sampleAtDistance(s1);

    const rad0 = (p0.tangentDeg * Math.PI) / 180;
    const rad1 = (p1.tangentDeg * Math.PI) / 180;

    const n0x = -Math.sin(rad0);
    const n0y = Math.cos(rad0);
    const n1x = -Math.sin(rad1);
    const n1y = Math.cos(rad1);

    ctx.beginPath();
    ctx.moveTo(p0.x - halfH * n0x, p0.y - halfH * n0y);
    ctx.lineTo(p1.x - halfH * n1x, p1.y - halfH * n1y);
    ctx.lineTo(p1.x + halfH * n1x, p1.y + halfH * n1y);
    ctx.lineTo(p0.x + halfH * n0x, p0.y + halfH * n0y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Finds the closest character boundary index K on the path for a given point (x, y).
 */
export function getCursorIndexOnPath(
  point: { x: number; y: number },
  text: string,
  pathD: string,
  options: GetCursorIndexOptions
): number {
  if (!text || text.length === 0 || !pathD) return 0;

  const layout = computeTextPathLayout(options.ctx, text, pathD, options);
  if (!layout || layout.chars.length === 0) return 0;

  const { sampler, chars, charWidths, baseOffset, letterSpacing } = layout;

  let minDist = Infinity;
  let bestIndex = 0;

  // Evaluate distance to each character boundary index K from 0 to chars.length
  let sBoundary = baseOffset;
  for (let k = 0; k <= chars.length; k++) {
    const sample = sampler.sampleAtDistance(sBoundary);
    const dist = Math.hypot(point.x - sample.x, point.y - sample.y);
    if (dist < minDist) {
      minDist = dist;
      bestIndex = k;
    }
    if (k < chars.length) {
      sBoundary += charWidths[k] + letterSpacing;
    }
  }

  return bestIndex;
}
