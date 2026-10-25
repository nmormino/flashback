import React, { useState, useEffect, useRef } from 'react';
import {
  useEditorStore,
  editorActions,
  getActiveTimeline,
  computeTotalTimelineDuration,
  formatTimeInSeconds,
} from '../state/editorStore';
import styles from './MenuBar.module.css';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export const MenuBar: React.FC = () => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const doc = useEditorStore((s) => s.doc);
  const currentTime = useEditorStore((s) => s.currentTime ?? 0);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const undoStack = useEditorStore((s) => s.undoStack);
  const redoStack = useEditorStore((s) => s.redoStack);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectedFrameIndex = useEditorStore((s) => s.selectedFrameIndex);
  const isolationStack = useEditorStore((s) => s.isolationStack);

  const activeTl = getActiveTimeline(doc, isolationStack);
  const fps = doc.stage.fps || 24;
  const totalDuration = computeTotalTimelineDuration(activeTl, fps);
  const timecodeDisplay = `${formatTimeInSeconds(currentTime)} / ${formatTimeInSeconds(totalDuration)}`;

  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = () => {
    setNameDraft(doc.meta.name || 'Untitled');
    setIsEditingName(true);
  };

  const handleFinishRename = () => {
    if (isEditingName) {
      if (nameDraft.trim()) {
        editorActions.setDocumentName(nameDraft.trim());
      }
      setIsEditingName(false);
    }
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsHamburgerOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    setIsHamburgerOpen(false);
    item.action?.();
  };

  const menuSections: Array<{ title: string; items: MenuItem[] }> = [
    {
      title: 'File',
      items: [
        { label: 'New Document', shortcut: 'Ctrl+N', action: () => editorActions.newDocument() },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => editorActions.setImportModalOpen(true) },
        { label: 'Save / Export .js', shortcut: 'Ctrl+S', action: () => editorActions.setExportModalOpen(true) },
        { label: 'Test Movie', shortcut: 'Ctrl+Enter', action: () => editorActions.setTestMovieOpen(true) },
      ],
    },
    {
      title: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => editorActions.undo(),
          disabled: undoStack.length === 0,
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => editorActions.redo(),
          disabled: redoStack.length === 0,
        },
        { separator: true, label: '' },
        {
          label: 'Group Selection',
          shortcut: 'Ctrl+G',
          action: () => editorActions.groupSelectedElements(),
          disabled: selectedElementIds.length === 0,
        },
        {
          label: 'Ungroup',
          shortcut: 'Ctrl+Shift+G',
          action: () => editorActions.ungroupSelectedElements(),
          disabled: selectedElementIds.length === 0,
        },
        {
          label: 'Bring Forward',
          action: () => {
            for (const id of selectedElementIds) {
              editorActions.bringElementForward(id);
            }
          },
          disabled: selectedElementIds.length === 0,
        },
        {
          label: 'Send Backward',
          action: () => {
            for (const id of selectedElementIds) {
              editorActions.sendElementBackward(id);
            }
          },
          disabled: selectedElementIds.length === 0,
        },
        { separator: true, label: '' },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => editorActions.selectAll() },
        { label: 'Deselect All', shortcut: 'Esc', action: () => editorActions.deselectAll() },
        {
          label: 'Delete',
          shortcut: 'Del',
          action: () => editorActions.deleteSelectedElements(),
          disabled: selectedElementIds.length === 0,
        },
      ],
    },
    {
      title: 'Insert & Components',
      items: [
        {
          label: 'Convert to Component (F8)',
          shortcut: 'F8',
          action: () => editorActions.setConvertToComponentModalOpen(true),
          disabled: selectedElementIds.length === 0,
        },
        {
          label: 'New Component...',
          action: () => editorActions.setConvertToComponentModalOpen(true),
          disabled: selectedElementIds.length === 0,
        },
        {
          label: 'Add Web Font...',
          action: () => editorActions.setAddFontModalOpen(true),
        },
        { separator: true, label: '' },
        { label: 'Keyframe', shortcut: 'F6', action: () => editorActions.insertKeyframe() },
        { label: 'Blank Keyframe', shortcut: 'F7', action: () => editorActions.insertBlankKeyframe() },
        { label: 'Frame', shortcut: 'F5', action: () => editorActions.insertFrame() },
        { label: 'Remove Frame', shortcut: 'Shift+F5', action: () => editorActions.removeFrame() },
        {
          label: 'Create Motion Tween',
          action: () => {
            if (selectedLayerId !== null) {
              editorActions.createMotionTween(selectedLayerId, selectedFrameIndex);
            }
          },
        },
        { label: 'New Layer', action: () => editorActions.addLayer() },
      ],
    },
  ];

  return (
    <div className={styles.menuBar} ref={menuRef}>
      {/* 1. Left: Document name & Status */}
      <div className={styles.leftSection}>
        <div className={styles.brandTitle}>
          <span className={styles.brandIcon}>⚡</span> Flashback Studio
        </div>
        <div className={styles.docDivider} />
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            className={styles.docNameInput}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') setIsEditingName(false);
            }}
          />
        ) : (
          <span
            className={styles.docName}
            onClick={handleStartRename}
            title="Click to rename document"
          >
            {doc.meta.name || 'Untitled.anim.js'}
          </span>
        )}
        <span className={styles.statusBadge}>
          {doc.stage.width}×{doc.stage.height}
        </span>
      </div>

      {/* 2. Center: Timecode indicator */}
      <div className={styles.centerControls}>
        <div className={styles.frameBadge} title="Current Playhead Time / Total Duration">
          {timecodeDisplay}
        </div>
      </div>

      {/* 3. Right: Quick actions & Hamburger/settings */}
      <div className={styles.rightSection}>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={() => editorActions.setExportModalOpen(true)}
          title="Export as native ES module (.anim.js)"
        >
          Export .js
        </button>
        <button
          type="button"
          className={styles.testMovieBtn}
          onClick={() => editorActions.setTestMovieOpen(true)}
          title="Test Movie in runtime player (Ctrl+Enter)"
        >
          ▶ Test Movie
        </button>
        <button
          type="button"
          className={`${styles.hamburgerBtn} ${isHamburgerOpen ? styles.open : ''}`}
          onClick={() => setIsHamburgerOpen(!isHamburgerOpen)}
          title="Menu & Settings"
        >
          ☰
        </button>

        {/* Hamburger Dropdown Menu */}
        {isHamburgerOpen && (
          <div className={styles.hamburgerMenu}>
            {menuSections.map((section, sIdx) => (
              <React.Fragment key={section.title}>
                {sIdx > 0 && <div className={styles.separator} />}
                <div className={styles.menuSectionTitle}>{section.title}</div>
                {section.items.map((item, idx) => {
                  if (item.separator) {
                    return <div key={idx} className={styles.separator} />;
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={styles.menuItem}
                      disabled={item.disabled}
                      onClick={() => handleItemClick(item)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
