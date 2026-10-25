import React, { useState } from 'react';
import type { SymbolKind } from '@flashback/runtime';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Dialog.module.css';

export const ConvertToComponentDialog: React.FC = () => {
  const isOpen = useEditorStore(
    (s) => s.convertToComponentModalOpen || s.convertToSymbolModalOpen
  );
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const doc = useEditorStore((s) => s.doc);

  const [name, setName] = useState(
    `Component ${Object.keys(doc.library.symbols).length + 1}`
  );
  const [kind, setKind] = useState<SymbolKind>('movieclip');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedElementIds.length > 0 && name.trim()) {
      editorActions.convertToComponent(selectedElementIds[0], name.trim(), kind);
    }
    editorActions.setConvertToComponentModalOpen(false);
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={() => editorActions.setConvertToComponentModalOpen(false)}
    >
      <div className={styles.dialogWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <span>Create New Component</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => editorActions.setConvertToComponentModalOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogBody}>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Name:</span>
            <input
              type="text"
              className={styles.textInput}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
            />
          </div>

          <div className={styles.radioGroup}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--mx-text-muted)' }}>
              Behavior:
            </span>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="componentKind"
                value="movieclip"
                checked={kind === 'movieclip'}
                onChange={() => setKind('movieclip')}
              />
              Movie clip
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="componentKind"
                value="button"
                checked={kind === 'button'}
                onChange={() => setKind('button')}
              />
              Button
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="componentKind"
                value="graphic"
                checked={kind === 'graphic'}
                onChange={() => setKind('graphic')}
              />
              Graphic
            </label>
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <button type="button" className={styles.dialogBtn} onClick={handleConfirm}>
            OK
          </button>
          <button
            type="button"
            className={styles.dialogBtn}
            onClick={() => editorActions.setConvertToComponentModalOpen(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export const ConvertToSymbolDialog = ConvertToComponentDialog;
