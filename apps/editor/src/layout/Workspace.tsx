import React, { useState, useEffect, useRef, Suspense } from 'react';
import { MenuBar } from './MenuBar';
import { Tools } from '../panels/Tools/Tools';
import { Stage } from '../panels/Stage/Stage';
import { ArtboardTabStrip } from '../panels/Stage/ArtboardTabStrip';
import { Library } from '../panels/Library/Library';
import { Localization } from '../panels/Localization/Localization';
import { StateVariables } from '../panels/StateVariables/StateVariables';
import { Timeline } from '../panels/Timeline/Timeline';
import { Layers } from '../panels/Layers/Layers';
import { Properties } from '../panels/Properties/Properties';
import { Scripts } from '../panels/Scripts/Scripts';
import { ContextMenu } from '../ui/ContextMenu';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Workspace.module.css';

const AddFontModal = React.lazy(() => import('../dialogs/AddFontModal').then((m) => ({ default: m.AddFontModal })));
const TestMovieModal = React.lazy(() => import('../panels/Stage/TestMovieModal').then((m) => ({ default: m.TestMovieModal })));
const ConvertToComponentDialog = React.lazy(() => import('../dialogs/ConvertToComponentDialog').then((m) => ({ default: m.ConvertToComponentDialog })));
const ExportModal = React.lazy(() => import('../dialogs/ExportModal').then((m) => ({ default: m.ExportModal })));
const ImportModal = React.lazy(() => import('../dialogs/ImportModal').then((m) => ({ default: m.ImportModal })));
const BezierEditorModal = React.lazy(() => import('../ui/BezierEditorModal').then((m) => ({ default: m.BezierEditorModal })));


type BottomTab = 'timeline' | 'properties' | 'scripts';

export const Workspace: React.FC = () => {
  const activeTab = useEditorStore((s) => s.activeInspectorTab ?? 'timeline');
  const isLibraryOpen = useEditorStore((s) => s.isLibraryOpen);
  const isLocalizationOpen = useEditorStore((s) => s.isLocalizationOpen);
  const isStateVariablesOpen = useEditorStore((s) => s.isStateVariablesOpen);
  const setActiveTab = (tab: BottomTab) => {
    editorActions.setActiveInspectorTab(tab);
    setIsInspectorCollapsed(false);
  };
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [bottomHeight, setBottomHeight] = useState<number>(240);
  const [isResizing, setIsResizing] = useState(false);

  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = isInspectorCollapsed ? 32 : bottomHeight;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = dragStartY.current - e.clientY;
      const newHeight = Math.min(
        Math.max(120, dragStartHeight.current + delta),
        Math.round(window.innerHeight * 0.75)
      );
      setBottomHeight(newHeight);
      if (isInspectorCollapsed) {
        setIsInspectorCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isInspectorCollapsed]);

  return (
    <div className={styles.workspace}>
      {/* 1. Sleek Minimal Top Menu Bar */}
      <MenuBar />

      {/* 2. Main Middle Workspace: Full-height Left Tools, Center Stage Area, Right Library */}
      <div className={styles.mainLayout}>
        <Tools />

        <div className={styles.stageAndBottomArea}>
          {/* Stage Artboard */}
          <div className={styles.stageWrapper}>
            <ArtboardTabStrip />
            <Stage />
          </div>

          {/* 3. Bottom Area: Multi-Tab Pane [ Timeline ] [ Properties ] [ Scripts ] */}
          <div
            className={`${styles.bottomInspector} ${
              isInspectorCollapsed ? styles.collapsed : ''
            }`}
            style={{ height: isInspectorCollapsed ? undefined : `${bottomHeight}px` }}
          >
            {/* Height Resizer Handle */}
            <div
              className={`${styles.resizer} ${isResizing ? styles.active : ''}`}
              onMouseDown={handleResizerMouseDown}
              title="Drag to resize bottom pane"
            />

            {/* Tab Bar: [ ⏱ Timeline & Layers ] [ ⚙ Properties ] [ 📜 Scripts ] */}
            <div className={styles.inspectorTabBar}>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'timeline' ? styles.active : ''
                }`}
                onClick={() => {
                  setActiveTab('timeline');
                  setIsInspectorCollapsed(false);
                }}
              >
                ⏱ Timeline & Layers
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'properties' ? styles.active : ''
                }`}
                onClick={() => {
                  setActiveTab('properties');
                  setIsInspectorCollapsed(false);
                }}
              >
                ⚙ Properties
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'scripts' ? styles.active : ''
                }`}
                onClick={() => {
                  setActiveTab('scripts');
                  setIsInspectorCollapsed(false);
                }}
              >
                📜 Scripts
              </button>

              <button
                type="button"
                className={styles.collapseToggleBtn}
                onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
                title={isInspectorCollapsed ? 'Expand Panel' : 'Collapse Panel'}
              >
                <span>{isInspectorCollapsed ? 'Expand' : 'Collapse'}</span>
                <span>{isInspectorCollapsed ? '▲' : '▼'}</span>
              </button>
            </div>

            {/* Tab Content */}
            {!isInspectorCollapsed && (
              <div className={styles.tabContent}>
                {activeTab === 'timeline' && <Timeline />}
                {activeTab === 'properties' && <Properties />}
                {activeTab === 'scripts' && <Scripts />}
              </div>
            )}
          </div>
        </div>

        {isLibraryOpen && <Library />}
        {isLocalizationOpen && <Localization />}
        {isStateVariablesOpen && <StateVariables />}
      </div>

      {/* Modals & Dialogs */}
      <ContextMenu />
      <Suspense fallback={null}>
        <AddFontModal />
        <TestMovieModal />
        <ConvertToComponentDialog />
        <ExportModal />
        <ImportModal />
        <BezierEditorModal />
      </Suspense>
    </div>
  );
};
