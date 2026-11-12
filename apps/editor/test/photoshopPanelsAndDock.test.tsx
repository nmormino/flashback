import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { Workspace } from '../src/layout/Workspace';
import { editorActions, getEditorState } from '../src/state/editorStore';

describe('Photoshop / Illustrator Right Dock & Floating Panels Architecture', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    editorActions.newDocument();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Adobe Photoshop/Illustrator dock on the right side housing Properties and Clips by default', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const state = getEditorState();
    expect(state.dockedPanels).toEqual({ properties: true, clips: true });
    expect(state.collapsedPanels).toEqual({ properties: false, clips: false });

    // Both panels are docked in the right dock
    expect(container.querySelector('[data-testid="docked-properties-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="floating-clips-library"]')).toBeTruthy();

    // Check uppercase styled titles and grip handles
    expect(container.textContent).toContain('⚙ Properties');
    expect(container.textContent).toContain('Clips');

    // Headers have grip handles (⠿)
    const gripHandles = container.querySelectorAll('[class*="gripHandle"]');
    expect(gripHandles.length).toBeGreaterThanOrEqual(2);

    // Headers have undock buttons (⧉)
    const undockButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('title')?.includes('Undock to Floating Window')
    );
    expect(undockButtons.length).toBeGreaterThanOrEqual(2);

    // Headers have flyout menu buttons (≡)
    const flyoutButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('title')?.includes('Panel Options')
    );
    expect(flyoutButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('supports collapsing and expanding individual panels in the dock to slim header strips', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const propsPanel = container.querySelector('[data-testid="docked-properties-panel"]') as HTMLElement;
    expect(propsPanel.classList.toString()).not.toContain('panelCollapsed');

    // Collapse Properties
    const collapsePropsBtn = Array.from(propsPanel.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Collapse Properties')
    );
    expect(collapsePropsBtn).toBeTruthy();

    await act(async () => {
      collapsePropsBtn?.click();
    });

    expect(getEditorState().collapsedPanels.properties).toBe(true);
    expect(propsPanel.classList.toString()).toContain('panelCollapsed');

    // Expand Properties
    const expandPropsBtn = Array.from(propsPanel.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Expand Properties')
    );
    expect(expandPropsBtn).toBeTruthy();

    await act(async () => {
      expandPropsBtn?.click();
    });

    expect(getEditorState().collapsedPanels.properties).toBe(false);
    expect(propsPanel.classList.toString()).not.toContain('panelCollapsed');
  });

  it('pulls Properties panel out into a floating window and docks it back into the right dock', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const propsPanel = container.querySelector('[data-testid="docked-properties-panel"]') as HTMLElement;
    const undockBtn = Array.from(propsPanel.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Undock to Floating Window')
    );
    expect(undockBtn).toBeTruthy();

    // Undock Properties
    await act(async () => {
      undockBtn?.click();
    });

    expect(getEditorState().dockedPanels.properties).toBe(false);
    expect(container.querySelector('[data-testid="docked-properties-panel"]')).toBeNull();

    // Floating window is rendered with position: fixed
    const floatingProps = container.querySelector('[data-testid="floating-properties-panel"]') as HTMLElement;
    expect(floatingProps).toBeTruthy();
    expect(floatingProps.style.position).toBe('fixed');
    expect(floatingProps.style.left).toContain('px');
    expect(floatingProps.style.top).toContain('px');

    // Dock button is present (↙)
    const dockBtn = Array.from(floatingProps.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Dock to Right Sidebar')
    );
    expect(dockBtn).toBeTruthy();

    // Click dock button to snap back
    await act(async () => {
      dockBtn?.click();
    });

    expect(getEditorState().dockedPanels.properties).toBe(true);
    expect(container.querySelector('[data-testid="docked-properties-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="floating-properties-panel"]')).toBeNull();
  });

  it('pulls Clips panel out into a floating window and docks it back into the right dock', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const clipsPanel = container.querySelector('[data-testid="floating-clips-library"]') as HTMLElement;
    const undockBtn = Array.from(clipsPanel.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Undock to Floating Window')
    );
    expect(undockBtn).toBeTruthy();

    // Undock Clips
    await act(async () => {
      undockBtn?.click();
    });

    expect(getEditorState().dockedPanels.clips).toBe(false);

    // Now floating Clips window is fixed
    const floatingClips = container.querySelector('[data-testid="floating-clips-library"]') as HTMLElement;
    expect(floatingClips).toBeTruthy();
    expect(floatingClips.style.position).toBe('fixed');

    // Snap back into dock
    const dockBtn = Array.from(floatingClips.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Dock to Right Sidebar')
    );
    expect(dockBtn).toBeTruthy();

    await act(async () => {
      dockBtn?.click();
    });

    expect(getEditorState().dockedPanels.clips).toBe(true);
  });

  it('displays Adobe-style dropzone when all panels are undocked, with "Dock All to Sidebar" action', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    // Undock both Properties and Clips
    await act(async () => {
      editorActions.setPanelDocked('properties', false);
      editorActions.setPanelDocked('clips', false);
    });

    // Dropzone should be displayed in the right dock
    expect(container.textContent).toContain('Panel Dock');
    expect(container.textContent).toContain('All panels are currently undocked');

    const dockAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Dock All to Sidebar')
    );
    expect(dockAllBtn).toBeTruthy();

    // Click "Dock All to Sidebar"
    await act(async () => {
      dockAllBtn?.click();
    });

    expect(getEditorState().dockedPanels.properties).toBe(true);
    expect(getEditorState().dockedPanels.clips).toBe(true);
    expect(container.querySelector('[data-testid="docked-properties-panel"]')).toBeTruthy();
  });

  it('supports flyout menu (≡) with Undock/Dock, Collapse/Expand, and panel-specific actions', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const clipsPanel = container.querySelector('[data-testid="floating-clips-library"]') as HTMLElement;
    const flyoutBtn = Array.from(clipsPanel.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Panel Options')
    );
    expect(flyoutBtn).toBeTruthy();

    // Open flyout menu
    await act(async () => {
      flyoutBtn?.click();
    });

    // Menu options should be rendered
    expect(container.textContent).toContain('Undock to Floating Window');
    expect(container.textContent).toContain('Collapse Panel');
    expect(container.textContent).toContain('+ New Clip (F8)');
    expect(container.textContent).toContain('Insert to Stage');
    expect(container.textContent).toContain('Delete Clip');

    // Click "+ New Clip (F8)" from flyout menu
    const newClipBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ New Clip (F8)')
    );
    expect(newClipBtn).toBeTruthy();

    await act(async () => {
      newClipBtn?.click();
    });

    // A new clip was created in document library
    const state = getEditorState();
    expect(Object.keys(state.doc.library.symbols).length).toBeGreaterThan(0);
  });

  it('handles keyboard shortcut and store actions for toggling docked vs floating clips', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    // Currently docked and open
    expect(getEditorState().dockedPanels.clips).toBe(true);
    expect(getEditorState().isLibraryOpen).toBe(true);
    expect(getEditorState().collapsedPanels.clips).toBe(false);

    // Toggle library closes/collapses it
    await act(async () => {
      editorActions.toggleLibrary();
    });
    expect(getEditorState().isLibraryOpen).toBe(false);

    // Toggle again opens and uncollapses it
    await act(async () => {
      editorActions.toggleLibrary();
    });
    expect(getEditorState().isLibraryOpen).toBe(true);
    expect(getEditorState().collapsedPanels.clips).toBe(false);

    // Set floating and test position updates
    await act(async () => {
      editorActions.setPanelDocked('clips', false);
      editorActions.setFloatingPanelPosition('clips', { x: 500, y: 150 });
    });

    expect(getEditorState().floatingPanelPositions.clips).toEqual({ x: 500, y: 150 });
    expect(getEditorState().libraryPosition).toEqual({ x: 500, y: 150 });

    const floatingClips = container.querySelector('[data-testid="floating-clips-library"]') as HTMLElement;
    expect(floatingClips.style.left).toBe('500px');
    expect(floatingClips.style.top).toBe('150px');
  });
});
