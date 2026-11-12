import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { MenuBar } from './MenuBar';
import { Tools } from '../panels/Tools/Tools';
import { Stage } from '../panels/Stage/Stage';
import { ArtboardTabStrip } from '../panels/Stage/ArtboardTabStrip';
import { Library } from '../panels/Library/Library';
import { Localization } from '../panels/Localization/Localization';
import { StateVariables } from '../panels/StateVariables/StateVariables';
import { Timeline } from '../panels/Timeline/Timeline';
import { Properties } from '../panels/Properties/Properties';
import { StateMachinePanel } from '../panels/StateMachine/StateMachinePanel';
import { ContextMenu } from '../ui/ContextMenu';
import { useEditorStore, editorActions } from '../state/editorStore';
import styles from './Workspace.module.css';

const AddFontModal = React.lazy(() => import('../dialogs/AddFontModal').then((m) => ({ default: m.AddFontModal })));
const TestMovieModal = React.lazy(() => import('../panels/Stage/TestMovieModal').then((m) => ({ default: m.TestMovieModal })));
const ConvertToComponentDialog = React.lazy(() => import('../dialogs/ConvertToComponentDialog').then((m) => ({ default: m.ConvertToComponentDialog })));
const ExportModal = React.lazy(() => import('../dialogs/ExportModal').then((m) => ({ default: m.ExportModal })));
const ImportModal = React.lazy(() => import('../dialogs/ImportModal').then((m) => ({ default: m.ImportModal })));
const BezierEditorModal = React.lazy(() => import('../ui/BezierEditorModal').then((m) => ({ default: m.BezierEditorModal })));

export type BottomTab = 'timeline' | 'statemachine' | 'properties';
type BottomDockTab = BottomTab;

export const Workspace: React.FC = () => {
  const activeInspectorTab = useEditorStore((s) => s.activeInspectorTab ?? 'timeline');
  const isLibraryOpen = useEditorStore((s) => s.isLibraryOpen);
  const isLocalizationOpen = useEditorStore((s) => s.isLocalizationOpen);
  const isStateVariablesOpen = useEditorStore((s) => s.isStateVariablesOpen);

  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>(
    activeInspectorTab === 'statemachine'
      ? 'statemachine'
      : 'timeline'
  );
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const bottomPanelRef = useRef<ImperativePanelHandle>(null);
  const inspectorPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync when editorActions.setActiveInspectorTab is invoked
  useEffect(() => {
    if (activeInspectorTab === 'statemachine') {
      setActiveBottomTab('statemachine');
      if (isBottomCollapsed) {
        setIsBottomCollapsed(false);
        try {
          bottomPanelRef.current?.expand();
        } catch {
          // Headless environments without computed layout
        }
      }
    } else if (activeInspectorTab === 'timeline') {
      setActiveBottomTab('timeline');
      if (isBottomCollapsed) {
        setIsBottomCollapsed(false);
        try {
          bottomPanelRef.current?.expand();
        } catch {
          // Headless environments without computed layout
        }
      }
    } else if (activeInspectorTab === 'properties') {
      if (!isInspectorOpen) {
        setIsInspectorOpen(true);
        try {
          inspectorPanelRef.current?.expand();
        } catch {
          // Headless environments without computed layout
        }
      }
    }
  }, [activeInspectorTab]);

  const selectBottomTab = (tab: BottomTab) => {
    setActiveBottomTab(tab);
    editorActions.setActiveInspectorTab(tab);
    if (isBottomCollapsed) {
      setIsBottomCollapsed(false);
      try {
        bottomPanelRef.current?.expand();
      } catch {
        // Headless environments without computed layout
      }
    }
  };

  const toggleBottomDock = () => {
    const nextState = !isBottomCollapsed;
    setIsBottomCollapsed(nextState);
    try {
      if (nextState) {
        bottomPanelRef.current?.collapse();
      } else {
        bottomPanelRef.current?.expand();
      }
    } catch {
      // Headless environments without computed layout
    }
  };

  const toggleInspector = () => {
    const nextState = !isInspectorOpen;
    setIsInspectorOpen(nextState);
    try {
      if (!nextState) {
        inspectorPanelRef.current?.collapse();
      } else {
        inspectorPanelRef.current?.expand();
      }
    } catch {
      // Headless environments without computed layout
    }
  };

  return (
    <div className={styles.workspace}>
      {/* 1. Sleek Minimal Top Menu Bar */}
      <MenuBar />

      {/* 2. Main Middle Workspace: Fixed width Tools on left, Center & Right Resizable Layout */}
      <div className={styles.mainLayout}>
        <Tools />

        <PanelGroup direction="horizontal" className={styles.mainPanelGroup}>
          {/* Center Column */}
          <Panel defaultSize={75} minSize={45}>
            <PanelGroup direction="vertical">
              {/* Upper Panel */}
              <Panel defaultSize={65} minSize={30}>
                <div className={styles.stageWrapper}>
                  <ArtboardTabStrip />
                  <Stage />
                </div>
              </Panel>

              {/* Vertical Resize Handle */}
              <PanelResizeHandle className={styles.resizerHorizontal} />

              {/* Lower Panel */}
              <Panel
                defaultSize={35}
                minSize={15}
                collapsible={true}
                collapsedSize={4}
                ref={bottomPanelRef}
                onCollapse={() => setIsBottomCollapsed(true)}
                onExpand={() => setIsBottomCollapsed(false)}
              >
                <div className={styles.bottomDock}>
                  {/* Tab Bar: [ ⏱ Timeline & Layers ] [ ⚡ State Machine ] [ Collapse/Expand ] */}
                  <div className={styles.inspectorTabBar}>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${
                        activeBottomTab === 'timeline' ? styles.active : ''
                      }`}
                      onClick={() => selectBottomTab('timeline')}
                    >
                      ⏱ Timeline & Layers
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${
                        activeBottomTab === 'statemachine' ? styles.active : ''
                      }`}
                      onClick={() => selectBottomTab('statemachine')}
                    >
                      ⚡ State Machine
                    </button>

                    <button
                      type="button"
                      className={styles.collapseToggleBtn}
                      onClick={toggleBottomDock}
                      title={isBottomCollapsed ? 'Expand Panel' : 'Collapse Panel'}
                    >
                      <span>{isBottomCollapsed ? 'Expand' : 'Collapse'}</span>
                      <span>{isBottomCollapsed ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* Tab Content */}
                  {!isBottomCollapsed && (
                    <div className={styles.tabContent}>
                      {activeBottomTab === 'timeline' && <Timeline />}
                      {activeBottomTab === 'statemachine' && <StateMachinePanel />}
                    </div>
                  )}
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Horizontal Resize Handle */}
          <PanelResizeHandle className={styles.resizerVertical} />

          {/* Right Inspector Panel */}
          <Panel
            defaultSize={25}
            minSize={18}
            maxSize={40}
            collapsible={true}
            collapsedSize={4}
            ref={inspectorPanelRef}
            onCollapse={() => setIsInspectorOpen(false)}
            onExpand={() => setIsInspectorOpen(true)}
          >
            <div className={styles.inspectorDock}>
              {/* Inspector Header Bar */}
              <div className={styles.inspectorHeader}>
                <div className={styles.inspectorTitle}>
                  <span>⚙ Properties</span>
                </div>
                <button
                  type="button"
                  className={styles.collapseToggleBtn}
                  onClick={toggleInspector}
                  title={isInspectorOpen ? 'Collapse Properties' : 'Expand Properties'}
                >
                  {isInspectorOpen && <span>Collapse</span>}
                  <span>{isInspectorOpen ? '▶' : '◀'}</span>
                </button>
              </div>

              {/* Inspector Content */}
              {isInspectorOpen && (
                <div className={styles.tabContent}>
                  <Properties />
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>

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
