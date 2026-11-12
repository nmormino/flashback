import React, { useState } from 'react';
import { Film, Layers, Plus, Trash2, Maximize2 } from 'lucide-react';
import { useEditorStore, editorActions, type EditorSymbol } from '../../state/editorStore';
import { PhotoshopPanel } from '../../layout/PhotoshopPanel';
import styles from './Library.module.css';

export interface LibraryProps {
  isDocked?: boolean;
}

export const Library: React.FC<LibraryProps> = ({ isDocked: isDockedProp }) => {
  const doc = useEditorStore((s) => s.doc);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const libraryPosition = useEditorStore((s) => s.libraryPosition);
  const floatingPanelPositions = useEditorStore((s) => s.floatingPanelPositions);
  const collapsedPanels = useEditorStore((s) => s.collapsedPanels);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);

  // If isDockedProp is explicitly passed, respect it; otherwise default to false for standalone unit test environments
  const isDocked = isDockedProp !== undefined ? isDockedProp : false;
  const isCollapsed = collapsedPanels?.clips ?? false;
  const currentPos = floatingPanelPositions?.clips ?? libraryPosition ?? { x: 300, y: 120 };

  const symbols = Object.values(doc.library.symbols) as EditorSymbol[];

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
    <PhotoshopPanel
      id="clips"
      title={`Clips — ${doc.meta.name || 'Untitled'}`}
      icon={<Film size={12} />}
      isDocked={isDocked}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => editorActions.togglePanelCollapse('clips')}
      onToggleDock={() => editorActions.setPanelDocked('clips', !isDocked)}
      onClose={() => editorActions.setLibraryOpen(false)}
      floatingPosition={currentPos}
      onPositionChange={(pos) => {
        editorActions.setFloatingPanelPosition('clips', pos);
        editorActions.setLibraryPosition(pos);
      }}
      menuItems={[
        { label: '+ New Clip (F8)', action: handleNewClipClick },
        { label: 'Insert to Stage', action: handleInsertToStage, disabled: symbols.length === 0 },
        { label: 'Delete Clip', action: handleDeleteSymbol, disabled: !selectedSymbolId },
      ]}
      testId="floating-clips-library"
      closeBtnTestId="close-library-btn"
    >
      <div className={styles.libraryBody}>
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
    </PhotoshopPanel>
  );
};
