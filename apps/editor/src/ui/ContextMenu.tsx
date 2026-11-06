import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, editorActions, type ContextMenuItem } from '../state/editorStore';
import styles from './ContextMenu.module.css';

export const ContextMenu: React.FC = () => {
  const contextMenu = useEditorStore((s) => s.contextMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenu.isOpen) return;

    let posX = contextMenu.x;
    let posY = contextMenu.y;

    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (posX + rect.width > viewportWidth - 8) {
        posX = Math.max(8, viewportWidth - rect.width - 8);
      }
      if (posY + rect.height > viewportHeight - 8) {
        posY = Math.max(8, viewportHeight - rect.height - 8);
      }
    }

    setAdjustedPos({ x: posX, y: posY });

    // Focus first interactive item
    const firstSelectable = contextMenu.items.findIndex(
      (item) => !item.separator && !item.disabled
    );
    setFocusedIndex(firstSelectable);
  }, [contextMenu]);

  // Focus the active item button when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!contextMenu?.isOpen) return;

      const items = contextMenu.items;
      const selectableIndices = items
        .map((item, idx) => (!item.separator && !item.disabled ? idx : -1))
        .filter((idx) => idx !== -1);

      if (selectableIndices.length === 0) {
        if (e.key === 'Escape') {
          editorActions.closeContextMenu();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        editorActions.closeContextMenu();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currPos = selectableIndices.indexOf(prev);
          const nextPos = currPos === -1 || currPos === selectableIndices.length - 1 ? 0 : currPos + 1;
          return selectableIndices[nextPos];
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currPos = selectableIndices.indexOf(prev);
          const prevPos = currPos <= 0 ? selectableIndices.length - 1 : currPos - 1;
          return selectableIndices[prevPos];
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(selectableIndices[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIndex(selectableIndices[selectableIndices.length - 1]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex];
          if (item && !item.disabled && !item.separator) {
            editorActions.closeContextMenu();
            item.action?.();
          }
        }
      }
    },
    [contextMenu, focusedIndex]
  );

  useEffect(() => {
    if (!contextMenu?.isOpen) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu?.isOpen, handleKeyDown]);

  if (!contextMenu || !contextMenu.isOpen) return null;

  const handleItemClick = (e: React.MouseEvent, item: ContextMenuItem) => {
    e.stopPropagation();
    if (item.disabled || item.separator) return;
    editorActions.closeContextMenu();
    item.action?.();
  };

  const content = (
    <>
      <div
        className={styles.backdrop}
        style={{ zIndex: 100000 }}
        onMouseDown={(e) => {
          e.stopPropagation();
          editorActions.closeContextMenu();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editorActions.closeContextMenu();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Context Menu"
        aria-orientation="vertical"
        tabIndex={-1}
        className={styles.contextMenu}
        style={{ left: `${adjustedPos.x}px`, top: `${adjustedPos.y}px`, zIndex: 100001 }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {contextMenu.items.map((item, idx) => {
          if (item.separator) {
            return (
              <div
                key={idx}
                role="separator"
                className={styles.separator}
              />
            );
          }

          const isFocused = focusedIndex === idx;

          return (
            <button
              key={idx}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              role="menuitem"
              type="button"
              tabIndex={isFocused ? 0 : -1}
              aria-disabled={item.disabled ? true : undefined}
              className={`${styles.menuItem} ${item.danger ? styles.danger : ''} ${
                isFocused ? styles.focused : ''
              }`}
              disabled={item.disabled}
              onClick={(e) => handleItemClick(e, item)}
              onMouseEnter={() => {
                if (!item.disabled) setFocusedIndex(idx);
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
