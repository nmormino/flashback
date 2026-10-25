import React, { useState } from 'react';
import { useEditorStore, editorActions, type EditorSymbol } from '../../state/editorStore';
import styles from './Library.module.css';

export const Library: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);

  const symbols = Object.values(doc.library.symbols) as EditorSymbol[];

  const handleInsertToStage = () => {
    if (selectedSymbolId) {
      editorActions.addSymbolToStage(selectedSymbolId);
    }
  };

  const handleDeleteSymbol = () => {
    if (selectedSymbolId) {
      editorActions.deleteSymbol(selectedSymbolId);
      setSelectedSymbolId(null);
    }
  };

  const getKindIcon = (kind: string) => {
    if (kind === 'button') return '🔘';
    if (kind === 'graphic') return '📐';
    return '🎬';
  };

  return (
    <div className={styles.libraryPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderTitle}>
          <span>Components & Assets — {doc.meta.name || 'Untitled'}</span>
        </div>
      </div>

      <div className={styles.symbolList}>
        {symbols.length === 0 ? (
          <div className={styles.emptyNotice}>
            No components in library.
            <br />
            Select an element and press F8 to Convert to Component.
          </div>
        ) : (
          symbols.map((sym) => {
            const isSelected = sym.id === selectedSymbolId;
            return (
              <div
                key={sym.id}
                className={`${styles.symbolItem} ${isSelected ? styles.selected : ''}`}
                onClick={() => setSelectedSymbolId(sym.id)}
                onDoubleClick={handleInsertToStage}
                title={`Double-click to insert "${sym.name}" component to stage`}
              >
                <span className={styles.symbolIcon}>{getKindIcon(sym.kind)}</span>
                <span className={styles.symbolName}>{sym.name}</span>
                <span className={styles.symbolKindBadge}>Component ({sym.kind})</span>
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
            onClick={() => editorActions.setConvertToComponentModalOpen(true)}
            disabled={selectedElementIds.length === 0}
            title={
              selectedElementIds.length === 0
                ? 'Select an element on the stage first'
                : 'Convert selected element to Component (F8)'
            }
          >
            New Component (F8)
          </button>
          <button
            type="button"
            className={styles.libBtn}
            onClick={handleInsertToStage}
            disabled={!selectedSymbolId}
            title="Place component instance on current keyframe"
          >
            Insert to Stage
          </button>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.libBtn}
            onClick={handleDeleteSymbol}
            disabled={!selectedSymbolId}
            title="Delete selected component"
          >
            Delete Component
          </button>
        </div>
      </div>
    </div>
  );
};
