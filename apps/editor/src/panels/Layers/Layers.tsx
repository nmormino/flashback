import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Layers as LayersIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Square,
  Type,
  Component,
  Image as ImageIcon,
  Video as VideoIcon,
} from 'lucide-react';
import type { Filter, ShapeElement, TextElement, SymbolInstance } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  getActiveTimeline,
  getActiveArtboard,
  findKeyframeAt,
  findKeyframeAtTime,
  type EditorLayer,
  type EditorElement,
} from '../../state/editorStore';
import styles from './Layers.module.css';

export interface LayerFiltersManagerProps {
  layer: EditorLayer;
}

export const LayerFiltersManager: React.FC<LayerFiltersManagerProps> = ({ layer }) => {
  const [addDropdownVal, setAddDropdownVal] = useState<string>('');

  const filters = layer.filters ?? [];

  const handleAddFilter = (type: string) => {
    let newFilter: Filter;
    switch (type) {
      case 'blur':
        newFilter = { type: 'blur', radius: 6 };
        break;
      case 'dropShadow':
        newFilter = { type: 'dropShadow', x: 4, y: 4, blur: 8, color: 'rgba(0,0,0,0.5)' };
        break;
      case 'brightness':
        newFilter = { type: 'brightness', amount: 1.2 };
        break;
      case 'contrast':
        newFilter = { type: 'contrast', amount: 1.2 };
        break;
      case 'hueRotate':
        newFilter = { type: 'hueRotate', degrees: 90 };
        break;
      case 'opacity':
        newFilter = { type: 'opacity', amount: 0.8 };
        break;
      default:
        return;
    }
    editorActions.addLayerFilter(layer.id, newFilter);
    setAddDropdownVal('');
  };

  return (
    <div className={styles.filtersSection}>
      <div className={styles.sectionTitle}>
        <span>CSS Layer Filters ({filters.length})</span>
        <select
          className={styles.addFilterBtn}
          value={addDropdownVal}
          onChange={(e) => handleAddFilter(e.target.value)}
        >
          <option value="" disabled>
            + Add Filter...
          </option>
          <option value="blur">Blur</option>
          <option value="dropShadow">Drop Shadow</option>
          <option value="brightness">Brightness</option>
          <option value="contrast">Contrast</option>
          <option value="hueRotate">Hue Rotate</option>
          <option value="opacity">Opacity</option>
        </select>
      </div>

      {filters.length === 0 ? (
        <div className={styles.emptyState}>
          <span>No CSS filters applied to this layer.</span>
          <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>
            Layer filters apply blur, drop-shadow, brightness, contrast, hue-rotate, or opacity to all elements on this layer.
          </span>
        </div>
      ) : (
        filters.map((f, idx) => {
          return (
            <div key={idx} className={styles.filterCard}>
              <div className={styles.filterHeader}>
                <span>
                  {f.type === 'blur'
                    ? 'Blur'
                    : f.type === 'dropShadow'
                    ? 'Drop Shadow'
                    : f.type === 'brightness'
                    ? 'Brightness'
                    : f.type === 'contrast'
                    ? 'Contrast'
                    : f.type === 'hueRotate'
                    ? 'Hue Rotate'
                    : f.type === 'opacity'
                    ? 'Opacity'
                    : f.type}
                </span>
                <button
                  type="button"
                  className={styles.filterDeleteBtn}
                  onClick={() => editorActions.removeLayerFilter(layer.id, idx)}
                  title="Remove Filter"
                >
                  ✕
                </button>
              </div>

              <div className={styles.filterControls}>
                {f.type === 'blur' && (
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Radius (px):</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      className={styles.controlSlider}
                      value={f.radius}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          radius: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className={styles.controlNumber}
                      value={f.radius}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          radius: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                )}

                {f.type === 'dropShadow' && (
                  <>
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Offset X:</span>
                      <input
                        type="number"
                        className={styles.controlNumber}
                        value={f.x}
                        onChange={(e) =>
                          editorActions.updateLayerFilter(layer.id, idx, {
                            x: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                      <span className={styles.controlLabel}>Offset Y:</span>
                      <input
                        type="number"
                        className={styles.controlNumber}
                        value={f.y}
                        onChange={(e) =>
                          editorActions.updateLayerFilter(layer.id, idx, {
                            y: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Blur (px):</span>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        className={styles.controlSlider}
                        value={f.blur}
                        onChange={(e) =>
                          editorActions.updateLayerFilter(layer.id, idx, {
                            blur: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        max="50"
                        className={styles.controlNumber}
                        value={f.blur}
                        onChange={(e) =>
                          editorActions.updateLayerFilter(layer.id, idx, {
                            blur: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Color:</span>
                      <input
                        type="text"
                        className={styles.controlNumber}
                        style={{ flex: 1 }}
                        value={f.color}
                        onChange={(e) =>
                          editorActions.updateLayerFilter(layer.id, idx, {
                            color: e.target.value,
                          })
                        }
                        title="Shadow Color (CSS string or hex)"
                      />
                    </div>
                  </>
                )}

                {f.type === 'brightness' && (
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Amount:</span>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.05"
                      className={styles.controlSlider}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      className={styles.controlNumber}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                )}

                {f.type === 'contrast' && (
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Amount:</span>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.05"
                      className={styles.controlSlider}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      className={styles.controlNumber}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                )}

                {f.type === 'hueRotate' && (
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Degrees:</span>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      className={styles.controlSlider}
                      value={f.degrees}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          degrees: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="360"
                      className={styles.controlNumber}
                      value={f.degrees}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          degrees: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                )}

                {f.type === 'opacity' && (
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Amount:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className={styles.controlSlider}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      className={styles.controlNumber}
                      value={f.amount}
                      onChange={(e) =>
                        editorActions.updateLayerFilter(layer.id, idx, {
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export interface LayerMaskSettingsProps {
  layer: EditorLayer;
  allLayers: EditorLayer[];
}

export const LayerMaskSettings: React.FC<LayerMaskSettingsProps> = ({ layer, allLayers }) => {
  const maskLayers = allLayers.filter((l) => l.kind === 'mask' && l.id !== layer.id);

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--mx-border-light)' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--mx-text-muted)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Layer Masking</span>
        {layer.kind === 'mask' && (
          <span
            style={{
              padding: '2px 6px',
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            ACTIVE MASK
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          style={{
            flex: 1,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            border: layer.kind === 'mask' ? '1px solid #8b5cf6' : '1px solid var(--mx-border)',
            backgroundColor: layer.kind === 'mask' ? '#8b5cf6' : 'transparent',
            color: layer.kind === 'mask' ? '#ffffff' : 'var(--mx-text-main)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onClick={() => editorActions.toggleLayerMask(layer.id)}
          title="Toggle layer mask mode (automatically masks layer below)"
          data-testid="toggle-mask-btn"
        >
          {layer.kind === 'mask' ? '🎭 Mask Layer (Enabled)' : '🎭 Set as Mask Layer'}
        </button>
      </div>

      {layer.kind !== 'mask' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>Clipped by Mask Layer:</div>
          <select
            value={layer.maskLayerId || ''}
            onChange={(e) => editorActions.setLayerMaskId(layer.id, e.target.value || undefined)}
            style={{
              width: '100%',
              backgroundColor: 'var(--mx-bg-input, #1b1c20)',
              color: 'var(--mx-text-main)',
              border: '1px solid var(--mx-border-light)',
              borderRadius: 3,
              padding: '4px 8px',
              fontSize: 12,
              outline: 'none',
            }}
            data-testid="layer-mask-select"
          >
            <option value="">None (Normal / Unclipped)</option>
            {maskLayers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (Mask)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export const Layers: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const currentTime = useEditorStore((s) => s.currentTime ?? s.currentFrame / (s.doc.stage.fps || 24));
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const isolationStack = useEditorStore((s) => s.isolationStack);

  const activeTl = getActiveTimeline(doc, isolationStack);

  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(new Set());
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string>('');
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const toggleExpand = (layerId: string) => {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const handleStartRename = (layer: EditorLayer) => {
    setEditingLayerId(layer.id);
    setEditingDraft(layer.name);
  };

  const handleFinishRename = (layerId: string) => {
    if (editingLayerId === layerId) {
      if (editingDraft.trim()) {
        editorActions.renameLayer(layerId, editingDraft.trim());
      }
      setEditingLayerId(null);
    }
  };

  const selectedLayer = activeTl.layers.find((l) => l.id === selectedLayerId) ?? activeTl.layers[0];

  const handleDragStart = (idx: number, e: React.DragEvent, layerId: string) => {
    setDraggedLayerIdx(idx);
    e.dataTransfer.setData('application/x-flashback-layer', layerId);
    e.dataTransfer.setData('text/plain', layerId);
  };

  const handleLayerContextMenu = (e: React.MouseEvent, layer: EditorLayer) => {
    e.preventDefault();
    e.stopPropagation();
    editorActions.selectLayer(layer.id);
    const activeAb = getActiveArtboard(doc);
    const otherArtboards =
      doc.artboards && doc.artboards.length > 1
        ? doc.artboards.filter((a) => a.id !== activeAb.id)
        : [];
    const moveArtboardItems = otherArtboards.map((ab) => ({
      label: `Move Layer to Artboard "${ab.name}"`,
      action: () => editorActions.moveLayerToArtboard(layer.id, ab.id),
    }));

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Rename Layer', action: () => handleStartRename(layer) },
        { label: 'Duplicate Layer', action: () => editorActions.duplicateLayer(layer.id) },
        ...(moveArtboardItems.length > 0
          ? [{ separator: true }, ...moveArtboardItems]
          : []),
        { separator: true },
        {
          label: 'Delete Layer',
          disabled: activeTl.layers.length <= 1,
          danger: true,
          action: () => editorActions.deleteLayer(layer.id),
        },
      ],
    });
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverIdx !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (toIdx: number) => {
    if (draggedLayerIdx !== null && draggedLayerIdx !== toIdx) {
      editorActions.reorderLayers(draggedLayerIdx, toIdx);
    }
    setDraggedLayerIdx(null);
    setDragOverIdx(null);
  };

  const getElementLabel = (el: EditorElement): string => {
    if (el.instanceName) return el.instanceName;
    if (el.type === 'text') {
      const text = (el as TextElement).text || '';
      return text.length > 15 ? `"${text.slice(0, 15)}..."` : `"${text}"`;
    }
    if (el.type === 'instance') {
      const sym = doc.library.symbols[(el as SymbolInstance).symbolId];
      return sym ? sym.name : 'Component Instance';
    }
    if (el.type === 'shape') {
      return 'Vector Shape';
    }
    if (el.type === 'bitmap') {
      return (el as any).name || 'Bitmap Image';
    }
    if (el.type === 'video') {
      return 'Video Player';
    }
    return (el as any).type || 'Element';
  };

  const getElementIcon = (el: EditorElement): React.ReactNode => {
    switch (el.type) {
      case 'shape':
        return <Square size={12} />;
      case 'text':
        return <Type size={12} />;
      case 'instance':
        return <Component size={12} />;
      case 'bitmap':
        return <ImageIcon size={12} />;
      case 'video':
        return <VideoIcon size={12} />;
      default:
        return <Square size={12} />;
    }
  };

  return (
    <div className={styles.layersPanel}>
      {/* Left Pane: Layers Explorer Tree */}
      <div className={styles.layersExplorer}>
        <div className={styles.explorerHeader}>
          <span>Layers</span>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => selectedLayer && editorActions.bringLayerForward(selectedLayer.id)}
              title="Bring Layer Forward (Up)"
              disabled={!selectedLayer || activeTl.layers.indexOf(selectedLayer) === 0}
            >
              <ArrowUp size={12} />
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => selectedLayer && editorActions.sendLayerBackward(selectedLayer.id)}
              title="Send Layer Backward (Down)"
              disabled={
                !selectedLayer ||
                activeTl.layers.indexOf(selectedLayer) === activeTl.layers.length - 1
              }
            >
              <ArrowDown size={12} />
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => editorActions.addFolder()}
              title="Add Group / Folder"
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => editorActions.addLayer()}
              title="Add New Layer"
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => selectedLayer && editorActions.deleteLayer(selectedLayer.id)}
              title="Delete Selected Layer"
              disabled={activeTl.layers.length <= 1}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div className={styles.layersList}>
          {(() => {
            const layersByParent = new Map<string | undefined, EditorLayer[]>();
            for (const l of activeTl.layers) {
              const pId = l.parentLayerId || (l as any).parentId;
              const list = layersByParent.get(pId) || [];
              list.push(l);
              layersByParent.set(pId, list);
            }

            const flattenedLayers: Array<{
              layer: EditorLayer;
              depth: number;
              isFolder: boolean;
              hasChildren: boolean;
            }> = [];
            const processedLayerIds = new Set<string>();

            const traverseLayers = (layer: EditorLayer, depth: number) => {
              if (processedLayerIds.has(layer.id)) return;
              processedLayerIds.add(layer.id);
              const isFolder = layer.kind === 'folder';
              const childLayers = layersByParent.get(layer.id) || [];
              const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
              const childElements = kf?.elements ?? [];
              const hasChildren = childLayers.length > 0 || (!isFolder && childElements.length > 0);
              const isExpanded = expandedLayerIds.has(layer.id);

              flattenedLayers.push({
                layer,
                depth,
                isFolder,
                hasChildren,
              });

              if (isFolder && isExpanded) {
                for (const child of childLayers) {
                  traverseLayers(child, depth + 1);
                }
              }
            };

            const topLevelLayers = activeTl.layers.filter((l) => !l.parentLayerId && !(l as any).parentId);
            for (const l of topLevelLayers) {
              traverseLayers(l, 0);
            }
            for (const l of activeTl.layers) {
              if (!processedLayerIds.has(l.id)) {
                traverseLayers(l, 0);
              }
            }

            return flattenedLayers.map(({ layer, depth, isFolder, hasChildren }, idx) => {
              const isSelected = layer.id === selectedLayerId;
              const isExpanded = expandedLayerIds.has(layer.id);
              const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
              const childElements = kf?.elements ?? [];
              const filterCount = layer.filters?.length ?? 0;
              const rawIdx = activeTl.layers.indexOf(layer);

              return (
                <div
                  key={layer.id}
                  className={styles.layerItem}
                  draggable
                  onDragStart={(e) => handleDragStart(rawIdx, e, layer.id)}
                  onDragOver={(e) => handleDragOver(e, rawIdx)}
                  onDrop={() => handleDrop(rawIdx)}
                  onContextMenu={(e) => handleLayerContextMenu(e, layer)}
                >
                  <div
                    className={`${styles.layerRow} ${isSelected ? styles.selected : ''} ${
                      dragOverIdx === rawIdx ? styles.dragOver : ''
                    }`}
                    style={{ paddingLeft: `${depth * 16 + 6}px` }}
                    onClick={() => editorActions.selectLayer(layer.id)}
                    onDoubleClick={() => handleStartRename(layer)}
                  >
                    {/* Expand / collapse chevron */}
                    {hasChildren ? (
                      <button
                        type="button"
                        className={`${styles.expandBtn} ${isExpanded ? styles.expanded : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(layer.id);
                        }}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                    ) : (
                      <div style={{ width: 14 }} />
                    )}

                    <span className={styles.layerIcon}>
                      {isFolder ? (
                        isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />
                      ) : childElements.length === 1 ? (
                        getElementIcon(childElements[0])
                      ) : (
                        <LayersIcon size={13} />
                      )}
                    </span>

                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        className={styles.nameInput}
                        autoFocus
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        onBlur={() => handleFinishRename(layer.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename(layer.id);
                          if (e.key === 'Escape') setEditingLayerId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={styles.layerName} title={layer.name}>
                        {childElements.length === 1 && layer.name.startsWith('Layer ')
                          ? getElementLabel(childElements[0])
                          : layer.name}
                      </span>
                    )}

                    {layer.kind === 'mask' && (
                      <span
                        className={styles.filterBadge}
                        style={{ backgroundColor: '#8b5cf6', color: '#ffffff', fontWeight: 700 }}
                        title="Mask Layer"
                      >
                        MASK
                      </span>
                    )}

                    {layer.maskLayerId && (() => {
                      const mLayer = activeTl.layers.find((l) => l.id === layer.maskLayerId);
                      return (
                        <span
                          className={styles.filterBadge}
                          style={{ backgroundColor: 'rgba(139, 92, 246, 0.25)', color: '#c4b5fd' }}
                          title={`Masked by: ${mLayer?.name || layer.maskLayerId}`}
                        >
                          ⤹ Masked
                        </span>
                      );
                    })()}

                    {filterCount > 0 && (
                      <span className={styles.filterBadge} title={`${filterCount} CSS filters applied`}>
                        ⚡ {filterCount}
                      </span>
                    )}

                    {!isFolder && childElements.length > 1 && (
                      <span className={styles.badge} title={`${childElements.length} elements`}>
                        {childElements.length}
                      </span>
                    )}

                    <div className={styles.layerToggles}>
                      {/* Mask Layer Toggle */}
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${layer.kind === 'mask' ? styles.active : ''}`}
                        style={
                          layer.kind === 'mask'
                            ? { backgroundColor: '#8b5cf6', color: '#ffffff', fontWeight: 800 }
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          editorActions.toggleLayerMask(layer.id);
                        }}
                        title={layer.kind === 'mask' ? 'Unset Mask Layer' : 'Set as Mask Layer'}
                        aria-label="Toggle Mask Layer"
                        data-testid={`mask-toggle-${layer.id}`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${layer.visible ? styles.active : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          editorActions.toggleLayerVisibility(layer.id);
                        }}
                        title={layer.visible ? 'Hide Layer' : 'Show Layer'}
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
                        title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                      >
                        {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Child Elements */}
                  {!isFolder && isExpanded && childElements.length > 0 && (
                    <div className={styles.childrenList}>
                      {childElements.map((el) => {
                      const isChildSelected = selectedElementIds.includes(el.id);
                      return (
                        <div
                          key={el.id}
                          className={`${styles.childRow} ${
                            isChildSelected ? styles.childSelected : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            editorActions.selectElement(el.id, e.shiftKey || e.metaKey || e.ctrlKey);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (el.type === 'instance') {
                              editorActions.enterIsolation((el as SymbolInstance).symbolId);
                            }
                          }}
                          title={
                            el.type === 'instance'
                              ? 'Double-click to isolate / edit in place'
                              : getElementLabel(el)
                          }
                        >
                          <span className={styles.childIcon}>{getElementIcon(el)}</span>
                          <span className={styles.childName}>{getElementLabel(el)}</span>
                          {el.type === 'instance' && (
                            <span style={{ fontSize: 9, opacity: 0.6 }}>[Group]</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
        })()}
        </div>
      </div>

      {/* Right Pane: Selected Layer Mask & CSS Filters Manager */}
      {selectedLayer && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <LayerMaskSettings layer={selectedLayer} allLayers={activeTl.layers} />
          <LayerFiltersManager layer={selectedLayer} />
        </div>
      )}
    </div>
  );
};
