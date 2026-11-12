import { Matrix2D } from '@flashback/runtime';
import type {
  ShapeElement,
  TextElement,
  RectCornerRadius,
  RectCornerTypes,
  CornerType,
  RectConfig,
  OvalConfig,
  Fill,
} from '@flashback/runtime';
import {
  unitePaths,
  subtractPaths,
  intersectPaths,
  excludePaths,
  expandStroke,
  fitPointsToCurve,
  convertTextToVectorPath,
  getGeometryPaperScope,
  extractPathData,
} from '../../utils/geometry';
import {
  generatePolygonStarPath,
  generateRoundedRectPath,
  generateOvalPath,
  getShapeBounds,
  applyCornerRadiusToPath,
  getUniformCornerRadius,
  getUniformCornerType,
} from '../../utils/shapeGenerators';
import {
  insertPointOnPathSegment,
  deletePathAnchor as deleteAnchorFromPathD,
  parseSvgPath,
  openPath,
  closePath,
  isPathClosed,
  slicePathAtPoint,
  fitCurveToPoints,
  samplePointsFromPath,
  toggleAnchorPointType,
  getAnchorPointType,
  type Vector2D,
} from '../../utils/bezier';
import { fastClone } from './historySlice';
import type {
  GeometrySliceActions,
  SliceContext,
  SliceCreator,
  EditorKeyframe,
  EditorLayer,
} from './types';

export function getTransformedPath(shape: ShapeElement): string {
  const d = shape.basePathD || shape.paths?.[0]?.d || '';
  if (!d) return '';
  const t = shape.transform;
  if (!t) return d;
  const isIdentity =
    (t.x === 0 || t.x === undefined) &&
    (t.y === 0 || t.y === undefined) &&
    (!t.rotation || t.rotation === 0) &&
    (t.scaleX === 1 || t.scaleX === undefined) &&
    (t.scaleY === 1 || t.scaleY === undefined) &&
    (!t.skewX || t.skewX === 0) &&
    (!t.skewY || t.skewY === 0) &&
    (!t.originX || t.originX === 0) &&
    (!t.originY || t.originY === 0);

  if (isIdentity) return d;

  const m = Matrix2D.fromTransform(t);
  if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0) {
    return d;
  }

  try {
    const scope = getGeometryPaperScope();
    scope.activate();
    try {
      const item = new scope.CompoundPath(d);
      const pMat = new scope.Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty);
      item.transform(pMat);
      const res = extractPathData(item);
      return res || d;
    } finally {
      try {
        scope.project?.clear();
      } catch {}
    }
  } catch {
    return d;
  }
}

export const createGeometrySlice: SliceCreator<GeometrySliceActions> = (
  context: SliceContext
): GeometrySliceActions => {
  let state = context.getState();
  const pushHistorySnapshot = () => context.pushHistorySnapshot();
  const getActiveTimeline = context.getActiveTimeline;
  const findKeyframeAtTime = context.findKeyframeAtTime;
  const findKeyframeAt = context.findKeyframeAt;
  const deepCloneDoc = fastClone;
  const editorActions = new Proxy({} as any, {
    get: (_target, prop) => context.getActions()[prop],
  });

  function notify(): void {
    context.setState(state);
  }

  return {
  setStarConfig(config: Partial<{ points: number; pointRatio: number; cornerRadius?: number }>): void {
    state = context.getState();
    state = {
      ...state,
      starConfig: {
        points: config.points !== undefined ? Math.max(3, Math.min(64, Math.round(config.points))) : state.starConfig.points,
        pointRatio: config.pointRatio !== undefined ? Math.max(0.05, Math.min(3.0, config.pointRatio)) : state.starConfig.pointRatio,
        cornerRadius: config.cornerRadius !== undefined ? Math.max(0, config.cornerRadius) : (state.starConfig.cornerRadius ?? 0),
      },
    };
    notify();
  },

  setRectConfig(config: Partial<{ width?: number; height?: number; cornerRadius: number | RectCornerRadius; cornerType: CornerType | RectCornerTypes }>): void {
    state = context.getState();
    state = {
      ...state,
      rectConfig: {
        cornerRadius: config.cornerRadius !== undefined ? config.cornerRadius : state.rectConfig.cornerRadius,
        cornerType: config.cornerType !== undefined ? config.cornerType : state.rectConfig.cornerType,
      },
    };
    notify();
  },

  setOvalConfig(config: Partial<{ innerRadiusRatio: number; startAngle: number; endAngle: number }>): void {
    state = context.getState();
    state = {
      ...state,
      ovalConfig: {
        innerRadiusRatio:
          config.innerRadiusRatio !== undefined
            ? Math.max(0, Math.min(0.92, config.innerRadiusRatio))
            : state.ovalConfig.innerRadiusRatio,
        startAngle:
          config.startAngle !== undefined
            ? Math.max(0, Math.min(360, config.startAngle))
            : state.ovalConfig.startAngle,
        endAngle:
          config.endAngle !== undefined
            ? Math.max(0, Math.min(360, config.endAngle))
            : state.ovalConfig.endAngle,
      },
    };
    notify();
  },

  setPencilConfig(
    config: Partial<{
      smoothness: number;
      fillNewStrokes: boolean;
      keepSelected: boolean;
      editSelectedPaths: boolean;
    }>
  ): void {
    state = context.getState();
    const nextSmoothness =
      config.smoothness !== undefined
        ? Math.max(0, Math.min(100, config.smoothness))
        : state.pencilConfig.smoothness;

    state = {
      ...state,
      pencilConfig: {
        ...state.pencilConfig,
        ...config,
        smoothness: nextSmoothness,
      },
    };

    // If smoothness changed and an element is currently selected, re-smooth the selected path live!
    if (config.smoothness !== undefined && state.selectedElementIds.length > 0) {
      editorActions.reSmoothSelectedShape(nextSmoothness);
    } else {
      notify();
    }
  },

  setPencilOptionsOpen(open: boolean): void {
    state = context.getState();
    state = { ...state, isPencilOptionsOpen: open };
    notify();
  },

  reSmoothSelectedShape(smoothness: number): void {
    state = context.getState();
    if (state.selectedElementIds.length === 0) return;
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let modified = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;

      for (const el of kf.elements) {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          const shape = el as ShapeElement;
          const currentD = shape.basePathD || shape.paths?.[0]?.d;
          if (!currentD) continue;

          let pointsToFit: Vector2D[] = (shape as any).rawPoints;
          if (!pointsToFit || pointsToFit.length < 2) {
            pointsToFit = samplePointsFromPath(currentD, 12);
          }

          if (pointsToFit && pointsToFit.length >= 2) {
            const closed = isPathClosed(currentD);
            const tolerance = 0.5 + (smoothness / 100) * 15;
            const fitted = fitPointsToCurve(pointsToFit, tolerance, { closed });
            if (fitted) {
              shape.paths = shape.paths.map((p, idx) =>
                idx === 0 ? { ...p, d: fitted } : p
              );
              if (shape.basePathD) {
                shape.basePathD = fitted;
              }
              shape.isCustomizedPath = true;
              shape.pencilSmoothness = smoothness;
              modified = true;
            }
          }
        }
      }
    }

    if (modified) {
      state = { ...state, doc };
      notify();
    }
  },

  createPencilShape(
    points: Array<{ x: number; y: number }>,
    options?: {
      smoothness?: number;
      closed?: boolean;
      fill?: Fill;
      stroke?: any;
      strokeWidth?: number;
    }
  ): ShapeElement | null {
    state = context.getState();
    if (!points || points.length < 2) return null;

    const smoothness = options?.smoothness ?? state.pencilConfig.smoothness ?? 50;
    const tolerance = 0.5 + (smoothness / 100) * 15;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const w = Math.max(8, maxX - minX);
    const h = Math.max(8, maxY - minY);
    const originX = Math.round(w / 2);
    const originY = Math.round(h / 2);

    const first = points[0];
    const last = points[points.length - 1];
    const loopDist = Math.hypot(last.x - first.x, last.y - first.y);
    const isClosed = options?.closed ?? (points.length > 3 && loopDist <= 16);

    const localRawPoints = points.map((p) => ({
      x: Math.round((p.x - minX) * 100) / 100,
      y: Math.round((p.y - minY) * 100) / 100,
    }));

    const fittedD = fitPointsToCurve(localRawPoints, tolerance, { closed: isClosed });
    if (!fittedD) return null;

    const shouldFill = options?.fill
      ? true
      : state.pencilConfig.fillNewStrokes
      ? Boolean(state.activeFill)
      : isClosed;

    const newShape: ShapeElement = {
      id: `pencil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'shape',
      visible: true,
      rawPoints: localRawPoints,
      pencilSmoothness: smoothness,
      transform: {
        x: Math.round((minX + originX) * 100) / 100,
        y: Math.round((minY + originY) * 100) / 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX,
        originY,
      },
      paths: [
        {
          d: fittedD,
          fill:
            options?.fill ??
            (shouldFill
              ? state.activeFill ?? { type: 'solid', color: state.fillColor }
              : { type: 'solid', color: 'transparent' }),
          stroke: options?.stroke ?? {
            fill: state.activeStroke ?? { type: 'solid', color: state.strokeColor },
            width: options?.strokeWidth ?? state.strokeWidth,
            cap: 'round',
            join: 'round',
          },
        },
      ],
      alpha: 1,
    };

    return newShape;
  },

  uniteSelectedShapes(): void {
    state = context.getState();
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let unitedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      unitedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        unitedD = unitePaths(unitedD, nextD);
      }
    } else {
      unitedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        unitedD = unitePaths(unitedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: unitedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  subtractSelectedShapes(): void {
    state = context.getState();
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let subtractedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      subtractedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        subtractedD = subtractPaths(subtractedD, nextD);
      }
    } else {
      subtractedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        subtractedD = subtractPaths(subtractedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: subtractedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  intersectSelectedShapes(): void {
    state = context.getState();
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let intersectedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      intersectedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        intersectedD = intersectPaths(intersectedD, nextD);
      }
    } else {
      intersectedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        intersectedD = intersectPaths(intersectedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: intersectedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  excludeSelectedShapes(): void {
    state = context.getState();
    if (state.selectedElementIds.length < 2) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    interface ShapeTarget {
      shape: ShapeElement;
      layer: EditorLayer;
      kf: EditorKeyframe;
      index: number;
    }
    const selectedTargets: ShapeTarget[] = [];
    const bottomToTopLayers = [...tl.layers].reverse();
    for (const layer of bottomToTopLayers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      kf.elements.forEach((el, idx) => {
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          selectedTargets.push({ shape: el as ShapeElement, layer, kf, index: idx });
        }
      });
    }

    if (selectedTargets.length < 2) return;

    const baseShape = selectedTargets[0].shape;
    const baseLayer = selectedTargets[0].layer;
    const baseKf = selectedTargets[0].kf;

    const allSameTransform = selectedTargets.every((t) => {
      const t1 = t.shape.transform;
      const t2 = baseShape.transform;
      return (
        t1.x === t2.x &&
        t1.y === t2.y &&
        (t1.scaleX ?? 1) === (t2.scaleX ?? 1) &&
        (t1.scaleY ?? 1) === (t2.scaleY ?? 1) &&
        (t1.rotation ?? 0) === (t2.rotation ?? 0) &&
        (t1.originX ?? 0) === (t2.originX ?? 0) &&
        (t1.originY ?? 0) === (t2.originY ?? 0)
      );
    });

    let excludedD: string;
    let finalTransform = { ...baseShape.transform };

    if (allSameTransform) {
      excludedD = baseShape.basePathD || baseShape.paths?.[0]?.d || '';
      for (let i = 1; i < selectedTargets.length; i++) {
        const nextD =
          selectedTargets[i].shape.basePathD || selectedTargets[i].shape.paths?.[0]?.d || '';
        excludedD = excludePaths(excludedD, nextD);
      }
    } else {
      excludedD = getTransformedPath(baseShape);
      for (let i = 1; i < selectedTargets.length; i++) {
        excludedD = excludePaths(excludedD, getTransformedPath(selectedTargets[i].shape));
      }
      finalTransform = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewX: 0,
        skewY: 0,
        originX: 0,
        originY: 0,
      };
    }

    const primaryPath = baseShape.paths?.[0];
    const newShapeId = baseShape.id;
    const newShape: ShapeElement = {
      ...baseShape,
      id: newShapeId,
      transform: finalTransform,
      paths: [
        {
          d: excludedD,
          fill: primaryPath?.fill,
          stroke: primaryPath?.stroke,
        },
      ],
      isCustomizedPath: true,
    };
    delete newShape.rectConfig;
    delete newShape.ovalConfig;
    delete newShape.starConfig;
    delete newShape.basePathD;
    delete newShape.pathAnchorRadii;
    delete newShape.pathAnchorTypes;
    delete newShape.rawPoints;

    const otherIds = new Set(selectedTargets.slice(1).map((t) => t.shape.id));
    for (const t of selectedTargets.slice(1)) {
      t.kf.elements = t.kf.elements.filter((e) => !otherIds.has(e.id));
    }
    const newIdx = baseKf.elements.findIndex((e) => e.id === baseShape.id);
    if (newIdx !== -1) {
      baseKf.elements[newIdx] = newShape;
    }

    const otherLayerIds = new Set(
      selectedTargets
        .slice(1)
        .map((t) => t.layer.id)
        .filter((id) => id !== baseLayer.id)
    );
    if (otherLayerIds.size > 0) {
      tl.layers = tl.layers.filter((l) => {
        if (!otherLayerIds.has(l.id)) return true;
        return l.keyframes.some((k) => k.elements.length > 0);
      });
    }

    state = {
      ...state,
      doc,
      selectedLayerId: baseLayer.id,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  outlineSelectedStroke(): void {
    state = context.getState();
    if (state.selectedElementIds.length === 0) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let modified = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;

      for (let i = 0; i < kf.elements.length; i++) {
        const el = kf.elements[i];
        if (state.selectedElementIds.includes(el.id) && el.type === 'shape') {
          const shape = el as ShapeElement;
          const currentD = shape.basePathD || shape.paths?.[0]?.d || '';
          const stroke = shape.paths?.[0]?.stroke;
          const strokeWidth = stroke?.width ?? 0;
          if (!currentD || strokeWidth <= 0) continue;

          const strokeFill =
            stroke?.fill ?? { type: 'solid', color: state.strokeColor || '#000000' };
          const cap = (stroke?.cap as 'round' | 'butt' | 'square') ?? 'round';
          const join = (stroke?.join as 'round' | 'miter' | 'bevel') ?? 'round';
          const miterLimit = (stroke as any)?.miterLimit ?? 4;

          const outlinedD = expandStroke(currentD, strokeWidth, { cap, join, miterLimit });
          if (outlinedD) {
            const updatedShape: ShapeElement = {
              ...shape,
              paths: [
                {
                  d: outlinedD,
                  fill: strokeFill,
                  stroke: undefined,
                },
              ],
              isCustomizedPath: true,
            };
            delete updatedShape.rectConfig;
            delete updatedShape.ovalConfig;
            delete updatedShape.starConfig;
            delete updatedShape.basePathD;
            delete updatedShape.pathAnchorRadii;
            delete updatedShape.pathAnchorTypes;
            delete updatedShape.rawPoints;

            kf.elements[i] = updatedShape;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      state = { ...state, doc };
      notify();
    }
  },

  async convertSelectedTextToOutlines(): Promise<void> {
    state = context.getState();
    if (state.selectedElementIds.length === 0) return;
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    let targetKf: EditorKeyframe | null = null;
    let targetIndex = -1;
    let textEl: TextElement | null = null;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const idx = kf.elements.findIndex(
        (e) => state.selectedElementIds.includes(e.id) && e.type === 'text'
      );
      if (idx !== -1) {
        targetKf = kf;
        targetIndex = idx;
        textEl = kf.elements[idx] as TextElement;
        break;
      }
    }

    if (!targetKf || targetIndex === -1 || !textEl) return;

    const text = textEl.text || '';
    if (!text.trim()) return;

    pushHistorySnapshot();

    let fontBuffer: ArrayBuffer | null = null;
    const fontAsset = doc.library?.fonts?.[textEl.fontId];
    if (
      fontAsset?.src &&
      !fontAsset.src.endsWith('.css') &&
      !fontAsset.src.includes('googleapis.com/css')
    ) {
      try {
        if (fontAsset.src.startsWith('data:')) {
          const base64 = fontAsset.src.split(',')[1];
          if (typeof atob === 'function') {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            fontBuffer = bytes.buffer;
          }
        } else if (typeof fetch === 'function') {
          const resp = await fetch(fontAsset.src);
          if (resp.ok) {
            fontBuffer = await resp.arrayBuffer();
          }
        }
      } catch {
        // fallback
      }
    }

    const fontSize = textEl.fontSize || 32;
    const pathData = await convertTextToVectorPath(text, fontBuffer, { fontSize });
    if (!pathData) return;

    const fill = textEl.fill || {
      type: 'solid',
      color: textEl.color || '#000000',
    };

    const newShapeId = `shape_outline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newShape: ShapeElement = {
      id: newShapeId,
      type: 'shape',
      visible: textEl.visible ?? true,
      locked: textEl.locked ?? false,
      alpha: textEl.alpha ?? 1,
      transform: { ...textEl.transform },
      paths: [
        {
          d: pathData,
          fill,
          stroke: textEl.stroke,
        },
      ],
      isCustomizedPath: true,
    };

    targetKf.elements[targetIndex] = newShape;

    state = {
      ...state,
      doc,
      selectedElementIds: [newShapeId],
    };
    notify();
  },

  openShapePath(elementId?: string): void {
    state = context.getState();
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: openPath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  closeShapePath(elementId?: string): void {
    state = context.getState();
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: closePath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  togglePathClosed(elementId?: string): void {
    state = context.getState();
    const targetId = elementId || state.selectedElementIds[0];
    if (!targetId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === targetId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const firstPath = shape.paths[0];
        const isClosed = isPathClosed(firstPath?.d || '');
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: isClosed ? openPath(p.d) : closePath(p.d),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  slicePathAtPoint(elementId: string, pt: Vector2D): void {
    state = context.getState();
    if (!elementId) return;
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === elementId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const newPaths = shape.paths.map((p) => ({
          ...p,
          d: slicePathAtPoint(p.d, pt),
        }));
        shape.paths = newPaths;
        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  togglePathAnchorPointType(shapeId: string, anchorIndex: number, pathIndex = 0): void {
    state = context.getState();
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === shapeId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const baseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : shape.paths[pathIndex]?.d;
        if (!baseD) return;

        const currentPointTypes = shape.pathAnchorPointTypes || {};
        const { d: newD, newType } = toggleAnchorPointType(baseD, anchorIndex);

        shape.paths = shape.paths.map((p, idx) =>
          idx === pathIndex ? { ...p, d: newD } : p
        );
        if (pathIndex === 0 && shape.basePathD) {
          shape.basePathD = newD;
        }
        shape.pathAnchorPointTypes = {
          ...currentPointTypes,
          [anchorIndex]: newType,
        };
        shape.isCustomizedPath = true;

        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  setPathAnchorPointType(shapeId: string, anchorIndex: number, pointType: 'smooth' | 'corner', pathIndex = 0): void {
    state = context.getState();
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;

    for (const layer of tl.layers) {
      const kf = findKeyframeAtTime(layer, state.currentTime, fps) ?? findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const el = kf.elements.find((e) => e.id === shapeId);
      if (el && el.type === 'shape') {
        const shape = el as ShapeElement;
        const baseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : shape.paths[pathIndex]?.d;
        if (!baseD) return;

        const currentPointTypes = shape.pathAnchorPointTypes || {};
        const { d: newD, newType } = toggleAnchorPointType(baseD, anchorIndex, pointType);

        shape.paths = shape.paths.map((p, idx) =>
          idx === pathIndex ? { ...p, d: newD } : p
        );
        if (pathIndex === 0 && shape.basePathD) {
          shape.basePathD = newD;
        }
        shape.pathAnchorPointTypes = {
          ...currentPointTypes,
          [anchorIndex]: newType,
        };
        shape.isCustomizedPath = true;

        state = { ...state, doc };
        notify();
        return;
      }
    }
  },

  updateStarShape(
    elementId: string,
    config: { points?: number; pointRatio?: number; cornerRadius?: number },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    state = context.getState();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && (shape as any).isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig = (shape as any).starConfig || {};
          const bounds = getShapeBounds(shape);
          const outerRadius =
            prevConfig.outerRadius ??
            Math.max(8, Math.max(bounds.width, bounds.height) / 2);
          const cx = prevConfig.cx ?? (shape.transform.originX || outerRadius);
          const cy = prevConfig.cy ?? (shape.transform.originY || outerRadius);
          const startAngle = prevConfig.startAngle ?? -Math.PI / 2;

          const prevPoints = prevConfig.points ?? 5;
          const points =
            config.points !== undefined
              ? Math.max(3, Math.min(64, Math.round(config.points)))
              : prevPoints;
          const pointRatio =
            config.pointRatio !== undefined
              ? Math.max(0.05, Math.min(3.0, config.pointRatio))
              : (prevConfig.pointRatio ?? 0.5);
          const nextCornerRadius =
            config.cornerRadius !== undefined
              ? Math.max(0, Math.min(100, config.cornerRadius))
              : (prevConfig.cornerRadius !== undefined && prevConfig.cornerRadius > 0
                  ? prevConfig.cornerRadius
                  : (shape.pathCornerRadius ?? prevConfig.cornerRadius ?? 0));

          const unroundedStarD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            0
          );

          let nextAnchorRadii = shape.pathAnchorRadii;
          let nextAnchorTypes = shape.pathAnchorTypes;
          if (config.points !== undefined && config.points !== prevPoints) {
            nextAnchorRadii = undefined;
            nextAnchorTypes = undefined;
          }

          let newD: string;
          if (
            (shape.pathCornerType && shape.pathCornerType !== 'round') ||
            nextAnchorRadii ||
            nextAnchorTypes
          ) {
            newD = applyCornerRadiusToPath(
              unroundedStarD,
              nextCornerRadius,
              shape.pathCornerType ?? 'round',
              nextAnchorRadii,
              nextAnchorTypes
            );
          } else {
            newD = generatePolygonStarPath(
              cx,
              cy,
              outerRadius,
              points,
              pointRatio,
              startAngle,
              nextCornerRadius
            );
          }

          const updatedStarConfig = {
            ...prevConfig,
            points,
            pointRatio,
            outerRadius,
            startAngle,
            cornerRadius: nextCornerRadius,
            cx,
            cy,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: { type: 'solid', color: state.fillColor },
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            starConfig: updatedStarConfig,
            basePathD: unroundedStarD,
            pathCornerRadius: nextCornerRadius,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
          } as any;

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetStarShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    state = context.getState();
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig = (shape as any).starConfig || {};
          const bounds = getShapeBounds(shape);
          const outerRadius =
            prevConfig.outerRadius ??
            Math.max(8, Math.max(bounds.width, bounds.height) / 2);
          const cx = prevConfig.cx ?? (shape.transform.originX || outerRadius);
          const cy = prevConfig.cy ?? (shape.transform.originY || outerRadius);
          const startAngle = prevConfig.startAngle ?? -Math.PI / 2;
          const points = prevConfig.points ?? 5;
          const pointRatio = prevConfig.pointRatio ?? 0.5;
          const cornerRadius = prevConfig.cornerRadius ?? shape.pathCornerRadius ?? 0;

          const unroundedStarD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            0
          );

          const newD = generatePolygonStarPath(
            cx,
            cy,
            outerRadius,
            points,
            pointRatio,
            startAngle,
            cornerRadius
          );

          const updatedStarConfig = {
            ...prevConfig,
            points,
            pointRatio,
            outerRadius,
            startAngle,
            cornerRadius,
            cx,
            cy,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: { type: 'solid', color: state.fillColor },
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            starConfig: updatedStarConfig,
            basePathD: unroundedStarD,
            pathCornerRadius: cornerRadius,
            pathCornerType: undefined,
            pathAnchorRadii: undefined,
            pathAnchorTypes: undefined,
            isCustomizedPath: false,
          } as any;

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateRectShape(
    elementId: string,
    config: {
      width?: number;
      height?: number;
      cornerRadius?: number | RectCornerRadius;
      cornerType?: CornerType | RectCornerTypes;
    },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    state = context.getState();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && shape.isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig: Partial<RectConfig> = shape.rectConfig || {};
          const bounds = getShapeBounds(shape);
          const width = Math.max(8, config.width ?? prevConfig.width ?? bounds.width);
          const height = Math.max(8, config.height ?? prevConfig.height ?? bounds.height);
          const cornerRadius =
            config.cornerRadius !== undefined
              ? config.cornerRadius
              : (prevConfig.cornerRadius ?? 0);
          const cornerType: CornerType | RectCornerTypes =
            config.cornerType ?? prevConfig.cornerType ?? 'round';

          const newD = generateRoundedRectPath(
            width,
            height,
            cornerRadius,
            cornerType,
            bounds.x,
            bounds.y
          );

          const updatedRectConfig: RectConfig = {
            width,
            height,
            cornerRadius,
            cornerType,
          };

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          } else {
            newPaths.push({
              d: newD,
              fill: state.activeFill,
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            rectConfig: updatedRectConfig,
          };

          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetRectShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    state = context.getState();
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig: Partial<RectConfig> = shape.rectConfig || {};
          const bounds = getShapeBounds(shape);
          const width = Math.max(8, prevConfig.width ?? bounds.width);
          const height = Math.max(8, prevConfig.height ?? bounds.height);
          const cornerRadius = prevConfig.cornerRadius ?? 0;
          const cornerType: CornerType | RectCornerTypes = prevConfig.cornerType ?? 'round';

          const newD = generateRoundedRectPath(width, height, cornerRadius, cornerType, 0, 0);

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            rectConfig: { width, height, cornerRadius, cornerType },
            basePathD: undefined,
            pathCornerRadius: undefined,
            pathAnchorRadii: undefined,
            pathAnchorTypes: undefined,
            isCustomizedPath: false,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  insertPathAnchor(
    elementId: string,
    pathIndex = 0,
    segmentIndex = 0,
    t = 0.5,
    options?: { skipHistory?: boolean }
  ): number | null {
    state = context.getState();
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let insertedIdx: number | null = null;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const targetPath = shape.paths[pathIndex];
          if (!targetPath) break;

          // Determine the un-rounded base path if we're editing pathIndex === 0
          let currentBaseD = pathIndex === 0 && shape.basePathD ? shape.basePathD : targetPath.d;
          let carriedRadius = shape.pathCornerRadius ?? 0;
          let carriedType: CornerType = shape.pathCornerType ?? 'round';

          if (pathIndex === 0 && !shape.basePathD) {
            if (shape.rectConfig && !shape.isCustomizedPath) {
              const bounds = getShapeBounds(shape);
              const w = shape.rectConfig.width ?? bounds.width;
              const h = shape.rectConfig.height ?? bounds.height;
              currentBaseD = generateRoundedRectPath(w, h, 0, 'round', bounds.x, bounds.y);
              carriedRadius = getUniformCornerRadius(shape.rectConfig.cornerRadius);
              carriedType = getUniformCornerType(shape.rectConfig.cornerType);
            } else if (shape.starConfig && !shape.isCustomizedPath) {
              const sc = shape.starConfig;
              const bounds = getShapeBounds(shape);
              const outerR = sc.outerRadius ?? Math.max(8, Math.max(bounds.width, bounds.height) / 2);
              const cx = sc.cx ?? (shape.transform.originX || outerR);
              const cy = sc.cy ?? (shape.transform.originY || outerR);
              currentBaseD = generatePolygonStarPath(
                cx,
                cy,
                outerR,
                sc.points ?? 5,
                sc.pointRatio ?? 0.5,
                sc.startAngle ?? -Math.PI / 2,
                0
              );
              carriedRadius = sc.cornerRadius ?? 0;
            }
          }

          const res = insertPointOnPathSegment(currentBaseD, segmentIndex, t);
          if (res.insertedAnchorIndex < 0) break;
          insertedIdx = res.insertedAnchorIndex;

          // Shift per-anchor radius/type indices after segmentIndex
          let nextAnchorRadii: Record<number, number> | undefined;
          if (shape.pathAnchorRadii) {
            nextAnchorRadii = {};
            for (const [kStr, val] of Object.entries(shape.pathAnchorRadii)) {
              const k = Number(kStr);
              nextAnchorRadii[k > segmentIndex ? k + 1 : k] = val;
            }
          }
          let nextAnchorTypes: Record<number, CornerType> | undefined;
          if (shape.pathAnchorTypes) {
            nextAnchorTypes = {};
            for (const [kStr, val] of Object.entries(shape.pathAnchorTypes)) {
              const k = Number(kStr);
              nextAnchorTypes[k > segmentIndex ? k + 1 : k] = val;
            }
          }

          const finalD =
            pathIndex === 0
              ? applyCornerRadiusToPath(
                  res.d,
                  carriedRadius,
                  carriedType,
                  nextAnchorRadii,
                  nextAnchorTypes
                )
              : res.d;

          const newPaths = [...shape.paths];
          newPaths[pathIndex] = { ...targetPath, d: finalD };

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: pathIndex === 0 ? res.d : shape.basePathD,
            pathCornerRadius: carriedRadius,
            pathCornerType: carriedType,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
            isCustomizedPath: true,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
    return insertedIdx;
  },

  deletePathAnchor(
    elementId: string,
    pathIndex = 0,
    anchorIndex = 0,
    options?: { skipHistory?: boolean }
  ): void {
    state = context.getState();
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;
    let resultingD = '';

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const targetPath = shape.paths[pathIndex];
          if (!targetPath) break;

          const sourceD = pathIndex === 0 && shape.basePathD ? shape.basePathD : targetPath.d;
          const parsed = parseSvgPath(sourceD);

          // If the path only has 2 or fewer points, deleting the anchor removes the entire shape
          if (parsed.anchors.length <= 2) {
            kf.elements.splice(elIndex, 1);
            state = {
              ...state,
              doc,
              selectedElementIds: state.selectedElementIds.filter((id) => id !== elementId),
              subselectedAnchor: null,
            };
            notify();
            return;
          }

          const newBaseD = deleteAnchorFromPathD(sourceD, anchorIndex);
          if (newBaseD === sourceD) break;

          const finalD =
            pathIndex === 0
              ? applyCornerRadiusToPath(
                  newBaseD,
                  shape.pathCornerRadius ?? 0,
                  shape.pathCornerType ?? 'round',
                  shape.pathAnchorRadii,
                  shape.pathAnchorTypes
                )
              : newBaseD;

          const newPaths = [...shape.paths];
          newPaths[pathIndex] = { ...targetPath, d: finalD };

          const shiftRecordKeys = <T>(rec?: Record<number, T>): Record<number, T> | undefined => {
            if (!rec) return undefined;
            const res: Record<number, T> = {};
            for (const [kStr, v] of Object.entries(rec)) {
              const k = Number(kStr);
              if (k < anchorIndex) res[k] = v;
              else if (k > anchorIndex) res[k - 1] = v;
            }
            return res;
          };

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: pathIndex === 0 ? newBaseD : shape.basePathD,
            pathAnchorPointTypes: shiftRecordKeys(shape.pathAnchorPointTypes),
            pathAnchorRadii: shiftRecordKeys(shape.pathAnchorRadii),
            pathAnchorTypes: shiftRecordKeys(shape.pathAnchorTypes),
            isCustomizedPath: true,
          };
          updated = true;
          resultingD = newBaseD;
          break;
        }
      }
    }

    if (updated) {
      let nextSubselectedAnchor = state.subselectedAnchor;
      if (
        state.subselectedAnchor?.shapeId === elementId &&
        state.subselectedAnchor.pathIndex === pathIndex
      ) {
        const remainingCount = parseSvgPath(resultingD).anchors.length;
        if (remainingCount > 0) {
          const nextIdx = Math.min(anchorIndex, remainingCount - 1);
          nextSubselectedAnchor = { shapeId: elementId, pathIndex, anchorIndex: nextIdx };
        } else {
          nextSubselectedAnchor = null;
        }
      }

      state = { ...state, doc, subselectedAnchor: nextSubselectedAnchor };
      notify();
    }
  },

  updateShapeCornerRadius(
    elementId: string,
    config: {
      cornerRadius?: number;
      cornerType?: CornerType;
      anchorRadii?: Record<number, number>;
      anchorTypes?: Record<number, CornerType>;
    },
    options?: { skipHistory?: boolean }
  ): void {
    state = context.getState();
    const tl0 = getActiveTimeline(state.doc, state.isolationStack);
    const fps0 = state.doc.stage.fps || 24;
    let foundShape: ShapeElement | undefined;
    for (const layer of tl0.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps0) ??
        findKeyframeAt(layer, state.currentFrame);
      const el = kf?.elements.find((e) => e.id === elementId);
      if (el && el.type === 'shape') {
        foundShape = el as ShapeElement;
        break;
      }
    }
    if (!foundShape) return;

    // 1. If uncustomized parametric rectangle and no per-anchor overrides, delegate to updateRectShape
    if (
      (foundShape.rectConfig || foundShape.id.startsWith('rect_')) &&
      !foundShape.isCustomizedPath &&
      !config.anchorRadii &&
      !config.anchorTypes
    ) {
      editorActions.updateRectShape(
        elementId,
        {
          cornerRadius: config.cornerRadius,
          cornerType: config.cornerType,
        },
        options
      );
      return;
    }

    // 2. If uncustomized parametric star with standard 'round' corners and no per-anchor overrides
    if (
      (foundShape.starConfig || foundShape.id.startsWith('poly_') || (foundShape as any).shapeType === 'star') &&
      !foundShape.isCustomizedPath &&
      (config.cornerType ?? foundShape.pathCornerType ?? 'round') === 'round' &&
      !config.anchorRadii &&
      !config.anchorTypes &&
      config.cornerRadius !== undefined
    ) {
      editorActions.updateStarShape(
        elementId,
        { cornerRadius: config.cornerRadius },
        options
      );
      return;
    }

    // 3. Universal vector shape corner filleting (Pen paths, customized rectangles with added points, stars, etc.)
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const isStar =
            (Boolean(shape.starConfig) ||
              shape.id.startsWith('poly_') ||
              (shape as any).shapeType === 'star') &&
            !shape.isCustomizedPath;

          let baseD: string;
          let starParams:
            | {
                sc: Partial<NonNullable<ShapeElement['starConfig']>>;
                pts: number;
                ratio: number;
                outerR: number;
                cx: number;
                cy: number;
                startAngle: number;
              }
            | undefined;

          if (isStar) {
            const sc: Partial<NonNullable<ShapeElement['starConfig']>> =
              shape.starConfig || {};
            const bounds = getShapeBounds(shape);
            const outerR =
              sc.outerRadius ??
              Math.max(8, Math.max(bounds.width, bounds.height) / 2);
            const cx = sc.cx ?? (shape.transform.originX || outerR);
            const cy = sc.cy ?? (shape.transform.originY || outerR);
            const pts = sc.points ?? 5;
            const ratio = sc.pointRatio ?? 0.5;
            const startAngle = sc.startAngle ?? -Math.PI / 2;
            starParams = { sc, pts, ratio, outerR, cx, cy, startAngle };
            baseD = generatePolygonStarPath(
              cx,
              cy,
              outerR,
              pts,
              ratio,
              startAngle,
              0
            );
          } else if (shape.basePathD) {
            baseD = shape.basePathD;
          } else if (shape.rectConfig && !shape.isCustomizedPath) {
            const bounds = getShapeBounds(shape);
            const w = shape.rectConfig.width ?? bounds.width;
            const h = shape.rectConfig.height ?? bounds.height;
            baseD = generateRoundedRectPath(w, h, 0, 'round', bounds.x, bounds.y);
          } else {
            baseD = shape.paths[0]?.d ?? '';
          }

          const nextRadius =
            config.cornerRadius !== undefined
              ? Math.max(0, config.cornerRadius)
              : (shape.pathCornerRadius ?? shape.starConfig?.cornerRadius ?? 0);
          const nextType: CornerType =
            config.cornerType ?? shape.pathCornerType ?? 'round';
          const nextAnchorRadii =
            config.anchorRadii !== undefined ? config.anchorRadii : shape.pathAnchorRadii;
          const nextAnchorTypes =
            config.anchorTypes !== undefined ? config.anchorTypes : shape.pathAnchorTypes;

          const newD = applyCornerRadiusToPath(
            baseD,
            nextRadius,
            nextType,
            nextAnchorRadii,
            nextAnchorTypes
          );

          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }

          let updatedStarConfig = shape.starConfig;
          if (isStar && starParams) {
            updatedStarConfig = {
              ...starParams.sc,
              points: starParams.pts,
              pointRatio: starParams.ratio,
              outerRadius: starParams.outerR,
              startAngle: starParams.startAngle,
              cornerRadius: nextRadius,
              cx: starParams.cx,
              cy: starParams.cy,
            };
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            basePathD: baseD,
            pathCornerRadius: nextRadius,
            pathCornerType: nextType,
            pathAnchorRadii: nextAnchorRadii,
            pathAnchorTypes: nextAnchorTypes,
            ...(isStar ? { starConfig: updatedStarConfig } : {}),
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  updateOvalShape(
    elementId: string,
    config: {
      rx?: number;
      ry?: number;
      innerRadiusRatio?: number;
      startAngle?: number;
      endAngle?: number;
    },
    options?: { skipHistory?: boolean; force?: boolean }
  ): void {
    state = context.getState();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          if (!options?.force && shape.isCustomizedPath) {
            return;
          }
          if (!options?.skipHistory) {
            pushHistorySnapshot();
          }
          const prevConfig: Partial<OvalConfig> = shape.ovalConfig || {};
          const bounds = getShapeBounds(shape);
          const rx = Math.max(4, config.rx ?? prevConfig.rx ?? bounds.width / 2);
          const ry = Math.max(4, config.ry ?? prevConfig.ry ?? bounds.height / 2);
          const innerRadiusRatio = Math.max(
            0,
            Math.min(0.92, config.innerRadiusRatio ?? prevConfig.innerRadiusRatio ?? 0)
          );
          const startAngle = Math.max(
            0,
            Math.min(360, config.startAngle ?? prevConfig.startAngle ?? 0)
          );
          const endAngle = Math.max(
            0,
            Math.min(360, config.endAngle ?? prevConfig.endAngle ?? 360)
          );

          const updatedOvalConfig: OvalConfig = {
            rx,
            ry,
            innerRadiusRatio,
            startAngle,
            endAngle,
          };

          const newD = generateOvalPath(rx, ry, updatedOvalConfig);
          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = {
              ...newPaths[0],
              d: newD,
              fillRule: innerRadiusRatio > 0.005 ? 'evenodd' : newPaths[0].fillRule,
            };
          } else {
            newPaths.push({
              d: newD,
              fill: state.activeFill,
              fillRule: innerRadiusRatio > 0.005 ? 'evenodd' : undefined,
            });
          }

          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            ovalConfig: updatedOvalConfig,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  resetOvalShapeToParametric(
    elementId: string,
    options?: { skipHistory?: boolean }
  ): void {
    state = context.getState();
    if (!options?.skipHistory) {
      pushHistorySnapshot();
    }
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const prevConfig: Partial<OvalConfig> = shape.ovalConfig || {};
          const bounds = getShapeBounds(shape);
          const rx = Math.max(4, prevConfig.rx ?? bounds.width / 2);
          const ry = Math.max(4, prevConfig.ry ?? bounds.height / 2);
          const innerRadiusRatio = prevConfig.innerRadiusRatio ?? 0;
          const startAngle = prevConfig.startAngle ?? 0;
          const endAngle = prevConfig.endAngle ?? 360;
          const updatedOvalConfig: OvalConfig = {
            rx,
            ry,
            innerRadiusRatio,
            startAngle,
            endAngle,
          };
          const newD = generateOvalPath(rx, ry, updatedOvalConfig);
          const newPaths = [...shape.paths];
          if (newPaths.length > 0) {
            newPaths[0] = { ...newPaths[0], d: newD };
          }
          kf.elements[elIndex] = {
            ...shape,
            paths: newPaths,
            ovalConfig: updatedOvalConfig,
            isCustomizedPath: false,
          };
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },

  morphShapeTo(elementId: string, targetType: 'circle' | 'rectangle' | 'star'): void {
    state = context.getState();
    pushHistorySnapshot();
    const doc = deepCloneDoc(state.doc);
    const tl = getActiveTimeline(doc, state.isolationStack);
    const fps = doc.stage.fps || 24;
    let updated = false;

    for (const layer of tl.layers) {
      const kf =
        findKeyframeAtTime(layer, state.currentTime, fps) ??
        findKeyframeAt(layer, state.currentFrame);
      if (!kf) continue;
      const elIndex = kf.elements.findIndex((e) => e.id === elementId);
      if (elIndex >= 0) {
        const el = kf.elements[elIndex];
        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const bounds = getShapeBounds(shape);
          const starCfg = (shape as any).starConfig;
          let bw = Math.max(8, bounds.width);
          let bh = Math.max(8, bounds.height);
          let bx = bounds.x;
          let by = bounds.y;

          if (starCfg?.outerRadius) {
            const r = starCfg.outerRadius;
            const cx = starCfg.cx ?? (shape.transform.originX || r);
            const cy = starCfg.cy ?? (shape.transform.originY || r);
            bx = cx - r;
            by = cy - r;
            bw = r * 2;
            bh = r * 2;
          }

          let newD = '';
          let newStarConfig: any = undefined;
          let newRectConfig: RectConfig | undefined = undefined;
          let newOvalConfig: OvalConfig | undefined = undefined;

          if (targetType === 'circle') {
            const rX = bw / 2;
            const rY = bh / 2;
            newD = `M ${bx} ${by + rY} a ${rX} ${rY} 0 1 0 ${bw} 0 a ${rX} ${rY} 0 1 0 ${-bw} 0 Z`;
            newOvalConfig = {
              rx: rX,
              ry: rY,
              innerRadiusRatio: 0,
              startAngle: 0,
              endAngle: 360,
            };
          } else if (targetType === 'rectangle') {
            newD = generateRoundedRectPath(bw, bh, 0, 'round', bx, by);
            newRectConfig = {
              width: bw,
              height: bh,
              cornerRadius: 0,
              cornerType: 'round',
            };
          } else if (targetType === 'star') {
            const outerRadius = Math.max(bw, bh) / 2;
            const cx = bx + bw / 2;
            const cy = by + bh / 2;
            newD = generatePolygonStarPath(cx, cy, outerRadius, 5, 0.5, -Math.PI / 2, 0);
            newStarConfig = {
              points: 5,
              pointRatio: 0.5,
              outerRadius,
              startAngle: -Math.PI / 2,
              cornerRadius: 0,
              cx,
              cy,
            };
          }

          const primaryPath = shape.paths[0] || {
            fill: { type: 'solid', color: state.fillColor },
          };
          const newPaths = [{ ...primaryPath, d: newD }];

          const morphedShape: ShapeElement = {
            ...shape,
            paths: newPaths,
          };

          if (newStarConfig) {
            morphedShape.starConfig = newStarConfig;
          } else {
            delete morphedShape.starConfig;
          }
          if (newRectConfig) {
            morphedShape.rectConfig = newRectConfig;
          } else {
            delete morphedShape.rectConfig;
          }
          if (newOvalConfig) {
            morphedShape.ovalConfig = newOvalConfig;
          } else {
            delete morphedShape.ovalConfig;
          }
          (morphedShape as any).shapeType = targetType;
          morphedShape.isCustomizedPath = false;

          kf.elements[elIndex] = morphedShape;
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      state = { ...state, doc };
      notify();
    }
  },
  };
};
