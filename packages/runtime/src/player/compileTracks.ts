import type {
  TimelineDef,
  LayerDef,
  KeyframeDef,
  DisplayElement,
  TweenDef,
  Filter,
  Transform,
  CompiledTrack,
  ID,
  Easing,
} from '../schema';
import {
  compileEasingToCSS,
  evaluateEasing,
  cleanNumber,
} from './easing';
import { createPathSampler, type PathSampler } from './pathSampling';

export interface SampledTrackState {
  transform: string;
  opacity: number;
  filter: string;
  transformOrigin: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  originX: number;
  originY: number;
}

export interface InternalKeyframeData {
  frame: number;
  offset: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  originX: number;
  originY: number;
  opacity: number;
  filters: Filter[];
  filterCSS: string;
  easingDef?: Easing;
  cssEasing: string;
}

export interface ExtendedCompiledTrack extends CompiledTrack {
  startFrame: number;
  endFrame: number;
  totalFrames: number;
  fps: number;
  layerId?: ID;
  /** Internal metadata for headless sampling without string parsing */
  _internalKeyframes?: InternalKeyframeData[];
}

/**
 * Normalizes start and end rotations so that CSS function-list interpolation
 * respects Flash CW / CCW directions and multi-turn rotation.
 */
export function normalizeRotation(
  startRot: number,
  rawEndRot: number,
  rotate?: { direction: 'cw' | 'ccw'; turns: number }
): { startRot: number; endRot: number } {
  if (!rotate) {
    // Default Flash MX: shortest angular path between start and end rotation
    let diff = (rawEndRot - startRot) % 360;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    return { startRot, endRot: startRot + diff };
  }

  const turns = Math.max(0, rotate.turns ?? 0);
  const posMod = (n: number, m: number) => ((n % m) + m) % m;

  if (rotate.direction === 'cw') {
    let diff = posMod(rawEndRot - startRot, 360);
    // If turns > 0 and start and end have the same angle modulo 360, diff is 0
    const totalAngle = diff + turns * 360;
    return { startRot, endRot: startRot + totalAngle };
  } else {
    // ccw
    let diff = posMod(startRot - rawEndRot, 360);
    const totalAngle = diff + turns * 360;
    return { startRot, endRot: startRot - totalAngle };
  }
}

/**
 * Formats a Transform object into a decomposed-safe CSS transform string
 * with translate, rotate, scale, and skew in a consistent order.
 */
export function formatTransformCSS(t: {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  rotateX?: number;
  rotateY?: number;
  perspective?: number;
}): string {
  const x = cleanNumber(t.x);
  const y = cleanNumber(t.y);
  const rot = cleanNumber(t.rotation);
  const sx = cleanNumber(t.scaleX);
  const sy = cleanNumber(t.scaleY);
  const skx = cleanNumber(t.skewX);
  const sky = cleanNumber(t.skewY);
  const rx = cleanNumber(t.rotateX ?? 0);
  const ry = cleanNumber(t.rotateY ?? 0);
  const persp = t.perspective ? cleanNumber(t.perspective) : 0;

  let str = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${sx}, ${sy}) skew(${skx}deg, ${sky}deg)`;
  if (rx !== 0 || ry !== 0) {
    const pStr = persp > 0 ? `perspective(${persp}px) ` : '';
    str = `${pStr}rotateX(${rx}deg) rotateY(${ry}deg) ${str}`;
  }
  return str;
}

/**
 * Converts a Filter object into its CSS filter function string.
 */
export function filterToCSS(filter: Filter): string {
  switch (filter.type) {
    case 'blur':
      return `blur(${cleanNumber(filter.radius)}px)`;
    case 'dropShadow':
      return `drop-shadow(${cleanNumber(filter.x)}px ${cleanNumber(filter.y)}px ${cleanNumber(filter.blur)}px ${filter.color})`;
    case 'glow':
      return `drop-shadow(0px 0px ${cleanNumber(filter.blur)}px ${filter.color})`;
    case 'brightness':
      return `brightness(${cleanNumber(filter.amount)})`;
    case 'contrast':
      return `contrast(${cleanNumber(filter.amount)})`;
    case 'saturate':
      return `saturate(${cleanNumber(filter.amount)})`;
    case 'grayscale':
      return `grayscale(${cleanNumber(filter.amount)})`;
    case 'sepia':
      return `sepia(${cleanNumber(filter.amount)})`;
    case 'invert':
      return `invert(${cleanNumber(filter.amount)})`;
    case 'hueRotate':
      return `hue-rotate(${cleanNumber(filter.degrees)}deg)`;
    default:
      return '';
  }
}

/**
 * Converts an array of Filter objects to a combined CSS filter string.
 */
export function formatFiltersCSS(filters?: Filter[]): string {
  if (!filters || filters.length === 0) return 'none';
  const parts = filters.map(filterToCSS).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/**
 * Returns a neutral/default Filter for matching list interpolation in WAAPI.
 */
function getNeutralFilter(filter: Filter): Filter {
  switch (filter.type) {
    case 'blur':
      return { type: 'blur', radius: 0 };
    case 'dropShadow':
      return { type: 'dropShadow', x: 0, y: 0, blur: 0, color: filter.color || 'rgba(0,0,0,0)' };
    case 'glow':
      return { type: 'glow', blur: 0, color: filter.color || 'rgba(0,0,0,0)', strength: 0 };
    case 'brightness':
      return { type: 'brightness', amount: 1 };
    case 'contrast':
      return { type: 'contrast', amount: 1 };
    case 'saturate':
      return { type: 'saturate', amount: 1 };
    case 'grayscale':
      return { type: 'grayscale', amount: 0 };
    case 'sepia':
      return { type: 'sepia', amount: 0 };
    case 'invert':
      return { type: 'invert', amount: 0 };
    case 'hueRotate':
      return { type: 'hueRotate', degrees: 0 };
    default:
      return filter;
  }
}

/**
 * Aligns two filter lists so they contain identical filter types in the same order
 * to ensure smooth CSS filter interpolation.
 */
export function alignFilterLists(
  startFilters: Filter[] = [],
  endFilters: Filter[] = []
): { start: Filter[]; end: Filter[]; startCSS: string; endCSS: string } {
  if (startFilters.length === 0 && endFilters.length === 0) {
    return { start: [], end: [], startCSS: 'none', endCSS: 'none' };
  }

  const startMap = new Map<string, Filter>();
  const endMap = new Map<string, Filter>();

  startFilters.forEach((f, idx) => startMap.set(`${f.type}_${idx}`, f));
  endFilters.forEach((f, idx) => endMap.set(`${f.type}_${idx}`, f));

  const allKeys = Array.from(new Set([...startMap.keys(), ...endMap.keys()]));

  const alignedStart: Filter[] = [];
  const alignedEnd: Filter[] = [];

  for (const k of allKeys) {
    const s = startMap.get(k);
    const e = endMap.get(k);

    if (s && e) {
      alignedStart.push(s);
      alignedEnd.push(e);
    } else if (s && !e) {
      alignedStart.push(s);
      alignedEnd.push(getNeutralFilter(s));
    } else if (!s && e) {
      alignedStart.push(getNeutralFilter(e));
      alignedEnd.push(e);
    }
  }

  return {
    start: alignedStart,
    end: alignedEnd,
    startCSS: formatFiltersCSS(alignedStart),
    endCSS: formatFiltersCSS(alignedEnd),
  };
}

/**
 * Extracts SVG path string `d` from a guide layer at the specified frame.
 */
function findGuidePathData(guideLayer: LayerDef, frameIndex: number): string | null {
  for (const kf of guideLayer.keyframes) {
    if (frameIndex >= kf.index && frameIndex < kf.index + kf.duration) {
      const paths: string[] = [];
      for (const el of kf.elements) {
        if (el.type === 'shape' && el.paths) {
          for (const p of el.paths) {
            if (p.d) paths.push(p.d);
          }
        }
      }
      if (paths.length > 0) return paths.join(' ');
    }
  }
  return null;
}

interface TweenSegment {
  startKf: KeyframeDef;
  endKf: KeyframeDef;
  startEl: DisplayElement;
  endEl: DisplayElement;
  tween: TweenDef;
}

/**
 * Compiles a sequence of consecutive motion tween segments for a single element
 * into a single `CompiledTrack`.
 */
function compileElementTweenChain(
  elementId: ID,
  segments: TweenSegment[],
  totalTimelineFrames: number,
  fps: number,
  timeline?: TimelineDef,
  layerId?: ID
): ExtendedCompiledTrack {
  const internalKfs: InternalKeyframeData[] = [];
  const waapiKeyframes: Keyframe[] = [];

  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  const chainStartFrame = firstSeg.startKf.index;
  const chainEndFrame = lastSeg.endKf.index;

  // Track the continuous rotation accumulator across chained segments
  let currentAccumulatedRot = firstSeg.startEl.transform.rotation ?? 0;

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const { startKf, endKf, startEl, endEl, tween } = seg;
    const spanFrames = endKf.index - startKf.index;
    if (spanFrames <= 0) continue;

    // Check tween property filtering
    const props = tween.properties;
    const interpTransform = !props || props.includes('transform');
    const interpAlpha = !props || props.includes('alpha');
    const interpFilters = !props || props.includes('filters');

    const startT: Transform = {
      x: startEl.transform.x ?? 0,
      y: startEl.transform.y ?? 0,
      scaleX: interpTransform ? (startEl.transform.scaleX ?? 1) : (startEl.transform.scaleX ?? 1),
      scaleY: interpTransform ? (startEl.transform.scaleY ?? 1) : (startEl.transform.scaleY ?? 1),
      rotation: currentAccumulatedRot,
      skewX: interpTransform ? (startEl.transform.skewX ?? 0) : 0,
      skewY: interpTransform ? (startEl.transform.skewY ?? 0) : 0,
      originX: startEl.transform.originX ?? 0,
      originY: startEl.transform.originY ?? 0,
    };

    const targetEndRot = interpTransform ? (endEl.transform.rotation ?? 0) : currentAccumulatedRot;
    const { endRot: normalizedEndRot } = normalizeRotation(
      currentAccumulatedRot,
      targetEndRot,
      interpTransform ? tween.rotate : undefined
    );

    const endT: Transform = {
      x: interpTransform ? (endEl.transform.x ?? 0) : startT.x,
      y: interpTransform ? (endEl.transform.y ?? 0) : startT.y,
      scaleX: interpTransform ? (endEl.transform.scaleX ?? 1) : startT.scaleX,
      scaleY: interpTransform ? (endEl.transform.scaleY ?? 1) : startT.scaleY,
      rotation: normalizedEndRot,
      skewX: interpTransform ? (endEl.transform.skewX ?? 0) : startT.skewX,
      skewY: interpTransform ? (endEl.transform.skewY ?? 0) : startT.skewY,
      originX: endEl.transform.originX ?? startT.originX,
      originY: endEl.transform.originY ?? startT.originY,
    };

    const startAlpha = startEl.alpha ?? 1;
    const endAlpha = interpAlpha ? (endEl.alpha ?? 1) : startAlpha;

    const { startCSS: filterStartCSS, endCSS: filterEndCSS, start: alignedStartFilters, end: alignedEndFilters } =
      interpFilters
        ? alignFilterLists(startEl.filters, endEl.filters)
        : {
            startCSS: formatFiltersCSS(startEl.filters),
            endCSS: formatFiltersCSS(startEl.filters),
            start: startEl.filters ?? [],
            end: startEl.filters ?? [],
          };

    const cssEasing = compileEasingToCSS(tween.easing);

    // --- Check for Motion Guide ---
    let guideSampler: PathSampler | null = null;
    if (tween.motionGuide && timeline) {
      const guideLayer = timeline.layers.find((l) => l.id === tween.motionGuide!.layerId);
      if (guideLayer) {
        const pathData = findGuidePathData(guideLayer, startKf.index);
        if (pathData) {
          guideSampler = createPathSampler(pathData);
        }
      }
    }

    if (guideSampler && guideSampler.totalLength > 0) {
      // --- BAKE KEYFRAMES for Motion Guide ---
      const orient = tween.motionGuide?.orientToPath ?? false;
      const initialSample = guideSampler.sample(0);
      const initialTangent = initialSample.tangentDeg;
      const baseRotationOffset = startT.rotation;

      for (let f = 0; f < spanFrames; f++) {
        const frameNum = startKf.index + f;
        const normProgress = f / spanFrames;
        const easedProgress = evaluateEasing(tween.easing, normProgress);
        const sample = guideSampler.sample(easedProgress);

        let rot = startT.rotation + easedProgress * (endT.rotation - startT.rotation);
        if (orient) {
          rot = baseRotationOffset + (sample.tangentDeg - initialTangent);
        }

        const x = sample.x;
        const y = sample.y;
        const sx = startT.scaleX + easedProgress * (endT.scaleX - startT.scaleX);
        const sy = startT.scaleY + easedProgress * (endT.scaleY - startT.scaleY);
        const skx = startT.skewX + easedProgress * (endT.skewX - startT.skewX);
        const sky = startT.skewY + easedProgress * (endT.skewY - startT.skewY);
        const ox = startT.originX + easedProgress * (endT.originX - startT.originX);
        const oy = startT.originY + easedProgress * (endT.originY - startT.originY);
        const opacity = startAlpha + easedProgress * (endAlpha - startAlpha);

        const offset = frameNum / totalTimelineFrames;
        const transformCSS = formatTransformCSS({ x, y, scaleX: sx, scaleY: sy, rotation: rot, skewX: skx, skewY: sky });
        const originCSS = `${cleanNumber(ox)}px ${cleanNumber(oy)}px`;

        const kfData: InternalKeyframeData = {
          frame: frameNum,
          offset,
          x,
          y,
          scaleX: sx,
          scaleY: sy,
          rotation: rot,
          skewX: skx,
          skewY: sky,
          originX: ox,
          originY: oy,
          opacity,
          filters: alignedStartFilters,
          filterCSS: filterStartCSS,
          easingDef: { type: 'linear' },
          cssEasing: 'linear',
        };

        internalKfs.push(kfData);
        waapiKeyframes.push({
          offset,
          transform: transformCSS,
          transformOrigin: originCSS,
          opacity: cleanNumber(opacity),
          filter: filterStartCSS,
          easing: 'linear',
        });
      }
    } else {
      // --- Standard 2-Endpoint Motion Tween ---
      const offset = startKf.index / totalTimelineFrames;
      const transformCSS = formatTransformCSS(startT);
      const originCSS = `${cleanNumber(startT.originX)}px ${cleanNumber(startT.originY)}px`;

      const kfData: InternalKeyframeData = {
        frame: startKf.index,
        offset,
        x: startT.x,
        y: startT.y,
        scaleX: startT.scaleX,
        scaleY: startT.scaleY,
        rotation: startT.rotation,
        skewX: startT.skewX,
        skewY: startT.skewY,
        originX: startT.originX,
        originY: startT.originY,
        opacity: startAlpha,
        filters: alignedStartFilters,
        filterCSS: filterStartCSS,
        easingDef: tween.easing,
        cssEasing,
      };

      internalKfs.push(kfData);
      waapiKeyframes.push({
        offset,
        transform: transformCSS,
        transformOrigin: originCSS,
        opacity: cleanNumber(startAlpha),
        filter: filterStartCSS,
        easing: cssEasing,
      });
    }

    currentAccumulatedRot = normalizedEndRot;

    // If this is the last segment, add the terminating keyframe at endKf
    if (sIdx === segments.length - 1) {
      let finalX = endT.x;
      let finalY = endT.y;
      let finalRot = currentAccumulatedRot;

      if (guideSampler && guideSampler.totalLength > 0) {
        const finalSample = guideSampler.sample(1);
        finalX = finalSample.x;
        finalY = finalSample.y;
        if (tween.motionGuide?.orientToPath) {
          const initialSample = guideSampler.sample(0);
          finalRot = startT.rotation + (finalSample.tangentDeg - initialSample.tangentDeg);
        }
      }

      const endOffset = endKf.index / totalTimelineFrames;
      const endTransformCSS = formatTransformCSS({
        x: finalX,
        y: finalY,
        scaleX: endT.scaleX,
        scaleY: endT.scaleY,
        rotation: finalRot,
        skewX: endT.skewX,
        skewY: endT.skewY,
      });
      const endOriginCSS = `${cleanNumber(endT.originX)}px ${cleanNumber(endT.originY)}px`;

      const finalKfData: InternalKeyframeData = {
        frame: endKf.index,
        offset: endOffset,
        x: finalX,
        y: finalY,
        scaleX: endT.scaleX,
        scaleY: endT.scaleY,
        rotation: finalRot,
        skewX: endT.skewX,
        skewY: endT.skewY,
        originX: endT.originX,
        originY: endT.originY,
        opacity: endAlpha,
        filters: alignedEndFilters,
        filterCSS: filterEndCSS,
        easingDef: undefined,
        cssEasing: 'linear',
      };

      internalKfs.push(finalKfData);
      waapiKeyframes.push({
        offset: endOffset,
        transform: endTransformCSS,
        transformOrigin: endOriginCSS,
        opacity: cleanNumber(endAlpha),
        filter: filterEndCSS,
        easing: 'linear',
      });
    }
  }

  const durationMs = totalTimelineFrames * (1000 / fps);

  return {
    elementId,
    keyframes: waapiKeyframes,
    timing: {
      duration: durationMs,
      fill: 'both',
      iterations: 1,
    },
    startFrame: chainStartFrame,
    endFrame: chainEndFrame,
    totalFrames: totalTimelineFrames,
    fps,
    layerId,
    _internalKeyframes: internalKfs,
  };
}

/**
 * Compiles all motion tweens on a layer into an array of `CompiledTrack`s.
 */
export function compileLayerTracks(
  layer: LayerDef,
  fps = 24,
  timeline?: TimelineDef
): ExtendedCompiledTrack[] {
  if (layer.kind === 'guide') {
    // Guide layers are not rendered visually and have no WAAPI tracks
    return [];
  }

  const totalFrames = timeline?.frameCount ?? Math.max(
    1,
    ...layer.keyframes.map((k) => k.index + k.duration)
  );

  // Group consecutive tween segments by elementId
  const chainsByElementId = new Map<ID, TweenSegment[][]>();

  for (let i = 0; i < layer.keyframes.length - 1; i++) {
    const startKf = layer.keyframes[i];
    const endKf = layer.keyframes[i + 1];

    if (!startKf.tween || startKf.tween.type !== 'motion') {
      continue;
    }

    // Match elements across keyframes by stable element ID
    for (const startEl of startKf.elements) {
      const endEl = endKf.elements.find((e) => e.id === startEl.id);
      if (!endEl) continue;

      const seg: TweenSegment = {
        startKf,
        endKf,
        startEl,
        endEl,
        tween: startKf.tween,
      };

      if (!chainsByElementId.has(startEl.id)) {
        chainsByElementId.set(startEl.id, [[seg]]);
      } else {
        const chains = chainsByElementId.get(startEl.id)!;
        const lastChain = chains[chains.length - 1];
        const lastSeg = lastChain[lastChain.length - 1];

        if (lastSeg.endKf.index === startKf.index) {
          // Connects continuously to previous segment
          lastChain.push(seg);
        } else {
          // Disconnected span
          chains.push([seg]);
        }
      }
    }
  }

  const tracks: ExtendedCompiledTrack[] = [];

  for (const [elementId, chains] of chainsByElementId.entries()) {
    for (const chain of chains) {
      const track = compileElementTweenChain(
        elementId,
        chain,
        totalFrames,
        fps,
        timeline,
        layer.id
      );
      tracks.push(track);
    }
  }

  return tracks;
}

/**
 * Compiles all motion tweens in a TimelineDef into an array of `CompiledTrack`s.
 */
export function compileTracks(
  timeline: TimelineDef,
  fps = 24
): ExtendedCompiledTrack[] {
  const tracks: ExtendedCompiledTrack[] = [];

  for (const layer of timeline.layers) {
    const layerTracks = compileLayerTracks(layer, fps, timeline);
    tracks.push(...layerTracks);
  }

  return tracks;
}

/**
 * Headless, pure evaluator to sample a CompiledTrack at any given frame (discrete or fractional).
 * Perfect for edit mode, headless testing, and canvas/WebGL fallback rendering.
 */
export function sampleTrack(
  track: CompiledTrack,
  frame: number
): SampledTrackState {
  const ext = track as ExtendedCompiledTrack;
  const internalKfs = ext._internalKeyframes;

  // Fallback if internal metadata not available: inspect keyframes array
  if (!internalKfs || internalKfs.length === 0) {
    const fps = ext.fps ?? 24;
    const totalFrames = ext.totalFrames ?? Math.max(1, (track.timing.duration as number) / (1000 / fps));
    const kfs = track.keyframes;

    if (kfs.length === 0) {
      return {
        transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1) skew(0deg, 0deg)',
        opacity: 1,
        filter: 'none',
        transformOrigin: '0px 0px',
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

    const first = kfs[0];
    const last = kfs[kfs.length - 1];

    if (frame <= (first.offset ?? 0) * totalFrames || kfs.length === 1) {
      return {
        transform: String(first.transform ?? ''),
        opacity: Number(first.opacity ?? 1),
        filter: String(first.filter ?? 'none'),
        transformOrigin: String(first.transformOrigin ?? '0px 0px'),
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

    if (frame >= (last.offset ?? 1) * totalFrames) {
      return {
        transform: String(last.transform ?? ''),
        opacity: Number(last.opacity ?? 1),
        filter: String(last.filter ?? 'none'),
        transformOrigin: String(last.transformOrigin ?? '0px 0px'),
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
  }

  const kfs = internalKfs!;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];

  if (frame <= first.frame) {
    return {
      transform: formatTransformCSS(first),
      opacity: first.opacity,
      filter: first.filterCSS,
      transformOrigin: `${cleanNumber(first.originX)}px ${cleanNumber(first.originY)}px`,
      x: first.x,
      y: first.y,
      scaleX: first.scaleX,
      scaleY: first.scaleY,
      rotation: first.rotation,
      skewX: first.skewX,
      skewY: first.skewY,
      originX: first.originX,
      originY: first.originY,
    };
  }

  if (frame >= last.frame) {
    return {
      transform: formatTransformCSS(last),
      opacity: last.opacity,
      filter: last.filterCSS,
      transformOrigin: `${cleanNumber(last.originX)}px ${cleanNumber(last.originY)}px`,
      x: last.x,
      y: last.y,
      scaleX: last.scaleX,
      scaleY: last.scaleY,
      rotation: last.rotation,
      skewX: last.skewX,
      skewY: last.skewY,
      originX: last.originX,
      originY: last.originY,
    };
  }

  // Find surrounding keyframe pair
  let kfA = first;
  let kfB = last;

  for (let i = 0; i < kfs.length - 1; i++) {
    if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
      kfA = kfs[i];
      kfB = kfs[i + 1];
      break;
    }
  }

  const span = kfB.frame - kfA.frame;
  if (span <= 0) {
    return {
      transform: formatTransformCSS(kfB),
      opacity: kfB.opacity,
      filter: kfB.filterCSS,
      transformOrigin: `${cleanNumber(kfB.originX)}px ${cleanNumber(kfB.originY)}px`,
      x: kfB.x,
      y: kfB.y,
      scaleX: kfB.scaleX,
      scaleY: kfB.scaleY,
      rotation: kfB.rotation,
      skewX: kfB.skewX,
      skewY: kfB.skewY,
      originX: kfB.originX,
      originY: kfB.originY,
    };
  }

  const linearT = (frame - kfA.frame) / span;
  const easedT = evaluateEasing(kfA.easingDef, linearT);

  const x = kfA.x + easedT * (kfB.x - kfA.x);
  const y = kfA.y + easedT * (kfB.y - kfA.y);
  const scaleX = kfA.scaleX + easedT * (kfB.scaleX - kfA.scaleX);
  const scaleY = kfA.scaleY + easedT * (kfB.scaleY - kfA.scaleY);
  const rotation = kfA.rotation + easedT * (kfB.rotation - kfA.rotation);
  const skewX = kfA.skewX + easedT * (kfB.skewX - kfA.skewX);
  const skewY = kfA.skewY + easedT * (kfB.skewY - kfA.skewY);
  const originX = kfA.originX + easedT * (kfB.originX - kfA.originX);
  const originY = kfA.originY + easedT * (kfB.originY - kfA.originY);
  const opacity = kfA.opacity + easedT * (kfB.opacity - kfA.opacity);

  // Interpolate filters
  const interpFilters: Filter[] = [];
  const maxFilters = Math.min(kfA.filters.length, kfB.filters.length);
  for (let i = 0; i < maxFilters; i++) {
    const fA = kfA.filters[i];
    const fB = kfB.filters[i];
    if (fA.type === 'blur' && fB.type === 'blur') {
      interpFilters.push({
        type: 'blur',
        radius: fA.radius + easedT * (fB.radius - fA.radius),
      });
    } else if (fA.type === 'dropShadow' && fB.type === 'dropShadow') {
      interpFilters.push({
        type: 'dropShadow',
        x: fA.x + easedT * (fB.x - fA.x),
        y: fA.y + easedT * (fB.y - fA.y),
        blur: fA.blur + easedT * (fB.blur - fA.blur),
        color: fB.color,
      });
    } else if (fA.type === 'brightness' && fB.type === 'brightness') {
      interpFilters.push({
        type: 'brightness',
        amount: fA.amount + easedT * (fB.amount - fA.amount),
      });
    } else if (fA.type === 'contrast' && fB.type === 'contrast') {
      interpFilters.push({
        type: 'contrast',
        amount: fA.amount + easedT * (fB.amount - fA.amount),
      });
    } else if (fA.type === 'hueRotate' && fB.type === 'hueRotate') {
      interpFilters.push({
        type: 'hueRotate',
        degrees: fA.degrees + easedT * (fB.degrees - fA.degrees),
      });
    } else {
      interpFilters.push(easedT < 0.5 ? fA : fB);
    }
  }

  const transform = formatTransformCSS({ x, y, scaleX, scaleY, rotation, skewX, skewY });
  const filter = formatFiltersCSS(interpFilters);
  const transformOrigin = `${cleanNumber(originX)}px ${cleanNumber(originY)}px`;

  return {
    transform,
    opacity: cleanNumber(opacity),
    filter,
    transformOrigin,
    x,
    y,
    scaleX,
    scaleY,
    rotation,
    skewX,
    skewY,
    originX,
    originY,
  };
}
