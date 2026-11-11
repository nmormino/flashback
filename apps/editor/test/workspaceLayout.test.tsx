import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { Workspace } from '../src/layout/Workspace';
import { editorActions, getEditorState } from '../src/state/editorStore';

describe('Workspace Layout Overhaul with react-resizable-panels', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it('renders modern desktop studio layout with Tools, Stage, Bottom Dock, and Right Inspector', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    // 1. Menu bar
    expect(container.textContent).toContain('Flashback Studio');
    expect(container.textContent).toContain('Test Movie');

    // 2. Left Tools panel (52px vertical toolbar)
    const tools = container.querySelector('[title*="Selection Tool"]') || container.querySelector('button[title*="Selection"]');
    expect(tools).toBeTruthy();

    // 3. Stage area with tab strip
    expect(container.textContent).toContain('Artboard 1');

    // 4. Bottom dock with tabs
    const timelineTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Timeline & Layers')
    );
    const scriptsTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Scripts')
    );
    expect(timelineTab).toBeTruthy();
    expect(scriptsTab).toBeTruthy();

    // 5. Right Inspector with permanently docked Properties
    expect(container.textContent).toContain('⚙ Properties');
    // Properties panel content is present
    expect(container.querySelector('[data-testid="properties-category-dropdown"]') || container.querySelector('[title="Stage & Layers"]')).toBeTruthy();

    // 6. Resizer handles exist
    const resizers = container.querySelectorAll('[data-panel-resize-handle-id]');
    expect(resizers.length).toBeGreaterThanOrEqual(2);
  });

  it('switches bottom dock tabs between Timeline & Layers and Scripts', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    const scriptsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Scripts')
    );
    expect(scriptsBtn).toBeTruthy();

    await act(async () => {
      scriptsBtn?.click();
    });

    expect(getEditorState().activeInspectorTab).toBe('scripts');
    // Scripts panel is rendered in bottom dock
    expect(container.textContent).toContain('Scripts');

    const timelineBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Timeline & Layers')
    );
    expect(timelineBtn).toBeTruthy();

    await act(async () => {
      timelineBtn?.click();
    });

    expect(getEditorState().activeInspectorTab).toBe('timeline');
  });

  it('supports editorActions.setActiveInspectorTab for timeline, scripts, and properties', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    act(() => {
      editorActions.setActiveInspectorTab('scripts');
    });
    expect(getEditorState().activeInspectorTab).toBe('scripts');

    act(() => {
      editorActions.setActiveInspectorTab('properties');
    });
    expect(getEditorState().activeInspectorTab).toBe('properties');
    expect(container.textContent).toContain('⚙ Properties');

    act(() => {
      editorActions.setActiveInspectorTab('timeline');
    });
    expect(getEditorState().activeInspectorTab).toBe('timeline');
  });

  it('supports expanding and collapsing the bottom dock and properties inspector', async () => {
    await act(async () => {
      root.render(<Workspace />);
    });

    // Inspector collapse toggle button
    const collapsePropsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Collapse Properties')
    );
    expect(collapsePropsBtn).toBeTruthy();

    // Click collapse
    await act(async () => {
      collapsePropsBtn?.click();
    });

    // Now button should offer to Expand Properties
    const expandPropsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('title')?.includes('Expand Properties')
    );
    expect(expandPropsBtn).toBeTruthy();

    // Click expand
    await act(async () => {
      expandPropsBtn?.click();
    });
    expect(container.textContent).toContain('⚙ Properties');
  });
});
