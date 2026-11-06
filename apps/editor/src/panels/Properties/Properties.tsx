import React, { useState, useRef } from 'react';
import type {
  ShapeElement,
  TextElement,
  SymbolInstance,
  Fill,
  Transform,
  BitmapElement,
  VideoElement,
  LayoutPin,
  StageBreakpoint,
  ReducedMotionMode,
} from '@flashback/runtime';
import { fillToCSS } from '@flashback/runtime';
import {
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Activity,
  Link,
  Unlink,
} from 'lucide-react';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  findKeyframeAtTime,
  getKeyframeTime,
  getActiveTimeline,
  type EditorElement,
} from '../../state/editorStore';
import { LayerFiltersManager } from '../Layers/Layers';
import { GradientPicker } from '../../ui/GradientPicker';
import { getElementBounds, scaleSvgPathD, elementLocalToStage } from '../Stage/Stage';
import { NumberField } from '../../ui/NumberField';
import { STAR_PRESETS } from '../../utils/shapeGenerators';
import { getWeightLabel, STANDARD_WEIGHTS } from '../../utils/fontParser';
import styles from './Properties.module.css';

export const Properties: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const fps = doc.stage.fps || 24;
  const currentTime = useEditorStore((s) => s.currentTime ?? s.currentFrame / (s.doc.stage.fps || 24));
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const isolationStack = useEditorStore((s) => s.isolationStack);
  const textSelection = useEditorStore((s) => s.textSelection);
  const activeBreakpointId = useEditorStore((s) => s.activeBreakpointId);
  const previewLocale = useEditorStore((s) => s.previewLocale);

  const [shapeGradientOpen, setShapeGradientOpen] = useState(false);
  const [textGradientOpen, setTextGradientOpen] = useState(false);
  const [stageGradientOpen, setStageGradientOpen] = useState(false);
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
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
        {/* Layer / Folder Header & Group Motion Section */}
        {selectedLayer && (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{selectedLayer.kind === 'folder' ? `📁 Folder: ${selectedLayer.name}` : `Layer: ${selectedLayer.name}`}</span>
              {selectedLayer.kind === 'folder' && (
                <span style={{ fontSize: 10, color: '#a855f7', fontWeight: 600 }}>Group Transform</span>
              )}
            </div>

            {selectedLayer.kind === 'folder' && (() => {
              const currentKf = findKeyframeAtTime(selectedLayer, currentTime, fps) ?? findKeyframeAt(selectedLayer, currentFrame);
              const folderT = currentKf?.transform ?? selectedLayer.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
              const hasTween = currentKf?.tween?.type === 'motion';
              const easing = currentKf?.tween?.easing;
              let easingLabel = 'Linear';
              if (easing?.type === 'cubic-bezier') {
                easingLabel = `cubic-bezier(${easing.p.join(', ')})`;
              } else if (easing?.type === 'preset') {
                easingLabel = easing.name;
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  <div className={styles.fieldRow}>
                    <NumberField
                      label="X:"
                      value={folderT.x}
                      onChange={(val) => editorActions.updateFolderTransform(selectedLayer.id, { x: val }, { skipHistory: true })}
                      onCommit={(val) => editorActions.updateFolderTransform(selectedLayer.id, { x: val })}
                      unit="px"
                      inputWidth={50}
                    />
                    <NumberField
                      label="Y:"
                      value={folderT.y}
                      onChange={(val) => editorActions.updateFolderTransform(selectedLayer.id, { y: val }, { skipHistory: true })}
                      onCommit={(val) => editorActions.updateFolderTransform(selectedLayer.id, { y: val })}
                      unit="px"
                      inputWidth={50}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <NumberField
                      label="Scale:"
                      value={Math.round((folderT.scaleX ?? 1) * 100)}
                      onChange={(val) => editorActions.updateFolderTransform(selectedLayer.id, { scaleX: val / 100, scaleY: val / 100 }, { skipHistory: true })}
                      onCommit={(val) => editorActions.updateFolderTransform(selectedLayer.id, { scaleX: val / 100, scaleY: val / 100 })}
                      unit="%"
                      inputWidth={48}
                      step={1}
                      shiftStep={10}
                      altStep={0.1}
                    />
                    <NumberField
                      label="Rot:"
                      value={folderT.rotation ?? 0}
                      onChange={(val) => editorActions.updateFolderTransform(selectedLayer.id, { rotation: val }, { skipHistory: true })}
                      onCommit={(val) => editorActions.updateFolderTransform(selectedLayer.id, { rotation: val })}
                      unit="°"
                      inputWidth={48}
                      step={1}
                      shiftStep={10}
                      altStep={0.1}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>Tween:</span>
                    <button
                      type="button"
                      className={styles.addFontSmallBtn}
                      style={{
                        backgroundColor: hasTween ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                        color: hasTween ? '#c084fc' : 'var(--mx-text-muted)',
                        borderColor: hasTween ? '#a855f7' : undefined,
                      }}
                      onClick={() => {
                        if (hasTween) {
                          editorActions.removeTween(selectedLayer.id, currentTime);
                        } else {
                          editorActions.createMotionTween(selectedLayer.id, currentTime);
                        }
                      }}
                    >
                      {hasTween ? '✓ Motion Tween Active' : '+ Add Motion Tween'}
                    </button>
                  </div>
                  {hasTween && currentKf && (
                    <>
                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Curve:</span>
                        <button
                          type="button"
                          className={styles.addFontSmallBtn}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flex: 1,
                            justifyContent: 'space-between',
                            fontFamily: 'monospace',
                            fontSize: 10,
                          }}
                          onClick={() => editorActions.openBezierEditor(selectedLayer.id, currentKf.id, easing)}
                          title="Open Cubic Bézier Curve Editor"
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {easingLabel}
                          </span>
                          <Activity size={12} />
                        </button>
                      </div>
                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Spin:</span>
                        <select
                          value={currentKf.tween?.rotate?.direction || 'none'}
                          onChange={(e) => {
                            const dir = e.target.value as 'cw' | 'ccw' | 'none';
                            if (dir === 'none') {
                              editorActions.updateTweenRotate(selectedLayer.id, currentTime, undefined);
                            } else {
                              editorActions.updateTweenRotate(selectedLayer.id, currentTime, {
                                direction: dir,
                                turns: currentKf.tween?.rotate?.turns ?? 1,
                              });
                            }
                          }}
                          style={{
                            height: 24,
                            fontSize: 11,
                            backgroundColor: 'var(--mx-bg-input)',
                            color: 'var(--mx-text-main)',
                            border: '1px solid var(--mx-border-light)',
                            borderRadius: 3,
                            flex: 1,
                          }}
                          aria-label="Spin direction"
                        >
                          <option value="none">None / Linear</option>
                          <option value="cw">Clockwise (CW)</option>
                          <option value="ccw">Counter-Clockwise (CCW)</option>
                        </select>
                        {currentKf.tween?.rotate && (
                          <NumberField
                            label="Turns:"
                            value={currentKf.tween.rotate.turns ?? 0}
                            onChange={(val) =>
                              editorActions.updateTweenRotate(selectedLayer.id, currentTime, {
                                direction: currentKf.tween!.rotate!.direction,
                                turns: Math.max(0, val),
                              })
                            }
                            min={0}
                            step={1}
                            inputWidth={35}
                            ariaLabel="Extra turns"
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <LayerFiltersManager layer={selectedLayer} />
          </div>
        )}

        {/* Document Dimensions */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>Document Dimensions</div>
          <div className={styles.fieldRow}>
            <NumberField
              label="W:"
              value={width}
              onChange={(val) => editorActions.updateStageProps({ width: val })}
              unit="px"
              min={1}
              inputWidth={50}
              ariaLabel="Stage Width"
            />
            <NumberField
              label="H:"
              value={height}
              onChange={(val) => editorActions.updateStageProps({ height: val })}
              unit="px"
              min={1}
              inputWidth={50}
              ariaLabel="Stage Height"
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
            <NumberField
              label="FPS:"
              value={fps}
              onChange={(val) => editorActions.updateStageProps({ fps: Math.max(1, Math.min(240, Math.round(val))) })}
              min={1}
              max={240}
              inputWidth={55}
              ariaLabel="Target FPS"
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

        {/* Responsive Breakpoints Section */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>
            <span>Responsive Breakpoints</span>
            {doc.stage.breakpoints?.length ? (
              <span style={{ fontSize: 10, color: 'var(--mx-accent, #3b82f6)' }}>
                {doc.stage.breakpoints.length} active
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doc.stage.breakpoints && doc.stage.breakpoints.length > 0 ? (
              doc.stage.breakpoints.map((bp) => {
                const isActive =
                  (doc.stage.width === bp.width && doc.stage.height === bp.height) ||
                  activeBreakpointId === bp.id;
                return (
                  <div
                    key={bp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: isActive
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'var(--mx-bg-canvas, #121316)',
                      border: isActive
                        ? '1px solid var(--mx-accent, #3b82f6)'
                        : '1px solid var(--mx-border-light)',
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isActive ? '#93c5fd' : 'var(--mx-text-main)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        flex: 1,
                      }}
                      onClick={() => editorActions.applyBreakpoint(bp)}
                      title={`Switch to ${bp.name} (${bp.width}×${bp.height}) & adjust pinned elements`}
                    >
                      {bp.name} ({bp.width}×{bp.height})
                    </button>
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--mx-text-muted)',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: '0 4px',
                      }}
                      onClick={() => editorActions.removeBreakpoint(bp.id)}
                      title="Delete Breakpoint"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>
                No responsive breakpoints configured. Add presets below:
              </div>
            )}

            <div className={styles.presetPills} style={{ marginTop: 4 }}>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.addBreakpoint({
                    id: 'bp_desktop',
                    name: 'Desktop',
                    maxWidth: 1200,
                    width: 800,
                    height: 500,
                  })
                }
                title="Add Desktop Breakpoint (800×500)"
              >
                + Desktop 800×500
              </button>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.addBreakpoint({
                    id: 'bp_tablet',
                    name: 'Tablet',
                    maxWidth: 768,
                    width: 600,
                    height: 400,
                  })
                }
                title="Add Tablet Breakpoint (600×400)"
              >
                + Tablet 600×400
              </button>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.addBreakpoint({
                    id: 'bp_mobile',
                    name: 'Mobile',
                    maxWidth: 480,
                    width: 375,
                    height: 667,
                  })
                }
                title="Add Mobile Breakpoint (375×667)"
              >
                + Mobile 375×667
              </button>
            </div>
          </div>
        </div>

        {/* Accessibility: Reduced Motion */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>Accessibility (Reduced Motion)</div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Mode:</span>
            <select
              value={doc.stage.reducedMotion?.mode || 'auto'}
              onChange={(e) =>
                editorActions.setReducedMotion({
                  ...(doc.stage.reducedMotion || {}),
                  mode: e.target.value as ReducedMotionMode,
                })
              }
              style={{
                flex: 1,
                height: 24,
                backgroundColor: 'var(--mx-bg-input)',
                color: 'var(--mx-text-main)',
                border: '1px solid var(--mx-border-light)',
                borderRadius: 3,
                fontSize: 11,
              }}
            >
              <option value="auto">Auto (Prefers-Reduced-Motion)</option>
              <option value="full">Full Motion</option>
              <option value="stop-motion">Stop-Motion (Lower FPS)</option>
              <option value="fixed">Fixed Poster Frame</option>
            </select>
          </div>

          {doc.stage.reducedMotion?.mode === 'fixed' && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Poster:</span>
              <input
                type="number"
                min="0"
                className={styles.textInput}
                value={doc.stage.reducedMotion?.posterFrame ?? 0}
                onChange={(e) =>
                  editorActions.setReducedMotion({
                    mode: 'fixed',
                    posterFrame: parseInt(e.target.value, 10) || 0,
                  })
                }
                title="Poster Frame index (0-based) to show for users preferring reduced motion"
              />
              <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>Frame</span>
            </div>
          )}

          {doc.stage.reducedMotion?.mode === 'stop-motion' && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>FPS:</span>
              <input
                type="number"
                min="1"
                max="30"
                className={styles.textInput}
                value={doc.stage.reducedMotion?.stopMotionFps ?? 12}
                onChange={(e) =>
                  editorActions.setReducedMotion({
                    mode: 'stop-motion',
                    stopMotionFps: parseInt(e.target.value, 10) || 12,
                  })
                }
                title="Reduced framerate for stop-motion playback"
              />
            </div>
          )}
        </div>

        {/* Internationalization (i18n) Stage Dictionary */}
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>
            <span>i18n Localization</span>
            <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>
              Active: {previewLocale || doc.i18n?.defaultLocale || 'en'}
            </span>
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Default:</span>
            <input
              type="text"
              className={styles.textInput}
              value={doc.i18n?.defaultLocale || 'en'}
              onChange={(e) =>
                editorActions.updateI18n({
                  defaultLocale: e.target.value.trim() || 'en',
                })
              }
              title="Default document locale"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>Preview Locale:</span>
            <div className={styles.presetPills}>
              {Array.from(
                new Set([
                  'en',
                  ...(doc.i18n ? Object.keys(doc.i18n.locales || {}) : []),
                ])
              ).map((loc) => {
                const isCurrent = (previewLocale || doc.i18n?.defaultLocale || 'en') === loc;
                return (
                  <button
                    key={loc}
                    type="button"
                    className={`${styles.presetPill} ${isCurrent ? styles.active : ''}`}
                    onClick={() => editorActions.setPreviewLocale(loc)}
                  >
                    {loc.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Add Locale input */}
          <div className={styles.fieldRow} style={{ marginTop: 4 }}>
            <input
              type="text"
              id="newLocaleInput"
              className={styles.textInput}
              style={{ width: 60 }}
              placeholder="e.g. es"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.currentTarget;
                  const code = target.value.trim().toLowerCase();
                  if (code) {
                    editorActions.updateI18n({
                      locales: { [code]: {} },
                    });
                    editorActions.setPreviewLocale(code);
                    target.value = '';
                  }
                }
              }}
            />
            <button
              type="button"
              className={styles.presetPill}
              onClick={() => {
                const input = document.getElementById('newLocaleInput') as HTMLInputElement | null;
                const code = input?.value.trim().toLowerCase();
                if (code) {
                  editorActions.updateI18n({
                    locales: { [code]: {} },
                  });
                  editorActions.setPreviewLocale(code);
                  if (input) input.value = '';
                }
              }}
            >
              + Add Locale
            </button>
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

  const handleUpdateTransform = (
    partial: Partial<Transform>,
    options?: { skipHistory?: boolean }
  ) => {
    if (!selectedEl) return;
    editorActions.updateElementTransform(selectedEl.id, partial, options);
  };

  const hasGeometrySize =
    selectedEl.type === 'shape' ||
    selectedEl.type === 'bitmap' ||
    selectedEl.type === 'video' ||
    selectedEl.type === 'text';

  const elBounds = getElementBounds(selectedEl);
  const currentGeomW =
    selectedEl.type === 'shape'
      ? Math.round(elBounds.width)
      : Math.round((selectedEl as any).width || elBounds.width);
  const currentGeomH =
    selectedEl.type === 'shape'
      ? Math.round(elBounds.height)
      : Math.round((selectedEl as any).height || elBounds.height);

  const handleUpdateW = (newW: number, skipHistory = false) => {
    if (!selectedEl) return;
    const bounds = getElementBounds(selectedEl);
    const origW = bounds.width || 1;
    const origH = bounds.height || 1;
    const targetW = Math.max(1, newW);
    const targetH = lockAspectRatio
      ? Math.max(1, Math.round(origH * (targetW / origW)))
      : origH;

    if (selectedEl.type === 'shape') {
      const sShape = selectedEl as ShapeElement;
      const scaledPaths = sShape.paths.map((p) => ({
        ...p,
        d: scaleSvgPathD(p.d, bounds, targetW, targetH),
      }));
      editorActions.updateElementProps(
        selectedEl.id,
        { paths: scaledPaths },
        { skipHistory }
      );
    } else if (
      selectedEl.type === 'bitmap' ||
      selectedEl.type === 'video' ||
      selectedEl.type === 'text'
    ) {
      editorActions.updateElementProps(
        selectedEl.id,
        {
          width: targetW,
          height: targetH,
          ...(selectedEl.type === 'text' ? { multiline: true } : {}),
        },
        { skipHistory }
      );
    }
  };

  const handleUpdateH = (newH: number, skipHistory = false) => {
    if (!selectedEl) return;
    const bounds = getElementBounds(selectedEl);
    const origW = bounds.width || 1;
    const origH = bounds.height || 1;
    const targetH = Math.max(1, newH);
    const targetW = lockAspectRatio
      ? Math.max(1, Math.round(origW * (targetH / origH)))
      : origW;

    if (selectedEl.type === 'shape') {
      const sShape = selectedEl as ShapeElement;
      const scaledPaths = sShape.paths.map((p) => ({
        ...p,
        d: scaleSvgPathD(p.d, bounds, targetW, targetH),
      }));
      editorActions.updateElementProps(
        selectedEl.id,
        { paths: scaledPaths },
        { skipHistory }
      );
    } else if (
      selectedEl.type === 'bitmap' ||
      selectedEl.type === 'video' ||
      selectedEl.type === 'text'
    ) {
      editorActions.updateElementProps(
        selectedEl.id,
        {
          width: targetW,
          height: targetH,
          ...(selectedEl.type === 'text' ? { multiline: true } : {}),
        },
        { skipHistory }
      );
    }
  };

  const handleAlign = (type: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    if (!selectedEl) return;
    const stageW = doc.stage.width || 550;
    const stageH = doc.stage.height || 400;
    const bounds = getElementBounds(selectedEl);
    const sX = selectedEl.transform.scaleX ?? 1;
    const sY = selectedEl.transform.scaleY ?? 1;
    const elW = bounds.width * sX;
    const elH = bounds.height * sY;
    const offX = bounds.x * sX;
    const offY = bounds.y * sY;

    switch (type) {
      case 'left':
        handleUpdateTransform({ x: Math.round(0 - offX) });
        break;
      case 'hcenter':
        handleUpdateTransform({ x: Math.round((stageW - elW) / 2 - offX) });
        break;
      case 'right':
        handleUpdateTransform({ x: Math.round(stageW - elW - offX) });
        break;
      case 'top':
        handleUpdateTransform({ y: Math.round(0 - offY) });
        break;
      case 'vcenter':
        handleUpdateTransform({ y: Math.round((stageH - elH) / 2 - offY) });
        break;
      case 'bottom':
        handleUpdateTransform({ y: Math.round(stageH - elH - offY) });
        break;
    }
  };

  const handleUpdateAlpha = (percent: number, skipHistory = false) => {
    if (!selectedEl) return;
    const val = Math.max(0, Math.min(100, percent)) / 100;
    editorActions.updateElementProps(selectedEl.id, { alpha: val }, { skipHistory });
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
  const isStarOrPolygon =
    isShape &&
    (Boolean((shapeEl as any)?.starConfig) || Boolean(shapeEl?.id.startsWith('poly_')));
  const isCustomizedPath = Boolean((shapeEl as any)?.isCustomizedPath);
  const starConfig = (shapeEl as any)?.starConfig || { points: 5, pointRatio: 0.5 };
  const starPts = starConfig.points ?? 5;
  const starRatio = starConfig.pointRatio ?? 0.5;
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

  const handleUpdateShapeStrokeWidth = (width: number, skipHistory = false) => {
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
    editorActions.updateElementProps(shapeEl.id, { paths: newPaths }, { skipHistory });
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

        {/* Element ID editable field for cross-keyframe matching & shape morphing */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel} style={{ width: '70px' }} title="Element ID for shape tweening & morph pairing">
            Element ID:
          </span>
          <input
            type="text"
            className={styles.textInput}
            style={{ flex: 1, minWidth: '100px' }}
            value={selectedEl.id}
            data-testid="element-id-input"
            aria-label="Element ID"
            placeholder="e.g. star_1"
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val && val !== selectedEl.id) {
                editorActions.changeElementId(selectedEl.id, val);
              }
            }}
            title="Element ID across keyframes. Set identical IDs across keyframes to morph shapes!"
          />
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

              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel} style={{ width: '135px' }}>
                  Play Mode:
                </span>
                <select
                  className={styles.selectInput}
                  style={{ flex: 1 }}
                  value={inst.playMode || 'loop'}
                  onChange={(e) =>
                    editorActions.updateElementProps(selectedEl.id, {
                      playMode: e.target.value as any,
                    })
                  }
                  title="Instance animation playback mode"
                >
                  <option value="loop">Loop</option>
                  <option value="once">Play Once (once)</option>
                  <option value="stop">Stop (stop)</option>
                  <option value="sync">Synchronize (sync)</option>
                </select>
              </div>

              <div className={styles.fieldRow} style={{ justifyContent: 'flex-start', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={inst.autoplay !== false}
                    onChange={(e) =>
                      editorActions.updateElementProps(selectedEl.id, {
                        autoplay: e.target.checked,
                      })
                    }
                  />
                  <span>Autoplay</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={inst.loop !== false}
                    onChange={(e) =>
                      editorActions.updateElementProps(selectedEl.id, {
                        loop: e.target.checked,
                      })
                    }
                  />
                  <span>Loop</span>
                </label>
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
              <NumberField
                value={textEl.fontSize || 16}
                onChange={(val) => editorActions.updateElementProps(textEl.id, { fontSize: Math.max(6, Math.min(300, Math.round(val))) }, { skipHistory: true })}
                onCommit={(val) => editorActions.updateElementProps(textEl.id, { fontSize: Math.max(6, Math.min(300, Math.round(val))) })}
                unit="px"
                min={6}
                max={300}
                inputWidth={isVariable ? '56px' : '48px'}
                ariaLabel="Font Size"
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
              <NumberField
                label="LH:"
                value={textEl.lineHeight ?? 1.2}
                onChange={(val) => editorActions.updateElementProps(textEl.id, { lineHeight: val }, { skipHistory: true })}
                onCommit={(val) => editorActions.updateElementProps(textEl.id, { lineHeight: val })}
                step={0.1}
                altStep={0.01}
                inputWidth={44}
                ariaLabel="Line Height"
              />
              <NumberField
                label="LS:"
                value={textEl.letterSpacing ?? 0}
                onChange={(val) => editorActions.updateElementProps(textEl.id, { letterSpacing: val }, { skipHistory: true })}
                onCommit={(val) => editorActions.updateElementProps(textEl.id, { letterSpacing: val })}
                unit="px"
                step={0.5}
                altStep={0.1}
                inputWidth={44}
                ariaLabel="Letter Spacing"
              />
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

      {/* i18n Localization for Text Elements */}
      {isText && textEl && (
        <div className={styles.propSection}>
          <div className={styles.sectionTitle}>
            <span>i18n Localization</span>
            {textEl.i18nKey ? (
              <span style={{ fontSize: 10, color: 'var(--mx-accent, #3b82f6)' }}>
                Key: {textEl.i18nKey}
              </span>
            ) : null}
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Key:</span>
            <input
              type="text"
              className={styles.textInput}
              style={{ flex: 1, width: '100%' }}
              value={textEl.i18nKey || ''}
              onChange={(e) =>
                editorActions.updateElementProps(textEl.id, {
                  i18nKey: e.target.value.trim() || undefined,
                })
              }
              placeholder="e.g. ui.welcome"
              title="Translation key in document i18n dictionary"
              data-testid="text-i18n-key-input"
            />
          </div>

          {textEl.i18nKey && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--mx-text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Translations:
              </div>
              {Array.from(
                new Set([
                  'en',
                  ...(doc.i18n ? Object.keys(doc.i18n.locales || {}) : []),
                ])
              ).map((loc) => {
                const defaultLoc = doc.i18n?.defaultLocale || 'en';
                const currentVal =
                  doc.i18n?.locales?.[loc]?.[textEl.i18nKey!] ||
                  (loc === defaultLoc ? textEl.text : '');

                return (
                  <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 24,
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--mx-text-muted)',
                        textAlign: 'right',
                      }}
                    >
                      {loc.toUpperCase()}:
                    </span>
                    <input
                      type="text"
                      className={styles.textInput}
                      style={{ flex: 1 }}
                      value={currentVal}
                      onChange={(e) =>
                        editorActions.setI18nTranslation(loc, textEl.i18nKey!, e.target.value)
                      }
                      placeholder={`Text in ${loc}...`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bitmap Element Properties */}
      {selectedEl.type === 'bitmap' && (() => {
        const bmp = selectedEl as BitmapElement;
        const imgSrc = bmp.src || doc.library?.bitmaps?.[bmp.bitmapId]?.src || '';
        const w = bmp.width || 200;
        const h = bmp.height || 150;

        return (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle}>Bitmap Image</div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>URL:</span>
              <input
                type="text"
                className={styles.textInput}
                style={{ width: '100%', flex: 1 }}
                value={imgSrc}
                onChange={(e) => editorActions.updateElementProps(selectedEl.id, { src: e.target.value })}
                placeholder="https://..."
                title="Image URL or data URI"
                data-testid="bitmap-url-input"
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Size:</span>
              <input
                type="number"
                className={styles.textInput}
                value={w}
                onChange={(e) =>
                  editorActions.updateElementProps(selectedEl.id, {
                    width: parseInt(e.target.value, 10) || 200,
                  })
                }
                title="Bitmap Width"
                data-testid="bitmap-width-input"
              />
              <span>×</span>
              <input
                type="number"
                className={styles.textInput}
                value={h}
                onChange={(e) =>
                  editorActions.updateElementProps(selectedEl.id, {
                    height: parseInt(e.target.value, 10) || 150,
                  })
                }
                title="Bitmap Height"
                data-testid="bitmap-height-input"
              />
            </div>
            <div className={styles.fieldRow} style={{ marginTop: 4 }}>
              <input
                type="file"
                id={`replace_bitmap_${selectedEl.id}`}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const src = ev.target?.result as string;
                    const img = new Image();
                    img.onload = () => {
                      editorActions.updateElementProps(selectedEl.id, {
                        src,
                        width: img.naturalWidth || w,
                        height: img.naturalHeight || h,
                      });
                    };
                    img.src = src;
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                type="button"
                className={styles.presetPill}
                style={{ width: '100%' }}
                onClick={() => document.getElementById(`replace_bitmap_${selectedEl.id}`)?.click()}
              >
                Replace Image File...
              </button>
            </div>
          </div>
        );
      })()}

      {/* Video Element Properties */}
      {selectedEl.type === 'video' && (() => {
        const vid = selectedEl as VideoElement;
        const w = vid.width || 320;
        const h = vid.height || 180;

        return (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle}>Video Player</div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>URL:</span>
              <input
                type="text"
                className={styles.textInput}
                style={{ width: '100%', flex: 1 }}
                value={vid.src || ''}
                onChange={(e) => editorActions.updateElementProps(selectedEl.id, { src: e.target.value })}
                placeholder="https://... (.mp4, YouTube, Vimeo)"
                title="Video URL (Direct MP4, YouTube, Vimeo)"
                data-testid="video-url-input"
              />
            </div>

            <div className={styles.presetPills} style={{ margin: '4px 0' }}>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.updateElementProps(selectedEl.id, {
                    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                  })
                }
              >
                Sample MP4
              </button>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.updateElementProps(selectedEl.id, {
                    src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  })
                }
              >
                YouTube
              </button>
              <button
                type="button"
                className={styles.presetPill}
                onClick={() =>
                  editorActions.updateElementProps(selectedEl.id, {
                    src: 'https://player.vimeo.com/video/76979871',
                  })
                }
              >
                Vimeo
              </button>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Size:</span>
              <input
                type="number"
                className={styles.textInput}
                value={w}
                onChange={(e) =>
                  editorActions.updateElementProps(selectedEl.id, {
                    width: parseInt(e.target.value, 10) || 320,
                  })
                }
                title="Video Width"
                data-testid="video-width-input"
              />
              <span>×</span>
              <input
                type="number"
                className={styles.textInput}
                value={h}
                onChange={(e) =>
                  editorActions.updateElementProps(selectedEl.id, {
                    height: parseInt(e.target.value, 10) || 180,
                  })
                }
                title="Video Height"
                data-testid="video-height-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vid.autoplay ?? true}
                  onChange={(e) => editorActions.updateElementProps(selectedEl.id, { autoplay: e.target.checked })}
                  data-testid="video-autoplay-checkbox"
                />
                Autoplay
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vid.loop ?? true}
                  onChange={(e) => editorActions.updateElementProps(selectedEl.id, { loop: e.target.checked })}
                  data-testid="video-loop-checkbox"
                />
                Loop
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vid.muted ?? true}
                  onChange={(e) => editorActions.updateElementProps(selectedEl.id, { muted: e.target.checked })}
                  data-testid="video-muted-checkbox"
                />
                Muted
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vid.controls ?? true}
                  onChange={(e) => editorActions.updateElementProps(selectedEl.id, { controls: e.target.checked })}
                  data-testid="video-controls-checkbox"
                />
                Controls
              </label>
            </div>
          </div>
        );
      })()}

      {/* Transform: Position */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Position</div>

        {/* One-Click Alignment Toolbar */}
        <div className={styles.alignToolbar} title="Align to Stage Canvas">
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('left')}
            title="Align Left"
            aria-label="Align Left"
            data-testid="align-left-btn"
          >
            <AlignLeft size={14} />
          </button>
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('hcenter')}
            title="Align Horizontal Center"
            aria-label="Align Horizontal Center"
            data-testid="align-hcenter-btn"
          >
            <AlignCenterHorizontal size={14} />
          </button>
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('right')}
            title="Align Right"
            aria-label="Align Right"
            data-testid="align-right-btn"
          >
            <AlignRight size={14} />
          </button>
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('top')}
            title="Align Top"
            aria-label="Align Top"
            data-testid="align-top-btn"
          >
            <AlignStartVertical size={14} />
          </button>
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('vcenter')}
            title="Align Vertical Center"
            aria-label="Align Vertical Center"
            data-testid="align-vcenter-btn"
          >
            <AlignCenterVertical size={14} />
          </button>
          <button
            type="button"
            className={styles.alignBtn}
            onClick={() => handleAlign('bottom')}
            title="Align Bottom"
            aria-label="Align Bottom"
            data-testid="align-bottom-btn"
          >
            <AlignEndVertical size={14} />
          </button>
        </div>

        <div className={styles.fieldRow}>
          <NumberField
            label="X:"
            value={x}
            onChange={(val) => handleUpdateTransform({ x: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ x: val })}
            unit="px"
            inputWidth={50}
          />
          <NumberField
            label="Y:"
            value={y}
            onChange={(val) => handleUpdateTransform({ y: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ y: val })}
            unit="px"
            inputWidth={50}
          />
        </div>

        {hasGeometrySize && (
          <div className={styles.fieldRow}>
            <NumberField
              label="W:"
              value={currentGeomW}
              onChange={(val) => handleUpdateW(val, true)}
              onCommit={(val) => handleUpdateW(val, false)}
              unit="px"
              min={1}
              inputWidth={48}
              ariaLabel="Width"
            />
            <button
              type="button"
              onClick={() => setLockAspectRatio(!lockAspectRatio)}
              title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-label={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-pressed={lockAspectRatio}
              style={{
                background: lockAspectRatio ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: lockAspectRatio ? '#60a5fa' : 'var(--mx-text-muted)',
                border: '1px solid ' + (lockAspectRatio ? '#3b82f6' : 'var(--mx-border-light)'),
                borderRadius: 3,
                padding: '3px 4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {lockAspectRatio ? <Link size={12} /> : <Unlink size={12} />}
            </button>
            <NumberField
              label="H:"
              value={currentGeomH}
              onChange={(val) => handleUpdateH(val, true)}
              onCommit={(val) => handleUpdateH(val, false)}
              unit="px"
              min={1}
              inputWidth={48}
              ariaLabel="Height"
            />
          </div>
        )}

        {/* Pin to Canvas (Layout Pin) */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Pin:</span>
          <select
            value={selectedEl.transform.pin || 'none'}
            onChange={(e) => handleUpdateTransform({ pin: e.target.value as LayoutPin })}
            style={{
              flex: 1,
              height: 24,
              backgroundColor: 'var(--mx-bg-input)',
              color: 'var(--mx-text-main)',
              border: '1px solid var(--mx-border-light)',
              borderRadius: 3,
              fontSize: 11,
            }}
            title="Pin element relative to stage borders during responsive resize"
            data-testid="element-pin-select"
          >
            <option value="none">None</option>
            <option value="center">Center</option>
            <option value="top-left">Top-Left</option>
            <option value="top-right">Top-Right</option>
            <option value="bottom-left">Bottom-Left</option>
            <option value="bottom-right">Bottom-Right</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>
      </div>

      {/* Transform: Scale & Rotation */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Transform</div>
        <div className={styles.fieldRow}>
          <NumberField
            label="Scale X:"
            value={Math.round((scaleX ?? 1) * 100)}
            onChange={(val) => handleUpdateTransform({ scaleX: val / 100 }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ scaleX: val / 100 })}
            unit="%"
            step={1}
            shiftStep={10}
            altStep={0.1}
            inputWidth={50}
          />
          <NumberField
            label="Scale Y:"
            value={Math.round((scaleY ?? 1) * 100)}
            onChange={(val) => handleUpdateTransform({ scaleY: val / 100 }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ scaleY: val / 100 })}
            unit="%"
            step={1}
            shiftStep={10}
            altStep={0.1}
            inputWidth={50}
          />
        </div>
        <div className={styles.fieldRow}>
          <NumberField
            label="Rotate:"
            value={rotation}
            onChange={(val) => handleUpdateTransform({ rotation: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ rotation: val })}
            unit="°"
            step={1}
            shiftStep={10}
            altStep={0.1}
            inputWidth={50}
          />
          <NumberField
            label="Persp:"
            value={selectedEl.transform.perspective ?? 800}
            onChange={(val) => handleUpdateTransform({ perspective: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ perspective: val })}
            unit="px"
            min={50}
            step={50}
            shiftStep={100}
            altStep={10}
            inputWidth={45}
          />
        </div>
        <div className={styles.fieldRow}>
          <NumberField
            label="Skew X:"
            value={skewX}
            onChange={(val) => handleUpdateTransform({ skewX: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ skewX: val })}
            unit="°"
            step={1}
            shiftStep={10}
            altStep={0.1}
            inputWidth={45}
          />
          <NumberField
            label="Skew Y:"
            value={skewY}
            onChange={(val) => handleUpdateTransform({ skewY: val }, { skipHistory: true })}
            onCommit={(val) => handleUpdateTransform({ skewY: val })}
            unit="°"
            step={1}
            shiftStep={10}
            altStep={0.1}
            inputWidth={45}
          />
        </div>

        {/* 3D Perspective Tilt (Animatable) */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>3D Tilt:</span>
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <NumberField
              label="X:"
              value={rotateX}
              onChange={(val) => handleUpdateTransform({ rotateX: val }, { skipHistory: true })}
              onCommit={(val) => handleUpdateTransform({ rotateX: val })}
              unit="°"
              step={1}
              shiftStep={10}
              altStep={0.1}
              inputWidth={40}
            />
            <NumberField
              label="Y:"
              value={rotateY}
              onChange={(val) => handleUpdateTransform({ rotateY: val }, { skipHistory: true })}
              onCommit={(val) => handleUpdateTransform({ rotateY: val })}
              unit="°"
              step={1}
              shiftStep={10}
              altStep={0.1}
              inputWidth={40}
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
                    onClick={() => {
                      const newStageOrigin = elementLocalToStage(
                        targetX,
                        targetY,
                        selectedEl.transform
                      );
                      handleUpdateTransform({
                        x: Math.round(newStageOrigin.x * 100) / 100,
                        y: Math.round(newStageOrigin.y * 100) / 100,
                        originX: targetX,
                        originY: targetY,
                      });
                    }}
                    title={pos.label}
                  />
                );
              })}
            </div>

            <NumberField
              label="Ox:"
              value={originX}
              onChange={(val) => {
                const newStageOrigin = elementLocalToStage(val, originY, selectedEl.transform);
                handleUpdateTransform(
                  {
                    x: Math.round(newStageOrigin.x * 100) / 100,
                    y: Math.round(newStageOrigin.y * 100) / 100,
                    originX: val,
                  },
                  { skipHistory: true }
                );
              }}
              onCommit={(val) => {
                const newStageOrigin = elementLocalToStage(val, originY, selectedEl.transform);
                handleUpdateTransform({
                  x: Math.round(newStageOrigin.x * 100) / 100,
                  y: Math.round(newStageOrigin.y * 100) / 100,
                  originX: val,
                });
              }}
              unit="px"
              inputWidth={40}
            />
            <NumberField
              label="Oy:"
              value={originY}
              onChange={(val) => {
                const newStageOrigin = elementLocalToStage(originX, val, selectedEl.transform);
                handleUpdateTransform(
                  {
                    x: Math.round(newStageOrigin.x * 100) / 100,
                    y: Math.round(newStageOrigin.y * 100) / 100,
                    originY: val,
                  },
                  { skipHistory: true }
                );
              }}
              onCommit={(val) => {
                const newStageOrigin = elementLocalToStage(originX, val, selectedEl.transform);
                handleUpdateTransform({
                  x: Math.round(newStageOrigin.x * 100) / 100,
                  y: Math.round(newStageOrigin.y * 100) / 100,
                  originY: val,
                });
              }}
              unit="px"
              inputWidth={40}
            />
          </div>
        </div>
      </div>

      {/* Tween & Easing Section */}
      {(() => {
        const owningLayer = activeTl.layers.find((l) =>
          l.keyframes.some((k) => k.elements.some((e) => e.id === selectedEl.id))
        );
        if (!owningLayer) return null;
        const currentKf = findKeyframeAtTime(owningLayer, currentTime, fps) ?? findKeyframeAt(owningLayer, currentFrame);
        const hasTween = currentKf?.tween?.type === 'motion';
        const easing = currentKf?.tween?.easing;
        let easingLabel = 'Linear';
        if (easing?.type === 'cubic-bezier') {
          easingLabel = `cubic-bezier(${easing.p.join(', ')})`;
        } else if (easing?.type === 'preset') {
          easingLabel = easing.name;
        }

        return (
          <div className={styles.propSection}>
            <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Tween & Easing</span>
              <Activity size={12} color="var(--mx-accent, #3b82f6)" />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Motion:</span>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                style={{
                  backgroundColor: hasTween ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: hasTween ? '#60a5fa' : 'var(--mx-text-muted)',
                  borderColor: hasTween ? '#3b82f6' : undefined,
                }}
                onClick={() => {
                  if (hasTween) {
                    editorActions.removeTween(owningLayer.id, currentTime);
                  } else {
                    editorActions.createMotionTween(owningLayer.id, currentTime);
                  }
                }}
              >
                {hasTween ? '✓ Motion Tween Active' : '+ Create Motion Tween'}
              </button>
            </div>
            {hasTween && currentKf && (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Curve:</span>
                  <button
                    type="button"
                    className={styles.addFontSmallBtn}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                      justifyContent: 'space-between',
                      fontFamily: 'monospace',
                      fontSize: 10,
                    }}
                    onClick={() => editorActions.openBezierEditor(owningLayer.id, currentKf.id, easing)}
                    title="Open Cubic Bézier Curve Editor"
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {easingLabel}
                    </span>
                    <Activity size={12} />
                  </button>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Spin:</span>
                  <select
                    value={currentKf.tween?.rotate?.direction || 'none'}
                    onChange={(e) => {
                      const dir = e.target.value as 'cw' | 'ccw' | 'none';
                      if (dir === 'none') {
                        editorActions.updateTweenRotate(owningLayer.id, currentTime, undefined);
                      } else {
                        editorActions.updateTweenRotate(owningLayer.id, currentTime, {
                          direction: dir,
                          turns: currentKf.tween?.rotate?.turns ?? 1,
                        });
                      }
                    }}
                    style={{
                      height: 24,
                      fontSize: 11,
                      backgroundColor: 'var(--mx-bg-input)',
                      color: 'var(--mx-text-main)',
                      border: '1px solid var(--mx-border-light)',
                      borderRadius: 3,
                      flex: 1,
                    }}
                    aria-label="Spin direction"
                  >
                    <option value="none">None / Linear</option>
                    <option value="cw">Clockwise (CW)</option>
                    <option value="ccw">Counter-Clockwise (CCW)</option>
                  </select>
                  {currentKf.tween?.rotate && (
                    <NumberField
                      label="Turns:"
                      value={currentKf.tween.rotate.turns ?? 0}
                      onChange={(val) =>
                        editorActions.updateTweenRotate(owningLayer.id, currentTime, {
                          direction: currentKf.tween!.rotate!.direction,
                          turns: Math.max(0, val),
                        })
                      }
                      min={0}
                      step={1}
                      inputWidth={35}
                      ariaLabel="Extra turns"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Color & Transparency */}
      <div className={styles.propSection}>
        <div className={styles.sectionTitle}>Color & Opacity</div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Alpha:</span>
          <div className={styles.sliderRow} style={{ flex: 1, gap: 6 }}>
            <input
              type="range"
              min="0"
              max="100"
              className={styles.rangeSlider}
              value={alphaPercent}
              onChange={(e) => handleUpdateAlpha(parseInt(e.target.value, 10) || 0)}
            />
            <NumberField
              value={alphaPercent}
              onChange={(val) => handleUpdateAlpha(val, true)}
              onCommit={(val) => handleUpdateAlpha(val, false)}
              unit="%"
              min={0}
              max={100}
              step={1}
              shiftStep={10}
              altStep={0.1}
              inputWidth={40}
              ariaLabel="Alpha percentage"
            />
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
                <NumberField
                  value={currentStrokeWidth}
                  onChange={(val) => handleUpdateShapeStrokeWidth(val, true)}
                  onCommit={(val) => handleUpdateShapeStrokeWidth(val, false)}
                  unit="px"
                  min={0}
                  max={200}
                  step={1}
                  shiftStep={10}
                  altStep={0.1}
                  inputWidth={45}
                  ariaLabel="Stroke width in px"
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Morph:</span>
              <div className={styles.morphBtnGroup} data-testid="morph-shape-group">
                <button
                  type="button"
                  className={styles.morphBtn}
                  data-testid="morph-to-circle-btn"
                  title="Morph keyframe shape to Circle"
                  onClick={() => editorActions.morphShapeTo(selectedEl.id, 'circle')}
                >
                  ● Circle
                </button>
                <button
                  type="button"
                  className={styles.morphBtn}
                  data-testid="morph-to-rect-btn"
                  title="Morph keyframe shape to Rectangle"
                  onClick={() => editorActions.morphShapeTo(selectedEl.id, 'rectangle')}
                >
                  ◼ Rect
                </button>
                <button
                  type="button"
                  className={styles.morphBtn}
                  data-testid="morph-to-star-btn"
                  title="Morph keyframe shape to Star"
                  onClick={() => editorActions.morphShapeTo(selectedEl.id, 'star')}
                >
                  ★ Star
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Star & Polygon Dedicated Inspector Section */}
      {isStarOrPolygon && (
        <div className={styles.propSection} data-testid="star-polygon-section">
          <div className={styles.sectionTitle}>
            <span>Star & Polygon</span>
          </div>

          {isCustomizedPath ? (
            <div className={styles.customPathBanner} data-testid="star-customized-banner">
              <div className={styles.customPathTitle}>
                ✦ Custom Vector Path (Anchors edited manually)
              </div>
              <div className={styles.customPathDesc}>
                Parametric star controls are locked to protect your hand-sculpted vector anchors.
              </div>
              <button
                type="button"
                className={styles.resetParametricBtn}
                onClick={() => {
                  if (shapeEl) {
                    editorActions.resetStarShapeToParametric(shapeEl.id);
                  }
                }}
                data-testid="reset-parametric-star-btn"
              >
                ↺ Reset to Parametric Star
              </button>
            </div>
          ) : (
            <>
              {/* Points control (NumberField with min 3, max 64) */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Points:</span>
                <NumberField
                  value={starPts}
                  onChange={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(
                      shapeEl.id,
                      { points: val },
                      { skipHistory: true }
                    )
                  }
                  onCommit={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(shapeEl.id, { points: val })
                  }
                  min={3}
                  max={64}
                  step={1}
                  shiftStep={5}
                  altStep={1}
                  inputWidth={50}
                  ariaLabel="Star points"
                  data-testid="star-points-numberfield"
                />
              </div>

              {/* Intrusion / Extrusion percentage control (NumberField with min 5%, max 300%) */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Intrusion:</span>
                <NumberField
                  value={Math.round(starRatio * 100)}
                  onChange={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(
                      shapeEl.id,
                      { pointRatio: val / 100 },
                      { skipHistory: true }
                    )
                  }
                  onCommit={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(shapeEl.id, { pointRatio: val / 100 })
                  }
                  unit="%"
                  min={5}
                  max={300}
                  step={1}
                  shiftStep={10}
                  altStep={1}
                  inputWidth={50}
                  ariaLabel="Star intrusion percentage"
                  data-testid="star-ratio-numberfield"
                />
              </div>

              {/* Range slider for smooth intrusion/extrusion adjustment with dynamic label */}
              <div
                className={styles.fieldRow}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                    Ratio:
                  </span>
                  <span
                    className={styles.starTypeBadge}
                    data-testid="star-ratio-type-label"
                  >
                    {starRatio < 0.98
                      ? 'Intruded'
                      : starRatio <= 1.02
                      ? 'Polygon'
                      : 'Extruded'}
                  </span>
                </div>
                <input
                  type="range"
                  className={styles.starPropsSlider}
                  min={5}
                  max={300}
                  step={1}
                  value={Math.round(starRatio * 100)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) / 100;
                    if (shapeEl) {
                      editorActions.updateStarShape(
                        shapeEl.id,
                        { pointRatio: val },
                        { skipHistory: true }
                      );
                    }
                  }}
                  onMouseUp={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value) / 100;
                    if (shapeEl) {
                      editorActions.updateStarShape(shapeEl.id, { pointRatio: val });
                    }
                  }}
                  aria-label="Star intrusion slider"
                  data-testid="star-props-slider"
                />
              </div>

              {/* Preset pills */}
              <div
                className={styles.fieldRow}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}
              >
                <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                  Presets:
                </span>
                <div className={styles.presetPillsGrid} data-testid="star-preset-pills">
                  {STAR_PRESETS.map((p) => {
                    const isSelected =
                      starPts === p.points &&
                      Math.abs(starRatio - p.pointRatio) < 0.02;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.presetPill} ${
                          isSelected ? styles.activePresetPill : ''
                        }`}
                        onClick={() => {
                          if (shapeEl) {
                            editorActions.updateStarShape(shapeEl.id, {
                              points: p.points,
                              pointRatio: p.pointRatio,
                            });
                          }
                        }}
                        title={`${p.name} (${p.points} pts, ${Math.round(
                          p.pointRatio * 100
                        )}%)`}
                        data-testid={`prop-preset-${p.id}`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
