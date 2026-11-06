import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCw,
  MoveHorizontal,
  MoveVertical,
  Crosshair as CrosshairIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CornerUpLeft,
  Component as ComponentIcon,
  Layers as LayersIcon,
  Film,
  ExternalLink,
} from 'lucide-react';
import type {
  ShapeElement,
  TextElement,
  TextSpan,
  SymbolInstance,
  Transform,
  BitmapElement,
  VideoElement,
} from '@flashback/runtime';
import { Matrix2D, filtersToCSS, fillToCSS, computeEasingProgress, normalizeRotation } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  findKeyframeAtTime,
  getKeyframeTime,
  getActiveTimeline,
  getActiveArtboard,
  computeTotalTimelineDuration,
  type EditorElement,
  type EditorKeyframe,
  type EditorLayer,
  type EditorSymbol,
} from '../../state/editorStore';
import {
  parseSvgPath,
  formatSvgPath,
  updatePathAnchor,
  interpolatePathD,
  type BezierAnchor,
  type Vector2D,
} from '../../utils/bezier';
import { generatePolygonStarPath } from '../../utils/shapeGenerators';
import styles from './Stage.module.css';

interface DragState {
  type:
    | 'move'
    | 'resize'
    | 'rotate'
    | 'skew'
    | 'pivot'
    | 'draw_rect'
    | 'draw_oval'
    | 'draw_polygon'
    | 'marquee'
    | 'pan'
    | 'pen_drag'
    | 'subselect_drag_anchor'
    | 'subselect_drag_handle';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  initialTransforms: Record<string, Transform>;
  handle?: 'tl' | 'tc' | 'tr' | 'mr' | 'br' | 'bc' | 'bl' | 'ml';
  resizeElId?: string;
  initialBounds?: { x: number; y: number; width: number; height: number };
  folderId?: string;
  initialPaths?: ShapeElement['paths'];
  pivotLocal?: Vector2D;
  startPanX?: number;
  startPanY?: number;
  startClientX?: number;
  startClientY?: number;
  rotCenter?: Vector2D;
  initialRotation?: number;
  startAngle?: number;
  skewAxis?: 'x' | 'y';
  initialSkewX?: number;
  initialSkewY?: number;
  penAnchorIndex?: number;
  subselectShapeId?: string;
  subselectPathIndex?: number;
  subselectAnchorIndex?: number;
  subselectHandleType?: 'in' | 'out';
  initialAnchorPos?: Vector2D;
  initialPathD?: string;
  polygonPoints?: number;
  polygonStarRatio?: number;
  shiftKey?: boolean;
}

export function getShapeBounds(shape: ShapeElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const path of shape.paths) {
    const d = path.d;
    const nums = d.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!nums || nums.length < 2) continue;

    // Check for oval arc command
    if (d.includes(' a ') || d.includes(' A ')) {
      const rY = parseFloat(nums[1]) || 20;
      const rw = parseFloat(nums[7]) || rY * 2;
      const rh = rY * 2;
      minX = Math.min(minX, 0);
      minY = Math.min(minY, 0);
      maxX = Math.max(maxX, rw);
      maxY = Math.max(maxY, rh);
      continue;
    }

    // Path points (pairs of x, y)
    for (let i = 0; i < nums.length - 1; i += 2) {
      const px = parseFloat(nums[i]);
      const py = parseFloat(nums[i + 1]);
      if (!isNaN(px) && !isNaN(py)) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }
  }

  if (!isFinite(minX) || !isFinite(maxX)) {
    return { x: 0, y: 0, width: 40, height: 40 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(8, maxX - minX),
    height: Math.max(8, maxY - minY),
  };
}

/**
 * Scales an SVG path `d` string from `initB` box dimensions to `(newW, newH)`
 * so vector shapes resize their true geometry instead of stretching via CSS scale.
 */
export function scaleSvgPathD(
  d: string,
  initB: { x: number; y: number; width: number; height: number },
  newW: number,
  newH: number
): string {
  const sx = newW / Math.max(1, initB.width);
  const sy = newH / Math.max(1, initB.height);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const segments = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!segments) return d;

  return segments
    .map((seg) => {
      const cmd = seg[0];
      const upper = cmd.toUpperCase();
      const isRel = cmd !== upper;
      if (upper === 'Z') return cmd;

      const rawNums = seg.slice(1).match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
      if (!rawNums || rawNums.length === 0) return cmd;
      const nums = rawNums.map(Number);

      if (upper === 'H') {
        const scaled = nums.map((v) => round2(isRel ? v * sx : (v - initB.x) * sx + initB.x));
        return `${cmd} ${scaled.join(' ')}`;
      }
      if (upper === 'V') {
        const scaled = nums.map((v) => round2(isRel ? v * sy : (v - initB.y) * sy + initB.y));
        return `${cmd} ${scaled.join(' ')}`;
      }
      if (upper === 'A') {
        const out: number[] = [];
        for (let i = 0; i < nums.length; i += 7) {
          const rx = round2(Math.abs((nums[i] ?? 0) * sx));
          const ry = round2(Math.abs((nums[i + 1] ?? 0) * sy));
          const xRot = nums[i + 2] ?? 0;
          const largeArc = nums[i + 3] ?? 0;
          const sweep = nums[i + 4] ?? 0;
          const xVal = nums[i + 5] ?? 0;
          const yVal = nums[i + 6] ?? 0;
          const nx = round2(isRel ? xVal * sx : (xVal - initB.x) * sx + initB.x);
          const ny = round2(isRel ? yVal * sy : (yVal - initB.y) * sy + initB.y);
          out.push(rx, ry, xRot, largeArc, sweep, nx, ny);
        }
        return `${cmd} ${out.join(' ')}`;
      }

      const scaled = nums.map((v, idx) => {
        if (idx % 2 === 0) {
          return round2(isRel ? v * sx : (v - initB.x) * sx + initB.x);
        }
        return round2(isRel ? v * sy : (v - initB.y) * sy + initB.y);
      });
      return `${cmd} ${scaled.join(' ')}`;
    })
    .join(' ');
}

export function getElementBounds(el: EditorElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (el.type === 'shape') {
    return getShapeBounds(el as ShapeElement);
  }
  if (el.type === 'text') {
    const textEl = el as TextElement;
    return {
      x: 0,
      y: 0,
      width: textEl.width || 120,
      height: textEl.height || 28,
    };
  }
  if (el.type === 'instance') {
    return {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    };
  }
  if (el.type === 'bitmap') {
    const bmp = el as BitmapElement;
    return {
      x: 0,
      y: 0,
      width: bmp.width || 200,
      height: bmp.height || 150,
    };
  }
  if (el.type === 'video') {
    const vid = el as VideoElement;
    return {
      x: 0,
      y: 0,
      width: vid.width || 320,
      height: vid.height || 180,
    };
  }
  return { x: 0, y: 0, width: 50, height: 50 };
}

export function computeInterpolatedTransform(
  startEl: EditorElement,
  endEl: EditorElement,
  t: number,
  tweenRotate?: { direction: 'cw' | 'ccw'; turns: number }
): Transform {
  const s = startEl.transform;
  const e = endEl.transform;
  const { startRot, endRot } = normalizeRotation(
    s.rotation ?? 0,
    e.rotation ?? 0,
    tweenRotate
  );

  return {
    x: s.x + (e.x - s.x) * t,
    y: s.y + (e.y - s.y) * t,
    scaleX: (s.scaleX ?? 1) + ((e.scaleX ?? 1) - (s.scaleX ?? 1)) * t,
    scaleY: (s.scaleY ?? 1) + ((e.scaleY ?? 1) - (s.scaleY ?? 1)) * t,
    rotation: startRot + (endRot - startRot) * t,
    skewX: (s.skewX ?? 0) + ((e.skewX ?? 0) - (s.skewX ?? 0)) * t,
    skewY: (s.skewY ?? 0) + ((e.skewY ?? 0) - (s.skewY ?? 0)) * t,
    originX: (s.originX ?? e.originX ?? 0) + (((e.originX ?? s.originX ?? 0) - (s.originX ?? e.originX ?? 0)) * t),
    originY: (s.originY ?? e.originY ?? 0) + (((e.originY ?? s.originY ?? 0) - (s.originY ?? e.originY ?? 0)) * t),
    ...(s.rotateX !== undefined || e.rotateX !== undefined
      ? { rotateX: (s.rotateX ?? 0) + ((e.rotateX ?? 0) - (s.rotateX ?? 0)) * t }
      : {}),
    ...(s.rotateY !== undefined || e.rotateY !== undefined
      ? { rotateY: (s.rotateY ?? 0) + ((e.rotateY ?? 0) - (s.rotateY ?? 0)) * t }
      : {}),
    ...(s.perspective !== undefined || e.perspective !== undefined
      ? {
          perspective:
            (s.perspective ?? 800) + ((e.perspective ?? 800) - (s.perspective ?? 800)) * t,
        }
      : {}),
  };
}

export function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (c === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (c === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (c === 'red') return { r: 255, g: 0, b: 0, a: 1 };
  if (c === 'green') return { r: 0, g: 128, b: 0, a: 1 };
  if (c === 'blue') return { r: 0, g: 0, b: 255, a: 1 };

  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return {
      r: parseInt(c[1] + c[1], 16),
      g: parseInt(c[2] + c[2], 16),
      b: parseInt(c[3] + c[3], 16),
      a: 1,
    };
  }
  if (/^#[0-9a-f]{4}$/i.test(c)) {
    return {
      r: parseInt(c[1] + c[1], 16),
      g: parseInt(c[2] + c[2], 16),
      b: parseInt(c[3] + c[3], 16),
      a: parseInt(c[4] + c[4], 16) / 255,
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: 1,
    };
  }
  if (/^#[0-9a-f]{8}$/i.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: parseInt(c.slice(7, 9), 16) / 255,
    };
  }
  const rgbMatch = c.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/
  );
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]),
      g: parseFloat(rgbMatch[2]),
      b: parseFloat(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

export function interpolateColor(color1: string, color2: string, t: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  const a = +(c1.a + (c2.a - c1.a) * t).toFixed(3);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function computeInterpolatedElement(
  startEl: EditorElement,
  endEl: EditorElement,
  t: number,
  tweenRotate?: { direction: 'cw' | 'ccw'; turns: number }
): EditorElement {
  const effectiveTransform = computeInterpolatedTransform(startEl, endEl, t, tweenRotate);
  const effectiveAlpha = (startEl.alpha ?? 1) + ((endEl.alpha ?? 1) - (startEl.alpha ?? 1)) * t;

  if (startEl.type === 'shape' && endEl.type === 'shape') {
    const sShape = startEl as ShapeElement;
    const eShape = endEl as ShapeElement;
    const interpPaths = sShape.paths.map((p, pIdx) => {
      const eP = eShape.paths[pIdx];
      if (!eP) return p;
      const interpFill =
        p.fill?.type === 'solid' && eP.fill?.type === 'solid' && p.fill.color !== eP.fill.color
          ? { type: 'solid' as const, color: interpolateColor(p.fill.color, eP.fill.color, t) }
          : p.fill;
      const interpStroke =
        p.stroke && eP.stroke
          ? {
              ...p.stroke,
              width: p.stroke.width + (eP.stroke.width - p.stroke.width) * t,
              fill:
                p.stroke.fill.type === 'solid' &&
                eP.stroke.fill.type === 'solid' &&
                p.stroke.fill.color !== eP.stroke.fill.color
                  ? {
                      type: 'solid' as const,
                      color: interpolateColor(p.stroke.fill.color, eP.stroke.fill.color, t),
                    }
                  : p.stroke.fill,
            }
          : p.stroke;
      return {
        ...p,
        d: interpolatePathD(p.d, eP.d, t),
        fill: interpFill,
        stroke: interpStroke,
      };
    });
    return {
      ...sShape,
      transform: effectiveTransform,
      alpha: effectiveAlpha,
      paths: interpPaths,
    };
  }

  if (startEl.type === 'text' && endEl.type === 'text') {
    const sText = startEl as TextElement;
    const eText = endEl as TextElement;

    // 1. Interpolate fontSize (e.g. 24px -> 48px)
    const sSize = sText.fontSize || 16;
    const eSize = eText.fontSize || 16;
    const interpFontSize = +(sSize + (eSize - sSize) * t).toFixed(2);

    // 2. Interpolate letterSpacing (tracking animation)
    const sLS = sText.letterSpacing ?? 0;
    const eLS = eText.letterSpacing ?? 0;
    const interpLetterSpacing = +(sLS + (eLS - sLS) * t).toFixed(2);

    // 3. Interpolate fontWeight (variable fonts fluidly morphing from 100 to 900)
    const sWeight =
      typeof sText.fontWeight === 'number'
        ? sText.fontWeight
        : sText.fontWeight === 'bold'
        ? 700
        : parseInt(String(sText.fontWeight), 10) || 400;
    const eWeight =
      typeof eText.fontWeight === 'number'
        ? eText.fontWeight
        : eText.fontWeight === 'bold'
        ? 700
        : parseInt(String(eText.fontWeight), 10) || 400;
    const interpFontWeight = Math.round(sWeight + (eWeight - sWeight) * t);

    // 4. Interpolate color (rgba / hex color lerping)
    const sColor = sText.color || '#ffffff';
    const eColor = eText.color || '#ffffff';
    const interpColor = interpolateColor(sColor, eColor, t);

    // 5. Interpolate spans if present
    let interpSpans: TextSpan[] | undefined;
    if (sText.spans || eText.spans) {
      const baseSpans = sText.spans || [{ text: sText.text, id: 'span_0' }];
      const targetSpans = eText.spans || [{ text: eText.text, id: 'span_0' }];

      interpSpans = baseSpans.map((sp, idx) => {
        const match = targetSpans.find((e) => e.id && sp.id && e.id === sp.id) || targetSpans[idx];
        if (!match) return sp;

        const spSize = sp.fontSize ?? sSize;
        const matchSize = match.fontSize ?? eSize;
        const spanFontSize = +(spSize + (matchSize - spSize) * t).toFixed(2);

        const spCol = sp.color || sColor;
        const matchCol = match.color || eColor;
        const spanColor = interpolateColor(spCol, matchCol, t);

        const spOpacity = sp.opacity ?? 1;
        const matchOpacity = match.opacity ?? 1;
        const spanOpacity = +(spOpacity + (matchOpacity - spOpacity) * t).toFixed(3);

        const spOffsetY = sp.offsetY ?? 0;
        const matchOffsetY = match.offsetY ?? 0;
        const spanOffsetY = +(spOffsetY + (matchOffsetY - spOffsetY) * t).toFixed(2);

        let spanWeight: number | string | undefined = sp.fontWeight ?? interpFontWeight;
        if (sp.fontWeight !== undefined || match.fontWeight !== undefined) {
          const swNum =
            typeof sp.fontWeight === 'number'
              ? sp.fontWeight
              : sp.fontWeight === 'bold'
              ? 700
              : parseInt(String(sp.fontWeight), 10) || sWeight;
          const ewNum =
            typeof match.fontWeight === 'number'
              ? match.fontWeight
              : match.fontWeight === 'bold'
              ? 700
              : parseInt(String(match.fontWeight), 10) || eWeight;
          spanWeight = Math.round(swNum + (ewNum - swNum) * t);
        }

        let spanLS: number | undefined;
        if (sp.letterSpacing !== undefined || match.letterSpacing !== undefined) {
          const sSpLS = sp.letterSpacing ?? sLS;
          const eSpLS = match.letterSpacing ?? eLS;
          spanLS = +(sSpLS + (eSpLS - sSpLS) * t).toFixed(2);
        }

        return {
          ...sp,
          fontSize: spanFontSize,
          color: spanColor,
          opacity: spanOpacity,
          offsetY: spanOffsetY,
          ...(spanWeight !== undefined ? { fontWeight: spanWeight } : {}),
          ...(spanLS !== undefined ? { letterSpacing: spanLS } : {}),
        };
      });
    }

    return {
      ...sText,
      transform: effectiveTransform,
      alpha: effectiveAlpha,
      fontSize: interpFontSize,
      letterSpacing: interpLetterSpacing,
      fontWeight: interpFontWeight,
      color: interpColor,
      ...(interpSpans ? { spans: interpSpans } : {}),
    };
  }

  if (startEl.type === 'bitmap' && endEl.type === 'bitmap') {
    const sBmp = startEl as BitmapElement;
    const eBmp = endEl as BitmapElement;
    const sW = sBmp.width || 200;
    const eW = eBmp.width || 200;
    const sH = sBmp.height || 150;
    const eH = eBmp.height || 150;
    return {
      ...sBmp,
      transform: effectiveTransform,
      alpha: effectiveAlpha,
      width: Math.round(sW + (eW - sW) * t),
      height: Math.round(sH + (eH - sH) * t),
    };
  }

  if (startEl.type === 'video' && endEl.type === 'video') {
    const sVid = startEl as VideoElement;
    const eVid = endEl as VideoElement;
    const sW = sVid.width || 320;
    const eW = eVid.width || 320;
    const sH = sVid.height || 180;
    const eH = eVid.height || 180;
    return {
      ...sVid,
      transform: effectiveTransform,
      alpha: effectiveAlpha,
      width: Math.round(sW + (eW - sW) * t),
      height: Math.round(sH + (eH - sH) * t),
    };
  }

  return {
    ...startEl,
    transform: effectiveTransform,
    alpha: effectiveAlpha,
  };
}

export function parseVideoEmbed(url: string): {
  isEmbed: boolean;
  embedUrl?: string;
  platform: 'youtube' | 'vimeo' | 'video';
} {
  if (!url) return { isEmbed: false, platform: 'video' };

  // YouTube match: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      isEmbed: true,
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}`,
      platform: 'youtube',
    };
  }

  // Vimeo match: vimeo.com/ID
  const vimeoMatch = url.match(
    /(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|))(\d+)/i
  );
  if (vimeoMatch && (vimeoMatch[3] || vimeoMatch[2])) {
    const vimeoId = vimeoMatch[3] || vimeoMatch[2];
    return {
      isEmbed: true,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1`,
      platform: 'vimeo',
    };
  }

  return { isEmbed: false, platform: 'video' };
}

function stageToElementLocal(
  stageX: number,
  stageY: number,
  transform: Transform
): Vector2D {
  const m = Matrix2D.fromTransform(transform);
  const pt = m.inverseTransformPoint({ x: stageX, y: stageY });
  return { x: pt.x, y: pt.y };
}

export function elementLocalToStage(
  localX: number,
  localY: number,
  transform: Transform
): Vector2D {
  const m = Matrix2D.fromTransform(transform);
  const pt = m.transformPoint({ x: localX, y: localY });
  return { x: pt.x, y: pt.y };
}

export const Stage: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const currentTime = useEditorStore((s) => s.currentTime ?? s.currentFrame / (s.doc.stage.fps || 24));
  const activeTool = useEditorStore((s) => s.activeTool);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const fillColor = useEditorStore((s) => s.fillColor);
  const activeFill = useEditorStore((s) => s.activeFill);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const isolationStack = useEditorStore((s) => s.isolationStack);
  const starConfig = useEditorStore((s) => s.starConfig);
  const textSelection = useEditorStore((s) => s.textSelection);
  const previewLocale = useEditorStore((s) => s.previewLocale);
  const activeLocale = previewLocale || doc.i18n?.defaultLocale || 'en';

  const activeTl = getActiveTimeline(doc, isolationStack);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const justCreatedTextIdRef = useRef<string | null>(null);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isSpaceDown, setIsSpaceDown] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // In-place text editing state
  const [editingTextElId, setEditingTextElId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string>('');

  // Sync textDraft from doc if edited externally (e.g. Properties panel)
  useEffect(() => {
    if (editingTextElId) {
      for (const layer of activeTl.layers) {
        const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
        const item = kf?.elements.find((e) => e.id === editingTextElId);
        if (item && item.type === 'text') {
          const t = (item as TextElement).text || '';
          if (t !== textDraft && document.activeElement !== textareaRef.current) {
            setTextDraft(t);
          }
          break;
        }
      }
    }
  }, [doc, editingTextElId, currentTime, currentFrame, activeTl]);

  // Freeform transform dynamic badge
  const [transformBadge, setTransformBadge] = useState<{ x: number; y: number; text: string } | null>(null);

  // Pen tool state: Bézier anchors and hover coordinate
  const [penAnchors, setPenAnchors] = useState<BezierAnchor[]>([]);
  const [penHoverPoint, setPenHoverPoint] = useState<Vector2D | null>(null);

  // Subselect vector anchor state
  const [subselectedAnchor, setSubselectedAnchor] = useState<{
    shapeId: string;
    pathIndex: number;
    anchorIndex: number;
  } | null>(null);

  const [hoveredRotateCorner, setHoveredRotateCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const [hoveredSkewEdge, setHoveredSkewEdge] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rotateDragRef = useRef<{ lastAngle: number; accumulatedRot: number } | null>(null);

  const activeArtboard = getActiveArtboard(doc);
  const width = activeArtboard.width || doc.stage.width || 550;
  const height = activeArtboard.height || doc.stage.height || 400;

  const finishPenDrawing = useCallback(
    (anchors: BezierAnchor[], closed = false) => {
      if (anchors.length < 2) {
        setPenAnchors([]);
        setPenHoverPoint(null);
        return;
      }

      let minX = Infinity;
      let minY = Infinity;

      for (const a of anchors) {
        minX = Math.min(minX, a.x);
        minY = Math.min(minY, a.y);
        if (a.handleIn) {
          minX = Math.min(minX, a.handleIn.x);
          minY = Math.min(minY, a.handleIn.y);
        }
        if (a.handleOut) {
          minX = Math.min(minX, a.handleOut.x);
          minY = Math.min(minY, a.handleOut.y);
        }
      }

      const shiftedAnchors: BezierAnchor[] = anchors.map((a) => ({
        x: Math.round(a.x - minX),
        y: Math.round(a.y - minY),
        handleIn: a.handleIn
          ? { x: Math.round(a.handleIn.x - minX), y: Math.round(a.handleIn.y - minY) }
          : undefined,
        handleOut: a.handleOut
          ? { x: Math.round(a.handleOut.x - minX), y: Math.round(a.handleOut.y - minY) }
          : undefined,
      }));

      const pathD = formatSvgPath(shiftedAnchors, closed);

      const newShape: ShapeElement = {
        id: `shape_pen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'shape',
        transform: {
          x: minX,
          y: minY,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        paths: [
          {
            d: pathD,
            fill: activeFill ?? { type: 'solid', color: fillColor },
            stroke: {
              fill: { type: 'solid', color: strokeColor },
              width: strokeWidth,
              cap: 'round',
              join: 'round',
            },
          },
        ],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(newShape);
      setPenAnchors([]);
      setPenHoverPoint(null);
      editorActions.setActiveTool('select');
    },
    [fillColor, strokeColor, strokeWidth]
  );

  // Spacebar pan key listeners and Escape/Enter handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        setIsSpaceDown(true);
      }
      if (e.key === 'Escape') {
        if (editingTextElId) {
          editorActions.updateElementProps(editingTextElId, { text: textDraft });
          setEditingTextElId(null);
          return;
        }
        if (isolationStack.length > 0) {
          editorActions.exitIsolation();
          return;
        }
        if (penAnchors.length > 0) {
          setPenAnchors([]);
          setPenHoverPoint(null);
        } else {
          editorActions.deselectAll();
          setSubselectedAnchor(null);
        }
      }
      if (e.key === 'Enter' && penAnchors.length >= 2) {
        finishPenDrawing(penAnchors, false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [penAnchors, finishPenDrawing, editingTextElId, textDraft, isolationStack]);

  const getStageCoordinates = useCallback(
    (e: React.MouseEvent | MouseEvent): Vector2D => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: Math.round((e.clientX - rect.left) / zoom),
        y: Math.round((e.clientY - rect.top) / zoom),
      };
    },
    [zoom]
  );

  // Non-passive native wheel listener to intercept pinch-to-zoom and canvas panning
  // without triggering browser-level window zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom on trackpads or Ctrl/Cmd + wheel
        const zoomDelta = -e.deltaY * 0.01;
        const factor = Math.exp(zoomDelta);

        setZoom((prevZoom) => {
          const nextZoom = Math.min(8.0, Math.max(0.15, parseFloat((prevZoom * factor).toFixed(3))));

          // Zoom centered around mouse cursor position
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - rect.width / 2;
          const mouseY = e.clientY - rect.top - rect.height / 2;

          setPanX((px) => px - (mouseX - px) * (nextZoom / prevZoom - 1));
          setPanY((py) => py - (mouseY - py) * (nextZoom / prevZoom - 1));

          return nextZoom;
        });
      } else if (e.shiftKey) {
        // Horizontal scroll
        setPanX((px) => px - e.deltaY);
      } else {
        // Standard two-finger pan
        setPanX((px) => px - e.deltaX);
        setPanY((py) => py - e.deltaY);
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (isSpaceDown || activeTool === 'hand' || e.button === 1) {
      setDragState({
        type: 'pan',
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: panX,
        startPanY: panY,
        initialTransforms: {},
      });
      return;
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (editingTextElId) {
      editorActions.updateElementProps(editingTextElId, { text: textDraft });
      setEditingTextElId(null);
    }

    if (e.button === 2) return; // Right-click handled by onContextMenu

    if (isSpaceDown || activeTool === 'hand' || e.button === 1) {
      handleContainerMouseDown(e);
      return;
    }

    const { x, y } = getStageCoordinates(e);

    if (activeTool === 'pen') {
      if (penAnchors.length > 0) {
        const first = penAnchors[0];
        const dist = Math.hypot(x - first.x, y - first.y);
        if (dist <= 12) {
          // Close path with Bézier curves
          finishPenDrawing(penAnchors, true);
          return;
        }
      }

      const newAnchor: BezierAnchor = { x, y };
      const newIdx = penAnchors.length;
      setPenAnchors((prev) => [...prev, newAnchor]);

      setDragState({
        type: 'pen_drag',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        penAnchorIndex: newIdx,
        initialTransforms: {},
      });
      return;
    }

    if (activeTool === 'rect') {
      setDragState({
        type: 'draw_rect',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        initialTransforms: {},
      });
      return;
    }

    if (activeTool === 'oval') {
      setDragState({
        type: 'draw_oval',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        initialTransforms: {},
      });
      return;
    }

    if (activeTool === 'polygon') {
      const pts = starConfig?.points ?? 5;
      const ratio = starConfig?.pointRatio ?? 0.5;
      setDragState({
        type: 'draw_polygon',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        polygonPoints: pts,
        polygonStarRatio: ratio,
        shiftKey: e.shiftKey,
        initialTransforms: {},
      });
      return;
    }

    if (activeTool === 'text') {
      const newId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const resolvedColor =
        activeFill?.type === 'solid'
          ? activeFill.color
          : activeFill?.type === 'linearGradient' || activeFill?.type === 'radialGradient'
          ? activeFill.stops[0]?.color || fillColor || '#ffffff'
          : fillColor || '#ffffff';

      const newText: TextElement = {
        id: newId,
        type: 'text',
        transform: {
          x,
          y,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Text',
        fontSize: 18,
        color: resolvedColor,
        fill: activeFill ?? { type: 'solid', color: resolvedColor },
        align: 'left',
        width: 140,
        height: 32,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(newText);
      editorActions.selectElement(newId, false);
      setTextDraft('Text');
      setEditingTextElId(newId);
      editorActions.setEditingTextElId(newId);
      justCreatedTextIdRef.current = newId;
      return;
    }

    if (activeTool === 'select' || activeTool === 'subselect') {
      // Start Marquee box selection
      setDragState({
        type: 'marquee',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        initialTransforms: {},
      });
    }
  };

  const handleElementMouseDown = (e: React.MouseEvent, el: EditorElement) => {
    if (e.button === 2) return; // Right-click handled by onContextMenu
    if (isSpaceDown || activeTool === 'hand') return;

    if (activeTool === 'text') {
      if (el.type === 'text') {
        e.stopPropagation();
        editorActions.selectElement(el.id, false);
        setEditingTextElId(el.id);
        editorActions.setEditingTextElId(el.id);
        setTextDraft((el as TextElement).text || '');
        justCreatedTextIdRef.current = el.id;
        return;
      }
      return;
    }

    if (activeTool !== 'select' && activeTool !== 'subselect') return;
    if ((el as any).locked) return;
    e.stopPropagation();

    const isAlreadySelected = selectedElementIds.includes(el.id);
    if (!isAlreadySelected) {
      editorActions.selectElement(el.id, e.shiftKey);
    }

    const { x, y } = getStageCoordinates(e);

    const initialTransforms: Record<string, Transform> = {};
    const ids = isAlreadySelected
      ? selectedElementIds
      : (e.shiftKey ? [...selectedElementIds, el.id] : [el.id]);

    for (const layer of activeTl.layers) {
      const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
      if (!kf) continue;
      for (const item of kf.elements) {
        if (ids.includes(item.id)) {
          initialTransforms[item.id] =
            item.id === el.id ? { ...el.transform } : { ...item.transform };
        }
      }
    }

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'move',
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialTransforms,
    });
  };

  const handleElementDoubleClick = (e: React.MouseEvent, el: EditorElement) => {
    e.stopPropagation();
    if (el.type === 'text') {
      editorActions.selectElement(el.id, false);
      setEditingTextElId(el.id);
      editorActions.setEditingTextElId(el.id);
      setTextDraft((el as TextElement).text || '');
      justCreatedTextIdRef.current = el.id;
    } else if (el.type === 'instance') {
      const inst = el as SymbolInstance;
      editorActions.enterIsolation(inst.symbolId);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (editingTextElId) {
      editorActions.updateElementProps(editingTextElId, { text: textDraft });
      setEditingTextElId(null);
    }
    if (isolationStack.length > 0) {
      editorActions.exitIsolation();
    }
  };

  // 8-Point Transformation Handle Drag
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    el: EditorElement,
    handle: 'tl' | 'tc' | 'tr' | 'mr' | 'br' | 'bc' | 'bl' | 'ml',
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    const sx0 = Math.abs(el.transform.scaleX ?? 1) || 1;
    const sy0 = Math.abs(el.transform.scaleY ?? 1) || 1;
    const isBakedBox =
      el.type === 'shape' || el.type === 'bitmap' || el.type === 'video' || el.type === 'text';

    const normalizedBounds = isBakedBox
      ? {
          x: Math.round(bounds.x * sx0 * 100) / 100,
          y: Math.round(bounds.y * sy0 * 100) / 100,
          width: Math.max(8, Math.round(bounds.width * sx0 * 100) / 100),
          height: Math.max(8, Math.round(bounds.height * sy0 * 100) / 100),
        }
      : bounds;

    const normalizedTransform: Transform = isBakedBox
      ? {
          ...el.transform,
          scaleX: 1,
          scaleY: 1,
          originX: Math.round((el.transform.originX ?? 0) * sx0 * 100) / 100,
          originY: Math.round((el.transform.originY ?? 0) * sy0 * 100) / 100,
        }
      : { ...el.transform };

    const initialPaths =
      el.type === 'shape'
        ? (el as ShapeElement).paths.map((p) => ({
            ...p,
            d:
              sx0 !== 1 || sy0 !== 1
                ? scaleSvgPathD(p.d, bounds, normalizedBounds.width, normalizedBounds.height)
                : p.d,
          }))
        : undefined;

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'resize',
      handle,
      resizeElId: el.id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialTransforms: { [el.id]: normalizedTransform },
      initialBounds: normalizedBounds,
      initialPaths,
    });
  };

  // Direct On-Canvas Rotation
  const handleRotateMouseDown = (
    e: React.MouseEvent,
    el: EditorElement,
    bounds: { x: number; y: number; width: number; height: number },
    cornerHandle?: 'tl' | 'tr' | 'bl' | 'br'
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    const pivotX =
      el.transform.originX !== undefined
        ? el.transform.originX
        : Math.round((bounds.x + bounds.width / 2) * 100) / 100;
    const pivotY =
      el.transform.originY !== undefined
        ? el.transform.originY
        : Math.round((bounds.y + bounds.height / 2) * 100) / 100;

    const rotCenter = elementLocalToStage(pivotX, pivotY, el.transform);

    const startAngle = Math.atan2(y - rotCenter.y, x - rotCenter.x) * (180 / Math.PI);

    rotateDragRef.current = {
      lastAngle: startAngle,
      accumulatedRot: el.transform.rotation ?? 0,
    };

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'rotate',
      handle: cornerHandle,
      resizeElId: el.id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      rotCenter,
      pivotLocal: { x: pivotX, y: pivotY },
      initialRotation: el.transform.rotation ?? 0,
      startAngle,
      initialTransforms: { [el.id]: { ...el.transform } },
    });
  };

  // Draggable Registration Point / Pivot Handle
  const handlePivotMouseDown = (
    e: React.MouseEvent,
    el: EditorElement,
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'pivot',
      resizeElId: el.id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialBounds: bounds,
      initialTransforms: { [el.id]: { ...el.transform } },
    });
  };

  // Skew Handle Drag (shear along X or Y)
  const handleSkewMouseDown = (
    e: React.MouseEvent,
    el: EditorElement,
    axis: 'x' | 'y',
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'skew',
      resizeElId: el.id,
      skewAxis: axis,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialSkewX: el.transform.skewX ?? 0,
      initialSkewY: el.transform.skewY ?? 0,
      initialBounds: bounds,
      initialTransforms: { [el.id]: { ...el.transform } },
    });
  };

  // Subselect Anchor Point Drag
  const handleAnchorMouseDown = (
    e: React.MouseEvent,
    shape: ShapeElement,
    pathIndex: number,
    anchorIndex: number,
    anchor: BezierAnchor
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    setSubselectedAnchor({
      shapeId: shape.id,
      pathIndex,
      anchorIndex,
    });

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'subselect_drag_anchor',
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      subselectShapeId: shape.id,
      subselectPathIndex: pathIndex,
      subselectAnchorIndex: anchorIndex,
      initialAnchorPos: { x: anchor.x, y: anchor.y },
      initialPathD: shape.paths[pathIndex].d,
      initialTransforms: {},
    });
  };

  // Subselect Control Handle Drag
  const handleHandleMouseDown = (
    e: React.MouseEvent,
    shape: ShapeElement,
    pathIndex: number,
    anchorIndex: number,
    handleType: 'in' | 'out'
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    editorActions.commitHistorySnapshot();
    setDragState({
      type: 'subselect_drag_handle',
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      subselectShapeId: shape.id,
      subselectPathIndex: pathIndex,
      subselectAnchorIndex: anchorIndex,
      subselectHandleType: handleType,
      initialPathD: shape.paths[pathIndex].d,
      initialTransforms: {},
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const coords = getStageCoordinates(e);
      setMousePos(coords);

      if (activeTool === 'pen') {
        setPenHoverPoint(coords);
      }

      if (!dragState) return;

      if (dragState.type === 'pan') {
        const dx = e.clientX - (dragState.startClientX ?? 0);
        const dy = e.clientY - (dragState.startClientY ?? 0);
        setPanX((dragState.startPanX ?? 0) + dx);
        setPanY((dragState.startPanY ?? 0) + dy);
        return;
      }

      const { x, y } = coords;

      if (dragState.type === 'move') {
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;

        if (dragState.folderId) {
          const initT = dragState.initialTransforms[dragState.folderId];
          if (initT) {
            editorActions.updateFolderTransform(
              dragState.folderId,
              {
                x: initT.x + dx,
                y: initT.y + dy,
              },
              { skipHistory: true }
            );
          }
        } else {
          for (const [id, initialT] of Object.entries(dragState.initialTransforms)) {
            editorActions.updateElementTransform(
              id,
              {
                x: initialT.x + dx,
                y: initialT.y + dy,
              },
              { skipHistory: true }
            );
          }
        }
      } else if (dragState.type === 'resize' && dragState.folderId && dragState.initialBounds) {
        const initT = dragState.initialTransforms[dragState.folderId] ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 };
        const initB = dragState.initialBounds;
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;
        let newW = initB.width;
        let newH = initB.height;
        if (dragState.handle?.includes('r')) newW += dx;
        if (dragState.handle?.includes('l')) newW -= dx;
        if (dragState.handle?.includes('b')) newH += dy;
        if (dragState.handle?.includes('t')) newH -= dy;
        const sx = (initT.scaleX ?? 1) * (newW / Math.max(1, initB.width));
        const sy = (initT.scaleY ?? 1) * (newH / Math.max(1, initB.height));
        editorActions.updateFolderTransform(
          dragState.folderId,
          {
            scaleX: Math.round(sx * 100) / 100,
            scaleY: Math.round(sy * 100) / 100,
          },
          { skipHistory: true }
        );
      } else if (dragState.type === 'resize' && dragState.resizeElId && dragState.initialBounds) {
        const initT = dragState.initialTransforms[dragState.resizeElId];
        const initB = dragState.initialBounds;

        // Compute mouse delta in the element's local unscaled coordinate space
        // so resizing works naturally even when the element is rotated
        const localStart = stageToElementLocal(dragState.startX, dragState.startY, {
          ...initT,
          scaleX: 1,
          scaleY: 1,
        });
        const localCurr = stageToElementLocal(x, y, {
          ...initT,
          scaleX: 1,
          scaleY: 1,
        });
        const dx = localCurr.x - localStart.x;
        const dy = localCurr.y - localStart.y;

        // Check for 3D Perspective & Distort modifier (Cmd / Ctrl drag)
        if (e.metaKey || e.ctrlKey) {
          const initRotX = initT.rotateX ?? 0;
          const initRotY = initT.rotateY ?? 0;
          const tiltFactor = 0.5;
          let deltaRotX = 0;
          let deltaRotY = 0;

          if (dragState.handle === 'tl' || dragState.handle === 'tr') {
            deltaRotX = -dy * tiltFactor;
          } else if (dragState.handle === 'bl' || dragState.handle === 'br') {
            deltaRotX = dy * tiltFactor;
          }

          if (dragState.handle === 'tl' || dragState.handle === 'bl') {
            deltaRotY = dx * tiltFactor;
          } else if (dragState.handle === 'tr' || dragState.handle === 'br') {
            deltaRotY = -dx * tiltFactor;
          }

          const newRotX = Math.max(-75, Math.min(75, Math.round(initRotX + deltaRotX)));
          const newRotY = Math.max(-75, Math.min(75, Math.round(initRotY + deltaRotY)));

          editorActions.updateElementTransform(
            dragState.resizeElId,
            {
              rotateX: newRotX,
              rotateY: newRotY,
              perspective: initT.perspective || 800,
            },
            { skipHistory: true }
          );

          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Perspective: Tilt X: ${newRotX}°, Tilt Y: ${newRotY}°`,
          });
          return;
        }

        // Locate target element
        let targetEl: EditorElement | undefined;
        for (const l of activeTl.layers) {
          const kf = findKeyframeAtTime(l, currentTime) ?? findKeyframeAt(l, currentFrame);
          const found = kf?.elements.find((el) => el.id === dragState.resizeElId);
          if (found) {
            targetEl = found;
            break;
          }
        }

        const minW = targetEl?.type === 'text' ? 30 : 8;
        const minH = targetEl?.type === 'text' ? 20 : 8;

        let newW = initB.width;
        let newH = initB.height;

        switch (dragState.handle) {
          case 'br':
            newW = Math.max(minW, initB.width + dx);
            newH = Math.max(minH, initB.height + dy);
            break;
          case 'bl':
            newW = Math.max(minW, initB.width - dx);
            newH = Math.max(minH, initB.height + dy);
            break;
          case 'tr':
            newW = Math.max(minW, initB.width + dx);
            newH = Math.max(minH, initB.height - dy);
            break;
          case 'tl':
            newW = Math.max(minW, initB.width - dx);
            newH = Math.max(minH, initB.height - dy);
            break;
          case 'tc':
            newH = Math.max(minH, initB.height - dy);
            break;
          case 'bc':
            newH = Math.max(minH, initB.height + dy);
            break;
          case 'ml':
            newW = Math.max(minW, initB.width - dx);
            break;
          case 'mr':
            newW = Math.max(minW, initB.width + dx);
            break;
        }

        if (
          e.shiftKey &&
          (dragState.handle === 'tl' ||
            dragState.handle === 'tr' ||
            dragState.handle === 'bl' ||
            dragState.handle === 'br')
        ) {
          const ratio = initB.width / Math.max(1, initB.height);
          if (Math.abs(newW / initB.width - 1) >= Math.abs(newH / initB.height - 1)) {
            newH = Math.max(minH, newW / ratio);
          } else {
            newW = Math.max(minW, newH * ratio);
          }
        }

        newW = Math.round(newW * 100) / 100;
        newH = Math.round(newH * 100) / 100;

        // Determine opposite corner/edge anchor so it stays fixed on Stage
        let anchorOld = { x: initB.x, y: initB.y };
        let anchorNew = { x: initB.x, y: initB.y };
        if (dragState.handle === 'tl') {
          anchorOld = { x: initB.x + initB.width, y: initB.y + initB.height };
          anchorNew = { x: initB.x + newW, y: initB.y + newH };
        } else if (dragState.handle === 'tr' || dragState.handle === 'tc') {
          anchorOld = { x: initB.x, y: initB.y + initB.height };
          anchorNew = { x: initB.x, y: initB.y + newH };
        } else if (dragState.handle === 'bl' || dragState.handle === 'ml') {
          anchorOld = { x: initB.x + initB.width, y: initB.y };
          anchorNew = { x: initB.x + newW, y: initB.y };
        }

        const hasCustomOrigin = (initT.originX ?? 0) !== 0 || (initT.originY ?? 0) !== 0;
        const newOriginX = hasCustomOrigin
          ? Math.round(
              (initB.x +
                (((initT.originX ?? 0) - initB.x) / Math.max(1, initB.width)) * newW) *
                100
            ) / 100
          : 0;
        const newOriginY = hasCustomOrigin
          ? Math.round(
              (initB.y +
                (((initT.originY ?? 0) - initB.y) / Math.max(1, initB.height)) * newH) *
                100
            ) / 100
          : 0;

        const anchorStage = elementLocalToStage(anchorOld.x, anchorOld.y, initT);
        const anchorAtZero = elementLocalToStage(anchorNew.x, anchorNew.y, {
          ...initT,
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          originX: newOriginX,
          originY: newOriginY,
        });
        const newX = Math.round((anchorStage.x - anchorAtZero.x) * 100) / 100;
        const newY = Math.round((anchorStage.y - anchorAtZero.y) * 100) / 100;

        const updatedTransform: Transform = {
          ...initT,
          x: newX,
          y: newY,
          scaleX: 1,
          scaleY: 1,
          originX: newOriginX,
          originY: newOriginY,
        };

        if (targetEl?.type === 'shape' && dragState.initialPaths) {
          const scaledPaths = dragState.initialPaths.map((p) => ({
            ...p,
            d: scaleSvgPathD(p.d, initB, newW, newH),
          }));
          editorActions.updateElementProps(
            dragState.resizeElId,
            {
              paths: scaledPaths,
              transform: updatedTransform,
            },
            { skipHistory: true }
          );
          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Size: ${Math.round(newW)} × ${Math.round(newH)} px`,
          });
          return;
        }

        if (
          targetEl?.type === 'bitmap' ||
          targetEl?.type === 'video' ||
          targetEl?.type === 'text'
        ) {
          editorActions.updateElementProps(
            dragState.resizeElId,
            {
              width: Math.round(newW),
              height: Math.round(newH),
              ...(targetEl.type === 'text' ? { multiline: true } : {}),
              transform: updatedTransform,
            },
            { skipHistory: true }
          );
          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Size: ${Math.round(newW)} × ${Math.round(newH)} px`,
          });
          return;
        }

        // SymbolInstance fallback: scaleX / scaleY
        const scaleFactorX = newW / Math.max(1, initB.width);
        const scaleFactorY = newH / Math.max(1, initB.height);
        editorActions.updateElementTransform(
          dragState.resizeElId,
          {
            scaleX: Math.round((initT.scaleX ?? 1) * scaleFactorX * 1000) / 1000,
            scaleY: Math.round((initT.scaleY ?? 1) * scaleFactorY * 1000) / 1000,
          },
          { skipHistory: true }
        );
        setTransformBadge({
          x: e.clientX,
          y: e.clientY - 28,
          text: `Scale: ${Math.round((initT.scaleX ?? 1) * scaleFactorX * 100)}% × ${Math.round((initT.scaleY ?? 1) * scaleFactorY * 100)}%`,
        });
      } else if (dragState.type === 'rotate' && dragState.folderId && dragState.rotCenter) {
        const currentAngle =
          Math.atan2(y - dragState.rotCenter.y, x - dragState.rotCenter.x) * (180 / Math.PI);
        if (!rotateDragRef.current) {
          rotateDragRef.current = {
            lastAngle: dragState.startAngle ?? currentAngle,
            accumulatedRot: dragState.initialRotation ?? 0,
          };
        }
        let delta = currentAngle - rotateDragRef.current.lastAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        rotateDragRef.current.accumulatedRot += delta;
        rotateDragRef.current.lastAngle = currentAngle;

        let newRot = Math.round(rotateDragRef.current.accumulatedRot);
        if (e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15;
        }
        editorActions.updateFolderTransform(
          dragState.folderId,
          {
            rotation: newRot,
          },
          { skipHistory: true }
        );
        setTransformBadge({ x: e.clientX, y: e.clientY - 28, text: `Folder Rotation: ${newRot}°` });
      } else if (dragState.type === 'rotate' && dragState.resizeElId && dragState.rotCenter) {
        const currentAngle =
          Math.atan2(y - dragState.rotCenter.y, x - dragState.rotCenter.x) * (180 / Math.PI);
        if (!rotateDragRef.current) {
          rotateDragRef.current = {
            lastAngle: dragState.startAngle ?? currentAngle,
            accumulatedRot: dragState.initialRotation ?? 0,
          };
        }
        let delta = currentAngle - rotateDragRef.current.lastAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        rotateDragRef.current.accumulatedRot += delta;
        rotateDragRef.current.lastAngle = currentAngle;

        let newRot = Math.round(rotateDragRef.current.accumulatedRot);
        if (e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15;
        }
        editorActions.updateElementTransform(
          dragState.resizeElId,
          {
            rotation: newRot,
          },
          { skipHistory: true }
        );
        setTransformBadge({ x: e.clientX, y: e.clientY - 28, text: `Rotation: ${newRot}°` });
      } else if (dragState.type === 'pivot' && dragState.resizeElId) {
        const initT = dragState.initialTransforms[dragState.resizeElId] ?? {};
        const localPt = stageToElementLocal(x, y, initT as Transform);
        const originX = Math.round(localPt.x);
        const originY = Math.round(localPt.y);
        const newStageOrigin = elementLocalToStage(originX, originY, initT as Transform);
        editorActions.updateElementTransform(
          dragState.resizeElId,
          {
            x: Math.round(newStageOrigin.x * 100) / 100,
            y: Math.round(newStageOrigin.y * 100) / 100,
            originX,
            originY,
          },
          { skipHistory: true }
        );
        setTransformBadge({
          x: e.clientX,
          y: e.clientY - 28,
          text: `Pivot: (${originX}, ${originY})`,
        });
      } else if (dragState.type === 'skew' && dragState.resizeElId && dragState.skewAxis) {
        const initT = dragState.initialTransforms[dragState.resizeElId] ?? {};
        const localStart = stageToElementLocal(
          dragState.startX,
          dragState.startY,
          initT as Transform
        );
        const localCurrent = stageToElementLocal(x, y, initT as Transform);

        if (dragState.skewAxis === 'x') {
          const localDx = localCurrent.x - localStart.x;
          const h = dragState.initialBounds?.height || 50;
          const deltaDeg = Math.atan2(localDx, h) * (180 / Math.PI);
          let newSkewX = Math.round((dragState.initialSkewX ?? 0) + deltaDeg);
          if (e.shiftKey) {
            newSkewX = Math.round(newSkewX / 15) * 15;
          }
          newSkewX = Math.max(-85, Math.min(85, newSkewX));
          editorActions.updateElementTransform(
            dragState.resizeElId,
            { skewX: newSkewX },
            { skipHistory: true }
          );
          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Skew X: ${newSkewX}°`,
          });
        } else {
          const localDy = localCurrent.y - localStart.y;
          const w = dragState.initialBounds?.width || 50;
          const deltaDeg = Math.atan2(localDy, w) * (180 / Math.PI);
          let newSkewY = Math.round((dragState.initialSkewY ?? 0) + deltaDeg);
          if (e.shiftKey) {
            newSkewY = Math.round(newSkewY / 15) * 15;
          }
          newSkewY = Math.max(-85, Math.min(85, newSkewY));
          editorActions.updateElementTransform(
            dragState.resizeElId,
            { skewY: newSkewY },
            { skipHistory: true }
          );
          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Skew Y: ${newSkewY}°`,
          });
        }
      } else if (dragState.type === 'pen_drag' && dragState.penAnchorIndex !== undefined) {
        const idx = dragState.penAnchorIndex;
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;

        if (Math.hypot(dx, dy) > 2) {
          setPenAnchors((prev) => {
            const updated = [...prev];
            if (updated[idx]) {
              updated[idx] = {
                ...updated[idx],
                handleOut: { x: dragState.startX + dx, y: dragState.startY + dy },
                handleIn: { x: dragState.startX - dx, y: dragState.startY - dy },
              };
            }
            return updated;
          });
        }
      } else if (
        dragState.type === 'subselect_drag_anchor' &&
        dragState.subselectShapeId &&
        dragState.initialPathD &&
        dragState.subselectAnchorIndex !== undefined
      ) {
        let targetEl: ShapeElement | undefined;
        for (const l of activeTl.layers) {
          const kf = findKeyframeAt(l, currentFrame);
          const el = kf?.elements.find((e) => e.id === dragState.subselectShapeId);
          if (el && el.type === 'shape') {
            targetEl = el as ShapeElement;
            break;
          }
        }

        if (targetEl) {
          const startLocal = stageToElementLocal(
            dragState.startX,
            dragState.startY,
            targetEl.transform
          );
          const currLocal = stageToElementLocal(x, y, targetEl.transform);
          const localDx = currLocal.x - startLocal.x;
          const localDy = currLocal.y - startLocal.y;

          const updatedD = updatePathAnchor(
            dragState.initialPathD,
            dragState.subselectAnchorIndex,
            { delta: { x: localDx, y: localDy } }
          );

          const newPaths = [...targetEl.paths];
          newPaths[dragState.subselectPathIndex ?? 0] = {
            ...newPaths[dragState.subselectPathIndex ?? 0],
            d: updatedD,
          };

          editorActions.updateElementProps(
            targetEl.id,
            { paths: newPaths, isCustomizedPath: true },
            { skipHistory: true }
          );
        }
      } else if (
        dragState.type === 'subselect_drag_handle' &&
        dragState.subselectShapeId &&
        dragState.initialPathD &&
        dragState.subselectAnchorIndex !== undefined
      ) {
        let targetEl: ShapeElement | undefined;
        for (const l of activeTl.layers) {
          const kf = findKeyframeAtTime(l, currentTime) ?? findKeyframeAt(l, currentFrame);
          const el = kf?.elements.find((e) => e.id === dragState.subselectShapeId);
          if (el && el.type === 'shape') {
            targetEl = el as ShapeElement;
            break;
          }
        }

        if (targetEl) {
          const currLocal = stageToElementLocal(x, y, targetEl.transform);
          const handleProp =
            dragState.subselectHandleType === 'in' ? 'handleIn' : 'handleOut';

          const updatedD = updatePathAnchor(
            dragState.initialPathD,
            dragState.subselectAnchorIndex,
            { [handleProp]: currLocal }
          );

          const newPaths = [...targetEl.paths];
          newPaths[dragState.subselectPathIndex ?? 0] = {
            ...newPaths[dragState.subselectPathIndex ?? 0],
            d: updatedD,
          };

          editorActions.updateElementProps(
            targetEl.id,
            { paths: newPaths, isCustomizedPath: true },
            { skipHistory: true }
          );
        }
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentX: x,
              currentY: y,
              shiftKey: e.shiftKey !== undefined ? e.shiftKey : prev.shiftKey,
            }
          : null
      );
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState) return;
      setTransformBadge(null);
      rotateDragRef.current = null;

      if (
        dragState.type === 'pan' ||
        dragState.type === 'pen_drag' ||
        dragState.type === 'subselect_drag_anchor' ||
        dragState.type === 'subselect_drag_handle' ||
        dragState.type === 'rotate' ||
        dragState.type === 'pivot' ||
        dragState.type === 'skew'
      ) {
        if (
          (dragState.type === 'subselect_drag_anchor' ||
            dragState.type === 'subselect_drag_handle') &&
          dragState.subselectShapeId &&
          (dragState.currentX !== dragState.startX || dragState.currentY !== dragState.startY)
        ) {
          editorActions.updateElementProps(
            dragState.subselectShapeId,
            { isCustomizedPath: true },
            { skipHistory: true }
          );
        }
        setDragState(null);
        return;
      }

      const { x, y } = getStageCoordinates(e);

      if (dragState.type === 'marquee') {
        const mx1 = Math.min(dragState.startX, x);
        const my1 = Math.min(dragState.startY, y);
        const mx2 = Math.max(dragState.startX, x);
        const my2 = Math.max(dragState.startY, y);

        if (mx2 - mx1 > 4 || my2 - my1 > 4) {
          const matchedIds: string[] = [];
          for (const layer of activeTl.layers) {
            if (!layer.visible) continue;
            const kf = findKeyframeAt(layer, currentFrame);
            if (!kf) continue;
            for (const el of kf.elements) {
              const bounds = getElementBounds(el);
              const elX1 = el.transform.x + bounds.x;
              const elY1 = el.transform.y + bounds.y;
              const elX2 = elX1 + bounds.width * (el.transform.scaleX ?? 1);
              const elY2 = elY1 + bounds.height * (el.transform.scaleY ?? 1);

              if (elX1 <= mx2 && elX2 >= mx1 && elY1 <= my2 && elY2 >= my1) {
                matchedIds.push(el.id);
              }
            }
          }
          editorActions.selectElements(matchedIds);
        } else {
          editorActions.deselectAll();
          setSubselectedAnchor(null);
        }
      } else if (dragState.type === 'draw_rect') {
        const rx = Math.min(dragState.startX, x);
        const ry = Math.min(dragState.startY, y);
        const rw = Math.max(8, Math.abs(x - dragState.startX));
        const rh = Math.max(8, Math.abs(y - dragState.startY));
        const cx = Math.round((rw / 2) * 100) / 100;
        const cy = Math.round((rh / 2) * 100) / 100;

        const newRect: ShapeElement = {
          id: `rect_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: Math.round((rx + cx) * 100) / 100,
            y: Math.round((ry + cy) * 100) / 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            skewX: 0,
            skewY: 0,
            originX: cx,
            originY: cy,
          },
          paths: [
            {
              d: `M 0 0 L ${rw} 0 L ${rw} ${rh} L 0 ${rh} Z`,
              fill: activeFill ?? { type: 'solid', color: fillColor },
              stroke: {
                fill: { type: 'solid', color: strokeColor },
                width: strokeWidth,
                cap: 'round',
                join: 'round',
              },
            },
          ],
          alpha: 1,
          visible: true,
        };

        editorActions.addElement(newRect);
        editorActions.setActiveTool('select');
      } else if (dragState.type === 'draw_oval') {
        const rx = Math.min(dragState.startX, x);
        const ry = Math.min(dragState.startY, y);
        const rw = Math.max(8, Math.abs(x - dragState.startX));
        const rh = Math.max(8, Math.abs(y - dragState.startY));
        const rX = rw / 2;
        const rY = rh / 2;
        const cx = Math.round(rX * 100) / 100;
        const cy = Math.round(rY * 100) / 100;

        const newOval: ShapeElement = {
          id: `oval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: Math.round((rx + cx) * 100) / 100,
            y: Math.round((ry + cy) * 100) / 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            skewX: 0,
            skewY: 0,
            originX: cx,
            originY: cy,
          },
          paths: [
            {
              d: `M 0 ${rY} a ${rX} ${rY} 0 1 0 ${rw} 0 a ${rX} ${rY} 0 1 0 ${-rw} 0 Z`,
              fill: activeFill ?? { type: 'solid', color: fillColor },
              stroke: {
                fill: { type: 'solid', color: strokeColor },
                width: strokeWidth,
                cap: 'round',
                join: 'round',
              },
            },
          ],
          alpha: 1,
          visible: true,
        };

        editorActions.addElement(newOval);
        editorActions.setActiveTool('select');
      } else if (dragState.type === 'draw_polygon') {
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;
        const rawRadius = Math.hypot(dx, dy);
        const radius = Math.max(8, rawRadius);
        const pts = dragState.polygonPoints ?? 5;
        const ratio = dragState.polygonStarRatio ?? 0.5;
        let angle = rawRadius < 4 ? -Math.PI / 2 : Math.atan2(dy, dx);
        if (e.shiftKey || dragState.shiftKey) {
          const snap = Math.PI / 12; // 15 degrees
          angle = Math.round(angle / snap) * snap;
        }

        const pathD = generatePolygonStarPath(radius, radius, radius, pts, ratio, angle);

        const newPoly: ShapeElement = {
          id: `poly_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: dragState.startX,
            y: dragState.startY,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            skewX: 0,
            skewY: 0,
            originX: radius,
            originY: radius,
          },
          paths: [
            {
              d: pathD,
              fill: activeFill ?? { type: 'solid', color: fillColor },
              stroke: {
                fill: { type: 'solid', color: strokeColor },
                width: strokeWidth,
                cap: 'round',
                join: 'round',
              },
            },
          ],
          alpha: 1,
          visible: true,
        };

        (newPoly as any).starConfig = {
          points: pts,
          pointRatio: ratio,
          outerRadius: radius,
          startAngle: angle,
        };

        editorActions.addElement(newPoly);
        editorActions.setActiveTool('select');
      }

      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (dragState && dragState.type === 'draw_polygon') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon'
              ? { ...prev, polygonPoints: Math.min(32, (prev.polygonPoints ?? 5) + 1) }
              : prev
          );
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon'
              ? { ...prev, polygonPoints: Math.max(3, (prev.polygonPoints ?? 5) - 1) }
              : prev
          );
        } else if (e.key === 'ArrowLeft' || e.key === '[') {
          e.preventDefault();
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon'
              ? {
                  ...prev,
                  polygonStarRatio: Math.max(
                    0.05,
                    Math.round(((prev.polygonStarRatio ?? 0.5) - 0.05) * 100) / 100
                  ),
                }
              : prev
          );
        } else if (e.key === 'ArrowRight' || e.key === ']') {
          e.preventDefault();
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon'
              ? {
                  ...prev,
                  polygonStarRatio: Math.min(
                    3.0,
                    Math.round(((prev.polygonStarRatio ?? 0.5) + 0.05) * 100) / 100
                  ),
                }
              : prev
          );
        } else if (e.key === 'Shift') {
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon' ? { ...prev, shiftKey: true } : prev
          );
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (dragState && dragState.type === 'draw_polygon') {
        if (e.key === 'Shift') {
          setDragState((prev) =>
            prev && prev.type === 'draw_polygon' ? { ...prev, shiftKey: false } : prev
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    dragState,
    fillColor,
    strokeColor,
    strokeWidth,
    activeTool,
    activeTl.layers,
    currentFrame,
    getStageCoordinates,
  ]);

  // Zoom helpers
  const handleZoomFit = () => {
    if (!containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const pad = 80;
    const availableW = Math.max(100, container.width - pad);
    const availableH = Math.max(100, container.height - pad);
    const fitW = availableW / width;
    const fitH = availableH / height;
    const fit = Math.min(fitW, fitH, 2.5);
    setZoom(Math.max(0.25, parseFloat(fit.toFixed(2))));
    setPanX(0);
    setPanY(0);
  };

  const handleZoomReset = () => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(8.0, parseFloat((z + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))));
  };

  // Context Menu Handlers
  const handleStageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Add Keyframe', shortcut: 'F6', action: () => editorActions.insertKeyframe() },
        { label: 'Add Blank Keyframe', shortcut: 'F7', action: () => editorActions.insertBlankKeyframe() },
        { separator: true },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => editorActions.pasteElements() },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => editorActions.selectAll() },
        { separator: true },
        { label: 'Stage Properties', action: () => editorActions.deselectAll() },
        { label: 'Zoom to Fit', action: handleZoomFit },
        { label: 'Reset Zoom (100%)', action: handleZoomReset },
      ],
    });
  };

  const handleShapeContextMenu = (e: React.MouseEvent, el: EditorElement) => {
    e.preventDefault();
    e.stopPropagation();
    editorActions.selectElement(el.id);
    const otherArtboards =
      doc.artboards && doc.artboards.length > 1
        ? doc.artboards.filter((a) => a.id !== activeArtboard.id)
        : [];
    const moveArtboardItems = otherArtboards.map((ab) => ({
      label: `Move to Artboard "${ab.name}"`,
      action: () => editorActions.moveElementToArtboard(el.id, ab.id),
    }));

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Convert to Component (F8)',
          shortcut: 'F8',
          action: () => editorActions.setConvertToComponentModalOpen(true),
        },
        {
          label: 'Group Selection',
          shortcut: 'Ctrl+G',
          action: () => editorActions.groupSelectedElements(),
        },
        {
          label: 'Ungroup',
          shortcut: 'Ctrl+Shift+G',
          action: () => editorActions.ungroupSelectedElements(),
          disabled: el.type !== 'instance',
        },
        { separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => editorActions.cutSelectedElements() },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => editorActions.copySelectedElements() },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => editorActions.duplicateSelectedElements() },
        { separator: true },
        { label: 'Bring Forward', action: () => editorActions.bringElementForward(el.id) },
        { label: 'Send Backward', action: () => editorActions.sendElementBackward(el.id) },
        { label: 'Bring to Front', action: () => editorActions.bringToFront(el.id) },
        { label: 'Send to Back', action: () => editorActions.sendToBack(el.id) },
        { separator: true },
        {
          label: 'Add Motion Tween',
          action: () => {
            const targetLayer = selectedLayerId ?? activeTl.layers[0]?.id;
            if (targetLayer) editorActions.createMotionTween(targetLayer, currentFrame);
          },
        },
        ...(moveArtboardItems.length > 0
          ? [{ separator: true }, ...moveArtboardItems]
          : []),
        {
          label: 'Delete',
          shortcut: 'Del',
          danger: true,
          action: () => editorActions.deleteSelectedElements(),
        },
      ],
    });
  };

  const handleTextContextMenu = (e: React.MouseEvent, el: EditorElement) => {
    e.preventDefault();
    e.stopPropagation();
    editorActions.selectElement(el.id);

    const otherArtboards =
      doc.artboards && doc.artboards.length > 1
        ? doc.artboards.filter((a) => a.id !== activeArtboard.id)
        : [];
    const moveArtboardItems = otherArtboards.map((ab) => ({
      label: `Move to Artboard "${ab.name}"`,
      action: () => editorActions.moveElementToArtboard(el.id, ab.id),
    }));

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Edit Text (Double-click)',
          action: () => {
            setEditingTextElId(el.id);
            setTextDraft((el as TextElement).text || '');
          },
        },
        {
          label: 'Group Selection',
          shortcut: 'Ctrl+G',
          action: () => editorActions.groupSelectedElements(),
        },
        {
          label: 'Add Web Font...',
          action: () => editorActions.setAddFontModalOpen(true),
        },
        {
          label: 'Convert to Component (F8)',
          shortcut: 'F8',
          action: () => editorActions.setConvertToComponentModalOpen(true),
        },
        {
          label: 'Bring Forward',
          action: () => editorActions.bringElementForward(el.id),
        },
        {
          label: 'Send Backward',
          action: () => editorActions.sendElementBackward(el.id),
        },
        ...(moveArtboardItems.length > 0
          ? [{ separator: true }, ...moveArtboardItems]
          : []),
        { separator: true },
        {
          label: 'Delete',
          shortcut: 'Del',
          danger: true,
          action: () => editorActions.deleteSelectedElements(),
        },
      ],
    });
  };

  // Render element content based on its type
  const renderElementContent = (el: EditorElement, overrideShape?: ShapeElement): React.ReactNode => {
    if (el.type === 'shape') {
      const shape = overrideShape ?? (el as ShapeElement);
      const bounds = getShapeBounds(shape);
      const isSelectMode = activeTool === 'select' || activeTool === 'subselect';

      return (
        <svg
          style={{
            overflow: 'visible',
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
          }}
          width={bounds.width || 1}
          height={bounds.height || 1}
        >
          <defs>
            {shape.paths.map((p, pIdx) => {
              if (!p.fill) return null;
              const gradId = `stage_grad_${shape.id}_${pIdx}`;
              if (p.fill.type === 'linearGradient') {
                const rad = (p.fill.angle * Math.PI) / 180;
                const dx = Math.cos(rad) / 2;
                const dy = Math.sin(rad) / 2;
                return (
                  <linearGradient
                    key={gradId}
                    id={gradId}
                    x1={0.5 - dx}
                    y1={0.5 - dy}
                    x2={0.5 + dx}
                    y2={0.5 + dy}
                  >
                    {p.fill.stops.map((st, si) => (
                      <stop key={si} offset={`${st.offset * 100}%`} stopColor={st.color} />
                    ))}
                  </linearGradient>
                );
              }
              if (p.fill.type === 'radialGradient') {
                return (
                  <radialGradient
                    key={gradId}
                    id={gradId}
                    cx={p.fill.cx}
                    cy={p.fill.cy}
                    r={p.fill.r}
                    fx={p.fill.focalX}
                    fy={p.fill.focalY}
                  >
                    {p.fill.stops.map((st, si) => (
                      <stop key={si} offset={`${st.offset * 100}%`} stopColor={st.color} />
                    ))}
                  </radialGradient>
                );
              }
              return null;
            })}
          </defs>
          {shape.paths.map((p, idx) => {
            let fillPaint = 'none';
            if (p.fill) {
              if (p.fill.type === 'solid') {
                fillPaint = p.fill.color;
              } else if (p.fill.type === 'linearGradient' || p.fill.type === 'radialGradient') {
                fillPaint = `url(#stage_grad_${shape.id}_${idx})`;
              }
            }
            const sWidth = p.stroke?.width ?? 0;
            const strokePaint =
              sWidth > 0 && p.stroke && p.stroke.fill && p.stroke.fill.type === 'solid'
                ? (p.stroke.fill as { color: string }).color
                : 'none';

            return (
              <path
                key={idx}
                d={p.d}
                fill={fillPaint}
                stroke={strokePaint}
                strokeWidth={sWidth}
                strokeLinecap={p.stroke?.cap ?? 'round'}
                strokeLinejoin={p.stroke?.join ?? 'round'}
                className={styles.elementPath}
                style={{
                  pointerEvents: 'all',
                  cursor: isSelectMode ? 'move' : 'default',
                }}
                onContextMenu={(e) => handleShapeContextMenu(e, el)}
              />
            );
          })}
        </svg>
      );
    }

    if (el.type === 'text') {
      const textEl = el as TextElement;
      const fontAsset = doc.library.fonts[textEl.fontId];
      const resolvedFamily = fontAsset
        ? `"${fontAsset.family}", sans-serif`
        : textEl.fontId && textEl.fontId !== 'default'
        ? `"${textEl.fontId}", sans-serif`
        : 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

      if (editingTextElId === el.id) {
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <textarea
              ref={(ta) => {
                textareaRef.current = ta;
                if (ta) {
                  ta.focus();
                  if (justCreatedTextIdRef.current === el.id) {
                    ta.select();
                    justCreatedTextIdRef.current = null;
                  }
                }
              }}
              className={styles.inlineTextEditor}
              style={{
                padding: 0,
                margin: 0,
                border: 'none',
                boxSizing: 'border-box',
                width: textEl.width ? `${textEl.width}px` : 'auto',
                minWidth: '80px',
                height: textEl.height ? `${textEl.height}px` : 'auto',
                minHeight: `${Math.round((textEl.fontSize || 16) * 1.5)}px`,
                fontSize: `${textEl.fontSize || 16}px`,
                fontWeight: textEl.fontWeight !== undefined ? textEl.fontWeight : 400,
                fontStyle: textEl.fontStyle || 'normal',
                textDecoration: textEl.textDecoration || 'none',
                lineHeight: textEl.lineHeight ? String(textEl.lineHeight) : 1.2,
                letterSpacing:
                  textEl.letterSpacing !== undefined ? `${textEl.letterSpacing}px` : undefined,
                color: textEl.color || '#ffffff',
                caretColor: 'var(--mx-accent, #3b82f6)',
                zIndex: 1000,
                textAlign: textEl.align || 'left',
                fontFamily: resolvedFamily,
                whiteSpace: textEl.multiline ? 'pre-wrap' : 'nowrap',
              }}
              value={textDraft}
              onChange={(e) => {
                const val = e.target.value;
                setTextDraft(val);
                editorActions.updateElementProps(el.id, { text: val });
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  editorActions.updateElementProps(el.id, { text: textDraft });
                  setEditingTextElId(null);
                  editorActions.setEditingTextElId(null);
                  editorActions.setTextSelection(null);
                }
                if (e.key === 'Enter' && !textEl.multiline && !e.shiftKey) {
                  e.preventDefault();
                  editorActions.updateElementProps(el.id, { text: textDraft });
                  setEditingTextElId(null);
                  editorActions.setEditingTextElId(null);
                  editorActions.setTextSelection(null);
                }
              }}
              onBlur={() => {
                editorActions.updateElementProps(el.id, { text: textDraft });
                setEditingTextElId(null);
                editorActions.setEditingTextElId(null);
                editorActions.setTextSelection(null);
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        );
      }

      // Text aligned to an undulating path
      if (textEl.pathConfig?.pathData) {
        const pathId = `stage_text_path_${textEl.id}`;
        const offset =
          textEl.pathConfig.startOffset !== undefined ? `${textEl.pathConfig.startOffset}%` : '0%';
        const isSelectMode = activeTool === 'select' || activeTool === 'subselect';

        return (
          <svg
            style={{
              overflow: 'visible',
              position: 'absolute',
              left: 0,
              top: 0,
              width: textEl.width ? `${textEl.width}px` : 'auto',
              height: textEl.height ? `${textEl.height}px` : 'auto',
              pointerEvents: 'all',
              cursor: isSelectMode ? 'move' : 'default',
            }}
            onContextMenu={(e) => handleTextContextMenu(e, el)}
          >
            <defs>
              <path id={pathId} d={textEl.pathConfig.pathData} />
            </defs>
            <text
              fontFamily={resolvedFamily}
              fontSize={`${textEl.fontSize || 16}px`}
              fontWeight={textEl.fontWeight !== undefined ? textEl.fontWeight : 400}
              fontStyle={textEl.fontStyle || 'normal'}
              letterSpacing={
                textEl.letterSpacing !== undefined ? `${textEl.letterSpacing}px` : undefined
              }
              fill={textEl.color || '#ffffff'}
            >
              <textPath href={`#${pathId}`} startOffset={offset}>
                {(textEl.i18nKey && doc.i18n?.locales?.[activeLocale]?.[textEl.i18nKey]) || textEl.text}
              </textPath>
            </text>
          </svg>
        );
      }

      const isGradientText =
        textEl.fill &&
        (textEl.fill.type === 'linearGradient' || textEl.fill.type === 'radialGradient');
      const textBg = isGradientText ? fillToCSS(textEl.fill, doc.library as any) : undefined;

      return (
        <div
          onContextMenu={(e) => handleTextContextMenu(e, el)}
          style={{
            padding: 0,
            margin: 0,
            border: 'none',
            boxSizing: 'border-box',
            width: textEl.width ? `${textEl.width}px` : 'auto',
            height: textEl.height ? `${textEl.height}px` : 'auto',
            fontSize: `${textEl.fontSize || 16}px`,
            fontWeight: textEl.fontWeight !== undefined ? textEl.fontWeight : 400,
            fontStyle: textEl.fontStyle || 'normal',
            textDecoration: textEl.textDecoration || 'none',
            lineHeight: textEl.lineHeight ? String(textEl.lineHeight) : 1.2,
            letterSpacing:
              textEl.letterSpacing !== undefined ? `${textEl.letterSpacing}px` : undefined,
            color: isGradientText ? 'transparent' : textEl.color || '#ffffff',
            background: textBg,
            WebkitBackgroundClip: isGradientText ? 'text' : undefined,
            backgroundClip: isGradientText ? 'text' : undefined,
            WebkitTextFillColor: isGradientText ? 'transparent' : undefined,
            textAlign: textEl.align || 'left',
            fontFamily: resolvedFamily,
            whiteSpace: textEl.multiline ? 'pre-wrap' : 'nowrap',
            userSelect: 'none',
            cursor: activeTool === 'select' || activeTool === 'subselect' ? 'move' : 'default',
          }}
        >
          {textEl.spans && textEl.spans.length > 0
            ? textEl.spans.map((sp, idx) => {
                const spanFont = sp.fontId ? doc.library.fonts[sp.fontId] : undefined;
                const spanFamily = spanFont
                  ? `"${spanFont.family}", sans-serif`
                  : sp.fontId && sp.fontId !== 'default'
                  ? `"${sp.fontId}", sans-serif`
                  : undefined;
                const isSpanGrad =
                  sp.fill &&
                  (sp.fill.type === 'linearGradient' || sp.fill.type === 'radialGradient');
                const spanGradBg = isSpanGrad ? fillToCSS(sp.fill, doc.library as any) : undefined;

                return (
                  <span
                    key={sp.id || idx}
                    style={{
                      fontFamily: spanFamily,
                      fontSize: sp.fontSize !== undefined ? `${sp.fontSize}px` : undefined,
                      fontWeight: sp.fontWeight !== undefined ? sp.fontWeight : undefined,
                      fontStyle: sp.fontStyle !== undefined ? sp.fontStyle : undefined,
                      textDecoration:
                        sp.textDecoration !== undefined ? sp.textDecoration : undefined,
                      letterSpacing:
                        sp.letterSpacing !== undefined ? `${sp.letterSpacing}px` : undefined,
                      color: isSpanGrad
                        ? 'transparent'
                        : sp.color ||
                          (sp.fill?.type === 'solid' ? sp.fill.color : undefined),
                      background: spanGradBg,
                      WebkitBackgroundClip: isSpanGrad ? 'text' : undefined,
                      backgroundClip: isSpanGrad ? 'text' : undefined,
                      WebkitTextFillColor: isSpanGrad ? 'transparent' : undefined,
                      opacity: sp.opacity !== undefined ? sp.opacity : undefined,
                      display:
                        sp.offsetY !== undefined && sp.offsetY !== 0 ? 'inline-block' : undefined,
                      transform:
                        sp.offsetY !== undefined && sp.offsetY !== 0
                          ? `translateY(${sp.offsetY}px)`
                          : undefined,
                    }}
                  >
                    {sp.text}
                  </span>
                );
              })
            : (textEl.i18nKey && doc.i18n?.locales?.[activeLocale]?.[textEl.i18nKey]) || textEl.text}
        </div>
      );
    }

    if (el.type === 'bitmap') {
      const bmp = el as BitmapElement;
      const w = bmp.width || 200;
      const h = bmp.height || 150;
      const imgSrc = bmp.src || doc.library?.bitmaps?.[bmp.bitmapId]?.src || '';

      return (
        <div
          style={{
            width: `${w}px`,
            height: `${h}px`,
            position: 'relative',
            userSelect: 'none',
            overflow: 'hidden',
          }}
          onContextMenu={(e) => handleShapeContextMenu(e, el)}
        >
          <img
            src={imgSrc}
            width={w}
            height={h}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            alt=""
          />
        </div>
      );
    }

    if (el.type === 'video') {
      const vid = el as VideoElement;
      const w = vid.width || 320;
      const h = vid.height || 180;
      const embedInfo = parseVideoEmbed(vid.src);

      return (
        <div
          style={{
            width: `${w}px`,
            height: `${h}px`,
            position: 'relative',
            userSelect: 'none',
            backgroundColor: '#000000',
            overflow: 'hidden',
            borderRadius: 2,
          }}
          onContextMenu={(e) => handleShapeContextMenu(e, el)}
        >
          {embedInfo.isEmbed && embedInfo.embedUrl ? (
            <iframe
              src={embedInfo.embedUrl}
              width={w}
              height={h}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
                pointerEvents: dragState ? 'none' : 'auto',
              }}
              allow="autoplay; encrypted-media"
              title="Video embed"
            />
          ) : (
            <video
              src={vid.src}
              width={w}
              height={h}
              muted={vid.muted ?? true}
              loop={vid.loop ?? true}
              autoPlay={vid.autoplay ?? true}
              controls={vid.controls ?? true}
              playsInline
              style={{
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                display: 'block',
                objectFit: 'cover',
              }}
            />
          )}

          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 3,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              zIndex: 5,
            }}
          >
            <span>
              🎬 {embedInfo.platform === 'youtube'
                ? 'YouTube'
                : embedInfo.platform === 'vimeo'
                ? 'Vimeo'
                : 'Video'}
            </span>
          </div>
        </div>
      );
    }

    if (el.type === 'instance') {
      const inst = el as SymbolInstance;
      const symbolDef: EditorSymbol | undefined = doc.library.symbols[inst.symbolId];
      if (!symbolDef) {
        return (
          <div
            style={{
              border: '1px dashed #ef4444',
              padding: 4,
              color: '#ef4444',
              fontSize: 10,
              background: 'rgba(239, 68, 68, 0.1)',
            }}
          >
            [Missing Component]
          </div>
        );
      }

      // Compute nested preview time based on playMode & autoplay
      const symFps = doc.stage.fps || 24;
      const totalSymDuration = computeTotalTimelineDuration(symbolDef.timeline, symFps);
      let innerTime = 0;

      if (inst.playMode === 'stop' || inst.autoplay === false) {
        innerTime = 0;
      } else if (inst.playMode === 'sync') {
        innerTime = totalSymDuration > 0 ? currentTime % totalSymDuration : 0;
      } else if (inst.playMode === 'once' || inst.loop === false) {
        innerTime = Math.min(currentTime, totalSymDuration);
      } else {
        // Default 'loop'
        innerTime = totalSymDuration > 0 ? currentTime % totalSymDuration : 0;
      }

      const innerFrame = Math.round(innerTime * symFps);

      return (
        <div
          onContextMenu={(e) => handleShapeContextMenu(e, el)}
          style={{
            position: 'relative',
            cursor: activeTool === 'select' || activeTool === 'subselect' ? 'move' : 'default',
          }}
        >
          {symbolDef.timeline.layers.map((subLayer) => {
            const kf = findKeyframeAtTime(subLayer, innerTime, symFps) ??
              findKeyframeAt(subLayer, innerFrame) ??
              subLayer.keyframes[0];
            if (!kf) return null;
            return (
              <div key={subLayer.id}>
                {kf.elements.map((subEl) => {
                  const t = subEl.transform;
                  const cssTransform = `matrix(${t.scaleX ?? 1}, 0, 0, ${t.scaleY ?? 1}, ${t.x}, ${t.y})`;
                  return (
                    <div
                      key={subEl.id}
                      style={{
                        position: 'absolute',
                        transform: cssTransform,
                        opacity: subEl.alpha ?? 1,
                      }}
                    >
                      {renderElementContent(subEl as EditorElement)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  // Cursor calculation
  let cursorClass = styles.toolSelect;
  if (isSpaceDown || activeTool === 'hand') {
    cursorClass = dragState?.type === 'pan' ? styles.toolHandGrabbing : styles.toolHand;
  } else if (activeTool === 'rect' || activeTool === 'oval' || activeTool === 'polygon') {
    cursorClass = styles.toolCrosshair;
  } else if (activeTool === 'pen') {
    cursorClass = styles.toolPen;
  } else if (activeTool === 'text') {
    cursorClass = styles.toolText;
  } else if (activeTool === 'subselect') {
    cursorClass = styles.toolSubselect;
  }

  // Live drawing preview rectangle/oval
  let drawPreviewStyle: React.CSSProperties | null = null;
  if (dragState && (dragState.type === 'draw_rect' || dragState.type === 'draw_oval')) {
    const px = Math.min(dragState.startX, dragState.currentX);
    const py = Math.min(dragState.startY, dragState.currentY);
    const pw = Math.abs(dragState.currentX - dragState.startX);
    const ph = Math.abs(dragState.currentY - dragState.startY);
    drawPreviewStyle = {
      left: `${px}px`,
      top: `${py}px`,
      width: `${pw}px`,
      height: `${ph}px`,
    };
  }

  // Marquee selection preview
  let marqueeStyle: React.CSSProperties | null = null;
  if (dragState && dragState.type === 'marquee') {
    const mx = Math.min(dragState.startX, dragState.currentX);
    const my = Math.min(dragState.startY, dragState.currentY);
    const mw = Math.abs(dragState.currentX - dragState.startX);
    const mh = Math.abs(dragState.currentY - dragState.startY);
    marqueeStyle = {
      left: `${mx}px`,
      top: `${my}px`,
      width: `${mw}px`,
      height: `${mh}px`,
    };
  }

  const stageBg = activeArtboard.background ?? doc.stage.background;
  const isTransparent = !stageBg || stageBg.type === 'none';
  const stageBackgroundCss = isTransparent
    ? undefined
    : stageBg.type === 'solid'
    ? stageBg.color
    : fillToCSS(stageBg);

  const reversedLayers = [...activeTl.layers].reverse();

  // Find currently selected shape for Subselect vector anchors
  let subselectShape: ShapeElement | null = null;
  if (activeTool === 'subselect' && selectedElementIds.length > 0) {
    for (const layer of activeTl.layers) {
      const kf = findKeyframeAt(layer, currentFrame);
      if (!kf) continue;
      const found = kf.elements.find(
        (e) => e.id === selectedElementIds[0] && e.type === 'shape'
      );
      if (found) {
        subselectShape = found as ShapeElement;
        break;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.stageContainer}
      onMouseDown={handleContainerMouseDown}
    >
      {/* Scene Graph Breadcrumbs Bar (Scene 1 > [Group] > [Child]) */}
      <div className={styles.stageBreadcrumbBar}>
        <button
          type="button"
          className={`${styles.breadcrumbItem} ${
            isolationStack.length === 0 ? styles.currentCrumb : ''
          }`}
          onClick={() => editorActions.exitToIsolationLevel(-1)}
          title="Root Scene (Scene 1)"
        >
          🎬 Scene 1
        </button>
        {isolationStack.map((crumb, idx) => {
          const isCurrent = idx === isolationStack.length - 1;
          return (
            <React.Fragment key={crumb.symbolId + idx}>
              <span className={styles.breadcrumbDivider}>›</span>
              <button
                type="button"
                className={`${styles.breadcrumbItem} ${
                  isCurrent ? styles.currentCrumb : ''
                }`}
                onClick={() => editorActions.exitToIsolationLevel(idx)}
                title={`Component: ${crumb.name}`}
              >
                ❖ [{crumb.name}]
              </button>
            </React.Fragment>
          );
        })}
        {isolationStack.length > 0 && (
          <button
            type="button"
            className={styles.exitIsolationBtn}
            onClick={() => editorActions.exitIsolation()}
            title="Exit isolation mode (Escape or double-click canvas)"
          >
            ↖ Return to Parent
          </button>
        )}
      </div>
      <div
        className={styles.stageMatte}
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <div
          ref={canvasRef}
          data-testid="stage-canvas"
          className={`${styles.stageCanvas} ${cursorClass} ${
            isTransparent ? styles.transparentCheckerboard : ''
          }`}
          style={{
            width: `${width}px`,
            height: `${height}px`,
            background: stageBackgroundCss,
          }}
          onMouseDown={handleCanvasMouseDown}
          onDoubleClick={handleCanvasDoubleClick}
          onContextMenu={handleStageContextMenu}
        >
          {/* SVG ClipPaths for Mask Layers */}
          {(() => {
            const fps = doc.stage.fps || 24;
            return (
              <svg
                style={{
                  position: 'absolute',
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                }}
                aria-hidden="true"
              >
                <defs>
                  {activeTl.layers
                    .filter((l) => l.kind === 'mask')
                    .map((maskLayer) => {
                      const maskKf =
                        findKeyframeAtTime(maskLayer, currentTime, fps) ??
                        findKeyframeAt(maskLayer, currentFrame);
                      const shapes = (maskKf?.elements || []).filter(
                        (e) => e.type === 'shape'
                      ) as ShapeElement[];

                      return (
                        <clipPath
                          id={`stage_mask_${maskLayer.id}`}
                          key={maskLayer.id}
                          clipPathUnits="userSpaceOnUse"
                        >
                          {shapes.map((s) => {
                            const m = Matrix2D.fromTransform(s.transform);
                            return (
                              <g key={s.id} transform={m.toCSS()}>
                                {s.paths.map((p, pi) => (
                                  <path
                                    key={pi}
                                    d={p.d}
                                    fillRule={p.fillRule || 'nonzero'}
                                  />
                                ))}
                              </g>
                            );
                          })}
                        </clipPath>
                      );
                    })}
                </defs>
              </svg>
            );
          })()}

          {/* Render layers in back-to-front stack */}
          {reversedLayers.map((layer) => {
            if (!layer.visible) return null;

            if (layer.parentLayerId) {
              const parentFolder = activeTl.layers.find((l) => l.id === layer.parentLayerId);
              if (parentFolder && !parentFolder.visible) return null;
            }

            const fps = doc.stage.fps || 24;
            const kf = findKeyframeAtTime(layer, currentTime, fps) ?? findKeyframeAt(layer, currentFrame);
            if (!kf) return null;

            const isTween = kf.tween?.type === 'motion' || kf.tween?.type === 'shape';
            let nextKf: EditorKeyframe | undefined;
            if (isTween) {
              const kfIdx = layer.keyframes.indexOf(kf);
              nextKf = layer.keyframes[kfIdx + 1];
            }

            const kfTime = getKeyframeTime(kf, fps);
            const nextKfTime = nextKf ? getKeyframeTime(nextKf, fps) : kfTime;

            const rawTweenProgress =
              isTween && nextKf && nextKfTime > kfTime
                ? Math.max(0, Math.min(1, (currentTime - kfTime) / (nextKfTime - kfTime)))
                : 0;
            const tweenProgress =
              isTween && kf.tween?.easing
                ? computeEasingProgress(kf.tween.easing, rawTweenProgress)
                : rawTweenProgress;

            // Compute ancestor folder transforms & filters across the full parentLayerId chain
            let parentFilters = '';
            let parentMatrix: Matrix2D | null = null;
            if (layer.parentLayerId) {
              const ancestors: EditorLayer[] = [];
              let currId: string | undefined = layer.parentLayerId;
              const visited = new Set<string>();
              while (currId && !visited.has(currId)) {
                visited.add(currId);
                const p = activeTl.layers.find((l) => l.id === currId);
                if (!p) break;
                ancestors.unshift(p);
                currId = p.parentLayerId;
              }

              let composedM = Matrix2D.identity();
              const filterParts: string[] = [];

              for (const parentFolder of ancestors) {
                if (parentFolder.filters?.length) {
                  filterParts.push(filtersToCSS(parentFolder.filters));
                }
                const parentKf = findKeyframeAtTime(parentFolder, currentTime, fps) ?? findKeyframeAt(parentFolder, currentFrame);
                let folderTransform = parentKf?.transform ?? parentFolder.transform;
                if (parentKf?.tween?.type === 'motion') {
                  const kfIdx = parentFolder.keyframes.indexOf(parentKf);
                  const nextFolderKf = parentFolder.keyframes[kfIdx + 1];
                  const nextT = nextFolderKf?.transform ?? parentFolder.transform;
                  if (folderTransform && nextT) {
                    const parentKfTime = getKeyframeTime(parentKf, fps);
                    const nextParentKfTime = getKeyframeTime(nextFolderKf, fps);
                    if (nextParentKfTime > parentKfTime) {
                      const prog = Math.max(0, Math.min(1, (currentTime - parentKfTime) / (nextParentKfTime - parentKfTime)));
                      const easedProg = parentKf.tween.easing ? computeEasingProgress(parentKf.tween.easing, prog) : prog;
                      const { startRot: fStartRot, endRot: fEndRot } = normalizeRotation(
                        folderTransform.rotation ?? 0,
                        nextT.rotation ?? 0,
                        parentKf.tween?.rotate
                      );
                      folderTransform = {
                        x: folderTransform.x + (nextT.x - folderTransform.x) * easedProg,
                        y: folderTransform.y + (nextT.y - folderTransform.y) * easedProg,
                        scaleX: (folderTransform.scaleX ?? 1) + ((nextT.scaleX ?? 1) - (folderTransform.scaleX ?? 1)) * easedProg,
                        scaleY: (folderTransform.scaleY ?? 1) + ((nextT.scaleY ?? 1) - (folderTransform.scaleY ?? 1)) * easedProg,
                        rotation: fStartRot + (fEndRot - fStartRot) * easedProg,
                        skewX: (folderTransform.skewX ?? 0) + ((nextT.skewX ?? 0) - (folderTransform.skewX ?? 0)) * easedProg,
                        skewY: (folderTransform.skewY ?? 0) + ((nextT.skewY ?? 0) - (folderTransform.skewY ?? 0)) * easedProg,
                        originX: folderTransform.originX ?? 0,
                        originY: folderTransform.originY ?? 0,
                      };
                    }
                  }
                }
                if (folderTransform) {
                  composedM = composedM.multiply(Matrix2D.fromTransform(folderTransform));
                }
              }

              if (!composedM.isIdentity()) {
                parentMatrix = composedM;
              }
              parentFilters = filterParts.join(' ');
            }

            const layerFilterCSS = filtersToCSS(layer.filters);
            const combinedFilter = [parentFilters, layerFilterCSS].filter(Boolean).join(' ') || undefined;

            const maskLayer = layer.maskLayerId
              ? activeTl.layers.find((l) => l.id === layer.maskLayerId)
              : null;
            const clipPathCSS = maskLayer ? `url(#stage_mask_${maskLayer.id})` : undefined;

            const isMaskLayer = layer.kind === 'mask';
            const isMaskSelected =
              selectedLayerId === layer.id ||
              kf.elements.some((e) => selectedElementIds.includes(e.id));

            return (
              <div
                key={layer.id}
                className={styles.stageLayer}
                style={{
                  filter: combinedFilter,
                  clipPath: clipPathCSS,
                  WebkitClipPath: clipPathCSS,
                  opacity: isMaskLayer ? (isMaskSelected ? 0.45 : 0) : undefined,
                }}
              >
                {kf.elements.map((el) => {
                  if (el.visible === false) return null;
                  let displayEl: EditorElement = el;

                  if (isTween && nextKf && tweenProgress > 0) {
                    const matchEl = nextKf.elements.find((e) => e.id === el.id);
                    if (matchEl) {
                      displayEl = computeInterpolatedElement(
                        el,
                        matchEl,
                        tweenProgress,
                        kf.tween?.rotate
                      );
                    }
                  }

                  const effectiveTransform = displayEl.transform;
                  const effectiveAlpha = displayEl.alpha ?? 1;

                  const isSelected = selectedElementIds.includes(el.id);
                  const isLocked = Boolean((el as any).locked);
                  const bounds = getElementBounds(displayEl);
                  const elMatrix = Matrix2D.fromTransform(effectiveTransform);
                  const finalMatrix = parentMatrix ? parentMatrix.multiply(elMatrix) : elMatrix;
                  const cssTransform = finalMatrix.toCSS();

                  return (
                    <div
                      key={el.id}
                      className={`${styles.elementWrapper} ${isSelected ? styles.selected : ''}`}
                      style={{
                        transform: cssTransform,
                        opacity: effectiveAlpha,
                      }}
                      onMouseDown={(e) => handleElementMouseDown(e, displayEl)}
                      onDoubleClick={(e) => handleElementDoubleClick(e, displayEl)}
                    >
                      {renderElementContent(displayEl)}

                      {/* Freeform Transformation Box in Selection Mode */}
                      {isSelected && !isLocked && activeTool === 'select' && editingTextElId !== el.id && (() => {
                        const absScaleX = Math.max(0.001, Math.abs(effectiveTransform.scaleX ?? 1));
                        const absScaleY = Math.max(0.001, Math.abs(effectiveTransform.scaleY ?? 1));
                        const signScaleX = (effectiveTransform.scaleX ?? 1) < 0 ? -1 : 1;
                        const signScaleY = (effectiveTransform.scaleY ?? 1) < 0 ? -1 : 1;
                        const boxW = bounds.width * absScaleX;
                        const boxH = bounds.height * absScaleY;
                        const unskewCSS = `skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`;
                        const pivotLocalX =
                          effectiveTransform.originX !== undefined
                            ? effectiveTransform.originX
                            : bounds.x + bounds.width / 2;
                        const pivotLocalY =
                          effectiveTransform.originY !== undefined
                            ? effectiveTransform.originY
                            : bounds.y + bounds.height / 2;

                        return (
                          <div
                            className={styles.selectionBox}
                            style={{
                              left: `${bounds.x}px`,
                              top: `${bounds.y}px`,
                              width: `${boxW}px`,
                              height: `${boxH}px`,
                              transformOrigin: '0 0',
                              transform: `scale(${signScaleX / absScaleX}, ${signScaleY / absScaleY})`,
                            }}
                          >
                            {/* Accent badge for Component Instance */}
                            {el.type === 'instance' && (() => {
                              const inst = el as SymbolInstance;
                              const sym = doc.library.symbols[inst.symbolId];
                              const compName = sym?.name || inst.instanceName || 'Component';
                              return (
                                <div
                                  className={styles.componentBadge}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <span className={styles.componentBadgeLabel}>
                                    ❖ {compName} (Component)
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.componentBadgeEditBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      editorActions.enterIsolation(inst.symbolId);
                                    }}
                                    title="Edit Master Component in isolation mode"
                                  >
                                    ↗ Edit Master Component
                                  </button>
                                </div>
                              );
                            })()}
                            {/* 4 Corner handles: resize / scale */}
                            <div
                              className={`${styles.transformHandle} ${styles.handleTopLeft}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'tl', bounds)}
                              title="Resize / 3D Perspective (Hold Shift for aspect lock, Cmd/Ctrl to distort perspective)"
                              data-testid="resize-handle-tl"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleTopRight}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'tr', bounds)}
                              title="Resize / 3D Perspective (Hold Shift for aspect lock, Cmd/Ctrl to distort perspective)"
                              data-testid="resize-handle-tr"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleBottomLeft}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'bl', bounds)}
                              title="Resize / 3D Perspective (Hold Shift for aspect lock, Cmd/Ctrl to distort perspective)"
                              data-testid="resize-handle-bl"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleBottomRight}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'br', bounds)}
                              title="Resize / 3D Perspective (Hold Shift for aspect lock, Cmd/Ctrl to distort perspective)"
                              data-testid="resize-handle-br"
                            />

                            {/* 4 Mid-edge handles: resize width / height */}
                            <div
                              className={`${styles.transformHandle} ${styles.handleTopCenter}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'tc', bounds)}
                              title="Resize Height"
                              data-testid="resize-handle-tc"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleMiddleRight}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'mr', bounds)}
                              title="Resize Width"
                              data-testid="resize-handle-mr"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleBottomCenter}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'bc', bounds)}
                              title="Resize Height"
                              data-testid="resize-handle-bc"
                            />
                            <div
                              className={`${styles.transformHandle} ${styles.handleMiddleLeft}`}
                              style={{ transform: unskewCSS }}
                              onMouseDown={(e) => handleResizeMouseDown(e, displayEl, 'ml', bounds)}
                              title="Resize Width"
                              data-testid="resize-handle-ml"
                            />

                            {/* 4 Skew zones outside edges (shear X and Y - floating outside edges like rotation) */}
                            <div
                              className={`${styles.skewZoneTop} ${hoveredSkewEdge === 'top' || (dragState?.type === 'skew' && dragState.skewAxis === 'x') ? styles.skewZoneActive : ''}`}
                              onMouseDown={(e) => handleSkewMouseDown(e, displayEl, 'x', bounds)}
                              onMouseEnter={() => setHoveredSkewEdge('top')}
                              onMouseLeave={() => setHoveredSkewEdge(null)}
                              title="Shear X (Skew horizontally along top edge - Hold Shift to snap 15°)"
                              data-testid="skew-handle-top"
                            >
                              <div className={styles.skewStem} />
                              <div className={styles.skewIconBadge} style={{ transform: unskewCSS }}>
                                <MoveHorizontal size={12} strokeWidth={2.2} />
                              </div>
                            </div>
                            <div
                              className={`${styles.skewZoneBottom} ${hoveredSkewEdge === 'bottom' || (dragState?.type === 'skew' && dragState.skewAxis === 'x') ? styles.skewZoneActive : ''}`}
                              onMouseDown={(e) => handleSkewMouseDown(e, displayEl, 'x', bounds)}
                              onMouseEnter={() => setHoveredSkewEdge('bottom')}
                              onMouseLeave={() => setHoveredSkewEdge(null)}
                              title="Shear X (Skew horizontally along bottom edge - Hold Shift to snap 15°)"
                              data-testid="skew-handle-bottom"
                            >
                              <div className={styles.skewStem} />
                              <div className={styles.skewIconBadge} style={{ transform: unskewCSS }}>
                                <MoveHorizontal size={12} strokeWidth={2.2} />
                              </div>
                            </div>
                            <div
                              className={`${styles.skewZoneLeft} ${hoveredSkewEdge === 'left' || (dragState?.type === 'skew' && dragState.skewAxis === 'y') ? styles.skewZoneActive : ''}`}
                              onMouseDown={(e) => handleSkewMouseDown(e, displayEl, 'y', bounds)}
                              onMouseEnter={() => setHoveredSkewEdge('left')}
                              onMouseLeave={() => setHoveredSkewEdge(null)}
                              title="Shear Y (Skew vertically along left edge - Hold Shift to snap 15°)"
                              data-testid="skew-handle-left"
                            >
                              <div className={styles.skewStem} />
                              <div className={styles.skewIconBadge} style={{ transform: unskewCSS }}>
                                <MoveVertical size={12} strokeWidth={2.2} />
                              </div>
                            </div>
                            <div
                              className={`${styles.skewZoneRight} ${hoveredSkewEdge === 'right' || (dragState?.type === 'skew' && dragState.skewAxis === 'y') ? styles.skewZoneActive : ''}`}
                              onMouseDown={(e) => handleSkewMouseDown(e, displayEl, 'y', bounds)}
                              onMouseEnter={() => setHoveredSkewEdge('right')}
                              onMouseLeave={() => setHoveredSkewEdge(null)}
                              title="Shear Y (Skew vertically along right edge - Hold Shift to snap 15°)"
                              data-testid="skew-handle-right"
                            >
                              <div className={styles.skewStem} />
                              <div className={styles.skewIconBadge} style={{ transform: unskewCSS }}>
                                <MoveVertical size={12} strokeWidth={2.2} />
                              </div>
                            </div>

                            {/* 4 Rotation zones outside corners with arc'd arrow icons */}
                            <div
                              className={`${styles.rotateZone} ${styles.rotTopLeft} ${hoveredRotateCorner === 'tl' || (dragState?.type === 'rotate' && dragState.handle === 'tl') ? styles.rotateZoneActive : ''}`}
                              onMouseDown={(e) => handleRotateMouseDown(e, displayEl, bounds, 'tl')}
                              onMouseEnter={() => setHoveredRotateCorner('tl')}
                              onMouseLeave={() => setHoveredRotateCorner(null)}
                              title="Rotate (Hold Shift to snap 15°)"
                              data-testid="rotate-handle-tl"
                            >
                              <div
                                className={styles.rotateCornerIcon}
                                style={{ transform: `${unskewCSS} rotate(-45deg)` }}
                              >
                                <RotateCw size={14} strokeWidth={2.4} />
                              </div>
                            </div>
                            <div
                              className={`${styles.rotateZone} ${styles.rotTopRight} ${hoveredRotateCorner === 'tr' || (dragState?.type === 'rotate' && dragState.handle === 'tr') ? styles.rotateZoneActive : ''}`}
                              onMouseDown={(e) => handleRotateMouseDown(e, displayEl, bounds, 'tr')}
                              onMouseEnter={() => setHoveredRotateCorner('tr')}
                              onMouseLeave={() => setHoveredRotateCorner(null)}
                              title="Rotate (Hold Shift to snap 15°)"
                              data-testid="rotate-handle-tr"
                            >
                              <div
                                className={styles.rotateCornerIcon}
                                style={{ transform: `${unskewCSS} rotate(45deg)` }}
                              >
                                <RotateCw size={14} strokeWidth={2.4} />
                              </div>
                            </div>
                            <div
                              className={`${styles.rotateZone} ${styles.rotBottomLeft} ${hoveredRotateCorner === 'bl' || (dragState?.type === 'rotate' && dragState.handle === 'bl') ? styles.rotateZoneActive : ''}`}
                              onMouseDown={(e) => handleRotateMouseDown(e, displayEl, bounds, 'bl')}
                              onMouseEnter={() => setHoveredRotateCorner('bl')}
                              onMouseLeave={() => setHoveredRotateCorner(null)}
                              title="Rotate (Hold Shift to snap 15°)"
                              data-testid="rotate-handle-bl"
                            >
                              <div
                                className={styles.rotateCornerIcon}
                                style={{ transform: `${unskewCSS} rotate(-135deg)` }}
                              >
                                <RotateCw size={14} strokeWidth={2.4} />
                              </div>
                            </div>
                            <div
                              className={`${styles.rotateZone} ${styles.rotBottomRight} ${hoveredRotateCorner === 'br' || (dragState?.type === 'rotate' && dragState.handle === 'br') ? styles.rotateZoneActive : ''}`}
                              onMouseDown={(e) => handleRotateMouseDown(e, displayEl, bounds, 'br')}
                              onMouseEnter={() => setHoveredRotateCorner('br')}
                              onMouseLeave={() => setHoveredRotateCorner(null)}
                              title="Rotate (Hold Shift to snap 15°)"
                              data-testid="rotate-handle-br"
                            >
                              <div
                                className={styles.rotateCornerIcon}
                                style={{ transform: `${unskewCSS} rotate(135deg)` }}
                              >
                                <RotateCw size={14} strokeWidth={2.4} />
                              </div>
                            </div>

                            {/* Center registration point / draggable pivot */}
                            <div
                              className={styles.pivotHandle}
                              style={{
                                left: `${(pivotLocalX - bounds.x) * absScaleX}px`,
                                top: `${(pivotLocalY - bounds.y) * absScaleY}px`,
                                transform: `translate(-50%, -50%) ${unskewCSS}`,
                              }}
                              onMouseDown={(e) => handlePivotMouseDown(e, displayEl, bounds)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                // Double-click snaps registration point back to exact center
                                const targetOriginX = Math.round(bounds.x + bounds.width / 2);
                                const targetOriginY = Math.round(bounds.y + bounds.height / 2);
                                const newStageOrigin = elementLocalToStage(
                                  targetOriginX,
                                  targetOriginY,
                                  displayEl.transform
                                );
                                editorActions.updateElementTransform(el.id, {
                                  x: Math.round(newStageOrigin.x * 100) / 100,
                                  y: Math.round(newStageOrigin.y * 100) / 100,
                                  originX: targetOriginX,
                                  originY: targetOriginY,
                                });
                              }}
                              title="Registration Point (Double-click to center, drag or use 9-point grid in Properties)"
                            >
                              <CrosshairIcon size={14} strokeWidth={2.2} className={styles.pivotIcon} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Layer Multi-Selection Composite Bounding Box */}
          {(() => {
            if (
              activeTool !== 'select' ||
              selectedElementIds.length > 0 ||
              !selectedLayerId
            ) {
              return null;
            }

            const selLayer = activeTl.layers.find((l) => l.id === selectedLayerId);
            if (!selLayer || !selLayer.visible || selLayer.locked) return null;

            const fps = doc.stage.fps || 24;
            const isFolder = selLayer.kind === 'folder';
            const targetElements: { el: EditorElement; layer: EditorLayer }[] = [];

            if (isFolder) {
              const descendantLayerIds = new Set<string>();
              const findDescendants = (parentId: string) => {
                for (const l of activeTl.layers) {
                  if (l.parentLayerId === parentId && !descendantLayerIds.has(l.id)) {
                    descendantLayerIds.add(l.id);
                    findDescendants(l.id);
                  }
                }
              };
              findDescendants(selLayer.id);

              for (const lId of descendantLayerIds) {
                const l = activeTl.layers.find((ly) => ly.id === lId);
                if (!l || !l.visible || l.locked) continue;
                const kf = findKeyframeAtTime(l, currentTime, fps) ?? findKeyframeAt(l, currentFrame);
                if (kf) {
                  for (const el of kf.elements) {
                    if (el.visible !== false) {
                      targetElements.push({ el, layer: l });
                    }
                  }
                }
              }
            } else {
              const currentKf =
                findKeyframeAtTime(selLayer, currentTime, fps) ??
                findKeyframeAt(selLayer, currentFrame);
              if (currentKf) {
                for (const el of currentKf.elements) {
                  if (el.visible !== false) {
                    targetElements.push({ el, layer: selLayer });
                  }
                }
              }
            }

            if (targetElements.length === 0) return null;

            // Compute composite stage-space bounding box of all target elements
            let lMinX = Infinity;
            let lMinY = Infinity;
            let lMaxX = -Infinity;
            let lMaxY = -Infinity;

            const getLayerAncestorMatrix = (lId: string): Matrix2D => {
              const ancestors: EditorLayer[] = [];
              let curr: string | undefined = lId;
              const visited = new Set<string>();
              while (curr && !visited.has(curr)) {
                visited.add(curr);
                const p = activeTl.layers.find((ly) => ly.id === curr);
                if (!p) break;
                ancestors.unshift(p);
                curr = p.parentLayerId;
              }
              let m = Matrix2D.identity();
              for (const anc of ancestors) {
                const kf = findKeyframeAtTime(anc, currentTime, fps) ?? findKeyframeAt(anc, currentFrame);
                const t = kf?.transform ?? anc.transform;
                if (t) m = m.multiply(Matrix2D.fromTransform(t));
              }
              return m;
            };

            for (const { el, layer: elLayer } of targetElements) {
              const bounds = getElementBounds(el);
              const corners = [
                { x: bounds.x, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                { x: bounds.x, y: bounds.y + bounds.height },
              ];
              const parentM = getLayerAncestorMatrix(elLayer.id);
              const elM = Matrix2D.fromTransform(el.transform);
              const effM = parentM.multiply(elM);

              for (const pt of corners) {
                const stagePt = effM.transformPoint(pt);
                lMinX = Math.min(lMinX, stagePt.x);
                lMinY = Math.min(lMinY, stagePt.y);
                lMaxX = Math.max(lMaxX, stagePt.x);
                lMaxY = Math.max(lMaxY, stagePt.y);
              }
            }

            if (!isFinite(lMinX) || !isFinite(lMaxX)) return null;

            const layerBoxW = Math.max(10, lMaxX - lMinX);
            const layerBoxH = Math.max(10, lMaxY - lMinY);

            const handleLayerBoxMouseDown = (e: React.MouseEvent) => {
              if (e.button === 2) return;
              e.stopPropagation();
              const { x, y } = getStageCoordinates(e);

              if (isFolder) {
                const folderKf = findKeyframeAtTime(selLayer, currentTime, fps) ?? findKeyframeAt(selLayer, currentFrame);
                const initT = folderKf?.transform ?? selLayer.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 };
                editorActions.commitHistorySnapshot();
                setDragState({
                  type: 'move',
                  folderId: selLayer.id,
                  startX: x,
                  startY: y,
                  currentX: x,
                  currentY: y,
                  initialTransforms: { [selLayer.id]: { ...initT } },
                  initialBounds: { x: lMinX, y: lMinY, width: layerBoxW, height: layerBoxH },
                });
              } else {
                const initialTransforms: Record<string, Transform> = {};
                for (const { el } of targetElements) {
                  initialTransforms[el.id] = { ...el.transform };
                }

                setDragState({
                  type: 'move',
                  startX: x,
                  startY: y,
                  currentX: x,
                  currentY: y,
                  initialTransforms,
                });
              }
            };

            const handleFolderHandleMouseDown = (handle: 'tl' | 'tc' | 'tr' | 'mr' | 'br' | 'bc' | 'bl' | 'ml', e: React.MouseEvent) => {
              e.stopPropagation();
              const { x, y } = getStageCoordinates(e);
              if (isFolder) {
                const folderKf = findKeyframeAtTime(selLayer, currentTime, fps) ?? findKeyframeAt(selLayer, currentFrame);
                const initT = folderKf?.transform ?? selLayer.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 };
                editorActions.commitHistorySnapshot();
                setDragState({
                  type: 'resize',
                  folderId: selLayer.id,
                  handle,
                  startX: x,
                  startY: y,
                  currentX: x,
                  currentY: y,
                  initialTransforms: { [selLayer.id]: { ...initT } },
                  initialBounds: { x: lMinX, y: lMinY, width: layerBoxW, height: layerBoxH },
                });
              }
            };

            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${lMinX}px`,
                  top: `${lMinY}px`,
                  width: `${layerBoxW}px`,
                  height: `${layerBoxH}px`,
                  border: isFolder ? '1.5px solid #a855f7' : '1.5px solid #3b82f6',
                  backgroundColor: isFolder ? 'rgba(168, 85, 247, 0.05)' : 'rgba(59, 130, 246, 0.04)',
                  pointerEvents: 'auto',
                  cursor: 'move',
                  zIndex: 40,
                }}
                onMouseDown={handleLayerBoxMouseDown}
                title={isFolder ? `Folder: ${selLayer.name} (${targetElements.length} nested elements)` : `Layer: ${selLayer.name} (${targetElements.length} elements)`}
              >
                {/* 8 Bounding Box Corner and Edge Handles */}
                <div className={`${styles.handle} ${styles.handleTl}`} onMouseDown={(e) => handleFolderHandleMouseDown('tl', e)} />
                <div className={`${styles.handle} ${styles.handleTc}`} onMouseDown={(e) => handleFolderHandleMouseDown('tc', e)} />
                <div className={`${styles.handle} ${styles.handleTr}`} onMouseDown={(e) => handleFolderHandleMouseDown('tr', e)} />
                <div className={`${styles.handle} ${styles.handleMr}`} onMouseDown={(e) => handleFolderHandleMouseDown('mr', e)} />
                <div className={`${styles.handle} ${styles.handleBr}`} onMouseDown={(e) => handleFolderHandleMouseDown('br', e)} />
                <div className={`${styles.handle} ${styles.handleBc}`} onMouseDown={(e) => handleFolderHandleMouseDown('bc', e)} />
                <div className={`${styles.handle} ${styles.handleBl}`} onMouseDown={(e) => handleFolderHandleMouseDown('bl', e)} />
                <div className={`${styles.handle} ${styles.handleMl}`} onMouseDown={(e) => handleFolderHandleMouseDown('ml', e)} />

                {/* Layer / Folder Badge Label */}
                <div
                  style={{
                    position: 'absolute',
                    top: -20,
                    left: 0,
                    backgroundColor: isFolder ? '#a855f7' : '#3b82f6',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{isFolder ? '📁' : '⚡'}</span>
                  <span>{selLayer.name}</span>
                </div>
              </div>
            );
          })()}

          {/* Subselect Tool Anchor Points & Bézier Handles Overlay */}
          {activeTool === 'subselect' && subselectShape && (
            <svg className={styles.subselectOverlay}>
              {subselectShape.paths.map((path, pathIdx) => {
                const parsed = parseSvgPath(path.d);
                return (
                  <g key={pathIdx}>
                    {parsed.anchors.map((anchor, aIdx) => {
                      const anchorStage = elementLocalToStage(
                        anchor.x,
                        anchor.y,
                        subselectShape!.transform
                      );

                      const isAnchorSelected =
                        subselectedAnchor?.shapeId === subselectShape!.id &&
                        subselectedAnchor?.pathIndex === pathIdx &&
                        subselectedAnchor?.anchorIndex === aIdx;

                      const handleInStage = anchor.handleIn
                        ? elementLocalToStage(
                            anchor.handleIn.x,
                            anchor.handleIn.y,
                            subselectShape!.transform
                          )
                        : null;

                      const handleOutStage = anchor.handleOut
                        ? elementLocalToStage(
                            anchor.handleOut.x,
                            anchor.handleOut.y,
                            subselectShape!.transform
                          )
                        : null;

                      return (
                        <g key={aIdx}>
                          {/* Selected Anchor Bézier Handle Lines & Circles */}
                          {isAnchorSelected && handleInStage && (
                            <>
                              <line
                                x1={anchorStage.x}
                                y1={anchorStage.y}
                                x2={handleInStage.x}
                                y2={handleInStage.y}
                                className={styles.subselectHandleLine}
                              />
                              <circle
                                cx={handleInStage.x}
                                cy={handleInStage.y}
                                r={3.5}
                                className={styles.subselectHandleCircle}
                                onMouseDown={(e) =>
                                  handleHandleMouseDown(
                                    e,
                                    subselectShape!,
                                    pathIdx,
                                    aIdx,
                                    'in'
                                  )
                                }
                              />
                            </>
                          )}

                          {isAnchorSelected && handleOutStage && (
                            <>
                              <line
                                x1={anchorStage.x}
                                y1={anchorStage.y}
                                x2={handleOutStage.x}
                                y2={handleOutStage.y}
                                className={styles.subselectHandleLine}
                              />
                              <circle
                                cx={handleOutStage.x}
                                cy={handleOutStage.y}
                                r={3.5}
                                className={styles.subselectHandleCircle}
                                onMouseDown={(e) =>
                                  handleHandleMouseDown(
                                    e,
                                    subselectShape!,
                                    pathIdx,
                                    aIdx,
                                    'out'
                                  )
                                }
                              />
                            </>
                          )}

                          {/* Anchor Node (Square) */}
                          <rect
                            x={anchorStage.x - 3.5}
                            y={anchorStage.y - 3.5}
                            width={7}
                            height={7}
                            className={
                              isAnchorSelected
                                ? styles.subselectAnchorSelected
                                : styles.subselectAnchor
                            }
                            data-testid="subselect-anchor"
                            data-anchor-index={aIdx}
                            onMouseDown={(e) =>
                              handleAnchorMouseDown(
                                e,
                                subselectShape!,
                                pathIdx,
                                aIdx,
                                anchor
                              )
                            }
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Pen Tool Active Bézier Drawing Overlay */}
          {activeTool === 'pen' && penAnchors.length > 0 && (
            <svg className={styles.penOverlay}>
              <path
                d={formatSvgPath(penAnchors, false)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />
              {penHoverPoint && (
                <line
                  x1={penAnchors[penAnchors.length - 1].x}
                  y1={penAnchors[penAnchors.length - 1].y}
                  x2={penHoverPoint.x}
                  y2={penHoverPoint.y}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}
              {penAnchors.map((p, idx) => {
                const isFirst = idx === 0;
                return (
                  <g key={idx}>
                    {/* Render pulled-out Bézier handles if present */}
                    {p.handleIn && (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={p.handleIn.x}
                          y2={p.handleIn.y}
                          className={styles.subselectHandleLine}
                        />
                        <circle
                          cx={p.handleIn.x}
                          cy={p.handleIn.y}
                          r={3}
                          fill="#38bdf8"
                        />
                      </>
                    )}
                    {p.handleOut && (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={p.handleOut.x}
                          y2={p.handleOut.y}
                          className={styles.subselectHandleLine}
                        />
                        <circle
                          cx={p.handleOut.x}
                          cy={p.handleOut.y}
                          r={3}
                          fill="#38bdf8"
                        />
                      </>
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isFirst ? 5.5 : 4}
                      fill={isFirst ? '#3b82f6' : '#ffffff'}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Live Drawing Previews */}
          {dragState?.type === 'draw_rect' && drawPreviewStyle && (
            <div className={styles.drawPreview} style={drawPreviewStyle} />
          )}
          {dragState?.type === 'draw_oval' && drawPreviewStyle && (
            <div className={styles.drawPreviewOval} style={drawPreviewStyle} />
          )}
          {dragState?.type === 'draw_polygon' && (() => {
            const dx = dragState.currentX - dragState.startX;
            const dy = dragState.currentY - dragState.startY;
            const rawRadius = Math.hypot(dx, dy);
            const radius = Math.max(8, rawRadius);
            const pts = dragState.polygonPoints ?? 5;
            const ratio = dragState.polygonStarRatio ?? 0.5;
            let angle = rawRadius < 4 ? -Math.PI / 2 : Math.atan2(dy, dx);
            if (dragState.shiftKey) {
              const snap = Math.PI / 12;
              angle = Math.round(angle / snap) * snap;
            }

            const pathD = generatePolygonStarPath(
              dragState.startX,
              dragState.startY,
              radius,
              pts,
              ratio,
              angle
            );

            return (
              <svg
                className={styles.starPreviewOverlay}
                data-testid="star-draw-preview-svg"
              >
                <path
                  d={pathD}
                  fill={activeFill ? fillToCSS(activeFill) : fillColor}
                  fillOpacity={0.35}
                  stroke={strokeColor || '#3b82f6'}
                  strokeWidth={Math.max(1.5, strokeWidth || 1.5)}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={dragState.startX}
                  cy={dragState.startY}
                  r={3.5}
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth={1}
                />
                <line
                  x1={dragState.startX}
                  y1={dragState.startY}
                  x2={dragState.startX + radius * Math.cos(angle)}
                  y2={dragState.startY + radius * Math.sin(angle)}
                  stroke="rgba(59, 130, 246, 0.6)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              </svg>
            );
          })()}

          {/* Marquee Selection Box */}
          {dragState?.type === 'marquee' && marqueeStyle && (
            <div className={styles.marqueeBox} style={marqueeStyle} />
          )}
        </div>
      </div>

      {/* Modern Stage Footer Toolbar */}
      <div className={styles.stageFooterBar}>
        <div className={styles.footerInfo}>
          <span>
            {width} × {height}
          </span>
          <span style={{ color: 'var(--mx-text-subtle)' }}>•</span>
          <span>
            X: {mousePos.x}, Y: {mousePos.y}
          </span>
        </div>

        <div className={styles.footerDivider} />

        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomOut}
            title="Zoom Out (Ctrl -)"
          >
            <ZoomOut size={13} />
          </button>
          <span
            className={styles.zoomPercent}
            onClick={handleZoomReset}
            title="Click to reset to 100%"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomIn}
            title="Zoom In (Ctrl +)"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomFit}
            title="Fit Stage in View"
            style={{ gap: 4 }}
          >
            <Maximize2 size={11} />
            <span>Fit</span>
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomReset}
            title="Reset Pan & Zoom (100%)"
          >
            100%
          </button>
        </div>
      </div>

      {/* Floating Dynamic Tooltip / Angle Badge */}
      {transformBadge && (
        <div
          className={styles.dynamicTransformBadge}
          style={{ left: `${transformBadge.x}px`, top: `${transformBadge.y}px` }}
        >
          {transformBadge.text}
        </div>
      )}
    </div>
  );
};
