// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAnim, registerWebAnim } from '../src/WebAnim';
import { CanvasRenderer } from '../src/render/CanvasRenderer';
import { DomRenderer } from '../src/render/DomRenderer';
import { interactiveBallDoc } from './fixtures/interactiveBallDoc';
import type { AnimDocument } from '../src/schema';

describe('WebAnim Custom Element (<web-anim>)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('custom element registration', () => {
    it('is registered in customElements registry as web-anim', () => {
      expect(customElements.get('web-anim')).toBe(WebAnim);
    });

    it('can be instantiated via document.createElement', () => {
      const el = document.createElement('web-anim');
      expect(el).toBeInstanceOf(WebAnim);
    });

    it('can be instantiated via new WebAnim()', () => {
      const el = new WebAnim();
      expect(el).toBeInstanceOf(WebAnim);
    });

    it('creates an open ShadowRoot in constructor', () => {
      const el = new WebAnim();
      expect(el.shadowRoot).toBeDefined();
      expect(el.shadowRoot?.mode).toBe('open');
    });

    it('supports registerWebAnim with custom tag name', () => {
      registerWebAnim('custom-web-anim');
      const CustomClass = customElements.get('custom-web-anim');
      expect(CustomClass).toBeDefined();
      const el = document.createElement('custom-web-anim');
      expect(el).toBeInstanceOf(WebAnim);
    });
  });

  describe('animation document mounting and shadow root structure', () => {
    it('creates stage wrapper and stage viewport inside Shadow DOM', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      const shadow = el.shadowRoot!;
      const wrapper = shadow.querySelector('.stage-wrapper');
      const viewport = shadow.querySelector('.stage-viewport');

      expect(wrapper).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(wrapper?.contains(viewport)).toBe(true);
      expect(el.stageViewport).toBe(viewport);
    });

    it('applies stylesheet with stage styles and scaleMode definitions to ShadowRoot', () => {
      const el = document.createElement('web-anim') as WebAnim;
      const shadow = el.shadowRoot!;
      const style = shadow.querySelector('style[data-web-anim-style]');

      expect(style).not.toBeNull();
      const css = style?.textContent ?? '';
      expect(css).toContain('scaleMode: showAll');
      expect(css).toContain('scaleMode: noBorder');
      expect(css).toContain('scaleMode: exactFit');
      expect(css).toContain('scaleMode: noScale');
      expect(css).toContain('data-scale-mode="showAll"');
      expect(css).toContain('data-scale-mode="noBorder"');
      expect(css).toContain('data-scale-mode="exactFit"');
      expect(css).toContain('data-scale-mode="noScale"');
    });

    it('setting el.animation creates Ticker, Timeline, and DomRenderer', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      expect(el.ticker).toBeNull();
      expect(el.pipeline).toBeNull();
      expect(el.renderer).toBeNull();

      el.animation = interactiveBallDoc;

      expect(el.animation).toBe(interactiveBallDoc);
      expect(el.ticker).not.toBeNull();
      expect(el.pipeline).not.toBeNull();
      expect(el.renderer).not.toBeNull();
      expect(el.timeline).not.toBeNull();
      expect(el.ticker?.isRunning).toBe(true);
    });

    it('renders stage viewport with background, dimensions, and data-scale-mode', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const viewport = el.stageViewport!;
      expect(viewport.getAttribute('data-scale-mode')).toBe('showAll');
      expect(el.getAttribute('scale-mode')).toBe('showAll');
      expect(el.style.getPropertyValue('--stage-width')).toBe('550px');
      expect(el.style.getPropertyValue('--stage-height')).toBe('400px');
      expect(el.style.getPropertyValue('--stage-aspect')).toBe('550 / 400');
      expect(el.style.getPropertyValue('--stage-bg')).toBe('#1a1a1a');
    });

    it('renders SVG defs and root MovieClip inside the stage viewport', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const shadow = el.shadowRoot!;
      const svgDefsHost = shadow.querySelector('svg');
      expect(svgDefsHost).not.toBeNull();
      expect(svgDefsHost?.querySelector('defs')).not.toBeNull();

      const rootNode = shadow.querySelector('[data-name="root"]');
      expect(rootNode).not.toBeNull();
      expect(el.stageViewport?.contains(rootNode)).toBe(true);

      // Verify child instances from interactiveBallDoc
      const ballNode = shadow.querySelector('[data-name="ball"]');
      const btnNode = shadow.querySelector('[data-name="btn"]');
      expect(ballNode).not.toBeNull();
      expect(btnNode).not.toBeNull();

      // Verify nested symbol inside ball
      const highlightNode = shadow.querySelector('[data-name="highlight"]');
      expect(highlightNode).not.toBeNull();
      expect(ballNode?.contains(highlightNode)).toBe(true);
    });
  });

  describe('scaleMode CSS handling', () => {
    it.each(['showAll', 'noBorder', 'exactFit', 'noScale'] as const)(
      'applies data-scale-mode="%s" on stage viewport and host attribute',
      (mode) => {
        const doc: AnimDocument = {
          ...interactiveBallDoc,
          stage: {
            ...interactiveBallDoc.stage,
            scaleMode: mode,
          },
        };

        const el = document.createElement('web-anim') as WebAnim;
        container.appendChild(el);
        el.animation = doc;

        expect(el.stageViewport?.getAttribute('data-scale-mode')).toBe(mode);
        expect(el.getAttribute('scale-mode')).toBe(mode);
      }
    );
  });

  describe('playhead control & scripts', () => {
    it('provides getter root: MovieClipContext and executes frame 1 actions', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.root).toBeDefined();

      // interactiveBallDoc frame 1 script calls `this.ball.gotoAndStop(2)`
      // Verify that child 'ball' is on frame 2 and stopped
      const ball = el.root.ball;
      expect(ball).toBeDefined();
      expect(ball.currentFrame).toBe(2);
      expect(ball.isPlaying).toBe(false);
      expect(ball.currentLabel).toBe('blue');
    });

    it('controls playhead with play(), stop(), gotoAndStop(), and gotoAndPlay()', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      // Initially playing root
      expect(el.isPlaying).toBe(true);

      // el.stop()
      el.stop();
      expect(el.isPlaying).toBe(false);
      expect(el.root.isPlaying).toBe(false);

      // el.play()
      el.play();
      expect(el.isPlaying).toBe(true);
      expect(el.root.isPlaying).toBe(true);

      // el.gotoAndStop(3)
      el.gotoAndStop(3);
      expect(el.currentFrame).toBe(3);
      expect(el.isPlaying).toBe(false);

      // el.gotoAndPlay(1)
      el.gotoAndPlay(1);
      expect(el.currentFrame).toBe(1);
      expect(el.isPlaying).toBe(true);
    });

    it('allows external script to interact with child MovieClip through el.root', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      // Ball was placed at frame 2 by onInit/frame 1 script
      expect(el.root.ball.currentFrame).toBe(2);

      // Host script moves ball to frame 3
      el.root.ball.gotoAndStop(3);
      expect(el.root.ball.currentFrame).toBe(3);
      expect(el.root.ball.currentLabel).toBe('green');

      // Move ball to frame 1
      el.root.ball.gotoAndStop(1);
      expect(el.root.ball.currentFrame).toBe(1);
      expect(el.root.ball.currentLabel).toBe('red');
    });

    it('handles button event interaction', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      // Reset ball to frame 1
      el.root.ball.gotoAndStop(1);
      expect(el.root.ball.currentFrame).toBe(1);

      // Trigger button onPress which calls this.parent.ball.gotoAndStop(2)
      el.root.btn.emit('onPress');

      expect(el.root.ball.currentFrame).toBe(2);
      expect(el.root.ball.isPlaying).toBe(false);
    });

    it('advances frames via ticker step', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      el.gotoAndPlay(1);
      expect(el.currentFrame).toBe(1);

      el.ticker?.step();
      expect(el.currentFrame).toBe(2);

      el.ticker?.step();
      expect(el.currentFrame).toBe(3);
    });
  });

  describe('disconnect and cleanup lifecycle', () => {
    it('cleans up Ticker, animations, pipeline, and DOM when disconnected', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const ticker = el.ticker;
      expect(ticker?.isRunning).toBe(true);
      expect(el.shadowRoot?.querySelector('[data-name="root"]')).not.toBeNull();

      // Trigger disconnectedCallback by removing element
      el.remove();

      expect(ticker?.isRunning).toBe(false);
      expect(el.ticker).toBeNull();
      expect(el.pipeline).toBeNull();
      expect(el.renderer).toBeNull();
      expect(el.stageViewport?.innerHTML).toBe('');
      expect(el.shadowRoot?.querySelector('[data-name="root"]')).toBeNull();
    });

    it('re-initializes when reconnected to the DOM', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      el.remove();
      expect(el.pipeline).toBeNull();

      // Reconnect
      container.appendChild(el);

      expect(el.pipeline).not.toBeNull();
      expect(el.ticker?.isRunning).toBe(true);
      expect(el.shadowRoot?.querySelector('[data-name="root"]')).not.toBeNull();
    });

    it('cleans up runtime when animation property is set to null', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.pipeline).not.toBeNull();
      el.animation = null;

      expect(el.animation).toBeNull();
      expect(el.pipeline).toBeNull();
      expect(el.ticker).toBeNull();
      expect(el.stageViewport?.innerHTML).toBe('');
    });
  });

  describe('src attribute and dynamic loading', () => {
    it('reflects src attribute and property', () => {
      const el = document.createElement('web-anim') as WebAnim;
      expect(el.src).toBeNull();

      el.src = './test.anim.js';
      expect(el.getAttribute('src')).toBe('./test.anim.js');
      expect(el.src).toBe('./test.anim.js');

      el.src = null;
      expect(el.hasAttribute('src')).toBe(false);
      expect(el.src).toBeNull();
    });

    it('loads animation dynamically when loadSrc is invoked', async () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      // Test loadSrc directly with fixture module
      const fixturePath = './test/fixtures/interactiveBallDoc';
      const doc = await el.loadSrc(fixturePath);

      expect(doc).toBeDefined();
      expect(el.animation).toBeDefined();
      expect(el.pipeline).not.toBeNull();
      expect(el.root.ball).toBeDefined();
    });

    it('loads animation dynamically when src attribute is set', async () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      el.setAttribute('src', './test/fixtures/interactiveBallDoc');
      await el.loadingPromise;

      expect(el.animation).toBeDefined();
      expect(el.pipeline).not.toBeNull();
      expect(el.root.ball).toBeDefined();
    });

    it('handles invalid src gracefully and emits error event', async () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);

      const errorHandler = vi.fn();
      el.addEventListener('error', errorHandler);

      const result = await el.loadSrc('/nonexistent/path/module.js');
      expect(result).toBeNull();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('scale-mode, reduced-motion, poster-frame, and locale attributes and properties', () => {
    it('observes the expected attributes', () => {
      expect(WebAnim.observedAttributes).toEqual([
        'src',
        'scale-mode',
        'reduced-motion',
        'poster-frame',
        'locale',
        'strings',
        'translations',
        'state',
        'state-machine',
        'renderer',
        'breakpoint',
      ]);
    });

    it('manages scaleMode property and attribute reflection', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.scaleMode).toBe('showAll');
      el.scaleMode = 'noBorder';
      expect(el.getAttribute('scale-mode')).toBe('noBorder');
      expect(el.stageViewport?.getAttribute('data-scale-mode')).toBe('noBorder');

      el.setAttribute('scale-mode', 'exactFit');
      expect(el.scaleMode).toBe('exactFit');
      expect(el.stageViewport?.getAttribute('data-scale-mode')).toBe('exactFit');
    });

    it('manages reducedMotion and posterFrame properties and attributes', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.reducedMotion).toBe('auto');
      expect(el.posterFrame).toBe(1);

      el.reducedMotion = 'fixed';
      expect(el.getAttribute('reduced-motion')).toBe('fixed');

      el.posterFrame = 3;
      expect(el.getAttribute('poster-frame')).toBe('3');

      expect(el.currentFrame).toBe(3);
      expect(el.isPlaying).toBe(false);
    });

    it('manages locale property and translates rendered text', () => {
      const i18nDoc: AnimDocument = {
        ...interactiveBallDoc,
        i18n: {
          defaultLocale: 'en',
          locales: {
            en: { title: 'Hello' },
            de: { title: 'Hallo' },
          },
        },
      };

      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = i18nDoc;

      expect(el.locale).toBe('en');
      expect(el.root.vars.__locale).toBe('en');

      el.locale = 'de';
      expect(el.getAttribute('locale')).toBe('de');
      expect(el.root.vars.__locale).toBe('de');

      el.setAttribute('locale', 'en');
      expect(el.locale).toBe('en');
      expect(el.root.vars.__locale).toBe('en');
    });

    it('supports case-insensitive locale matching like EN-US and en-US', () => {
      const i18nDoc: AnimDocument = {
        ...interactiveBallDoc,
        root: {
          ...interactiveBallDoc.root,
          layers: [
            {
              id: 'text-layer',
              name: 'Text',
              keyframes: [
                {
                  index: 0,
                  duration: 24,
                  elements: [
                    {
                      id: 'txt-1',
                      type: 'text',
                      text: 'Default Hello',
                      i18nKey: 'welcome_msg',
                      transform: { x: 50, y: 50 },
                      fontId: 'default',
                      fontSize: 16,
                      color: '#ffffff',
                      selectable: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        i18n: {
          defaultLocale: 'en-US',
          locales: {
            'en-US': { welcome_msg: 'Welcome to Flashback' },
            'es-ES': { welcome_msg: 'Bienvenido a Flashback' },
          },
        },
      };

      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('locale', 'EN-US');
      container.appendChild(el);
      el.animation = i18nDoc;

      const txtEl = el.shadowRoot?.querySelector('[data-el-id="txt-1"]');
      expect(txtEl?.textContent).toBe('Welcome to Flashback');

      // Switch to ES-ES (all uppercase)
      el.setAttribute('locale', 'ES-ES');
      expect(txtEl?.textContent).toBe('Bienvenido a Flashback');
    });

    it('supports getTextStrings() and setTextStrings() for third-party CMS dynamic translation swapping', () => {
      const i18nDoc: AnimDocument = {
        ...interactiveBallDoc,
        root: {
          ...interactiveBallDoc.root,
          layers: [
            {
              id: 'text-layer',
              name: 'Text',
              keyframes: [
                {
                  index: 0,
                  duration: 24,
                  elements: [
                    {
                      id: 'txt-1',
                      type: 'text',
                      text: 'Buy Now',
                      i18nKey: 'cta_button',
                      transform: { x: 50, y: 50 },
                      fontId: 'default',
                      fontSize: 16,
                      color: '#ffffff',
                      selectable: false,
                    },
                    {
                      id: 'txt-2',
                      type: 'text',
                      text: 'Summer Sale',
                      i18nKey: 'headline',
                      transform: { x: 50, y: 80 },
                      fontId: 'default',
                      fontSize: 20,
                      color: '#ffffff',
                      selectable: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        i18n: {
          defaultLocale: 'en-US',
          locales: {
            'en-US': { cta_button: 'Buy Now', headline: 'Summer Sale' },
            'fr-FR': { cta_button: 'Acheter maintenant', headline: 'Soldes d’été' },
          },
        },
      };

      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('locale', 'en-US');
      container.appendChild(el);
      el.animation = i18nDoc;

      // 1. Check getTextStrings()
      const stringsEn = el.getTextStrings();
      expect(stringsEn).toEqual({
        cta_button: 'Buy Now',
        headline: 'Summer Sale',
      });

      const stringsFr = el.getTextStrings('fr-FR');
      expect(stringsFr).toEqual({
        cta_button: 'Acheter maintenant',
        headline: 'Soldes d’été',
      });

      // 2. Test setTextStrings({ ... }) CMS injection
      const txt1 = el.shadowRoot?.querySelector('[data-el-id="txt-1"]');
      const txt2 = el.shadowRoot?.querySelector('[data-el-id="txt-2"]');
      expect(txt1?.textContent).toBe('Buy Now');
      expect(txt2?.textContent).toBe('Summer Sale');

      // Swap strings via document.querySelector('#anim').setTextStrings({...})
      el.setTextStrings({
        cta_button: 'Claim 50% Off Today!',
        headline: 'Black Friday Sale',
      });

      expect(txt1?.textContent).toBe('Claim 50% Off Today!');
      expect(txt2?.textContent).toBe('Black Friday Sale');

      // 3. Test passing strings attribute as JSON prop
      el.setAttribute('strings', JSON.stringify({ cta_button: 'Shop Flash Deal' }));
      expect(txt1?.textContent).toBe('Shop Flash Deal');
    });
  });

  describe('Canvas Renderer Mode (<web-anim renderer="canvas">)', () => {
    let originalGetContext: any;
    let originalPath2D: any;
    let originalDpr: number;

    class MockCanvasContext {
      public canvas: HTMLCanvasElement;
      public calls: Array<{ method: string; args: any[] }> = [];
      public fillStyle: any = '#000000';
      public strokeStyle: any = '#000000';
      public globalAlpha = 1;
      public globalCompositeOperation = 'source-over';

      constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
      }

      public save() {
        this.calls.push({ method: 'save', args: [] });
      }

      public restore() {
        this.calls.push({ method: 'restore', args: [] });
      }

      public setTransform(...args: any[]) {
        this.calls.push({ method: 'setTransform', args });
      }

      public transform(...args: any[]) {
        this.calls.push({ method: 'transform', args });
      }

      public clearRect(...args: any[]) {
        this.calls.push({ method: 'clearRect', args });
      }

      public fillRect(...args: any[]) {
        this.calls.push({ method: 'fillRect', args });
      }

      public beginPath() {
        this.calls.push({ method: 'beginPath', args: [] });
      }

      public fill(...args: any[]) {
        this.calls.push({ method: 'fill', args });
      }

      public stroke(...args: any[]) {
        this.calls.push({ method: 'stroke', args });
      }

      public clip(...args: any[]) {
        this.calls.push({ method: 'clip', args });
      }

      public fillText(...args: any[]) {
        this.calls.push({ method: 'fillText', args });
      }

      public strokeText(...args: any[]) {
        this.calls.push({ method: 'strokeText', args });
      }

      public drawImage(...args: any[]) {
        this.calls.push({ method: 'drawImage', args });
      }

      public measureText(text: string) {
        return { width: text.length * 10 };
      }

      public createLinearGradient(...args: any[]) {
        return { addColorStop: vi.fn() };
      }

      public createRadialGradient(...args: any[]) {
        return { addColorStop: vi.fn() };
      }

      public setLineDash(...args: any[]) {}
      public getLineDash() {
        return [];
      }
    }

    class MockPath2D {
      public d?: string;
      constructor(d?: string) {
        this.d = d;
      }
    }

    beforeEach(() => {
      originalGetContext = HTMLCanvasElement.prototype.getContext;
      originalPath2D = (globalThis as any).Path2D;
      originalDpr = window.devicePixelRatio;

      (globalThis as any).Path2D = MockPath2D;
      (window as any).Path2D = MockPath2D;

      HTMLCanvasElement.prototype.getContext = function (contextId: string) {
        if (contextId === '2d') {
          if (!(this as any)._mockCtx) {
            (this as any)._mockCtx = new MockCanvasContext(this);
          }
          return (this as any)._mockCtx;
        }
        return null;
      } as any;
    });

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      (globalThis as any).Path2D = originalPath2D;
      (window as any).Path2D = originalPath2D;
      window.devicePixelRatio = originalDpr;
    });

    it('instantiating <web-anim renderer="canvas"> creates <canvas role="img"> and CanvasRenderer', () => {
      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.rendererMode).toBe('canvas');
      expect(el.renderer).toBeInstanceOf(CanvasRenderer);
      expect(el.canvasRenderer).toBeInstanceOf(CanvasRenderer);
      expect(el.domRenderer).toBeNull();
      expect(el.canvas).toBeInstanceOf(HTMLCanvasElement);

      const canvas = el.shadowRoot?.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
      expect(canvas).not.toBeNull();
      expect(canvas).toBe(el.canvas);
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBe('interactive-ball');
    });

    it('supports setting rendererMode property directly and toggling back to dom', () => {
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.rendererMode = 'canvas';
      expect(el.getAttribute('renderer')).toBe('canvas');

      el.animation = interactiveBallDoc;
      expect(el.renderer).toBeInstanceOf(CanvasRenderer);
      expect(el.canvas).not.toBeNull();

      // Toggle back to dom
      el.rendererMode = 'dom';
      expect(el.getAttribute('renderer')).toBe('dom');
      expect(el.renderer).toBeInstanceOf(DomRenderer);
      expect(el.canvas).toBeNull();
      expect(el.shadowRoot?.querySelector('canvas.stage-canvas')).toBeNull();
    });

    it('supports default renderer mode configured via stage.renderer in document', () => {
      const canvasStageDoc: AnimDocument = {
        ...interactiveBallDoc,
        stage: {
          ...interactiveBallDoc.stage,
          renderer: 'canvas',
        },
      };

      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = canvasStageDoc;

      expect(el.rendererMode).toBe('canvas');
      expect(el.renderer).toBeInstanceOf(CanvasRenderer);
      expect(el.canvas).not.toBeNull();
    });

    it('resizing updates canvas width/height with devicePixelRatio (auto-DPR)', () => {
      window.devicePixelRatio = 2;
      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const canvas = el.canvas!;
      expect(canvas).not.toBeNull();
      expect(canvas.width).toBe(550 * 2);
      expect(canvas.height).toBe(400 * 2);
      expect(canvas.style.width).toBe('550px');
      expect(canvas.style.height).toBe('400px');

      // Update to DPR 3 and trigger resize
      window.devicePixelRatio = 3;
      el.handleResize();

      expect(canvas.width).toBe(550 * 3);
      expect(canvas.height).toBe(400 * 3);
      expect(canvas.style.width).toBe('550px');
      expect(canvas.style.height).toBe('400px');
    });

    it('accessible DOM fallback contains animation text for screen readers', () => {
      const i18nDoc: AnimDocument = {
        version: '0.1.0' as any,
        meta: { name: 'Accessible Demo Animation', createdAt: '', modifiedAt: '', editorVersion: '0.1.0' },
        stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#000000' }, scaleMode: 'showAll' },
        library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
        root: {
          frameCount: 24,
          layers: [
            {
              id: 'layer-text',
              name: 'Text',
              keyframes: [
                {
                  index: 0,
                  duration: 24,
                  elements: [
                    {
                      id: 'txt-1',
                      type: 'text',
                      text: 'Play Game',
                      i18nKey: 'btn_play',
                      transform: { x: 50, y: 50 },
                      fontId: 'default',
                      fontSize: 16,
                      color: '#ffffff',
                      selectable: false,
                    },
                    {
                      id: 'txt-static',
                      type: 'text',
                      text: 'Press Space to Jump',
                      transform: { x: 50, y: 100 },
                      fontId: 'default',
                      fontSize: 14,
                      color: '#cccccc',
                      selectable: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        i18n: {
          defaultLocale: 'en',
          locales: {
            en: { btn_play: 'Play Game' },
            es: { btn_play: 'Jugar' },
          },
        },
      };

      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = i18nDoc;

      const fallback = el.canvas?.querySelector('.flashback-sr-fallback') as HTMLElement;
      expect(fallback).not.toBeNull();
      expect(fallback.classList.contains('sr-only')).toBe(true);
      expect(fallback.style.position).toBe('absolute');
      expect(fallback.style.width).toBe('1px');
      expect(fallback.style.height).toBe('1px');
      expect(fallback.style.overflow).toBe('hidden');
      expect(fallback.style.clip).toMatch(/rect\(0(?:px)?, ?0(?:px)?, ?0(?:px)?, ?0(?:px)?\)/);
      expect(fallback.style.whiteSpace).toBe('nowrap');

      // Contains animation name and text strings
      expect(fallback.textContent).toContain('Accessible Demo Animation');
      expect(fallback.textContent).toContain('Play Game');
      expect(fallback.textContent).toContain('Press Space to Jump');

      // Dynamic update via setTextStrings
      el.setTextStrings({ btn_play: 'Start Adventure' });
      expect(fallback.textContent).toContain('Start Adventure');

      // Dynamic update via locale change
      el.locale = 'es';
      expect(fallback.textContent).toContain('Jugar');
    });

    it('ticker step updates canvas rendering', () => {
      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const renderSpy = vi.spyOn(el.canvasRenderer!, 'render');
      expect(renderSpy).not.toHaveBeenCalled();

      // Step ticker
      el.ticker?.step();
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // gotoAndStop advances frame and re-renders immediately
      renderSpy.mockClear();
      el.gotoAndStop(2);
      expect(el.currentFrame).toBe(2);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // gotoAndPlay resumes and re-renders
      renderSpy.mockClear();
      el.gotoAndPlay(1);
      expect(el.currentFrame).toBe(1);
      expect(el.isPlaying).toBe(true);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('switching between artboards and frames works identically in canvas mode', () => {
      const artboardCanvasDoc: AnimDocument = {
        version: '0.1.0' as any,
        meta: { name: 'Canvas Artboards Test', createdAt: '', modifiedAt: '', editorVersion: '0.1.0' },
        stage: {
          width: 550,
          height: 400,
          fps: 24,
          background: { type: 'solid', color: '#111111' },
          scaleMode: 'showAll',
          renderer: 'canvas',
        },
        library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
        root: {
          frameCount: 10,
          layers: [
            {
              id: 'l1',
              name: 'Layer 1',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf1',
                  index: 0,
                  duration: 10,
                  elements: [
                    {
                      id: 'txt-art-1',
                      type: 'text',
                      text: 'Artboard 1 Title',
                      transform: { x: 10, y: 10 },
                      fontId: 'default',
                      fontSize: 16,
                      color: '#ffffff',
                      selectable: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        artboards: [
          {
            id: 'ab-1',
            name: 'Desktop',
            width: 550,
            height: 400,
            background: { type: 'solid', color: '#111111' },
            root: {
              frameCount: 10,
              layers: [
                {
                  id: 'l1',
                  name: 'Layer 1',
                  kind: 'normal',
                  visible: true,
                  locked: false,
                  keyframes: [
                    {
                      id: 'kf1',
                      index: 0,
                      duration: 10,
                      elements: [
                        {
                          id: 'txt-art-1',
                          type: 'text',
                          text: 'Artboard 1 Title',
                          transform: { x: 10, y: 10 },
                          fontId: 'default',
                          fontSize: 16,
                          color: '#ffffff',
                          selectable: false,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: 'ab-2',
            name: 'Tablet',
            width: 800,
            height: 600,
            background: { type: 'solid', color: '#222222' },
            root: {
              frameCount: 10,
              layers: [
                {
                  id: 'l2',
                  name: 'Layer 2',
                  kind: 'normal',
                  visible: true,
                  locked: false,
                  keyframes: [
                    {
                      id: 'kf2',
                      index: 0,
                      duration: 10,
                      elements: [
                        {
                          id: 'txt-art-2',
                          type: 'text',
                          text: 'Artboard 2 Tablet Content',
                          transform: { x: 20, y: 20 },
                          fontId: 'default',
                          fontSize: 18,
                          color: '#ffff00',
                          selectable: false,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
        activeArtboardId: 'ab-1',
      };

      window.devicePixelRatio = 1;
      const el = document.createElement('web-anim') as WebAnim;
      container.appendChild(el);
      el.animation = artboardCanvasDoc;

      expect(el.activeArtboardId).toBe('ab-1');
      expect(el.canvas?.width).toBe(550);
      expect(el.canvas?.height).toBe(400);

      // Switch to artboard 2
      let artboardChanged = false;
      el.addEventListener('artboardchange', (e: any) => {
        if (e.detail.artboardId === 'ab-2') artboardChanged = true;
      });

      el.gotoArtboard('ab-2');
      expect(artboardChanged).toBe(true);
      expect(el.activeArtboardId).toBe('ab-2');
      expect(el.canvas?.width).toBe(800);
      expect(el.canvas?.height).toBe(600);

      // Accessible fallback updated with new artboard contents
      const fallback = el.canvas?.querySelector('.flashback-sr-fallback');
      expect(fallback?.textContent).toContain('Artboard 2 Tablet Content');

      // Frame switching on target artboard
      el.gotoAndStop(4);
      expect(el.currentFrame).toBe(4);
    });

    it('pauses rendering when off-screen via IntersectionObserver and resumes when visible', () => {
      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      expect(el.ticker?.isRunning).toBe(true);
      expect(el.isVisible).toBe(true);

      // Scrolled off-screen -> pauses ticker to consume 0% CPU/GPU
      el.handleIntersection(false);
      expect(el.isVisible).toBe(false);
      expect(el.ticker?.isRunning).toBe(false);

      // Calling play() while off-screen does not start ticker
      el.play();
      expect(el.ticker?.isRunning).toBe(false);

      // Scrolled back into view -> resumes ticker and renders canvas
      const renderSpy = vi.spyOn(el.canvasRenderer!, 'render');
      el.handleIntersection(true);
      expect(el.isVisible).toBe(true);
      expect(el.ticker?.isRunning).toBe(true);
      expect(renderSpy).toHaveBeenCalled();
    });

    it('gracefully tears down runtime and clears canvas references on destroy() or disconnect', () => {
      const el = document.createElement('web-anim') as WebAnim;
      el.setAttribute('renderer', 'canvas');
      container.appendChild(el);
      el.animation = interactiveBallDoc;

      const canvasRenderer = el.canvasRenderer!;
      const detachSpy = vi.spyOn(canvasRenderer, 'detach');

      el.destroy();

      expect(detachSpy).toHaveBeenCalled();
      expect(el.ticker).toBeNull();
      expect(el.pipeline).toBeNull();
      expect(el.renderer).toBeNull();
      expect(el.canvasRenderer).toBeNull();
      expect(el.canvas).toBeNull();
      expect(el.stageViewport?.innerHTML).toBe('');
    });
  });
});
