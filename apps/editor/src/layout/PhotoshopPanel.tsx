import React, { useState, useRef, useEffect } from 'react';
import styles from './PhotoshopPanel.module.css';

export interface PhotoshopPanelMenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface PhotoshopPanelProps {
  id: 'properties' | 'clips';
  title: string;
  icon?: React.ReactNode;
  isDocked: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleDock: () => void;
  onClose?: () => void;
  floatingPosition?: { x: number; y: number };
  onPositionChange?: (pos: { x: number; y: number }) => void;
  menuItems?: PhotoshopPanelMenuItem[];
  testId?: string;
  closeBtnTestId?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const PhotoshopPanel: React.FC<PhotoshopPanelProps> = ({
  id,
  title,
  icon,
  isDocked,
  isCollapsed,
  onToggleCollapse,
  onToggleDock,
  onClose,
  floatingPosition = { x: 300, y: 100 },
  onPositionChange,
  menuItems,
  testId,
  closeBtnTestId,
  className,
  style,
  children,
}) => {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Close flyout on click outside
  useEffect(() => {
    if (!isFlyoutOpen) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setIsFlyoutOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [isFlyoutOpen]);

  // Floating window drag support
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isDocked) return;
    // Don't drag if user clicked a button or inside flyout menu
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest(`.${styles.flyoutMenu}`)) {
      return;
    }
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - floatingPosition.x,
      y: e.clientY - floatingPosition.y,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 80, moveEvt.clientX - dragOffsetRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 40, moveEvt.clientY - dragOffsetRef.current.y));
      onPositionChange?.({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const collapseButtonTitle =
    id === 'properties'
      ? isCollapsed
        ? 'Expand Properties'
        : 'Collapse Properties'
      : isCollapsed
      ? `Expand ${title}`
      : `Collapse ${title}`;

  return (
    <div
      className={`${isDocked ? styles.panelDocked : styles.panelFloating} ${
        isCollapsed ? styles.panelCollapsed : ''
      } ${className || ''}`}
      style={{
        ...(!isDocked
          ? {
              position: 'fixed',
              left: `${floatingPosition.x}px`,
              top: `${floatingPosition.y}px`,
            }
          : undefined),
        ...style,
      }}
      data-testid={testId}
    >
      {/* Photoshop / Illustrator Dark Studio Header */}
      <div
        className={`${styles.headerBar} ${!isDocked ? styles.headerBarFloating : ''}`}
        onMouseDown={handleHeaderMouseDown}
      >
        <div className={styles.headerLeft}>
          <span className={styles.gripHandle} title={isDocked ? 'Docked Panel' : 'Drag Panel'}>
            ⠿
          </span>
          {icon && <span className={styles.titleIcon}>{icon}</span>}
          <span className={styles.panelTitleText} title={title}>
            {title}
          </span>
        </div>

        <div className={styles.headerRight}>
          {/* Flyout Menu Button (≡) */}
          <button
            type="button"
            className={`${styles.headerBtn} ${isFlyoutOpen ? styles.activeMenuBtn : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsFlyoutOpen((prev) => !prev);
            }}
            title="Panel Options"
          >
            ≡
          </button>

          {/* Pop-out / Undock / Dock Button */}
          <button
            type="button"
            className={styles.headerBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDock();
            }}
            title={isDocked ? 'Undock to Floating Window' : 'Dock to Right Sidebar'}
          >
            {isDocked ? '⧉' : '↙'}
          </button>

          {/* Collapse / Expand Chevron */}
          <button
            type="button"
            className={styles.headerBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title={collapseButtonTitle}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>

          {/* Close button (when floating or onClose provided) */}
          {!isDocked && onClose && (
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.closeBtn}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title={id === 'clips' ? 'Close Clips Window' : 'Close Window'}
              data-testid={closeBtnTestId}
            >
              ✕
            </button>
          )}
        </div>

        {/* Flyout Dropdown Menu */}
        {isFlyoutOpen && (
          <div ref={flyoutRef} className={styles.flyoutMenu} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.flyoutItem}
              onClick={() => {
                setIsFlyoutOpen(false);
                onToggleDock();
              }}
            >
              <span>{isDocked ? 'Undock to Floating Window' : 'Dock to Right Sidebar'}</span>
              <span>{isDocked ? '⧉' : '↙'}</span>
            </button>

            <button
              type="button"
              className={styles.flyoutItem}
              onClick={() => {
                setIsFlyoutOpen(false);
                onToggleCollapse();
              }}
            >
              <span>{isCollapsed ? 'Expand Panel' : 'Collapse Panel'}</span>
              <span>{isCollapsed ? '▼' : '▲'}</span>
            </button>

            {menuItems && menuItems.length > 0 && (
              <>
                <div className={styles.flyoutSeparator} />
                {menuItems.map((item, idx) =>
                  item.separator ? (
                    <div key={idx} className={styles.flyoutSeparator} />
                  ) : (
                    <button
                      key={idx}
                      type="button"
                      className={styles.flyoutItem}
                      disabled={item.disabled}
                      onClick={() => {
                        setIsFlyoutOpen(false);
                        item.action?.();
                      }}
                    >
                      <span>{item.label}</span>
                    </button>
                  )
                )}
              </>
            )}

            {onClose && (
              <>
                <div className={styles.flyoutSeparator} />
                <button
                  type="button"
                  className={styles.flyoutItem}
                  onClick={() => {
                    setIsFlyoutOpen(false);
                    onClose();
                  }}
                >
                  <span>Close Panel</span>
                  <span>✕</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Panel Body */}
      <div className={styles.panelBody} style={{ display: isCollapsed ? 'none' : 'flex' }}>
        {children}
      </div>
    </div>
  );
};
