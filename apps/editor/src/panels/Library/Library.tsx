import React, { useState, useRef, useEffect } from 'react';
import { Film, Layers, Plus, Trash2, X, Maximize2 } from 'lucide-react';
import { useEditorStore, editorActions, type EditorSymbol } from '../../state/editorStore';
import styles from './Library.module.css';

export const Library: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const libraryPosition = useEditorStore((s) => s.libraryPosition);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);

  const symbols = Object.values(doc.library.symbols) as EditorSymbol[];

  // Dragging support for floating window
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Only drag from header background or title, not close button
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - (libraryPosition?.x ?? 200),
      y: e.clientY - (libraryPosition?.y ?? 60),
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 80, moveEvt.clientX - dragOffsetRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 60, moveEvt.clientY - dragOffsetRef.current.y));
      editorActions.setLibraryPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleInsertToStage = () => {
    const symId = selectedSymbolId || symbols[0]?.id;
    if (symId) {
      editorActions.addSymbolToStage(symId);
    }
  };

  const handleDeleteSymbol = () => {
    if (selectedSymbolId) {
      editorActions.deleteSymbol(selectedSymbolId);
      setSelectedSymbolId(null);
    }
  };

  const handleNewClipClick = () => {
    if (selectedElementIds.length > 0) {
      editorActions.setConvertToComponentModalOpen(true);
    } else {
      editorActions.createEmptyClip();
    }
  };

  const handleEnterIsolation = (sym: EditorSymbol) => {
    editorActions.enterIsolation(sym.id, sym.name);
  };

  return (
    <div
      className={styles.libraryPanel}
      style={{
        position: 'fixed',
        left: `${libraryPosition?.x ?? 300}px`,
        top: `${libraryPosition?.y ?? 60}px`,
      }}
      data-testid="floating-clips-library"
    >
      <div className={styles.panelHeader} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.panelHeaderTitle} title="Clips — Drag to move window">
          <Film size={13} className={styles.headerIcon} />
          <span>Clips — {doc.meta.name || 'Untitled'}</span>
        </div>
        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.closeWindowBtn}
            onClick={() => editorActions.setLibraryOpen(false)}
            title="Close Clips Window"
            data-testid="close-library-btn"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className={styles.symbolList}>
        {symbols.length === 0 ? (
          <div className={styles.emptyNotice}>
            No clips in library.
            <br />
            Select an element and press F8 to Convert to Clip, or click "+ New Clip" to create a nested artboard.
          </div>
        ) : (
          symbols.map((sym) => {
            const isSelected = sym.id === selectedSymbolId;
            const w = sym.width || 100;
            const h = sym.height || 100;
            return (
              <div
                key={sym.id}
                className={`${styles.symbolItem} ${isSelected ? styles.selected : ''}`}
                onClick={() => setSelectedSymbolId(sym.id)}
                onDoubleClick={() => handleEnterIsolation(sym)}
                title={`Double-click to edit "${sym.name}" artboard timeline (${w}×${h}px)`}
              >
                <span className={styles.symbolIcon}><Film size={13} /></span>
                <span className={styles.symbolName}>{sym.name}</span>
                <span className={styles.artboardSizeBadge}>{w}×{h}</span>
                <span className={styles.symbolKindBadge}>Clip</span>
                <button
                  type="button"
                  className={styles.editClipBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEnterIsolation(sym);
                  }}
                  title="Open nested timeline & artboard"
                >
                  <Maximize2 size={11} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.libraryFooter}>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.libBtn}
            onClick={handleNewClipClick}
            title={
              selectedElementIds.length === 0
                ? 'Create a new empty 100×100 nested Clip artboard'
                : 'Convert selected element to Clip (F8)'
            }
          >
            <Plus size={12} />
            <span>+ New Clip (F8)</span>
          </button>
          <button
            type="button"
            className={styles.libBtn}
            onClick={handleInsertToStage}
            disabled={symbols.length === 0}
            title="Place clip instance on current keyframe"
          >
            <Layers size={12} />
            <span>Insert to Stage</span>
          </button>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.libBtn}
            onClick={handleDeleteSymbol}
            disabled={!selectedSymbolId}
            title="Delete selected clip"
          >
            <Trash2 size={12} />
            <span>Delete Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
