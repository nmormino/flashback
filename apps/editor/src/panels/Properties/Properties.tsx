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
  CornerType,
  RectCornerRadius,
  RectCornerTypes,
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
import {
  STAR_PRESETS,
  normalizeCornerRadii,
  isUniformCornerRadius,
  getUniformCornerRadius,
  normalizeCornerTypes,
  isUniformCornerType,
  getUniformCornerType,
} from '../../utils/shapeGenerators';
import { isPathClosed, parseSvgPath, getAnchorPointType } from '../../utils/bezier';
import { getWeightLabel, STANDARD_WEIGHTS } from '../../utils/fontParser';
import styles from './Properties.module.css';

interface AccordionSectionProps {
  id: string;
  category: string;
  activeCategory: string;
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  summary?: string;
  collapsed: boolean;
  onToggle: () => void;
  testId?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  id,
  category,
  activeCategory,
  title,
  icon,
  badge,
  summary,
  collapsed,
  onToggle,
  testId,
  style,
  children,
}) => {
  const isHidden = activeCategory !== 'all' && activeCategory !== category;

  return (
    <div
      id={id}
      className={`${styles.propSection} ${collapsed ? styles.collapsedSection : ''} ${isHidden ? styles.hiddenSection : ''}`}
      data-testid={testId}
      style={{
        ...style,
        display: isHidden ? 'none' : undefined,
      }}
    >
      <div
        className={styles.accordionHeader}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={!collapsed}
      >
        <div className={styles.accordionTitleArea}>
          <span className={styles.accordionChevron}>{collapsed ? '▸' : '▾'}</span>
          {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
          <span>{title}</span>
          {badge && <span className={styles.typeBadge}>{badge}</span>}
        </div>
        <div className={styles.accordionRightArea}>
          {summary && <span className={styles.accordionSummaryPill}>{summary}</span>}
        </div>
      </div>
      <div
        className={styles.accordionBody}
        style={{ display: collapsed ? 'none' : 'flex' }}
      >
        {children}
      </div>
    </div>
  );
};

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
  const activeTool = useEditorStore((s) => s.activeTool);
  const defaultRectConfig = useEditorStore((s) => s.rectConfig);
  const defaultStarConfig = useEditorStore((s) => s.starConfig);
  const defaultOvalConfig = useEditorStore((s) => s.ovalConfig);
  const pencilConfig = useEditorStore((s) => s.pencilConfig);
  const subselectedAnchor = useEditorStore((s) => s.subselectedAnchor);

  const [viewMode, setViewMode] = useState<'tabs' | 'accordion' | 'dropdown'>('tabs');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) =>
    setExpandedSections((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const isSectionExpanded = (id: string) => expandedSections[id] ?? true;

  const [shapeGradientOpen, setShapeGradientOpen] = useState(false);
  const [shapeStrokeGradientOpen, setShapeStrokeGradientOpen] = useState(false);
  const [textGradientOpen, setTextGradientOpen] = useState(false);
  const [textStrokeGradientOpen, setTextStrokeGradientOpen] = useState(false);
  const [stageGradientOpen, setStageGradientOpen] = useState(false);
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [unlinkRectCorners, setUnlinkRectCorners] = useState(false);
  const shapeFillRef = useRef<HTMLDivElement>(null);
  const shapeStrokeRef = useRef<HTMLDivElement>(null);
  const textFillRef = useRef<HTMLDivElement>(null);
  const textStrokeRef = useRef<HTMLDivElement>(null);
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

    const stageCategories = [
      { id: 'all', name: 'All Categories', icon: '📑' },
      ...(activeTool === 'rect' || activeTool === 'polygon' || activeTool === 'oval' || activeTool === 'pencil'
        ? [{ id: 'tools', name: 'Tool Defaults', icon: '🛠️' }]
        : []),
      ...(selectedLayer
        ? [{ id: 'layer', name: selectedLayer.kind === 'folder' ? 'Folder' : 'Layer', icon: selectedLayer.kind === 'folder' ? '📁' : '📄' }]
        : []),
      { id: 'stage', name: 'Stage & Canvas', icon: '🎬' },
      { id: 'layout', name: 'Breakpoints', icon: '📱' },
      { id: 'accessibility', name: 'Accessibility', icon: '♿' },
      { id: 'i18n', name: 'Localization', icon: '🌐' },
    ];

    const allStageSectionIds = [
      ...(activeTool === 'rect' ? ['tool-rect-defaults'] : []),
      ...(activeTool === 'polygon' ? ['tool-polygon-defaults'] : []),
      ...(activeTool === 'oval' ? ['tool-oval-defaults'] : []),
      ...(activeTool === 'pencil' ? ['tool-pencil-defaults'] : []),
      ...(selectedLayer ? ['layer-properties'] : []),
      'stage-dimensions',
      'stage-fps',
      'stage-background',
      'stage-breakpoints',
      'stage-reduced-motion',
      'stage-i18n',
    ];

    const stageCategoryCounts: Record<string, number> = {
      tools:
        (activeTool === 'rect' ? 1 : 0) +
        (activeTool === 'polygon' ? 1 : 0) +
        (activeTool === 'oval' ? 1 : 0) +
        (activeTool === 'pencil' ? 1 : 0),
      layer: selectedLayer ? 1 : 0,
      stage: 3,
      layout: 1,
      accessibility: 1,
      i18n: 1,
    };

    const effectiveStageCategory = stageCategories.some((c) => c.id === activeCategory)
      ? activeCategory
      : 'all';

    const areAllStageCollapsed =
      allStageSectionIds.length > 0 &&
      allStageSectionIds.every((id) => expandedSections[id] === false);

    const handleToggleAllStage = () => {
      if (areAllStageCollapsed) {
        setExpandedSections({});
      } else {
        const nextMap: Record<string, boolean> = {};
        allStageSectionIds.forEach((id) => {
          nextMap[id] = false;
        });
        setExpandedSections(nextMap);
      }
    };

    return (
      <div className={`${styles.propertiesRoot} ${styles.propertiesContainer}`}>
        <div className={styles.propertiesHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.targetChip} title="Stage & Layers">
              <span>🎬 Stage & Layers</span>
            </div>
            <select
              data-testid="properties-category-dropdown"
              className={styles.categoryDropdown}
              value={effectiveStageCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              aria-label="Filter Properties Category"
            >
              {stageCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.viewModeGroup}>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === 'tabs' ? styles.viewModeBtnActive : ''}`}
                onClick={() => setViewMode('tabs')}
                title="Vertical Tabs View"
              >
                📑 Tabs
              </button>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === 'accordion' ? styles.viewModeBtnActive : ''}`}
                onClick={() => setViewMode('accordion')}
                title="Accordion Stack View"
              >
                ▾ Accordion
              </button>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === 'dropdown' ? styles.viewModeBtnActive : ''}`}
                onClick={() => setViewMode('dropdown')}
                title="Form Only View"
              >
                ▾ Form Only
              </button>
            </div>
            <button
              type="button"
              className={styles.toggleAllBtn}
              onClick={handleToggleAllStage}
              title={areAllStageCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            >
              {areAllStageCollapsed ? '▸ Expand All' : '▾ Collapse All'}
            </button>
          </div>
        </div>

        <div className={styles.propertiesBody}>
          {viewMode === 'tabs' && (
            <div className={styles.verticalTabsRail}>
              {stageCategories.map((c) => {
                const isActive = effectiveStageCategory === c.id;
                const count = c.id === 'all' ? allStageSectionIds.length : (stageCategoryCounts[c.id] ?? 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.verticalTabBtn} ${isActive ? styles.activeTab : ''}`}
                    onClick={() => setActiveCategory(c.id)}
                    title={c.name}
                  >
                    <div className={styles.verticalTabLabelArea}>
                      <span>{c.icon}</span>
                      <span>{c.name}</span>
                    </div>
                    <span className={styles.tabCountBadge}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.propertiesContentArea}>
        {/* Active Shape Tool Defaults (Rectangle / Polygon / Oval) */}
        {activeTool === 'rect' && (
          <AccordionSection
            id="tool-rect-defaults"
            category="tools"
            activeCategory={effectiveStageCategory}
            title="Rectangle Tool Options"
            icon="▢"
            badge="Live Corners"
            summary={`r=${getUniformCornerRadius(defaultRectConfig.cornerRadius)}px`}
            collapsed={!isSectionExpanded('tool-rect-defaults')}
            onToggle={() => toggleSection('tool-rect-defaults')}
            testId="tool-rect-defaults-section"
          >
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Radius:</span>
              <NumberField
                value={getUniformCornerRadius(defaultRectConfig.cornerRadius)}
                onChange={(val) => editorActions.setRectConfig({ cornerRadius: val })}
                onCommit={(val) => editorActions.setRectConfig({ cornerRadius: val })}
                unit="px"
                min={0}
                max={200}
                step={1}
                shiftStep={5}
                altStep={0.5}
                inputWidth={50}
                ariaLabel="Default rectangle corner radius"
                data-testid="tool-rect-corner-radius-input"
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Corner Style:</span>
              <div className={styles.morphBtnGroup}>
                {(['round', 'inverted', 'chamfer'] as CornerType[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    className={`${styles.morphBtn} ${defaultRectConfig.cornerType === ct ? styles.activePresetPill : ''}`}
                    onClick={() => editorActions.setRectConfig({ cornerType: ct })}
                  >
                    {ct === 'round' ? '╭ Round' : ct === 'inverted' ? '╯ Inverted' : '╱ Chamfer'}
                  </button>
                ))}
              </div>
            </div>
          </AccordionSection>
        )}

        {activeTool === 'polygon' && (
          <AccordionSection
            id="tool-polygon-defaults"
            category="tools"
            activeCategory={effectiveStageCategory}
            title="Polygon & Star Tool Options"
            icon="⭐"
            summary={`${defaultStarConfig.points} pts, ${Math.round(defaultStarConfig.pointRatio * 100)}%`}
            collapsed={!isSectionExpanded('tool-polygon-defaults')}
            onToggle={() => toggleSection('tool-polygon-defaults')}
            testId="tool-polygon-defaults-section"
          >
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Points:</span>
              <NumberField
                value={defaultStarConfig.points}
                onChange={(val) => editorActions.setStarConfig({ points: val })}
                onCommit={(val) => editorActions.setStarConfig({ points: val })}
                min={3}
                max={64}
                step={1}
                inputWidth={50}
                ariaLabel="Default star points"
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Intrusion:</span>
              <NumberField
                value={Math.round(defaultStarConfig.pointRatio * 100)}
                onChange={(val) => editorActions.setStarConfig({ pointRatio: val / 100 })}
                onCommit={(val) => editorActions.setStarConfig({ pointRatio: val / 100 })}
                unit="%"
                min={5}
                max={300}
                step={1}
                inputWidth={50}
                ariaLabel="Default star ratio"
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Corner Radius:</span>
              <NumberField
                value={defaultStarConfig.cornerRadius ?? 0}
                onChange={(val) => editorActions.setStarConfig({ cornerRadius: val })}
                onCommit={(val) => editorActions.setStarConfig({ cornerRadius: val })}
                unit="px"
                min={0}
                max={100}
                step={1}
                inputWidth={50}
                ariaLabel="Default polygon corner radius"
              />
            </div>
          </AccordionSection>
        )}

        {activeTool === 'oval' && (
          <AccordionSection
            id="tool-oval-defaults"
            category="tools"
            activeCategory={effectiveStageCategory}
            title="Oval Tool Options"
            icon="◯"
            badge="Pie & Donut"
            summary={`Hole: ${Math.round((defaultOvalConfig.innerRadiusRatio ?? 0) * 100)}%`}
            collapsed={!isSectionExpanded('tool-oval-defaults')}
            onToggle={() => toggleSection('tool-oval-defaults')}
            testId="tool-oval-defaults-section"
          >
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Inner Hole:</span>
              <NumberField
                value={Math.round((defaultOvalConfig.innerRadiusRatio ?? 0) * 100)}
                onChange={(val) => editorActions.setOvalConfig({ innerRadiusRatio: val / 100 })}
                onCommit={(val) => editorActions.setOvalConfig({ innerRadiusRatio: val / 100 })}
                unit="%"
                min={0}
                max={90}
                step={1}
                inputWidth={50}
                ariaLabel="Default donut inner radius ratio"
              />
            </div>
          </AccordionSection>
        )}

        {activeTool === 'pencil' && (
          <AccordionSection
            id="tool-pencil-defaults"
            category="tools"
            activeCategory={effectiveStageCategory}
            title="Pencil Tool Options"
            icon="✏️"
            badge="Smoothing"
            summary={`Smooth: ${pencilConfig?.smoothness ?? 50}%`}
            collapsed={!isSectionExpanded('tool-pencil-defaults')}
            onToggle={() => toggleSection('tool-pencil-defaults')}
            testId="tool-pencil-defaults-section"
          >
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Smoothness:</span>
              <NumberField
                value={pencilConfig?.smoothness ?? 50}
                onChange={(val) => editorActions.setPencilConfig({ smoothness: val })}
                onCommit={(val) => editorActions.setPencilConfig({ smoothness: val })}
                unit="%"
                min={0}
                max={100}
                step={1}
                inputWidth={50}
                ariaLabel="Pencil curve smoothness"
                data-testid="pencil-smoothness-input"
              />
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                type="button"
                className={styles.morphBtn}
                style={{ flex: 1, fontSize: 10, padding: '3px 4px' }}
                onClick={() => editorActions.setPencilConfig({ smoothness: 10 })}
                data-testid="pencil-smoothness-10"
              >
                Accurate (10%)
              </button>
              <button
                type="button"
                className={styles.morphBtn}
                style={{ flex: 1, fontSize: 10, padding: '3px 4px' }}
                onClick={() => editorActions.setPencilConfig({ smoothness: 50 })}
                data-testid="pencil-smoothness-50"
              >
                Balanced (50%)
              </button>
              <button
                type="button"
                className={styles.morphBtn}
                style={{ flex: 1, fontSize: 10, padding: '3px 4px' }}
                onClick={() => editorActions.setPencilConfig({ smoothness: 85 })}
                data-testid="pencil-smoothness-85"
              >
                Smooth (85%)
              </button>
            </div>
          </AccordionSection>
        )}

        {/* Layer / Folder Header & Group Motion Section */}
        {selectedLayer && (
          <AccordionSection
            id="layer-properties"
            category="layer"
            activeCategory={effectiveStageCategory}
            title={selectedLayer.kind === 'folder' ? `Folder: ${selectedLayer.name}` : `Layer: ${selectedLayer.name}`}
            icon={selectedLayer.kind === 'folder' ? '📁' : '📄'}
            badge={selectedLayer.kind === 'folder' ? 'Group Transform' : undefined}
            collapsed={!isSectionExpanded('layer-properties')}
            onToggle={() => toggleSection('layer-properties')}
          >

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
          </AccordionSection>
        )}

        {/* Document Dimensions */}
        <AccordionSection
          id="stage-dimensions"
          category="stage"
          activeCategory={effectiveStageCategory}
          title="Document Dimensions"
          icon="🎬"
          summary={`${width}×${height}px`}
          collapsed={!isSectionExpanded('stage-dimensions')}
          onToggle={() => toggleSection('stage-dimensions')}
        >
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
        </AccordionSection>

        {/* Playback & Target FPS */}
        <AccordionSection
          id="stage-fps"
          category="stage"
          activeCategory={effectiveStageCategory}
          title="Playback Framerate"
          icon="⏱️"
          summary={`${fps} FPS`}
          collapsed={!isSectionExpanded('stage-fps')}
          onToggle={() => toggleSection('stage-fps')}
        >
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
        </AccordionSection>

        {/* Background Color & Alpha */}
        <AccordionSection
          id="stage-background"
          category="stage"
          activeCategory={effectiveStageCategory}
          title="Stage Background"
          icon="🎨"
          summary={isTransparent ? 'Transparent' : solidColor}
          collapsed={!isSectionExpanded('stage-background')}
          onToggle={() => toggleSection('stage-background')}
        >
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
                background: isTransparent ? undefined : bg ? fillToCSS(bg) : '#ffffff',
                backgroundImage: isTransparent
                  ? 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%), linear-gradient(to top left, transparent calc(50% - 1px), #ef4444 calc(50% - 1px), #ef4444 calc(50% + 1px), transparent calc(50% + 1px))'
                  : undefined,
                backgroundSize: isTransparent ? '6px 6px, 6px 6px, 6px 6px, 6px 6px, 100% 100%' : undefined,
                backgroundPosition: isTransparent ? '0 0, 0 3px, 3px -3px, -3px 0px, 0 0' : undefined,
                backgroundColor: isTransparent ? '#ffffff' : undefined,
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
        </AccordionSection>

        {/* Responsive Breakpoints Section */}
        <AccordionSection
          id="stage-breakpoints"
          category="layout"
          activeCategory={effectiveStageCategory}
          title="Responsive Breakpoints"
          icon="📱"
          badge={doc.stage.breakpoints?.length ? `${doc.stage.breakpoints.length} active` : undefined}
          summary={doc.stage.breakpoints?.length ? `${doc.stage.breakpoints.length} defined` : 'None'}
          collapsed={!isSectionExpanded('stage-breakpoints')}
          onToggle={() => toggleSection('stage-breakpoints')}
        >

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
        </AccordionSection>

        {/* Accessibility: Reduced Motion */}
        <AccordionSection
          id="stage-reduced-motion"
          category="accessibility"
          activeCategory={effectiveStageCategory}
          title="Accessibility (Reduced Motion)"
          icon="♿"
          summary={doc.stage.reducedMotion?.mode ? `Mode: ${doc.stage.reducedMotion.mode}` : 'Auto'}
          collapsed={!isSectionExpanded('stage-reduced-motion')}
          onToggle={() => toggleSection('stage-reduced-motion')}
        >
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
        </AccordionSection>

        {/* Internationalization (i18n) Stage Dictionary */}
        <AccordionSection
          id="stage-i18n"
          category="i18n"
          activeCategory={effectiveStageCategory}
          title="i18n Localization"
          icon="🌐"
          summary={`Active: ${previewLocale || doc.i18n?.defaultLocale || 'en'}`}
          collapsed={!isSectionExpanded('stage-i18n')}
          onToggle={() => toggleSection('stage-i18n')}
        >

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
        </AccordionSection>
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
    (Boolean((shapeEl as any)?.starConfig) ||
      Boolean(shapeEl?.id.startsWith('poly_')) ||
      (shapeEl as any)?.shapeType === 'star');
  const isRectangle =
    isShape &&
    !isStarOrPolygon &&
    (Boolean(shapeEl?.rectConfig) ||
      Boolean(shapeEl?.id.startsWith('rect_')) ||
      (shapeEl as any)?.shapeType === 'rectangle');
  const isOval =
    isShape &&
    !isStarOrPolygon &&
    !isRectangle &&
    (Boolean(shapeEl?.ovalConfig) ||
      Boolean(shapeEl?.id.startsWith('oval_')) ||
      (shapeEl as any)?.shapeType === 'circle');
  const isCustomizedPath = Boolean((shapeEl as any)?.isCustomizedPath);
  const starConfig = (shapeEl as any)?.starConfig || { points: 5, pointRatio: 0.5, cornerRadius: 0 };
  const starPts = starConfig.points ?? 5;
  const starRatio = starConfig.pointRatio ?? 0.5;
  const starCornerRadius =
    shapeEl?.pathCornerRadius !== undefined && shapeEl.pathCornerRadius > 0
      ? shapeEl.pathCornerRadius
      : (starConfig.cornerRadius ?? 0);
  const currentPath = shapeEl?.paths[0];
  const shapeFill: Fill =
    currentPath?.fill ?? { type: 'solid', color: '#3b82f6' };
  const shapeStrokeFill: Fill =
    currentPath?.stroke?.fill ?? { type: 'solid', color: '#000000' };
  const currentStrokeWidth = currentPath?.stroke?.width ?? 0;

  const handleUpdateShapeFill = (fillOrColor: Fill | string) => {
    if (!shapeEl || !currentPath) return;
    const newFill: Fill =
      typeof fillOrColor === 'string'
        ? fillOrColor === 'transparent' || fillOrColor === 'none'
          ? { type: 'none' }
          : { type: 'solid' as const, color: fillOrColor }
        : fillOrColor;
    editorActions.setActiveFill(newFill);
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

  const handleUpdateShapeStroke = (fillOrColor: Fill | string) => {
    if (!shapeEl || !currentPath) return;
    const newStrokeFill: Fill =
      typeof fillOrColor === 'string'
        ? fillOrColor === 'transparent' || fillOrColor === 'none'
          ? { type: 'none' }
          : { type: 'solid' as const, color: fillOrColor }
        : fillOrColor;
    editorActions.setActiveStroke(newStrokeFill);
    const newPaths = shapeEl.paths.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          stroke: {
            fill: newStrokeFill,
            width: p.stroke?.width !== undefined ? p.stroke.width : 1,
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

  const owningLayer = activeTl.layers.find((l) =>
    l.keyframes.some((k) => k.elements.some((e) => e.id === selectedEl.id))
  );
  const currentKf = owningLayer
    ? findKeyframeAtTime(owningLayer, currentTime, fps) ?? findKeyframeAt(owningLayer, currentFrame)
    : null;
  const hasTween = currentKf?.tween?.type === 'motion';

  const targetChipText = (() => {
    if (selectedEl.type === 'shape') {
      const shapeKind = isRectangle
        ? 'Rectangle'
        : isStarOrPolygon
        ? 'Star/Polygon'
        : isOval
        ? 'Oval'
        : 'Shape';
      return `❖ ${shapeKind}: ${selectedEl.id}`;
    }
    if (selectedEl.type === 'text') {
      const textSnippet = (selectedEl as TextElement).text || '';
      const truncated = textSnippet.length > 12 ? textSnippet.slice(0, 12) + '…' : textSnippet;
      return `T Text: "${truncated || selectedEl.id}"`;
    }
    if (selectedEl.type === 'bitmap') {
      return `🖼 Image: ${selectedEl.id}`;
    }
    if (selectedEl.type === 'video') {
      return `🎥 Video: ${selectedEl.id}`;
    }
    if (selectedEl.type === 'instance') {
      const inst = selectedEl as SymbolInstance;
      const sym = doc.library.symbols[inst.symbolId];
      return `❖ Instance: ${sym?.name || selectedEl.id}`;
    }
    return `❖ Element: ${(selectedEl as any).id}`;
  })();

  const elementCategories = [
    { id: 'all', name: 'All Categories', icon: '📑' },
    { id: 'identity', name: 'Identity', icon: '🪪' },
    ...(isText ? [{ id: 'text', name: 'Typography', icon: 'T' }] : []),
    ...(selectedEl.type === 'bitmap' || selectedEl.type === 'video'
      ? [{ id: 'media', name: 'Media', icon: '🖼️' }]
      : []),
    { id: 'layout', name: 'Align & Layout', icon: '📐' },
    { id: 'transform', name: 'Transform', icon: '⤢' },
    ...(owningLayer ? [{ id: 'animation', name: 'Animation', icon: '⚡' }] : []),
    ...(isShape || selectedElementIds.length >= 2
      ? [
          { id: 'style', name: 'Fill & Stroke', icon: '🎨' },
          { id: 'shape', name: 'Shape Controls', icon: '▢' },
        ]
      : []),
  ];

  const allElementSectionIds = [
    'element-identity',
    'interactions-statemachine',
    ...(isText && textEl ? ['text-typography', 'text-state', 'text-i18n'] : []),
    ...(selectedEl.type === 'bitmap' ? ['bitmap-media'] : []),
    ...(selectedEl.type === 'video' ? ['video-media'] : []),
    'layout-alignment',
    'element-transform',
    ...(owningLayer ? ['tween-motion'] : []),
    ...(isShape && shapeEl ? ['fill-stroke'] : []),
    ...(isRectangle && shapeEl ? ['rectangle-corners'] : []),
    ...(isOval && shapeEl ? ['oval-parametric'] : []),
    ...(isStarOrPolygon && shapeEl ? ['star-polygon'] : []),
    ...(isShape && shapeEl && !(isRectangle && !isCustomizedPath) ? ['vector-corners'] : []),
    ...(selectedElementIds.length >= 2 || isShape ? ['pathfinder'] : []),
  ];

  const elementCategoryCounts: Record<string, number> = {
    identity: 2,
    text: isText && textEl ? 3 : 0,
    media: selectedEl.type === 'bitmap' || selectedEl.type === 'video' ? 1 : 0,
    layout: 1,
    transform: 1,
    animation: owningLayer ? 1 : 0,
    style: isShape && shapeEl ? 1 : 0,
    shape:
      (isRectangle && shapeEl ? 1 : 0) +
      (isOval && shapeEl ? 1 : 0) +
      (isStarOrPolygon && shapeEl ? 1 : 0) +
      (isShape && shapeEl && !(isRectangle && !isCustomizedPath) ? 1 : 0) +
      (selectedElementIds.length >= 2 || isShape ? 1 : 0),
  };

  const effectiveElementCategory = elementCategories.some((c) => c.id === activeCategory)
    ? activeCategory
    : 'all';

  const areAllElementCollapsed =
    allElementSectionIds.length > 0 &&
    allElementSectionIds.every((id) => expandedSections[id] === false);

  const handleToggleAllElement = () => {
    if (areAllElementCollapsed) {
      setExpandedSections({});
    } else {
      const nextMap: Record<string, boolean> = {};
      allElementSectionIds.forEach((id) => {
        nextMap[id] = false;
      });
      setExpandedSections(nextMap);
    }
  };

  return (
    <div className={`${styles.propertiesRoot} ${styles.propertiesContainer}`}>
      <div className={styles.propertiesHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.targetChip} title={targetChipText}>
            <span>{targetChipText}</span>
          </div>
          <select
            data-testid="properties-category-dropdown"
            className={styles.categoryDropdown}
            value={effectiveElementCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            aria-label="Filter Properties Category"
          >
            {elementCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.viewModeGroup}>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewMode === 'tabs' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('tabs')}
              title="Vertical Tabs View"
            >
              📑 Tabs
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewMode === 'accordion' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('accordion')}
              title="Accordion Stack View"
            >
              ▾ Accordion
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewMode === 'dropdown' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('dropdown')}
              title="Form Only View"
            >
              ▾ Form Only
            </button>
          </div>
          <button
            type="button"
            className={styles.toggleAllBtn}
            onClick={handleToggleAllElement}
            title={areAllElementCollapsed ? 'Expand all sections' : 'Collapse all sections'}
          >
            {areAllElementCollapsed ? '▸ Expand All' : '▾ Collapse All'}
          </button>
        </div>
      </div>

      <div className={styles.propertiesBody}>
        {viewMode === 'tabs' && (
          <div className={styles.verticalTabsRail}>
            {elementCategories.map((c) => {
              const isActive = effectiveElementCategory === c.id;
              const count = c.id === 'all' ? allElementSectionIds.length : (elementCategoryCounts[c.id] ?? 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.verticalTabBtn} ${isActive ? styles.activeTab : ''}`}
                  onClick={() => setActiveCategory(c.id)}
                  title={c.name}
                >
                  <div className={styles.verticalTabLabelArea}>
                    <span>{c.icon}</span>
                    <span>{c.name}</span>
                  </div>
                  <span className={styles.tabCountBadge}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.propertiesContentArea}>
      {/* Element Identity */}
      <AccordionSection
        id="element-identity"
        category="identity"
        activeCategory={effectiveElementCategory}
        title="Element Identity"
        icon="🪪"
        badge={selectedEl.type === 'instance' ? 'Component Instance' : selectedEl.type}
        summary={`ID: ${selectedEl.id}`}
        collapsed={!isSectionExpanded('element-identity')}
        onToggle={() => toggleSection('element-identity')}
      >

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
                onClick={() => editorActions.setActiveInspectorTab('statemachine')}
                title="Open State Machine targeting this component instance"
              >
                ⚡ State Machine & Interactions
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
      </AccordionSection>

      {/* Interactions & State Machine Section for Selected Elements */}
      {(() => {
        const activeSm =
          doc.stateMachines?.find((s) => s.id === doc.activeStateMachineId) ||
          doc.stateMachines?.[0];
        const elementListeners = (doc.stateMachines || []).flatMap((sm) =>
          (sm.listeners || [])
            .filter((l) => l.targetElementId === selectedEl.id)
            .map((l) => ({ ...l, smId: sm.id }))
        );

        const handleAddClickInteraction = () => {
          let sm = activeSm;
          if (!sm) {
            sm = editorActions.addStateMachine();
          }
          editorActions.addStateListener(sm.id, {
            eventType: 'click',
            targetElementId: selectedEl.id,
            actions: [],
          });
          editorActions.setActiveInspectorTab('statemachine');
        };

        const handleAddHoverInteraction = () => {
          let sm = activeSm;
          if (!sm) {
            sm = editorActions.addStateMachine();
          }
          editorActions.addStateListener(sm.id, {
            eventType: 'pointerenter',
            targetElementId: selectedEl.id,
            actions: [],
          });
          editorActions.setActiveInspectorTab('statemachine');
        };

        return (
          <AccordionSection
            id="interactions-statemachine"
            category="identity"
            activeCategory={effectiveElementCategory}
            title="Interactions & State Machine"
            icon="⚡"
            badge={elementListeners.length > 0 ? `${elementListeners.length} Listeners` : undefined}
            summary={
              elementListeners.length > 0
                ? `${elementListeners.length} listener${elementListeners.length === 1 ? '' : 's'}`
                : 'None'
            }
            collapsed={!isSectionExpanded('interactions-statemachine')}
            onToggle={() => toggleSection('interactions-statemachine')}
            testId="interactions-statemachine-section"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={styles.addFontSmallBtn}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleAddClickInteraction}
                  title="Add Click interaction targeting this element and switch to State Machine tab"
                >
                  + Add Click Interaction
                </button>
                <button
                  type="button"
                  className={styles.addFontSmallBtn}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleAddHoverInteraction}
                  title="Add Hover interaction targeting this element and switch to State Machine tab"
                >
                  + Add Hover Interaction
                </button>
              </div>

              {elementListeners.length === 0 ? (
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--mx-text-muted, #888)',
                    textAlign: 'center',
                    padding: '4px 0',
                  }}
                >
                  No interactions configured for this element.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {elementListeners.map((lis) => (
                    <div
                      key={lis.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        backgroundColor: 'var(--mx-bg-subtle, #1e1e24)',
                        border: '1px solid var(--mx-border-subtle, #333338)',
                        borderRadius: '4px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--mx-accent, #3b82f6)' }}>
                          ⚡ {lis.eventType}
                        </span>
                        <span style={{ color: 'var(--mx-text-muted, #888)' }}>
                          ({lis.actions?.length || 0} action{lis.actions?.length === 1 ? '' : 's'})
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className={styles.addFontSmallBtn}
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => editorActions.setActiveInspectorTab('statemachine')}
                          title="Edit in State Machine"
                        >
                          Edit ↗
                        </button>
                        <button
                          type="button"
                          className={styles.addFontSmallBtn}
                          style={{ padding: '2px 6px', fontSize: '10px', color: '#f87171' }}
                          onClick={() => editorActions.deleteStateListener(lis.smId, lis.id)}
                          title="Delete Listener"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccordionSection>
        );
      })()}

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

        const textTypeBadge = (textEl.textType || (textEl.pathConfig?.pathData ? 'path' : textEl.multiline ? 'area' : 'point')).toUpperCase();
        return (
          <AccordionSection
            id="text-typography"
            category="text"
            activeCategory={effectiveElementCategory}
            title="Typography & Text Type"
            icon="T"
            badge={textTypeBadge}
            summary={`${activeFont?.family || 'System Font'} ${textEl.fontSize || 16}px`}
            collapsed={!isSectionExpanded('text-typography')}
            onToggle={() => toggleSection('text-typography')}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, gap: 6 }}>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                onClick={() => editorActions.convertSelectedTextToOutlines()}
                title="Convert to Outlines"
                data-testid="convert-to-outlines-btn"
              >
                Convert to Outlines
              </button>
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

            {/* Text Type Selection, Dimensions, and Type on Path */}
            {(() => {
              const currentTextType: 'point' | 'area' | 'path' =
                textEl.textType || (textEl.pathConfig?.pathData ? 'path' : textEl.multiline ? 'area' : 'point');

              // Find available shapes on current keyframe for quick attachment
              const availableShapes: Array<{ id: string; name: string; pathData: string }> = [];
              for (const layer of activeTl.layers) {
                const kf = findKeyframeAtTime(layer, currentTime, fps) ?? findKeyframeAt(layer, currentFrame);
                if (!kf) continue;
                for (const el of kf.elements) {
                  if (el.type === 'shape') {
                    const sh = el as ShapeElement;
                    const d = sh.paths?.[0]?.d;
                    if (d) {
                      availableShapes.push({ id: sh.id, name: layer.name || sh.id, pathData: d });
                    }
                  }
                }
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>Text Type:</span>
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      <button
                        type="button"
                        className={`${styles.alignBtn} ${currentTextType === 'point' ? styles.active : ''}`}
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                        onClick={() => editorActions.convertTextType(textEl.id, 'point')}
                        title="Point Text: Single line / no bounding box. Expands automatically."
                        data-testid="text-type-point-btn"
                      >
                        <span data-testid="text-type-point" style={{ display: 'none' }} />
                        T Point
                      </button>
                      <button
                        type="button"
                        className={`${styles.alignBtn} ${currentTextType === 'area' ? styles.active : ''}`}
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                        onClick={() => editorActions.convertTextType(textEl.id, 'area')}
                        title="Area Text: Bounded text box with soft wrapping."
                        data-testid="text-type-area-btn"
                      >
                        <span data-testid="text-type-area" style={{ display: 'none' }} />
                        ▱ Area
                      </button>
                      <button
                        type="button"
                        className={`${styles.alignBtn} ${currentTextType === 'path' ? styles.active : ''}`}
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                        onClick={() => editorActions.convertTextType(textEl.id, 'path')}
                        title="Type on Path: Aligns and renders text along an SVG vector curve."
                        data-testid="text-type-path-btn"
                      >
                        <span data-testid="text-type-path" style={{ display: 'none' }} />
                        〰 On Path
                      </button>
                    </div>
                  </div>

                  {currentTextType === 'point' && (
                    <div
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--mx-bg-subtle, rgba(255,255,255,0.04))',
                        fontSize: 11,
                        color: 'var(--mx-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Point Text (no bounding box constraint)</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--mx-accent, #3b82f6)',
                          cursor: 'pointer',
                          fontSize: 11,
                          padding: 0,
                        }}
                        onClick={() => editorActions.convertTextType(textEl.id, 'area')}
                      >
                        Convert to Box →
                      </button>
                    </div>
                  )}

                  {currentTextType === 'area' && (
                    <>
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
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--mx-accent, #3b82f6)',
                              cursor: 'pointer',
                              fontSize: 11,
                              marginLeft: 'auto',
                            }}
                            onClick={() => editorActions.convertTextType(textEl.id, 'point')}
                            title="Convert bounded text box back to unconstrained point text"
                          >
                            To Point
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {currentTextType === 'path' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Map to Shape:</span>
                        <select
                          className={styles.selectInput}
                          style={{ flex: 1, fontSize: 11 }}
                          value={textEl.pathConfig?.pathId || ''}
                          data-testid="text-path-select"
                          disabled={availableShapes.length === 0}
                          onChange={(e) => {
                            const selectedShape = availableShapes.find((s) => s.id === e.target.value);
                            if (selectedShape) {
                              editorActions.attachTextToPath(
                                textEl.id,
                                selectedShape.pathData,
                                selectedShape.id,
                                textEl.pathConfig?.startOffset ?? 0
                              );
                            }
                          }}
                        >
                          <option value="">{availableShapes.length > 0 ? '-- Choose Shape from Board --' : '-- No vector shapes on board --'}</option>
                          {availableShapes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Presets:</span>
                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                          <button
                            type="button"
                            className={styles.alignBtn}
                            style={{ flex: 1, fontSize: 10, padding: '2px 4px' }}
                            onClick={() =>
                              editorActions.attachTextToPath(
                                textEl.id,
                                'M 0 40 Q 100 0 200 40 T 400 40',
                                undefined,
                                textEl.pathConfig?.startOffset ?? 0
                              )
                            }
                            title="Wave Path"
                          >
                            Wave
                          </button>
                          <button
                            type="button"
                            className={styles.alignBtn}
                            style={{ flex: 1, fontSize: 10, padding: '2px 4px' }}
                            onClick={() =>
                              editorActions.attachTextToPath(
                                textEl.id,
                                'M 0 100 A 100 100 0 0 1 200 100',
                                undefined,
                                textEl.pathConfig?.startOffset ?? 0
                              )
                            }
                            title="Arc Curve"
                          >
                            Arc
                          </button>
                          <button
                            type="button"
                            className={styles.alignBtn}
                            style={{ flex: 1, fontSize: 10, padding: '2px 4px' }}
                            onClick={() =>
                              editorActions.attachTextToPath(
                                textEl.id,
                                'M 100 0 A 100 100 0 1 0 100 200 A 100 100 0 1 0 100 0',
                                undefined,
                                textEl.pathConfig?.startOffset ?? 0
                              )
                            }
                            title="Circle Path"
                          >
                            Circle
                          </button>
                        </div>
                      </div>

                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Path Data:</span>
                        <input
                          type="text"
                          className={styles.textInput}
                          placeholder="M 0 30 Q 100 0 200 30"
                          value={textEl.pathConfig?.pathData || ''}
                          onChange={(e) => {
                            const pData = e.target.value.trim();
                            if (pData) {
                              editorActions.attachTextToPath(
                                textEl.id,
                                pData,
                                textEl.pathConfig?.pathId,
                                textEl.pathConfig?.startOffset ?? 0
                              );
                            } else {
                              editorActions.detachTextFromPath(textEl.id);
                            }
                          }}
                          title="SVG Path 'd' attribute string"
                        />
                      </div>

                      <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>Start Offset:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            className={styles.rangeSlider}
                            style={{ flex: 1 }}
                            value={textEl.pathConfig?.startOffset ?? 0}
                            data-testid="text-start-offset-slider"
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
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className={styles.textInput}
                            style={{ width: '45px' }}
                            value={textEl.pathConfig?.startOffset ?? 0}
                            data-testid="text-start-offset-input"
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
                          <span style={{ fontSize: 11, minWidth: 16, fontFamily: 'var(--mx-font-mono)' }}>
                            %
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--mx-accent, #3b82f6)',
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                          onClick={() => editorActions.detachTextFromPath(textEl.id)}
                          title="Detach text from path and revert to standard text"
                        >
                          Detach from Path
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Text Fill & Stroke (Shape parity) */}
            {(() => {
              const textFill: Fill =
                textEl.fill ??
                (textEl.color ? { type: 'solid', color: textEl.color } : { type: 'solid', color: '#000000' });
              const textFillCSS = fillToCSS(textFill);

              const textStrokeFill: Fill =
                textEl.stroke?.fill ?? { type: 'solid', color: '#000000' };
              const textStrokeCSS = fillToCSS(textStrokeFill);
              const currentStroke =
                textStrokeFill.type === 'solid'
                  ? textStrokeFill.color
                  : '#000000';
              const currentStrokeWidth = textEl.stroke?.width ?? 0;

              return (
                <>
                  <div className={styles.fieldRow} style={{ position: 'relative' }}>
                    <span className={styles.fieldLabel}>Fill:</span>
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
                        onClick={() => {
                          setTextGradientOpen(!textGradientOpen);
                          setTextStrokeGradientOpen(false);
                        }}
                        title="Click to edit text color / gradient"
                        data-testid="text-fill-swatch"
                      />
                      <button
                        type="button"
                        className={styles.addFontSmallBtn}
                        onClick={() => {
                          setTextGradientOpen(!textGradientOpen);
                          setTextStrokeGradientOpen(false);
                        }}
                      >
                        {textFill.type === 'none'
                          ? 'None (Transparent)'
                          : textFill.type === 'linearGradient'
                          ? 'Linear Gradient'
                          : textFill.type === 'radialGradient'
                          ? 'Radial Gradient'
                          : textEl.color || (textFill.type === 'solid' ? textFill.color : '#000000')} ▾
                      </button>
                    </div>
                    {textGradientOpen && (
                      <GradientPicker
                        fill={textFill}
                        onChange={(newFill) => {
                          const primaryColor =
                            newFill.type === 'none'
                              ? 'transparent'
                              : newFill.type === 'solid'
                              ? newFill.color
                              : newFill.type === 'linearGradient' || newFill.type === 'radialGradient'
                              ? newFill.stops[0]?.color || '#000000'
                              : '#000000';
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

                  <div className={styles.fieldRow} style={{ position: 'relative' }}>
                    <span className={styles.fieldLabel}>Stroke:</span>
                    <div ref={textStrokeRef} className={styles.colorInputWrapper} style={{ gap: 6 }}>
                      <div
                        style={{
                          width: 24,
                          height: 20,
                          borderRadius: 3,
                          border: '1px solid var(--mx-border, #333842)',
                          background: textStrokeCSS,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setTextStrokeGradientOpen(!textStrokeGradientOpen);
                          setTextGradientOpen(false);
                        }}
                        title="Click to edit text border / stroke & gradient"
                        data-testid="text-stroke-swatch"
                      />
                      <button
                        type="button"
                        className={styles.addFontSmallBtn}
                        onClick={() => {
                          setTextStrokeGradientOpen(!textStrokeGradientOpen);
                          setTextGradientOpen(false);
                        }}
                        data-testid="text-stroke-picker-btn"
                      >
                        {textStrokeFill.type === 'none'
                          ? 'None'
                          : textStrokeFill.type === 'linearGradient'
                          ? 'Linear'
                          : textStrokeFill.type === 'radialGradient'
                          ? 'Radial'
                          : currentStroke} ▾
                      </button>
                      <input
                        type="color"
                        style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
                        value={currentStroke.startsWith('#') && currentStroke.length === 7 ? currentStroke : '#000000'}
                        onChange={(e) => {
                          const col = e.target.value;
                          editorActions.updateElementProps(textEl.id, {
                            stroke: {
                              fill: { type: 'solid', color: col },
                              width: currentStrokeWidth > 0 ? currentStrokeWidth : 1,
                              cap: 'round',
                              join: 'round',
                            },
                          });
                        }}
                        title="Text Stroke Color"
                        data-testid="text-stroke-color-input"
                      />
                      <NumberField
                        value={currentStrokeWidth}
                        onChange={(val) => {
                          editorActions.updateElementProps(
                            textEl.id,
                            {
                              stroke: {
                                fill: textStrokeFill,
                                width: val,
                                cap: 'round',
                                join: 'round',
                              },
                            },
                            { skipHistory: true }
                          );
                        }}
                        onCommit={(val) => {
                          editorActions.updateElementProps(textEl.id, {
                            stroke: {
                              fill: textStrokeFill,
                              width: val,
                              cap: 'round',
                              join: 'round',
                            },
                          });
                        }}
                        unit="px"
                        min={0}
                        max={50}
                        step={0.5}
                        shiftStep={2}
                        altStep={0.1}
                        inputWidth={45}
                        ariaLabel="Text stroke width in px"
                      />
                    </div>
                    {textStrokeGradientOpen && (
                      <GradientPicker
                        fill={textStrokeFill}
                        onChange={(newStrokeFill) => {
                          editorActions.setActiveStroke(newStrokeFill);
                          editorActions.updateElementProps(textEl.id, {
                            stroke: {
                              fill: newStrokeFill,
                              width: currentStrokeWidth > 0 ? currentStrokeWidth : 1,
                              cap: 'round',
                              join: 'round',
                            },
                          });
                        }}
                        onClose={() => setTextStrokeGradientOpen(false)}
                        anchorRef={textStrokeRef}
                        title="Text Border / Stroke & Gradient"
                      />
                    )}
                  </div>
                </>
              );
            })()}
          </AccordionSection>
        );
      })()}

      {/* i18n Localization for Text Elements */}
      {isText && textEl && (
        <AccordionSection
          id="text-i18n"
          category="text"
          activeCategory={effectiveElementCategory}
          title="Text Localization (i18n)"
          icon="🌐"
          summary={textEl.i18nKey ? `Key: ${textEl.i18nKey}` : 'No key'}
          collapsed={!isSectionExpanded('text-i18n')}
          onToggle={() => toggleSection('text-i18n')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--mx-text-muted)' }}>String Key Binding</span>
            <button
              type="button"
              className={styles.presetPill}
              style={{ fontSize: 10, padding: '1px 6px', height: 'auto' }}
              onClick={() => editorActions.setLocalizationOpen(true)}
              title="Open floating Strings & Localization Table"
            >
              Open Strings Table ↗
            </button>
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Key:</span>
            <input
              type="text"
              list="existing-i18n-keys"
              className={styles.textInput}
              style={{ flex: 1, width: '100%' }}
              value={textEl.i18nKey || ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                editorActions.bindElementToI18nKey(textEl.id, val || null);
              }}
              placeholder="e.g. hero_headline"
              title="Translation key in document i18n dictionary"
              data-testid="text-i18n-key-input"
            />
            <datalist id="existing-i18n-keys">
              {Array.from(
                new Set(
                  Object.values(doc.i18n?.locales || {}).flatMap((map) => Object.keys(map || {}))
                )
              ).map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>

          {!textEl.i18nKey && (
            <div style={{ marginTop: 4 }}>
              <button
                type="button"
                className={styles.presetPill}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  const autoKey = `str_${textEl.id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 8)}`;
                  editorActions.bindElementToI18nKey(textEl.id, autoKey);
                }}
              >
                + Create & Bind String Key
              </button>
            </div>
          )}

          {textEl.i18nKey && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--mx-text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Translations:</span>
                <span style={{ fontWeight: 400, opacity: 0.8 }}>
                  Active: {(previewLocale || doc.i18n?.defaultLocale || 'en').toUpperCase()}
                </span>
              </div>
              {Array.from(
                new Set([
                  'en',
                  ...(doc.i18n ? Object.keys(doc.i18n.locales || {}) : []),
                ])
              ).map((loc) => {
                const defaultLoc = doc.i18n?.defaultLocale || 'en';
                const isCurrent = (previewLocale || defaultLoc).toLowerCase() === loc.toLowerCase();
                const currentVal =
                  doc.i18n?.locales?.[loc]?.[textEl.i18nKey!] ||
                  (loc === defaultLoc ? textEl.text : '');

                return (
                  <div
                    key={loc}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.08)' : undefined,
                      padding: isCurrent ? '2px 4px' : undefined,
                      borderRadius: 4,
                      border: isCurrent ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        fontSize: 10,
                        fontWeight: 700,
                        color: isCurrent ? 'var(--mx-accent, #3b82f6)' : 'var(--mx-text-muted)',
                        textAlign: 'right',
                      }}
                    >
                      {loc.toUpperCase()}:
                    </span>
                    <input
                      type="text"
                      className={styles.textInput}
                      style={{
                        flex: 1,
                        borderColor: isCurrent ? 'var(--mx-accent, #3b82f6)' : undefined,
                      }}
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
        </AccordionSection>
      )}

      {/* State & Dynamic Variable Binding for Text Elements */}
      {isText && textEl && (
        <AccordionSection
          id="text-state"
          category="text"
          activeCategory={effectiveElementCategory}
          title="Variable & State Binding"
          icon="⚡"
          summary={
            textEl.stateBinding
              ? `Bound: ${textEl.stateBinding}`
              : textEl.variable
              ? `Variable: ${textEl.variable}`
              : 'Unbound'
          }
          collapsed={!isSectionExpanded('text-state')}
          onToggle={() => toggleSection('text-state')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--mx-text-muted)' }}>Reactive State Variable</span>
            <button
              type="button"
              className={styles.presetPill}
              style={{ fontSize: 10, padding: '1px 6px', height: 'auto' }}
              onClick={() => editorActions.setStateVariablesOpen(true)}
              title="Open floating State & Variables Table"
            >
              Open State Window ↗
            </button>
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Binding:</span>
            <select
              className={styles.categoryDropdown}
              style={{ flex: 1, width: '100%' }}
              value={textEl.stateBinding || textEl.variable || ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                editorActions.setTextStateBinding(textEl.id, val || null);
              }}
              data-testid="text-state-binding-select"
            >
              <option value="">-- None (Static Text) --</option>
              {(doc.stateVariables || []).map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--mx-text-muted)', lineHeight: 1.4, marginTop: 4 }}>
            💡 You can also use inline template tokens inside your text like <code style={{ color: 'var(--mx-accent, #3b82f6)' }}>Score: {'{'}score{'}'}</code>. Both direct state bindings and inline tokens update automatically at runtime.
          </div>
        </AccordionSection>
      )}

      {/* Bitmap Element Properties */}
      {selectedEl.type === 'bitmap' && (() => {
        const bmp = selectedEl as BitmapElement;
        const imgSrc = bmp.src || doc.library?.bitmaps?.[bmp.bitmapId]?.src || '';
        const w = bmp.width || 200;
        const h = bmp.height || 150;

        return (
          <AccordionSection
            id="bitmap-media"
            category="media"
            activeCategory={effectiveElementCategory}
            title="Bitmap Image Asset"
            icon="🖼️"
            summary={`${w}×${h}px`}
            collapsed={!isSectionExpanded('bitmap-media')}
            onToggle={() => toggleSection('bitmap-media')}
          >
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
          </AccordionSection>
        );
      })()}

      {/* Video Element Properties */}
      {selectedEl.type === 'video' && (() => {
        const vid = selectedEl as VideoElement;
        const w = vid.width || 320;
        const h = vid.height || 180;

        return (
          <AccordionSection
            id="video-media"
            category="media"
            activeCategory={effectiveElementCategory}
            title="Video Media Element"
            icon="🎥"
            summary={`${w}×${h}px`}
            collapsed={!isSectionExpanded('video-media')}
            onToggle={() => toggleSection('video-media')}
          >
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
          </AccordionSection>
        );
      })()}

      {/* Transform: Position */}
      <AccordionSection
        id="layout-alignment"
        category="layout"
        activeCategory={effectiveElementCategory}
        title="Position & Alignment"
        icon="📐"
        summary={(selectedEl as any).layoutPin ? `Pin: ${(selectedEl as any).layoutPin}` : `X:${Math.round(x)} Y:${Math.round(y)}`}
        collapsed={!isSectionExpanded('layout-alignment')}
        onToggle={() => toggleSection('layout-alignment')}
      >

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
      </AccordionSection>

      {/* Transform: Scale & Rotation */}
      <AccordionSection
        id="element-transform"
        category="transform"
        activeCategory={effectiveElementCategory}
        title="Transform & Dimensions"
        icon="⤢"
        summary={`Rot:${Math.round(rotation)}° Scale:${Math.round((scaleX ?? 1) * 100)}%`}
        collapsed={!isSectionExpanded('element-transform')}
        onToggle={() => toggleSection('element-transform')}
      >
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
            max={3000}
            step={50}
            shiftStep={100}
            altStep={10}
            inputWidth={45}
            ariaLabel="3D Perspective focal distance in pixels"
            data-testid="transform-perspective-input"
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
          <span className={styles.fieldLabel} title="3D rotation angles around X and Y axes (Hold Cmd/Ctrl and drag corner handles on Stage)">3D Tilt:</span>
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
              ariaLabel="3D Tilt X angle in degrees"
              data-testid="transform-tilt-x-input"
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
              ariaLabel="3D Tilt Y angle in degrees"
              data-testid="transform-tilt-y-input"
            />
            {(rotateX !== 0 || rotateY !== 0) && (
              <button
                type="button"
                className={styles.addFontSmallBtn}
                onClick={() => handleUpdateTransform({ rotateX: 0, rotateY: 0 })}
                title="Reset 3D Tilt"
                style={{ marginLeft: 'auto' }}
                data-testid="transform-tilt-reset-btn"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* 3D Quick Tilt Presets */}
        <div className={styles.fieldRow} style={{ marginTop: -2, marginBottom: 2 }}>
          <span className={styles.fieldLabel} style={{ fontSize: 10, color: 'var(--mx-text-subtle)' }}>Tilt Preset:</span>
          <div className={styles.presetPills} style={{ gap: 4 }}>
            <button
              type="button"
              className={`${styles.presetPill} ${rotateX === 30 && rotateY === -30 ? styles.active : ''}`}
              onClick={() => handleUpdateTransform({ rotateX: 30, rotateY: -30 })}
              title="Isometric 3D view (X: 30°, Y: -30°)"
            >
              Isometric
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${rotateX === 45 && rotateY === 0 ? styles.active : ''}`}
              onClick={() => handleUpdateTransform({ rotateX: 45, rotateY: 0 })}
              title="Tilt forward 45° along X axis"
            >
              Tilt X 45°
            </button>
            <button
              type="button"
              className={`${styles.presetPill} ${rotateX === 0 && rotateY === 45 ? styles.active : ''}`}
              onClick={() => handleUpdateTransform({ rotateX: 0, rotateY: 45 })}
              title="Tilt sideways 45° along Y axis"
            >
              Tilt Y 45°
            </button>
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
      </AccordionSection>

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
          <AccordionSection
            id="tween-motion"
            category="animation"
            activeCategory={effectiveElementCategory}
            title="Motion Tween & Easing"
            icon="⚡"
            badge={hasTween ? 'Active' : undefined}
            summary={hasTween ? 'Tweening' : 'Static'}
            collapsed={!isSectionExpanded('tween-motion')}
            onToggle={() => toggleSection('tween-motion')}
          >
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
          </AccordionSection>
        );
      })()}

      {/* Color & Transparency */}
      <AccordionSection
        id="fill-stroke"
        category="style"
        activeCategory={effectiveElementCategory}
        title={isShape ? 'Fill, Stroke & Color' : 'Color & Opacity'}
        icon="🎨"
        summary={`Alpha: ${alphaPercent}%`}
        collapsed={!isSectionExpanded('fill-stroke')}
        onToggle={() => toggleSection('fill-stroke')}
      >
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
                  onClick={() => {
                    setShapeGradientOpen(!shapeGradientOpen);
                    setShapeStrokeGradientOpen(false);
                  }}
                  title="Click to edit shape fill / gradient"
                  data-testid="shape-fill-swatch"
                />
                <button
                  type="button"
                  className={styles.addFontSmallBtn}
                  onClick={() => {
                    setShapeGradientOpen(!shapeGradientOpen);
                    setShapeStrokeGradientOpen(false);
                  }}
                  data-testid="shape-fill-picker-btn"
                >
                  {shapeFill.type === 'none'
                    ? 'None (Transparent)'
                    : shapeFill.type === 'linearGradient'
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
            <div className={styles.fieldRow} style={{ position: 'relative' }}>
              <span className={styles.fieldLabel}>Stroke:</span>
              <div ref={shapeStrokeRef} className={styles.colorInputWrapper} style={{ gap: 6, flex: 1 }}>
                <div
                  style={{
                    width: 24,
                    height: 20,
                    borderRadius: 3,
                    border: '1px solid var(--mx-border, #333842)',
                    background: fillToCSS(shapeStrokeFill),
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setShapeStrokeGradientOpen(!shapeStrokeGradientOpen);
                    setShapeGradientOpen(false);
                  }}
                  title="Click to edit shape border / stroke & gradient"
                  data-testid="shape-stroke-swatch"
                />
                <button
                  type="button"
                  className={styles.addFontSmallBtn}
                  onClick={() => {
                    setShapeStrokeGradientOpen(!shapeStrokeGradientOpen);
                    setShapeGradientOpen(false);
                  }}
                  data-testid="shape-stroke-picker-btn"
                >
                  {shapeStrokeFill.type === 'none'
                    ? 'None'
                    : shapeStrokeFill.type === 'linearGradient'
                    ? 'Linear'
                    : shapeStrokeFill.type === 'radialGradient'
                    ? 'Radial'
                    : shapeStrokeFill.type === 'solid'
                    ? shapeStrokeFill.color
                    : 'None'} ▾
                </button>
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
                {currentStrokeWidth > 0 && (
                  <button
                    type="button"
                    className={styles.addFontSmallBtn}
                    onClick={() => editorActions.outlineSelectedStroke()}
                    title="Outline Stroke"
                    data-testid="outline-stroke-btn"
                  >
                    Outline Stroke
                  </button>
                )}
              </div>
              {shapeStrokeGradientOpen && (
                <GradientPicker
                  fill={shapeStrokeFill}
                  onChange={(newStrokeFill) => handleUpdateShapeStroke(newStrokeFill)}
                  onClose={() => setShapeStrokeGradientOpen(false)}
                  anchorRef={shapeStrokeRef}
                  title="Border / Stroke & Gradient"
                />
              )}
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
      </AccordionSection>

      {/* Rectangle & Live Corners Dedicated Inspector Section */}
      {isRectangle && shapeEl && (() => {
        const rectBounds = getElementBounds(shapeEl);
        const rw = Math.max(8, shapeEl.rectConfig?.width ?? rectBounds.width);
        const rh = Math.max(8, shapeEl.rectConfig?.height ?? rectBounds.height);
        const maxRadius = Math.max(1, Math.floor(Math.min(rw, rh) / 2));
        const rawRadii = shapeEl.rectConfig?.cornerRadius ?? 0;
        const cornerRadii = normalizeCornerRadii(rawRadii, maxRadius);
        const uniformRadius = getUniformCornerRadius(rawRadii);
        const rawTypes = shapeEl.rectConfig?.cornerType ?? 'round';
        const cornerTypes: RectCornerTypes = normalizeCornerTypes(rawTypes);
        const uniformCornerType: CornerType = getUniformCornerType(rawTypes);
        const isUniformType = isUniformCornerType(rawTypes);
        const isUniform = isUniformCornerRadius(rawRadii) && isUniformType && !unlinkRectCorners;

        return (
          <AccordionSection
            id="rectangle-corners"
            category="shape"
            activeCategory={effectiveElementCategory}
            title="Rectangle Live Corners"
            icon="▢"
            badge="Live Corners"
            summary={isUniform ? `Radius: ${Math.round(uniformRadius)}px` : 'Independent'}
            collapsed={!isSectionExpanded('rectangle-corners')}
            onToggle={() => toggleSection('rectangle-corners')}
            testId="rectangle-corners-section"
          >

            {isCustomizedPath ? (
              <div className={styles.customPathBanner} data-testid="rect-customized-banner">
                <div className={styles.customPathTitle}>
                  ✦ Custom Vector Path (Anchors edited manually)
                </div>
                <div className={styles.customPathDesc}>
                  Path has custom anchor points. Adjust corner radius below in Vector Path & Live Corners, or reset to a 4-corner rectangle.
                </div>
                <button
                  type="button"
                  className={styles.resetParametricBtn}
                  onClick={() => editorActions.resetRectShapeToParametric(shapeEl.id)}
                  data-testid="reset-parametric-rect-btn"
                >
                  ↺ Reset to Parametric Rectangle
                </button>
              </div>
            ) : (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Radius:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <NumberField
                      value={Math.round(uniformRadius * 10) / 10}
                      onChange={(val) =>
                        editorActions.updateRectShape(
                          shapeEl.id,
                          { cornerRadius: val },
                          { skipHistory: true }
                        )
                      }
                      onCommit={(val) =>
                        editorActions.updateRectShape(shapeEl.id, { cornerRadius: val })
                      }
                      unit="px"
                      min={0}
                      max={maxRadius}
                      step={1}
                      shiftStep={5}
                      altStep={0.5}
                      inputWidth={50}
                      ariaLabel="Corner radius in px"
                      data-testid="rect-corner-radius-numberfield"
                    />
                    <span data-testid="rect-corner-radius-input" style={{ display: 'none' }} />
                    <button
                      type="button"
                      className={`${styles.lockRatioBtn} ${!isUniform ? styles.active : ''}`}
                      onClick={() => {
                        if (isUniform) {
                          setUnlinkRectCorners(true);
                          editorActions.updateRectShape(shapeEl.id, {
                            cornerRadius: {
                              tl: uniformRadius,
                              tr: uniformRadius,
                              br: uniformRadius,
                              bl: uniformRadius,
                            },
                            cornerType: { ...cornerTypes },
                          });
                        } else {
                          setUnlinkRectCorners(false);
                          editorActions.updateRectShape(shapeEl.id, {
                            cornerRadius: cornerRadii.tl,
                            cornerType: cornerTypes.tl,
                          });
                        }
                      }}
                      title={
                        isUniform
                          ? 'Corners linked (Click to edit 4 corner radii & styles independently)'
                          : 'Corners independent (Click to link all 4 corners)'
                      }
                      data-testid="rect-unlink-corners-btn"
                    >
                      <span data-testid="rect-corners-unlink-btn" style={{ display: 'none' }} />
                      {isUniform ? <Link size={12} /> : <Unlink size={12} />}
                    </button>
                  </div>
                </div>

                {/* Smooth Live Corner Radius Slider */}
                <div
                  className={styles.fieldRow}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                      Live Scrub:
                    </span>
                    <span className={styles.starTypeBadge}>
                      {uniformRadius <= 0
                        ? 'Sharp'
                        : uniformRadius >= maxRadius - 0.5
                        ? 'Pill / Capsule'
                        : `${Math.round(uniformRadius)}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    className={styles.starPropsSlider}
                    min={0}
                    max={maxRadius}
                    step={0.5}
                    value={Math.min(maxRadius, uniformRadius)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      editorActions.updateRectShape(
                        shapeEl.id,
                        { cornerRadius: val },
                        { skipHistory: true }
                      );
                    }}
                    onMouseUp={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      editorActions.updateRectShape(shapeEl.id, { cornerRadius: val });
                    }}
                    aria-label="Corner radius slider"
                    data-testid="rect-corner-radius-slider"
                  />
                </div>

                {/* Independent 4-Corner Radii & Per-Corner Border Styles */}
                {!isUniform && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                      padding: '6px 8px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      borderRadius: 4,
                      border: '1px solid var(--mx-border, #333842)',
                      marginBottom: 4,
                    }}
                    data-testid="rect-independent-corners-grid"
                  >
                    {(
                      [
                        { key: 'tl', label: 'TL' },
                        { key: 'tr', label: 'TR' },
                        { key: 'bl', label: 'BL' },
                        { key: 'br', label: 'BR' },
                      ] as const
                    ).map(({ key, label }) => {
                      const cType = cornerTypes[key];
                      const nextStyleMap: Record<CornerType, CornerType> = {
                        round: 'inverted',
                        inverted: 'chamfer',
                        chamfer: 'round',
                      };
                      const styleGlyphMap: Record<CornerType, string> = {
                        round: '╭',
                        inverted: '╯',
                        chamfer: '╱',
                      };
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            background: 'rgba(30, 41, 59, 0.45)',
                            padding: '4px 5px',
                            borderRadius: 3,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <NumberField
                              label={label}
                              value={Math.round(cornerRadii[key] * 10) / 10}
                              onChange={(val) =>
                                editorActions.updateRectShape(
                                  shapeEl.id,
                                  {
                                    cornerRadius: {
                                      ...cornerRadii,
                                      [key]: val,
                                    },
                                  },
                                  { skipHistory: true }
                                )
                              }
                              onCommit={(val) =>
                                editorActions.updateRectShape(shapeEl.id, {
                                  cornerRadius: {
                                    ...cornerRadii,
                                    [key]: val,
                                  },
                                })
                              }
                              unit="px"
                              min={0}
                              max={maxRadius}
                              step={1}
                              inputWidth={34}
                              ariaLabel={`Corner radius ${key}`}
                              data-testid={`rect-corner-${key}`}
                            />
                            <span data-testid={`rect-corner-radius-${key}`} style={{ display: 'none' }} />
                            <button
                              type="button"
                              className={styles.presetPill}
                              style={{ padding: '1px 5px', fontSize: 10 }}
                              onClick={() =>
                                editorActions.updateRectShape(shapeEl.id, {
                                  cornerType: {
                                    ...cornerTypes,
                                    [key]: nextStyleMap[cType],
                                  },
                                })
                              }
                              title={`Corner ${label} style: ${cType} (Click to cycle Round → Inverted → Chamfer)`}
                              data-testid={`rect-corner-type-${key}`}
                            >
                              {styleGlyphMap[cType]} {cType}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {(
                              [
                                { id: 'round', glyph: '╭', title: 'Round' },
                                { id: 'inverted', glyph: '╯', title: 'Inverted' },
                                { id: 'chamfer', glyph: '╱', title: 'Chamfer' },
                              ] as const
                            ).map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                className={`${styles.morphBtn} ${
                                  cType === st.id ? styles.activePresetPill : ''
                                }`}
                                style={{ flex: 1, padding: '1px 2px', fontSize: 10 }}
                                onClick={() =>
                                  editorActions.updateRectShape(shapeEl.id, {
                                    cornerType: {
                                      ...cornerTypes,
                                      [key]: st.id,
                                    },
                                  })
                                }
                                title={`Set ${label} corner to ${st.title}`}
                                data-testid={`rect-corner-type-${key}-${st.id}`}
                              >
                                {st.glyph}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Corner Style (Round / Inverted / Chamfer) */}
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Style:</span>
                  <div className={styles.morphBtnGroup}>
                    {(
                      [
                        { id: 'round', label: '╭ Round' },
                        { id: 'inverted', label: '╯ Inverted' },
                        { id: 'chamfer', label: '╱ Chamfer' },
                      ] as const
                    ).map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        className={`${styles.morphBtn} ${
                          isUniformType && uniformCornerType === ct.id ? styles.activePresetPill : ''
                        }`}
                        onClick={() =>
                          editorActions.updateRectShape(shapeEl.id, { cornerType: ct.id })
                        }
                        data-testid={`corner-type-${ct.id}`}
                        title={`Set all corners to ${ct.label}`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Corner Presets */}
                <div
                  className={styles.fieldRow}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}
                >
                  <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                    Presets:
                  </span>
                  <div className={styles.presetPillsGrid} data-testid="rect-preset-pills">
                    {[
                      { id: 'sharp', name: 'Sharp (0)', r: 0 },
                      { id: 'subtle', name: 'Subtle (4)', r: Math.min(4, maxRadius) },
                      { id: 'smooth', name: 'Smooth (12)', r: Math.min(12, maxRadius) },
                      { id: 'card', name: 'Card (24)', r: Math.min(24, maxRadius) },
                      { id: 'pill', name: 'Pill (Max)', r: maxRadius },
                    ].map((p) => {
                      const active = isUniform && Math.abs(uniformRadius - p.r) < 0.5;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.presetPill} ${
                            active ? styles.activePresetPill : ''
                          }`}
                          onClick={() => {
                            setUnlinkRectCorners(false);
                            editorActions.updateRectShape(shapeEl.id, { cornerRadius: p.r });
                          }}
                          data-testid={`rect-preset-${p.id}`}
                        >
                          {p.id === 'pill' && <span data-testid="rect-corner-preset-pill" style={{ display: 'none' }} />}
                          {p.name}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`${styles.presetPill} ${
                        !isUniformType &&
                        cornerTypes.tl === 'round' &&
                        cornerTypes.br === 'round' &&
                        cornerTypes.tr === 'inverted' &&
                        cornerTypes.bl === 'inverted'
                          ? styles.activePresetPill
                          : ''
                      }`}
                      onClick={() => {
                        setUnlinkRectCorners(true);
                        const r = uniformRadius > 0 ? uniformRadius : Math.min(20, maxRadius);
                        editorActions.updateRectShape(shapeEl.id, {
                          cornerRadius: r,
                          cornerType: {
                            tl: 'round',
                            br: 'round',
                            tr: 'inverted',
                            bl: 'inverted',
                          },
                        });
                      }}
                      title="Opposite corners Round (TL/BR) and Inverted (TR/BL)"
                      data-testid="rect-preset-opposite-round-inverted"
                    >
                      <span data-testid="rect-corner-preset-inverted" style={{ display: 'none' }} />
                      Opposite ╭/╯
                    </button>
                  </div>
                </div>

                {/* Add Point to Path Action */}
                <div className={styles.fieldRow} style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    className={styles.resetParametricBtn}
                    style={{ width: '100%' }}
                    onClick={() => {
                      editorActions.insertPathAnchor(shapeEl.id, 0, 0, 0.5);
                      editorActions.setActiveTool('subselect');
                    }}
                    title="Insert a new anchor point along the rectangle edge and switch to Subselect (A) to adjust points"
                    data-testid="add-path-point-btn"
                  >
                    + Add Anchor Point to Path
                  </button>
                </div>
              </>
            )}
          </AccordionSection>
        );
      })()}

      {/* Oval / Pie / Donut Dedicated Inspector Section */}
      {isOval && shapeEl && (() => {
        const ovalCfg = shapeEl.ovalConfig || {
          rx: 50,
          ry: 50,
          innerRadiusRatio: 0,
          startAngle: 0,
          endAngle: 360,
        };
        const innerPct = Math.round((ovalCfg.innerRadiusRatio ?? 0) * 100);
        const startAng = Math.round(ovalCfg.startAngle ?? 0);
        const endAng = Math.round(ovalCfg.endAngle ?? 360);

        return (
          <AccordionSection
            id="oval-parametric"
            category="shape"
            activeCategory={effectiveElementCategory}
            title="Oval & Donut Parametric"
            icon="◯"
            badge="Pie & Donut"
            summary={`Hole: ${innerPct}%`}
            collapsed={!isSectionExpanded('oval-parametric')}
            onToggle={() => toggleSection('oval-parametric')}
            testId="oval-parametric-section"
          >

            {isCustomizedPath ? (
              <div className={styles.customPathBanner} data-testid="oval-customized-banner">
                <div className={styles.customPathTitle}>
                  ✦ Custom Vector Path (Anchors edited manually)
                </div>
                <button
                  type="button"
                  className={styles.resetParametricBtn}
                  onClick={() => editorActions.resetOvalShapeToParametric(shapeEl.id)}
                  data-testid="reset-parametric-oval-btn"
                >
                  ↺ Reset to Parametric Oval
                </button>
              </div>
            ) : (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Donut Hole:</span>
                  <NumberField
                    value={innerPct}
                    onChange={(val) =>
                      editorActions.updateOvalShape(
                        shapeEl.id,
                        { innerRadiusRatio: val / 100 },
                        { skipHistory: true }
                      )
                    }
                    onCommit={(val) =>
                      editorActions.updateOvalShape(shapeEl.id, {
                        innerRadiusRatio: val / 100,
                      })
                    }
                    unit="%"
                    min={0}
                    max={90}
                    step={1}
                    inputWidth={50}
                    ariaLabel="Donut inner radius percentage"
                    data-testid="oval-inner-radius-numberfield"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Pie Angles:</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <NumberField
                      label="S"
                      value={startAng}
                      onChange={(val) =>
                        editorActions.updateOvalShape(
                          shapeEl.id,
                          { startAngle: val },
                          { skipHistory: true }
                        )
                      }
                      onCommit={(val) =>
                        editorActions.updateOvalShape(shapeEl.id, { startAngle: val })
                      }
                      unit="°"
                      min={0}
                      max={359}
                      step={5}
                      inputWidth={42}
                      ariaLabel="Pie start angle"
                      data-testid="oval-start-angle-numberfield"
                    />
                    <NumberField
                      label="E"
                      value={endAng}
                      onChange={(val) =>
                        editorActions.updateOvalShape(
                          shapeEl.id,
                          { endAngle: val },
                          { skipHistory: true }
                        )
                      }
                      onCommit={(val) =>
                        editorActions.updateOvalShape(shapeEl.id, { endAngle: val })
                      }
                      unit="°"
                      min={1}
                      max={360}
                      step={5}
                      inputWidth={42}
                      ariaLabel="Pie end angle"
                      data-testid="oval-end-angle-numberfield"
                    />
                  </div>
                </div>
                <div
                  className={styles.fieldRow}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}
                >
                  <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                    Presets:
                  </span>
                  <div className={styles.presetPillsGrid}>
                    {[
                      { id: 'full', name: 'Full Oval', ir: 0, s: 0, e: 360 },
                      { id: 'donut', name: 'Donut (50%)', ir: 0.5, s: 0, e: 360 },
                      { id: 'ring', name: 'Ring (75%)', ir: 0.75, s: 0, e: 360 },
                      { id: 'semi', name: 'Half Dome', ir: 0, s: 180, e: 360 },
                      { id: 'pacman', name: 'Pac-Man', ir: 0, s: 35, e: 325 },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={styles.presetPill}
                        onClick={() =>
                          editorActions.updateOvalShape(shapeEl.id, {
                            innerRadiusRatio: p.ir,
                            startAngle: p.s,
                            endAngle: p.e,
                          })
                        }
                        data-testid={`oval-preset-${p.id}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </AccordionSection>
        );
      })()}

      {/* Star & Polygon Dedicated Inspector Section */}
      {isStarOrPolygon && (
        <AccordionSection
          id="star-polygon"
          category="shape"
          activeCategory={effectiveElementCategory}
          title="Star & Polygon"
          icon="⭐"
          summary={`${starPts} pts, ${Math.round(starRatio * 100)}%`}
          collapsed={!isSectionExpanded('star-polygon')}
          onToggle={() => toggleSection('star-polygon')}
          testId="star-polygon-section"
        >

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
                <span data-testid="star-points-slider" style={{ display: 'none' }} />
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
                <span data-testid="star-ratio-slider" style={{ display: 'none' }} />
              </div>

              {/* Vertex Corner Radius control */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Corner Radius:</span>
                <NumberField
                  value={Math.round(starCornerRadius * 10) / 10}
                  onChange={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(
                      shapeEl.id,
                      { cornerRadius: val },
                      { skipHistory: true }
                    )
                  }
                  onCommit={(val) =>
                    shapeEl &&
                    editorActions.updateStarShape(shapeEl.id, { cornerRadius: val })
                  }
                  unit="px"
                  min={0}
                  max={100}
                  step={1}
                  shiftStep={5}
                  altStep={0.5}
                  inputWidth={50}
                  ariaLabel="Star vertex corner radius"
                  data-testid="star-corner-radius-numberfield"
                />
                <span data-testid="star-radius-numberfield" style={{ display: 'none' }} />
                <span data-testid="star-radius-slider" style={{ display: 'none' }} />
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
                        {p.id === 'star-5' && <span data-testid="star-preset-pentagram" style={{ display: 'none' }} />}
                        {p.id === 'star-6' && <span data-testid="star-preset-hexagram" style={{ display: 'none' }} />}
                        {p.id === 'pentagon' && <span data-testid="star-preset-badge" style={{ display: 'none' }} />}
                        {p.id === 'sun-12' && <span data-testid="star-preset-sunburst" style={{ display: 'none' }} />}
                        {p.id === 'burst-16' && <span data-testid="star-preset-burst" style={{ display: 'none' }} />}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </AccordionSection>
      )}

      {/* Universal Vector Path & Live Corners Section (Pen Paths, Custom Shapes, Polygons/Stars) */}
      {isShape && shapeEl && !(isRectangle && !isCustomizedPath) && (() => {
        const vecRadius =
          shapeEl.pathCornerRadius !== undefined && shapeEl.pathCornerRadius > 0
            ? shapeEl.pathCornerRadius
            : (shapeEl.starConfig?.cornerRadius ?? 0);
        const vecCornerType: CornerType = shapeEl.pathCornerType ?? 'round';

        return (
          <AccordionSection
            id="vector-corners"
            category="shape"
            activeCategory={effectiveElementCategory}
            title="Vector Path & Live Corners"
            icon="∿"
            summary={`Radius: ${Math.round(vecRadius)}px`}
            collapsed={!isSectionExpanded('vector-corners')}
            onToggle={() => toggleSection('vector-corners')}
            testId="vector-corner-radius-section"
          >

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Corner Radius:</span>
              <NumberField
                value={Math.round(vecRadius * 10) / 10}
                onChange={(val) =>
                  editorActions.updateShapeCornerRadius(
                    shapeEl.id,
                    { cornerRadius: val },
                    { skipHistory: true }
                  )
                }
                onCommit={(val) =>
                  editorActions.updateShapeCornerRadius(shapeEl.id, { cornerRadius: val })
                }
                unit="px"
                min={0}
                max={120}
                step={1}
                shiftStep={5}
                altStep={0.5}
                inputWidth={50}
                ariaLabel="Vector corner radius in px"
                data-testid="vector-corner-radius-numberfield"
              />
            </div>

            <div
              className={styles.fieldRow}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                  Live Scrub:
                </span>
                <span className={styles.starTypeBadge}>
                  {vecRadius <= 0 ? 'Sharp' : `${Math.round(vecRadius)}px`}
                </span>
              </div>
              <input
                type="range"
                className={styles.starPropsSlider}
                min={0}
                max={80}
                step={0.5}
                value={Math.min(80, vecRadius)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  editorActions.updateShapeCornerRadius(
                    shapeEl.id,
                    { cornerRadius: val },
                    { skipHistory: true }
                  );
                }}
                onMouseUp={(e) => {
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  editorActions.updateShapeCornerRadius(shapeEl.id, { cornerRadius: val });
                }}
                aria-label="Vector corner radius slider"
                data-testid="vector-corner-radius-slider"
              />
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Style:</span>
              <div className={styles.morphBtnGroup}>
                {(
                  [
                    { id: 'round', label: '╭ Round' },
                    { id: 'inverted', label: '╯ Inverted' },
                    { id: 'chamfer', label: '╱ Chamfer' },
                  ] as const
                ).map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    className={`${styles.morphBtn} ${
                      vecCornerType === ct.id ? styles.activePresetPill : ''
                    }`}
                    onClick={() =>
                      editorActions.updateShapeCornerRadius(shapeEl.id, { cornerType: ct.id })
                    }
                    data-testid={`vector-corner-type-${ct.id}`}
                    title={`Set vector corner style to ${ct.label}`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const rawD = shapeEl.basePathD || shapeEl.paths?.[0]?.d || '';
              const closed = isPathClosed(rawD);
              return (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--mx-border-light, #2a2e39)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className={styles.fieldLabel} style={{ width: 'auto' }}>Path Topology:</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 3,
                        backgroundColor: closed ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        color: closed ? '#60a5fa' : '#facc15',
                        fontWeight: 600,
                      }}
                      data-testid="path-topology-badge"
                    >
                      {closed ? '● Closed Loop' : '○ Open Path'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={styles.resetParametricBtn}
                      style={{ flex: 1 }}
                      onClick={() => editorActions.togglePathClosed(shapeEl.id)}
                      data-testid="toggle-path-closed-btn"
                      title={closed ? 'Open / Slice path by removing closing segment' : 'Close path by joining endpoints'}
                    >
                      {closed ? '✂ Open / Slice Shape' : '⮌ Close Path'}
                    </button>
                    {closed ? (
                      <button
                        type="button"
                        className={styles.resetParametricBtn}
                        style={{ flex: 1 }}
                        onClick={() => editorActions.openShapePath(shapeEl.id)}
                        data-testid="open-path-btn"
                        title="Open path loop"
                      >
                        Open Loop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.resetParametricBtn}
                        style={{ flex: 1 }}
                        onClick={() => editorActions.closeShapePath(shapeEl.id)}
                        data-testid="close-path-btn"
                        title="Close path loop"
                      >
                        Close Loop
                      </button>
                    )}
                  </div>

                  {/* Illustrator-Style Anchor Point (Corner vs Smooth) Inspector */}
                  {subselectedAnchor && subselectedAnchor.shapeId === shapeEl.id && (() => {
                    const pIdx = subselectedAnchor.pathIndex ?? 0;
                    const aIdx = subselectedAnchor.anchorIndex;
                    const baseD = pIdx === 0 && shapeEl.basePathD ? shapeEl.basePathD : shapeEl.paths?.[pIdx]?.d || '';
                    const parsed = parseSvgPath(baseD, shapeEl.pathAnchorPointTypes);
                    const anchor = parsed.anchors[aIdx];
                    if (!anchor) return null;
                    const currentType = shapeEl.pathAnchorPointTypes?.[aIdx] ?? anchor.pointType ?? 'corner';
                    const isSmooth = currentType === 'smooth';

                    return (
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: '1px solid var(--mx-border-light, #2a2e39)',
                        }}
                        data-testid="anchor-point-inspector"
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span className={styles.fieldLabel} style={{ width: 'auto' }}>
                            Anchor Point #{aIdx + 1}:
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 3,
                              backgroundColor: isSmooth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                              color: isSmooth ? '#34d399' : '#a78bfa',
                              fontWeight: 600,
                            }}
                            data-testid="anchor-point-type-badge"
                          >
                            {isSmooth ? '∿ Smooth Point' : '⦢ Corner Point'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className={styles.resetParametricBtn}
                            style={{
                              flex: 1,
                              backgroundColor: !isSmooth ? 'rgba(139, 92, 246, 0.25)' : undefined,
                              borderColor: !isSmooth ? '#8b5cf6' : undefined,
                              color: !isSmooth ? '#ffffff' : undefined,
                              fontWeight: !isSmooth ? 600 : 400,
                            }}
                            onClick={() =>
                              editorActions.setPathAnchorPointType(shapeEl.id, aIdx, 'corner', pIdx)
                            }
                            data-testid="convert-anchor-corner-btn"
                            title="Convert to Corner Point (sharp corner with retracted handles)"
                          >
                            ⦢ Corner
                          </button>
                          <button
                            type="button"
                            className={styles.resetParametricBtn}
                            style={{
                              flex: 1,
                              backgroundColor: isSmooth ? 'rgba(16, 185, 129, 0.25)' : undefined,
                              borderColor: isSmooth ? '#10b981' : undefined,
                              color: isSmooth ? '#ffffff' : undefined,
                              fontWeight: isSmooth ? 600 : 400,
                            }}
                            onClick={() =>
                              editorActions.setPathAnchorPointType(shapeEl.id, aIdx, 'smooth', pIdx)
                            }
                            data-testid="convert-anchor-smooth-btn"
                            title="Convert to Smooth Point (continuous curvature with collinear handles)"
                          >
                            ∿ Smooth
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            className={styles.resetParametricBtn}
                            style={{
                              flex: 1,
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              borderColor: 'rgba(239, 68, 68, 0.4)',
                              color: '#f87171',
                            }}
                            onClick={() =>
                              editorActions.deletePathAnchor(shapeEl.id, pIdx, aIdx)
                            }
                            data-testid="delete-anchor-point-btn"
                            title="Delete this anchor point (or press Delete / Backspace key)"
                          >
                            🗑 Delete Point
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </AccordionSection>
        );
      })()}

      {/* Pathfinder Accordion Section */}
      {(selectedElementIds.length >= 2 || isShape) && (
        <AccordionSection
          id="pathfinder"
          category="shape"
          activeCategory={effectiveElementCategory}
          title="Pathfinder"
          icon="⊞"
          badge={selectedElementIds.length >= 2 ? `${selectedElementIds.length} Shapes` : undefined}
          summary={selectedElementIds.length >= 2 ? 'Unite, Subtract, Intersect, Exclude' : 'Select 2+ shapes'}
          collapsed={!isSectionExpanded('pathfinder')}
          onToggle={() => toggleSection('pathfinder')}
          testId="pathfinder-section"
        >
          <div className={styles.fieldRow} style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                disabled={selectedElementIds.length < 2}
                onClick={() => editorActions.uniteSelectedShapes()}
                title="Unite (Add)"
                aria-label="Unite (Add)"
                data-testid="pathfinder-unite-btn"
                style={{ padding: '6px 8px', justifyContent: 'center' }}
              >
                ⧉ Unite
              </button>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                disabled={selectedElementIds.length < 2}
                onClick={() => editorActions.subtractSelectedShapes()}
                title="Minus Front (Subtract)"
                aria-label="Minus Front (Subtract)"
                data-testid="pathfinder-subtract-btn"
                style={{ padding: '6px 8px', justifyContent: 'center' }}
              >
                ⊟ Minus Front
              </button>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                disabled={selectedElementIds.length < 2}
                onClick={() => editorActions.intersectSelectedShapes()}
                title="Intersect"
                aria-label="Intersect"
                data-testid="pathfinder-intersect-btn"
                style={{ padding: '6px 8px', justifyContent: 'center' }}
              >
                ⨅ Intersect
              </button>
              <button
                type="button"
                className={styles.addFontSmallBtn}
                disabled={selectedElementIds.length < 2}
                onClick={() => editorActions.excludeSelectedShapes()}
                title="Exclude (Difference)"
                aria-label="Exclude (Difference)"
                data-testid="pathfinder-exclude-btn"
                style={{ padding: '6px 8px', justifyContent: 'center' }}
              >
                ⨂ Exclude
              </button>
            </div>
            {selectedElementIds.length < 2 && (
              <div style={{ fontSize: '11px', color: 'var(--mx-text-muted, #888)', textAlign: 'center', marginTop: 2 }}>
                Select 2 or more overlapping shapes to apply Pathfinder operations.
              </div>
            )}
          </div>
        </AccordionSection>
      )}
        </div>
      </div>
    </div>
  );
};
