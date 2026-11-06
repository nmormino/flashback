import React, { useState, useRef, useEffect } from 'react';
import {
  useEditorStore,
  editorActions,
  getActiveArtboard,
} from '../../state/editorStore';
import styles from './ArtboardTabStrip.module.css';

export const ArtboardTabStrip: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const activeAb = getActiveArtboard(doc);
  const artboards =
    doc.artboards && doc.artboards.length > 0 ? doc.artboards : [activeAb];
  const activeArtboardId = doc.activeArtboardId || artboards[0].id;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string>('');
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setNameDraft(currentName);
  };

  const handleFinishRename = (id: string) => {
    if (editingId === id && nameDraft.trim()) {
      editorActions.renameArtboard(id, nameDraft.trim());
    }
    setEditingId(null);
  };

  const handleTabContextMenu = (
    e: React.MouseEvent,
    ab: { id: string; name: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const canDelete = artboards.length > 1;

    editorActions.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `Rename "${ab.name}"`,
          action: () => handleStartRename(ab.id, ab.name),
        },
        {
          label: 'Duplicate Artboard',
          action: () => editorActions.duplicateArtboard(ab.id),
        },
        { separator: true },
        {
          label: 'Delete Artboard',
          disabled: !canDelete,
          action: () => editorActions.deleteArtboard(ab.id),
        },
      ],
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    currentIdx: number,
    abId: string
  ) => {
    if (editingId) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (currentIdx + 1) % artboards.length;
      const nextId = artboards[nextIdx].id;
      editorActions.setActiveArtboard(nextId);
      tabRefs.current.get(nextId)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (currentIdx - 1 + artboards.length) % artboards.length;
      const prevId = artboards[prevIdx].id;
      editorActions.setActiveArtboard(prevId);
      tabRefs.current.get(prevId)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstId = artboards[0].id;
      editorActions.setActiveArtboard(firstId);
      tabRefs.current.get(firstId)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastId = artboards[artboards.length - 1].id;
      editorActions.setActiveArtboard(lastId);
      tabRefs.current.get(lastId)?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (artboards.length > 1) {
        e.preventDefault();
        editorActions.deleteArtboard(abId);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTabId !== id) {
      setDragOverTabId(id);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, id: string) => {
    if (dragOverTabId === id) {
      setDragOverTabId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverTabId(null);

    const elId =
      e.dataTransfer.getData('application/x-flashback-element') ||
      e.dataTransfer.getData('text/plain');
    const layerId = e.dataTransfer.getData('application/x-flashback-layer');

    if (elId && !layerId) {
      editorActions.moveElementToArtboard(elId, targetId);
    } else if (layerId) {
      editorActions.moveLayerToArtboard(layerId, targetId);
    }
  };

  return (
    <div className={styles.tabStripContainer}>
      <div className={styles.tabList} role="tablist" aria-label="Artboards">
        {artboards.map((ab, idx) => {
          const isActive = ab.id === activeArtboardId;
          const isEditing = editingId === ab.id;
          const isDragOver = dragOverTabId === ab.id;

          return (
            <button
              key={ab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(ab.id, el);
                else tabRefs.current.delete(ab.id);
              }}
              role="tab"
              id={`artboard-tab-${ab.id}`}
              aria-selected={isActive}
              aria-controls={`artboard-panel-${ab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tabItem} ${isActive ? styles.active : ''} ${
                isDragOver ? styles.dragOver : ''
              }`}
              onClick={() => {
                if (!isActive) editorActions.setActiveArtboard(ab.id);
              }}
              onDoubleClick={() => handleStartRename(ab.id, ab.name)}
              onContextMenu={(e) => handleTabContextMenu(e, ab)}
              onKeyDown={(e) => handleKeyDown(e, idx, ab.id)}
              onDragOver={(e) => handleDragOver(e, ab.id)}
              onDragLeave={(e) => handleDragLeave(e, ab.id)}
              onDrop={(e) => handleDrop(e, ab.id)}
              title={`${ab.name} (${ab.width}×${ab.height})\nDouble-click to rename, right-click for options`}
            >
              <span className={styles.tabIcon}>🎨</span>
              {isEditing ? (
                <input
                  ref={inputRef}
                  className={styles.renameInput}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => handleFinishRename(ab.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleFinishRename(ab.id);
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={styles.tabName}>{ab.name}</span>
              )}
              <span className={styles.dimBadge}>
                {ab.width}×{ab.height}
              </span>
              {artboards.length > 1 && (
                <span
                  role="button"
                  tabIndex={-1}
                  className={styles.closeBtn}
                  title="Delete Artboard"
                  onClick={(e) => {
                    e.stopPropagation();
                    editorActions.deleteArtboard(ab.id);
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          className={styles.addBtn}
          title="Add Artboard"
          aria-label="Add Artboard"
          onClick={() => editorActions.addArtboard()}
        >
          +
        </button>
      </div>
    </div>
  );
};
