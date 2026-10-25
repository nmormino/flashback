import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { useEditorStore, editorActions, type ContextMenuItem } from '../state/editorStore';
import styles from './ContextMenu.module.css';

export const ContextMenu: React.FC = () => {
  const contextMenu = useEditorStore((s) => s.contextMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        editorActions.closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu?.isOpen]);

  if (!contextMenu || !contextMenu.isOpen) return null;

  const handleItemClick = (e: React.MouseEvent, item: ContextMenuItem) => {
    e.stopPropagation();
    if (item.disabled || item.separator) return;
    editorActions.closeContextMenu();
    item.action?.();
  };

  return (
    <>
      <div
        className={styles.backdrop}
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
        className={styles.contextMenu}
        style={{ left: `${adjustedPos.x}px`, top: `${adjustedPos.y}px` }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {contextMenu.items.map((item, idx) => {
          if (item.separator) {
            return <div key={idx} className={styles.separator} />;
          }

          return (
            <button
              key={idx}
              type="button"
              className={`${styles.menuItem} ${item.danger ? styles.danger : ''}`}
              disabled={item.disabled}
              onClick={(e) => handleItemClick(e, item)}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
};
