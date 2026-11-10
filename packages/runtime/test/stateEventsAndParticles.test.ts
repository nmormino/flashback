import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAnim } from '../src/WebAnim';
import { defineAnimation, type AnimDocument } from '../src/schema';

describe('Shared State, Custom Events, Dynamic Clip Spawning & Particles', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    if (!customElements.get('web-anim')) {
      customElements.define('web-anim', WebAnim);
    }
  });

  afterEach(() => {
    container.remove();
  });

  const testDoc: AnimDocument = defineAnimation({
    version: 1,
    meta: {
      name: 'State & Events Test',
      createdAt: '2026-11-10T12:00:00Z',
      modifiedAt: '2026-11-10T12:00:00Z',
      editorVersion: '0.1.0',
    },
    stage: {
      width: 500,
      height: 400,
      fps: 30,
      background: { type: 'solid', color: '#111827' },
      scaleMode: 'showAll',
    },
    stateVariables: [
      { id: 'var_1', name: 'score', type: 'number', defaultValue: 0, isPublic: true },
      { id: 'var_2', name: 'playerName', type: 'string', defaultValue: 'Player 1', isPublic: true },
      { id: 'var_3', name: 'secretKey', type: 'string', defaultValue: 'abc', isPublic: false },
    ],
    state: {
      score: 10,
    },
    library: {
      symbols: {
        sym_tumbleweed: {
          id: 'sym_tumbleweed',
          name: 'Tumbleweed',
          timeline: {
            frameCount: 10,
            fps: 30,
            layers: [
              {
                id: 'l_tw',
                name: 'Graphic',
                type: 'normal',
                visible: true,
                locked: false,
                keyframes: [
                  {
                    id: 'kf_tw',
                    index: 0,
                    duration: 10,
                    elements: [],
                  },
                ],
              },
            ],
          },
        },
      },
      fonts: {},
      bitmaps: {},
      sounds: {},
      videos: {},
    },
    root: {
      frameCount: 1,
      fps: 30,
      layers: [
        {
          id: 'layer_ui',
          name: 'UI',
          type: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf_main',
              index: 0,
              duration: 1,
              elements: [
                {
                  id: 'txt_score',
                  type: 'text',
                  mode: 'dynamic',
                  text: 'Score: {score}',
                  stateBinding: 'score',
                  fontId: '',
                  fontSize: 24,
                  color: '#ffffff',
                  align: 'left',
                  width: 200,
                  height: 30,
                  multiline: false,
                  selectable: false,
                  transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
                  alpha: 1,
                  visible: true,
                },
                {
                  id: 'txt_template',
                  type: 'text',
                  mode: 'dynamic',
                  text: 'Welcome {playerName}!',
                  fontId: '',
                  fontSize: 20,
                  color: '#ffffff',
                  align: 'left',
                  width: 250,
                  height: 30,
                  multiline: false,
                  selectable: false,
                  transform: { x: 20, y: 60, scaleX: 1, scaleY: 1, rotation: 0 },
                  alpha: 1,
                  visible: true,
                },
              ],
            },
          ],
        },
      ],
    },
  });

  it('initializes reactive state variables with default values and document overrides', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    expect(el.getState('score')).toBe(10);
    expect(el.getState('playerName')).toBe('Player 1');
    expect(el.getState('secretKey')).toBe('abc');
  });

  it('allows external prop injection via attribute state and property state', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    // Direct object assignment
    el.state = { score: 1000, playerName: 'Champion' };
    expect(el.getState('score')).toBe(1000);
    expect(el.getState('playerName')).toBe('Champion');

    // JSON string assignment
    el.state = JSON.stringify({ score: 2500 });
    expect(el.getState('score')).toBe(2500);

    // Protected variable (isPublic = false) is protected from external injection
    el.state = { secretKey: 'hacked' };
    expect(el.getState('secretKey')).toBe('abc');
  });

  it('automatically updates bound and template text elements when state changes', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    const shadow = el.shadowRoot!;
    const scoreTextEl = shadow.querySelector('[data-el-id="txt_score"]') as HTMLElement;
    const templateTextEl = shadow.querySelector('[data-el-id="txt_template"]') as HTMLElement;

    expect(scoreTextEl).toBeTruthy();
    expect(templateTextEl).toBeTruthy();

    // Initial state
    expect(scoreTextEl.textContent).toBe('10');
    expect(templateTextEl.textContent).toBe('Welcome Player 1!');

    // Update state
    el.setState({ score: 999, playerName: 'Neo' });

    expect(scoreTextEl.textContent).toBe('999');
    expect(templateTextEl.textContent).toBe('Welcome Neo!');
  });

  it('supports custom event broadcasting (emit) and listening (on) across clips and host DOM', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    const hostEventListener = vi.fn();
    const clipListener = vi.fn();

    // Listen on the host DOM element
    el.addEventListener('web-anim-event', (e: any) => {
      hostEventListener(e.detail);
    });

    // Listen via anim.on API
    el.on('tumbleweed', clipListener);

    // Broadcast event from animation / host
    el.emit('tumbleweed', { velocity: 15 });

    expect(clipListener).toHaveBeenCalledTimes(1);
    expect(clipListener).toHaveBeenCalledWith({ velocity: 15 });

    expect(hostEventListener).toHaveBeenCalledWith({
      name: 'tumbleweed',
      payload: { velocity: 15 },
    });
  });

  it('allows spawning dynamic library clips via spawnClip() at runtime', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    const pipeline = (el as any)._pipeline;
    const rootClip = pipeline.root;

    const spawned = rootClip.spawnClip('Tumbleweed', {
      x: 120,
      y: 180,
      scale: 1.5,
      rotation: 45,
    });

    expect(spawned).toBeTruthy();
    expect(spawned.x).toBe(120);
    expect(spawned.y).toBe(180);
    expect(spawned.scaleX).toBe(1.5);
    expect(spawned.scaleY).toBe(1.5);
    expect(spawned.rotation).toBe(45);
    expect(rootClip.numChildren).toBe(3);
    expect(rootClip.getChild(spawned.name)).toBe(spawned);
  });

  it('triggers particle engine via emitParticles() without errors', () => {
    const el = document.createElement('web-anim') as WebAnim;
    container.appendChild(el);
    el.animation = testDoc;

    // Should run smoothly without exceptions across presets
    expect(() => {
      el.emitParticles({ preset: 'splat', x: 200, y: 150 });
      el.emitParticles({ preset: 'burst', count: 50 });
      el.emitParticles({ preset: 'confetti' });
      el.emitParticles({ preset: 'sparks', angle: 45 });
    }).not.toThrow();
  });
});
