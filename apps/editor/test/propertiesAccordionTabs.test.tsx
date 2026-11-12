import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { Properties } from '../src/panels/Properties/Properties';
import { editorActions, getEditorState } from '../src/state/editorStore';
import type { ShapeElement, TextElement } from '@flashback/runtime';

describe('Properties Panel: Accordion, Vertical Tabs & Category Dropdown', () => {
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

  it('renders Stage & Layers header with Target Chip, Category Dropdown, and Expand/Collapse All button', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    // Target chip
    const chip = container.querySelector('[title="Stage & Layers"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('Stage & Layers');

    // Category dropdown
    const dropdown = container.querySelector(
      '[data-testid="properties-category-dropdown"]'
    ) as HTMLSelectElement;
    expect(dropdown).not.toBeNull();
    expect(dropdown.value).toBe('all');
    expect(dropdown.options.length).toBeGreaterThan(3);

    // Toggle all button
    const toggleAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Collapse All') || b.textContent?.includes('Expand All')
    );
    expect(toggleAllBtn).not.toBeNull();

    // Verify tabs view mode button and rail are eliminated
    const tabsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tabs')
    );
    expect(tabsBtn).toBeUndefined();
    expect(container.querySelector('[class*="verticalTabsRail"]')).toBeNull();
  });

  it('renders in Adobe accordion mode with category dropdown and expand/collapse all functionality, with NO tabs rail', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    // Verify NO vertical tabs rail is rendered
    expect(container.querySelector('[class*="verticalTabsRail"]')).toBeNull();

    // Accordion sections are rendered directly
    const dimsSection = container.querySelector('#stage-dimensions') as HTMLElement;
    expect(dimsSection).not.toBeNull();
    const body = dimsSection.querySelector('[class*="accordionBody"]') as HTMLElement;
    expect(body.style.display).toBe('flex');

    // Toggle all button collapses and expands all sections
    const toggleAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Collapse All')
    ) as HTMLButtonElement;
    expect(toggleAllBtn).not.toBeNull();

    await act(async () => {
      toggleAllBtn.click();
    });
    expect(body.style.display).toBe('none');
    expect(toggleAllBtn.textContent).toContain('Expand All');

    await act(async () => {
      toggleAllBtn.click();
    });
    expect(body.style.display).toBe('flex');
    expect(toggleAllBtn.textContent).toContain('Collapse All');
  });

  it('filters visible sections via Category Dropdown while keeping elements queryable in DOM', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    const dropdown = container.querySelector(
      '[data-testid="properties-category-dropdown"]'
    ) as HTMLSelectElement;

    // Filter to "layout" (Breakpoints)
    await act(async () => {
      dropdown.value = 'layout';
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const bpSection = container.querySelector('#stage-breakpoints') as HTMLElement;
    expect(bpSection).not.toBeNull();
    expect(bpSection.style.display).not.toBe('none');

    // Stage dimensions section should be hidden via style.display="none" but remains mounted in DOM
    const dimsSection = container.querySelector('#stage-dimensions') as HTMLElement;
    expect(dimsSection).not.toBeNull();
    expect(dimsSection.style.display).toBe('none');

    // Reset back to all
    await act(async () => {
      dropdown.value = 'all';
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(dimsSection.style.display).not.toBe('none');
  });

  it('supports accordion toggle of individual sections and Expand All / Collapse All', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    const dimsSection = container.querySelector('#stage-dimensions') as HTMLElement;
    const header = dimsSection.querySelector('[class*="accordionHeader"]') as HTMLElement;
    const body = dimsSection.querySelector('[class*="accordionBody"]') as HTMLElement;

    expect(body.style.display).toBe('flex');

    // Click header to collapse
    await act(async () => {
      header.click();
    });
    expect(body.style.display).toBe('none');

    // Click again to expand
    await act(async () => {
      header.click();
    });
    expect(body.style.display).toBe('flex');

    // Toggle All button
    const toggleAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Collapse All')
    ) as HTMLButtonElement;
    expect(toggleAllBtn).not.toBeNull();

    await act(async () => {
      toggleAllBtn.click();
    });
    expect(body.style.display).toBe('none');
    expect(toggleAllBtn.textContent).toContain('Expand All');

    await act(async () => {
      toggleAllBtn.click();
    });
    expect(body.style.display).toBe('flex');
    expect(toggleAllBtn.textContent).toContain('Collapse All');
  });

  it('renders all shape data-testids when a Rectangle is selected', async () => {
    // Add a rectangle element
    const rectShape: ShapeElement = {
      id: 'rect_1',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [
        {
          d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
          fill: { type: 'solid', color: '#3b82f6' },
          stroke: { fill: { type: 'solid', color: '#000000' }, width: 2 },
        },
      ],
      rectConfig: {
        width: 100,
        height: 100,
        cornerRadius: 10,
        cornerType: 'round',
      },
    };

    const doc = getEditorState().doc;
    doc.root.layers[0].keyframes[0].elements.push(rectShape);
    editorActions.selectElement('rect_1');

    await act(async () => {
      root.render(<Properties />);
    });

    // Check Rectangle live corners section
    expect(container.querySelector('[data-testid="rectangle-corners-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rect-corner-radius-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rect-corners-unlink-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rect-corner-preset-pill"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rect-corner-preset-inverted"]')).not.toBeNull();

    // Fill & Stroke swatches and pickers
    expect(container.querySelector('[data-testid="shape-fill-swatch"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="shape-stroke-swatch"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="shape-fill-picker-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="shape-stroke-picker-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="element-id-input"]')).not.toBeNull();
  });

  it('renders star data-testids when a Star/Polygon is selected', async () => {
    const starShape: ShapeElement = {
      id: 'poly_star_test',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [
        {
          d: 'M 50 0 L 60 35 L 98 35 L 67 57 L 79 91 L 50 70 L 21 91 L 33 57 L 2 35 L 40 35 Z',
          fill: { type: 'solid', color: '#f59e0b' },
          stroke: { fill: { type: 'solid', color: '#000000' }, width: 1 },
        },
      ],
      starConfig: {
        points: 5,
        pointRatio: 0.5,
        cornerRadius: 5,
      },
    };

    const doc = getEditorState().doc;
    doc.root.layers[0].keyframes[0].elements.push(starShape);
    editorActions.selectElement('poly_star_test');

    await act(async () => {
      root.render(<Properties />);
    });

    expect(container.querySelector('[data-testid="star-polygon-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-points-numberfield"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-points-slider"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-ratio-numberfield"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-ratio-slider"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-radius-numberfield"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-radius-slider"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-preset-pentagram"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-preset-hexagram"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-preset-badge"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-preset-sunburst"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="star-preset-burst"]')).not.toBeNull();
  });

  it('renders text data-testids when a Text element is selected', async () => {
    const textElement: TextElement = {
      id: 'text_1',
      type: 'text',
      text: 'Flashback',
      transform: { x: 40, y: 40, scaleX: 1, scaleY: 1, rotation: 0 },
      fontSize: 24,
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { fill: { type: 'solid', color: '#ff0000' }, width: 1 },
      textType: 'path',
      pathConfig: {
        pathData: 'M 0 50 Q 100 0 200 50',
        startOffset: 15,
      },
    };

    const doc = getEditorState().doc;
    doc.root.layers[0].keyframes[0].elements.push(textElement);
    editorActions.selectElement('text_1');

    await act(async () => {
      root.render(<Properties />);
    });

    expect(container.querySelector('[data-testid="text-fill-swatch"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-stroke-swatch"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-type-point"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-type-path"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-type-area"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-path-select"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-start-offset-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-start-offset-slider"]')).not.toBeNull();
  });
});
