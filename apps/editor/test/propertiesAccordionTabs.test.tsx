import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { Properties } from '../src/panels/Properties/Properties';
import { editorActions, getEditorState } from '../src/state/editorStore';
import type { ShapeElement, TextElement } from '@flashback/runtime';

describe('Properties Panel: Accordion Mode & Row-by-Row Layout', () => {
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

  it('renders Stage & Layers header with Target Chip and Expand/Collapse All button without category dropdown', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    // Target chip
    const chip = container.querySelector('[title="Stage & Layers"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('Stage & Layers');

    // Category dropdown should be removed
    const dropdown = container.querySelector(
      '[data-testid="properties-category-dropdown"]'
    );
    expect(dropdown).toBeNull();

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

  it('renders in Adobe accordion mode with all sections listed row-by-row filling space, and expand/collapse all functionality', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    // Verify NO vertical tabs rail is rendered
    expect(container.querySelector('[class*="verticalTabsRail"]')).toBeNull();

    // Verify category dropdown is absent
    expect(container.querySelector('[data-testid="properties-category-dropdown"]')).toBeNull();

    // Accordion sections are rendered directly row by row
    const dimsSection = container.querySelector('#stage-dimensions') as HTMLElement;
    const fpsSection = container.querySelector('#stage-fps') as HTMLElement;
    const bgSection = container.querySelector('#stage-background') as HTMLElement;
    expect(dimsSection).not.toBeNull();
    expect(fpsSection).not.toBeNull();
    expect(bgSection).not.toBeNull();

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

  it('renders all property boxes row-by-row directly without category filtering', async () => {
    await act(async () => {
      root.render(<Properties />);
    });

    // Verify all stage sections are mounted and rendered directly row-by-row
    const sectionIds = [
      'stage-dimensions',
      'stage-fps',
      'stage-background',
      'stage-breakpoints',
      'stage-reduced-motion',
      'stage-i18n',
    ];

    sectionIds.forEach((id) => {
      const el = container.querySelector(`#${id}`) as HTMLElement;
      expect(el).not.toBeNull();
      // Not hidden via category display: none
      expect(el.style.display).not.toBe('none');
    });

    // Ensure category dropdown is absent
    expect(container.querySelector('[data-testid="properties-category-dropdown"]')).toBeNull();
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

    // Ensure category dropdown is absent in element properties header
    expect(container.querySelector('[data-testid="properties-category-dropdown"]')).toBeNull();

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
