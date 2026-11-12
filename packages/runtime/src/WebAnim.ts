import type {
  AnimDocument,
  FrameRef,
  MovieClipContext,
  ReducedMotionMode,
  Artboard,
  ArtboardTransition,
  ParticleEmitterOptions,
  StateMachineDef,
} from './schema';
import { TimelinePipeline, Timeline } from './player/Timeline';
import { Ticker } from './player/Ticker';
import { DomRenderer } from './render/DomRenderer';
import { CanvasRenderer } from './render/CanvasRenderer';
import { fillToCSS } from './render/fills';
import { resolveI18nText } from './render/text';
import { StateMachineRunner } from './state/StateMachineRunner';

const STAGE_STYLES = `
  :host {
    display: block;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    pointer-events: auto;
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
    pointer-events: auto;
  }

  .stage-viewport {
    width: var(--stage-width, 550px);
    height: var(--stage-height, 400px);
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    transform-origin: center center;
    transform: scale(var(--stage-scale-x, 1), var(--stage-scale-y, 1));
    pointer-events: auto;
  }

  /* scaleMode: showAll (default) - fits within stage container preserving aspect ratio */
  .stage-viewport[data-scale-mode="showAll"],
  :host([scale-mode="showAll"]) .stage-viewport {
    transform: scale(var(--stage-scale-x, 1), var(--stage-scale-y, 1));
  }

  /* scaleMode: noBorder - covers stage container preserving aspect ratio without borders */
  .stage-viewport[data-scale-mode="noBorder"],
  :host([scale-mode="noBorder"]) .stage-viewport {
    transform: scale(var(--stage-scale-x, 1), var(--stage-scale-y, 1));
  }

  /* scaleMode: exactFit - stretches stage to 100% width and 100% height without preserving aspect ratio */
  .stage-viewport[data-scale-mode="exactFit"],
  :host([scale-mode="exactFit"]) .stage-viewport {
    transform: scale(var(--stage-scale-x, 1), var(--stage-scale-y, 1));
  }

  /* scaleMode: noScale - fixed 1:1 original stage pixel dimensions */
  .stage-viewport[data-scale-mode="noScale"],
  :host([scale-mode="noScale"]) .stage-viewport {
    transform: none;
  }

  .stage-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
  }

  .flashback-sr-fallback {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
`;

const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

/**
 * Custom Element `<web-anim>`: Standalone web component player for Flashback animations.
 * Provides Shadow DOM encapsulation, playhead controls, dynamic src loading,
 * and stage scale mode styling with zero runtime dependencies.
 */
export class WebAnim extends HTMLElementBase {
  public static readonly observedAttributes = [
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
  ];

  private _animation: AnimDocument | null = null;
  private _pipeline: TimelinePipeline | null = null;
  private _activeBreakpointId: string | null = null;
  private _renderer: DomRenderer | CanvasRenderer | null = null;
  private _domRenderer: DomRenderer | null = null;
  private _canvasRenderer: CanvasRenderer | null = null;
  private _canvasEl: HTMLCanvasElement | null = null;
  private _fallbackEl: HTMLElement | null = null;
  private _rendererMode?: 'canvas' | 'dom';
  private _ticker: Ticker | null = null;
  private _containerEl: HTMLElement | null = null;
  private _viewportEl: HTMLElement | null = null;
  private _particleCanvas: HTMLCanvasElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _intersectionObserver: IntersectionObserver | null = null;
  private _isVisible = true;
  private _onResize: (() => void) | null = null;
  private _srcLoadingPromise: Promise<AnimDocument | null> | null = null;
  private _reducedMotion: ReducedMotionMode = 'auto';
  private _posterFrame = 1;
  private _locale = 'en';
  private _initialState?: Record<string, any>;
  private _stateMachine = '';
  private _stateMachineRunner: StateMachineRunner | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private _pointerListeners: Array<[EventTarget, string, EventListener]> = [];

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
    if (newValue === oldValue) return;
    if (name === 'src') {
      if (newValue) {
        this.loadSrc(newValue);
      } else {
        this.animation = null;
      }
    } else if (name === 'scale-mode') {
      this._viewportEl?.setAttribute('data-scale-mode', newValue || 'showAll');
      this.updateStageScale();
    } else if (name === 'reduced-motion') {
      this._reducedMotion = (newValue as ReducedMotionMode) || 'auto';
      this._pipeline?.setReducedMotion(this._reducedMotion);
    } else if (name === 'poster-frame') {
      this._posterFrame = newValue ? Number(newValue) : 1;
      this._pipeline?.setPosterFrame(this._posterFrame);
    } else if (name === 'locale') {
      this._locale = newValue || 'en';
      if (this._pipeline) this._pipeline.root.vars.__locale = this._locale;
      this._renderer?.setLocale(this._locale);
      this._renderer?.syncTextVariables();
      if (this._canvasRenderer && this._isVisible) {
        this._canvasRenderer.render();
      }
      this.updateAccessibleFallback();
    } else if (name === 'renderer') {
      const mode = (newValue === 'canvas' || newValue === 'dom') ? newValue : undefined;
      if (this._rendererMode !== mode) {
        this._rendererMode = mode;
        if (this._animation && this._pipeline) {
          this.setupAnimation(this._animation);
        }
      }
    } else if (name === 'strings' || name === 'translations') {
      if (newValue) {
        try {
          const parsed = JSON.parse(newValue);
          this.setTextStrings(parsed);
        } catch (err) {
          console.warn(`[web-anim] Failed to parse ${name} attribute JSON:`, err);
        }
      }
    } else if (name === 'state') {
      if (newValue) {
        try {
          const parsed = JSON.parse(newValue);
          this.setState(parsed);
        } catch (err) {
          console.warn('[web-anim] Failed to parse state attribute JSON:', err);
        }
      }
    } else if (name === 'state-machine') {
      this._stateMachine = newValue || '';
      if (this._animation && this._pipeline) {
        this.setupStateMachine(this._animation);
      }
    } else if (name === 'breakpoint') {
      this._activeBreakpointId = newValue;
      this.updateStageScale();
    }
  }

  public get activeBreakpointId(): string | null {
    return this._activeBreakpointId;
  }

  public set activeBreakpointId(val: string | null) {
    this._activeBreakpointId = val;
    this.updateStageScale();
  }

  public setBreakpoint(breakpointId: string | null): void {
    this.activeBreakpointId = breakpointId;
  }

  public get scaleMode(): 'showAll' | 'noBorder' | 'exactFit' | 'noScale' {
    return (this.getAttribute('scale-mode') as any) || this._animation?.stage.scaleMode || 'showAll';
  }

  public set scaleMode(val: 'showAll' | 'noBorder' | 'exactFit' | 'noScale') {
    if (val) {
      this.setAttribute('scale-mode', val);
    } else {
      this.removeAttribute('scale-mode');
    }
  }

  public get reducedMotion(): ReducedMotionMode {
    return (this.getAttribute('reduced-motion') as ReducedMotionMode) || this._reducedMotion;
  }

  public set reducedMotion(val: ReducedMotionMode) {
    this._reducedMotion = val;
    if (val) {
      this.setAttribute('reduced-motion', val);
    } else {
      this.removeAttribute('reduced-motion');
    }
    this._pipeline?.setReducedMotion(val);
  }

  public get posterFrame(): number {
    return Number(this.getAttribute('poster-frame')) || this._posterFrame;
  }

  public set posterFrame(val: number) {
    this._posterFrame = val;
    this.setAttribute('poster-frame', String(val));
    this._pipeline?.setPosterFrame(val);
  }

  public get locale(): string {
    return this.getAttribute('locale') || this._locale;
  }

  public set locale(val: string) {
    this._locale = val;
    if (val) {
      this.setAttribute('locale', val);
    } else {
      this.removeAttribute('locale');
    }
    if (this._pipeline) this._pipeline.root.vars.__locale = val;
    this._renderer?.setLocale(val);
    this._renderer?.syncTextVariables();
    if (this._canvasRenderer && this._isVisible) {
      this._canvasRenderer.render();
    }
    this.updateAccessibleFallback();
  }

  public get rendererMode(): 'canvas' | 'dom' {
    const attr = this.getAttribute('renderer');
    if (attr === 'canvas' || attr === 'dom') {
      return attr;
    }
    if (this._rendererMode) {
      return this._rendererMode;
    }
    if (this._animation?.stage?.renderer) {
      return this._animation.stage.renderer;
    }
    return 'dom';
  }

  public set rendererMode(val: 'canvas' | 'dom') {
    if (val === 'canvas' || val === 'dom') {
      this._rendererMode = val;
      this.setAttribute('renderer', val);
    } else {
      this._rendererMode = undefined;
      this.removeAttribute('renderer');
    }
    if (this._animation && this._pipeline) {
      this.setupAnimation(this._animation);
    }
  }

  /**
   * Keyed strings dictionary for the current active locale.
   * Getting returns `getTextStrings()`.
   * Setting merges the object or parses JSON string via `setTextStrings()`.
   */
  public get strings(): Record<string, string> {
    return this.getTextStrings();
  }

  public set strings(val: Record<string, any> | string) {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        this.setTextStrings(parsed);
      } catch (err) {
        console.warn('[web-anim] Failed to parse strings property JSON:', err);
      }
    } else if (val && typeof val === 'object') {
      this.setTextStrings(val);
    }
  }

  /**
   * Full multi-locale dictionary (`doc.i18n.locales`).
   */
  public get translations(): Record<string, Record<string, string>> {
    return this._animation?.i18n?.locales || {};
  }

  public set translations(val: Record<string, Record<string, string>> | string) {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        this.setTextStrings(parsed);
      } catch (err) {
        console.warn('[web-anim] Failed to parse translations property JSON:', err);
      }
    } else if (val && typeof val === 'object') {
      this.setTextStrings(val);
    }
  }

  /**
   * Returns a keyed map of all localized text strings for the specified locale (or current active locale).
   * Perfect for extracting all translatable strings from the component.
   *
   * Example:
   *   const strings = document.querySelector('#animation-id').getTextStrings();
   */
  public getTextStrings(locale?: string): Record<string, string> {
    const loc = locale || this.locale;
    const result: Record<string, string> = {};
    const doc = this._animation;
    if (!doc) return result;

    // Collect all i18nKeys present in document text elements
    const collectFromElements = (elements: any[]) => {
      for (const el of elements || []) {
        if (el?.type === 'text' && el.i18nKey) {
          const translated = resolveI18nText(doc, loc, el.i18nKey);
          result[el.i18nKey] = translated !== undefined ? translated : (el.text || '');
        }
      }
    };

    for (const layer of doc.root?.layers || []) {
      for (const kf of layer.keyframes || []) {
        collectFromElements(kf.elements);
      }
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const layer of sym.timeline?.layers || []) {
        for (const kf of layer.keyframes || []) {
          collectFromElements(kf.elements);
        }
      }
    }

    // Also include any extra keys defined in doc.i18n.locales for this locale
    const locales = doc.i18n?.locales || {};
    const normTarget = loc.toLowerCase().replace(/_/g, '-');
    for (const [k, map] of Object.entries(locales)) {
      if (k.toLowerCase().replace(/_/g, '-') === normTarget && map) {
        Object.assign(result, map);
      }
    }

    return result;
  }

  /**
   * Swaps out or updates text strings at runtime (e.g. from a third-party CMS).
   *
   * Example:
   *   document.querySelector('#animation-id').setTextStrings({ headline: 'New Headline' });
   */
  public setTextStrings(
    strings: Record<string, any>,
    locale?: string
  ): void {
    if (!this._animation) return;
    if (!this._animation.i18n) {
      this._animation.i18n = {
        defaultLocale: this._locale || 'en',
        locales: {},
      };
    }

    const targetLocale = locale || this.locale;
    const firstVal = Object.values(strings)[0];
    const isNested = firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal);

    if (isNested) {
      for (const [locKey, map] of Object.entries(strings)) {
        if (!this._animation.i18n.locales[locKey]) {
          this._animation.i18n.locales[locKey] = {};
        }
        Object.assign(this._animation.i18n.locales[locKey], map);
      }
    } else {
      const normTarget = targetLocale.toLowerCase().replace(/_/g, '-');
      let matchingLocKey =
        Object.keys(this._animation.i18n.locales).find(
          (k) => k.toLowerCase().replace(/_/g, '-') === normTarget
        ) || targetLocale;

      if (!this._animation.i18n.locales[matchingLocKey]) {
        this._animation.i18n.locales[matchingLocKey] = {};
      }
      Object.assign(this._animation.i18n.locales[matchingLocKey], strings);
    }

    // Sync renderer, render canvas, update fallback, and emit stringschange event
    this._renderer?.syncTextVariables();
    if (this._canvasRenderer && this._isVisible) {
      this._canvasRenderer.render();
    }
    this.updateAccessibleFallback();
    this.dispatchEvent(new CustomEvent('stringschange', { detail: { strings, locale: targetLocale } }));
  }

  /**
   * Shared reactive document/game state.
   * Can be assigned as an object or JSON string from the host page.
   *
   * Example:
   *   document.querySelector('web-anim').state = { score: 1000 };
   */
  public get state(): Record<string, any> {
    return this.getState();
  }

  public set state(val: Record<string, any> | string) {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        this.setState(parsed);
      } catch (err) {
        console.warn('[web-anim] Failed to parse state property JSON:', err);
      }
    } else if (val && typeof val === 'object') {
      this.setState(val);
    }
  }

  public getState(key?: string): any {
    if (this._pipeline) {
      return this._pipeline.root.getState(key);
    }
    if (key) return this._initialState?.[key];
    return { ...(this._initialState || {}) };
  }

  public setState(keyOrObject: string | Record<string, any>, value?: any): void {
    if (typeof keyOrObject === 'string') {
      if (!this._initialState) this._initialState = {};
      this._initialState[keyOrObject] = value;
    } else if (keyOrObject && typeof keyOrObject === 'object') {
      if (!this._initialState) this._initialState = {};
      Object.assign(this._initialState, keyOrObject);
    }

    if (this._pipeline) {
      if (typeof keyOrObject === 'string') {
        this._pipeline.stateStore.setPublicState({ [keyOrObject]: value });
      } else {
        this._pipeline.stateStore.setPublicState(keyOrObject);
      }
      this._renderer?.syncTextVariables();
      if (this._canvasRenderer && this._isVisible) {
        this._canvasRenderer.render();
      }
      this.updateAccessibleFallback();
    }
  }

  /**
   * Active State Machine reference name or ID.
   */
  public get stateMachine(): string {
    return this.getAttribute('state-machine') || this._stateMachine || '';
  }

  public set stateMachine(val: string) {
    this._stateMachine = val;
    if (val) {
      this.setAttribute('state-machine', val);
    } else {
      this.removeAttribute('state-machine');
    }
    if (this._animation && this._pipeline) {
      this.setupStateMachine(this._animation);
    }
  }

  /**
   * Active StateMachineRunner instance (if animation has state machines).
   */
  public get stateMachineRunner(): StateMachineRunner | null {
    return this._stateMachineRunner;
  }

  /**
   * Read the value of a state machine input by name or ID.
   */
  public getInputValue(name: string): boolean | number | undefined {
    return this._stateMachineRunner?.getInputValue(name);
  }

  /**
   * Set the value of a state machine input by name or ID.
   */
  public setInputValue(name: string, value: boolean | number): void {
    this._stateMachineRunner?.setInputValue(name, value);
  }

  /**
   * Fire a state machine trigger input by name or ID.
   */
  public fireTrigger(name: string): void {
    this._stateMachineRunner?.fireTrigger(name);
  }

  /**
   * Broadcast an event into the animation and to any registered listeners.
   *
   * Example:
   *   anim.emit('tumbleweed', { speed: 2 });
   */
  public emit(eventName: string, payload?: any): void {
    if (this._pipeline) {
      this._pipeline.root.emit(eventName, payload);
    } else {
      this.dispatchEvent(
        new CustomEvent('web-anim-event', {
          detail: { name: eventName, payload },
          bubbles: true,
          composed: true,
        })
      );
      this.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  /**
   * Listen for events emitted by the animation.
   *
   * Example:
   *   const unsub = anim.on('scoreChange', (val) => console.log('Score:', val));
   */
  public on(eventName: string, handler: (payload?: any) => void): () => void {
    if (this._pipeline) {
      return this._pipeline.eventBus.on(eventName, handler);
    }
    const domListener = (e: Event) => {
      handler((e as CustomEvent).detail);
    };
    this.addEventListener(eventName, domListener);
    return () => {
      this.removeEventListener(eventName, domListener);
    };
  }

  public off(eventName: string, handler?: (payload?: any) => void): void {
    if (this._pipeline) {
      this._pipeline.eventBus.off(eventName, handler);
    }
  }

  /**
   * Trigger particle animation effects (burst, confetti, splat, sparks, spray, stream).
   *
   * Example:
   *   anim.emitParticles({ preset: 'splat', x: 200, y: 150 });
   */
  public emitParticles(options: ParticleEmitterOptions = {}): void {
    if (this._pipeline) {
      this._pipeline.particleEngine.emit(options);
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
    if (this._isVisible && this._ticker && !this._ticker.isRunning) {
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
    if (this._isVisible && this._ticker && !this._ticker.isRunning) {
      this._ticker.start();
    }
    if (this._canvasRenderer && this._isVisible) {
      this._canvasRenderer.render();
    }
  }

  public gotoAndStop(frame: FrameRef): void {
    if (this._pipeline) {
      this._pipeline.root.gotoAndStop(frame);
    }
    if (this._canvasRenderer && this._isVisible) {
      this._canvasRenderer.render();
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

  public get renderer(): DomRenderer | CanvasRenderer | null {
    return this._renderer;
  }

  public get canvasRenderer(): CanvasRenderer | null {
    return this._canvasRenderer;
  }

  public get domRenderer(): DomRenderer | null {
    return this._domRenderer;
  }

  public get canvas(): HTMLCanvasElement | null {
    return this._canvasEl;
  }

  public get isVisible(): boolean {
    return this._isVisible;
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

  public get activeArtboardId(): string {
    if (this._animation?.artboards && this._animation.artboards.length > 0) {
      const active =
        this._animation.artboards.find((a) => a.id === this._animation?.activeArtboardId) ||
        this._animation.artboards[0];
      return active.id;
    }
    return this._animation?.activeArtboardId || 'artboard-1';
  }

  public gotoArtboard(idOrName: string, transition?: ArtboardTransition): void {
    if (!this._animation) return;
    const doc = this._animation;
    const artboards = doc.artboards;
    if (!artboards || artboards.length === 0) return;

    const target =
      artboards.find((a) => a.id === idOrName) ||
      artboards.find((a) => a.name.toLowerCase() === idOrName.toLowerCase());
    if (!target) return;

    if (doc.activeArtboardId === target.id) return;
    doc.activeArtboardId = target.id;

    // Check prefers-reduced-motion
    const isReducedMotion =
      this._pipeline?.getEffectiveReducedMotion() === 'fixed' ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    let tr = transition ?? { type: 'none' };
    if (isReducedMotion) {
      tr = { type: 'none' };
    }

    const duration =
      tr.duration !== undefined ? (tr.duration <= 10 ? tr.duration * 1000 : tr.duration) : 300;

    // Update dimensions & styling for target artboard
    const width = target.width ?? doc.stage.width;
    const height = target.height ?? doc.stage.height;
    const bgFill = target.background ?? doc.stage.background;
    const bg = fillToCSS(bgFill, doc.library);

    this.style.setProperty('--stage-width', `${width}px`);
    this.style.setProperty('--stage-height', `${height}px`);
    this.style.setProperty('--stage-aspect', `${width} / ${height}`);
    this.style.setProperty('--stage-bg', bg);
    if (this._viewportEl) {
      this._viewportEl.style.backgroundColor = bg;
    }

    if (this.rendererMode === 'canvas') {
      this._pipeline?.switchArtboard(target.id);
      if (this._pipeline && this._canvasRenderer) {
        this._canvasRenderer.attach(this._pipeline.root);
        this._canvasRenderer.syncTextVariables();
      }
      this.updateStageScale();
      this.updateAccessibleFallback();
      this.dispatchEvent(
        new CustomEvent('artboardchange', { detail: { artboardId: target.id, artboard: target } })
      );
      return;
    }

    const oldMountedEl =
      this._renderer && (this._renderer as any).mounted
        ? (this._renderer as any).nodes.get((this._renderer as any).mounted)?.wrapper
        : null;

    if (tr.type === 'none' || !oldMountedEl || typeof oldMountedEl.animate !== 'function') {
      // Direct instant swap
      this._pipeline?.switchArtboard(target.id);
      if (this._pipeline && this._renderer) {
        this._renderer.attach(this._pipeline.root);
        this._renderer.syncTextVariables();
      }
      this.updateStageScale();
      this.updateAccessibleFallback();
      this.dispatchEvent(
        new CustomEvent('artboardchange', { detail: { artboardId: target.id, artboard: target } })
      );
      return;
    }

    // Animated transition (fade or slide)
    const outgoingEl = oldMountedEl.cloneNode(true) as HTMLElement;
    outgoingEl.style.position = 'absolute';
    outgoingEl.style.top = '0';
    outgoingEl.style.left = '0';
    outgoingEl.style.width = '100%';
    outgoingEl.style.height = '100%';
    outgoingEl.style.pointerEvents = 'none';
    outgoingEl.style.zIndex = '1';
    this._viewportEl?.appendChild(outgoingEl);

    // Switch pipeline & attach new artboard
    let newWrapper: HTMLElement | null = null;
    this._pipeline?.switchArtboard(target.id);
    if (this._pipeline && this._renderer) {
      newWrapper = (this._renderer as DomRenderer).attach(this._pipeline.root);
      this._renderer.syncTextVariables();
    }
    this.updateStageScale();
    this.updateAccessibleFallback();

    if (newWrapper) {
      newWrapper.style.zIndex = '2';
      if (tr.type === 'fade') {
        outgoingEl.animate([{ opacity: '1' }, { opacity: '0' }], { duration, easing: 'ease-out' });
        const anim = newWrapper.animate([{ opacity: '0' }, { opacity: '1' }], {
          duration,
          easing: 'ease-in',
        });
        anim.onfinish = () => {
          outgoingEl.remove();
        };
      } else if (tr.type === 'slide') {
        outgoingEl.animate(
          [{ transform: 'translateX(0%)' }, { transform: 'translateX(-100%)' }],
          { duration, easing: 'ease-in-out' }
        );
        const anim = newWrapper.animate(
          [{ transform: 'translateX(100%)' }, { transform: 'translateX(0%)' }],
          { duration, easing: 'ease-in-out' }
        );
        anim.onfinish = () => {
          outgoingEl.remove();
        };
      } else {
        outgoingEl.remove();
      }
    } else {
      outgoingEl.remove();
    }

    this.dispatchEvent(
      new CustomEvent('artboardchange', { detail: { artboardId: target.id, artboard: target } })
    );
  }

  // --- Internal Lifecycle ---

  private setupAnimation(doc: AnimDocument): void {
    this.initShadow();
    if (!this._viewportEl) return;

    this._viewportEl.innerHTML = '';

    const activeArtboard =
      doc.artboards && doc.artboards.length > 0
        ? doc.artboards.find((a) => a.id === doc.activeArtboardId) || doc.artboards[0]
        : undefined;

    const stage = doc.stage;
    const width = activeArtboard?.width ?? stage.width;
    const height = activeArtboard?.height ?? stage.height;
    const scaleMode = this.getAttribute('scale-mode') || stage.scaleMode || 'showAll';
    const bgFill = activeArtboard?.background ?? stage.background;
    const bg = fillToCSS(bgFill, doc.library);

    this._reducedMotion =
      (this.getAttribute('reduced-motion') as ReducedMotionMode) ||
      doc.stage.reducedMotion?.mode ||
      'auto';
    this._posterFrame =
      Number(this.getAttribute('poster-frame')) || doc.stage.reducedMotion?.posterFrame || 1;
    this._locale = this.getAttribute('locale') || doc.i18n?.defaultLocale || 'en';

    // Apply stage styling custom properties
    this.style.setProperty('--stage-width', `${width}px`);
    this.style.setProperty('--stage-height', `${height}px`);
    this.style.setProperty('--stage-aspect', `${width} / ${height}`);
    this.style.setProperty('--stage-bg', bg);

    this._viewportEl.setAttribute('data-scale-mode', scaleMode);
    if (!this.hasAttribute('scale-mode')) {
      this.setAttribute('scale-mode', scaleMode);
    }
    this._viewportEl.style.backgroundColor = bg;

    // 1. Create TimelinePipeline (instantiates root MovieClip & root Timeline)
    this._pipeline = new TimelinePipeline(doc, {
      reducedMotion: this._reducedMotion,
      posterFrame: this._posterFrame,
    });
    this._pipeline.onGotoArtboard = (id, tr) => this.gotoArtboard(id, tr);
    this._pipeline.eventBus.attachHost(this);
    this._pipeline.onStateChange = () => {
      this._renderer?.syncTextVariables();
      if (this._canvasRenderer && this._isVisible) {
        this._canvasRenderer.render();
      }
      this.updateAccessibleFallback();
    };

    // Apply any initial state or state attribute passed as props
    if (this._initialState) {
      this._pipeline.stateStore.setPublicState(this._initialState);
    }
    const stateAttr = this.getAttribute('state');
    if (stateAttr) {
      try {
        this._pipeline.stateStore.setPublicState(JSON.parse(stateAttr));
      } catch {
        /* ignore invalid initial JSON */
      }
    }

    this._pipeline.init();
    this._pipeline.root.vars.__locale = this._locale;

    // 2. Create Renderer
    if (this.rendererMode === 'canvas') {
      const canvasEl = document.createElement('canvas');
      canvasEl.className = 'stage-canvas';
      canvasEl.setAttribute('role', 'img');
      const title = doc.meta?.name || 'Flashback Animation';
      canvasEl.setAttribute('aria-label', title);
      canvasEl.style.position = 'absolute';
      canvasEl.style.left = '0';
      canvasEl.style.top = '0';
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;

      const fallbackEl = document.createElement('div');
      fallbackEl.className = 'flashback-sr-fallback sr-only';
      fallbackEl.setAttribute(
        'style',
        'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;'
      );
      canvasEl.appendChild(fallbackEl);

      this._viewportEl.appendChild(canvasEl);
      this._canvasEl = canvasEl;
      this._fallbackEl = fallbackEl;
      this._domRenderer = null;

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this._canvasRenderer = new CanvasRenderer(this._canvasEl, {
        doc,
        width,
        height,
        dpr,
        locale: this._locale,
      });
      this._canvasRenderer.attach(this._pipeline.root);
      this._renderer = this._canvasRenderer;
      this.updateAccessibleFallback();
    } else {
      this._canvasEl = null;
      this._fallbackEl = null;
      this._canvasRenderer = null;
      this._domRenderer = new DomRenderer(this._viewportEl, { doc, locale: this._locale });
      this._domRenderer.attach(this._pipeline.root);
      this._renderer = this._domRenderer;
    }

    // Particle overlay canvas
    if (typeof document !== 'undefined') {
      const particleCanvas = document.createElement('canvas');
      particleCanvas.className = 'stage-particle-canvas';
      particleCanvas.style.position = 'absolute';
      particleCanvas.style.left = '0';
      particleCanvas.style.top = '0';
      particleCanvas.style.width = '100%';
      particleCanvas.style.height = '100%';
      particleCanvas.style.pointerEvents = 'none';
      particleCanvas.style.zIndex = '9999';
      this._viewportEl.appendChild(particleCanvas);
      this._particleCanvas = particleCanvas;
      this._pipeline.particleEngine.attachCanvas(particleCanvas);
      this._pipeline.particleEngine.setStageDimensions(width, height);
    }

    // Apply any initial strings or translations attributes passed as props
    const stringsAttr = this.getAttribute('strings');
    if (stringsAttr) {
      try {
        this.setTextStrings(JSON.parse(stringsAttr));
      } catch {
        /* ignore invalid initial JSON */
      }
    }
    const transAttr = this.getAttribute('translations');
    if (transAttr) {
      try {
        this.setTextStrings(JSON.parse(transAttr));
      } catch {
        /* ignore invalid initial JSON */
      }
    }

    // Initial canvas render
    if (this._canvasRenderer && this._isVisible) {
      this._canvasRenderer.render();
    }

    // Setup State Machine Runner if defined
    this.setupStateMachine(doc);

    // 3. Create Ticker
    const frameMs = 1000 / (doc.stage.fps || 24);
    this._ticker = new Ticker({
      fps: doc.stage.fps,
      onTick: () => {
        this._pipeline?.tick();
        this._stateMachineRunner?.tick(frameMs);
        this._renderer?.syncTextVariables();
      },
      onRender: (interpolation) => {
        this._pipeline?.render(interpolation);
        if (this._canvasRenderer && this._isVisible) {
          this._canvasRenderer.render();
        }
      },
    });
    this._ticker.start();

    // 4. Update scale variables
    this.updateStageScale();
    this.setupResizeObserver();
    this.setupIntersectionObserver();
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

    // 4. Detach Renderer
    if (this._renderer) {
      this._renderer.detach();
      this._renderer = null;
    }
    this._domRenderer = null;
    this._canvasRenderer = null;

    // 5. Clean up DOM inside viewport
    if (this._viewportEl) {
      this._viewportEl.innerHTML = '';
    }
    this._canvasEl = null;
    this._fallbackEl = null;
    this._particleCanvas = null;

    // 6. Cleanup observers & listeners
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }
    if (typeof window !== 'undefined' && this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }

    // 7. Cleanup State Machine Runner & listeners
    this.teardownStateMachine();
  }

  private setupStateMachine(doc: AnimDocument): void {
    this.teardownStateMachine();

    const smDefs = doc.stateMachines;
    if (!smDefs || smDefs.length === 0) {
      return;
    }

    const targetRef =
      this.getAttribute('state-machine') || this._stateMachine || doc.activeStateMachineId;
    let matchedDef: StateMachineDef | undefined;
    if (targetRef) {
      matchedDef = smDefs.find((sm) => sm.name === targetRef || sm.id === targetRef);
    }
    if (!matchedDef) {
      matchedDef = smDefs[0];
    }
    if (!matchedDef) return;

    this._stateMachineRunner = new StateMachineRunner(matchedDef, {
      onPlayClip: (clipName: string, loop?: boolean | string, speed?: number) => {
        if (this._pipeline?.root) {
          if (loop !== undefined) {
            this._pipeline.root.loop = loop === true || loop === 'loop';
          }
          const child = this._pipeline.root.getChild(clipName);
          if (child && typeof (child as any).gotoAndPlay === 'function') {
            (child as any).gotoAndPlay(1);
          }
          try {
            this.gotoAndPlay(clipName);
          } catch {
            // Ignore non-existent frame/label
          }
        }
        this.dispatchEvent(
          new CustomEvent('stateclipchange', { detail: { clipName, loop, speed } })
        );
      },
      onStateChange: (fromState: string | null, toState: string) => {
        this.dispatchEvent(
          new CustomEvent('statechange', { detail: { fromState, toState } })
        );
      },
      onBlendClips: (fromClip: string, toClip: string, weight: number) => {
        this.dispatchEvent(
          new CustomEvent('stateblend', { detail: { fromClip, toClip, weight } })
        );
      },
      onPoseProgress: (clipName: string, progress: number) => {
        this.dispatchEvent(
          new CustomEvent('statepose', { detail: { clipName, progress } })
        );
      },
      onSpawnSymbol: (symbolId: string, x?: number, y?: number) => {
        if (this._pipeline?.root) {
          this._pipeline.root.spawnClip(symbolId, { x: x ?? 0, y: y ?? 0 });
        }
        this.dispatchEvent(
          new CustomEvent('statespawn', { detail: { symbolId, x, y } })
        );
      },
      onPlaySound: (soundId: string) => {
        if (this._pipeline?.root) {
          this._pipeline.root.playSound(soundId);
        }
        this.dispatchEvent(
          new CustomEvent('sound', { detail: { soundId } })
        );
      },
      onCustomEvent: (name: string, payload?: any) => {
        this.emit(name, payload);
      },
      getCurrentClipProgress: () => {
        if (!this._pipeline?.root) return 0;
        const total = this._pipeline.root.totalFrames;
        if (total <= 1) return 1;
        return (this._pipeline.root.currentFrame - 1) / (total - 1);
      },
    });

    // Setup pointer listeners
    const pointerEvents: Array<
      'pointerdown' | 'pointerup' | 'pointerenter' | 'pointerleave' | 'click'
    > = ['pointerdown', 'pointerup', 'pointerenter', 'pointerleave', 'click'];

    const targetEl = this._viewportEl || this;
    for (const evt of pointerEvents) {
      const handler: EventListener = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const closestEl = target?.closest?.('[data-el-id], [data-name], [id]');
        const targetId =
          closestEl?.getAttribute('data-el-id') ||
          closestEl?.getAttribute('data-name') ||
          closestEl?.id ||
          undefined;
        this._stateMachineRunner?.handlePointerEvent(evt, targetId);
      };
      targetEl.addEventListener(evt, handler);
      this._pointerListeners.push([targetEl, evt, handler]);
    }

    // Window keydown/keyup listeners if key listeners exist
    const hasKeyListeners = matchedDef.listeners?.some(
      (l) => l.eventType === 'keydown' || l.eventType === 'keyup'
    );
    if (hasKeyListeners && typeof window !== 'undefined') {
      this._onKeyDown = (e: KeyboardEvent) => {
        this._stateMachineRunner?.handleKeyEvent('keydown', e.code || e.key);
      };
      this._onKeyUp = (e: KeyboardEvent) => {
        this._stateMachineRunner?.handleKeyEvent('keyup', e.code || e.key);
      };
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }
  }

  private teardownStateMachine(): void {
    if (this._onKeyDown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onKeyUp && typeof window !== 'undefined') {
      window.removeEventListener('keyup', this._onKeyUp);
      this._onKeyUp = null;
    }
    if (this._pointerListeners) {
      for (const [el, evt, handler] of this._pointerListeners) {
        el.removeEventListener(evt, handler);
      }
      this._pointerListeners = [];
    }
    this._stateMachineRunner = null;
  }

  /**
   * Gracefully destroys all animation timers, observers, and renderers.
   */
  public destroy(): void {
    this.teardownRuntime();
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined' && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this._resizeObserver.observe(this);
    }
    if (typeof window !== 'undefined' && !this._onResize) {
      this._onResize = () => this.handleResize();
      window.addEventListener('resize', this._onResize);
    }
  }

  public handleResize(): void {
    this.updateStageScale();
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver !== 'undefined' && !this._intersectionObserver) {
      this._intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this) {
            this.handleIntersection(entry.isIntersecting);
          }
        }
      });
      this._intersectionObserver.observe(this);
    }
  }

  public handleIntersection(isIntersecting: boolean): void {
    this._isVisible = isIntersecting;
    if (!isIntersecting) {
      if (this._ticker?.isRunning) {
        this._ticker.stop();
      }
    } else {
      if (this._pipeline?.root.isPlaying && this._ticker && !this._ticker.isRunning) {
        this._ticker.start();
      }
      if (this._canvasRenderer) {
        this._canvasRenderer.render();
      }
    }
  }

  private updateAccessibleFallback(): void {
    if (!this._fallbackEl || !this._animation) return;
    this._fallbackEl.innerHTML = '';

    const doc = this._animation;
    const seen = new Set<string>();

    const addText = (text: string, attr?: { name: string; value: string }) => {
      const trimmed = text.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      const p = document.createElement('p');
      if (attr) {
        p.setAttribute(attr.name, attr.value);
      }
      p.textContent = text;
      this._fallbackEl?.appendChild(p);
    };

    if (doc.meta?.name) {
      addText(doc.meta.name);
    }
    if ((doc.meta as any)?.description) {
      addText((doc.meta as any).description);
    }

    // 1. Text strings from getTextStrings()
    const strings = this.getTextStrings();
    for (const [key, val] of Object.entries(strings)) {
      if (typeof val === 'string') {
        addText(val, { name: 'data-key', value: key });
      }
    }

    // 2. Scan all timelines (root, artboards, library symbols) for any other text elements
    const scanTimeline = (tl: any) => {
      if (!tl?.layers) return;
      for (const layer of tl.layers) {
        if (!layer?.keyframes) continue;
        for (const kf of layer.keyframes) {
          if (!kf?.elements) continue;
          for (const el of kf.elements) {
            if (el?.type === 'text' && el.text) {
              addText(el.text);
            }
          }
        }
      }
    };

    if (doc.root) scanTimeline(doc.root);
    if (doc.artboards) {
      for (const ab of doc.artboards) {
        if (ab.root) scanTimeline(ab.root);
      }
    }
    if (doc.library?.symbols) {
      for (const sym of Object.values(doc.library.symbols)) {
        if (sym.timeline) scanTimeline(sym.timeline);
      }
    }
  }

  private updateStageScale(): void {
    if (!this._animation || !this._viewportEl) return;
    const stage = this._animation.stage;
    const cw = this.clientWidth;
    const ch = this.clientHeight;

    const activeArtboard =
      this._animation.artboards?.find((a) => a.id === this._animation?.activeArtboardId) ||
      this._animation.artboards?.[0];

    let sw = activeArtboard?.width ?? stage.width;
    let sh = activeArtboard?.height ?? stage.height;
    const baseW = sw;
    const baseH = sh;
    const breakpoints = activeArtboard?.breakpoints ?? stage.breakpoints;
    const bpAttr = this.getAttribute('breakpoint') || this._activeBreakpointId;
    if (bpAttr && breakpoints && breakpoints.length > 0) {
      const matched = breakpoints.find(
        (bp) => bp.id === bpAttr || bp.name.toLowerCase() === bpAttr.toLowerCase()
      );
      if (matched) {
        sw = matched.width;
        sh = matched.height;
      }
    } else if (breakpoints && breakpoints.length > 0 && cw > 0) {
      const sorted = [...breakpoints].sort((a, b) => a.maxWidth - b.maxWidth);
      const matched = sorted.find((bp) => cw <= bp.maxWidth);
      if (matched) {
        sw = matched.width;
        sh = matched.height;
      }
    }

    if (!sw || !sh) return;

    this.style.setProperty('--stage-width', `${sw}px`);
    this.style.setProperty('--stage-height', `${sh}px`);
    this.style.setProperty('--stage-aspect', `${sw} / ${sh}`);

    if (cw > 0 && ch > 0) {
      const scaleX = cw / sw;
      const scaleY = ch / sh;
      const scaleFit = Math.min(scaleX, scaleY);
      const scaleCover = Math.max(scaleX, scaleY);

      const mode = this.getAttribute('scale-mode') || stage.scaleMode || 'showAll';
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
        s = scaleFit;
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

    // Auto-DPR canvas resize
    if (this._canvasRenderer) {
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this._canvasRenderer.baseWidth = baseW;
      this._canvasRenderer.baseHeight = baseH;
      this._canvasRenderer.resize(sw, sh, dpr);
      if (this._isVisible) {
        this._canvasRenderer.render();
      }
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
