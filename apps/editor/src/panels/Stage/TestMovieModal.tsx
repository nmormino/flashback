import React, { useEffect, useRef, useState } from 'react';
import type { WebAnim } from '@flashback/runtime';
import '@flashback/runtime';
import { hydrate } from '@flashback/serializer';
import { useEditorStore, editorActions } from '../../state/editorStore';
import styles from './TestMovieModal.module.css';

export const TestMovieModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.testMovieOpen);
  const doc = useEditorStore((s) => s.doc);
  const webAnimRef = useRef<WebAnim | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    try {
      const animDoc = hydrate(doc);
      if (webAnimRef.current) {
        webAnimRef.current.animation = animDoc;
        webAnimRef.current.play();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [isOpen, doc]);

  if (!isOpen) return null;

  const width = doc.stage.width || 550;
  const height = doc.stage.height || 400;
  const fps = doc.stage.fps || 24;

  const handleRewind = () => {
    if (webAnimRef.current) {
      webAnimRef.current.gotoAndPlay(1);
    }
  };

  const handleStep = () => {
    if (webAnimRef.current) {
      const cur = webAnimRef.current.currentFrame;
      const total = webAnimRef.current.totalFrames;
      const next = (cur % total) + 1;
      webAnimRef.current.gotoAndStop(next);
    }
  };

  const handleTogglePlay = () => {
    if (webAnimRef.current) {
      if (webAnimRef.current.isPlaying) {
        webAnimRef.current.stop();
      } else {
        webAnimRef.current.play();
      }
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={() => editorActions.setTestMovieOpen(false)}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <div className={styles.titleText}>
            <span>Flash Player — {doc.meta.name || 'Untitled'}.swf</span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => editorActions.setTestMovieOpen(false)}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className={styles.playerMatte}>
          <div
            className={styles.playerViewport}
            style={{
              width: `${width}px`,
              height: `${height}px`,
            }}
          >
            {errorMsg ? (
              <div style={{ color: 'red', padding: 12, fontFamily: 'monospace' }}>
                Error compiling scripts: {errorMsg}
              </div>
            ) : (
              <web-anim
                ref={(el: HTMLElement | null) => {
                  webAnimRef.current = el as WebAnim | null;
                  if (el && webAnimRef.current && !webAnimRef.current.animation) {
                    try {
                      const animDoc = hydrate(doc);
                      webAnimRef.current.animation = animDoc;
                      webAnimRef.current.play();
                    } catch (e: unknown) {
                      setErrorMsg(e instanceof Error ? e.message : String(e));
                    }
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                }}
              />
            )}
          </div>
        </div>

        <div className={styles.controlsBar}>
          <button type="button" className={styles.controlBtn} onClick={handleRewind}>
            Rewind
          </button>
          <button type="button" className={styles.controlBtn} onClick={handleTogglePlay}>
            Play / Pause
          </button>
          <button type="button" className={styles.controlBtn} onClick={handleStep}>
            Step
          </button>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => editorActions.setTestMovieOpen(false)}
          >
            Close
          </button>
          <span className={styles.fpsBadge}>{fps} fps</span>
        </div>
      </div>
    </div>
  );
};
