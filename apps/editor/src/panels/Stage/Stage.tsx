import React, { useRef, useState, useEffect, useCallback } from 'react';
import type {
  ShapeElement,
  TextElement,
  TextSpan,
  SymbolInstance,
  Transform,
} from '@flashback/runtime';
import { Matrix2D, filtersToCSS, fillToCSS } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  findKeyframeAtTime,
  getKeyframeTime,
  getActiveTimeline,
  type EditorElement,
  type EditorKeyframe,
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
  return { x: 0, y: 0, width: 50, height: 50 };
}

export function computeInterpolatedTransform(
  startEl: EditorElement,
  endEl: EditorElement,
  t: number
): Transform {
  const s = startEl.transform;
  const e = endEl.transform;
  return {
    x: s.x + (e.x - s.x) * t,
    y: s.y + (e.y - s.y) * t,
    scaleX: (s.scaleX ?? 1) + ((e.scaleX ?? 1) - (s.scaleX ?? 1)) * t,
    scaleY: (s.scaleY ?? 1) + ((e.scaleY ?? 1) - (s.scaleY ?? 1)) * t,
    rotation: (s.rotation ?? 0) + ((e.rotation ?? 0) - (s.rotation ?? 0)) * t,
    skewX: (s.skewX ?? 0) + ((e.skewX ?? 0) - (s.skewX ?? 0)) * t,
    skewY: (s.skewY ?? 0) + ((e.skewY ?? 0) - (s.skewY ?? 0)) * t,
    originX: s.originX ?? 0,
    originY: s.originY ?? 0,
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
  t: number
): EditorElement {
  const effectiveTransform = computeInterpolatedTransform(startEl, endEl, t);
  const effectiveAlpha = (startEl.alpha ?? 1) + ((endEl.alpha ?? 1) - (startEl.alpha ?? 1)) * t;

  if (startEl.type === 'shape' && endEl.type === 'shape') {
    const sShape = startEl as ShapeElement;
    const eShape = endEl as ShapeElement;
    const interpPaths = sShape.paths.map((p, pIdx) => {
      const eP = eShape.paths[pIdx];
      if (!eP) return p;
      return {
        ...p,
        d: interpolatePathD(p.d, eP.d, t),
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

  return {
    ...startEl,
    transform: effectiveTransform,
    alpha: effectiveAlpha,
  };
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

function elementLocalToStage(
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
  const textSelection = useEditorStore((s) => s.textSelection);

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

  // Interaction dragging state
  const [dragState, setDragState] = useState<DragState | null>(null);

  const width = doc.stage.width || 550;
  const height = doc.stage.height || 400;

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
      setDragState({
        type: 'draw_polygon',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        polygonPoints: 5,
        polygonStarRatio: 0.5,
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

    const owningLayer = activeTl.layers.find((l) => {
      const currentKf = findKeyframeAtTime(l, currentTime) ?? findKeyframeAt(l, currentFrame);
      return currentKf?.elements.some((item) => item.id === el.id);
    });
    if (owningLayer && owningLayer.id !== selectedLayerId) {
      editorActions.selectLayer(owningLayer.id);
    }

    const { x, y } = getStageCoordinates(e);

    const initialTransforms: Record<string, Transform> = {};
    const ids = isAlreadySelected ? selectedElementIds : [el.id];

    for (const layer of activeTl.layers) {
      const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
      if (!kf) continue;
      for (const item of kf.elements) {
        if (ids.includes(item.id)) {
          initialTransforms[item.id] = { ...item.transform };
        }
      }
    }

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

    setDragState({
      type: 'resize',
      handle,
      resizeElId: el.id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialTransforms: { [el.id]: { ...el.transform } },
      initialBounds: bounds,
    });
  };

  // Direct On-Canvas Rotation
  const handleRotateMouseDown = (
    e: React.MouseEvent,
    el: EditorElement,
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    e.stopPropagation();
    const { x, y } = getStageCoordinates(e);

    const pivotX = el.transform.originX ?? bounds.x + bounds.width / 2;
    const pivotY = el.transform.originY ?? bounds.y + bounds.height / 2;

    const rotCenter = elementLocalToStage(pivotX, pivotY, el.transform);

    const startAngle = Math.atan2(y - rotCenter.y, x - rotCenter.x) * (180 / Math.PI);

    setDragState({
      type: 'rotate',
      resizeElId: el.id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      rotCenter,
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

        for (const [id, initialT] of Object.entries(dragState.initialTransforms)) {
          editorActions.updateElementTransform(id, {
            x: initialT.x + dx,
            y: initialT.y + dy,
          });
        }
      } else if (dragState.type === 'resize' && dragState.resizeElId && dragState.initialBounds) {
        const initT = dragState.initialTransforms[dragState.resizeElId];
        const initB = dragState.initialBounds;
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;

        let scaleFactorX = 1;
        let scaleFactorY = 1;

        switch (dragState.handle) {
          case 'br': {
            const newW = Math.max(8, initB.width + dx);
            const newH = Math.max(8, initB.height + dy);
            scaleFactorX = newW / initB.width;
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'bl': {
            const newW = Math.max(8, initB.width - dx);
            const newH = Math.max(8, initB.height + dy);
            scaleFactorX = newW / initB.width;
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'tr': {
            const newW = Math.max(8, initB.width + dx);
            const newH = Math.max(8, initB.height - dy);
            scaleFactorX = newW / initB.width;
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'tl': {
            const newW = Math.max(8, initB.width - dx);
            const newH = Math.max(8, initB.height - dy);
            scaleFactorX = newW / initB.width;
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'tc': {
            const newH = Math.max(8, initB.height - dy);
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'bc': {
            const newH = Math.max(8, initB.height + dy);
            scaleFactorY = newH / initB.height;
            break;
          }
          case 'ml': {
            const newW = Math.max(8, initB.width - dx);
            scaleFactorX = newW / initB.width;
            break;
          }
          case 'mr': {
            const newW = Math.max(8, initB.width + dx);
            scaleFactorX = newW / initB.width;
            break;
          }
        }

        // Check for 3D Perspective & Distort modifier (Cmd / Ctrl drag)
        if (e.metaKey || e.ctrlKey) {
          const initRotX = initT.rotateX ?? 0;
          const initRotY = initT.rotateY ?? 0;
          // Calculate angular tilt based on dragging direction
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

          editorActions.updateElementTransform(dragState.resizeElId, {
            rotateX: newRotX,
            rotateY: newRotY,
            perspective: initT.perspective || 800,
          });

          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Perspective: Tilt X: ${newRotX}°, Tilt Y: ${newRotY}°`,
          });
          return;
        }

        // Special case: for text elements, dragging edge handles resizes the wrapping box rather than scaling
        let isTextTarget = false;
        for (const l of activeTl.layers) {
          const kf = findKeyframeAtTime(l, currentTime) ?? findKeyframeAt(l, currentFrame);
          const found = kf?.elements.find((el) => el.id === dragState.resizeElId);
          if (found && found.type === 'text') {
            isTextTarget = true;
            break;
          }
        }

        if (isTextTarget && (dragState.handle === 'mr' || dragState.handle === 'ml' || dragState.handle === 'bc' || dragState.handle === 'tc')) {
          let newW = initB.width;
          let newH = initB.height;
          if (dragState.handle === 'mr') newW = Math.max(30, initB.width + dx);
          if (dragState.handle === 'ml') newW = Math.max(30, initB.width - dx);
          if (dragState.handle === 'bc') newH = Math.max(20, initB.height + dy);
          if (dragState.handle === 'tc') newH = Math.max(20, initB.height - dy);

          editorActions.updateElementProps(dragState.resizeElId, {
            width: Math.round(newW),
            height: Math.round(newH),
            multiline: true, // auto-enable multiline wrapping when resizing box
          });
          setTransformBadge({
            x: e.clientX,
            y: e.clientY - 28,
            text: `Box Size: ${Math.round(newW)} × ${Math.round(newH)} (Wrapped)`,
          });
          return;
        }

        if (
          e.shiftKey &&
          (dragState.handle === 'tl' ||
            dragState.handle === 'tr' ||
            dragState.handle === 'bl' ||
            dragState.handle === 'br')
        ) {
          const maxS = Math.max(scaleFactorX, scaleFactorY);
          scaleFactorX = maxS;
          scaleFactorY = maxS;
        }

        editorActions.updateElementTransform(dragState.resizeElId, {
          scaleX: (initT.scaleX ?? 1) * scaleFactorX,
          scaleY: (initT.scaleY ?? 1) * scaleFactorY,
        });
      } else if (dragState.type === 'rotate' && dragState.resizeElId && dragState.rotCenter) {
        const currentAngle =
          Math.atan2(y - dragState.rotCenter.y, x - dragState.rotCenter.x) * (180 / Math.PI);
        const deltaAngle = currentAngle - (dragState.startAngle ?? 0);
        let newRot = Math.round(((dragState.initialRotation ?? 0) + deltaAngle) % 360);
        newRot = (newRot + 360) % 360;
        if (e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15;
        }
        editorActions.updateElementTransform(dragState.resizeElId, {
          rotation: newRot,
        });
        setTransformBadge({ x: e.clientX, y: e.clientY - 28, text: `Rotation: ${newRot}°` });
      } else if (dragState.type === 'pivot' && dragState.resizeElId) {
        const initT = dragState.initialTransforms[dragState.resizeElId] ?? {};
        const localPt = stageToElementLocal(x, y, initT as Transform);
        const originX = Math.round(localPt.x);
        const originY = Math.round(localPt.y);
        editorActions.updateElementTransform(dragState.resizeElId, {
          originX,
          originY,
        });
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
          editorActions.updateElementTransform(dragState.resizeElId, { skewX: newSkewX });
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
          editorActions.updateElementTransform(dragState.resizeElId, { skewY: newSkewY });
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

          editorActions.updateElementProps(targetEl.id, { paths: newPaths });
        }
      } else if (
        dragState.type === 'subselect_drag_handle' &&
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

          editorActions.updateElementProps(targetEl.id, { paths: newPaths });
        }
      }

      setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState) return;
      setTransformBadge(null);

      if (
        dragState.type === 'pan' ||
        dragState.type === 'pen_drag' ||
        dragState.type === 'subselect_drag_anchor' ||
        dragState.type === 'subselect_drag_handle' ||
        dragState.type === 'rotate' ||
        dragState.type === 'pivot' ||
        dragState.type === 'skew'
      ) {
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

        const newRect: ShapeElement = {
          id: `rect_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: rx,
            y: ry,
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

        const newOval: ShapeElement = {
          id: `oval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: rx,
            y: ry,
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
        const radius = Math.max(8, Math.hypot(x - dragState.startX, y - dragState.startY));
        const pts = dragState.polygonPoints ?? 5;
        const ratio = dragState.polygonStarRatio ?? 0.5;
        const angle = Math.atan2(y - dragState.startY, x - dragState.startX);

        const pathD = generatePolygonStarPath(radius, radius, radius, pts, ratio, angle);

        const newPoly: ShapeElement = {
          id: `poly_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          transform: {
            x: dragState.startX - radius,
            y: dragState.startY - radius,
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
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
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
                {textEl.text}
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
            : textEl.text}
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

      return (
        <div
          onContextMenu={(e) => handleShapeContextMenu(e, el)}
          style={{
            position: 'relative',
            cursor: activeTool === 'select' || activeTool === 'subselect' ? 'move' : 'default',
          }}
        >
          {symbolDef.timeline.layers.map((subLayer) => {
            const kf = subLayer.keyframes[0];
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

  const stageBg = doc.stage.background;
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

            const isTween = kf.tween?.type === 'motion';
            let nextKf: EditorKeyframe | undefined;
            if (isTween) {
              const kfIdx = layer.keyframes.indexOf(kf);
              nextKf = layer.keyframes[kfIdx + 1];
            }

            const kfTime = getKeyframeTime(kf, fps);
            const nextKfTime = nextKf ? getKeyframeTime(nextKf, fps) : kfTime;

            const tweenProgress =
              isTween && nextKf && nextKfTime > kfTime
                ? Math.max(0, Math.min(1, (currentTime - kfTime) / (nextKfTime - kfTime)))
                : 0;

            // Compute parent folder transform & filters if inside a folder
            let parentFilters = '';
            let parentMatrix: Matrix2D | null = null;
            if (layer.parentLayerId) {
              const parentFolder = activeTl.layers.find((l) => l.id === layer.parentLayerId);
              if (parentFolder) {
                if (parentFolder.filters?.length) {
                  parentFilters = filtersToCSS(parentFolder.filters);
                }
                const parentKf = findKeyframeAtTime(parentFolder, currentTime, fps) ?? findKeyframeAt(parentFolder, currentFrame);
                if (parentKf?.transform) {
                  let folderTransform = parentKf.transform;
                  const isFolderTween = parentKf.tween?.type === 'motion';
                  if (isFolderTween) {
                    const kfIdx = parentFolder.keyframes.indexOf(parentKf);
                    const nextFolderKf = parentFolder.keyframes[kfIdx + 1];
                    if (nextFolderKf?.transform) {
                      const parentKfTime = getKeyframeTime(parentKf, fps);
                      const nextParentKfTime = getKeyframeTime(nextFolderKf, fps);
                      if (nextParentKfTime > parentKfTime) {
                        const prog = Math.max(0, Math.min(1, (currentTime - parentKfTime) / (nextParentKfTime - parentKfTime)));
                        folderTransform = {
                          x: folderTransform.x + (nextFolderKf.transform.x - folderTransform.x) * prog,
                          y: folderTransform.y + (nextFolderKf.transform.y - folderTransform.y) * prog,
                          scaleX:
                            (folderTransform.scaleX ?? 1) +
                            ((nextFolderKf.transform.scaleX ?? 1) - (folderTransform.scaleX ?? 1)) * prog,
                          scaleY:
                            (folderTransform.scaleY ?? 1) +
                            ((nextFolderKf.transform.scaleY ?? 1) - (folderTransform.scaleY ?? 1)) * prog,
                          rotation:
                            (folderTransform.rotation ?? 0) +
                            ((nextFolderKf.transform.rotation ?? 0) - (folderTransform.rotation ?? 0)) * prog,
                          skewX:
                            (folderTransform.skewX ?? 0) +
                            ((nextFolderKf.transform.skewX ?? 0) - (folderTransform.skewX ?? 0)) * prog,
                          skewY:
                            (folderTransform.skewY ?? 0) +
                            ((nextFolderKf.transform.skewY ?? 0) - (folderTransform.skewY ?? 0)) * prog,
                          originX: folderTransform.originX ?? 0,
                          originY: folderTransform.originY ?? 0,
                        };
                      }
                    }
                  }
                  parentMatrix = Matrix2D.fromTransform(folderTransform);
                }
              }
            }

            const layerFilterCSS = filtersToCSS(layer.filters);
            const combinedFilter = [parentFilters, layerFilterCSS].filter(Boolean).join(' ') || undefined;

            return (
              <div
                key={layer.id}
                className={styles.stageLayer}
                style={{
                  filter: combinedFilter,
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
                        tweenProgress
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
                      onMouseDown={(e) => handleElementMouseDown(e, el)}
                      onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                    >
                      {renderElementContent(displayEl)}

                      {/* Freeform Transformation Box in Selection Mode */}
                      {isSelected && !isLocked && activeTool === 'select' && editingTextElId !== el.id && (
                        <div
                          className={styles.selectionBox}
                          style={{
                            left: `${bounds.x}px`,
                            top: `${bounds.y}px`,
                            width: `${bounds.width}px`,
                            height: `${bounds.height}px`,
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
                          {/* 4 Corner handles: scale */}
                          <div
                            className={`${styles.transformHandle} ${styles.handleTopLeft}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'tl', bounds)}
                            title="Scale / 3D Perspective (Hold Cmd/Ctrl to distort perspective, Shift for uniform)"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleTopRight}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'tr', bounds)}
                            title="Scale / 3D Perspective (Hold Cmd/Ctrl to distort perspective, Shift for uniform)"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleBottomLeft}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'bl', bounds)}
                            title="Scale / 3D Perspective (Hold Cmd/Ctrl to distort perspective, Shift for uniform)"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleBottomRight}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'br', bounds)}
                            title="Scale / 3D Perspective (Hold Cmd/Ctrl to distort perspective, Shift for uniform)"
                          />

                          {/* 4 Mid-edge handles: stretch */}
                          <div
                            className={`${styles.transformHandle} ${styles.handleTopCenter}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'tc', bounds)}
                            title="Stretch Vertical"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleMiddleRight}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'mr', bounds)}
                            title="Stretch Horizontal"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleBottomCenter}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'bc', bounds)}
                            title="Stretch Vertical"
                          />
                          <div
                            className={`${styles.transformHandle} ${styles.handleMiddleLeft}`}
                            style={{
                              transform: `scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handleResizeMouseDown(e, el, 'ml', bounds)}
                            title="Stretch Horizontal"
                          />

                          {/* 4 Skew zones along edges (shear X and Y) */}
                          <div
                            className={styles.skewZoneTop}
                            onMouseDown={(e) => handleSkewMouseDown(e, el, 'x', bounds)}
                            title="Shear X (Skew along top edge)"
                          >
                            <div className={styles.skewHandleBarH} />
                          </div>
                          <div
                            className={styles.skewZoneBottom}
                            onMouseDown={(e) => handleSkewMouseDown(e, el, 'x', bounds)}
                            title="Shear X (Skew along bottom edge)"
                          >
                            <div className={styles.skewHandleBarH} />
                          </div>
                          <div
                            className={styles.skewZoneLeft}
                            onMouseDown={(e) => handleSkewMouseDown(e, el, 'y', bounds)}
                            title="Shear Y (Skew along left edge)"
                          >
                            <div className={styles.skewHandleBarV} />
                          </div>
                          <div
                            className={styles.skewZoneRight}
                            onMouseDown={(e) => handleSkewMouseDown(e, el, 'y', bounds)}
                            title="Shear Y (Skew along right edge)"
                          >
                            <div className={styles.skewHandleBarV} />
                          </div>

                          {/* 4 Rotation zones outside corners */}
                          <div
                            className={`${styles.rotateZone} ${styles.rotTopLeft}`}
                            onMouseDown={(e) => handleRotateMouseDown(e, el, bounds)}
                            title="Rotate"
                          />
                          <div
                            className={`${styles.rotateZone} ${styles.rotTopRight}`}
                            onMouseDown={(e) => handleRotateMouseDown(e, el, bounds)}
                            title="Rotate"
                          />
                          <div
                            className={`${styles.rotateZone} ${styles.rotBottomLeft}`}
                            onMouseDown={(e) => handleRotateMouseDown(e, el, bounds)}
                            title="Rotate"
                          />
                          <div
                            className={`${styles.rotateZone} ${styles.rotBottomRight}`}
                            onMouseDown={(e) => handleRotateMouseDown(e, el, bounds)}
                            title="Rotate"
                          />

                          {/* Center registration point / draggable pivot */}
                          <div
                            className={styles.pivotHandle}
                            style={{
                              left: `${
                                (el.transform.originX ?? bounds.x + bounds.width / 2) -
                                bounds.x
                              }px`,
                              top: `${
                                (el.transform.originY ?? bounds.y + bounds.height / 2) -
                                bounds.y
                              }px`,
                              transform: `translate(-50%, -50%) scale(${1 / (effectiveTransform.scaleX || 1)}, ${1 / (effectiveTransform.scaleY || 1)}) skew(${-((effectiveTransform.skewX ?? 0))}deg, ${-((effectiveTransform.skewY ?? 0))}deg)`,
                            }}
                            onMouseDown={(e) => handlePivotMouseDown(e, el, bounds)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              // Double-click snaps registration point back to exact center
                              editorActions.updateElementTransform(el.id, {
                                originX: Math.round(bounds.x + bounds.width / 2),
                                originY: Math.round(bounds.y + bounds.height / 2),
                              });
                            }}
                            title="Registration Point (Double-click to center, drag or use 9-point grid in Properties)"
                          >
                            <div className={styles.pivotCrosshairH} />
                            <div className={styles.pivotCrosshairV} />
                            <div className={styles.pivotRing} />
                          </div>
                        </div>
                      )}
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
            const currentKf =
              findKeyframeAtTime(selLayer, currentTime, fps) ??
              findKeyframeAt(selLayer, currentFrame);
            if (!currentKf || currentKf.elements.length === 0) return null;

            // Compute composite stage-space bounding box of all elements on this layer
            let lMinX = Infinity;
            let lMinY = Infinity;
            let lMaxX = -Infinity;
            let lMaxY = -Infinity;

            for (const el of currentKf.elements) {
              if (el.visible === false) continue;
              const bounds = getElementBounds(el);
              const corners = [
                { x: bounds.x, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                { x: bounds.x, y: bounds.y + bounds.height },
              ];

              for (const pt of corners) {
                const stagePt = elementLocalToStage(pt.x, pt.y, el.transform);
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

              const initialTransforms: Record<string, Transform> = {};
              for (const el of currentKf.elements) {
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
            };

            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${lMinX}px`,
                  top: `${lMinY}px`,
                  width: `${layerBoxW}px`,
                  height: `${layerBoxH}px`,
                  border: '1.5px solid #3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  pointerEvents: 'auto',
                  cursor: 'move',
                  zIndex: 40,
                }}
                onMouseDown={handleLayerBoxMouseDown}
                title={`Layer: ${selLayer.name} (${currentKf.elements.length} elements grouped)`}
              >
                {/* 8 Bounding Box Corner and Edge Handles */}
                <div className={`${styles.handle} ${styles.handleTl}`} />
                <div className={`${styles.handle} ${styles.handleTc}`} />
                <div className={`${styles.handle} ${styles.handleTr}`} />
                <div className={`${styles.handle} ${styles.handleMr}`} />
                <div className={`${styles.handle} ${styles.handleBr}`} />
                <div className={`${styles.handle} ${styles.handleBc}`} />
                <div className={`${styles.handle} ${styles.handleBl}`} />
                <div className={`${styles.handle} ${styles.handleMl}`} />

                {/* Layer Badge Label */}
                <div
                  style={{
                    position: 'absolute',
                    top: -20,
                    left: 0,
                    backgroundColor: '#3b82f6',
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
                  <span>⚡</span>
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
            −
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
            +
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomFit}
            title="Fit Stage in View"
          >
            Fit
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
