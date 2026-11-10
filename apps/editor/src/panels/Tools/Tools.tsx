import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MousePointer2,
  MousePointer,
  PenTool,
  Type as TypeIcon,
  Square as SquareIcon,
  Circle as CircleIcon,
  Star as StarIcon,
  Hand as HandIcon,
  Pencil as PencilIcon,
  ArrowLeftRight,
  Image as ImageIcon,
  Video as VideoIcon,
} from 'lucide-react';
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
import { PencilOptionsModal } from './PencilOptionsModal';
import styles from './Tools.module.css';
import dialogStyles from '../../dialogs/Dialog.module.css';

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
  const activeStroke = useEditorStore((s) => s.activeStroke);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const isolationStack = useEditorStore((s) => s.isolationStack);

  const [isFillPickerOpen, setIsFillPickerOpen] = useState(false);
  const [isStrokePickerOpen, setIsStrokePickerOpen] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=480&q=80');
  const [imageWidth, setImageWidth] = useState(240);
  const [imageHeight, setImageHeight] = useState(180);
  const [videoUrl, setVideoUrl] = useState('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
  const [videoWidth, setVideoWidth] = useState(320);
  const [videoHeight, setVideoHeight] = useState(180);
  const fillSwatchRef = useRef<HTMLDivElement>(null);
  const strokeSwatchRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        editorActions.addBitmapElement(
          src,
          file.name.replace(/\.[^/.]+$/, ''),
          img.naturalWidth || 240,
          img.naturalHeight || 180
        );
        setShowImageModal(false);
      };
      img.onerror = () => {
        editorActions.addBitmapElement(
          src,
          file.name.replace(/\.[^/.]+$/, ''),
          240,
          180
        );
        setShowImageModal(false);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInsertImageUrl = () => {
    if (!imageUrl.trim()) return;
    editorActions.addBitmapElement(imageUrl.trim(), 'Image', imageWidth, imageHeight);
    setShowImageModal(false);
  };

  const handleInsertVideo = () => {
    if (!videoUrl.trim()) return;
    editorActions.addVideoElement(videoUrl.trim(), videoWidth, videoHeight);
    setShowVideoModal(false);
  };

  const tools: ToolItem[] = [
    {
      id: 'select',
      label: 'Selection Tool',
      shortcut: 'V',
      icon: <MousePointer2 size={17} strokeWidth={2.2} />,
    },
    {
      id: 'subselect',
      label: 'Subselection Tool',
      shortcut: 'A',
      icon: <MousePointer size={17} strokeWidth={1.8} />,
    },
    {
      id: 'pen',
      label: 'Pen Tool',
      shortcut: 'P',
      icon: <PenTool size={17} strokeWidth={1.9} />,
    },
    {
      id: 'pencil',
      label: 'Pencil Tool',
      shortcut: 'N',
      icon: <PencilIcon size={17} strokeWidth={2} />,
    },
    {
      id: 'text',
      label: 'Text Tool',
      shortcut: 'T',
      icon: <TypeIcon size={17} strokeWidth={2.2} />,
    },
    {
      id: 'rect',
      label: 'Rectangle Tool',
      shortcut: 'R',
      icon: <SquareIcon size={17} strokeWidth={2} />,
    },
    {
      id: 'oval',
      label: 'Oval Tool',
      shortcut: 'O',
      icon: <CircleIcon size={17} strokeWidth={2} />,
    },
    {
      id: 'polygon',
      label: 'Polygon & Star Tool',
      shortcut: 'S',
      icon: <StarIcon size={17} strokeWidth={2} />,
    },
    {
      id: 'hand',
      label: 'Hand Tool (Pan Stage)',
      shortcut: 'H',
      icon: <HandIcon size={17} strokeWidth={1.9} />,
    },
  ];

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
                newFill.type === 'none'
                  ? 'transparent'
                  : newFill.type === 'solid'
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

  const handleStrokeChange = (newStroke: Fill) => {
    editorActions.setActiveStroke(newStroke);

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
                idx === 0
                  ? {
                      ...p,
                      stroke: {
                        fill: newStroke,
                        width: p.stroke?.width ?? (strokeWidth || 1),
                        cap: p.stroke?.cap ?? 'round',
                        join: p.stroke?.join ?? 'round',
                        dash: p.stroke?.dash,
                      },
                    }
                  : p
              );
              editorActions.updateElementProps(el.id, { paths: newPaths });
            } else if (el.type === 'text') {
              const textEl = el as TextElement;
              editorActions.updateElementProps(el.id, {
                stroke: {
                  fill: newStroke,
                  width: textEl.stroke?.width ?? (strokeWidth || 1),
                  cap: textEl.stroke?.cap ?? 'round',
                  join: textEl.stroke?.join ?? 'round',
                },
              });
            }
          }
        }
      }
    }
  };

  const handleSwapColors = () => {
    const prevFill: Fill = activeFill ?? { type: 'solid', color: fillColor };
    const prevStroke: Fill = activeStroke ?? { type: 'solid', color: strokeColor };
    handleFillChange(prevStroke);
    handleStrokeChange(prevFill);
  };

  const fillCss = activeFill ? fillToCSS(activeFill) : fillColor;
  const strokeCss = activeStroke ? fillToCSS(activeStroke) : strokeColor;

  return (
    <div
      className={styles.toolsPanel}
      title="Tools"
    >
      <div className={styles.panelHeader}>Tools</div>

      <div className={styles.toolGrid}>
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          return (
            <div key={t.id} style={{ position: 'relative' }}>
              <button
                className={`${styles.toolBtn} ${isActive ? styles.active : ''}`}
                onClick={() => editorActions.setActiveTool(t.id)}
                onDoubleClick={() => {
                  if (t.id === 'pencil') {
                    editorActions.setPencilOptionsOpen(true);
                  }
                }}
                title={
                  t.id === 'pencil'
                    ? `${t.label} (${t.shortcut})\nDouble-click to open Pencil Tool Options`
                    : `${t.label} (${t.shortcut})`
                }
                type="button"
                data-testid={`tool-btn-${t.id}`}
              >
                {t.icon}
              </button>
              {t.id === 'pencil' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    editorActions.setPencilOptionsOpen(true);
                  }}
                  title="Pencil Tool Options"
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 7,
                    height: 7,
                    borderLeft: '4px solid transparent',
                    borderBottom: '4px solid var(--mx-text-muted, #94a3b8)',
                    background: 'transparent',
                    borderTop: 'none',
                    borderRight: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                  data-testid="pencil-options-trigger"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.separator} />

      {/* Media Section */}
      <div className={styles.colorsSection}>
        <div className={styles.sectionLabel}>Media</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', alignItems: 'center' }}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setShowImageModal(true)}
            title="Insert Image (Raster)"
            aria-label="Insert Image (Raster)"
            data-testid="insert-image-btn"
          >
            <ImageIcon size={18} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setShowVideoModal(true)}
            title="Insert Video (URL / YouTube / Vimeo)"
            aria-label="Insert Video (URL / YouTube / Vimeo)"
            data-testid="insert-video-btn"
          >
            <VideoIcon size={18} />
          </button>
        </div>
      </div>

      <div className={styles.separator} />

      {/* Colors Section */}
      <div className={styles.colorsSection}>
        <div className={styles.sectionLabel}>Colors</div>

        <div className={styles.swatchesContainer}>
          {/* Stroke (Border) Swatch */}
          <div
            ref={strokeSwatchRef}
            data-testid="tools-stroke-swatch"
            className={`${styles.strokeSwatch} ${activeStroke?.type === 'none' ? styles.noneFillSwatch : ''}`}
            style={{ background: activeStroke?.type === 'none' ? undefined : strokeCss }}
            title="Click to edit Border / Stroke & Gradient"
            onClick={() => {
              setIsStrokePickerOpen(!isStrokePickerOpen);
              setIsFillPickerOpen(false);
            }}
          />

          {isStrokePickerOpen && (
            <GradientPicker
              fill={activeStroke ?? { type: 'solid', color: strokeColor }}
              onChange={handleStrokeChange}
              onClose={() => setIsStrokePickerOpen(false)}
              anchorRef={strokeSwatchRef}
              title="Border / Stroke & Gradient"
            />
          )}

          {/* Fill (Body) Swatch */}
          <div
            ref={fillSwatchRef}
            data-testid="tools-fill-swatch"
            className={`${styles.fillSwatch} ${activeFill?.type === 'none' ? styles.noneFillSwatch : ''}`}
            style={{ background: activeFill?.type === 'none' ? undefined : fillCss }}
            title="Click to edit Fill / Gradient"
            onClick={() => {
              setIsFillPickerOpen(!isFillPickerOpen);
              setIsStrokePickerOpen(false);
            }}
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

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            className={styles.swapBtn}
            onClick={handleSwapColors}
            title="Swap Stroke & Fill (X)"
          >
            <ArrowLeftRight size={13} />
          </button>
          <button
            type="button"
            data-testid="tools-none-fill-btn"
            className={styles.swapBtn}
            onClick={() => {
              if (isStrokePickerOpen) {
                handleStrokeChange({ type: 'none' });
              } else {
                handleFillChange({ type: 'none' });
              }
            }}
            title="Set Fill or Active Picker to None / Transparent (/)"
          >
            <span style={{ fontSize: 13, fontWeight: 'bold', color: '#ef4444', lineHeight: 1 }}>⃠</span>
          </button>
        </div>
      </div>

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileChange}
      />

      {/* Insert Image Modal (portaled to document.body to always appear at topmost z-index) */}
      {showImageModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={dialogStyles.modalOverlay} onClick={() => setShowImageModal(false)}>
            <div
              className={dialogStyles.dialogWindow}
              style={{ width: 440 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={dialogStyles.titleBar}>
                <span>Insert Image (Raster)</span>
                <button
                  type="button"
                  className={dialogStyles.closeBtn}
                  onClick={() => setShowImageModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className={dialogStyles.dialogBody}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className={dialogStyles.btnOk}
                    style={{ flex: 1 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📁 Choose Image File (PNG, JPG, SVG, WebP)...
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: 'var(--mx-border-light)' }} />
                  <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>OR ENTER IMAGE URL</span>
                  <div style={{ flex: 1, height: 1, backgroundColor: 'var(--mx-border-light)' }} />
                </div>

                <div className={dialogStyles.formRow}>
                  <span className={dialogStyles.formLabel}>Image URL:</span>
                  <input
                    type="text"
                    className={dialogStyles.textInput}
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    data-testid="image-url-input"
                  />
                </div>

                <div className={dialogStyles.formRow}>
                  <span className={dialogStyles.formLabel}>Dimensions:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      className={dialogStyles.textInput}
                      style={{ width: 70 }}
                      value={imageWidth}
                      onChange={(e) => setImageWidth(parseInt(e.target.value, 10) || 240)}
                      title="Width"
                    />
                    <span>×</span>
                    <input
                      type="number"
                      className={dialogStyles.textInput}
                      style={{ width: 70 }}
                      value={imageHeight}
                      onChange={(e) => setImageHeight(parseInt(e.target.value, 10) || 180)}
                      title="Height"
                    />
                    <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>px</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={dialogStyles.btnCancel}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => {
                      setImageUrl('https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=480&q=80');
                      setImageWidth(240);
                      setImageHeight(180);
                    }}
                  >
                    Sample Art (Unsplash)
                  </button>
                  <button
                    type="button"
                    className={dialogStyles.btnCancel}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => {
                      setImageUrl('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="%233b82f6"/><circle cx="100" cy="75" r="40" fill="%23fbbf24"/></svg>');
                      setImageWidth(200);
                      setImageHeight(150);
                    }}
                  >
                    Sample SVG Icon
                  </button>
                </div>

                <div className={dialogStyles.dialogButtons}>
                  <button
                    type="button"
                    className={dialogStyles.btnCancel}
                    onClick={() => setShowImageModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={dialogStyles.btnOk}
                    onClick={handleInsertImageUrl}
                    data-testid="insert-image-submit-btn"
                  >
                    Insert Image
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Insert Video Modal (portaled to document.body to always appear at topmost z-index) */}
      {showVideoModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={dialogStyles.modalOverlay} onClick={() => setShowVideoModal(false)}>
            <div
              className={dialogStyles.dialogWindow}
              style={{ width: 460 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={dialogStyles.titleBar}>
                <span>Insert Video (Direct MP4 / WebM / YouTube / Vimeo)</span>
                <button
                  type="button"
                  className={dialogStyles.closeBtn}
                  onClick={() => setShowVideoModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className={dialogStyles.dialogBody}>
                <div className={dialogStyles.formRow}>
                  <span className={dialogStyles.formLabel}>Video URL:</span>
                  <input
                    type="text"
                    className={dialogStyles.textInput}
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://... (.mp4, YouTube, Vimeo)"
                    data-testid="video-url-input"
                  />
                </div>

                {/* Preset 1-click sample links */}
                <div className={dialogStyles.formRow}>
                  <span className={dialogStyles.formLabel}>Presets:</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={dialogStyles.btnCancel}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                        setVideoWidth(320);
                        setVideoHeight(180);
                      }}
                    >
                      Sample MP4
                    </button>
                    <button
                      type="button"
                      className={dialogStyles.btnCancel}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        setVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                        setVideoWidth(320);
                        setVideoHeight(180);
                      }}
                    >
                      YouTube Sample
                    </button>
                    <button
                      type="button"
                      className={dialogStyles.btnCancel}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        setVideoUrl('https://player.vimeo.com/video/76979871');
                        setVideoWidth(320);
                        setVideoHeight(180);
                      }}
                    >
                      Vimeo Sample
                    </button>
                  </div>
                </div>

                <div className={dialogStyles.formRow}>
                  <span className={dialogStyles.formLabel}>Dimensions:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      className={dialogStyles.textInput}
                      style={{ width: 70 }}
                      value={videoWidth}
                      onChange={(e) => setVideoWidth(parseInt(e.target.value, 10) || 320)}
                      title="Width"
                    />
                    <span>×</span>
                    <input
                      type="number"
                      className={dialogStyles.textInput}
                      style={{ width: 70 }}
                      value={videoHeight}
                      onChange={(e) => setVideoHeight(parseInt(e.target.value, 10) || 180)}
                      title="Height"
                    />
                    <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>px</span>
                  </div>
                </div>

                <div className={dialogStyles.dialogButtons}>
                  <button
                    type="button"
                    className={dialogStyles.btnCancel}
                    onClick={() => setShowVideoModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={dialogStyles.btnOk}
                    onClick={handleInsertVideo}
                    data-testid="insert-video-submit-btn"
                  >
                    Insert Video
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <PencilOptionsModal />
    </div>
  );
};
