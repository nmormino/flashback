import React, { useState, useRef } from 'react';
import type { ShapeElement, TextElement, SymbolInstance, Fill, Transform } from '@flashback/runtime';
import { fillToCSS } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  getActiveTimeline,
  type EditorElement,
} from '../../state/editorStore';
import { LayerFiltersManager } from '../Layers/Layers';
import { GradientPicker } from '../../ui/GradientPicker';
import { getElementBounds } from '../Stage/Stage';
import { getWeightLabel, STANDARD_WEIGHTS } from '../../utils/fontParser';
import styles from './Properties.module.css';

export const Properties: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const isolationStack = useEditorStore((s) => s.isolationStack);
  const textSelection = useEditorStore((s) => s.textSelection);

  const [shapeGradientOpen, setShapeGradientOpen] = useState(false);
  const [textGradientOpen, setTextGradientOpen] = useState(false);
  const [stageGradientOpen, setStageGradientOpen] = useState(false);
  const shapeFillRef = useRef<HTMLDivElement>(null);
  const textFillRef = useRef<HTMLDivElement>(null);
  const stageFillRef = useRef<HTMLDivElement>(null);

  const activeTl = getActiveTimeline(doc, isolationStack);

  // Find the first selected element
  let selectedEl: EditorElement | null = null;
  for (const layer of activeTl.layers) {
    const kf = findKeyframeAt(layer, currentFrame);
    if (!kf) continue;
    const found = kf.elements.find((e) => selectedElementIds.includes(e.id));
    if (found) {
      selectedEl = found;
      break;
    }
  }

  // If no element is selected, show Layer Properties & Stage Properties
  if (!selectedEl) {
    const selectedLayer =
      activeTl.layers.find((l) => l.id === selectedLayerId) ?? activeTl.layers[0];
    const width = doc.stage.width || 550;
    const height = doc.stage.height || 400;
    const fps = doc.stage.fps || 24;

    const bg = doc.stage.background;
    const isTransparent = !bg || bg.type === 'none';
    const solidColor = bg && bg.type === 'solid' ? (bg as { color: string }).color : '#ffffff';

    const handleSetTransparentBg = () => {
      editorActions.updateStageProps({
        background: { type: 'none' },
      });
    };

    const handleSetSolidBg = (color: string) => {
      editorActions.updateStageProps({
        background: { type: 'solid', color },
      });
    };

    const handleSetPresetSize = (w: number, h: number) => {
      editorActions.updateStageProps({ width: w, height: h });
    };

    const handleSetPresetFps = (targetFps: number) => {
      editorActions.updateStageProps({ fps: targetFps });
    };

    const bgSwatches = [
      { name: 'White', color: '#ffffff' },
      { name: 'Black', color: '#000000' },
      { name: 'Dark Studio', color: '#16171a' },
      { name: 'Cool Slate', color: '#334155' },
      { name: 'Accent Blue', color: '#1d4ed8' },
    ];

    return (
      <div className={styles.propertiesContainer}>
        {/* Layer CSS Filters Section */}
        {selectedLayer && (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle}>
              <span>Layer: {selectedLayer.name}</span>
            </div>
            <LayerFiltersManager layer={selectedLayer} />
          </div>
        )}

        {/* Document Dimensions */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>Document Dimensions</div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Size:</span>
            <input
              type="number"
              className={styles.textInput}
              value={width}
              onChange={(e) =>
                editorActions.updateStageProps({ width: parseInt(e.target.value, 10) || 550 })
              }
              title="Stage Width (px)"
            />
            <span style={{ color: 'var(--mx-text-muted)' }}>×</span>
            <input
              type="number"
              className={styles.textInput}
              value={height}
              onChange={(e) =>
                editorActions.updateStageProps({ height: parseInt(e.target.value, 10) || 400 })
              }
              title="Stage Height (px)"
            />
          </div>
          <div className={styles.presetPills}>
            <button
              type="button"
              className={`${styles.presetPill} ${width === 550 && height === 400 ? styles.active : ''}`}
              onClick={() => handleSetPresetSize(550, 400)}
            >
              550×400
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${width === 1920 && height === 1080 ? styles.active : ''}`}
              onClick={() => handleSetPresetSize(1920, 1080)}
            >
              1080p
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${width === 1080 && height === 1080 ? styles.active : ''}`}
              onClick={() => handleSetPresetSize(1080, 1080)}
            >
              Square
            </button>
          </div>
        </div>

        {/* Playback & Target FPS */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>Playback Framerate</div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>FPS:</span>
            <input
              type="number"
              className={styles.textInput}
              value={fps}
              onChange={(e) =>
                editorActions.updateStageProps({ fps: parseInt(e.target.value, 10) || 60 })
              }
              title="Target FPS (Default: Native / 60 FPS)"
            />
          </div>
          <div className={styles.presetPills}>
            <button
              type="button"
              className={`${styles.presetPill} ${fps === 60 ? styles.active : ''}`}
              onClick={() => handleSetPresetFps(60)}
              title="Smooth 60 FPS Native Web Animation"
            >
              Native (60)
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${fps === 30 ? styles.active : ''}`}
              onClick={() => handleSetPresetFps(30)}
            >
              30 FPS
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${fps === 24 ? styles.active : ''}`}
              onClick={() => handleSetPresetFps(24)}
            >
              24 FPS (Flash)
            </button>
          </div>
          <div className={styles.helperNote}>
            Runs at smooth 60fps WAAPI in browser
          </div>
        </div>

        {/* Background Color & Alpha */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>Stage Background</div>
          <div className={styles.swatchesRow}>
            {/* Transparent option button */}
            <button
              type="button"
              className={`${styles.swatchBtn} ${styles.swatchTransparent} ${
                isTransparent ? styles.active : ''
              }`}
              onClick={handleSetTransparentBg}
              title="Transparent Background (Alpha Grid)"
            >
              {isTransparent ? '✓' : ''}
            </button>

            {/* Quick solid swatches */}
            {bgSwatches.map((s) => {
              const isMatch = !isTransparent && solidColor.toLowerCase() === s.color.toLowerCase();
              return (
                <button
                  key={s.color}
                  type="button"
                  className={`${styles.swatchBtn} ${isMatch ? styles.active : ''}`}
                  style={{ backgroundColor: s.color }}
                  onClick={() => handleSetSolidBg(s.color)}
                  title={`${s.name} (${s.color})`}
                >
                  {isMatch ? (s.color === '#ffffff' ? '✓' : '✓') : ''}
                </button>
              );
            })}

            {/* Fill & Gradient swatch button */}
            <div
              ref={stageFillRef}
              style={{
                width: 24,
                height: 20,
                borderRadius: 3,
                border: '1px solid var(--mx-border, #333842)',
                background: bg ? fillToCSS(bg) : '#ffffff',
                cursor: 'pointer',
              }}
              onClick={() => setStageGradientOpen(!stageGradientOpen)}
              title="Click to edit Stage Fill & Gradient"
            />

            {stageGradientOpen && (
              <GradientPicker
                fill={bg ?? { type: 'solid', color: '#ffffff' }}
                onChange={(newFill) => editorActions.updateStageProps({ background: newFill })}
                onClose={() => setStageGradientOpen(false)}
                anchorRef={stageFillRef}
                title="Stage Fill & Gradient"
              />
            )}
          </div>

          <div className={styles.fieldRow} style={{ marginTop: 4 }}>
            <span className={styles.fieldLabel}>Value:</span>
            <input
              type="text"
              className={styles.textInput}
              value={isTransparent ? 'Transparent' : (bg && bg.type !== 'solid' ? bg.type : solidColor)}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (val.toLowerCase() === 'transparent' || val.toLowerCase() === 'none') {
                  handleSetTransparentBg();
                } else if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                  handleSetSolidBg(val);
                }
              }}
              placeholder="#ffffff"
            />
          </div>
        </div>
      </div>
    );
  }

  // An element is selected: show element properties
  const {
    x,
    y,
    scaleX = 1,
    scaleY = 1,
    rotation = 0,
    skewX = 0,
    skewY = 0,
    rotateX = 0,
    rotateY = 0,
    originX = 0,
    originY = 0,
  } = selectedEl.transform;
  const alphaPercent = Math.round((selectedEl.alpha ?? 1) * 100);
  const instanceName = (selectedEl as SymbolInstance).instanceName || '';

  const handleUpdateTransform = (partial: Partial<Transform>) => {
    if (!selectedEl) return;
    editorActions.updateElementTransform(selectedEl.id, partial);
  };

  const handleUpdateAlpha = (percent: number) => {
    if (!selectedEl) return;
    const val = Math.max(0, Math.min(100, percent)) / 100;
    editorActions.updateElementProps(selectedEl.id, { alpha: val });
  };

  const handleUpdateInstanceName = (name: string) => {
    if (!selectedEl) return;
    editorActions.updateElementProps(selectedEl.id, {
      instanceName: name.replace(/[^a-zA-Z0-9_]/g, ''),
    });
  };

  // Shape specific properties
  const isShape = selectedEl.type === 'shape';
  const shapeEl = isShape ? (selectedEl as ShapeElement) : null;
  const currentPath = shapeEl?.paths[0];
  const shapeFill: Fill =
    currentPath?.fill ?? { type: 'solid', color: '#3b82f6' };
  const currentFill =
    shapeFill.type === 'solid'
      ? shapeFill.color
      : shapeFill.type === 'linearGradient' || shapeFill.type === 'radialGradient'
      ? shapeFill.stops[0]?.color ?? '#3b82f6'
      : '#3b82f6';
  const currentStroke =
    currentPath?.stroke?.fill && currentPath.stroke.fill.type === 'solid'
      ? (currentPath.stroke.fill as { color: string }).color
      : '#000000';
  const currentStrokeWidth = currentPath?.stroke?.width ?? 0;

  const handleUpdateShapeFill = (fillOrColor: Fill | string) => {
    if (!shapeEl || !currentPath) return;
    const newFill: Fill =
      typeof fillOrColor === 'string'
        ? { type: 'solid' as const, color: fillOrColor }
        : fillOrColor;
    const newPaths = shapeEl.paths.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          fill: newFill,
        };
      }
      return p;
    });
    editorActions.updateElementProps(shapeEl.id, { paths: newPaths });
  };

  const handleUpdateShapeStroke = (color: string) => {
    if (!shapeEl || !currentPath) return;
    const newPaths = shapeEl.paths.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          stroke: {
            fill: { type: 'solid' as const, color },
            width: p.stroke?.width ?? 1,
            cap: p.stroke?.cap ?? 'round',
            join: p.stroke?.join ?? 'round',
            dash: p.stroke?.dash,
          },
        };
      }
      return p;
    });
    editorActions.updateElementProps(shapeEl.id, { paths: newPaths });
  };

  const handleUpdateShapeStrokeWidth = (width: number) => {
    if (!shapeEl || !currentPath) return;
    const newPaths = shapeEl.paths.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          stroke: {
            fill: p.stroke?.fill ?? { type: 'solid' as const, color: '#000000' },
            width,
            cap: p.stroke?.cap ?? 'round',
            join: p.stroke?.join ?? 'round',
            dash: p.stroke?.dash,
          },
        };
      }
      return p;
    });
    editorActions.updateElementProps(shapeEl.id, { paths: newPaths });
  };

  // Text specific properties
  const isText = selectedEl.type === 'text';
  const textEl = isText ? (selectedEl as TextElement) : null;

  return (
    <div className={styles.propertiesContainer}>
      {/* Element Identity */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>
          Element <span className={styles.typeBadge}>{selectedEl.type === 'instance' ? 'Component Instance' : selectedEl.type}</span>
        </div>
        {selectedEl.type === 'instance' && (() => {
          const inst = selectedEl as SymbolInstance;
          const sym = doc.library.symbols[inst.symbolId];
          const compName = sym?.name || 'Component';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--mx-accent, #3b82f6)' }}>
                  ❖ Component Instance: {compName}
                </span>
                <button
                  type="button"
                  className={styles.editMasterBtn}
                  onClick={() => editorActions.enterIsolation(inst.symbolId)}
                  title="Edit Master Component in isolation mode"
                >
                  ↗ Edit Master Component
                </button>
              </div>

              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel} style={{ width: '135px' }}>
                  Instance Script Name:
                </span>
                <input
                  type="text"
                  className={styles.textInput}
                  style={{ flex: 1 }}
                  value={instanceName}
                  placeholder="e.g. myButton"
                  onChange={(e) => handleUpdateInstanceName(e.target.value)}
                  title="Identifier for scripting (e.g. myButton)"
                />
              </div>

              <button
                type="button"
                className={styles.editScriptBtn}
                onClick={() => editorActions.setActiveInspectorTab('scripts')}
                title="Open script editor targeting this component instance"
              >
                ⚡ Edit Component Script
              </button>
            </div>
          );
        })()}
        {isText && textEl && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Text:</span>
            <input
              type="text"
              className={styles.textInput}
              style={{ width: '100px' }}
              value={textEl.text}
              onChange={(e) =>
                editorActions.updateElementProps(selectedEl.id, { text: e.target.value })
              }
            />
          </div>
        )}
      </div>

      {/* Rich Typography Controls for Text Elements */}
      {isText && textEl && (() => {
        const activeFont = textEl.fontId ? doc.library.fonts[textEl.fontId] : undefined;
        const isVariable = Boolean(activeFont?.variableRange);
        const variableRange = activeFont?.variableRange;

        let discreteWeights: number[] | null = null;
        if (activeFont && !isVariable) {
          if (activeFont.availableWeights && activeFont.availableWeights.length > 0) {
            discreteWeights = activeFont.availableWeights;
          } else if (Array.isArray(activeFont.weight)) {
            discreteWeights = activeFont.weight;
          } else if (typeof activeFont.weight === 'number') {
            discreteWeights = [activeFont.weight];
          }
        }

        const currentWeightNum =
          typeof textEl.fontWeight === 'number'
            ? textEl.fontWeight
            : parseInt(String(textEl.fontWeight), 10) || 400;

        let regularWeight = 400;
        let boldWeight = 700;

        if (isVariable && variableRange) {
          regularWeight =
            variableRange.min <= 400 && variableRange.max >= 400 ? 400 : variableRange.min;
          boldWeight =
            variableRange.min <= 700 && variableRange.max >= 700 ? 700 : variableRange.max;
        } else if (discreteWeights && discreteWeights.length > 0) {
          regularWeight = discreteWeights.includes(400) ? 400 : discreteWeights[0];
          const highWeights = discreteWeights.filter((w) => w >= 600);
          boldWeight =
            highWeights.length > 0
              ? discreteWeights.includes(700)
                ? 700
                : highWeights[0]
              : discreteWeights[discreteWeights.length - 1];
        }

        const isBoldActive =
          boldWeight > regularWeight
            ? currentWeightNum >= boldWeight
            : currentWeightNum > regularWeight;

        const supportsItalic = activeFont
          ? (activeFont.availableStyles
              ? activeFont.availableStyles.includes('italic')
              : activeFont.style === 'italic' || activeFont.style === 'all')
          : true;

        return (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle}>
              <span>Typography</span>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                onClick={() => editorActions.setAddFontModalOpen(true)}
                title="Import a new web font (.woff2 or Google Fonts)"
              >
                + Add Font
              </button>
            </div>

            {/* Font Family Dropdown */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Family:</span>
              <select
                className={styles.selectInput}
                value={textEl.fontId || 'default'}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') {
                    editorActions.setAddFontModalOpen(true);
                  } else {
                    const newFontId = e.target.value;
                    const targetFont = doc.library.fonts[newFontId];
                    let nextWeight = textEl.fontWeight;
                    if (targetFont) {
                      if (targetFont.variableRange) {
                        const num = typeof nextWeight === 'number' ? nextWeight : 400;
                        if (num < targetFont.variableRange.min) nextWeight = targetFont.variableRange.min;
                        else if (num > targetFont.variableRange.max) nextWeight = targetFont.variableRange.max;
                      } else if (targetFont.availableWeights && targetFont.availableWeights.length > 0) {
                        const num = typeof nextWeight === 'number' ? nextWeight : 400;
                        if (!targetFont.availableWeights.includes(num)) {
                          nextWeight = targetFont.availableWeights.reduce((prev, curr) =>
                            Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev
                          );
                        }
                      }
                    }
                    editorActions.updateElementProps(textEl.id, {
                      fontId: newFontId,
                      fontWeight: nextWeight,
                    });
                  }
                }}
              >
                <optgroup label="System Fonts">
                  <option value="default">Inter / Default Sans</option>
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Impact">Impact</option>
                </optgroup>
                {Object.keys(doc.library.fonts).length > 0 && (
                  <optgroup label="Imported Web Fonts">
                    {Object.values(doc.library.fonts).map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.family}
                        {font.variableRange
                          ? ` (Variable ${font.variableRange.min}–${font.variableRange.max})`
                          : font.availableWeights && font.availableWeights.length > 1
                          ? ` (${font.availableWeights.length} weights)`
                          : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__add_new__">+ Import Web Font...</option>
              </select>
            </div>

            {/* Font Size & Weight Control */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Size:</span>
              <input
                type="number"
                min="6"
                max="200"
                className={styles.textInput}
                style={{ width: isVariable ? '56px' : '48px' }}
                value={textEl.fontSize || 16}
                onChange={(e) => {
                  const sz = parseInt(e.target.value, 10) || 16;
                  editorActions.updateElementProps(textEl.id, {
                    fontSize: sz,
                  });
                }}
                title="Font Size (px)"
              />
              {!isVariable && (
                <select
                  className={styles.selectInput}
                  style={{ flex: 1, minWidth: '95px' }}
                  value={currentWeightNum}
                  onChange={(e) => {
                    const wt = parseInt(e.target.value, 10) || e.target.value;
                    editorActions.updateElementProps(textEl.id, {
                      fontWeight: wt,
                    });
                  }}
                  title="Font Weight"
                >
                  {discreteWeights
                    ? discreteWeights.map((w) => (
                        <option key={w} value={w}>
                          {getWeightLabel(w)}
                        </option>
                      ))
                    : STANDARD_WEIGHTS.map((sw) => (
                        <option key={sw.value} value={sw.value}>
                          {sw.label}
                        </option>
                      ))}
                </select>
              )}
            </div>

            {/* Variable Font Slider & Numeric Input */}
            {isVariable && variableRange && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '2px 0 6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                    Weight:
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    Variable Font ({variableRange.min}–{variableRange.max})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min={variableRange.min}
                    max={variableRange.max}
                    step={1}
                    value={currentWeightNum}
                    style={{ flex: 1, accentColor: 'var(--mx-accent, #3b82f6)', cursor: 'pointer' }}
                    onChange={(e) => {
                      const wt = parseInt(e.target.value, 10);
                      editorActions.updateElementProps(textEl.id, {
                        fontWeight: wt,
                      });
                    }}
                    title={`Variable Weight (${variableRange.min}–${variableRange.max})`}
                  />
                  <input
                    type="number"
                    min={variableRange.min}
                    max={variableRange.max}
                    className={styles.textInput}
                    style={{ width: '48px', textAlign: 'center' }}
                    value={currentWeightNum}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) {
                        const clamped = Math.min(
                          variableRange.max,
                          Math.max(variableRange.min, v)
                        );
                        editorActions.updateElementProps(textEl.id, { fontWeight: clamped });
                      }
                    }}
                    title="Exact Numeric Weight"
                  />
                </div>
              </div>
            )}

            {/* Style Buttons: Bold, Italic, Underline */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Style:</span>
              <div className={styles.alignBtnGroup}>
                <button
                  type="button"
                  className={`${styles.alignBtn} ${isBoldActive ? styles.active : ''}`}
                  style={{ fontWeight: 'bold' }}
                  onClick={() => {
                    const nextWeight = isBoldActive ? regularWeight : boldWeight;
                    editorActions.updateElementProps(textEl.id, {
                      fontWeight: nextWeight,
                    });
                  }}
                  title={`Bold (${regularWeight} ↔ ${boldWeight})`}
                >
                  B
                </button>
                <button
                  type="button"
                  className={`${styles.alignBtn} ${
                    textEl.fontStyle === 'italic' ? styles.active : ''
                  }`}
                  style={{
                    fontStyle: 'italic',
                    fontFamily: 'serif',
                    position: 'relative',
                    opacity: !supportsItalic ? 0.8 : 1,
                  }}
                  onClick={() => {
                    const nextStyle = textEl.fontStyle === 'italic' ? 'normal' : 'italic';
                    editorActions.updateElementProps(textEl.id, {
                      fontStyle: nextStyle,
                    });
                  }}
                  title={
                    supportsItalic
                      ? 'Italic (fontStyle: italic)'
                      : 'Italic not provided by font (browser faux italic will be used)'
                  }
                >
                  I
                  {!supportsItalic && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '1px',
                        right: '2px',
                        fontSize: '8px',
                        lineHeight: 1,
                        color: '#f59e0b',
                      }}
                      title="Faux italic warning"
                    >
                      *
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.alignBtn} ${
                    textEl.textDecoration === 'underline' ? styles.active : ''
                  }`}
                  style={{ textDecoration: 'underline' }}
                  onClick={() => {
                    const nextDec =
                      textEl.textDecoration === 'underline' ? 'none' : 'underline';
                    editorActions.updateElementProps(textEl.id, {
                      textDecoration: nextDec,
                    });
                  }}
                  title="Underline (textDecoration: underline)"
                >
                  U
                </button>
              </div>
            </div>

            {!supportsItalic && textEl.fontStyle === 'italic' && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#f59e0b',
                  padding: '2px 0 2px 70px',
                  lineHeight: 1.2,
                }}
              >
                ⚠️ Faux italic synthesized by browser
              </div>
            )}

            {/* Line Height & Letter Spacing */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Spacing:</span>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="3.0"
                className={styles.textInput}
                style={{ width: '48px' }}
                value={textEl.lineHeight ?? 1.2}
                onChange={(e) =>
                  editorActions.updateElementProps(textEl.id, {
                    lineHeight: parseFloat(e.target.value) || 1.2,
                  })
                }
                title="Line Height (e.g. 1.2)"
              />
              <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>LH</span>
              <input
                type="number"
                step="0.5"
                min="-5"
                max="50"
                className={styles.textInput}
                style={{ width: '48px' }}
                value={textEl.letterSpacing ?? 0}
                onChange={(e) => {
                  const ls = parseFloat(e.target.value) || 0;
                  editorActions.updateElementProps(textEl.id, {
                    letterSpacing: ls,
                  });
                }}
                title="Letter Spacing (px)"
              />
              <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>LS</span>
            </div>

            {/* Alignment & Text Color / Gradient */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Align:</span>
              <div className={styles.alignBtnGroup}>
                {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`${styles.alignBtn} ${
                      (textEl.align || 'left') === a ? styles.active : ''
                    }`}
                    onClick={() => editorActions.updateElementProps(textEl.id, { align: a })}
                    title={`Align ${a}`}
                  >
                    {a === 'left' ? '⯇' : a === 'center' ? '☰' : a === 'right' ? '⯈' : '☷'}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Wrapping & Box Dimensions */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Wrap Text:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={Boolean(textEl.multiline)}
                  onChange={(e) =>
                    editorActions.updateElementProps(textEl.id, { multiline: e.target.checked })
                  }
                />
                <span>Soft wrap text to box</span>
              </label>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Box Size:</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                <input
                  type="number"
                  min="20"
                  max="2000"
                  className={styles.textInput}
                  style={{ width: '56px' }}
                  value={Math.round(textEl.width || 120)}
                  onChange={(e) => {
                    const w = parseInt(e.target.value, 10) || 120;
                    editorActions.updateElementProps(textEl.id, { width: w });
                  }}
                  title="Box Width (px) - text wraps at this boundary"
                />
                <span style={{ color: 'var(--mx-text-muted)' }}>×</span>
                <input
                  type="number"
                  min="15"
                  max="2000"
                  className={styles.textInput}
                  style={{ width: '56px' }}
                  value={Math.round(textEl.height || 32)}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10) || 32;
                    editorActions.updateElementProps(textEl.id, { height: h });
                  }}
                  title="Box Height (px)"
                />
              </div>
            </div>

            {/* Text Aligned to Path Animation (<textPath>) */}
            <div className={styles.fieldRow} style={{ marginTop: 8 }}>
              <span className={styles.fieldLabel}>Text Path:</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. M 0 30 Q 100 0 200 30"
                  value={textEl.pathConfig?.pathData || ''}
                  onChange={(e) => {
                    const pData = e.target.value.trim();
                    if (pData) {
                      editorActions.updateElementProps(textEl.id, {
                        pathConfig: {
                          ...textEl.pathConfig,
                          pathData: pData,
                          startOffset: textEl.pathConfig?.startOffset ?? 0,
                        },
                      });
                    } else {
                      editorActions.updateElementProps(textEl.id, { pathConfig: undefined });
                    }
                  }}
                  title="SVG Path data 'd' for text to follow along"
                />

                {textEl.pathConfig?.pathData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--mx-text-muted)', width: 38 }}>
                      Offset:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      className={styles.rangeSlider}
                      value={textEl.pathConfig.startOffset ?? 0}
                      onChange={(e) => {
                        const off = parseInt(e.target.value, 10) || 0;
                        editorActions.updateElementProps(textEl.id, {
                          pathConfig: {
                            ...textEl.pathConfig!,
                            startOffset: off,
                          },
                        });
                      }}
                    />
                    <span style={{ fontSize: 11, minWidth: 32, fontFamily: 'var(--mx-font-mono)' }}>
                      {textEl.pathConfig.startOffset ?? 0}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Text Fill / Gradient */}
            {(() => {
              const textFill: Fill =
                textEl.fill ??
                (textEl.color ? { type: 'solid', color: textEl.color } : { type: 'solid', color: '#ffffff' });
              const textFillCSS = fillToCSS(textFill);

              return (
                <div className={styles.fieldRow} style={{ position: 'relative' }}>
                  <span className={styles.fieldLabel}>Text Fill:</span>
                  <div ref={textFillRef} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <div
                      style={{
                        width: 24,
                        height: 20,
                        borderRadius: 3,
                        border: '1px solid var(--mx-border, #333842)',
                        background: textFillCSS,
                        cursor: 'pointer',
                      }}
                      onClick={() => setTextGradientOpen(!textGradientOpen)}
                      title="Click to edit text color / gradient"
                    />
                    <button
                      type="button"
                      className={styles.addFontSmallBtn}
                      onClick={() => setTextGradientOpen(!textGradientOpen)}
                    >
                      {textFill.type === 'linearGradient'
                        ? 'Linear Gradient'
                        : textFill.type === 'radialGradient'
                        ? 'Radial Gradient'
                        : textEl.color || '#ffffff'} ▾
                    </button>
                  </div>
                  {textGradientOpen && (
                    <GradientPicker
                      fill={textFill}
                      onChange={(newFill) => {
                        const primaryColor =
                          newFill.type === 'solid'
                            ? newFill.color
                            : newFill.type === 'linearGradient' || newFill.type === 'radialGradient'
                            ? newFill.stops[0]?.color || '#ffffff'
                            : '#ffffff';
                        editorActions.updateElementProps(textEl.id, {
                          fill: newFill,
                          color: primaryColor,
                        });
                      }}
                      onClose={() => setTextGradientOpen(false)}
                      anchorRef={textFillRef}
                      title="Text Color & Gradient"
                    />
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Transform: Position */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Position</div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>X:</span>
          <input
            type="number"
            className={styles.textInput}
            value={Math.round(x)}
            onChange={(e) => handleUpdateTransform({ x: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Y:</span>
          <input
            type="number"
            className={styles.textInput}
            value={Math.round(y)}
            onChange={(e) => handleUpdateTransform({ y: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Transform: Scale & Rotation */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Transform</div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Scale X:</span>
          <input
            type="number"
            step="0.05"
            className={styles.textInput}
            value={parseFloat(scaleX.toFixed(2))}
            onChange={(e) => handleUpdateTransform({ scaleX: parseFloat(e.target.value) || 1 })}
          />
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Scale Y:</span>
          <input
            type="number"
            step="0.05"
            className={styles.textInput}
            value={parseFloat(scaleY.toFixed(2))}
            onChange={(e) => handleUpdateTransform({ scaleY: parseFloat(e.target.value) || 1 })}
          />
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Rotate:</span>
          <input
            type="number"
            className={styles.textInput}
            value={Math.round(rotation)}
            onChange={(e) => handleUpdateTransform({ rotation: parseFloat(e.target.value) || 0 })}
          />
          <span style={{ color: 'var(--mx-text-muted)' }}>°</span>
        </div>

        {/* 3D Perspective Tilt (Animatable) */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>3D Tilt:</span>
          <div style={{ display: 'flex', gap: 4, flex: 1, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>X</span>
            <input
              type="number"
              className={styles.textInput}
              style={{ width: '45px' }}
              value={Math.round(rotateX)}
              onChange={(e) => handleUpdateTransform({ rotateX: parseFloat(e.target.value) || 0 })}
              title="Tilt around X axis"
            />
            <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>Y</span>
            <input
              type="number"
              className={styles.textInput}
              style={{ width: '45px' }}
              value={Math.round(rotateY)}
              onChange={(e) => handleUpdateTransform({ rotateY: parseFloat(e.target.value) || 0 })}
              title="Tilt around Y axis"
            />
            {(rotateX !== 0 || rotateY !== 0) && (
              <button
                type="button"
                className={styles.addFontSmallBtn}
                onClick={() => handleUpdateTransform({ rotateX: 0, rotateY: 0 })}
                title="Reset 3D Tilt"
                style={{ marginLeft: 'auto' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Registration Point / Pivot 9-Point Matrix Grid */}
        <div className={styles.fieldRow} style={{ marginTop: 8 }}>
          <span className={styles.fieldLabel}>Origin:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            {/* 3x3 Grid Buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 14px)',
                gridTemplateRows: 'repeat(3, 14px)',
                gap: 2,
                padding: 2,
                backgroundColor: 'var(--mx-bg-canvas, #121316)',
                border: '1px solid var(--mx-border, #333842)',
                borderRadius: 3,
              }}
              title="Snap Registration / Origin Point to 9 presets"
            >
              {[
                { label: 'Top-Left', ox: 0, oy: 0 },
                { label: 'Top-Center', ox: 0.5, oy: 0 },
                { label: 'Top-Right', ox: 1, oy: 0 },
                { label: 'Middle-Left', ox: 0, oy: 0.5 },
                { label: 'Center', ox: 0.5, oy: 0.5 },
                { label: 'Middle-Right', ox: 1, oy: 0.5 },
                { label: 'Bottom-Left', ox: 0, oy: 1 },
                { label: 'Bottom-Center', ox: 0.5, oy: 1 },
                { label: 'Bottom-Right', ox: 1, oy: 1 },
              ].map((pos, idx) => {
                const elBounds = getElementBounds(selectedEl);
                const targetX = Math.round(elBounds.x + elBounds.width * pos.ox);
                const targetY = Math.round(elBounds.y + elBounds.height * pos.oy);
                const isCurrent =
                  Math.abs(originX - targetX) < 2 && Math.abs(originY - targetY) < 2;

                return (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      width: 14,
                      height: 14,
                      padding: 0,
                      border: 'none',
                      borderRadius: 1,
                      backgroundColor: isCurrent ? 'var(--mx-accent, #3b82f6)' : '#334155',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                    onClick={() =>
                      handleUpdateTransform({
                        originX: targetX,
                        originY: targetY,
                      })
                    }
                    title={pos.label}
                  />
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: 'var(--mx-text-muted)', fontFamily: 'var(--mx-font-mono)' }}>
              ({Math.round(originX)}, {Math.round(originY)})
            </div>
          </div>
        </div>
      </div>

      {/* Color & Transparency */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Color & Opacity</div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Alpha:</span>
          <div className={styles.sliderRow} style={{ flex: 1 }}>
            <input
              type="range"
              min="0"
              max="100"
              className={styles.rangeSlider}
              value={alphaPercent}
              onChange={(e) => handleUpdateAlpha(parseInt(e.target.value, 10) || 0)}
            />
            <span style={{ fontSize: 11, minWidth: 32, fontFamily: 'var(--mx-font-mono)' }}>
              {alphaPercent}%
            </span>
          </div>
        </div>

        {isShape && (
          <>
            <div className={styles.fieldRow} style={{ position: 'relative' }}>
              <span className={styles.fieldLabel}>Fill:</span>
              <div ref={shapeFillRef} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <div
                  style={{
                    width: 24,
                    height: 20,
                    borderRadius: 3,
                    border: '1px solid var(--mx-border, #333842)',
                    background: fillToCSS(shapeFill),
                    cursor: 'pointer',
                  }}
                  onClick={() => setShapeGradientOpen(!shapeGradientOpen)}
                  title="Click to edit shape fill / gradient"
                />
                <button
                  type="button"
                  className={styles.addFontSmallBtn}
                  onClick={() => setShapeGradientOpen(!shapeGradientOpen)}
                >
                  {shapeFill.type === 'linearGradient'
                    ? 'Linear Gradient'
                    : shapeFill.type === 'radialGradient'
                    ? 'Radial Gradient'
                    : shapeFill.type === 'solid'
                    ? shapeFill.color
                    : 'None'} ▾
                </button>
              </div>
              {shapeGradientOpen && (
                <GradientPicker
                  fill={shapeFill}
                  onChange={(newFill) => handleUpdateShapeFill(newFill)}
                  onClose={() => setShapeGradientOpen(false)}
                  anchorRef={shapeFillRef}
                  title="Shape Fill & Gradient"
                />
              )}
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Stroke:</span>
              <div className={styles.colorInputWrapper}>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={currentStroke}
                  onChange={(e) => handleUpdateShapeStroke(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  max="20"
                  className={styles.textInput}
                  style={{ width: '45px' }}
                  value={currentStrokeWidth}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    handleUpdateShapeStrokeWidth(isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }}
                  title="Stroke width in px"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
