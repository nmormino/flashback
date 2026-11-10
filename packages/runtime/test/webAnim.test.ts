// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAnim, registerWebAnim } from '../src/WebAnim';
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
});
