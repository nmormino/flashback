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
    `Clip ${Object.keys(doc.library.symbols).length + 1}`
  );
  const [kind, setKind] = useState<SymbolKind>('movieclip');
  const [width, setWidth] = useState<number>(100);
  const [height, setHeight] = useState<number>(100);
  const [regPoint, setRegPoint] = useState<'center' | 'topleft'>('center');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedElementIds.length > 0 && name.trim()) {
      const regX = regPoint === 'center' ? Math.round((width || 100) / 2) : 0;
      const regY = regPoint === 'center' ? Math.round((height || 100) / 2) : 0;
      editorActions.convertToComponent(
        selectedElementIds[0],
        name.trim(),
        kind,
        width || 100,
        height || 100,
        { x: regX, y: regY }
      );
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
          <span>Convert to Clip</span>
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

          <div className={styles.formRow}>
            <span className={styles.formLabel}>Artboard:</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                className={styles.textInput}
                style={{ width: 60 }}
                value={width}
                min={10}
                max={4000}
                onChange={(e) => setWidth(Number(e.target.value) || 100)}
              />
              <span style={{ fontSize: 11, color: 'var(--mx-text-subtle)' }}>×</span>
              <input
                type="number"
                className={styles.textInput}
                style={{ width: 60 }}
                value={height}
                min={10}
                max={4000}
                onChange={(e) => setHeight(Number(e.target.value) || 100)}
              />
              <span style={{ fontSize: 10, color: 'var(--mx-text-subtle)' }}>px</span>
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.formLabel}>Origin / Pivot:</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label className={styles.radioLabel} style={{ fontSize: 11 }}>
                <input
                  type="radio"
                  name="regPoint"
                  value="center"
                  checked={regPoint === 'center'}
                  onChange={() => setRegPoint('center')}
                />
                Center
              </label>
              <label className={styles.radioLabel} style={{ fontSize: 11 }}>
                <input
                  type="radio"
                  name="regPoint"
                  value="topleft"
                  checked={regPoint === 'topleft'}
                  onChange={() => setRegPoint('topleft')}
                />
                Top-Left
              </label>
            </div>
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
              Movie clip (Animated Clip)
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

export default ConvertToComponentDialog;

