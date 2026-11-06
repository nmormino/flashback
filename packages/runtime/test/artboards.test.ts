import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AnimDocument } from '../src/schema';
import { WebAnim, registerWebAnim } from '../src/WebAnim';
import { ScriptVM } from '../src/script/ScriptVM';

registerWebAnim();

describe('Phase 5: Runtime Artboards, Navigation & Transitions', () => {
  let player: WebAnim;

  const createTestDoc = (): AnimDocument => ({
    version: 1,
    meta: {
      name: 'Multi-Artboard Doc',
      createdAt: '2026-11-05T00:00:00.000Z',
      modifiedAt: '2026-11-05T00:00:00.000Z',
      editorVersion: '1.0.0',
    },
    stage: {
      width: 600,
      height: 400,
      fps: 24,
      background: { type: 'solid', color: '#111111' },
      scaleMode: 'showAll',
    },
    library: {
      symbols: {},
      audio: {},
      fonts: {},
      bitmaps: {},
    },
    artboards: [
      {
        id: 'ab-home',
        name: 'Home Artboard',
        width: 800,
        height: 600,
        background: { type: 'solid', color: '#1e293b' },
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
                      id: 'btn_next',
                      instanceName: 'btn_next',
                      type: 'shape',
                      alpha: 1,
                      visible: true,
                      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      paths: [],
                      events: {
                        onClick: function (this: any) {
                          this.gotoArtboard('ab-details', { type: 'fade', duration: 200 });
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        id: 'ab-details',
        name: 'Details Artboard',
        width: 400,
        height: 800,
        background: { type: 'solid', color: '#0f172a' },
        root: {
          frameCount: 20,
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
                  duration: 20,
                  elements: [],
                },
              ],
            },
          ],
        },
      },
    ],
    activeArtboardId: 'ab-home',
    root: {
      frameCount: 10,
      layers: [],
    },
  });

  beforeEach(() => {
    player = document.createElement('web-anim') as WebAnim;
    document.body.appendChild(player);
  });

  afterEach(() => {
    player.remove();
  });

  it('initializes on the activeArtboardId and applies artboard dimensions and background', () => {
    player.animation = createTestDoc();
    expect(player.activeArtboardId).toBe('ab-home');
    expect(player.style.getPropertyValue('--stage-width')).toBe('800px');
    expect(player.style.getPropertyValue('--stage-height')).toBe('600px');
    expect(player.totalFrames).toBe(10);
  });

  it('player.gotoArtboard(id) navigates and swaps stage dimensions & timeline', () => {
    player.animation = createTestDoc();
    player.gotoArtboard('ab-details');

    expect(player.activeArtboardId).toBe('ab-details');
    expect(player.style.getPropertyValue('--stage-width')).toBe('400px');
    expect(player.style.getPropertyValue('--stage-height')).toBe('800px');
    expect(player.totalFrames).toBe(20);
  });

  it('player.gotoArtboard(name) supports lookup by artboard name case-insensitively', () => {
    player.animation = createTestDoc();
    player.gotoArtboard('details artboard');

    expect(player.activeArtboardId).toBe('ab-details');
  });

  it('script API gotoArtboard switches artboard from element event handler', () => {
    player.animation = createTestDoc();
    expect(player.activeArtboardId).toBe('ab-home');

    // Trigger onClick on btn_next MovieClip/DisplayObject
    const rootClip = player.root as any;
    const btn = rootClip.btn_next;
    expect(btn).toBeDefined();

    btn.emit('onClick');

    expect(player.activeArtboardId).toBe('ab-details');
    expect(player.style.getPropertyValue('--stage-width')).toBe('400px');
    expect(player.style.getPropertyValue('--stage-height')).toBe('800px');
  });

  it('ScriptVM sandbox exposes gotoArtboard globally', () => {
    let visitedArtboard = '';
    const mockContext = {
      gotoArtboard: (id: string) => {
        visitedArtboard = id;
      },
    };

    ScriptVM.execute("gotoArtboard('ab-test', { type: 'slide' });", mockContext);
    expect(visitedArtboard).toBe('ab-test');
  });

  it('bypasses transition animations when reducedMotion is active', () => {
    player.setAttribute('reduced-motion', 'fixed');
    player.animation = createTestDoc();

    let artboardChangeEventFired = false;
    player.addEventListener('artboardchange', (e: any) => {
      artboardChangeEventFired = true;
      expect(e.detail.artboardId).toBe('ab-details');
    });

    player.gotoArtboard('ab-details', { type: 'slide', duration: 500 });

    expect(player.activeArtboardId).toBe('ab-details');
    expect(artboardChangeEventFired).toBe(true);
  });
});
