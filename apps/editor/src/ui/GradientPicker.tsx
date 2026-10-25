import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Fill, GradientStop } from '@flashback/runtime';
import { fillToCSS } from '@flashback/runtime';
import styles from './GradientPicker.module.css';

export interface GradientPickerProps {
  fill: Fill | undefined;
  onChange: (fill: Fill) => void;
  onClose?: () => void;
  title?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export const GRADIENT_PRESETS: Array<{ name: string; fill: Fill }> = [
  {
    name: 'Sunset',
    fill: {
      type: 'linearGradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#f12711' },
        { offset: 1, color: '#f5af19' },
      ],
    },
  },
  {
    name: 'Ocean',
    fill: {
      type: 'linearGradient',
      angle: 135,
      stops: [
        { offset: 0, color: '#00c6ff' },
        { offset: 1, color: '#0072ff' },
      ],
    },
  },
  {
    name: 'Neon',
    fill: {
      type: 'linearGradient',
      angle: 45,
      stops: [
        { offset: 0, color: '#f72585' },
        { offset: 0.5, color: '#7209b7' },
        { offset: 1, color: '#4cc9f0' },
      ],
    },
  },
  {
    name: 'Pastel',
    fill: {
      type: 'linearGradient',
      angle: 120,
      stops: [
        { offset: 0, color: '#ff9a9e' },
        { offset: 0.5, color: '#fecfef' },
        { offset: 1, color: '#a1c4fd' },
      ],
    },
  },
  {
    name: 'Chrome',
    fill: {
      type: 'linearGradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#333333' },
        { offset: 0.25, color: '#e0e0e0' },
        { offset: 0.5, color: '#777777' },
        { offset: 0.75, color: '#f5f5f5' },
        { offset: 1, color: '#444444' },
      ],
    },
  },
  {
    name: 'Metallic Gold',
    fill: {
      type: 'linearGradient',
      angle: 45,
      stops: [
        { offset: 0, color: '#bf953f' },
        { offset: 0.25, color: '#fcf6ba' },
        { offset: 0.5, color: '#b38728' },
        { offset: 0.75, color: '#fbf5b7' },
        { offset: 1, color: '#aa771c' },
      ],
    },
  },
];

const SOLID_PALETTE = [
  '#000000',
  '#334155',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#84cc16',
  '#14b8a6',
];

export const GradientPicker: React.FC<GradientPickerProps> = ({
  fill,
  onChange,
  onClose,
  title = 'Fill & Gradient',
  anchorRef,
}) => {
  const currentType =
    fill?.type === 'linearGradient' || fill?.type === 'radialGradient' || fill?.type === 'solid'
      ? fill.type
      : 'solid';

  const [activeTab, setActiveTab] = useState<'solid' | 'linearGradient' | 'radialGradient'>(
    currentType
  );

  const [selectedStopIdx, setSelectedStopIdx] = useState<number>(0);
  const [draggingStopIdx, setDraggingStopIdx] = useState<number | null>(null);
  const [isDraggingAngle, setIsDraggingAngle] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Position popover with fixed positioning relative to anchor element, adjusting if constrained by window edges
  useEffect(() => {
    const targetEl = anchorRef?.current;
    const popoverW = 290;
    const popoverH = 450;
    const margin = 10;

    if (targetEl) {
      const anchorRect = targetEl.getBoundingClientRect();
      let left = anchorRect.left;

      // If in left sidebar / tools panel (e.g. anchor is on left edge), position to the right of the anchor
      if (anchorRect.left < 100) {
        left = anchorRect.right + 12;
      } else if (left + popoverW > window.innerWidth - margin) {
        // If it overflows right, shift left or place to the left of the anchor
        left = Math.max(margin, window.innerWidth - popoverW - margin);
      }

      let top = anchorRect.bottom + 6;
      if (anchorRect.left < 100) {
        // When opening to the side of a toolbar item, align with top of anchor if possible
        top = Math.max(margin, Math.min(anchorRect.top, window.innerHeight - popoverH - margin));
      } else if (top + popoverH > window.innerHeight - margin) {
        const topFlipped = anchorRect.top - popoverH - 6;
        if (topFlipped >= margin) {
          top = topFlipped;
        } else {
          top = Math.max(margin, window.innerHeight - popoverH - margin);
        }
      }

      setPopoverPos({ top, left });
      return;
    }

    // Fallback: place nicely within viewport
    setPopoverPos({
      top: 60,
      left: Math.max(margin, window.innerWidth - popoverW - 280),
    });
  }, [anchorRef]);

  // Normalize current gradient stops
  const currentStops: GradientStop[] =
    fill && (fill.type === 'linearGradient' || fill.type === 'radialGradient')
      ? fill.stops
      : [
          { offset: 0, color: fill && fill.type === 'solid' ? fill.color : '#3b82f6' },
          { offset: 1, color: '#9333ea' },
        ];

  const currentAngle = fill && fill.type === 'linearGradient' ? fill.angle : 90;
  const solidColor = fill && fill.type === 'solid' ? fill.color : '#3b82f6';

  // Handle outside click to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Handle pin dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingStopIdx === null || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const rawOffset = (e.clientX - rect.left) / rect.width;
      const clampedOffset = Math.max(0, Math.min(1, Math.round(rawOffset * 100) / 100));

      const updatedStops = currentStops.map((s, idx) =>
        idx === draggingStopIdx ? { ...s, offset: clampedOffset } : s
      );

      if (activeTab === 'linearGradient') {
        onChange({
          type: 'linearGradient',
          angle: currentAngle,
          stops: updatedStops,
        });
      } else if (activeTab === 'radialGradient') {
        onChange({
          type: 'radialGradient',
          cx: 0.5,
          cy: 0.5,
          r: 0.5,
          stops: updatedStops,
        });
      }
    };

    const handleMouseUp = () => {
      if (draggingStopIdx !== null) {
        setDraggingStopIdx(null);
      }
    };

    if (draggingStopIdx !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingStopIdx, currentStops, activeTab, currentAngle, onChange]);

  // Handle interactive angle dial dragging
  useEffect(() => {
    if (!isDraggingAngle) return;

    const handleAngleMove = (e: MouseEvent) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
      let deg = Math.round((rad * 180) / Math.PI);
      if (deg < 0) deg += 360;

      // Snap to 15 degrees if Shift is held
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15 % 360;
      }

      handleUpdateAngle(deg);
    };

    const handleAngleUp = () => {
      setIsDraggingAngle(false);
    };

    window.addEventListener('mousemove', handleAngleMove);
    window.addEventListener('mouseup', handleAngleUp);

    return () => {
      window.removeEventListener('mousemove', handleAngleMove);
      window.removeEventListener('mouseup', handleAngleUp);
    };
  }, [isDraggingAngle, currentStops, onChange]);

  // Switch tabs
  const handleSelectTab = (tab: 'solid' | 'linearGradient' | 'radialGradient') => {
    setActiveTab(tab);
    if (tab === 'solid') {
      const color = currentStops[selectedStopIdx]?.color ?? solidColor;
      onChange({ type: 'solid', color });
    } else if (tab === 'linearGradient') {
      onChange({
        type: 'linearGradient',
        angle: currentAngle,
        stops: currentStops,
      });
    } else if (tab === 'radialGradient') {
      onChange({
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: currentStops,
      });
    }
  };

  // Click on gradient bar to add a new stop
  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const rawOffset = (e.clientX - rect.left) / rect.width;
    const offset = Math.max(0, Math.min(1, Math.round(rawOffset * 100) / 100));

    // Sample nearest stop color or use selected stop color
    const baseColor = currentStops[selectedStopIdx]?.color ?? '#ffffff';
    const newStop: GradientStop = { offset, color: baseColor };
    const newStops = [...currentStops, newStop].sort((a, b) => a.offset - b.offset);
    const newIdx = newStops.indexOf(newStop);

    setSelectedStopIdx(newIdx !== -1 ? newIdx : 0);

    if (activeTab === 'linearGradient') {
      onChange({
        type: 'linearGradient',
        angle: currentAngle,
        stops: newStops,
      });
    } else {
      onChange({
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: newStops,
      });
    }
  };

  // Delete active stop (requires >= 2 stops)
  const handleDeleteStop = () => {
    if (currentStops.length <= 2) return;
    const updated = currentStops.filter((_, idx) => idx !== selectedStopIdx);
    const nextIdx = Math.max(0, Math.min(updated.length - 1, selectedStopIdx));
    setSelectedStopIdx(nextIdx);

    if (activeTab === 'linearGradient') {
      onChange({
        type: 'linearGradient',
        angle: currentAngle,
        stops: updated,
      });
    } else {
      onChange({
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: updated,
      });
    }
  };

  // Update selected stop color
  const handleUpdateStopColor = (color: string) => {
    const updated = currentStops.map((s, idx) => (idx === selectedStopIdx ? { ...s, color } : s));
    if (activeTab === 'linearGradient') {
      onChange({
        type: 'linearGradient',
        angle: currentAngle,
        stops: updated,
      });
    } else {
      onChange({
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: updated,
      });
    }
  };

  // Update selected stop offset
  const handleUpdateStopOffset = (pct: number) => {
    const offset = Math.max(0, Math.min(100, pct)) / 100;
    const updated = currentStops.map((s, idx) => (idx === selectedStopIdx ? { ...s, offset } : s));
    if (activeTab === 'linearGradient') {
      onChange({
        type: 'linearGradient',
        angle: currentAngle,
        stops: updated,
      });
    } else {
      onChange({
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: updated,
      });
    }
  };

  // Update linear gradient angle
  const handleUpdateAngle = (degrees: number) => {
    const angle = ((degrees % 360) + 360) % 360;
    onChange({
      type: 'linearGradient',
      angle,
      stops: currentStops,
    });
  };

  // Gradient bar CSS background
  const sortedStopsForCss = [...currentStops].sort((a, b) => a.offset - b.offset);
  const barCss = `linear-gradient(to right, ${sortedStopsForCss
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(', ')})`;

  const activeStop = currentStops[selectedStopIdx] ?? currentStops[0];

  const popoverContent = (
    <div
      ref={popoverRef}
      className={styles.pickerPopover}
      style={
        popoverPos
          ? {
              position: 'fixed',
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              marginTop: 0,
              zIndex: 9999,
            }
          : { zIndex: 9999 }
      }
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.pickerHeader}>
        <span className={styles.pickerTitle}>{title}</span>
        {onClose && (
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        )}
      </div>

      {/* Mode Tabs: [ Solid ] [ Linear Gradient ] [ Radial Gradient ] */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'solid' ? styles.active : ''}`}
          onClick={() => handleSelectTab('solid')}
        >
          Solid
        </button>
        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'linearGradient' ? styles.active : ''}`}
          onClick={() => handleSelectTab('linearGradient')}
        >
          Linear Gradient
        </button>
        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'radialGradient' ? styles.active : ''}`}
          onClick={() => handleSelectTab('radialGradient')}
        >
          Radial Gradient
        </button>
      </div>

      {/* Solid Color Mode */}
      {activeTab === 'solid' && (
        <div className={styles.solidColorSection}>
          <div className={styles.stopDetailsRow}>
            <div className={styles.stopColorPickerWrap}>
              <div className={styles.stopColorPreview} style={{ backgroundColor: solidColor }}>
                <input
                  type="color"
                  className={styles.hiddenColorInput}
                  value={solidColor.length === 7 ? solidColor : '#3b82f6'}
                  onChange={(e) => onChange({ type: 'solid', color: e.target.value })}
                />
              </div>
              <input
                type="text"
                className={styles.hexInput}
                value={solidColor}
                onChange={(e) => onChange({ type: 'solid', color: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.solidPaletteGrid}>
            {SOLID_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.solidSwatchBtn}
                style={{ backgroundColor: c }}
                onClick={() => onChange({ type: 'solid', color: c })}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gradient Modes (Linear or Radial) */}
      {(activeTab === 'linearGradient' || activeTab === 'radialGradient') && (
        <>
          {/* Gradient Bar with pins */}
          <div className={styles.gradientBarContainer}>
            <div
              ref={barRef}
              className={styles.gradientBar}
              style={{ background: barCss }}
              onClick={handleBarClick}
              title="Click bar to add a new gradient stop pin"
            />

            {/* Stop Pins */}
            <div className={styles.stopsTrack}>
              {currentStops.map((stop, idx) => {
                const isSelected = idx === selectedStopIdx;
                const leftPct = Math.round(stop.offset * 100);

                return (
                  <div
                    key={idx}
                    className={`${styles.stopPin} ${isSelected ? styles.selected : ''}`}
                    style={{ left: `${leftPct}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStopIdx(idx);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedStopIdx(idx);
                      setDraggingStopIdx(idx);
                    }}
                    title={`Stop ${idx + 1}: ${stop.color} (${leftPct}%) - Drag to slide`}
                  >
                    <div className={styles.stopPinArrow} />
                    <div className={styles.stopPinSquare} style={{ backgroundColor: stop.color }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Stop Details Row */}
          {activeStop && (
            <div className={styles.stopDetailsRow}>
              <div className={styles.stopColorPickerWrap}>
                <div
                  className={styles.stopColorPreview}
                  style={{ backgroundColor: activeStop.color }}
                >
                  <input
                    type="color"
                    className={styles.hiddenColorInput}
                    value={activeStop.color.length === 7 ? activeStop.color : '#3b82f6'}
                    onChange={(e) => handleUpdateStopColor(e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className={styles.hexInput}
                  value={activeStop.color}
                  onChange={(e) => handleUpdateStopColor(e.target.value)}
                  title="Color Hex"
                />
              </div>

              <div className={styles.offsetInputWrap}>
                <span>Loc:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={styles.offsetInput}
                  value={Math.round(activeStop.offset * 100)}
                  onChange={(e) =>
                    handleUpdateStopOffset(parseInt(e.target.value, 10) || 0)
                  }
                  title="Stop Offset (%)"
                />
                <span>%</span>
              </div>

              <button
                type="button"
                className={styles.deleteStopBtn}
                onClick={handleDeleteStop}
                disabled={currentStops.length <= 2}
                title={
                  currentStops.length <= 2
                    ? 'At least 2 gradient stops required'
                    : 'Delete selected stop pin'
                }
              >
                ✕
              </button>
            </div>
          )}

          {/* Linear Gradient Angle Control */}
          {activeTab === 'linearGradient' && (
            <div className={styles.angleSection}>
              <div className={styles.angleRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--mx-text-muted)' }}>Angle:</span>
                  <div
                    ref={dialRef}
                    className={styles.angleDial}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingAngle(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const cx = rect.left + rect.width / 2;
                      const cy = rect.top + rect.height / 2;
                      const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
                      let deg = Math.round((rad * 180) / Math.PI);
                      if (deg < 0) deg += 360;
                      if (e.shiftKey) deg = Math.round(deg / 15) * 15 % 360;
                      handleUpdateAngle(deg);
                    }}
                    title="Click & drag dial to adjust angle (Hold Shift to snap 15°)"
                  >
                    <div
                      className={styles.angleDialNeedle}
                      style={{
                        transform: `translate(0, -50%) rotate(${currentAngle}deg)`,
                      }}
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    className={styles.offsetInput}
                    value={currentAngle}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      handleUpdateAngle(isNaN(v) ? 0 : ((v % 360) + 360) % 360);
                    }}
                    title="Angle in degrees"
                  />
                  <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>°</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ready-Made Gradient Presets */}
      <div className={styles.presetsSection}>
        <div className={styles.presetsTitle}>Presets</div>
        <div className={styles.presetsGrid}>
          {GRADIENT_PRESETS.map((preset) => {
            const cssBg = fillToCSS(preset.fill);
            return (
              <div
                key={preset.name}
                className={styles.presetCard}
                onClick={() => {
                  setActiveTab(preset.fill.type as 'linearGradient' | 'radialGradient');
                  onChange(preset.fill);
                }}
                title={`Apply ${preset.name} Gradient`}
              >
                <div className={styles.presetSwatch} style={{ background: cssBg }} />
                <span className={styles.presetName}>{preset.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(popoverContent, document.body)
    : popoverContent;
};
