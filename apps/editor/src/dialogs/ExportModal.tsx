import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Dialog.module.css';

export const ExportModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.exportModalOpen);
  const doc = useEditorStore((s) => s.doc);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'esm' | 'json'>('esm');

  if (!isOpen) return null;

  const code = editorActions.exportToJS(format);
  const byteSize = new Blob([code]).size;
  const formattedSize =
    byteSize < 1024 ? `${byteSize} B` : `${(byteSize / 1024).toFixed(2)} KB`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const ext = format === 'json' ? 'anim.json' : 'anim.js';
    const mime =
      format === 'json' ? 'application/json;charset=utf-8' : 'application/javascript;charset=utf-8';
    const filename = `${doc.meta.name || 'animation'}.${ext}`;
    const blob = new Blob([code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <div
      className={styles.modalOverlay}
      onClick={() => editorActions.setExportModalOpen(false)}
    >
      <div className={styles.dialogWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <span>Export Animation ({format === 'json' ? '.anim.json' : '.anim.js'}) — {formattedSize}</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => editorActions.setExportModalOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogBody}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>
              Concise schema output (defaults omitted). Ready for &lt;web-anim&gt;:
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={styles.dialogBtn}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  borderColor: format === 'esm' ? 'var(--mx-accent)' : undefined,
                }}
                onClick={() => setFormat('esm')}
              >
                ES Module (.js)
              </button>
              <button
                type="button"
                className={styles.dialogBtn}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  borderColor: format === 'json' ? 'var(--mx-accent)' : undefined,
                }}
                onClick={() => setFormat('json')}
              >
                JSON (.json)
              </button>
            </div>
          </div>
          <textarea
            className={styles.codeArea}
            readOnly
            value={code}
            spellCheck={false}
          />
        </div>

        <div className={styles.dialogFooter}>
          <button type="button" className={styles.dialogBtn} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button type="button" className={styles.dialogBtn} onClick={handleDownload}>
            Download {format === 'json' ? '.json' : '.js'}
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

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default ExportModal;

