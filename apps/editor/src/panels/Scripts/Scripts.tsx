import React, { useState, useEffect, useRef } from 'react';
import type { SymbolInstance } from '@flashback/runtime';
import {
  useEditorStore,
  getEditorState,
  editorActions,
  findKeyframeAt,
  getActiveTimeline,
  getActiveArtboard,
  type EditorElement,
  type EditorLayer,
} from '../../state/editorStore';
import {
  BLOCK_CATALOG,
  CATEGORY_METADATA,
  createBlock,
  compileBlocksToJS,
  parseJSIntoBlocks,
  type ScriptBlock,
  type ScriptBlockCategory,
  type ScriptBlockType,
} from './scriptBlocks';
import styles from './Scripts.module.css';

const CLAMP_BLOCK_TYPES = new Set<string>([
  'if_condition',
  'if_else',
  'switch_case',
  'for_each',
  'repeat_times',
  'while_loop',
  'do_while',
]);

const EVENT_ALIASES: Record<string, string[]> = {
  onClick: ['onClick', 'click', 'onRelease', 'release'],
  onPointerEnter: ['onPointerEnter', 'pointerenter', 'onRollOver', 'rollOver', 'hover', 'mouseenter'],
  onPointerLeave: ['onPointerLeave', 'pointerleave', 'onRollOut', 'rollOut', 'mouseleave'],
  onPointerDown: ['onPointerDown', 'pointerdown', 'onPress', 'press'],
  onPointerUp: ['onPointerUp', 'pointerup', 'onRelease', 'release'],
  onEnterFrame: ['onEnterFrame', 'enterFrame'],
};

function getElementEventScript(
  el: EditorElement | null,
  eventName: string,
  docScripts?: Record<string, any>
): string {
  if (!el) return '';
  const events = (el.events as Record<string, { __fn?: string } | undefined>) || {};
  const targetId = el.instanceName || el.id;
  const docTargetScripts = docScripts?.[targetId] || {};

  const candidates = [eventName, ...(EVENT_ALIASES[eventName] || [])];
  for (const name of candidates) {
    if (events[name]?.__fn) return events[name]!.__fn!;
    if (docTargetScripts[name]?.__fn) return docTargetScripts[name]!.__fn!;
  }
  return '';
}

export const Scripts: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const isolationStack = useEditorStore((s) => s.isolationStack);
  const scriptTriggerFocus = useEditorStore((s: any) => s.scriptTriggerFocus);

  const activeAb = getActiveArtboard(doc);
  const artboards = doc.artboards && doc.artboards.length > 0 ? doc.artboards : [activeAb];

  // Active timeline resolution
  const activeTl = getActiveTimeline(doc, isolationStack);
  let selectedEl: EditorElement | null = null;
  let targetLayer: EditorLayer | null = null;

  for (const layer of activeTl.layers) {
    const kf = findKeyframeAt(layer, currentFrame);
    if (!kf) continue;
    const found = kf.elements.find((e) => selectedElementIds.includes(e.id));
    if (found) {
      selectedEl = found;
      targetLayer = layer;
      break;
    }
  }

  if (!selectedEl) {
    targetLayer =
      activeTl.layers.find((l) => l.id === selectedLayerId) || activeTl.layers[0] || null;
  }

  const initialFocus =
    (getEditorState() as any)?.scriptTriggerFocus ??
    (useEditorStore as any).getState?.()?.scriptTriggerFocus;
  const [selectedEvent, setSelectedEvent] = useState<string>(
    initialFocus === 'keyframe' ? '__keyframe__' : 'onClick'
  );

  const [codeDraft, setCodeDraft] = useState<string>('');
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ScriptBlockCategory | 'all'>('all');
  const [isCodeViewOpen, setIsCodeViewOpen] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Drag and drop block reordering state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const prevSelectedElIdRef = useRef<string | null>(null);

  // Automatic trigger focus sync
  useEffect(() => {
    if (scriptTriggerFocus === 'keyframe') {
      setSelectedEvent('__keyframe__');
    }
  }, [scriptTriggerFocus]);

  // Synchronize active trigger when selection changes
  useEffect(() => {
    if (selectedEl) {
      if (selectedEl.id !== prevSelectedElIdRef.current) {
        prevSelectedElIdRef.current = selectedEl.id;
        if (scriptTriggerFocus !== 'keyframe') {
          setSelectedEvent('onClick');
        }
      }
    } else {
      prevSelectedElIdRef.current = null;
      setSelectedEvent('__keyframe__');
    }
  }, [selectedEl?.id, scriptTriggerFocus]);

  const isKeyframeScript = selectedEvent === '__keyframe__' || !selectedEl;

  // Sync draft & visual blocks from document whenever target, frame, or event changes
  useEffect(() => {
    setStatusMsg(null);
    let script = '';
    if (!isKeyframeScript && selectedEl) {
      script = getElementEventScript(selectedEl, selectedEvent, (doc as any).scripts);
    } else if (targetLayer) {
      const kf = findKeyframeAt(targetLayer, currentFrame);
      const fnObj = kf?.actions as { __fn?: string } | undefined;
      script = fnObj?.__fn || '';
    }
    setCodeDraft(script);
    setBlocks(parseJSIntoBlocks(script));
  }, [selectedEl?.id, targetLayer?.id, currentFrame, selectedEvent, isKeyframeScript]);

  // Synchronize textarea scroll with line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Persist code directly to either keyframe or element
  const saveScript = (newCode: string, skipHistory = true) => {
    if (!isKeyframeScript && selectedEl) {
      editorActions.updateElementScript(selectedEl.id, selectedEvent, newCode, skipHistory);
    } else if (targetLayer) {
      editorActions.updateKeyframeScript(targetLayer.id, currentFrame, newCode, skipHistory);
    }
  };

  // Immediate auto-save on code editor typing
  const handleCodeChange = (newCode: string) => {
    setCodeDraft(newCode);
    setBlocks(parseJSIntoBlocks(newCode));
    saveScript(newCode, true);
  };

  // Persist history snapshot on blur
  const handleBlur = () => {
    saveScript(codeDraft, false);
  };

  // Visual block stack updates (adds, edits, reorders, deletes)
  const updateBlocks = (nextBlocks: ScriptBlock[]) => {
    setBlocks(nextBlocks);
    const compiled = compileBlocksToJS(nextBlocks);
    setCodeDraft(compiled);
    saveScript(compiled, true);
  };

  // Add block from palette
  const handleAddBlock = (type: ScriptBlockType, defaultParams?: Record<string, any>) => {
    const newBlock = createBlock(type, defaultParams);
    const nextBlocks = [...blocks, newBlock];
    updateBlocks(nextBlocks);
  };

  // Recursive update of a block parameter anywhere in the tree
  const updateBlockParamInTree = (
    list: ScriptBlock[],
    blockId: string,
    paramKey: string,
    value: any
  ): ScriptBlock[] => {
    return list.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          params: { ...b.params, [paramKey]: value },
        };
      }
      let changed = false;
      const nextParams = { ...b.params };
      for (const key of ['thenBlocks', 'elseBlocks', 'bodyBlocks', 'caseBlocks', 'defaultBlocks', 'actionBlocks']) {
        if (Array.isArray(nextParams[key])) {
          const nextList = updateBlockParamInTree(nextParams[key], blockId, paramKey, value);
          if (nextList !== nextParams[key]) {
            nextParams[key] = nextList;
            changed = true;
          }
        }
      }
      return changed ? { ...b, params: nextParams } : b;
    });
  };

  const handleUpdateParam = (blockId: string, paramKey: string, value: any) => {
    const nextBlocks = updateBlockParamInTree(blocks, blockId, paramKey, value);
    updateBlocks(nextBlocks);
  };

  // Add block to a nested branch (e.g. thenBlocks, elseBlocks, bodyBlocks)
  const addNestedBlock = (
    parentBlockId: string,
    branchKey: string,
    type: ScriptBlockType,
    defaultParams?: Record<string, any>
  ) => {
    const addInTree = (list: ScriptBlock[]): ScriptBlock[] => {
      return list.map((b) => {
        if (b.id === parentBlockId) {
          const currentArr = Array.isArray(b.params[branchKey]) ? [...b.params[branchKey]] : [];
          currentArr.push(createBlock(type, defaultParams));
          return {
            ...b,
            params: {
              ...b.params,
              [branchKey]: currentArr,
            },
          };
        }
        let changed = false;
        const nextParams = { ...b.params };
        for (const key of ['thenBlocks', 'elseBlocks', 'bodyBlocks', 'caseBlocks', 'defaultBlocks', 'actionBlocks']) {
          if (Array.isArray(nextParams[key])) {
            const nextList = addInTree(nextParams[key]);
            if (nextList !== nextParams[key]) {
              nextParams[key] = nextList;
              changed = true;
            }
          }
        }
        return changed ? { ...b, params: nextParams } : b;
      });
    };
    updateBlocks(addInTree(blocks));
  };

  // Move a block within a nested branch or at top level
  const moveBlockInBranch = (
    parentBlockId: string | undefined,
    branchKey: string | undefined,
    idx: number,
    delta: number
  ) => {
    if (!parentBlockId || !branchKey) {
      moveBlock(idx, delta);
      return;
    }
    const moveInTree = (list: ScriptBlock[]): ScriptBlock[] => {
      return list.map((b) => {
        if (b.id === parentBlockId) {
          const currentArr = Array.isArray(b.params[branchKey]) ? [...b.params[branchKey]] : [];
          const target = idx + delta;
          if (target >= 0 && target < currentArr.length) {
            const [moved] = currentArr.splice(idx, 1);
            currentArr.splice(target, 0, moved);
            return {
              ...b,
              params: { ...b.params, [branchKey]: currentArr },
            };
          }
          return b;
        }
        let changed = false;
        const nextParams = { ...b.params };
        for (const key of ['thenBlocks', 'elseBlocks', 'bodyBlocks', 'caseBlocks', 'defaultBlocks', 'actionBlocks']) {
          if (Array.isArray(nextParams[key])) {
            const nextList = moveInTree(nextParams[key]);
            if (nextList !== nextParams[key]) {
              nextParams[key] = nextList;
              changed = true;
            }
          }
        }
        return changed ? { ...b, params: nextParams } : b;
      });
    };
    updateBlocks(moveInTree(blocks));
  };

  // Duplicate a block within a nested branch or at top level
  const duplicateBlockInBranch = (
    parentBlockId: string | undefined,
    branchKey: string | undefined,
    idx: number
  ) => {
    if (!parentBlockId || !branchKey) {
      duplicateBlock(idx);
      return;
    }
    const dupInTree = (list: ScriptBlock[]): ScriptBlock[] => {
      return list.map((b) => {
        if (b.id === parentBlockId) {
          const currentArr = Array.isArray(b.params[branchKey]) ? [...b.params[branchKey]] : [];
          if (idx >= 0 && idx < currentArr.length) {
            const orig = currentArr[idx];
            const copy = createBlock(orig.type, JSON.parse(JSON.stringify(orig.params)));
            currentArr.splice(idx + 1, 0, copy);
            return {
              ...b,
              params: { ...b.params, [branchKey]: currentArr },
            };
          }
          return b;
        }
        let changed = false;
        const nextParams = { ...b.params };
        for (const key of ['thenBlocks', 'elseBlocks', 'bodyBlocks', 'caseBlocks', 'defaultBlocks', 'actionBlocks']) {
          if (Array.isArray(nextParams[key])) {
            const nextList = dupInTree(nextParams[key]);
            if (nextList !== nextParams[key]) {
              nextParams[key] = nextList;
              changed = true;
            }
          }
        }
        return changed ? { ...b, params: nextParams } : b;
      });
    };
    updateBlocks(dupInTree(blocks));
  };

  // Delete a block from anywhere in the tree
  const removeBlockById = (blockId: string) => {
    const removeFromTree = (list: ScriptBlock[]): ScriptBlock[] => {
      return list
        .filter((b) => b.id !== blockId)
        .map((b) => {
          let changed = false;
          const nextParams = { ...b.params };
          for (const key of ['thenBlocks', 'elseBlocks', 'bodyBlocks', 'caseBlocks', 'defaultBlocks', 'actionBlocks']) {
            if (Array.isArray(nextParams[key])) {
              const nextList = removeFromTree(nextParams[key]);
              if (nextList !== nextParams[key]) {
                nextParams[key] = nextList;
                changed = true;
              }
            }
          }
          return changed ? { ...b, params: nextParams } : b;
        });
    };
    updateBlocks(removeFromTree(blocks));
  };

  // Move block up or down at root level
  const moveBlock = (idx: number, delta: number) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const next = [...blocks];
    const [removed] = next.splice(idx, 1);
    next.splice(targetIdx, 0, removed);
    updateBlocks(next);
  };

  // Duplicate block at root level
  const duplicateBlock = (idx: number) => {
    const item = blocks[idx];
    const copy = createBlock(item.type, { ...item.params });
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    updateBlocks(next);
  };

  // Delete block at root level
  const removeBlock = (idx: number) => {
    const next = blocks.filter((_, i) => i !== idx);
    updateBlocks(next);
  };

  // HTML5 Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      return;
    }
    const next = [...blocks];
    const [removed] = next.splice(draggedIdx, 1);
    next.splice(targetIdx, 0, removed);
    setDraggedIdx(null);
    updateBlocks(next);
  };

  const handleApply = () => {
    if (codeDraft.trim()) {
      try {
        new Function('event', 'e', codeDraft);
        setStatusMsg({ text: 'Syntax valid · Script bound live', isError: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMsg({ text: `Syntax error: ${msg}`, isError: true });
        return;
      }
    } else {
      setStatusMsg({ text: 'Script cleared', isError: false });
    }

    saveScript(codeDraft, false);
  };

  const handleFormat = () => {
    const formatted =
      blocks.length > 0
        ? compileBlocksToJS(blocks)
        : codeDraft
            .split('\n')
            .map((l) => l.trimEnd())
            .join('\n')
            .trim();
    handleCodeChange(formatted);
  };

  // Line numbers calculation
  const lineCount = Math.max(1, codeDraft.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const eventOptions = [
    { value: 'onClick', label: 'onClick — Mouse Click' },
    { value: 'onPointerEnter', label: 'onPointerEnter — Hover In' },
    { value: 'onPointerLeave', label: 'onPointerLeave — Hover Out' },
    { value: 'onPointerDown', label: 'onPointerDown — Press' },
    { value: 'onPointerUp', label: 'onPointerUp — Release' },
    { value: 'onEnterFrame', label: 'onEnterFrame — Every Frame / Tick' },
  ];

  const fps = (doc as any).fps || doc.stage?.fps || 24;
  const timeFormatted = `${(currentFrame / fps).toFixed(2)}s`;

  const renderTargetBadge = () => {
    if (selectedEl && !isKeyframeScript) {
      const targetName =
        selectedEl.instanceName ||
        (selectedEl.type === 'instance'
          ? doc.library.symbols[(selectedEl as SymbolInstance).symbolId]?.name
          : null) ||
        selectedEl.id;

      let icon = '❖';
      let typeLabel = 'Component Instance';
      if (selectedEl.type === 'shape') {
        icon = '⬡';
        typeLabel = 'Shape';
      } else if (selectedEl.type === 'bitmap') {
        icon = '🖼';
        typeLabel = 'Bitmap';
      } else if (selectedEl.type === 'text') {
        icon = 'T';
        typeLabel = 'Text';
      } else if (selectedEl.type === 'video') {
        icon = '▶';
        typeLabel = 'Video';
      }

      return (
        <span>
          Target: {icon} {targetName} ({typeLabel})
        </span>
      );
    }

    return (
      <span>
        🎬 Frame {currentFrame + 1} ({targetLayer?.name || 'Layer 1'})
      </span>
    );
  };

  const getPlaceholderText = () => {
    if (selectedEl && !isKeyframeScript) {
      const targetName = selectedEl.instanceName || selectedEl.id;
      return `// Scripts for ${targetName}\n// e.g. alert('test');\n// e.g. this.play(); this.x += 10;`;
    }
    return '// Keyframe script. Runs once when playhead enters this frame.\n// e.g. this.stop(); alert("test");';
  };

  const getHatBlockTitle = () => {
    if (isKeyframeScript) {
      return `⚡ When Playhead Enters Keyframe (Frame ${currentFrame + 1} / ${timeFormatted})`;
    }
    const name = selectedEl?.instanceName || selectedEl?.id || 'element';
    return `🖱️ When [${name}] -> ${selectedEvent}`;
  };

  const SCRIPT_CATEGORIES: ScriptBlockCategory[] = [
    'variables',
    'control',
    'events',
    'timeline',
    'navigation',
    'motion',
    'particles',
    'dialogs',
    'custom',
  ];

  // Filter block catalog by category
  const filteredCatalog =
    selectedCategory === 'all'
      ? BLOCK_CATALOG
      : BLOCK_CATALOG.filter((b) => b.category === selectedCategory);

  const categoryGroups = SCRIPT_CATEGORIES.map((catKey) => ({
    category: catKey,
    meta: CATEGORY_METADATA[catKey],
    items: filteredCatalog.filter((b) => b.category === catKey),
  })).filter((g) => g.items.length > 0);

  // Recursive Block Stack Renderer
  const renderBlockStack = (
    blockList: ScriptBlock[],
    parentBlockId?: string,
    branchKey?: string
  ): React.ReactNode => {
    return blockList.map((block, idx) => {
      const catalogItem = BLOCK_CATALOG.find((b) => b.type === block.type);
      const color = catalogItem?.color || '#3b82f6';
      const icon = catalogItem?.icon || '⚙️';
      const name = catalogItem?.name || block.type;

      const renderBlockActions = () => (
        <div className={styles.stackBlockActions}>
          <button
            type="button"
            className={styles.blockActionBtn}
            onClick={() => moveBlockInBranch(parentBlockId, branchKey, idx, -1)}
            disabled={idx === 0}
            title="Move Up"
          >
            ▲
          </button>
          <button
            type="button"
            className={styles.blockActionBtn}
            onClick={() => moveBlockInBranch(parentBlockId, branchKey, idx, 1)}
            disabled={idx === blockList.length - 1}
            title="Move Down"
          >
            ▼
          </button>
          <button
            type="button"
            className={styles.blockActionBtn}
            onClick={() => duplicateBlockInBranch(parentBlockId, branchKey, idx)}
            title="Duplicate Block"
          >
            ⧉
          </button>
          <button
            type="button"
            className={`${styles.blockActionBtn} ${styles.deleteActionBtn}`}
            onClick={() => removeBlockById(block.id)}
            title="Delete Block"
          >
            ✕
          </button>
        </div>
      );

      // Scratch C-Block & E-Block Clamps for Control Flow and Loops
      if (CLAMP_BLOCK_TYPES.has(block.type)) {
        const isLoop =
          block.type === 'for_each' ||
          block.type === 'repeat_times' ||
          block.type === 'while_loop' ||
          block.type === 'do_while';

        const primaryBranchKey = isLoop
          ? 'bodyBlocks'
          : block.type === 'switch_case'
          ? 'caseBlocks'
          : 'thenBlocks';
        const primaryNestedBlocks: ScriptBlock[] = Array.isArray(
          block.params[primaryBranchKey]
        )
          ? block.params[primaryBranchKey]
          : [];

        return (
          <div
            key={block.id}
            className={`${styles.clampBlock} ${
              !parentBlockId && draggedIdx === idx ? styles.stackBlockDragging : ''
            }`}
            style={{ '--clamp-color': color, backgroundColor: color } as any}
            draggable={!parentBlockId}
            onDragStart={(e) => !parentBlockId && handleDragStart(e, idx)}
            onDragOver={(e) => !parentBlockId && handleDragOver(e, idx)}
            onDrop={(e) => !parentBlockId && handleDrop(e, idx)}
          >
            {/* Clamp Header / Top Bar */}
            <div className={styles.clampHeader}>
              <div className={styles.clampHeaderLeft}>
                <span className={styles.clampIcon}>{icon}</span>

                {block.type === 'if_condition' && (
                  <>
                    <span className={styles.clampKeyword}>if</span>
                    <input
                      type="text"
                      className={styles.scratchPillInput}
                      style={{ width: 160 }}
                      value={block.params.condition ?? 'this.state.score >= 100'}
                      placeholder="condition"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'condition', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>then</span>
                  </>
                )}

                {block.type === 'if_else' && (
                  <>
                    <span className={styles.clampKeyword}>if</span>
                    <input
                      type="text"
                      className={styles.scratchPillInput}
                      style={{ width: 160 }}
                      value={block.params.condition ?? 'this.state.score >= 100'}
                      placeholder="condition"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'condition', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>then</span>
                  </>
                )}

                {block.type === 'switch_case' && (
                  <>
                    <span className={styles.clampKeyword}>switch</span>
                    <input
                      type="text"
                      className={styles.scratchPillInput}
                      style={{ width: 130 }}
                      value={block.params.expression ?? 'this.state.level'}
                      placeholder="expression"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'expression', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>case</span>
                    <input
                      type="text"
                      className={`${styles.scratchPillInput} ${styles.scratchShortPill}`}
                      value={block.params.case1 ?? '1'}
                      placeholder="val"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'case1', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>:</span>
                  </>
                )}

                {block.type === 'for_each' && (
                  <>
                    <span className={styles.clampKeyword}>for each</span>
                    <input
                      type="text"
                      className={`${styles.scratchPillInput} ${styles.scratchShortPill}`}
                      value={block.params.item ?? 'item'}
                      placeholder="item"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'item', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>in</span>
                    <input
                      type="text"
                      className={styles.scratchPillInput}
                      style={{ width: 140 }}
                      value={block.params.array ?? '[1, 2, 3]'}
                      placeholder="array / items"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'array', e.target.value)
                      }
                    />
                  </>
                )}

                {block.type === 'repeat_times' && (
                  <>
                    <span className={styles.clampKeyword}>repeat</span>
                    <input
                      type="number"
                      min={1}
                      className={styles.scratchNumberPill}
                      value={block.params.times ?? 5}
                      onChange={(e) =>
                        handleUpdateParam(
                          block.id,
                          'times',
                          parseInt(e.target.value, 10) || 1
                        )
                      }
                    />
                    <span className={styles.clampKeyword}>times (as</span>
                    <input
                      type="text"
                      className={`${styles.scratchPillInput} ${styles.scratchShortPill}`}
                      value={block.params.indexVar ?? 'i'}
                      placeholder="i"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'indexVar', e.target.value)
                      }
                    />
                    <span className={styles.clampKeyword}>)</span>
                  </>
                )}

                {block.type === 'while_loop' && (
                  <>
                    <span className={styles.clampKeyword}>while</span>
                    <input
                      type="text"
                      className={styles.scratchPillInput}
                      style={{ width: 160 }}
                      value={block.params.condition ?? 'this.x < 300'}
                      placeholder="condition"
                      onChange={(e) =>
                        handleUpdateParam(block.id, 'condition', e.target.value)
                      }
                    />
                  </>
                )}

                {block.type === 'do_while' && (
                  <>
                    <span className={styles.clampKeyword}>repeat (do)</span>
                  </>
                )}
              </div>

              {renderBlockActions()}
            </div>

            {/* Primary Mouth / Cavity */}
            <div className={styles.clampMouth}>
              <div className={styles.clampSpine} />
              <div className={styles.clampCavity}>
                <div className={styles.cavityBranchHeader}>
                  <span>
                    ↳{' '}
                    {isLoop
                      ? 'loop body'
                      : block.type === 'switch_case'
                      ? 'case action'
                      : 'then do'}
                    :
                  </span>
                </div>

                {/* Nested Blocks inside Cavity */}
                {primaryNestedBlocks.length > 0 && (
                  <div className={styles.nestedBlockStack}>
                    {renderBlockStack(primaryNestedBlocks, block.id, primaryBranchKey)}
                  </div>
                )}

                {/* Fallback text input if no nested blocks */}
                {primaryNestedBlocks.length === 0 && (
                  <input
                    type="text"
                    className={styles.scratchCavityInput}
                    value={
                      isLoop
                        ? block.params.body ?? ''
                        : block.type === 'switch_case'
                        ? block.params.action1 ?? 'this.gotoAndPlay(1);'
                        : block.params.thenAction ?? 'this.play();'
                    }
                    placeholder={
                      isLoop
                        ? 'loop body action or click + Loop / + Action below'
                        : 'then action or click + Loop / + Action below'
                    }
                    onChange={(e) => {
                      const key = isLoop
                        ? 'body'
                        : block.type === 'switch_case'
                        ? 'action1'
                        : 'thenAction';
                      handleUpdateParam(block.id, key, e.target.value);
                    }}
                  />
                )}

                {/* Quick Add Nested Block Buttons */}
                <div className={styles.addNestedBar}>
                  <button
                    type="button"
                    className={styles.addNestedBtn}
                    onClick={() => addNestedBlock(block.id, primaryBranchKey, 'repeat_times')}
                    title="Nest a loop inside this block"
                  >
                    + 🔁 Loop
                  </button>
                  <button
                    type="button"
                    className={styles.addNestedBtn}
                    onClick={() => addNestedBlock(block.id, primaryBranchKey, 'if_condition')}
                    title="Nest an if statement inside this block"
                  >
                    + ❓ If
                  </button>
                  <button
                    type="button"
                    className={styles.addNestedBtn}
                    onClick={() => addNestedBlock(block.id, primaryBranchKey, 'move_by')}
                    title="Nest a Move By motion block"
                  >
                    + ↔️ Move
                  </button>
                  <button
                    type="button"
                    className={styles.addNestedBtn}
                    onClick={() => addNestedBlock(block.id, primaryBranchKey, 'play')}
                    title="Nest Play action"
                  >
                    + ▶ Play
                  </button>
                  <select
                    className={styles.addNestedSelect}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addNestedBlock(
                          block.id,
                          primaryBranchKey,
                          e.target.value as ScriptBlockType
                        );
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="" disabled>
                      + Add any block...
                    </option>
                    <optgroup label="Loops & Control">
                      <option value="repeat_times">🔁 Repeat N Times</option>
                      <option value="while_loop">🔄 While Loop</option>
                      <option value="for_each">🔂 For Each</option>
                      <option value="do_while">🔃 Do While</option>
                      <option value="if_condition">❓ If Condition</option>
                      <option value="if_else">🔀 If ... Else</option>
                    </optgroup>
                    <optgroup label="Motion & Spawning">
                      <option value="move_by">↔️ Move By</option>
                      <option value="set_position">📍 Set Position</option>
                      <option value="rotate_by">🔄 Rotate By</option>
                      <option value="spawn_clip">🐣 Spawn Clip</option>
                    </optgroup>
                    <optgroup label="Variables & Events">
                      <option value="change_state_var">📦 Change Variable (+1)</option>
                      <option value="set_state_var">📦 Set Variable</option>
                      <option value="emit_custom_event">📡 Emit Custom Event</option>
                    </optgroup>
                    <optgroup label="Timeline & Actions">
                      <option value="play">▶ Play</option>
                      <option value="stop">⏸ Stop</option>
                      <option value="goto_and_play">⏩ Go to Frame & Play</option>
                      <option value="goto_and_stop">⏸ Go to Frame & Stop</option>
                      <option value="emit_particles">🎆 Emit Particles</option>
                      <option value="alert">💬 Alert</option>
                      <option value="console_log">📝 Console Log</option>
                      <option value="custom_js">⚡ Custom JS</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>

            {/* Middle Bar & Second Mouth for if_else */}
            {block.type === 'if_else' && (
              <>
                <div className={styles.clampMiddleBar}>
                  <span className={styles.clampKeyword}>else</span>
                </div>
                <div className={styles.clampMouth}>
                  <div className={styles.clampSpine} />
                  <div className={styles.clampCavity}>
                    <div className={styles.cavityBranchHeader}>
                      <span>↳ otherwise do:</span>
                    </div>
                    {Array.isArray(block.params.elseBlocks) &&
                    block.params.elseBlocks.length > 0 ? (
                      <div className={styles.nestedBlockStack}>
                        {renderBlockStack(
                          block.params.elseBlocks,
                          block.id,
                          'elseBlocks'
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className={styles.scratchCavityInput}
                        value={block.params.elseAction ?? 'this.stop();'}
                        placeholder="else action or click + Loop / + Action below"
                        onChange={(e) =>
                          handleUpdateParam(block.id, 'elseAction', e.target.value)
                        }
                      />
                    )}
                    <div className={styles.addNestedBar}>
                      <button
                        type="button"
                        className={styles.addNestedBtn}
                        onClick={() =>
                          addNestedBlock(block.id, 'elseBlocks', 'repeat_times')
                        }
                      >
                        + 🔁 Loop
                      </button>
                      <button
                        type="button"
                        className={styles.addNestedBtn}
                        onClick={() =>
                          addNestedBlock(block.id, 'elseBlocks', 'stop')
                        }
                      >
                        + ⏸ Stop
                      </button>
                      <select
                        className={styles.addNestedSelect}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            addNestedBlock(
                              block.id,
                              'elseBlocks',
                              e.target.value as ScriptBlockType
                            );
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="" disabled>
                          + Add any block...
                        </option>
                        <optgroup label="Loops & Control">
                          <option value="repeat_times">🔁 Repeat N Times</option>
                          <option value="while_loop">🔄 While Loop</option>
                          <option value="for_each">🔂 For Each</option>
                          <option value="if_condition">❓ If Condition</option>
                        </optgroup>
                        <optgroup label="Timeline & Motion">
                          <option value="stop">⏸ Stop</option>
                          <option value="play">▶ Play</option>
                          <option value="move_by">↔️ Move By</option>
                          <option value="spawn_clip">🐣 Spawn Clip</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Middle Bar & Second Mouth for switch_case */}
            {block.type === 'switch_case' && (
              <>
                <div className={styles.clampMiddleBar}>
                  <span className={styles.clampKeyword}>default:</span>
                </div>
                <div className={styles.clampMouth}>
                  <div className={styles.clampSpine} />
                  <div className={styles.clampCavity}>
                    <div className={styles.cavityBranchHeader}>
                      <span>↳ default action:</span>
                    </div>
                    {Array.isArray(block.params.defaultBlocks) &&
                    block.params.defaultBlocks.length > 0 ? (
                      <div className={styles.nestedBlockStack}>
                        {renderBlockStack(
                          block.params.defaultBlocks,
                          block.id,
                          'defaultBlocks'
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className={styles.scratchCavityInput}
                        value={block.params.defaultAction ?? 'this.stop();'}
                        placeholder="default action or click + Loop / + Action below"
                        onChange={(e) =>
                          handleUpdateParam(
                            block.id,
                            'defaultAction',
                            e.target.value
                          )
                        }
                      />
                    )}
                    <div className={styles.addNestedBar}>
                      <button
                        type="button"
                        className={styles.addNestedBtn}
                        onClick={() =>
                          addNestedBlock(block.id, 'defaultBlocks', 'repeat_times')
                        }
                      >
                        + 🔁 Loop
                      </button>
                      <button
                        type="button"
                        className={styles.addNestedBtn}
                        onClick={() =>
                          addNestedBlock(block.id, 'defaultBlocks', 'stop')
                        }
                      >
                        + ⏸ Stop
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Middle Bar for do_while */}
            {block.type === 'do_while' && (
              <div className={styles.clampMiddleBar}>
                <span className={styles.clampKeyword}>while</span>
                <input
                  type="text"
                  className={styles.scratchPillInput}
                  style={{ width: 160 }}
                  value={block.params.condition ?? 'this.x < 300'}
                  placeholder="condition"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'condition', e.target.value)
                  }
                />
              </div>
            )}

            {/* Bottom Foot Bar */}
            <div className={styles.clampFooter}>
              {isLoop && (
                <span className={styles.clampLoopArrow} title="Loop">
                  ↺
                </span>
              )}
            </div>
          </div>
        );
      }

      // Standard Stack Block
      return (
        <div
          key={block.id}
          className={`${styles.stackBlock} ${
            !parentBlockId && draggedIdx === idx ? styles.stackBlockDragging : ''
          }`}
          style={{ '--block-color': color, backgroundColor: color } as any}
          draggable={!parentBlockId}
          onDragStart={(e) => !parentBlockId && handleDragStart(e, idx)}
          onDragOver={(e) => !parentBlockId && handleDragOver(e, idx)}
          onDrop={(e) => !parentBlockId && handleDrop(e, idx)}
        >
          <div className={styles.stackBlockHeader}>
            <div className={styles.stackBlockTitleRow}>
              <span className={styles.stackBlockIcon}>{icon}</span>
              <span>{name}</span>
            </div>

            {renderBlockActions()}
          </div>

          {/* Inline Parameter Controls */}
          <div className={styles.stackBlockControls}>
            {block.type === 'alert' && (
              <>
                <span className={styles.paramLabel}>Alert message:</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  value={block.params.message ?? ''}
                  placeholder="Message to display"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'message', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'console_log' && (
              <>
                <span className={styles.paramLabel}>Log message:</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  value={block.params.message ?? ''}
                  placeholder="Message to log"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'message', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'stop' && (
              <span className={styles.paramLabel}>
                Stops timeline playback immediately
              </span>
            )}

            {block.type === 'play' && (
              <span className={styles.paramLabel}>
                Resumes timeline animation playback
              </span>
            )}

            {block.type === 'goto_and_play' && (
              <>
                <span className={styles.paramLabel}>Go to frame:</span>
                <input
                  type="number"
                  min={1}
                  className={styles.paramNumberInput}
                  value={block.params.frame ?? 1}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'frame',
                      parseInt(e.target.value, 10) || 1
                    )
                  }
                />
                <span className={styles.paramLabel}>and play</span>
              </>
            )}

            {block.type === 'goto_and_stop' && (
              <>
                <span className={styles.paramLabel}>Go to frame:</span>
                <input
                  type="number"
                  min={1}
                  className={styles.paramNumberInput}
                  value={block.params.frame ?? 1}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'frame',
                      parseInt(e.target.value, 10) || 1
                    )
                  }
                />
                <span className={styles.paramLabel}>and stop</span>
              </>
            )}

            {block.type === 'next_frame' && (
              <span className={styles.paramLabel}>Advance by 1 frame</span>
            )}

            {block.type === 'prev_frame' && (
              <span className={styles.paramLabel}>Step back by 1 frame</span>
            )}

            {block.type === 'wait_play' && (
              <>
                <span className={styles.paramLabel}>Wait</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className={styles.paramNumberInput}
                  value={block.params.seconds ?? 1}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'seconds',
                      parseFloat(e.target.value) || 1
                    )
                  }
                />
                <span className={styles.paramLabel}>sec, then play</span>
              </>
            )}

            {block.type === 'goto_artboard' && (
              <>
                <span className={styles.paramLabel}>Artboard:</span>
                <select
                  className={styles.paramSelect}
                  value={block.params.artboardId ?? ''}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'artboardId', e.target.value)
                  }
                >
                  <option value="">(Select Artboard)</option>
                  {artboards.map((ab: any) => (
                    <option key={ab.id} value={ab.id}>
                      {ab.name || ab.id}
                    </option>
                  ))}
                </select>
              </>
            )}

            {block.type === 'open_url' && (
              <>
                <span className={styles.paramLabel}>URL:</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  value={block.params.url ?? 'https://'}
                  placeholder="https://"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'url', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'move_by' && (
              <>
                <span className={styles.paramLabel}>ΔX:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.dx ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'dx', parseFloat(e.target.value) || 0)
                  }
                />
                <span className={styles.paramLabel}>ΔY:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.dy ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'dy', parseFloat(e.target.value) || 0)
                  }
                />
              </>
            )}

            {block.type === 'set_position' && (
              <>
                <span className={styles.paramLabel}>X:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.x ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'x', parseFloat(e.target.value) || 0)
                  }
                />
                <span className={styles.paramLabel}>Y:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.y ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'y', parseFloat(e.target.value) || 0)
                  }
                />
              </>
            )}

            {block.type === 'rotate_by' && (
              <>
                <span className={styles.paramLabel}>Rotate:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.degrees ?? 15}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'degrees',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <span className={styles.paramLabel}>deg</span>
              </>
            )}

            {block.type === 'set_rotation' && (
              <>
                <span className={styles.paramLabel}>Angle:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.degrees ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'degrees',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <span className={styles.paramLabel}>deg</span>
              </>
            )}

            {block.type === 'set_scale' && (
              <>
                <span className={styles.paramLabel}>Scale:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.percent ?? 100}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'percent',
                      parseFloat(e.target.value) || 100
                    )
                  }
                />
                <span className={styles.paramLabel}>%</span>
              </>
            )}

            {block.type === 'set_opacity' && (
              <>
                <span className={styles.paramLabel}>Opacity:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={styles.paramNumberInput}
                  value={block.params.percent ?? 100}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'percent',
                      parseFloat(e.target.value) || 100
                    )
                  }
                />
                <span className={styles.paramLabel}>%</span>
              </>
            )}

            {block.type === 'toggle_visible' && (
              <span className={styles.paramLabel}>Toggles show / hide</span>
            )}

            {block.type === 'set_visible' && (
              <>
                <span className={styles.paramLabel}>Visible:</span>
                <select
                  className={styles.paramSelect}
                  value={block.params.visible ? 'true' : 'false'}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'visible',
                      e.target.value === 'true'
                    )
                  }
                >
                  <option value="true">True (Show)</option>
                  <option value="false">False (Hide)</option>
                </select>
              </>
            )}

            {block.type === 'set_state_var' && (
              <>
                <span className={styles.paramLabel}>Set:</span>
                <input
                  type="text"
                  list="state-var-list"
                  className={styles.paramInput}
                  style={{ width: 85 }}
                  value={block.params.variable ?? 'score'}
                  placeholder="varName"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'variable', e.target.value)
                  }
                />
                <datalist id="state-var-list">
                  {(doc.stateVariables || []).map((v) => (
                    <option key={v.name} value={v.name} />
                  ))}
                </datalist>
                <span className={styles.paramLabel}>=</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  style={{ width: 85 }}
                  value={block.params.value ?? '100'}
                  placeholder="value"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'value', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'change_state_var' && (
              <>
                <span className={styles.paramLabel}>Change:</span>
                <input
                  type="text"
                  list="state-var-list"
                  className={styles.paramInput}
                  style={{ width: 85 }}
                  value={block.params.variable ?? 'score'}
                  placeholder="varName"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'variable', e.target.value)
                  }
                />
                <datalist id="state-var-list">
                  {(doc.stateVariables || []).map((v) => (
                    <option key={v.name} value={v.name} />
                  ))}
                </datalist>
                <span className={styles.paramLabel}>by:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.delta ?? 1}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'delta',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </>
            )}

            {block.type === 'emit_custom_event' && (
              <>
                <span className={styles.paramLabel}>Emit:</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  style={{ width: 100 }}
                  value={block.params.event ?? 'tumbleweed'}
                  placeholder="eventName"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'event', e.target.value)
                  }
                />
                <span className={styles.paramLabel}>Payload:</span>
                <input
                  type="text"
                  className={styles.paramCodeInput}
                  value={block.params.payload ?? ''}
                  placeholder="{ count: 1 } (optional)"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'payload', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'on_custom_event' && (
              <>
                <span className={styles.paramLabel}>On:</span>
                <input
                  type="text"
                  className={styles.paramInput}
                  style={{ width: 100 }}
                  value={block.params.event ?? 'tumbleweed'}
                  placeholder="eventName"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'event', e.target.value)
                  }
                />
                <span className={styles.paramLabel}>do:</span>
                <input
                  type="text"
                  className={styles.paramCodeInput}
                  value={block.params.action ?? 'this.play();'}
                  placeholder="action"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'action', e.target.value)
                  }
                />
              </>
            )}

            {block.type === 'spawn_clip' && (
              <>
                <span className={styles.paramLabel}>Spawn clip:</span>
                <input
                  type="text"
                  list="symbol-clip-list"
                  className={styles.paramInput}
                  style={{ width: 110 }}
                  value={block.params.clipName ?? ''}
                  placeholder="Clip name"
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'clipName', e.target.value)
                  }
                />
                <datalist id="symbol-clip-list">
                  {Object.keys(doc.library?.symbols || {}).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <span className={styles.paramLabel}>at X:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.x ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'x', parseFloat(e.target.value) || 0)
                  }
                />
                <span className={styles.paramLabel}>Y:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.y ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'y', parseFloat(e.target.value) || 0)
                  }
                />
              </>
            )}

            {block.type === 'emit_particles' && (
              <>
                <span className={styles.paramLabel}>Preset:</span>
                <select
                  className={styles.paramSelect}
                  value={block.params.preset ?? 'splat'}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'preset', e.target.value)
                  }
                >
                  <option value="splat">Splat (Bug/Impact)</option>
                  <option value="burst">Burst (Circle)</option>
                  <option value="confetti">Confetti (Celebration)</option>
                  <option value="sparks">Sparks (Electric)</option>
                  <option value="spray">Spray (Upward)</option>
                  <option value="stream">Stream (Continuous)</option>
                </select>
                <span className={styles.paramLabel}>X:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.x ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'x', parseFloat(e.target.value) || 0)
                  }
                />
                <span className={styles.paramLabel}>Y:</span>
                <input
                  type="number"
                  className={styles.paramNumberInput}
                  value={block.params.y ?? 0}
                  onChange={(e) =>
                    handleUpdateParam(block.id, 'y', parseFloat(e.target.value) || 0)
                  }
                />
                <span className={styles.paramLabel}>Count:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className={styles.paramNumberInput}
                  value={block.params.particleCount ?? 50}
                  onChange={(e) =>
                    handleUpdateParam(
                      block.id,
                      'particleCount',
                      parseInt(e.target.value, 10) || 50
                    )
                  }
                />
              </>
            )}

            {block.type === 'custom_js' && (
              <input
                type="text"
                className={styles.paramCodeInput}
                value={block.params.code ?? ''}
                placeholder="// JavaScript statement"
                onChange={(e) =>
                  handleUpdateParam(block.id, 'code', e.target.value)
                }
              />
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className={styles.actionsContainer}>
      <div className={styles.editorArea}>
        {/* Editor Toolbar (FIRST in DOM: eventSelect is matched by querySelector('select')) */}
        <div className={styles.editorToolbar}>
          <div className={styles.targetInfo}>
            <div className={styles.targetBadge}>{renderTargetBadge()}</div>

            <select
              className={styles.eventSelect}
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
            >
              {selectedEl && (
                <>
                  {eventOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Event: {opt.label}
                    </option>
                  ))}
                </>
              )}
              <option value="__keyframe__">
                ⚡ At Keyframe (Frame {currentFrame + 1} / {timeFormatted})
              </option>
            </select>
          </div>

          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={`${styles.codeToggleBtn} ${isCodeViewOpen ? styles.codeToggleBtnActive : ''}`}
              onClick={() => setIsCodeViewOpen(!isCodeViewOpen)}
              title={isCodeViewOpen ? 'Hide JavaScript Code (</>)' : 'Show JavaScript Code (</>)'}
              data-testid="toggle-code-view-btn"
            >
              <span className={styles.codeIconTag}>&lt;/&gt;</span>
              <span>{isCodeViewOpen ? 'Hide Code' : 'View Code'}</span>
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleFormat}
              title="Clean up trailing whitespace & re-format"
            >
              Format
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={handleApply}
              title="Compile & bind script (Ctrl+S)"
            >
              Apply Script
            </button>
          </div>
        </div>

        {/* 3-Column Visual Scratch & Code Layout */}
        <div className={styles.mainSplit}>
          {/* Column 1: Block Palette (Left) */}
          <div className={styles.paletteColumn}>
            <div className={styles.paletteHeader}>
              <span className={styles.paletteTitle}>Block Palette</span>
            </div>

            {/* Category Filter Tabs */}
            <div className={styles.categoryFilterBar}>
              <button
                type="button"
                className={`${styles.categoryTab} ${
                  selectedCategory === 'all' ? styles.categoryTabActive : ''
                }`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {SCRIPT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`${styles.categoryTab} ${
                    selectedCategory === cat ? styles.categoryTabActive : ''
                  }`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {CATEGORY_METADATA[cat].icon} {CATEGORY_METADATA[cat].name.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className={styles.paletteList}>
              {/* Accessible State Variables Section */}
              {(selectedCategory === 'all' || selectedCategory === 'variables') && (
                <div className={styles.variablesSection} data-testid="scripts-variables-section">
                  <div className={styles.variablesSectionHeader}>
                    <div className={styles.variablesSectionTitle}>
                      <span>📦</span>
                      <span>State & Variables</span>
                      <span className={styles.varCountBadge}>
                        {(doc.stateVariables || []).length}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.manageVarsBtn}
                      onClick={() => editorActions.setStateVariablesOpen(true)}
                      title="Open floating State & Variables window"
                      data-testid="scripts-open-state-window-btn"
                    >
                      Manage ↗
                    </button>
                  </div>

                  {(doc.stateVariables || []).length === 0 ? (
                    <div className={styles.emptyVarsNotice}>
                      <span>No shared variables defined yet.</span>
                      <button
                        type="button"
                        className={styles.quickAddVarBtn}
                        onClick={() => {
                          editorActions.addStateVariable({
                            name: 'score',
                            type: 'number',
                            defaultValue: 0,
                            isPublic: true,
                          });
                        }}
                      >
                        + Create "score" Variable
                      </button>
                    </div>
                  ) : (
                    <div className={styles.varPillList}>
                      {doc.stateVariables!.map((v) => {
                        const currentVal = doc.state?.[v.name] ?? v.defaultValue;
                        return (
                          <div key={v.id} className={styles.varPillCard} title={`this.state.${v.name}`}>
                            <div className={styles.varPillTop}>
                              <span className={styles.varPillName}>{v.name}</span>
                              <span className={styles.varPillType}>{v.type}</span>
                            </div>
                            <div className={styles.varPillBottom}>
                              <span className={styles.varPillValue}>= {String(currentVal)}</span>
                              <div className={styles.varPillActions}>
                                <button
                                  type="button"
                                  className={styles.varActionMiniBtn}
                                  onClick={() => handleAddBlock('set_state_var', { variable: v.name, value: String(currentVal) })}
                                  title={`Insert "this.state.${v.name} = ..."`}
                                >
                                  Set
                                </button>
                                {v.type === 'number' && (
                                  <button
                                    type="button"
                                    className={styles.varActionMiniBtn}
                                    onClick={() => handleAddBlock('change_state_var', { variable: v.name, delta: 1 })}
                                    title={`Insert "this.state.${v.name} += 1"`}
                                  >
                                    +1
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Prominent Custom JS Block Action */}
              <button
                type="button"
                className={styles.customJsBtn}
                onClick={() => handleAddBlock('custom_js', { code: "console.log('Custom JS');" })}
                title="Add custom JavaScript code block"
              >
                <span>⚡</span>
                <span>+ Custom JS Block</span>
              </button>

              {categoryGroups.map((group) => (
                <div key={group.category} className={styles.paletteGroup}>
                  <div className={styles.paletteGroupHeader} style={{ color: group.meta.color }}>
                    <span>{group.meta.icon}</span>
                    <span>{group.meta.name}</span>
                  </div>

                  {group.items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className={styles.blockPaletteCard}
                      onClick={() => handleAddBlock(item.type)}
                      title={`Add ${item.name} block`}
                      data-block-type={item.type}
                    >
                      <div
                        className={styles.blockColorStrip}
                        style={{ backgroundColor: item.color }}
                      />
                      <span className={styles.blockPaletteIcon}>{item.icon}</span>
                      <div className={styles.blockPaletteInfo}>
                        <span className={styles.blockPaletteName}>{item.name}</span>
                        <span className={styles.blockPaletteSummary}>{item.summary}</span>
                      </div>
                      <span className={styles.blockPaletteAddBadge} style={{ color: item.color }}>
                        + Add
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Scratch Block Stack Canvas (Center) */}
          <div className={styles.canvasColumn}>
            <div className={styles.canvasHeader}>
              <span className={styles.canvasTitle}>
                <span>🧩</span>
                <span>Script Block Stack</span>
              </span>
              <span className={styles.canvasCountBadge}>
                {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
              </span>
            </div>

            <div className={styles.canvasScroll}>
              {/* Scratch Hat Block */}
              <div className={styles.hatBlock}>
                <span className={styles.hatBlockIcon}>⚡</span>
                <span className={styles.hatBlockText}>{getHatBlockTitle()}</span>
              </div>

              {/* Block Stack Canvas */}
              {blocks.length === 0 ? (
                <div className={styles.emptyCanvas}>
                  <div className={styles.emptyCanvasIcon}>🧩</div>
                  <div className={styles.emptyCanvasText}>No action blocks in this stack</div>
                  <div className={styles.emptyCanvasSubtext}>
                    Click any block on the left to stack actions, or type custom JS on the right.
                  </div>
                </div>
              ) : (
                <div className={styles.blockStack}>
                  {renderBlockStack(blocks)}
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Live Code Editor (Right) - Toggleable with </> */}
          {isCodeViewOpen && (
            <div className={styles.codeColumn} data-testid="scripts-code-column">
              <div className={styles.codeColumnHeader}>
                <span className={styles.syncBadge}>
                  <span>✓</span>
                  <span>Synced with Blocks</span>
                </span>
                <span className={styles.statusContext}>JavaScript (ESM)</span>
              </div>

              <div className={styles.codeEditorContainer}>
                <div className={styles.lineNumbers} ref={lineNumbersRef}>
                  {lineNumbers.map((num) => (
                    <div key={num} className={styles.lineNumber}>
                      {num}
                    </div>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  className={styles.codeTextarea}
                  value={codeDraft}
                  placeholder={getPlaceholderText()}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onBlur={handleBlur}
                  onScroll={handleScroll}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </div>

        {/* Status / feedback footer */}
        <div className={styles.statusBar}>
          <span className={styles.statusContext}>
            Runtime: Native ES Module · Scope: <code>this</code> ={' '}
            {!isKeyframeScript ? 'DisplayObject / MovieClip' : 'Root Timeline'}
          </span>
          {statusMsg && (
            <span
              className={`${styles.statusMessage} ${
                statusMsg.isError ? styles.statusError : styles.statusSuccess
              }`}
            >
              {statusMsg.isError ? '✕ ' : '✓ '}
              {statusMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
