import React, { useState } from 'react';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Dialog.module.css';

export const ImportModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.importModalOpen);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoad = () => {
    if (!code.trim()) {
      setError('Please paste or load valid animation JavaScript code.');
      return;
    }

    const res = editorActions.loadFromJS(code);
    if (res.success) {
      setError(null);
      editorActions.setImportModalOpen(false);
    } else {
      setError(res.error || 'Failed to parse document.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setCode(text);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={() => editorActions.setImportModalOpen(false)}
    >
      <div className={styles.dialogWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <span>Open Animation File (.anim.js)</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => editorActions.setImportModalOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11 }}>Choose File:</span>
            <input type="file" accept=".js,.mjs" onChange={handleFileUpload} />
          </div>

          <p style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>
            Or paste ES module JavaScript animation code below:
          </p>

          <textarea
            className={styles.codeArea}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="export default { version: 1, stage: {...}, library: {...}, root: {...} };"
            spellCheck={false}
          />

          {error && (
            <div style={{ color: '#d83b01', fontSize: 11, fontWeight: 'bold' }}>
              Error: {error}
            </div>
          )}
        </div>

        <div className={styles.dialogFooter}>
          <button type="button" className={styles.dialogBtn} onClick={handleLoad}>
            Parse & Open
          </button>
          <button
            type="button"
            className={styles.dialogBtn}
            onClick={() => editorActions.setImportModalOpen(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
