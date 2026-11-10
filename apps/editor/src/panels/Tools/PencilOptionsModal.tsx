import React, { useRef } from 'react';
import { Pencil, X, Check, Sliders } from 'lucide-react';
import { useEditorStore, editorActions } from '../../state/editorStore';
import styles from './Tools.module.css';

export const PencilOptionsModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.isPencilOptionsOpen);
  const pencilConfig = useEditorStore((s) => s.pencilConfig);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);

  const [position, setPosition] = React.useState({ x: 62, y: 140 });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  if (!isOpen) return null;

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 240, moveEvt.clientX - dragOffsetRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 180, moveEvt.clientY - dragOffsetRef.current.y));
      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const hasSelectedShape = selectedElementIds.length > 0;

  const handleSmoothnessChange = (val: number) => {
    editorActions.setPencilConfig({ smoothness: val });
  };

  return (
    <div
      className={styles.pencilOptionsWindow}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      data-testid="pencil-options-floating-window"
    >
      <div className={styles.optionsHeader} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.optionsHeaderTitle}>
          <Pencil size={13} style={{ color: 'var(--mx-accent, #3b82f6)' }} />
          <span>Pencil Tool Options</span>
        </div>
        <button
          type="button"
          className={styles.closeWindowBtn}
          onClick={() => editorActions.setPencilOptionsOpen(false)}
          title="Close Pencil Options"
          data-testid="close-pencil-options-btn"
        >
          <X size={12} />
        </button>
      </div>

      <div className={styles.optionsBody}>
        {/* Live status badge */}
        {hasSelectedShape && (
          <div className={styles.liveSelectedNotice} data-testid="pencil-live-adjust-notice">
            <span className={styles.liveNoticeDot}>●</span>
            <span>Live adjusting selected vector line</span>
          </div>
        )}

        {/* Fidelity & Smoothness */}
        <div className={styles.optionsSection}>
          <div className={styles.optionsRowHeader}>
            <span className={styles.optionsLabel}>Fidelity / Smoothness:</span>
            <span className={styles.smoothnessValueBadge} data-testid="pencil-smoothness-badge">
              {pencilConfig.smoothness}%
            </span>
          </div>

          <div className={styles.sliderContainer}>
            <span className={styles.sliderEndpoint}>Accurate</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={pencilConfig.smoothness}
              onChange={(e) => handleSmoothnessChange(parseInt(e.target.value, 10) || 0)}
              className={styles.optionsSlider}
              data-testid="pencil-smoothness-slider"
              aria-label="Pencil smoothness slider"
            />
            <span className={styles.sliderEndpoint}>Smooth</span>
          </div>

          <div className={styles.presetButtonGroup}>
            <button
              type="button"
              className={`${styles.presetBtn} ${pencilConfig.smoothness <= 20 ? styles.activePreset : ''}`}
              onClick={() => handleSmoothnessChange(10)}
              data-testid="preset-accurate-btn"
            >
              Accurate (10%)
            </button>
            <button
              type="button"
              className={`${styles.presetBtn} ${pencilConfig.smoothness > 20 && pencilConfig.smoothness < 75 ? styles.activePreset : ''}`}
              onClick={() => handleSmoothnessChange(50)}
              data-testid="preset-balanced-btn"
            >
              Balanced (50%)
            </button>
            <button
              type="button"
              className={`${styles.presetBtn} ${pencilConfig.smoothness >= 75 ? styles.activePreset : ''}`}
              onClick={() => handleSmoothnessChange(85)}
              data-testid="preset-smooth-btn"
            >
              Smooth (85%)
            </button>
          </div>
        </div>

        {/* Behavioral Options Checkboxes */}
        <div className={styles.checkboxSection}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={pencilConfig.fillNewStrokes ?? false}
              onChange={(e) => editorActions.setPencilConfig({ fillNewStrokes: e.target.checked })}
              data-testid="pencil-fill-strokes-checkbox"
            />
            <span>Fill new pencil strokes</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={pencilConfig.keepSelected ?? true}
              onChange={(e) => editorActions.setPencilConfig({ keepSelected: e.target.checked })}
              data-testid="pencil-keep-selected-checkbox"
            />
            <span>Keep selected after drawing</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={pencilConfig.editSelectedPaths ?? true}
              onChange={(e) => editorActions.setPencilConfig({ editSelectedPaths: e.target.checked })}
              data-testid="pencil-edit-selected-checkbox"
            />
            <span>Edit selected paths</span>
          </label>
        </div>

        <div className={styles.optionsFooter}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={() => handleSmoothnessChange(50)}
            data-testid="pencil-reset-defaults-btn"
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.doneBtn}
            onClick={() => editorActions.setPencilOptionsOpen(false)}
            data-testid="pencil-done-btn"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
