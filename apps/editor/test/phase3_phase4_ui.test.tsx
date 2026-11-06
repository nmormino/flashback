import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  type EditorSymbol,
} from '../src/state/editorStore';
import { ContextMenu } from '../src/ui/ContextMenu';
import { Properties } from '../src/panels/Properties/Properties';

describe('Phase 3 & 4 UI: ContextMenu & Component Instances', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    editorActions.newDocument();
    editorActions.closeContextMenu();
  });

  it('renders ContextMenu at topmost z-index with ARIA roles and handles keyboard navigation', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let action1Called = false;
    let action2Called = false;

    await act(async () => {
      root.render(<ContextMenu />);
    });

    // Initially closed
    expect(document.querySelector('[role="menu"]')).toBeNull();

    // Open context menu
    await act(async () => {
      editorActions.openContextMenu({
        x: 100,
        y: 150,
        items: [
          { label: 'Item 1', action: () => { action1Called = true; } },
          { separator: true },
          { label: 'Item 2', action: () => { action2Called = true; } },
          { label: 'Disabled Item', disabled: true, action: () => {} },
        ],
      });
    });

    // Check menu container & ARIA attributes
    const menuEl = document.querySelector('[role="menu"]') as HTMLElement;
    expect(menuEl).not.toBeNull();
    expect(menuEl.getAttribute('aria-label')).toBe('Context Menu');
    expect(menuEl.getAttribute('aria-orientation')).toBe('vertical');

    // Check topmost z-index
    expect(Number(menuEl.style.zIndex)).toBeGreaterThanOrEqual(100000);

    // Check items & separators
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    expect(menuItems).toHaveLength(3); // Item 1, Item 2, Disabled Item
    const separators = document.querySelectorAll('[role="separator"]');
    expect(separators).toHaveLength(1);

    // Keyboard navigation: ArrowDown jumps to Item 2 (skipping separator)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // Press Enter to trigger Item 2
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(action2Called).toBe(true);

    // Menu should now be closed
    expect(getEditorState().contextMenu).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('closes ContextMenu on Escape key and backdrop click', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ContextMenu />);
      editorActions.openContextMenu({
        x: 50,
        y: 50,
        items: [{ label: 'Option', action: () => {} }],
      });
    });

    expect(getEditorState().contextMenu).not.toBeNull();

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(getEditorState().contextMenu).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('Properties panel allows configuring playMode, autoplay, and loop for component instances', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Create a component in library
    const comp: EditorSymbol = {
      id: 'sym_card',
      name: 'CardComponent',
      kind: 'movieclip',
      timeline: {
        frameCount: 24,
        layers: [
          {
            id: 'l_card',
            name: 'Layer 1',
            keyframes: [
              {
                id: 'kf_card',
                index: 0,
                duration: 24,
                elements: [],
              },
            ],
          },
        ],
      },
    };
    editorActions.addComponent(comp);

    // Insert component to stage
    editorActions.insertComponent('sym_card', 50, 50);

    const layer = getEditorState().doc.root.layers[0];
    const inst = layer.keyframes[0].elements[0];
    expect(inst.type).toBe('instance');
    editorActions.selectElement(inst.id);

    await act(async () => {
      root.render(<Properties />);
    });

    // Check Play Mode select element
    const selects = container.querySelectorAll('select');
    const playModeSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === 'sync')
    );
    expect(playModeSelect).toBeDefined();
    expect(playModeSelect?.value).toBe('loop');

    // Change playMode to 'sync'
    await act(async () => {
      playModeSelect!.value = 'sync';
      playModeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    let updatedInst = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as any;
    expect(updatedInst.playMode).toBe('sync');

    // Check Autoplay and Loop checkboxes
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const autoplayCheckbox = Array.from(checkboxes).find((c) =>
      c.parentElement?.textContent?.includes('Autoplay')
    );
    expect(autoplayCheckbox).toBeDefined();
    expect(autoplayCheckbox?.checked).toBe(true);

    // Toggle autoplay to false
    await act(async () => {
      autoplayCheckbox!.click();
    });

    updatedInst = getEditorState().doc.root.layers[0].keyframes[0].elements[0] as any;
    expect(updatedInst.autoplay).toBe(false);

    root.unmount();
    container.remove();
  });
});
