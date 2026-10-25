import React, { useEffect } from 'react';
import { Workspace } from './layout/Workspace';
import { useEditorStore, editorActions } from './state/editorStore';

export const App: React.FC = () => {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const editingTextElId = useEditorStore((s) => s.editingTextElId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input or textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const activeEl = document.activeElement;
      const activeTag = activeEl?.tagName?.toLowerCase();
      const isInput =
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        Boolean((e.target as HTMLElement)?.isContentEditable) ||
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        Boolean((activeEl as HTMLElement)?.isContentEditable);

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // 1. Global Test Movie: Ctrl+Enter / Cmd+Enter
      if (modKey && e.key === 'Enter') {
        e.preventDefault();
        editorActions.setTestMovieOpen(true);
        return;
      }

      // If user is focused on an input/textarea, or editing text inline,
      // do not capture single key shortcuts or commands that steal focus
      if (isInput || editingTextElId !== null) return;

      // 2. Global Undo: Ctrl+Z / Cmd+Z
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!isInput) {
          e.preventDefault();
          editorActions.undo();
          return;
        }
      }

      // 3. Global Redo: Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z
      if (
        (modKey && e.key.toLowerCase() === 'y') ||
        (modKey && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (!isInput) {
          e.preventDefault();
          editorActions.redo();
          return;
        }
      }

      // Group: Ctrl+G / Cmd+G, Ungroup: Ctrl+Shift+G / Cmd+Shift+G
      if (modKey && e.key.toLowerCase() === 'g') {
        if (!isInput) {
          e.preventDefault();
          if (e.shiftKey) {
            editorActions.ungroupSelectedElements();
          } else {
            editorActions.groupSelectedElements();
          }
          return;
        }
      }

      // If user is focused on an input/textarea, do not capture single key shortcuts
      if (isInput) return;

      // 4. Play / Pause: Enter
      if (e.key === 'Enter') {
        e.preventDefault();
        editorActions.togglePlay();
        return;
      }

      // 5. Timeline Shortcuts: F5 (Insert Frame), Shift+F5 (Remove Frame)
      if (e.key === 'F5') {
        e.preventDefault();
        if (e.shiftKey) {
          editorActions.removeFrame();
        } else {
          editorActions.insertFrame();
        }
        return;
      }

      // 6. F6: Keyframe
      if (e.key === 'F6') {
        e.preventDefault();
        editorActions.insertKeyframe();
        return;
      }

      // 7. F7: Blank Keyframe
      if (e.key === 'F7') {
        e.preventDefault();
        editorActions.insertBlankKeyframe();
        return;
      }

      // 8. F8: Convert to Component
      if (e.key === 'F8') {
        e.preventDefault();
        if (selectedElementIds.length > 0) {
          editorActions.setConvertToComponentModalOpen(true);
        }
        return;
      }

      // 9. Delete / Backspace: Delete selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          editorActions.deleteSelectedElements();
          return;
        }
      }

      // 10. Escape: Deselect all / close dialogs
      if (e.key === 'Escape') {
        e.preventDefault();
        editorActions.deselectAll();
        editorActions.setTestMovieOpen(false);
        editorActions.setConvertToComponentModalOpen(false);
        editorActions.setExportModalOpen(false);
        editorActions.setImportModalOpen(false);
        return;
      }

      // 11. Tool Shortcuts (when not modifier-keyed)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            editorActions.setActiveTool('select');
            break;
          case 'a':
            editorActions.setActiveTool('subselect');
            break;
          case 'r':
            editorActions.setActiveTool('rect');
            break;
          case 'o':
            editorActions.setActiveTool('oval');
            break;
          case 's':
            editorActions.setActiveTool('polygon');
            break;
          case 't':
            editorActions.setActiveTool('text');
            break;
          case 'p':
            editorActions.setActiveTool('pen');
            break;
          case 'h':
            editorActions.setActiveTool('hand');
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, editingTextElId]);

  return <Workspace />;
};
