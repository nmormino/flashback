import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Activity, X, Play, Pause, RotateCcw, Check } from 'lucide-react';
import { solveCubicBezier } from '@flashback/runtime';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './BezierEditorModal.module.css';

export interface CubicBezierPreset {
  name: string;
  p: [number, number, number, number];
}

export const PRESETS: CubicBezierPreset[] = [
  { name: 'Linear', p: [0, 0, 1, 1] },
  { name: 'Ease In', p: [0.42, 0, 1, 1] },
  { name: 'Ease Out', p: [0, 0, 0.58, 1] },
  { name: 'Ease In-Out', p: [0.42, 0, 0.58, 1] },
  { name: 'Back', p: [0.34, 1.56, 0.64, 1] },
  { name: 'Bounce', p: [0.68, -0.55, 0.27, 1.55] },
];

export const BezierEditorModal: React.FC = () => {
  const isOpen = useEditorStore((s) => s.bezierModalOpen);
  const target = useEditorStore((s) => s.activeBezierTarget);

  const [p1x, setP1x] = useState(0.42);
  const [p1y, setP1y] = useState(0);
  const [p2x, setP2x] = useState(0.58);
  const [p2y, setP2y] = useState(1);

  const [draggingHandle, setDraggingHandle] = useState<1 | 2 | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Initialize from target keyframe easing if present
  useEffect(() => {
    if (isOpen && target?.initialEasing) {
      const e = target.initialEasing;
      if (e.type === 'cubic-bezier') {
        setP1x(e.p[0]);
        setP1y(e.p[1]);
        setP2x(e.p[2]);
        setP2y(e.p[3]);
      } else if (e.type === 'preset') {
        const found = PRESETS.find((pr) => pr.name.toLowerCase().replace(' ', '-') === e.name);
        if (found) {
          setP1x(found.p[0]);
          setP1y(found.p[1]);
          setP2x(found.p[2]);
          setP2y(found.p[3]);
        }
      } else if (e.type === 'linear') {
        setP1x(0);
        setP1y(0);
        setP2x(1);
        setP2y(1);
      }
    }
  }, [isOpen, target]);

  // Live preview animation loop
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    let animId: number;
    let startTime: number | null = null;
    const durationMs = 1200;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = (now - startTime) % durationMs;
      const t = elapsed / durationMs;
      setPreviewProgress(t);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isPlaying]);

  // SVG coordinate mapping
  // Canvas width = 408, height = 240
  // P0 is at (50, 180), P3 is at (350, 60)
  // X range: 0 -> 50, 1 -> 350 (width = 300)
  // Y range: 0 -> 180, 1 -> 60 (height = 120, allows y overshoot between -0.6 and 1.6)
  const SVG_W = 408;
  const SVG_H = 240;
  const P0_X = 50;
  const P0_Y = 180;
  const SCALE_X = 300;
  const SCALE_Y = 120;

  const toSvgX = (x: number) => P0_X + x * SCALE_X;
  const toSvgY = (y: number) => P0_Y - y * SCALE_Y;

  const fromSvgX = (sx: number) => Math.max(0, Math.min(1, (sx - P0_X) / SCALE_X));
  const fromSvgY = (sy: number) => (P0_Y - sy) / SCALE_Y;

  const handlePointerDown = (handleNum: 1 | 2, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingHandle(handleNum);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const nx = Math.round(fromSvgX(mouseX) * 100) / 100;
    const ny = Math.round(fromSvgY(mouseY) * 100) / 100;

    if (draggingHandle === 1) {
      setP1x(nx);
      setP1y(ny);
      if (target) {
        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
          type: 'cubic-bezier',
          p: [nx, ny, p2x, p2y],
        });
      }
    } else {
      setP2x(nx);
      setP2y(ny);
      if (target) {
        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
          type: 'cubic-bezier',
          p: [p1x, p1y, nx, ny],
        });
      }
    }
  };

  const handlePointerUp = () => {
    setDraggingHandle(null);
  };

  const applyPreset = (preset: CubicBezierPreset) => {
    setP1x(preset.p[0]);
    setP1y(preset.p[1]);
    setP2x(preset.p[2]);
    setP2y(preset.p[3]);

    if (target) {
      editorActions.setKeyframeEasing(target.layerId, target.kfId, {
        type: 'cubic-bezier',
        p: [preset.p[0], preset.p[1], preset.p[2], preset.p[3]],
      });
    }
  };

  const handleClose = () => {
    editorActions.closeBezierEditor();
  };

  if (!isOpen) return null;

  const evaluatedY = solveCubicBezier(p1x, p1y, p2x, p2y, previewProgress);
  const ballLeftPct = Math.max(0, Math.min(100, evaluatedY * 100));

  const pathD = `M ${toSvgX(0)} ${toSvgY(0)} C ${toSvgX(p1x)} ${toSvgY(p1y)}, ${toSvgX(p2x)} ${toSvgY(p2y)}, ${toSvgX(1)} ${toSvgY(1)}`;

  const currentCSS = `cubic-bezier(${p1x}, ${p1y}, ${p2x}, ${p2y})`;

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        {/* Title bar */}
        <div className={styles.titleBar}>
          <div className={styles.titleGroup}>
            <Activity size={16} />
            <span>Cubic Bézier Curve Editor</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={handleClose} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Presets Row */}
          <div className={styles.presetsRow}>
            {PRESETS.map((preset) => {
              const isActive =
                Math.abs(p1x - preset.p[0]) < 0.01 &&
                Math.abs(p1y - preset.p[1]) < 0.01 &&
                Math.abs(p2x - preset.p[2]) < 0.01 &&
                Math.abs(p2y - preset.p[3]) < 0.01;
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ''}`}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          {/* Draggable 2-Handle SVG Curve Canvas */}
          <div className={styles.curveCanvasContainer}>
            <svg
              ref={svgRef}
              className={styles.svgCurve}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* Unit boundary box [0, 0] to [1, 1] */}
              <rect
                x={toSvgX(0)}
                y={toSvgY(1)}
                width={SCALE_X}
                height={SCALE_Y}
                fill="rgba(255, 255, 255, 0.02)"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeDasharray="4 4"
                rx={2}
              />

              {/* Diagonal linear reference guide */}
              <line
                x1={toSvgX(0)}
                y1={toSvgY(0)}
                x2={toSvgX(1)}
                y2={toSvgY(1)}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="3 3"
              />

              {/* Control Point 1 Handle Line */}
              <line
                x1={toSvgX(0)}
                y1={toSvgY(0)}
                x2={toSvgX(p1x)}
                y2={toSvgY(p1y)}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />

              {/* Control Point 2 Handle Line */}
              <line
                x1={toSvgX(1)}
                y1={toSvgY(1)}
                x2={toSvgX(p2x)}
                y2={toSvgY(p2y)}
                stroke="#a855f7"
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />

              {/* Bézier Curve Path */}
              <path
                d={pathD}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={3}
                strokeLinecap="round"
              />

              {/* Control Point 1 (Draggable Diamond/Circle Handle) */}
              <g
                transform={`translate(${toSvgX(p1x)}, ${toSvgY(p1y)})`}
                onPointerDown={(e) => handlePointerDown(1, e)}
                style={{ cursor: 'grab' }}
              >
                <circle r={14} fill="rgba(56, 189, 248, 0.15)" />
                <circle r={7} fill="#38bdf8" stroke="#ffffff" strokeWidth={2} />
              </g>

              {/* Control Point 2 (Draggable Diamond/Circle Handle) */}
              <g
                transform={`translate(${toSvgX(p2x)}, ${toSvgY(p2y)})`}
                onPointerDown={(e) => handlePointerDown(2, e)}
                style={{ cursor: 'grab' }}
              >
                <circle r={14} fill="rgba(168, 85, 247, 0.15)" />
                <circle r={7} fill="#a855f7" stroke="#ffffff" strokeWidth={2} />
              </g>

              {/* Start and End Anchor points */}
              <circle cx={toSvgX(0)} cy={toSvgY(0)} r={4} fill="#94a3b8" />
              <circle cx={toSvgX(1)} cy={toSvgY(1)} r={4} fill="#94a3b8" />
            </svg>
          </div>

          {/* Numeric Fields Row */}
          <div className={styles.inputsRow}>
            {/* Handle 1 Inputs */}
            <div className={styles.handleInputGroup}>
              <div className={styles.handleLabel} style={{ color: '#38bdf8' }}>
                <span>● Handle 1</span>
              </div>
              <div className={styles.inputPair}>
                <div className={styles.inputField}>
                  <span className={styles.fieldLabel}>X₁</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className={styles.numInput}
                    value={p1x}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setP1x(v);
                      if (target) {
                        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
                          type: 'cubic-bezier',
                          p: [v, p1y, p2x, p2y],
                        });
                      }
                    }}
                  />
                </div>
                <div className={styles.inputField}>
                  <span className={styles.fieldLabel}>Y₁</span>
                  <input
                    type="number"
                    step="0.05"
                    className={styles.numInput}
                    value={p1y}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setP1y(v);
                      if (target) {
                        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
                          type: 'cubic-bezier',
                          p: [p1x, v, p2x, p2y],
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Handle 2 Inputs */}
            <div className={styles.handleInputGroup}>
              <div className={styles.handleLabel} style={{ color: '#a855f7' }}>
                <span>● Handle 2</span>
              </div>
              <div className={styles.inputPair}>
                <div className={styles.inputField}>
                  <span className={styles.fieldLabel}>X₂</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className={styles.numInput}
                    value={p2x}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setP2x(v);
                      if (target) {
                        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
                          type: 'cubic-bezier',
                          p: [p1x, p1y, v, p2y],
                        });
                      }
                    }}
                  />
                </div>
                <div className={styles.inputField}>
                  <span className={styles.fieldLabel}>Y₂</span>
                  <input
                    type="number"
                    step="0.05"
                    className={styles.numInput}
                    value={p2y}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setP2y(v);
                      if (target) {
                        editorActions.setKeyframeEasing(target.layerId, target.kfId, {
                          type: 'cubic-bezier',
                          p: [p1x, p1y, p2x, v],
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Motion Preview Section */}
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <span>Live Motion Preview</span>
              <button
                type="button"
                className={styles.closeBtn}
                style={{ width: 'auto', padding: '0 4px', height: '20px' }}
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
            <div className={styles.previewTrack}>
              <div
                className={styles.previewBall}
                style={{ left: `${ballLeftPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.cssBadge} title={currentCSS}>
            {currentCSS}
          </div>
          <button type="button" className={styles.applyBtn} onClick={handleClose}>
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
