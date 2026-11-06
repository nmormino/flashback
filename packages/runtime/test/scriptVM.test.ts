import { describe, it, expect, vi } from 'vitest';
import { ScriptVM } from '../src/script/ScriptVM';
import { DomRenderer } from '../src/render/DomRenderer';
import { MovieClip } from '../src/display/MovieClip';
import { DisplayObject } from '../src/display/DisplayObject';
import type { ShapeElement, AnimDocument } from '../src/schema';

describe('ScriptVM & Event Execution Sandbox', () => {
  it('provides safe browser globals (alert, confirm, console, Math, Date, JSON) and Flashback runtime APIs', () => {
    const alertSpy = vi.fn();
    const mockContext = {
      x: 10,
      y: 20,
      isPlaying: true,
      play: vi.fn(),
      stop: vi.fn(),
      gotoAndPlay: vi.fn(),
      gotoAndStop: vi.fn(),
      getInstance: vi.fn((id: string) => ({ id })),
    };

    const code = `
      alert('hello world');
      stop();
      play();
      gotoAndPlay(3);
      gotoAndStop(5);
      const child = getInstance('btn1');
      this.x += 15;
      const jsonStr = JSON.stringify({ ok: true, now: typeof Date.now() });
      const parsed = JSON.parse(jsonStr);
      const val = Math.max(x, 100);
      this.y = val;
    `;

    const compiled = ScriptVM.compile(code);
    compiled.call(mockContext, { type: 'test' });

    // In node/test, ScriptVM fallback or window.alert
    expect(mockContext.stop).toHaveBeenCalled();
    expect(mockContext.play).toHaveBeenCalled();
    expect(mockContext.gotoAndPlay).toHaveBeenCalledWith(3);
    expect(mockContext.gotoAndStop).toHaveBeenCalledWith(5);
    expect(mockContext.getInstance).toHaveBeenCalledWith('btn1');
    expect(mockContext.x).toBe(25);
    expect(mockContext.y).toBe(100);
  });

  it('wires up hover and click events on shape elements in DomRenderer', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Test', createdAt: '', modifiedAt: '', editorVersion: '1' },
      stage: {
        width: 550,
        height: 400,
        fps: 24,
        background: { type: 'solid', color: '#ffffff' },
        scaleMode: 'showAll',
      },
      library: { symbols: {}, fonts: {}, bitmaps: {}, sounds: {}, videos: {} },
      root: { frameCount: 1, layers: [] },
    };

    const rootClip = new MovieClip('root');
    const shapeObj = new DisplayObject('myShape');
    shapeObj.id = 'shape_1';

    const hoverSpy = vi.fn();
    const clickSpy = vi.fn();

    shapeObj.on('onPointerEnter', hoverSpy);
    shapeObj.on('onClick', clickSpy);

    const shapeDef: ShapeElement = {
      id: 'shape_1',
      type: 'shape',
      paths: [{ d: 'M0 0 L50 0 L50 50 Z', fill: { type: 'solid', color: '#ff0000' } }],
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      alpha: 1,
      visible: true,
      events: {
        onPointerEnter: hoverSpy as any,
        onClick: clickSpy as any,
      },
    };
    shapeObj.currentDef = shapeDef;
    rootClip.addChild(shapeObj);

    const renderer = new DomRenderer(container, { doc });
    renderer.attach(rootClip);

    const wrapper = container.querySelector('[data-el-id="shape_1"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.cursor).toBe('pointer');
    expect(wrapper.style.pointerEvents).toBe('auto');

    // Trigger hover (pointerenter)
    wrapper.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
    expect(hoverSpy).toHaveBeenCalledTimes(1);

    // Trigger mouseenter (should deduplicate within window)
    wrapper.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(hoverSpy).toHaveBeenCalledTimes(1);

    // Trigger click
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    renderer.detach();
    container.remove();
  });
});
