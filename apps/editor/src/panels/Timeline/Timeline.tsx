import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Repeat,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Type,
  Square,
  Component,
  Plus,
} from 'lucide-react';
import {
  useEditorStore,
  editorActions,
  getActiveTimeline,
  computeTotalTimelineDuration,
  computeTotalTimelineFrames,
  formatTimeInSeconds,
  formatTimecode,
  getKeyframeTime,
  getKeyframeDurationTime,
  findKeyframeAtTime,
  type EditorLayer,
  type EditorKeyframe,
  type EditorElement,
} from '../../state/editorStore';
import { LayerFiltersManager } from '../Layers/Layers';
import styles from './Timeline.module.css';

const PIXELS_PER_SECOND = 120; // 120px = 1.0s, 60px = 0.5s, 12px = 0.1s
const TRACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export type SceneItem =
  | {
      type: 'layer';
      layer: EditorLayer;
      depth: number;
      isFolder: boolean;
      isCollapsed: boolean;
      hasChildren: boolean;
    }
  | {
      type: 'element';
      element: EditorElement;
      layer: EditorLayer;
      depth: number;
    };

function getElementIcon(el: EditorElement): React.ReactNode {
  if (el.type === 'shape') return <Square size={12} />;
  if (el.type === 'text') return <Type size={12} />;
  if (el.type === 'instance') return <Component size={12} />;
  return <Square size={12} />;
}

function getElementLabel(el: EditorElement, librarySymbols: Record<string, any>): string {
  if (el.instanceName) return el.instanceName;
  if (el.type === 'shape') {
    if (el.id.startsWith('rect_')) return 'Rectangle';
    if (el.id.startsWith('oval_')) return 'Oval';
    return 'Shape';
  }
  if (el.type === 'text') {
    const txt = (el as any).text;
    if (txt) {
      return txt.length > 12 ? `"${txt.slice(0, 12)}..."` : `"${txt}"`;
    }
    return 'Text';
  }
  if (el.type === 'instance') {
    const sym = librarySymbols[(el as any).symbolId];
    return sym?.name ? `❖ ${sym.name}` : '❖ Component';
  }
  return el.type || 'Element';
}

export const Timeline: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectedFrameIndex = useEditorStore((s) => s.selectedFrameIndex);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const currentTime = useEditorStore((s) => s.currentTime ?? s.currentFrame / (s.doc.stage.fps || 24));
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const loopMode = useEditorStore((s) => s.loopMode);
  const isolationStack = useEditorStore((s) => s.isolationStack);

  const activeTl = getActiveTimeline(doc, isolationStack);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState('');
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [elNameDraft, setElNameDraft] = useState('');
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [filterLayerId, setFilterLayerId] = useState<string | null>(null);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverElementId, setDragOverElementId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  // Modern Looping popover / custom count state
  const [isLoopMenuOpen, setIsLoopMenuOpen] = useState(false);
  const [customLoopInput, setCustomLoopInput] = useState<string>(
    typeof loopMode === 'number' ? String(loopMode) : '3'
  );
  const loopControlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof loopMode === 'number') {
      setCustomLoopInput(String(loopMode));
    }
  }, [loopMode]);

  useEffect(() => {
    if (!isLoopMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (loopControlRef.current && !loopControlRef.current.contains(e.target as Node)) {
        setIsLoopMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLoopMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoopMenuOpen]);

  // Real-time browser display performance monitor
  const [browserFps, setBrowserFps] = useState<number>(60);
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let handle: number;
    const loop = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        setBrowserFps(Math.max(1, Math.round((frameCount * 1000) / (now - lastTime))));
        frameCount = 0;
        lastTime = now;
      }
      if (typeof requestAnimationFrame !== 'undefined') {
        handle = requestAnimationFrame(loop);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      handle = requestAnimationFrame(loop);
    }
    return () => {
      if (typeof cancelAnimationFrame !== 'undefined' && handle) {
        cancelAnimationFrame(handle);
      }
    };
  }, []);

  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Infinite timeline canvas with dynamic expansion
  const fps = doc.stage.fps || 24;
  const totalDurationSec = computeTotalTimelineDuration(activeTl, fps);
  const maxGridSeconds = Math.max(60.0, totalDurationSec + 10.0);
  const numSteps = Math.ceil(maxGridSeconds / 0.1);
  const stepIndices = Array.from({ length: numSteps }, (_, i) => i);
  const timelineWidth = numSteps * 12;

  const currentTimecode = formatTimeInSeconds(currentTime);
  const totalTimecode = formatTimeInSeconds(totalDurationSec);
  const totalDurationSeconds = totalDurationSec.toFixed(1);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Build unified Scene Graph: Folders, Layers, and their Child Elements
  const visibleItems: SceneItem[] = [];
  const processedLayerIds = new Set<string>();

  const addLayerWithElements = (layer: EditorLayer, depth: number) => {
    const isFolder = layer.kind === 'folder';
    const isCollapsed = collapsedFolderIds.has(layer.id);
    const childLayers = isFolder ? activeTl.layers.filter((c) => c.parentLayerId === layer.id) : [];

    // Persistent elements registry for this layer across all keyframes
    // Elements persist across time in the scene graph so keyframes can be added at any timestamp
    const allLayerElements = Array.from(
      new Map(layer.keyframes.flatMap((k) => k.elements).map((e) => [e.id, e])).values()
    );
    const elements = allLayerElements;

    const hasChildren = childLayers.length > 0 || elements.length > 0;

    visibleItems.push({
      type: 'layer',
      layer,
      depth,
      isFolder,
      isCollapsed,
      hasChildren,
    });
    processedLayerIds.add(layer.id);

    if (!isCollapsed) {
      // 1. Child layers inside this folder
      for (const child of childLayers) {
        addLayerWithElements(child, depth + 1);
      }

      // 2. Elements belonging to this layer
      for (const el of elements) {
        visibleItems.push({
          type: 'element',
          element: el,
          layer,
          depth: depth + 1,
        });
      }
    }
  };

  const topLevelLayers = activeTl.layers.filter((l) => !l.parentLayerId);
  for (const l of topLevelLayers) {
    addLayerWithElements(l, 0);
  }

  for (const l of activeTl.layers) {
    if (!processedLayerIds.has(l.id)) {
      addLayerWithElements(l, 0);
    }
  }

  const seekFromClientX = (clientX: number) => {
    if (!headerRef.current) return;
    const rect = headerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const targetTime = Math.max(0, x / PIXELS_PER_SECOND);
    editorActions.setPlayheadTime(targetTime);
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return;
    setIsScrubbing(true);
    seekFromClientX(e.clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        seekFromClientX(e.clientX);
      }
    };
    const handleMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
      }
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing]);

  const handleStartRenameLayer = (layer: EditorLayer) => {
    setEditingLayerId(layer.id);
    setLayerNameDraft(layer.name);
  };

  const handleSaveRenameLayer = (layerId: string) => {
    if (editingLayerId === layerId) {
      if (layerNameDraft.trim()) {
        editorActions.renameLayer(layerId, layerNameDraft.trim());
      }
      setEditingLayerId(null);
    }
  };

  const handleStartRenameElement = (el: EditorElement) => {
    setEditingElId(el.id);
    setElNameDraft(getElementLabel(el, doc.library.symbols));
  };

  const handleSaveRenameElement = (elId: string) => {
    if (editingElId === elId) {
      if (elNameDraft.trim()) {
        editorActions.renameElement(elId, elNameDraft.trim());
      }
      setEditingElId(null);
    }
  };

  const handleTimelineContextMenu = (
    e: React.MouseEvent,
    layerId?: string,
    timeOrFrame?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const targetLayerId = layerId ?? selectedLayerId ?? activeTl.layers[0]?.id;
    const targetTime = typeof timeOrFrame === 'number' ? timeOrFrame : currentTime;
    if (layerId) {
      editorActions.setSelectedTime(layerId, targetTime);
    }

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Insert Keyframe',
          shortcut: 'F6',
          action: () => editorActions.insertKeyframe(targetLayerId, targetTime),
        },
        {
          label: 'Insert Blank Keyframe',
          shortcut: 'F7',
          action: () => editorActions.insertBlankKeyframe(targetLayerId, Math.round(targetTime * fps)),
        },
        {
          label: 'Insert Frame',
          shortcut: 'F5',
          action: () => editorActions.insertFrame(targetLayerId, Math.round(targetTime * fps)),
        },
        {
          label: 'Remove Frame',
          shortcut: 'Shift+F5',
          action: () => editorActions.removeFrame(targetLayerId, Math.round(targetTime * fps)),
        },
        { separator: true },
        {
          label: 'Create Motion Tween',
          action: () => {
            if (targetLayerId) editorActions.createMotionTween(targetLayerId, targetTime);
          },
        },
        {
          label: 'Clear Tween',
          action: () => {
            if (targetLayerId) editorActions.removeTween(targetLayerId, targetTime);
          },
        },
        { separator: true },
        {
          label: 'Add Layer',
          action: () => editorActions.addLayer(),
        },
        {
          label: 'Add Folder (Group)',
          action: () => editorActions.addFolder(),
        },
        {
          label: 'Delete Layer',
          danger: true,
          disabled: activeTl.layers.length <= 1,
          action: () => {
            if (targetLayerId) editorActions.deleteLayer(targetLayerId);
          },
        },
      ],
    });
  };

  const activeFilterLayer = filterLayerId
    ? activeTl.layers.find((l) => l.id === filterLayerId)
    : null;

  return (
    <div className={styles.timelinePanel}>
      <div className={styles.timelineBody}>
        {/* Left Column: Unified Scene Graph (Folders, Layers, Elements) */}
        <div className={styles.layersColumn}>
          <div className={styles.layersHeader}>
            <span>Scene Graph & Tracks</span>
            <div className={styles.layerActionIcons}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Add Folder (Group)"
                onClick={() => editorActions.addFolder()}
              >
                📁+
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Add New Layer"
                onClick={() => editorActions.addLayer()}
              >
                +
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Delete Selected Layer"
                disabled={activeTl.layers.length <= 1}
                onClick={() => {
                  if (selectedLayerId) editorActions.deleteLayer(selectedLayerId);
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {visibleItems.map((item, idx) => {
            if (item.type === 'layer') {
              const { layer, depth, isFolder, isCollapsed, hasChildren } = item;
              const isSelected = layer.id === selectedLayerId;
              const trackColor = TRACK_COLORS[idx % TRACK_COLORS.length];
              const filterCount = layer.filters?.length ?? 0;
              const isDragOver = dragOverFolderId === layer.id;

              let rowClass = styles.layerRow;
              if (isSelected) rowClass += ` ${styles.selected}`;
              if (isFolder) rowClass += ` ${styles.folderRow}`;
              if (depth > 0) rowClass += ` ${styles.childLayerRow}`;
              if (isDragOver) rowClass += ` ${styles.dragOver}`;

              return (
                <div
                  key={layer.id}
                  className={rowClass}
                  style={{ paddingLeft: `${depth * 14}px` }}
                  onClick={() => editorActions.selectLayer(layer.id)}
                  onDoubleClick={() => handleStartRenameLayer(layer)}
                  onContextMenu={(e) => handleTimelineContextMenu(e, layer.id, currentTime)}
                  onDragOver={(e) => {
                    if (draggedElementId) {
                      e.preventDefault();
                      setDragOverFolderId(layer.id);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverFolderId(null);
                  }}
                  onDrop={(e) => {
                    if (draggedElementId) {
                      e.preventDefault();
                      editorActions.moveElementToLayer(draggedElementId, layer.id);
                      setDraggedElementId(null);
                      setDragOverFolderId(null);
                    }
                  }}
                >
                  {/* Track Color Strip */}
                  <div className={styles.layerColorStrip} style={{ backgroundColor: trackColor }} />

                  {/* Expand / collapse chevron (▾ / ▸) */}
                  {hasChildren ? (
                    <div
                      className={styles.folderChevron}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolder(layer.id);
                      }}
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </div>
                  ) : (
                    <div style={{ width: 16 }} />
                  )}

                  {/* Track Icon: Folder for Group, Layers for Layer Track */}
                  {isFolder ? (
                    <span className={styles.folderIcon} title="Folder Group">
                      {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                    </span>
                  ) : (
                    <span className={styles.layerIcon} title="Layer Track">
                      <Layers size={13} />
                    </span>
                  )}

                  {/* Track Name */}
                  {editingLayerId === layer.id ? (
                    <input
                      type="text"
                      className={styles.layerNameInput}
                      autoFocus
                      value={layerNameDraft}
                      onChange={(e) => setLayerNameDraft(e.target.value)}
                      onBlur={() => handleSaveRenameLayer(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRenameLayer(layer.id);
                        if (e.key === 'Escape') setEditingLayerId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.layerNameInput} title={layer.name}>
                      {layer.name}
                    </span>
                  )}

                  {/* Track Controls: fx, Visibility, Lock */}
                  <div className={styles.layerToggles}>
                    <button
                      type="button"
                      className={`${styles.fxBtn} ${filterCount > 0 ? styles.active : ''}`}
                      title={
                        filterCount > 0
                          ? `${filterCount} CSS Filter(s) applied - Click to edit`
                          : 'Add CSS Layer Filters'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilterLayerId(filterLayerId === layer.id ? null : layer.id);
                      }}
                    >
                      fx{filterCount > 0 ? ` ${filterCount}` : ''}
                    </button>

                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${layer.visible ? styles.active : ''}`}
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      onClick={(e) => {
                        e.stopPropagation();
                        editorActions.toggleLayerVisibility(layer.id);
                      }}
                    >
                      {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>

                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${layer.locked ? styles.active : ''}`}
                      title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                      onClick={(e) => {
                        e.stopPropagation();
                        editorActions.toggleLayerLock(layer.id);
                      }}
                    >
                      {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                </div>
              );
            }

            // Element Row in Scene Graph
            const { element, layer, depth } = item;
            const isSelected = selectedElementIds.includes(element.id);
            const isLocked = Boolean((element as any).locked);
            const isVisible = element.visible !== false;
            const label = getElementLabel(element, doc.library.symbols);
            const icon = getElementIcon(element);

            let elRowClass = styles.elementRow;
            if (isSelected) elRowClass += ` ${styles.selected}`;

            const isDragTarget = dragOverElementId === element.id;

            return (
              <div
                key={element.id}
                className={elRowClass}
                style={{
                  paddingLeft: `${depth * 14 + 18}px`,
                  borderTop: isDragTarget && dragOverPosition === 'before' ? '2px solid var(--mx-accent, #3b82f6)' : undefined,
                  borderBottom: isDragTarget && dragOverPosition === 'after' ? '2px solid var(--mx-accent, #3b82f6)' : undefined,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', element.id);
                  setDraggedElementId(element.id);
                }}
                onDragOver={(e) => {
                  if (draggedElementId && draggedElementId !== element.id) {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const pos = e.clientY < midY ? 'before' : 'after';
                    setDragOverElementId(element.id);
                    setDragOverPosition(pos);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverElementId === element.id) {
                    setDragOverElementId(null);
                    setDragOverPosition(null);
                  }
                }}
                onDrop={(e) => {
                  if (draggedElementId && draggedElementId !== element.id) {
                    e.preventDefault();
                    const pos = dragOverPosition || 'after';
                    editorActions.reorderElement(draggedElementId, element.id, pos);
                    setDraggedElementId(null);
                    setDragOverElementId(null);
                    setDragOverPosition(null);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  editorActions.selectElement(element.id, e.shiftKey || e.metaKey || e.ctrlKey);
                  editorActions.selectLayer(layer.id);
                }}
                onDoubleClick={() => handleStartRenameElement(element)}
                title={`Element: ${label} (Drag up/down to reorder Z-index, or drop on another layer)`}
              >
                {/* Element Icon: Shape ⬡, Text T, Group 📁, Instance 📦 */}
                <span className={styles.elementIcon}>{icon}</span>

                {/* Element Name (editable on double click) */}
                {editingElId === element.id ? (
                  <input
                    type="text"
                    className={styles.elementName}
                    autoFocus
                    value={elNameDraft}
                    onChange={(e) => setElNameDraft(e.target.value)}
                    onBlur={() => handleSaveRenameElement(element.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRenameElement(element.id);
                      if (e.key === 'Escape') setEditingElId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.elementName}>{label}</span>
                )}

                {/* Element Controls: Visibility Eye, Lock Toggle */}
                <div className={styles.layerToggles}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${isVisible ? styles.active : ''}`}
                    title={isVisible ? 'Hide Element' : 'Show Element'}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorActions.toggleElementVisibility(element.id);
                    }}
                  >
                    {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>

                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${isLocked ? styles.active : ''}`}
                    title={isLocked ? 'Unlock Element' : 'Lock Element'}
                    onClick={(e) => {
                      e.stopPropagation();
                      editorActions.toggleElementLock(element.id);
                    }}
                  >
                    {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* CSS Filters Popover */}
        {activeFilterLayer && (
          <div className={styles.filtersPopover}>
            <div className={styles.filtersPopoverHeader}>
              <span>Layer Filters: {activeFilterLayer.name}</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setFilterLayerId(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <LayerFiltersManager layer={activeFilterLayer} />
          </div>
        )}

        {/* Right Column: Time Ruler & Keyframe Tracks */}
        <div className={styles.gridScrollContainer} ref={scrollContainerRef}>
          <div
            className={styles.gridWrapper}
            style={{ width: `${maxGridSeconds * PIXELS_PER_SECOND}px` }}
          >
            {/* Header: Continuous Time Ruler in Seconds & Timecodes (0.0s, 0.5s, 1.0s, 1.5s, 2.0s) */}
            <div
              className={styles.frameHeaderRow}
              ref={headerRef}
              onMouseDown={handleHeaderMouseDown}
              onContextMenu={(e) => handleTimelineContextMenu(e)}
            >
              {stepIndices.map((stepIdx) => {
                const t = stepIdx * 0.1;
                const isSecMajor = stepIdx % 10 === 0;
                const isSubMajor = !isSecMajor && stepIdx % 5 === 0;

                let cellClass = styles.frameHeaderCell;
                if (isSecMajor) cellClass += ` ${styles.majorTick}`;
                else if (isSubMajor) cellClass += ` ${styles.subMajorTick}`;

                return (
                  <div key={stepIdx} className={cellClass}>
                    {isSecMajor ? (
                      <>
                        <div className={styles.tickMarkMajor} />
                        <span className={styles.timeCodeLabel}>{t.toFixed(1)}s</span>
                      </>
                    ) : isSubMajor ? (
                      <>
                        <div className={styles.tickMarkSmall} />
                        <span className={styles.timeCodeLabel}>{t.toFixed(1)}s</span>
                      </>
                    ) : (
                      <div className={styles.tickMarkTiny} />
                    )}
                  </div>
                );
              })}

              {/* Red DAW playhead marker at continuous currentTime */}
              <div
                className={styles.playheadHead}
                style={{
                  left: `${currentTime * PIXELS_PER_SECOND}px`,
                }}
              >
                ▼
              </div>
            </div>

            {/* Red playhead vertical line */}
            <div
              className={styles.playheadLine}
              style={{
                left: `${currentTime * PIXELS_PER_SECOND}px`,
              }}
            />

            {/* Track rows corresponding 1-to-1 with visible Scene Graph items */}
            {visibleItems.map((item) => {
              if (item.type === 'layer') {
                const { layer } = item;
                const sortedKfs = [...layer.keyframes].sort(
                  (a, b) => getKeyframeTime(a, fps) - getKeyframeTime(b, fps)
                );

                return (
                  <div
                    key={layer.id}
                    className={styles.gridRow}
                    style={{ width: `${timelineWidth}px` }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickTime = Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND);
                      editorActions.setSelectedTime(layer.id, clickTime);
                    }}
                    onContextMenu={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickTime = Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND);
                      handleTimelineContextMenu(e, layer.id, clickTime);
                    }}
                  >
                    {/* Keyframe spans, tweens, and diamond markers */}
                    {sortedKfs.map((kf, kfIdx) => {
                      const kfTime = getKeyframeTime(kf, fps);
                      const kfDur = getKeyframeDurationTime(kf, fps);
                      const isTween = kf.tween?.type === 'motion';
                      const nextKf = sortedKfs[kfIdx + 1];
                      const nextKfTime = nextKf ? getKeyframeTime(nextKf, fps) : kfTime + kfDur;
                      const spanWidth = Math.max(
                        8,
                        (isTween ? nextKfTime - kfTime : kfDur) * PIXELS_PER_SECOND
                      );

                      return (
                        <React.Fragment key={kf.id}>
                          {/* Span / Tween band */}
                          <div
                            style={{
                              position: 'absolute',
                              left: `${kfTime * PIXELS_PER_SECOND}px`,
                              width: `${spanWidth}px`,
                              top: 2,
                              bottom: 2,
                              backgroundColor: isTween
                                ? 'rgba(37, 99, 235, 0.35)'
                                : 'rgba(255, 255, 255, 0.06)',
                              borderTop: isTween ? '1px solid rgba(56, 189, 248, 0.4)' : undefined,
                              borderBottom: isTween ? '1px solid rgba(56, 189, 248, 0.4)' : undefined,
                              borderRadius: 2,
                              pointerEvents: 'none',
                            }}
                          >
                            {isTween && (
                              <>
                                <div className={styles.tweenArrow} />
                                <div className={styles.tweenArrowHead} />
                              </>
                            )}
                            {!isTween && <div className={styles.spanEndBar} />}
                          </div>

                          {/* Diamond Keyframe Marker (◆) */}
                          <div
                            style={{
                              position: 'absolute',
                              left: `${kfTime * PIXELS_PER_SECOND - 3}px`,
                              top: 10,
                              cursor: 'pointer',
                            }}
                            title={`Keyframe at ${kfTime.toFixed(2)}s`}
                          >
                            {kf.elements.length > 0 || kf.transform || layer.kind === 'folder' ? (
                              <div className={styles.diamondKeyframe} />
                            ) : (
                              <div className={styles.diamondBlankKeyframe} />
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              }

              // Element sub-track row
              const { element, layer } = item;
              const matchingKfs = layer.keyframes.filter((kf) =>
                kf.elements.some((e) => e.id === element.id)
              );

              return (
                <div
                  key={element.id}
                  className={styles.gridElementRow}
                  style={{ width: `${timelineWidth}px` }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickTime = Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND);
                    editorActions.selectElement(element.id);
                    editorActions.setSelectedTime(layer.id, clickTime);
                  }}
                >
                  {/* Element diamond keyframes */}
                  {matchingKfs.map((kf, kIdx) => {
                    const kfTime = getKeyframeTime(kf, fps);
                    const isTween = kf.tween?.type === 'motion';
                    const nextKf = matchingKfs[kIdx + 1];
                    const nextKfTime = nextKf
                      ? getKeyframeTime(nextKf, fps)
                      : kfTime + getKeyframeDurationTime(kf, fps);
                    const spanWidth = Math.max(6, (nextKfTime - kfTime) * PIXELS_PER_SECOND);

                    return (
                      <React.Fragment key={kf.id}>
                        {isTween && (
                          <div
                            style={{
                              position: 'absolute',
                              left: `${kfTime * PIXELS_PER_SECOND}px`,
                              width: `${spanWidth}px`,
                              top: 2,
                              bottom: 2,
                              backgroundColor: 'rgba(56, 189, 248, 0.25)',
                              borderTop: '1px solid rgba(56, 189, 248, 0.4)',
                              borderBottom: '1px solid rgba(56, 189, 248, 0.4)',
                              borderRadius: 2,
                              pointerEvents: 'none',
                            }}
                          >
                            <div className={styles.tweenArrow} />
                            <div className={styles.tweenArrowHead} />
                          </div>
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            left: `${kfTime * PIXELS_PER_SECOND - 3}px`,
                            top: 8,
                          }}
                          title={`Element Keyframe at ${kfTime.toFixed(2)}s`}
                        >
                          <div className={styles.diamondKeyframe} />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer: Transport, Modern Timecode & Real-Time Performance Monitor */}
      <div className={styles.timelineFooter}>
        {/* Transport buttons */}
        <div className={styles.transportButtons}>
          <button
            type="button"
            className={styles.transportBtn}
            onClick={() => editorActions.rewind()}
            title="Rewind (Home)"
          >
            <SkipBack size={12} />
          </button>
          <button
            type="button"
            className={styles.transportBtn}
            onClick={() => editorActions.stepBackward()}
            title="Step Back (<)"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            className={`${styles.transportBtn} ${isPlaying ? styles.playActive : ''}`}
            onClick={() => editorActions.togglePlay()}
            title="Play / Pause (Space / Enter)"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
          </button>
          <button
            type="button"
            className={styles.transportBtn}
            onClick={() => editorActions.stepForward()}
            title="Step Forward (>)"
          >
            <SkipForward size={12} />
          </button>
        </div>

        {/* Simplified Looping Controls: Infinite (0) or positive count */}
        <div className={styles.loopControlGroup} ref={loopControlRef}>
          <button
            type="button"
            className={`${styles.loopToggleBtn} ${loopMode === 'infinite' ? styles.active : ''}`}
            onClick={() => editorActions.toggleLoopMode()}
            onContextMenu={(e) => {
              e.preventDefault();
              setIsLoopMenuOpen((prev) => !prev);
            }}
            title="Loop playback: 0 is Infinite, or any positive number (Click to toggle ∞, ▾ to set count)"
          >
            <Repeat size={12} className={styles.loopIcon} />
            <span>
              {loopMode === 'infinite'
                ? 'Loop: ∞'
                : loopMode === 1
                ? 'Loop: 1'
                : `Loop: ${loopMode}`}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.loopMenuTrigger} ${isLoopMenuOpen ? styles.open : ''}`}
            onClick={() => setIsLoopMenuOpen((prev) => !prev)}
            title="Set loop count: 0 for infinite, or positive number"
            aria-label="Loop Count Settings"
          >
            <ChevronDown size={11} />
          </button>

          {isLoopMenuOpen && (
            <div className={styles.loopDropdown} role="dialog" aria-label="Loop Count Settings">
              <div className={styles.loopDropdownHeader}>Loop Playback</div>
              <div className={styles.loopCustomRow}>
                <label htmlFor="custom-loop-count" className={styles.customInputLabel}>
                  Count:
                </label>
                <input
                  id="custom-loop-count"
                  type="number"
                  min="0"
                  max="999"
                  className={styles.customCountInput}
                  value={loopMode === 'infinite' ? '0' : customLoopInput}
                  onChange={(e) => setCustomLoopInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = parseInt(customLoopInput, 10);
                      if (!isNaN(val)) {
                        if (val <= 0) {
                          editorActions.setLoopMode('infinite');
                        } else {
                          editorActions.setLoopMode(val);
                        }
                        setIsLoopMenuOpen(false);
                      }
                    }
                  }}
                  placeholder="0 = ∞"
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.customCountApplyBtn}
                  onClick={() => {
                    const val = parseInt(customLoopInput, 10);
                    if (!isNaN(val)) {
                      if (val <= 0) {
                        editorActions.setLoopMode('infinite');
                      } else {
                        editorActions.setLoopMode(val);
                      }
                      setIsLoopMenuOpen(false);
                    }
                  }}
                >
                  Set
                </button>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: 4, padding: '0 2px' }}>
                0 = Infinite (∞)
              </div>
            </div>
          )}
        </div>

        {/* Modern Timecode Displays */}
        <div className={styles.timecodeGroup}>
          <span className={styles.timecodeCurrent} title="Current Playhead (MM:SS.mmm)">
            {currentTimecode} ({currentTime.toFixed(3)}s)
          </span>
          <span className={styles.timecodeTotal} title="Total Animation Length">
            Total: {totalTimecode} ({totalDurationSeconds}s)
          </span>
        </div>

        {/* Real-time browser performance monitor */}
        <div className={styles.statusItem} title="Real-time display performance monitor">
          <span className={styles.statusLabel}>Display:</span>
          <span>{browserFps} FPS</span>
        </div>

        {/* Quick Action Pills */}
        <div className={styles.actionPills}>
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={() => editorActions.addFolder()}
            title="Create Folder Track (Group)"
          >
            <FolderPlus size={12} />
            <span>Folder</span>
          </button>
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={() => editorActions.addLayer()}
            title="Create Layer Track"
          >
            <Plus size={12} />
            <span>Layer</span>
          </button>
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={() => editorActions.insertKeyframe()}
            title="Insert Keyframe at current timestamp (F6)"
          >
            <Plus size={12} />
            <span>Keyframe (F6)</span>
          </button>
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={() => editorActions.insertBlankKeyframe()}
            title="Insert Blank Keyframe (F7)"
          >
            <Plus size={12} />
            <span>Blank (F7)</span>
          </button>
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={() => {
              const target = selectedLayerId ?? activeTl.layers[0]?.id;
              if (target) {
                editorActions.createMotionTween(target, currentTime);
              }
            }}
            title="Create Fluid Motion Tween"
          >
            <Sparkles size={12} />
            <span>Tween</span>
          </button>
        </div>
      </div>
    </div>
  );
};
