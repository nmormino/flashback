import React, { useState } from 'react';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Dialog.module.css';

export const ExportModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.exportModalOpen);
  const doc = useEditorStore((s) => s.doc);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const jsCode = editorActions.exportToJS();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const filename = `${doc.meta.name || 'animation'}.anim.js`;
    const blob = new Blob([jsCode], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={() => editorActions.setExportModalOpen(false)}
    >
      <div className={styles.dialogWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <span>Export Animation Module (.anim.js)</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => editorActions.setExportModalOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogBody}>
          <p style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>
            Serialized using @flashback/serializer. Fully compatible with &lt;web-anim&gt; and ES modules:
          </p>
          <textarea
            className={styles.codeArea}
            readOnly
            value={jsCode}
            spellCheck={false}
          />
        </div>

        <div className={styles.dialogFooter}>
          <button type="button" className={styles.dialogBtn} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button type="button" className={styles.dialogBtn} onClick={handleDownload}>
            Download .js
          </button>
          <button
            type="button"
            className={styles.dialogBtn}
            onClick={() => editorActions.setExportModalOpen(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
