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

  // 3. Meta
  if (!doc.meta || typeof doc.meta !== 'object') {
    throw new ValidationError('Document missing meta definition', 'meta');
  }

  // 4. Library
  if (!doc.library || typeof doc.library !== 'object') {
    throw new ValidationError('Document missing library definition', 'library');
  }
  const library = doc.library;
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
        if (layer.parentLayerId === layer.id) {
          throw new ValidationError('Layer cannot parent itself', `${lPath}.parentLayerId`);
        }
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
          } else if (el.type === 'bitmap') {
            if (!bitmapIds.has(el.bitmapId)) {
              throw new ValidationError(
                `Referenced bitmap "${el.bitmapId}" does not exist in library`,
                `${elPath}.bitmapId`,
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
