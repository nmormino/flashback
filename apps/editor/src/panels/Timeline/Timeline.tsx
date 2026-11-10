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
      type: 'folder';
      layer: EditorLayer;
      depth: number;
      isCollapsed: boolean;
      hasChildren: boolean;
    }
  | {
      type: 'track';
      layer: EditorLayer;
      element?: EditorElement;
      depth: number;
    }
  | {
      type: 'multiElementLayer';
      layer: EditorLayer;
      depth: number;
      isCollapsed: boolean;
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
  const keyframeClipboard = useEditorStore((s) => s.keyframeClipboard);

  const activeTl = getActiveTimeline(doc, isolationStack);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState('');
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [elNameDraft, setElNameDraft] = useState('');
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [filterLayerId, setFilterLayerId] = useState<string | null>(null);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverElementId, setDragOverElementId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  // Keyframe Dragging state
  const [draggingKf, setDraggingKf] = useState<{
    layerId: string;
    kfId: string;
    startFrame: number;
    currentFrame: number;
    elementId?: string;
  } | null>(null);

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

  // Live playback script execution hook
  const prevTimeRef = useRef<number>(currentTime);
  const isFirstTickRef = useRef<boolean>(true);

  useEffect(() => {
    if (!isPlaying) {
      isFirstTickRef.current = true;
      prevTimeRef.current = currentTime;
      return;
    }
    const prevTime = prevTimeRef.current;
    editorActions.executeKeyframeScriptsInRange(prevTime, currentTime, isFirstTickRef.current);
    isFirstTickRef.current = false;
    prevTimeRef.current = currentTime;
  }, [isPlaying, currentTime]);

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

  // Keyframe Dragging Effect: converts mouse X to time, calls moveKeyframe and setCurrentTime
  useEffect(() => {
    if (!draggingKf) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!headerRef.current) return;
      const rect = headerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const targetTime = Math.max(0, x / PIXELS_PER_SECOND);

      editorActions.moveKeyframe(
        draggingKf.layerId,
        draggingKf.currentFrame,
        targetTime,
        { skipHistory: true, elementId: draggingKf.elementId }
      );
      editorActions.setCurrentTime(targetTime);
      setDraggingKf((prev) =>
        prev ? { ...prev, currentFrame: Math.round(targetTime * fps) } : null
      );
    };

    const handleMouseUp = () => {
      setDraggingKf(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingKf, fps]);

  const handleKeyframeMouseDown = (
    e: React.MouseEvent,
    layerId: string,
    kf: EditorKeyframe,
    elementId?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    editorActions.commitHistorySnapshot();
    setDraggingKf({
      layerId,
      kfId: kf.id,
      startFrame: kf.index,
      currentFrame: kf.index,
      elementId,
    });
    const kfTime = getKeyframeTime(kf, fps);
    editorActions.setCurrentTime(kfTime);
  };

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

  // Build unified Scene Graph: Folders (groups) and leaf Element Tracks
  const visibleItems: SceneItem[] = [];
  const processedLayerIds = new Set<string>();

  const layersByParent = new Map<string | undefined, EditorLayer[]>();
  for (const l of activeTl.layers) {
    const pId = l.parentLayerId || (l as any).parentId;
    const list = layersByParent.get(pId) || [];
    list.push(l);
    layersByParent.set(pId, list);
  }

  const addLayerToScene = (layer: EditorLayer, depth: number) => {
    if (processedLayerIds.has(layer.id)) return;
    processedLayerIds.add(layer.id);

    const isFolder = layer.kind === 'folder';
    const isCollapsed = collapsedFolderIds.has(layer.id);
    const childLayers = layersByParent.get(layer.id) || [];

    if (isFolder) {
      const hasChildren = childLayers.length > 0;
      visibleItems.push({
        type: 'folder',
        layer,
        depth,
        isCollapsed,
        hasChildren,
      });
      if (!isCollapsed) {
        for (const child of childLayers) {
          addLayerToScene(child, depth + 1);
        }
      }
      return;
    }

    // Leaf track (kind !== 'folder')
    const allLayerElements = Array.from(
      new Map(layer.keyframes.flatMap((k) => k.elements).map((e) => [e.id, e])).values()
    );

    if (allLayerElements.length === 0) {
      // Empty tracks are always rendered as a track row so they never disappear
      visibleItems.push({
        type: 'track',
        layer,
        element: undefined,
        depth,
      });
      if (childLayers.length > 0 && !isCollapsed) {
        for (const child of childLayers) {
          addLayerToScene(child, depth + 1);
        }
      }
      return;
    }

    if (allLayerElements.length === 1) {
      // Standard unified element track! Render ONE row for this element!
      const element = allLayerElements[0];
      visibleItems.push({
        type: 'track',
        layer,
        element,
        depth,
      });
      if (childLayers.length > 0 && !isCollapsed) {
        for (const child of childLayers) {
          addLayerToScene(child, depth + 1);
        }
      }
    } else {
      // Multiple elements in the same non-folder layer: render each element directly at `depth`
      // without a redundant parent layer row
      for (const el of allLayerElements) {
        visibleItems.push({
          type: 'element',
          element: el,
          layer,
          depth,
        });
      }
      if (childLayers.length > 0 && !isCollapsed) {
        for (const child of childLayers) {
          addLayerToScene(child, depth + 1);
        }
      }
    }
  };

  const topLevelLayers = activeTl.layers.filter((l) => !l.parentLayerId && !(l as any).parentId);
  for (const l of topLevelLayers) {
    addLayerToScene(l, 0);
  }

  for (const l of activeTl.layers) {
    if (!processedLayerIds.has(l.id)) {
      addLayerToScene(l, 0);
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

  const getClickTimeFromEvent = (e: React.MouseEvent): number => {
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      return Math.max(0, Math.round(((e.clientX - rect.left) / PIXELS_PER_SECOND) * 1000) / 1000);
    }
    return currentTime;
  };

  const handleKeyframeContextMenu = (
    e: React.MouseEvent,
    layerId: string,
    kf: EditorKeyframe,
    clickTime?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const kfTime = getKeyframeTime(kf, fps);
    const rawTime = typeof clickTime === 'number' ? clickTime : getClickTimeFromEvent(e);
    const activeTime = Math.abs(rawTime - kfTime) < 0.02 ? kfTime : rawTime;
    editorActions.setSelectedTime(layerId, activeTime);

    const layer = activeTl.layers.find((l) => l.id === layerId);
    const hasTween = kf.tween?.type === 'motion';
    const hasScript = Boolean((kf.actions as any)?.__fn && String((kf.actions as any).__fn).trim().length > 0);
    // If right-clicked directly on the existing keyframe diamond, insert at playhead or +0.5s
    const insertTime =
      Math.abs(activeTime - kfTime) < 0.02
        ? currentTime > kfTime + 0.02
          ? currentTime
          : kfTime + 0.5
        : activeTime;

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Insert Keyframe',
          shortcut: 'F6',
          action: () => editorActions.insertKeyframe(layerId, insertTime),
        },
        {
          label: 'Insert Blank Keyframe',
          shortcut: 'F7',
          action: () =>
            editorActions.insertBlankKeyframe(layerId, Math.round(insertTime * fps)),
        },
        { separator: true },
        {
          label: 'Delete Keyframe',
          disabled: !layer || layer.keyframes.length <= 1,
          action: () => editorActions.deleteKeyframe(layerId, kfTime),
        },
        {
          label: 'Duplicate Keyframe',
          action: () => editorActions.duplicateKeyframe(layerId, kfTime),
        },
        {
          label: hasScript ? '⚡ Edit Keyframe Script...' : '⚡ Add Keyframe Script...',
          action: () => editorActions.openKeyframeScript(layerId, kf.index),
        },
        ...(hasScript
          ? [
              {
                label: 'Clear Keyframe Script',
                danger: true,
                action: () => editorActions.updateKeyframeScript(layerId, kf.index, ''),
              },
            ]
          : []),
        {
          label: 'Copy Keyframe',
          action: () => editorActions.copyKeyframe(layerId, kfTime),
        },
        {
          label: 'Paste Keyframe',
          disabled: !keyframeClipboard,
          action: () => editorActions.pasteKeyframe(layerId, activeTime),
        },
        { separator: true },
        {
          label: 'Set Easing Curve…',
          action: () => {
            if (!kf.tween) editorActions.createMotionTween(layerId, kfTime);
            editorActions.openBezierEditor(layerId, kf.id, kf.tween?.easing);
          },
        },
        {
          label: 'Convert to Blank Keyframe',
          action: () => editorActions.convertToBlankKeyframe(layerId, kfTime),
        },
        {
          label: hasTween ? 'Remove Tween' : 'Create Motion Tween',
          action: () => {
            if (hasTween) {
              editorActions.removeTween(layerId, kfTime);
            } else {
              editorActions.createMotionTween(layerId, kfTime);
            }
          },
        },
        ...(hasTween
          ? [
              { separator: true as const },
              {
                label: 'Spin: CW 1 Turn',
                action: () => editorActions.updateTweenRotate(layerId, kfTime, { direction: 'cw', turns: 1 }),
              },
              {
                label: 'Spin: CCW 1 Turn',
                action: () => editorActions.updateTweenRotate(layerId, kfTime, { direction: 'ccw', turns: 1 }),
              },
              {
                label: 'Spin: None',
                action: () => editorActions.updateTweenRotate(layerId, kfTime, undefined),
              },
            ]
          : []),
      ],
    });
  };

  const handleEmptyTrackContextMenu = (
    e: React.MouseEvent,
    layerId?: string,
    clickTime?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const targetLayerId = layerId ?? selectedLayerId ?? activeTl.layers[0]?.id;
    const targetTime = typeof clickTime === 'number' ? clickTime : getClickTimeFromEvent(e);
    if (targetLayerId) {
      editorActions.setSelectedTime(targetLayerId, targetTime);
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
          action: () =>
            editorActions.insertBlankKeyframe(targetLayerId, Math.round(targetTime * fps)),
        },
        { separator: true },
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
        {
          label: 'Paste Keyframe',
          disabled: !keyframeClipboard,
          action: () => editorActions.pasteKeyframe(targetLayerId, targetTime),
        },
      ],
    });
  };

  const handleLayerRowContextMenu = (
    e: React.MouseEvent,
    layer: EditorLayer,
    element?: EditorElement
  ) => {
    e.preventDefault();
    e.stopPropagation();
    editorActions.selectLayer(layer.id);
    if (element) {
      editorActions.selectElement(element.id, false);
    }

    const availableFolders = activeTl.layers.filter(
      (l) => l.kind === 'folder' && l.id !== layer.id && (l.id !== (layer.parentLayerId || (layer as any).parentId))
    );
    const isLocked = element ? !!element.locked : !!layer.locked;
    const isVisible = element ? (element.visible !== false) : (layer.visible !== false);
    const isMask = layer.kind === 'mask';
    const isFolder = layer.kind === 'folder';
    const isInFolder = !!(layer.parentLayerId || (layer as any).parentId);

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Insert Keyframe',
          shortcut: 'F6',
          action: () => editorActions.insertKeyframe(layer.id, currentTime),
        },
        {
          label: 'Insert Blank Keyframe',
          shortcut: 'F7',
          action: () =>
            editorActions.insertBlankKeyframe(layer.id, Math.round(currentTime * fps)),
        },
        { separator: true },
        {
          label: 'Rename',
          action: () => {
            if (element) handleStartRenameElement(element);
            else handleStartRenameLayer(layer);
          },
        },
        {
          label: 'Group into Folder',
          action: () => {
            if (element) editorActions.groupSelectedElements();
            else editorActions.groupLayerIntoFolder(layer.id);
          },
        },
        {
          label: 'Ungroup',
          disabled: !element && !isFolder && !isInFolder,
          action: () => {
            if (element) editorActions.ungroupSelectedElements();
            else editorActions.ungroupLayer(layer.id);
          },
        },
        { separator: true },
        {
          label: isLocked ? 'Unlock' : 'Lock',
          action: () => {
            if (element) editorActions.toggleElementLock(element.id);
            else editorActions.toggleLayerLock(layer.id);
          },
        },
        {
          label: isVisible ? 'Hide' : 'Show',
          action: () => {
            if (element) editorActions.updateElementProps(element.id, { visible: !element.visible });
            else editorActions.toggleLayerVisibility(layer.id);
          },
        },
        {
          label: isMask ? 'Unmask' : 'Toggle Mask',
          disabled: !!element,
          action: () => editorActions.toggleLayerMask(layer.id),
        },
        {
          label: 'Move Into Folder',
          disabled: !!element || availableFolders.length === 0,
          action: () => {
            if (availableFolders.length > 0) {
              editorActions.moveLayerToFolder(layer.id, availableFolders[0].id);
            }
          },
        },
        { separator: true },
        {
          label: isFolder ? 'Delete Folder' : element ? 'Delete Element' : 'Delete',
          danger: true,
          disabled: !element && activeTl.layers.length <= 1,
          action: () => {
            if (element) editorActions.deleteElement(element.id);
            else editorActions.deleteLayer(layer.id);
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
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Add Track / Layer"
                onClick={() => editorActions.addLayer()}
              >
                <Plus size={14} />
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
            if (item.type === 'folder') {
              const { layer, depth, isCollapsed, hasChildren } = item;
              const isSelected = layer.id === selectedLayerId;
              const trackColor = TRACK_COLORS[idx % TRACK_COLORS.length];
              const filterCount = layer.filters?.length ?? 0;
              const isDragOver = dragOverFolderId === layer.id;

              let rowClass = styles.layerRow;
              if (isSelected) rowClass += ` ${styles.selected}`;
              rowClass += ` ${styles.folderRow}`;
              if (depth > 0) rowClass += ` ${styles.childLayerRow}`;
              if (isDragOver) rowClass += ` ${styles.dragOver}`;

              return (
                <div
                  key={layer.id}
                  className={rowClass}
                  style={{ paddingLeft: `${depth * 16}px` }}
                  onClick={() => editorActions.selectLayer(layer.id)}
                  onDoubleClick={() => handleStartRenameLayer(layer)}
                  onContextMenu={(e) => handleLayerRowContextMenu(e, layer)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', layer.id);
                    setDraggedLayerId(layer.id);
                  }}
                  onDragOver={(e) => {
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      e.preventDefault();
                      setDragOverFolderId(layer.id);
                    } else if (draggedElementId) {
                      e.preventDefault();
                      setDragOverFolderId(layer.id);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverFolderId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      editorActions.setLayerParent(draggedLayerId, layer.id);
                      setDraggedLayerId(null);
                    } else if (draggedElementId) {
                      editorActions.moveElementToLayer(draggedElementId, layer.id);
                      setDraggedElementId(null);
                    }
                    setDragOverFolderId(null);
                  }}
                >
                  <div className={styles.layerColorStrip} style={{ backgroundColor: trackColor }} />
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
                  <span className={styles.folderIcon} title="Group / Folder">
                    {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                  </span>

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
                      title={layer.visible ? 'Hide Folder' : 'Show Folder'}
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
                      title={layer.locked ? 'Unlock Folder' : 'Lock Folder'}
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

            if (item.type === 'track') {
              const { layer, element, depth } = item;
              const isSelected =
                layer.id === selectedLayerId || (element && selectedElementIds.includes(element.id));
              const trackColor = TRACK_COLORS[idx % TRACK_COLORS.length];
              const filterCount = layer.filters?.length ?? 0;
              const label = element ? getElementLabel(element, doc.library.symbols) : layer.name;
              const icon = element ? getElementIcon(element) : <Layers size={13} />;
              const isVisible = element ? element.visible !== false : layer.visible;
              const isLocked = element ? Boolean((element as any).locked) : layer.locked;

              let rowClass = styles.layerRow;
              if (isSelected) rowClass += ` ${styles.selected}`;
              if (depth > 0) rowClass += ` ${styles.childLayerRow}`;

              return (
                <div
                  key={layer.id}
                  className={rowClass}
                  style={{ paddingLeft: `${depth * 16}px` }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', layer.id);
                    setDraggedLayerId(layer.id);
                    if (element) setDraggedElementId(element.id);
                  }}
                  onClick={(e) => {
                    editorActions.selectLayer(layer.id);
                    if (element) {
                      editorActions.selectElement(element.id, e.shiftKey || e.metaKey || e.ctrlKey);
                    }
                  }}
                  onDoubleClick={() => {
                    if (element) handleStartRenameElement(element);
                    else handleStartRenameLayer(layer);
                  }}
                  onContextMenu={(e) => handleLayerRowContextMenu(e, layer, element)}
                >
                  <div className={styles.layerColorStrip} style={{ backgroundColor: trackColor }} />
                  <div style={{ width: 16 }} />
                  <span className={styles.elementIcon}>{icon}</span>

                  {element && editingElId === element.id ? (
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
                  ) : editingLayerId === layer.id ? (
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
                    <span className={styles.elementName} title={label}>
                      {label}
                    </span>
                  )}

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
                      className={`${styles.toggleBtn} ${isVisible ? styles.active : ''}`}
                      title={isVisible ? 'Hide' : 'Show'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (element) editorActions.toggleElementVisibility(element.id);
                        else editorActions.toggleLayerVisibility(layer.id);
                      }}
                    >
                      {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>

                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${isLocked ? styles.active : ''}`}
                      title={isLocked ? 'Unlock' : 'Lock'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (element) editorActions.toggleElementLock(element.id);
                        else editorActions.toggleLayerLock(layer.id);
                      }}
                    >
                      {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                </div>
              );
            }

            if (item.type === 'multiElementLayer') {
              const { layer, depth, isCollapsed } = item;
              const isSelected = layer.id === selectedLayerId;
              const trackColor = TRACK_COLORS[idx % TRACK_COLORS.length];
              const filterCount = layer.filters?.length ?? 0;

              let rowClass = styles.layerRow;
              if (isSelected) rowClass += ` ${styles.selected}`;
              if (depth > 0) rowClass += ` ${styles.childLayerRow}`;

              return (
                <div
                  key={layer.id}
                  className={rowClass}
                  style={{ paddingLeft: `${depth * 16}px` }}
                  onClick={() => editorActions.selectLayer(layer.id)}
                  onDoubleClick={() => handleStartRenameLayer(layer)}
                  onContextMenu={(e) => handleLayerRowContextMenu(e, layer)}
                >
                  <div className={styles.layerColorStrip} style={{ backgroundColor: trackColor }} />
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
                  <span className={styles.layerIcon} title="Layer Track">
                    <Layers size={13} />
                  </span>
                  <span className={styles.layerNameInput} title={layer.name}>
                    {layer.name}
                  </span>
                  <div className={styles.layerToggles}>
                    <button
                      type="button"
                      className={`${styles.fxBtn} ${filterCount > 0 ? styles.active : ''}`}
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
                  paddingLeft: `${depth * 16 + 18}px`,
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
                title={`Element: ${label}`}
              >
                <span className={styles.elementIcon}>{icon}</span>

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
        <div
          className={styles.gridScrollContainer}
          ref={scrollContainerRef}
          onContextMenu={(e) => handleEmptyTrackContextMenu(e)}
        >
          <div
            className={styles.gridWrapper}
            style={{ width: `${maxGridSeconds * PIXELS_PER_SECOND}px` }}
          >
            {/* Header: Continuous Time Ruler in Seconds & Timecodes (0.0s, 0.5s, 1.0s, 1.5s, 2.0s) */}
            <div
              className={styles.frameHeaderRow}
              ref={headerRef}
              onMouseDown={handleHeaderMouseDown}
              onContextMenu={(e) => handleEmptyTrackContextMenu(e)}
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
              if (item.type === 'folder') {
                const { layer } = item;
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
                      const kf = findKeyframeAtTime(layer, clickTime, fps);
                      if (kf) {
                        handleKeyframeContextMenu(e, layer.id, kf, clickTime);
                      } else {
                        handleEmptyTrackContextMenu(e, layer.id, clickTime);
                      }
                    }}
                  >
                    {/* Clean group container span bar with NO keyframe diamonds */}
                    <div
                      className={styles.groupSpanBar}
                      style={{
                        left: 0,
                        width: `${Math.max(12, totalDurationSec * PIXELS_PER_SECOND)}px`,
                      }}
                    />
                  </div>
                );
              }

              if (item.type === 'track') {
                const { layer, element } = item;
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
                      if (element) editorActions.selectElement(element.id);
                      editorActions.setSelectedTime(layer.id, clickTime);
                    }}
                    onContextMenu={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickTime = Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND);
                      const kf = findKeyframeAtTime(layer, clickTime, fps);
                      if (kf) {
                        handleKeyframeContextMenu(e, layer.id, kf, clickTime);
                      } else {
                        handleEmptyTrackContextMenu(e, layer.id, clickTime);
                      }
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
                      const isDraggingThisKf = draggingKf?.kfId === kf.id;

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
                              pointerEvents: 'auto',
                              cursor: isTween ? 'pointer' : undefined,
                            }}
                            onClick={(e) => {
                              if (isTween) {
                                e.stopPropagation();
                                editorActions.openBezierEditor(layer.id, kf.id, kf.tween?.easing);
                              }
                            }}
                            onContextMenu={(e) =>
                              handleKeyframeContextMenu(e, layer.id, kf, getClickTimeFromEvent(e))
                            }
                            title={isTween ? 'Tween span (Click to edit cubic Bézier easing curve)' : undefined}
                          >
                            {isTween && (
                              <>
                                <div className={styles.tweenArrow} />
                                <div className={styles.tweenArrowHead} />
                              </>
                            )}
                            {!isTween && <div className={styles.spanEndBar} />}
                          </div>

                          {/* Diamond Keyframe Marker (◆) - Draggable */}
                          {(() => {
                            const hasScript = Boolean((kf.actions as any)?.__fn && String((kf.actions as any).__fn).trim().length > 0);
                            return (
                              <div
                                className={`${styles.trackKeyframeDiamond} ${styles.keyframeCell} ${
                                  isDraggingThisKf ? styles.dragging : ''
                                } ${hasScript ? styles.keyframeHasScript : ''}`}
                                style={{
                                  left: `${kfTime * PIXELS_PER_SECOND}px`,
                                }}
                                onMouseDown={(e) => handleKeyframeMouseDown(e, layer.id, kf, element?.id)}
                                onContextMenu={(e) =>
                                  handleKeyframeContextMenu(e, layer.id, kf, getClickTimeFromEvent(e))
                                }
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (hasScript) {
                                    editorActions.openKeyframeScript(layer.id, kf.index);
                                  } else if (isTween) {
                                    editorActions.openBezierEditor(layer.id, kf.id, kf.tween?.easing);
                                  } else {
                                    editorActions.openKeyframeScript(layer.id, kf.index);
                                  }
                                }}
                                title={`Keyframe at ${kfTime.toFixed(2)}s${hasScript ? ' (⚡ Has Script)' : ''}${isTween ? ' (Double-click to edit easing curve)' : ' (Double-click to edit script)'}`}
                              >
                                {kf.elements.length > 0 || kf.transform ? (
                                  <div className={styles.diamondKeyframe} />
                                ) : (
                                  <div className={styles.diamondBlankKeyframe} />
                                )}
                                {hasScript && (
                                  <span
                                    className={styles.keyframeScriptBadge}
                                    title="Keyframe has script (Click to edit)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      editorActions.openKeyframeScript(layer.id, kf.index);
                                    }}
                                  >
                                    ⚡
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              }

              if (item.type === 'multiElementLayer') {
                const { layer } = item;
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
                      const kf = findKeyframeAtTime(layer, clickTime, fps);
                      if (kf) {
                        handleKeyframeContextMenu(e, layer.id, kf, clickTime);
                      } else {
                        handleEmptyTrackContextMenu(e, layer.id, clickTime);
                      }
                    }}
                  />
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
                  onContextMenu={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickTime = Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND);
                    const kf = findKeyframeAtTime(layer, clickTime, fps);
                    if (kf) {
                      handleKeyframeContextMenu(e, layer.id, kf);
                    } else {
                      handleEmptyTrackContextMenu(e, layer.id, clickTime);
                    }
                  }}
                >
                  {/* Element diamond keyframes - Draggable */}
                  {matchingKfs.map((kf, kIdx) => {
                    const kfTime = getKeyframeTime(kf, fps);
                    const isTween = kf.tween?.type === 'motion';
                    const nextKf = matchingKfs[kIdx + 1];
                    const nextKfTime = nextKf
                      ? getKeyframeTime(nextKf, fps)
                      : kfTime + getKeyframeDurationTime(kf, fps);
                    const spanWidth = Math.max(6, (nextKfTime - kfTime) * PIXELS_PER_SECOND);
                    const isDraggingThisKf = draggingKf?.kfId === kf.id;

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
                              pointerEvents: 'auto',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              editorActions.openBezierEditor(layer.id, kf.id, kf.tween?.easing);
                            }}
                            onContextMenu={(e) =>
                              handleKeyframeContextMenu(e, layer.id, kf, getClickTimeFromEvent(e))
                            }
                            title="Tween span (Click to edit cubic Bézier easing curve)"
                          >
                            <div className={styles.tweenArrow} />
                            <div className={styles.tweenArrowHead} />
                          </div>
                        )}
                        {(() => {
                          const hasScript = Boolean((kf.actions as any)?.__fn && String((kf.actions as any).__fn).trim().length > 0);
                          return (
                            <div
                              className={`${styles.trackKeyframeDiamond} ${styles.keyframeCell} ${
                                isDraggingThisKf ? styles.dragging : ''
                              } ${hasScript ? styles.keyframeHasScript : ''}`}
                              style={{
                                left: `${kfTime * PIXELS_PER_SECOND}px`,
                              }}
                              onMouseDown={(e) => handleKeyframeMouseDown(e, layer.id, kf, element.id)}
                              onContextMenu={(e) => handleKeyframeContextMenu(e, layer.id, kf)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (hasScript) {
                                  editorActions.openKeyframeScript(layer.id, kf.index);
                                } else if (isTween) {
                                  editorActions.openBezierEditor(layer.id, kf.id, kf.tween?.easing);
                                } else {
                                  editorActions.openKeyframeScript(layer.id, kf.index);
                                }
                              }}
                              title={`Element Keyframe at ${kfTime.toFixed(2)}s${hasScript ? ' (⚡ Has Script)' : ''}${isTween ? ' - Double-click to edit easing curve' : ' - Double-click to edit script'}`}
                            >
                              <div className={styles.diamondKeyframe} />
                              {hasScript && (
                                <span
                                  className={styles.keyframeScriptBadge}
                                  title="Keyframe has script (Click to edit)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    editorActions.openKeyframeScript(layer.id, kf.index);
                                  }}
                                >
                                  ⚡
                                </span>
                              )}
                            </div>
                          );
                        })()}
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
      </div>
    </div>
  );
};
