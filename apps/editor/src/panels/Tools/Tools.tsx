import React, { useState, useRef } from 'react';
import type { Fill, ShapeElement, TextElement } from '@flashback/runtime';
import { fillToCSS } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  getActiveTimeline,
  type EditorTool,
} from '../../state/editorStore';
import { GradientPicker } from '../../ui/GradientPicker';
import styles from './Tools.module.css';

interface ToolItem {
  id: EditorTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

export const Tools: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const fillColor = useEditorStore((s) => s.fillColor);
  const activeFill = useEditorStore((s) => s.activeFill);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const isolationStack = useEditorStore((s) => s.isolationStack);

  const [isFillPickerOpen, setIsFillPickerOpen] = useState(false);
  const fillSwatchRef = useRef<HTMLDivElement>(null);

  const tools: ToolItem[] = [
    {
      id: 'select',
      label: 'Selection Tool',
      shortcut: 'V',
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.iconSvg}>
          <path d="M4 2 L4 16 L8 12 L11.5 18 L13.5 17 L10 11 L16 11 Z" />
        </svg>
      ),
    },
    {
      id: 'subselect',
      label: 'Subselection Tool',
      shortcut: 'A',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={styles.iconSvg}>
          <path d="M4 2 L4 16 L8 12 L11.5 18 L13.5 17 L10 11 L16 11 Z" />
        </svg>
      ),
    },
    {
      id: 'pen',
      label: 'Pen Tool',
      shortcut: 'P',
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.iconSvg}>
          <path d="M14.5 2.5 C15.5 1.5 17 1.5 18 2.5 C19 3.5 19 5 18 6 L8 16 L3 17 L4 12 Z M5.5 13 L7.5 15 M13 4 L16 7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ),
    },
    {
      id: 'text',
      label: 'Text Tool',
      shortcut: 'T',
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.iconSvg}>
          <path d="M5 4 L15 4 L15 7 L11 7 L11 16 L9 16 L9 7 L5 7 Z" />
        </svg>
      ),
    },
    {
      id: 'rect',
      label: 'Rectangle Tool',
      shortcut: 'R',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={styles.iconSvg}>
          <rect x="3" y="4" width="14" height="12" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'oval',
      label: 'Oval Tool',
      shortcut: 'O',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={styles.iconSvg}>
          <ellipse cx="10" cy="10" rx="7" ry="6" />
        </svg>
      ),
    },
    {
      id: 'polygon',
      label: 'Polygon & Star Tool',
      shortcut: 'S',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={styles.iconSvg}>
          <polygon points="10,2 12.4,7.5 18.2,7.9 13.8,11.8 15.2,17.5 10,14.4 4.8,17.5 6.2,11.8 1.8,7.9 7.6,7.5" />
        </svg>
      ),
    },
    {
      id: 'hand',
      label: 'Hand Tool (Pan Stage)',
      shortcut: 'H',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className={styles.iconSvg}>
          <path d="M7 11 L7 6 C7 5 8 5 8 6 L8 11 M9 11 L9 4 C9 3 10 3 10 4 L10 11 M11 11 L11 5 C11 4 12 4 12 5 L12 11 M13 11 L13 7 C13 6 14 6 14 7 L14 13 C14 16 12 17 10 17 C7 17 5 15 5 13 L5 9 C5 8 6 8 6 9 L7 11 Z" />
        </svg>
      ),
    },
  ];

  const handleSwapColors = () => {
    const prevFill = activeFill?.type === 'solid' ? activeFill.color : fillColor;
    editorActions.setFillColor(strokeColor);
    editorActions.setStrokeColor(prevFill);
  };

  const handleFillChange = (newFill: Fill) => {
    editorActions.setActiveFill(newFill);

    if (selectedElementIds.length > 0) {
      const activeTl = getActiveTimeline(doc, isolationStack);
      for (const layer of activeTl.layers) {
        const kf = findKeyframeAt(layer, currentFrame);
        if (!kf) continue;
        for (const el of kf.elements) {
          if (selectedElementIds.includes(el.id)) {
            if (el.type === 'shape') {
              const shape = el as ShapeElement;
              const newPaths = shape.paths.map((p, idx) =>
                idx === 0 ? { ...p, fill: newFill } : p
              );
              editorActions.updateElementProps(el.id, { paths: newPaths });
            } else if (el.type === 'text') {
              const primaryColor =
                newFill.type === 'solid'
                  ? newFill.color
                  : newFill.type === 'linearGradient' || newFill.type === 'radialGradient'
                  ? newFill.stops[0]?.color || '#ffffff'
                  : '#ffffff';
              editorActions.updateElementProps(el.id, {
                fill: newFill,
                color: primaryColor,
              });
            }
          }
        }
      }
    }
  };

  const fillCss = activeFill ? fillToCSS(activeFill) : fillColor;

  return (
    <div className={styles.toolsPanel} title="Tools">
      <div className={styles.panelHeader}>Tools</div>

      <div className={styles.toolGrid}>
        {tools.map((t) => (
          <button
            key={t.id}
            className={`${styles.toolBtn} ${activeTool === t.id ? styles.active : ''}`}
            onClick={() => editorActions.setActiveTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
            type="button"
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className={styles.separator} />

      {/* Colors Section */}
      <div className={styles.colorsSection}>
        <div className={styles.sectionLabel}>Colors</div>

        <div className={styles.swatchesContainer}>
          {/* Stroke Swatch */}
          <div
            className={styles.strokeSwatch}
            style={{ backgroundColor: strokeColor }}
            title={`Stroke: ${strokeColor}`}
          >
            <input
              type="color"
              className={styles.hiddenColorInput}
              value={strokeColor.length === 7 ? strokeColor : '#000000'}
              onChange={(e) => editorActions.setStrokeColor(e.target.value)}
            />
          </div>

          {/* Fill Swatch */}
          <div
            ref={fillSwatchRef}
            className={styles.fillSwatch}
            style={{ background: fillCss }}
            title="Click to edit Fill / Gradient"
            onClick={() => setIsFillPickerOpen(!isFillPickerOpen)}
          />

          {isFillPickerOpen && (
            <GradientPicker
              fill={activeFill ?? { type: 'solid', color: fillColor }}
              onChange={handleFillChange}
              onClose={() => setIsFillPickerOpen(false)}
              anchorRef={fillSwatchRef}
              title="Fill & Gradient"
            />
          )}
        </div>

        <button
          type="button"
          className={styles.swapBtn}
          onClick={handleSwapColors}
          title="Swap Stroke & Fill (X)"
        >
          ⇄
        </button>
      </div>
    </div>
  );
};
