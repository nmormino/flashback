import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GradientPicker } from '../src/ui/GradientPicker';
import { Tools } from '../src/panels/Tools/Tools';
import { editorActions, getEditorState } from '../src/state/editorStore';
import type { Fill } from '@flashback/runtime';

describe('Color Picker Transparent Preselect Option', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    editorActions.newDocument();
    document.body.innerHTML = '';
  });

  it('renders None tab and preselects Transparent', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onChangeMock = vi.fn();

    await act(async () => {
      root.render(
        <GradientPicker
          fill={{ type: 'solid', color: '#ff0000' }}
          onChange={onChangeMock}
        />
      );
    });

    // Check tab-none exists
    const noneTab = document.querySelector('[data-testid="tab-none"]') as HTMLButtonElement;
    expect(noneTab).toBeTruthy();

    // Check transparent preselect button exists
    const transparentBtn = document.querySelector(
      '[data-testid="transparent-preselect-btn"]'
    ) as HTMLButtonElement;
    expect(transparentBtn).toBeTruthy();

    // Check transparent swatch in solid palette exists
    const transparentSwatch = document.querySelector(
      '[data-testid="transparent-palette-swatch"]'
    ) as HTMLButtonElement;
    expect(transparentSwatch).toBeTruthy();

    // Click None Tab
    await act(async () => {
      noneTab.click();
    });
    expect(onChangeMock).toHaveBeenCalledWith({ type: 'none' });

    // Click Transparent Preselect Button
    await act(async () => {
      transparentBtn.click();
    });
    expect(onChangeMock).toHaveBeenCalledWith({ type: 'none' });

    // Click Transparent Swatch
    await act(async () => {
      transparentSwatch.click();
    });
    expect(onChangeMock).toHaveBeenCalledWith({ type: 'none' });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders None section when fill is { type: "none" } and allows switching to solid', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onChangeMock = vi.fn();

    await act(async () => {
      root.render(
        <GradientPicker
          fill={{ type: 'none' }}
          onChange={onChangeMock}
        />
      );
    });

    const noneSection = document.querySelector('[data-testid="none-section"]');
    expect(noneSection).toBeTruthy();
    expect(noneSection?.textContent).toContain('Transparent / No Fill');

    // Click "Add Solid Color"
    const addSolidBtn = noneSection?.querySelector('button') as HTMLButtonElement;
    expect(addSolidBtn).toBeTruthy();
    expect(addSolidBtn.textContent).toContain('Add Solid Color');

    await act(async () => {
      addSolidBtn.click();
    });

    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'solid' })
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('Tools toolbar provides quick Transparent / None fill action and updates activeFill', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Tools />);
    });

    // Check quick None button exists
    const toolsNoneBtn = container.querySelector(
      '[data-testid="tools-none-fill-btn"]'
    ) as HTMLButtonElement;
    expect(toolsNoneBtn).toBeTruthy();

    // Click quick None button
    await act(async () => {
      toolsNoneBtn.click();
    });

    // EditorStore activeFill should be { type: 'none' }
    const state = getEditorState();
    expect(state.activeFill).toEqual({ type: 'none' });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
