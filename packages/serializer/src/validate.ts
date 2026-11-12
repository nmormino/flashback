/**
 * Lightweight semantic validation for Flashback animation documents.
 * Validates unique IDs, layer references, symbol existence, and timeline structure.
 */
import type { AnimDocument } from '@flashback/runtime';
import { ValidationError, type EditorDocument } from './types.js';

export function validate<T extends EditorDocument | AnimDocument>(doc: T): T {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new ValidationError('Document must be an object');
  }

  // 1. Version
  if (doc.version !== 1) {
    throw new ValidationError(
      `Unsupported schema version: ${(doc as any).version}. Expected 1`,
      'version',
    );
  }

  // 2. Stage
  if (!doc.stage || typeof doc.stage !== 'object') {
    throw new ValidationError('Document missing stage definition', 'stage');
  }
  const stage = doc.stage;
  if (typeof stage.width !== 'number' || stage.width <= 0) {
    throw new ValidationError('Stage width must be a positive number', 'stage.width');
  }
  if (typeof stage.height !== 'number' || stage.height <= 0) {
    throw new ValidationError('Stage height must be a positive number', 'stage.height');
  }
  if (typeof stage.fps !== 'number' || stage.fps <= 0) {
    throw new ValidationError('Stage fps must be a positive number', 'stage.fps');
  }
  if (!stage.background || typeof stage.background !== 'object') {
    throw new ValidationError('Stage background is required', 'stage.background');
  }
  const validScaleModes = ['showAll', 'noBorder', 'exactFit', 'noScale'];
  if (!validScaleModes.includes(stage.scaleMode)) {
    throw new ValidationError(`Invalid stage scaleMode: "${stage.scaleMode}"`, 'stage.scaleMode');
  }

  if (stage.reducedMotion !== undefined) {
    if (typeof stage.reducedMotion !== 'object' || stage.reducedMotion === null) {
      throw new ValidationError('Stage reducedMotion must be an object', 'stage.reducedMotion');
    }
    const validModes = ['auto', 'full', 'stop-motion', 'fixed'];
    if (!validModes.includes(stage.reducedMotion.mode)) {
      throw new ValidationError(
        `Invalid reducedMotion mode: "${stage.reducedMotion.mode}"`,
        'stage.reducedMotion.mode',
      );
    }
    if (
      stage.reducedMotion.posterFrame !== undefined &&
      (typeof stage.reducedMotion.posterFrame !== 'number' || stage.reducedMotion.posterFrame < 1)
    ) {
      throw new ValidationError(
        'reducedMotion posterFrame must be a positive integer',
        'stage.reducedMotion.posterFrame',
      );
    }
    if (
      stage.reducedMotion.stopMotionFps !== undefined &&
      (typeof stage.reducedMotion.stopMotionFps !== 'number' || stage.reducedMotion.stopMotionFps <= 0)
    ) {
      throw new ValidationError(
        'reducedMotion stopMotionFps must be a positive number',
        'stage.reducedMotion.stopMotionFps',
      );
    }
  }

  if (stage.breakpoints !== undefined) {
    if (!Array.isArray(stage.breakpoints)) {
      throw new ValidationError('Stage breakpoints must be an array', 'stage.breakpoints');
    }
    for (let i = 0; i < stage.breakpoints.length; i++) {
      const bp = stage.breakpoints[i];
      const bpPath = `stage.breakpoints[${i}]`;
      if (!bp || typeof bp !== 'object') {
        throw new ValidationError('Invalid breakpoint definition', bpPath);
      }
      if (typeof bp.id !== 'string' || !bp.id) {
        throw new ValidationError('Breakpoint id is required', `${bpPath}.id`);
      }
      if (typeof bp.name !== 'string' || !bp.name) {
        throw new ValidationError('Breakpoint name is required', `${bpPath}.name`);
      }
      if (typeof bp.maxWidth !== 'number' || bp.maxWidth <= 0) {
        throw new ValidationError('Breakpoint maxWidth must be a positive number', `${bpPath}.maxWidth`);
      }
      if (typeof bp.width !== 'number' || bp.width <= 0) {
        throw new ValidationError('Breakpoint width must be a positive number', `${bpPath}.width`);
      }
      if (typeof bp.height !== 'number' || bp.height <= 0) {
        throw new ValidationError('Breakpoint height must be a positive number', `${bpPath}.height`);
      }
    }
  }

  // 3. Meta
  if (!doc.meta || typeof doc.meta !== 'object') {
    throw new ValidationError('Document missing meta definition', 'meta');
  }

  // 4. Library
  if (!doc.library || typeof doc.library !== 'object') {
    throw new ValidationError('Document missing library definition', 'library');
  }
  const library = doc.library;
  library.symbols ??= {};
  library.audio ??= {};
  library.fonts ??= {};
  library.bitmaps ??= {};
  const symbolIds = new Set<string>();
  const audioIds = new Set<string>();
  const fontIds = new Set<string>();
  const bitmapIds = new Set<string>();

  if (library.symbols) {
    for (const [key, sym] of Object.entries(library.symbols)) {
      if (!sym || typeof sym !== 'object') {
        throw new ValidationError(`Invalid symbol definition at library.symbols.${key}`, `library.symbols.${key}`);
      }
      if (sym.id !== key) {
        throw new ValidationError(`Symbol key "${key}" does not match symbol id "${sym.id}"`, `library.symbols.${key}.id`);
      }
      if (symbolIds.has(sym.id)) {
        throw new ValidationError(`Duplicate symbol id: "${sym.id}"`, `library.symbols.${key}.id`);
      }
      symbolIds.add(sym.id);
    }
  }

  if (library.audio) {
    for (const [key, a] of Object.entries(library.audio)) {
      if (!a || typeof a !== 'object') {
        throw new ValidationError(`Invalid audio definition at library.audio.${key}`, `library.audio.${key}`);
      }
      if (a.id !== key) {
        throw new ValidationError(`Audio key "${key}" does not match audio id "${a.id}"`, `library.audio.${key}.id`);
      }
      if (audioIds.has(a.id)) {
        throw new ValidationError(`Duplicate audio id: "${a.id}"`, `library.audio.${key}.id`);
      }
      audioIds.add(a.id);
    }
  }

  if (library.fonts) {
    for (const [key, f] of Object.entries(library.fonts)) {
      if (!f || typeof f !== 'object') {
        throw new ValidationError(`Invalid font definition at library.fonts.${key}`, `library.fonts.${key}`);
      }
      if (f.id !== key) {
        throw new ValidationError(`Font key "${key}" does not match font id "${f.id}"`, `library.fonts.${key}.id`);
      }
      if (fontIds.has(f.id)) {
        throw new ValidationError(`Duplicate font id: "${f.id}"`, `library.fonts.${key}.id`);
      }
      if (f.variableRange) {
        if (
          typeof f.variableRange !== 'object' ||
          typeof f.variableRange.min !== 'number' ||
          typeof f.variableRange.max !== 'number'
        ) {
          throw new ValidationError(
            `Invalid variableRange at library.fonts.${key}`,
            `library.fonts.${key}.variableRange`,
          );
        }
        if (f.variableRange.min > f.variableRange.max) {
          throw new ValidationError(
            `variableRange min cannot be greater than max at library.fonts.${key}`,
            `library.fonts.${key}.variableRange`,
          );
        }
      }
      if (f.availableWeights !== undefined && !Array.isArray(f.availableWeights)) {
        throw new ValidationError(
          `availableWeights must be an array at library.fonts.${key}`,
          `library.fonts.${key}.availableWeights`,
        );
      }
      if (f.availableStyles !== undefined && !Array.isArray(f.availableStyles)) {
        throw new ValidationError(
          `availableStyles must be an array at library.fonts.${key}`,
          `library.fonts.${key}.availableStyles`,
        );
      }
      fontIds.add(f.id);
    }
  }

  if (library.bitmaps) {
    for (const [key, b] of Object.entries(library.bitmaps)) {
      if (!b || typeof b !== 'object') {
        throw new ValidationError(`Invalid bitmap definition at library.bitmaps.${key}`, `library.bitmaps.${key}`);
      }
      if (b.id !== key) {
        throw new ValidationError(`Bitmap key "${key}" does not match bitmap id "${b.id}"`, `library.bitmaps.${key}.id`);
      }
      if (bitmapIds.has(b.id)) {
        throw new ValidationError(`Duplicate bitmap id: "${b.id}"`, `library.bitmaps.${key}.id`);
      }
      bitmapIds.add(b.id);
    }
  }

  if (library.folders) {
    const folderIds = new Set<string>();
    function validateFolder(folder: any, path: string) {
      if (!folder || typeof folder !== 'object') {
        throw new ValidationError('Invalid folder definition', path);
      }
      if (!folder.id) {
        throw new ValidationError('Folder missing id', `${path}.id`);
      }
      if (folderIds.has(folder.id)) {
        throw new ValidationError(`Duplicate folder id: "${folder.id}"`, `${path}.id`);
      }
      folderIds.add(folder.id);
      if (folder.children) {
        for (let i = 0; i < folder.children.length; i++) {
          validateFolder(folder.children[i], `${path}.children[${i}]`);
        }
      }
    }
    for (let i = 0; i < library.folders.length; i++) {
      validateFolder(library.folders[i], `library.folders[${i}]`);
    }
  }

  // Validate a timeline
  function validateTimeline(timeline: any, path: string, owningSymbolId?: string) {
    if (!timeline || typeof timeline !== 'object') {
      throw new ValidationError('Timeline must be an object', path);
    }
    if (typeof timeline.frameCount !== 'number' || timeline.frameCount < 1) {
      throw new ValidationError('Timeline frameCount must be a positive integer', `${path}.frameCount`);
    }
    if (!Array.isArray(timeline.layers)) {
      throw new ValidationError('Timeline layers must be an array', `${path}.layers`);
    }

    const layerIds = new Set<string>();
    for (let i = 0; i < timeline.layers.length; i++) {
      const layer = timeline.layers[i];
      const lPath = `${path}.layers[${i}]`;
      if (!layer || typeof layer !== 'object') {
        throw new ValidationError('Invalid layer definition', lPath);
      }
      if (!layer.id || typeof layer.id !== 'string') {
        throw new ValidationError('Layer missing id', `${lPath}.id`);
      }
      if (layerIds.has(layer.id)) {
        throw new ValidationError(`Duplicate layer id: "${layer.id}"`, `${lPath}.id`);
      }
      layer.kind ??= 'normal';
      layer.visible ??= true;
      layer.locked ??= false;
      layerIds.add(layer.id);
    }

    const keyframeIds = new Set<string>();

    for (let i = 0; i < timeline.layers.length; i++) {
      const layer = timeline.layers[i];
      const lPath = `${path}.layers[${i}]`;

      if (layer.maskLayerId !== undefined) {
        if (!layerIds.has(layer.maskLayerId)) {
          throw new ValidationError(
            `Referenced maskLayerId "${layer.maskLayerId}" not found in timeline`,
            `${lPath}.maskLayerId`,
          );
        }
        if (layer.maskLayerId === layer.id) {
          throw new ValidationError('Layer cannot mask itself', `${lPath}.maskLayerId`);
        }
      }

      if (layer.parentLayerId !== undefined) {
        if (!layerIds.has(layer.parentLayerId)) {
          throw new ValidationError(
            `Referenced parentLayerId "${layer.parentLayerId}" not found in timeline`,
            `${lPath}.parentLayerId`,
          );
        }
        let curr: string | undefined = layer.parentLayerId;
        const visited = new Set<string>([layer.id]);
        while (curr) {
          if (visited.has(curr)) {
            throw new ValidationError('Cyclic parentLayerId detected', `${lPath}.parentLayerId`);
          }
          visited.add(curr);
          const pLayer = (timeline.layers as any[]).find((l) => l.id === curr);
          curr = pLayer?.parentLayerId;
        }
      }

      if (layer.transform && typeof layer.transform === 'object') {
        layer.transform.x ??= 0;
        layer.transform.y ??= 0;
        layer.transform.scaleX ??= 1;
        layer.transform.scaleY ??= 1;
        layer.transform.rotation ??= 0;
        layer.transform.skewX ??= 0;
        layer.transform.skewY ??= 0;
        layer.transform.originX ??= 0;
        layer.transform.originY ??= 0;
      }

      if (!Array.isArray(layer.keyframes)) {
        throw new ValidationError('Layer keyframes must be an array', `${lPath}.keyframes`);
      }

      let lastEnd = 0;
      for (let k = 0; k < layer.keyframes.length; k++) {
        const kf = layer.keyframes[k];
        const kfPath = `${lPath}.keyframes[${k}]`;

        if (!kf || typeof kf !== 'object') {
          throw new ValidationError('Invalid keyframe definition', kfPath);
        }
        if (!kf.id || typeof kf.id !== 'string') {
          throw new ValidationError('Keyframe missing id', `${kfPath}.id`);
        }
        if (keyframeIds.has(kf.id)) {
          throw new ValidationError(`Duplicate keyframe id: "${kf.id}"`, `${kfPath}.id`);
        }
        keyframeIds.add(kf.id);

        if (typeof kf.index !== 'number' || kf.index < 0) {
          throw new ValidationError('Keyframe index must be a non-negative number', `${kfPath}.index`);
        }
        if (typeof kf.duration !== 'number' || kf.duration < 1) {
          throw new ValidationError('Keyframe duration must be a positive number', `${kfPath}.duration`);
        }
        if (kf.index < lastEnd) {
          throw new ValidationError(
            `Overlapping keyframe at index ${kf.index} (previous keyframe ends at ${lastEnd})`,
            `${kfPath}.index`,
          );
        }
        lastEnd = kf.index + kf.duration;
        if (lastEnd > timeline.frameCount) {
          throw new ValidationError(
            `Keyframe span (${kf.index}..${lastEnd}) exceeds timeline frameCount (${timeline.frameCount})`,
            `${kfPath}.duration`,
          );
        }

        if (kf.tween?.motionGuide?.layerId) {
          const guideId = kf.tween.motionGuide.layerId;
          if (!layerIds.has(guideId)) {
            throw new ValidationError(
              `Motion guide references non-existent layer "${guideId}"`,
              `${kfPath}.tween.motionGuide.layerId`,
            );
          }
        }

        if (kf.sound?.audioId) {
          if (!audioIds.has(kf.sound.audioId)) {
            throw new ValidationError(
              `Referenced audio "${kf.sound.audioId}" does not exist in library`,
              `${kfPath}.sound.audioId`,
            );
          }
        }

        if (kf.transform && typeof kf.transform === 'object') {
          kf.transform.x ??= 0;
          kf.transform.y ??= 0;
          kf.transform.scaleX ??= 1;
          kf.transform.scaleY ??= 1;
          kf.transform.rotation ??= 0;
          kf.transform.skewX ??= 0;
          kf.transform.skewY ??= 0;
          kf.transform.originX ??= 0;
          kf.transform.originY ??= 0;
        }

        if (!Array.isArray(kf.elements)) {
          throw new ValidationError('Keyframe elements must be an array', `${kfPath}.elements`);
        }

        const elIds = new Set<string>();
        const instanceNames = new Set<string>();

        for (let e = 0; e < kf.elements.length; e++) {
          const el = kf.elements[e];
          const elPath = `${kfPath}.elements[${e}]`;

          if (!el || typeof el !== 'object') {
            throw new ValidationError('Invalid element definition', elPath);
          }
          if (!el.id || typeof el.id !== 'string') {
            throw new ValidationError('Element missing id', `${elPath}.id`);
          }
          if (elIds.has(el.id)) {
            throw new ValidationError(`Duplicate element id in keyframe: "${el.id}"`, `${elPath}.id`);
          }
          elIds.add(el.id);

          el.alpha ??= 1;
          el.visible ??= true;
          if (el.transform && typeof el.transform === 'object') {
            el.transform.x ??= 0;
            el.transform.y ??= 0;
            el.transform.scaleX ??= 1;
            el.transform.scaleY ??= 1;
            el.transform.rotation ??= 0;
            el.transform.skewX ??= 0;
            el.transform.skewY ??= 0;
            el.transform.originX ??= 0;
            el.transform.originY ??= 0;
          }

          if (el.instanceName) {
            if (instanceNames.has(el.instanceName)) {
              throw new ValidationError(
                `Duplicate instance name in keyframe: "${el.instanceName}"`,
                `${elPath}.instanceName`,
              );
            }
            instanceNames.add(el.instanceName);
          }

          if (el.type === 'instance') {
            if (!symbolIds.has(el.symbolId)) {
              throw new ValidationError(
                `Referenced symbol "${el.symbolId}" does not exist in library`,
                `${elPath}.symbolId`,
              );
            }
            if (owningSymbolId !== undefined && el.symbolId === owningSymbolId) {
              throw new ValidationError(
                `Symbol "${owningSymbolId}" contains an instance of itself (direct recursion)`,
                `${elPath}.symbolId`,
              );
            }
            if (
              el.playMode !== undefined &&
              !['loop', 'once', 'stop', 'sync'].includes(el.playMode)
            ) {
              throw new ValidationError(
                `Invalid playMode: "${el.playMode}"`,
                `${elPath}.playMode`,
              );
            }
          } else if (el.type === 'bitmap') {
            if (!bitmapIds.has(el.bitmapId) && !el.src) {
              throw new ValidationError(
                `Referenced bitmap "${el.bitmapId}" does not exist in library`,
                `${elPath}.bitmapId`,
              );
            }
          } else if (el.type === 'video') {
            if (typeof el.src !== 'string' || !el.src) {
              throw new ValidationError(
                'Video element requires a non-empty src URL',
                `${elPath}.src`,
              );
            }
          } else if (el.type === 'text') {
            if (el.i18nKey !== undefined && typeof el.i18nKey !== 'string') {
              throw new ValidationError(
                'Text element i18nKey must be a string',
                `${elPath}.i18nKey`,
              );
            }
          }
        }
      }
    }
  }

  // 5. Validate Root Timeline
  if (!doc.root || typeof doc.root !== 'object') {
    throw new ValidationError('Document missing root timeline', 'root');
  }
  validateTimeline(doc.root, 'root');

  // 5b. Validate Artboards
  if (doc.artboards !== undefined) {
    if (!Array.isArray(doc.artboards)) {
      throw new ValidationError('Document artboards must be an array', 'artboards');
    }
    const artboardIds = new Set<string>();
    for (let i = 0; i < doc.artboards.length; i++) {
      const ab = doc.artboards[i];
      const p = `artboards[${i}]`;
      if (!ab || typeof ab !== 'object') {
        throw new ValidationError(`Artboard at index ${i} must be an object`, p);
      }
      if (typeof ab.id !== 'string' || !ab.id.trim()) {
        throw new ValidationError('Artboard id must be a non-empty string', `${p}.id`);
      }
      if (artboardIds.has(ab.id)) {
        throw new ValidationError(`Duplicate artboard id "${ab.id}"`, `${p}.id`);
      }
      artboardIds.add(ab.id);

      if (typeof ab.name !== 'string' || !ab.name.trim()) {
        throw new ValidationError('Artboard name must be a non-empty string', `${p}.name`);
      }
      if (typeof ab.width !== 'number' || ab.width <= 0) {
        throw new ValidationError('Artboard width must be a positive number', `${p}.width`);
      }
      if (typeof ab.height !== 'number' || ab.height <= 0) {
        throw new ValidationError('Artboard height must be a positive number', `${p}.height`);
      }
      if (!ab.root || typeof ab.root !== 'object') {
        throw new ValidationError('Artboard missing root timeline', `${p}.root`);
      }
      validateTimeline(ab.root, `${p}.root`);

      if (ab.background !== undefined) {
        if (!ab.background || typeof ab.background !== 'object') {
          throw new ValidationError('Artboard background must be an object', `${p}.background`);
        }
      }
      if (ab.breakpoints !== undefined) {
        if (!Array.isArray(ab.breakpoints)) {
          throw new ValidationError('Artboard breakpoints must be an array', `${p}.breakpoints`);
        }
        for (let b = 0; b < ab.breakpoints.length; b++) {
          const bp = ab.breakpoints[b];
          const bpPath = `${p}.breakpoints[${b}]`;
          if (!bp || typeof bp !== 'object') {
            throw new ValidationError('Invalid breakpoint definition', bpPath);
          }
          if (typeof bp.id !== 'string' || !bp.id) {
            throw new ValidationError('Breakpoint id is required', `${bpPath}.id`);
          }
          if (typeof bp.name !== 'string' || !bp.name) {
            throw new ValidationError('Breakpoint name is required', `${bpPath}.name`);
          }
          if (typeof bp.maxWidth !== 'number' || bp.maxWidth <= 0) {
            throw new ValidationError(
              'Breakpoint maxWidth must be a positive number',
              `${bpPath}.maxWidth`
            );
          }
          if (typeof bp.width !== 'number' || bp.width <= 0) {
            throw new ValidationError(
              'Breakpoint width must be a positive number',
              `${bpPath}.width`
            );
          }
          if (typeof bp.height !== 'number' || bp.height <= 0) {
            throw new ValidationError(
              'Breakpoint height must be a positive number',
              `${bpPath}.height`
            );
          }
        }
      }
    }

    if (doc.activeArtboardId !== undefined) {
      if (typeof doc.activeArtboardId !== 'string') {
        throw new ValidationError('activeArtboardId must be a string', 'activeArtboardId');
      }
      if (doc.artboards.length > 0 && !artboardIds.has(doc.activeArtboardId)) {
        throw new ValidationError(
          `Active artboard id "${doc.activeArtboardId}" not found in artboards`,
          'activeArtboardId'
        );
      }
    }
  } else if (doc.activeArtboardId !== undefined) {
    if (typeof doc.activeArtboardId !== 'string') {
      throw new ValidationError('activeArtboardId must be a string', 'activeArtboardId');
    }
  }

  // 6. Validate i18n
  if (doc.i18n !== undefined) {
    if (typeof doc.i18n !== 'object' || doc.i18n === null) {
      throw new ValidationError('Document i18n must be an object', 'i18n');
    }
    if (typeof doc.i18n.defaultLocale !== 'string' || !doc.i18n.defaultLocale) {
      throw new ValidationError('i18n defaultLocale must be a non-empty string', 'i18n.defaultLocale');
    }
    if (typeof doc.i18n.locales !== 'object' || doc.i18n.locales === null) {
      throw new ValidationError('i18n locales must be an object', 'i18n.locales');
    }
  }

  // 7. Validate State Machines
  if (doc.stateMachines !== undefined) {
    if (!Array.isArray(doc.stateMachines)) {
      throw new ValidationError('Document stateMachines must be an array', 'stateMachines');
    }

    const stateMachineIds = new Set<string>();

    for (let i = 0; i < doc.stateMachines.length; i++) {
      const sm = doc.stateMachines[i];
      const smPath = `stateMachines[${i}]`;

      if (!sm || typeof sm !== 'object') {
        throw new ValidationError('Invalid state machine definition', smPath);
      }
      if (typeof sm.id !== 'string' || !sm.id) {
        throw new ValidationError('State machine id is required', `${smPath}.id`);
      }
      if (stateMachineIds.has(sm.id)) {
        throw new ValidationError(`Duplicate state machine id: "${sm.id}"`, `${smPath}.id`);
      }
      stateMachineIds.add(sm.id);

      if (typeof sm.name !== 'string' || !sm.name) {
        throw new ValidationError('State machine name is required', `${smPath}.name`);
      }

      // 7.1 Validate Inputs
      if (!Array.isArray(sm.inputs)) {
        throw new ValidationError('State machine inputs must be an array', `${smPath}.inputs`);
      }
      const inputIds = new Set<string>();
      for (let j = 0; j < sm.inputs.length; j++) {
        const inp = sm.inputs[j];
        const inpPath = `${smPath}.inputs[${j}]`;
        if (!inp || typeof inp !== 'object') {
          throw new ValidationError('Invalid state machine input definition', inpPath);
        }
        if (typeof inp.id !== 'string' || !inp.id) {
          throw new ValidationError('Input id is required', `${inpPath}.id`);
        }
        if (inputIds.has(inp.id)) {
          throw new ValidationError(`Duplicate input id: "${inp.id}"`, `${inpPath}.id`);
        }
        inputIds.add(inp.id);

        if (typeof inp.name !== 'string' || !inp.name) {
          throw new ValidationError('Input name is required', `${inpPath}.name`);
        }
        const validTypes = ['boolean', 'number', 'trigger'];
        if (!validTypes.includes(inp.type)) {
          throw new ValidationError(`Invalid input type: "${inp.type}"`, `${inpPath}.type`);
        }
      }

      // 7.2 Validate States
      if (!Array.isArray(sm.states)) {
        throw new ValidationError('State machine states must be an array', `${smPath}.states`);
      }
      const stateIds = new Set<string>();
      for (let j = 0; j < sm.states.length; j++) {
        const st = sm.states[j];
        const statePath = `${smPath}.states[${j}]`;
        if (!st || typeof st !== 'object') {
          throw new ValidationError('Invalid state definition', statePath);
        }
        if (typeof st.id !== 'string' || !st.id) {
          throw new ValidationError('State id is required', `${statePath}.id`);
        }
        if (stateIds.has(st.id)) {
          throw new ValidationError(`Duplicate state id: "${st.id}"`, `${statePath}.id`);
        }
        stateIds.add(st.id);

        if (typeof st.name !== 'string' || !st.name) {
          throw new ValidationError('State name is required', `${statePath}.name`);
        }
        const validStateTypes = ['entry', 'exit', 'clip', 'blend1d', 'blend2d', 'pose'];
        if (!validStateTypes.includes(st.type)) {
          throw new ValidationError(`Invalid state type: "${st.type}"`, `${statePath}.type`);
        }
      }

      // 7.3 Validate Transitions
      if (!Array.isArray(sm.transitions)) {
        throw new ValidationError('State machine transitions must be an array', `${smPath}.transitions`);
      }
      const transitionIds = new Set<string>();
      for (let j = 0; j < sm.transitions.length; j++) {
        const tr = sm.transitions[j];
        const trPath = `${smPath}.transitions[${j}]`;
        if (!tr || typeof tr !== 'object') {
          throw new ValidationError('Invalid transition definition', trPath);
        }
        if (typeof tr.id !== 'string' || !tr.id) {
          throw new ValidationError('Transition id is required', `${trPath}.id`);
        }
        if (transitionIds.has(tr.id)) {
          throw new ValidationError(`Duplicate transition id: "${tr.id}"`, `${trPath}.id`);
        }
        transitionIds.add(tr.id);

        if (typeof tr.fromStateId !== 'string' || !tr.fromStateId) {
          throw new ValidationError('Transition fromStateId is required', `${trPath}.fromStateId`);
        }
        if (typeof tr.toStateId !== 'string' || !tr.toStateId) {
          throw new ValidationError('Transition toStateId is required', `${trPath}.toStateId`);
        }
        if (!stateIds.has(tr.fromStateId)) {
          throw new ValidationError(
            `Transition fromStateId "${tr.fromStateId}" not found in states`,
            `${trPath}.fromStateId`
          );
        }
        if (!stateIds.has(tr.toStateId)) {
          throw new ValidationError(
            `Transition toStateId "${tr.toStateId}" not found in states`,
            `${trPath}.toStateId`
          );
        }

        if (tr.conditions !== undefined) {
          if (!Array.isArray(tr.conditions)) {
            throw new ValidationError('Transition conditions must be an array', `${trPath}.conditions`);
          }
          for (let k = 0; k < tr.conditions.length; k++) {
            const cond = tr.conditions[k];
            const condPath = `${trPath}.conditions[${k}]`;
            if (!cond || typeof cond !== 'object') {
              throw new ValidationError('Invalid condition definition', condPath);
            }
            if (typeof cond.inputId !== 'string' || !cond.inputId) {
              throw new ValidationError('Condition inputId is required', `${condPath}.inputId`);
            }
            if (!inputIds.has(cond.inputId)) {
              throw new ValidationError(
                `Condition inputId "${cond.inputId}" not found in inputs`,
                `${condPath}.inputId`
              );
            }
            const validOps = ['==', '!=', '>', '<', '>=', '<='];
            if (!validOps.includes(cond.op)) {
              throw new ValidationError(`Invalid condition operator: "${cond.op}"`, `${condPath}.op`);
            }
          }
        }
      }

      // 7.4 Validate Listeners
      if (!Array.isArray(sm.listeners)) {
        throw new ValidationError('State machine listeners must be an array', `${smPath}.listeners`);
      }
      const listenerIds = new Set<string>();
      for (let j = 0; j < sm.listeners.length; j++) {
        const lis = sm.listeners[j];
        const lisPath = `${smPath}.listeners[${j}]`;
        if (!lis || typeof lis !== 'object') {
          throw new ValidationError('Invalid listener definition', lisPath);
        }
        if (typeof lis.id !== 'string' || !lis.id) {
          throw new ValidationError('Listener id is required', `${lisPath}.id`);
        }
        if (listenerIds.has(lis.id)) {
          throw new ValidationError(`Duplicate listener id: "${lis.id}"`, `${lisPath}.id`);
        }
        listenerIds.add(lis.id);

        const validEvents = [
          'pointerdown',
          'pointerup',
          'pointerenter',
          'pointerleave',
          'click',
          'collision',
          'keydown',
          'keyup',
          'tick',
        ];
        if (!validEvents.includes(lis.eventType)) {
          throw new ValidationError(`Invalid listener eventType: "${lis.eventType}"`, `${lisPath}.eventType`);
        }

        if (!Array.isArray(lis.actions)) {
          throw new ValidationError('Listener actions must be an array', `${lisPath}.actions`);
        }
        for (let k = 0; k < lis.actions.length; k++) {
          const act = lis.actions[k];
          const actPath = `${lisPath}.actions[${k}]`;
          if (!act || typeof act !== 'object') {
            throw new ValidationError('Invalid action definition', actPath);
          }
          const validActions = ['fire_trigger', 'set_input', 'change_input', 'spawn_clip', 'play_sound'];
          if (!validActions.includes(act.type)) {
            throw new ValidationError(`Invalid action type: "${act.type}"`, `${actPath}.type`);
          }
          if (act.inputId !== undefined && typeof act.inputId === 'string' && inputIds.size > 0 && !inputIds.has(act.inputId)) {
            throw new ValidationError(
              `Action inputId "${act.inputId}" not found in inputs`,
              `${actPath}.inputId`
            );
          }
        }
      }
    }

    if (doc.activeStateMachineId !== undefined) {
      if (typeof doc.activeStateMachineId !== 'string') {
        throw new ValidationError('activeStateMachineId must be a string', 'activeStateMachineId');
      }
      if (doc.stateMachines.length > 0 && !stateMachineIds.has(doc.activeStateMachineId)) {
        throw new ValidationError(
          `Active state machine id "${doc.activeStateMachineId}" not found in stateMachines`,
          'activeStateMachineId'
        );
      }
    }
  } else if (doc.activeStateMachineId !== undefined) {
    if (typeof doc.activeStateMachineId !== 'string') {
      throw new ValidationError('activeStateMachineId must be a string', 'activeStateMachineId');
    }
  }

  // 6. Validate Library Symbols Timelines
  if (library.symbols) {
    for (const [symId, sym] of Object.entries(library.symbols)) {
      validateTimeline(sym.timeline, `library.symbols.${symId}.timeline`, symId);
    }

    // Check for cycles in symbol instance graph
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function checkSymbolCycle(id: string) {
      if (inStack.has(id)) {
        throw new ValidationError(`Cyclic symbol reference detected involving symbol "${id}"`, `library.symbols.${id}`);
      }
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);

      const s = library.symbols[id];
      if (s?.timeline?.layers) {
        for (const layer of s.timeline.layers) {
          for (const kf of layer.keyframes ?? []) {
            for (const el of kf.elements ?? []) {
              if (el.type === 'instance' && el.symbolId && library.symbols[el.symbolId]) {
                checkSymbolCycle(el.symbolId);
              }
            }
          }
        }
      }

      inStack.delete(id);
    }

    for (const symId of symbolIds) {
      checkSymbolCycle(symId);
    }
  }

  return doc;
}
