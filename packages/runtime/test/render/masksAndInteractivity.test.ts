// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { DomRenderer } from '../../src/render/DomRenderer';
import { MovieClip } from '../../src/display/MovieClip';
import { DisplayObject } from '../../src/display/DisplayObject';
import type { AnimDocument, ShapeElement, TextElement } from '../../src/schema';

describe('Layer Masks, Interactivity & i18n in DomRenderer', () => {
  it('registers SVG clipPath for mask layer and applies clip-path to masked layer', () => {
    const maskShape: ShapeElement = {
      id: 'mask_shape',
      type: 'shape',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: 'M 0 0 H 100 V 100 Z' }],
    };

    const targetShape: ShapeElement = {
      id: 'target_shape',
      type: 'shape',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      alpha: 1,
      visible: true,
      paths: [{ d: 'M 0 0 H 200 V 200 Z' }],
    };

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Mask Doc', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      root: {
        frameCount: 1,
        layers: [
          {
            id: 'mask_layer',
            name: 'Mask',
            kind: 'mask',
            visible: true,
            locked: false,
            keyframes: [{ id: 'kf_mask', index: 0, duration: 1, elements: [maskShape] }],
          },
          {
            id: 'content_layer',
            name: 'Content',
            kind: 'normal',
            maskLayerId: 'mask_layer',
            visible: true,
            locked: false,
            keyframes: [{ id: 'kf_content', index: 0, duration: 1, elements: [targetShape] }],
          },
        ],
      },
    };

    const container = document.createElement('div');
    const renderer = new DomRenderer(container, { doc });

    const rootClip = new MovieClip('root');
    const maskObj = new DisplayObject('maskObj');
    maskObj.id = 'mask_shape';
    maskObj.layerId = 'mask_layer';
    maskObj.layerKind = 'mask';

    const contentObj = new DisplayObject('contentObj');
    contentObj.id = 'target_shape';
    contentObj.layerId = 'content_layer';
    contentObj.maskLayerId = 'mask_layer';

    rootClip.addChild(maskObj);
    rootClip.addChild(contentObj);

    renderer.attach(rootClip);

    // Verify clipPath in defs
    const clipPath = container.querySelector('defs #mask_mask_layer');
    expect(clipPath).not.toBeNull();
    expect(clipPath?.querySelector('path')?.getAttribute('d')).toBe('M 0 0 H 100 V 100 Z');

    // Verify mask object wrapper is hidden
    const maskWrapper = renderer.getNode(maskObj);
    expect(maskWrapper).toBeDefined();
    expect(maskWrapper?.style.opacity).toBe('0');
    expect(maskWrapper?.style.pointerEvents).toBe('none');

    // Verify content object wrapper has clip-path
    const contentWrapper = renderer.getNode(contentObj);
    expect(contentWrapper).toBeDefined();
    expect(contentWrapper?.style.clipPath).toBe('url(#mask_mask_layer)');
  });

  it('dispatches pointer events to DisplayObject and sets pointer cursor on buttons', () => {
    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'Events Doc', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
      library: {
        symbols: {
          btnSym: {
            id: 'btnSym',
            name: 'ButtonSym',
            kind: 'button',
            registration: { x: 0, y: 0 },
            timeline: { frameCount: 4, layers: [] },
          },
        },
        audio: {},
        fonts: {},
        bitmaps: {},
      },
      root: { frameCount: 1, layers: [] },
    };

    const container = document.createElement('div');
    const renderer = new DomRenderer(container, { doc });

    const btnClip = new MovieClip('btn');
    btnClip.symbolDef = doc.library.symbols.btnSym;

    const onPressSpy = vi.fn();
    const onReleaseSpy = vi.fn();
    const onRollOverSpy = vi.fn();
    const onRollOutSpy = vi.fn();

    btnClip.on('onPress', onPressSpy);
    btnClip.on('onRelease', onReleaseSpy);
    btnClip.on('onRollOver', onRollOverSpy);
    btnClip.on('onRollOut', onRollOutSpy);

    const wrapper = renderer.attach(btnClip);

    // Check cursor
    expect(wrapper.style.cursor).toBe('pointer');
    expect(wrapper.style.pointerEvents).toBe('auto');

    // Dispatch DOM pointer events
    wrapper.dispatchEvent(new Event('pointerdown'));
    expect(onPressSpy).toHaveBeenCalledTimes(1);

    wrapper.dispatchEvent(new Event('pointerup'));
    expect(onReleaseSpy).toHaveBeenCalledTimes(1);

    wrapper.dispatchEvent(new Event('pointerenter'));
    expect(onRollOverSpy).toHaveBeenCalledTimes(1);

    wrapper.dispatchEvent(new Event('pointerleave'));
    expect(onRollOutSpy).toHaveBeenCalledTimes(1);
  });

  it('renders i18n translated text and dynamically updates when locale changes', () => {
    const textEl: TextElement = {
      id: 'txt1',
      type: 'text',
      mode: 'static',
      text: 'Hello Default',
      i18nKey: 'greeting',
      fontId: 'f1',
      fontSize: 16,
      color: '#000',
      align: 'left',
      width: 200,
      height: 50,
      multiline: false,
      selectable: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
      alpha: 1,
      visible: true,
    };

    const doc: AnimDocument = {
      version: 1,
      meta: { name: 'i18n Doc', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
      stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#fff' }, scaleMode: 'showAll' },
      library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: { greeting: 'Hello World!' },
          es: { greeting: '¡Hola Mundo!' },
          fr: { greeting: 'Bonjour le Monde!' },
        },
      },
      root: {
        frameCount: 1,
        layers: [
          {
            id: 'l1',
            name: 'TextLayer',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [{ id: 'kf1', index: 0, duration: 1, elements: [textEl] }],
          },
        ],
      },
    };

    const container = document.createElement('div');
    const renderer = new DomRenderer(container, { doc });
    const rootClip = new MovieClip('root');
    const textObj = new DisplayObject('textObj');
    textObj.id = 'txt1';
    rootClip.addChild(textObj);

    renderer.attach(rootClip);

    // Initial locale is 'en'
    expect(rootClip.vars.__locale).toBe('en');
    const textNode = container.querySelector('[data-el-id="txt1"]')?.firstElementChild;
    expect(textNode?.textContent).toBe('Hello World!');

    // Switch locale to 'es'
    renderer.setLocale('es');
    expect(rootClip.vars.__locale).toBe('es');
    expect(textNode?.textContent).toBe('¡Hola Mundo!');

    // Switch locale to 'fr'
    renderer.setLocale('fr');
    expect(rootClip.vars.__locale).toBe('fr');
    expect(textNode?.textContent).toBe('Bonjour le Monde!');
  });
});
