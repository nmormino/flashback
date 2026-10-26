import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Layers as LayersIcon,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Square,
  Type,
  Component,
} from 'lucide-react';
import type { Filter, ShapeElement, TextElement, SymbolInstance } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  getActiveTimeline,
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

  const handleDragStart = (idx: number) => {
    setDraggedLayerIdx(idx);
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
    return el.type;
  };

  const getElementIcon = (el: EditorElement): React.ReactNode => {
    switch (el.type) {
      case 'shape':
        return <Square size={12} />;
      case 'text':
        return <Type size={12} />;
      case 'instance':
        return <Component size={12} />;
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
          {activeTl.layers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId;
            const isExpanded = expandedLayerIds.has(layer.id);
            const kf = findKeyframeAtTime(layer, currentTime) ?? findKeyframeAt(layer, currentFrame);
            const childElements = kf?.elements ?? [];
            const filterCount = layer.filters?.length ?? 0;

            return (
              <div
                key={layer.id}
                className={styles.layerItem}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
              >
                <div
                  className={`${styles.layerRow} ${isSelected ? styles.selected : ''} ${
                    dragOverIdx === idx ? styles.dragOver : ''
                  }`}
                  onClick={() => editorActions.selectLayer(layer.id)}
                  onDoubleClick={() => handleStartRename(layer)}
                >
                  {/* Expand / collapse chevron */}
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

                  <span className={styles.layerIcon}><LayersIcon size={13} /></span>

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
                      {layer.name}
                    </span>
                  )}

                  {filterCount > 0 && (
                    <span className={styles.filterBadge} title={`${filterCount} CSS filters applied`}>
                      ⚡ {filterCount}
                    </span>
                  )}

                  {childElements.length > 0 && (
                    <span className={styles.badge} title={`${childElements.length} elements`}>
                      {childElements.length}
                    </span>
                  )}

                  <div className={styles.layerToggles}>
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
                {isExpanded && childElements.length > 0 && (
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
          })}
        </div>
      </div>

      {/* Right Pane: Selected Layer CSS Filters Manager */}
      {selectedLayer && <LayerFiltersManager layer={selectedLayer} />}
    </div>
  );
};
