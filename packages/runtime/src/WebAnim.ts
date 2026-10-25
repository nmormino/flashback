import type { AnimDocument, FrameRef, MovieClipContext } from './schema';
import { TimelinePipeline, Timeline } from './player/Timeline';
import { Ticker } from './player/Ticker';
import { DomRenderer } from './render/DomRenderer';
import { fillToCSS } from './render/fills';

const STAGE_STYLES = `
  :host {
    display: block;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }

  .stage-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .stage-viewport {
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    transform-origin: center center;
  }

  /* scaleMode: showAll (default) - fits within stage container preserving aspect ratio */
  .stage-viewport[data-scale-mode="showAll"],
  :host([scale-mode="showAll"]) .stage-viewport {
    width: var(--stage-width, 100%);
    height: var(--stage-height, 100%);
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: var(--stage-aspect, auto);
    transform: scale(var(--stage-scale, 1));
  }

  /* scaleMode: noBorder - covers stage container preserving aspect ratio without borders */
  .stage-viewport[data-scale-mode="noBorder"],
  :host([scale-mode="noBorder"]) .stage-viewport {
    width: var(--stage-width, 100%);
    height: var(--stage-height, 100%);
    min-width: 100%;
    min-height: 100%;
    aspect-ratio: var(--stage-aspect, auto);
    transform: scale(var(--stage-scale, 1));
  }

  /* scaleMode: exactFit - stretches stage to 100% width and 100% height without preserving aspect ratio */
  .stage-viewport[data-scale-mode="exactFit"],
  :host([scale-mode="exactFit"]) .stage-viewport {
    width: 100%;
    height: 100%;
    transform: scale(var(--stage-scale-x, 1), var(--stage-scale-y, 1));
  }

  /* scaleMode: noScale - fixed 1:1 original stage pixel dimensions */
  .stage-viewport[data-scale-mode="noScale"],
  :host([scale-mode="noScale"]) .stage-viewport {
    width: var(--stage-width, 100%);
    height: var(--stage-height, 100%);
    flex-shrink: 0;
    transform: none;
  }
`;

/**
 * Custom Element `<web-anim>`: Standalone web component player for Flashback animations.
 * Provides Shadow DOM encapsulation, playhead controls, dynamic src loading,
 * and stage scale mode styling with zero runtime dependencies.
 */
export class WebAnim extends HTMLElement {
  public static readonly observedAttributes = ['src'];

  private _animation: AnimDocument | null = null;
  private _pipeline: TimelinePipeline | null = null;
  private _renderer: DomRenderer | null = null;
  private _ticker: Ticker | null = null;
  private _containerEl: HTMLElement | null = null;
  private _viewportEl: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _onResize: (() => void) | null = null;
  private _srcLoadingPromise: Promise<AnimDocument | null> | null = null;

  constructor() {
    super();
    this.initShadow();
  }

  private initShadow(): void {
    let shadow = this.shadowRoot;
    if (!shadow) {
      shadow = this.attachShadow({ mode: 'open' });
    }

    if (!shadow.querySelector('style[data-web-anim-style]')) {
      const style = document.createElement('style');
      style.setAttribute('data-web-anim-style', '');
      style.textContent = STAGE_STYLES;
      shadow.appendChild(style);
    }

    if (!shadow.querySelector('.stage-wrapper')) {
      this._containerEl = document.createElement('div');
      this._containerEl.className = 'stage-wrapper';

      this._viewportEl = document.createElement('div');
      this._viewportEl.className = 'stage-viewport';
      this._viewportEl.setAttribute('data-scale-mode', 'showAll');

      this._containerEl.appendChild(this._viewportEl);
      shadow.appendChild(this._containerEl);
    } else {
      this._containerEl = shadow.querySelector('.stage-wrapper');
      this._viewportEl = shadow.querySelector('.stage-viewport');
    }
  }

  public connectedCallback(): void {
    if (this._animation && !this._pipeline) {
      this.setupAnimation(this._animation);
    } else if (!this._animation && this.src) {
      this.loadSrc(this.src);
    }
  }

  public disconnectedCallback(): void {
    this.teardownRuntime();
  }

  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void {
    if (name === 'src' && newValue !== oldValue) {
      if (newValue) {
        this.loadSrc(newValue);
      } else {
        this.animation = null;
      }
    }
  }

  public get src(): string | null {
    return this.getAttribute('src');
  }

  public set src(value: string | null) {
    if (value === null) {
      this.removeAttribute('src');
    } else {
      this.setAttribute('src', value);
    }
  }

  public get animation(): AnimDocument | null {
    return this._animation;
  }

  public set animation(doc: AnimDocument | null) {
    if (this._animation === doc && this._pipeline) {
      return;
    }
    this.teardownRuntime();
    this._animation = doc;
    if (doc) {
      this.setupAnimation(doc);
    }
  }

  public get loadingPromise(): Promise<AnimDocument | null> | null {
    return this._srcLoadingPromise;
  }

  public async loadSrc(src: string): Promise<AnimDocument | null> {
    const promise = (async () => {
      try {
        const mod = await import(/* @vite-ignore */ src);
        const doc: AnimDocument = mod && mod.default ? mod.default : mod;
        this.animation = doc;
        return doc;
      } catch (err) {
        this.dispatchEvent(new CustomEvent('error', { detail: err }));
        return null;
      }
    })();
    this._srcLoadingPromise = promise;
    return promise;
  }

  // --- Playhead Controls ---

  public play(): void {
    if (this._pipeline) {
      this._pipeline.root.play();
    }
    if (this._ticker && !this._ticker.isRunning) {
      this._ticker.start();
    }
  }

  public stop(): void {
    if (this._pipeline) {
      this._pipeline.root.stop();
    }
  }

  public gotoAndPlay(frame: FrameRef): void {
    if (this._pipeline) {
      this._pipeline.root.gotoAndPlay(frame);
    }
    if (this._ticker && !this._ticker.isRunning) {
      this._ticker.start();
    }
  }

  public gotoAndStop(frame: FrameRef): void {
    if (this._pipeline) {
      this._pipeline.root.gotoAndStop(frame);
    }
  }

  // --- Runtime Inspection ---

  public get root(): MovieClipContext {
    return (this._pipeline ? this._pipeline.root.context : null) as MovieClipContext;
  }

  public get timeline(): Timeline | null {
    return this._pipeline?.rootTimeline ?? null;
  }

  public get ticker(): Ticker | null {
    return this._ticker;
  }

  public get pipeline(): TimelinePipeline | null {
    return this._pipeline;
  }

  public get renderer(): DomRenderer | null {
    return this._renderer;
  }

  public get currentFrame(): number {
    return this._pipeline?.root.currentFrame ?? 1;
  }

  public get totalFrames(): number {
    return this._pipeline?.root.totalFrames ?? 1;
  }

  public get isPlaying(): boolean {
    return this._pipeline?.root.isPlaying ?? false;
  }

  public get stageViewport(): HTMLElement | null {
    return this._viewportEl;
  }

  // --- Internal Lifecycle ---

  private setupAnimation(doc: AnimDocument): void {
    this.initShadow();
    if (!this._viewportEl) return;

    this._viewportEl.innerHTML = '';

    const stage = doc.stage;
    const width = stage.width;
    const height = stage.height;
    const scaleMode = stage.scaleMode || 'showAll';
    const bg = fillToCSS(stage.background, doc.library);

    // Apply stage styling custom properties
    this.style.setProperty('--stage-width', `${width}px`);
    this.style.setProperty('--stage-height', `${height}px`);
    this.style.setProperty('--stage-aspect', `${width} / ${height}`);
    this.style.setProperty('--stage-bg', bg);

    this._viewportEl.setAttribute('data-scale-mode', scaleMode);
    this.setAttribute('scale-mode', scaleMode);
    this._viewportEl.style.backgroundColor = bg;

    // 1. Create TimelinePipeline (instantiates root MovieClip & root Timeline)
    this._pipeline = new TimelinePipeline(doc);
    this._pipeline.init();

    // 2. Create DomRenderer inside the ShadowRoot
    this._renderer = new DomRenderer(this._viewportEl, { doc });
    this._renderer.attach(this._pipeline.root);

    // 3. Create Ticker
    this._ticker = new Ticker({
      fps: doc.stage.fps,
      onTick: () => {
        this._pipeline?.tick();
        this._renderer?.syncTextVariables();
      },
    });
    this._ticker.start();

    // 4. Update scale variables
    this.updateStageScale();
    this.setupResizeObserver();
  }

  private teardownRuntime(): void {
    // 1. Stop Ticker
    if (this._ticker) {
      this._ticker.stop();
      this._ticker = null;
    }

    // 2. Cancel running animations in Shadow DOM
    if (this.shadowRoot && typeof (this.shadowRoot as any).getAnimations === 'function') {
      try {
        const anims = (this.shadowRoot as any).getAnimations();
        for (const anim of anims) {
          if (anim && typeof anim.cancel === 'function') {
            anim.cancel();
          }
        }
      } catch {
        // Safe guard against partial DOM environments
      }
    }

    // 3. Destroy root timeline & clips
    if (this._pipeline) {
      this._pipeline.root.destroy();
      this._pipeline = null;
    }

    // 4. Detach DomRenderer
    if (this._renderer) {
      this._renderer.detach();
      this._renderer = null;
    }

    // 5. Clean up DOM inside viewport
    if (this._viewportEl) {
      this._viewportEl.innerHTML = '';
    }

    // 6. Cleanup observers & listeners
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (typeof window !== 'undefined' && this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined' && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this.updateStageScale();
      });
      this._resizeObserver.observe(this);
    }
    if (typeof window !== 'undefined' && !this._onResize) {
      this._onResize = () => this.updateStageScale();
      window.addEventListener('resize', this._onResize);
    }
  }

  private updateStageScale(): void {
    if (!this._animation || !this._viewportEl) return;
    const stage = this._animation.stage;
    const sw = stage.width;
    const sh = stage.height;
    if (!sw || !sh) return;

    const cw = this.clientWidth;
    const ch = this.clientHeight;

    if (cw > 0 && ch > 0) {
      const scaleX = cw / sw;
      const scaleY = ch / sh;
      const scaleFit = Math.min(scaleX, scaleY);
      const scaleCover = Math.max(scaleX, scaleY);

      const mode = stage.scaleMode || 'showAll';
      let s = 1;
      let sx = 1;
      let sy = 1;

      if (mode === 'showAll') {
        s = scaleFit;
        sx = s;
        sy = s;
      } else if (mode === 'noBorder') {
        s = scaleCover;
        sx = s;
        sy = s;
      } else if (mode === 'exactFit') {
        sx = scaleX;
        sy = scaleY;
      } else if (mode === 'noScale') {
        s = 1;
        sx = 1;
        sy = 1;
      }

      this.style.setProperty('--stage-scale', String(s));
      this.style.setProperty('--stage-scale-x', String(sx));
      this.style.setProperty('--stage-scale-y', String(sy));
    } else {
      this.style.setProperty('--stage-scale', '1');
      this.style.setProperty('--stage-scale-x', '1');
      this.style.setProperty('--stage-scale-y', '1');
    }
  }
}

/**
 * Helper to register `<web-anim>` custom element with an optional tag name override.
 */
export function registerWebAnim(tagName = 'web-anim'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    try {
      customElements.define(tagName, WebAnim);
    } catch {
      // If WebAnim constructor is already registered in this registry, subclass to allow custom tag name
      class CustomWebAnim extends WebAnim {}
      customElements.define(tagName, CustomWebAnim);
    }
  }
}

// Auto-register `<web-anim>` if running in a custom-element-enabled environment
if (typeof customElements !== 'undefined' && !customElements.get('web-anim')) {
  customElements.define('web-anim', WebAnim);
}

declare global {
  interface HTMLElementTagNameMap {
    'web-anim': WebAnim;
  }
}
