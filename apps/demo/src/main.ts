import { registerWebAnim } from '@flashback/runtime';
import frogBlenderAnim from './frog-blender.anim';
import mediaShowcaseAnim from './media-showcase.anim';

// Register the <web-anim> custom element
registerWebAnim();

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const player = document.getElementById('player') as any;
const previewContainer = document.getElementById('previewContainer') as HTMLElement;
const scaleSelect = document.getElementById('scaleModeSelect') as HTMLSelectElement;
const localeSelect = document.getElementById('localeSelect') as HTMLSelectElement;
const viewportReadout = document.getElementById('viewportSizeReadout') as HTMLElement;

// Nav Tabs
const tabFrogBlender = document.getElementById('tabFrogBlender') as HTMLButtonElement;
const tabMediaShowcase = document.getElementById('tabMediaShowcase') as HTMLButtonElement;
const frogDeck = document.getElementById('frogDeck') as HTMLElement;
const mediaDeck = document.getElementById('mediaDeck') as HTMLElement;

// Speed Buttons
const btnSpeedOff = document.getElementById('btnSpeedOff') as HTMLButtonElement;
const btnSpeedLow = document.getElementById('btnSpeedLow') as HTMLButtonElement;
const btnSpeedMed = document.getElementById('btnSpeedMed') as HTMLButtonElement;
const btnSpeedPuree = document.getElementById('btnSpeedPuree') as HTMLButtonElement;
const blenderLed = document.getElementById('blenderStatusLed') as HTMLElement;
const blenderStatusText = document.getElementById('blenderStatusText') as HTMLElement;

// Viewport & Motion Groups
const viewportPresetGroup = document.getElementById('viewportPresetGroup') as HTMLElement;
const motionModeGroup = document.getElementById('motionModeGroup') as HTMLElement;
const posterSubBar = document.getElementById('posterSubBar') as HTMLElement;
const posterPresetsGroup = document.getElementById('posterPresetsGroup') as HTMLElement;
const frameSlider = document.getElementById('frameSlider') as HTMLInputElement;
const frameSliderLabel = document.getElementById('frameSliderLabel') as HTMLElement;

// Playback Controls
const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement;
const btnPause = document.getElementById('btnPause') as HTMLButtonElement;
const btnPrevFrame = document.getElementById('btnPrevFrame') as HTMLButtonElement;
const btnNextFrame = document.getElementById('btnNextFrame') as HTMLButtonElement;
const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
const playheadReadout = document.getElementById('playheadReadout') as HTMLElement;
const fpsReadout = document.getElementById('fpsReadout') as HTMLElement;

// Media Controls
const videoSourceGroup = document.getElementById('videoSourceGroup') as HTMLElement;
const videoUrlInput = document.getElementById('videoUrlInput') as HTMLInputElement;
const btnApplyVideoUrl = document.getElementById('btnApplyVideoUrl') as HTMLButtonElement;
const btnToggleMaskOutline = document.getElementById('btnToggleMaskOutline') as HTMLButtonElement;
const btnPulseMask = document.getElementById('btnPulseMask') as HTMLButtonElement;
const btnToggleSmoothing = document.getElementById('btnToggleSmoothing') as HTMLButtonElement;

// UI Text Elements for i18n
const deckTitle = document.getElementById('deckTitle') as HTMLElement;
const labelBtnOff = document.getElementById('labelBtnOff') as HTMLElement;
const labelBtnLow = document.getElementById('labelBtnLow') as HTMLElement;
const labelBtnMed = document.getElementById('labelBtnMed') as HTMLElement;
const labelBtnPuree = document.getElementById('labelBtnPuree') as HTMLElement;

// ============================================================================
// STATE
// ============================================================================
type BlenderState = 'idle' | 'low' | 'med' | 'puree';
let currentBlenderState: BlenderState = 'idle';
let currentLocale = 'en';
let currentMotionMode: 'full' | 'stop-motion' | 'fixed' = 'full';
let stopMotionTimer: number | null = null;
let activeDoc: 'frog' | 'media' = 'frog';
let maskOutlineActive = false;
let bitmapSmoothingActive = true;

// Predefined video sources
const VIDEO_SOURCES: Record<string, string> = {
  mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  vimeo: 'https://vimeo.com/76979871',
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function initPlayer(doc: any): void {
  if (!player) return;
  player.animation = doc;
  player.play?.();

  // Inject or ensure video element rendering if present
  enhanceStageDom();

  // Sync initial locale text
  applyLocale(currentLocale);
}

// ============================================================================
// STAGE DOM ENHANCEMENTS (Videos, Masks & Stage Clicks)
// ============================================================================
function enhanceStageDom(): void {
  const shadow = player.shadowRoot;
  if (!shadow) return;

  const viewport = shadow.querySelector('.stage-viewport');
  if (!viewport) return;

  // 1. Interactive Button Click Listener inside Canvas
  viewport.addEventListener('click', (ev: Event) => {
    const target = (ev.target as HTMLElement).closest('[data-name], [data-el-id]');
    if (!target) return;

    const name = target.getAttribute('data-name');
    const elId = target.getAttribute('data-el-id');

    if (name === 'btn_off' || elId?.includes('btn_off')) {
      setBlenderState('idle');
    } else if (name === 'btn_low' || elId?.includes('btn_low')) {
      setBlenderState('low');
    } else if (name === 'btn_med' || elId?.includes('btn_med')) {
      setBlenderState('med');
    } else if (name === 'btn_puree' || elId?.includes('btn_puree')) {
      setBlenderState('puree');
    } else if (name === 'btn_get_started' || elId?.includes('btn_get_started')) {
      player.gotoArtboard?.('artboard-onboarding', { type: 'fade', duration: 400 });
    } else if (name === 'btn_back' || elId?.includes('btn_back')) {
      player.gotoArtboard?.('artboard-blender', { type: 'fade', duration: 400 });
    }
  });

  // 2. Video Element Rendering inside Stage
  const videoWrapper = shadow.querySelector('[data-el-id="el_video_player"]') as HTMLElement;
  if (videoWrapper && !videoWrapper.querySelector('video, iframe')) {
    renderVideoInWrapper(videoWrapper, VIDEO_SOURCES.mp4);
  }
}

function renderVideoInWrapper(wrapper: HTMLElement, src: string): void {
  wrapper.innerHTML = '';
  wrapper.style.width = '210px';
  wrapper.style.height = '220px';
  wrapper.style.overflow = 'hidden';

  // Check if YouTube
  const ytMatch = src.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i);
  if (ytMatch) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    wrapper.appendChild(iframe);
    return;
  }

  // Check if Vimeo
  const vimeoMatch = src.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    wrapper.appendChild(iframe);
    return;
  }

  // Native HTML5 Video
  const video = document.createElement('video');
  video.src = src;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.controls = true;
  video.playsInline = true;
  wrapper.appendChild(video);
}

// ============================================================================
// BLENDER SPEED CONTROLS
// ============================================================================
function setBlenderState(state: BlenderState): void {
  currentBlenderState = state;

  // Update speed button active styling
  btnSpeedOff.classList.toggle('active', state === 'idle');
  btnSpeedLow.classList.toggle('active', state === 'low');
  btnSpeedMed.classList.toggle('active', state === 'med');
  btnSpeedPuree.classList.toggle('active', state === 'puree');

  // Update LED and Status badge
  blenderLed.className = 'status-indicator';
  if (state === 'idle') {
    blenderLed.classList.add('ready');
    blenderStatusText.textContent = 'STATUS: IDLE • 0 RPM';
  } else if (state === 'low') {
    blenderLed.classList.add('low');
    blenderStatusText.textContent = 'STATUS: LOW • 450 RPM (JACUZZI)';
  } else if (state === 'med') {
    blenderLed.classList.add('med');
    blenderStatusText.textContent = 'STATUS: MED • 2,400 RPM (WHIRLPOOL)';
  } else if (state === 'puree') {
    blenderLed.classList.add('puree');
    blenderStatusText.textContent = 'STATUS: PUREE • 18,000 RPM (SMOOTHIE!)';
  }

  // Jump playhead to state start frame
  const frameMap: Record<BlenderState, number> = {
    idle: 1,
    low: 25,
    med: 49,
    puree: 73,
  };
  const targetFrame = frameMap[state];

  if (currentMotionMode === 'fixed') {
    player.gotoAndStop?.(targetFrame);
    frameSlider.value = String(targetFrame);
    frameSliderLabel.textContent = `Frame ${targetFrame} / 96`;
  } else if (currentMotionMode === 'stop-motion') {
    restartStopMotionLoop(targetFrame);
  } else {
    player.gotoAndPlay?.(targetFrame);
  }
}

// Wire HTML speed deck buttons
btnSpeedOff?.addEventListener('click', () => setBlenderState('idle'));
btnSpeedLow?.addEventListener('click', () => setBlenderState('low'));
btnSpeedMed?.addEventListener('click', () => setBlenderState('med'));
btnSpeedPuree?.addEventListener('click', () => setBlenderState('puree'));

// ============================================================================
// SCALE MODES & RESPONSIVE VIEWPORT PRESETS
// ============================================================================
function applyScaleMode(mode: 'showAll' | 'noBorder' | 'exactFit' | 'noScale'): void {
  if (!player) return;
  player.setAttribute('scale-mode', mode);

  if (player.animation?.stage) {
    player.animation.stage.scaleMode = mode;
  }

  const shadow = player.shadowRoot;
  const viewport = shadow?.querySelector('.stage-viewport');
  if (viewport) {
    viewport.setAttribute('data-scale-mode', mode);
  }

  // Trigger internal resize calculation
  player.updateStageScale?.();
  window.dispatchEvent(new Event('resize'));
  updateViewportReadout();
}

scaleSelect?.addEventListener('change', (e) => {
  const mode = (e.target as HTMLSelectElement).value as any;
  applyScaleMode(mode);
});

// Viewport Presets
viewportPresetGroup?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.pill-btn') as HTMLButtonElement | null;
  if (!btn) return;

  const w = btn.getAttribute('data-w');
  const h = btn.getAttribute('data-h');
  if (!w || !h) return;

  viewportPresetGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  previewContainer.style.width = `${w}px`;
  previewContainer.style.height = `${h}px`;

  setTimeout(() => {
    player.updateStageScale?.();
    window.dispatchEvent(new Event('resize'));
    updateViewportReadout();
  }, 50);
});

function updateViewportReadout(): void {
  const rect = previewContainer.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  viewportReadout.textContent = `${w} × ${h} px`;
}

// Observe container resizing by user drag
if (typeof ResizeObserver !== 'undefined' && previewContainer) {
  new ResizeObserver(() => {
    updateViewportReadout();
  }).observe(previewContainer);
}

// ============================================================================
// ACCESSIBILITY & REDUCED MOTION MODES
// ============================================================================
function setMotionMode(mode: 'full' | 'stop-motion' | 'fixed'): void {
  currentMotionMode = mode;

  // Clear stop-motion interval if running
  if (stopMotionTimer !== null) {
    clearInterval(stopMotionTimer);
    stopMotionTimer = null;
  }

  // Update button active states
  motionModeGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-motion') === mode);
  });

  // Toggle poster sub-bar
  posterSubBar.classList.toggle('hidden', mode !== 'fixed');

  // Notify runtime pipeline if supported
  player.pipeline?.setReducedMotion?.(mode);

  if (mode === 'full') {
    player.play?.();
  } else if (mode === 'stop-motion') {
    player.stop?.();
    const frameMap: Record<BlenderState, number> = {
      idle: 1,
      low: 25,
      med: 49,
      puree: 73,
    };
    restartStopMotionLoop(frameMap[currentBlenderState]);
  } else if (mode === 'fixed') {
    player.stop?.();
    const currentFrame = player.currentFrame || 1;
    player.gotoAndStop?.(currentFrame);
    frameSlider.value = String(currentFrame);
    frameSliderLabel.textContent = `Frame ${currentFrame} / 96`;
  }
}

function restartStopMotionLoop(startFrame: number): void {
  if (stopMotionTimer !== null) {
    clearInterval(stopMotionTimer);
    stopMotionTimer = null;
  }

  let stepIndex = 0;
  const loopOffsets = [0, 6, 12, 18]; // 4 steps per loop (stepped 4 FPS)

  stopMotionTimer = window.setInterval(() => {
    stepIndex = (stepIndex + 1) % loopOffsets.length;
    const f = startFrame + loopOffsets[stepIndex];
    player.gotoAndStop?.(f);
  }, 250); // 250ms = 4 FPS
}

motionModeGroup?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.pill-btn') as HTMLButtonElement | null;
  if (!btn) return;
  const mode = btn.getAttribute('data-motion') as any;
  if (mode) setMotionMode(mode);
});

// Poster Presets & Slider
posterPresetsGroup?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.pill-btn-sm') as HTMLButtonElement | null;
  if (!btn) return;
  const f = Number(btn.getAttribute('data-frame'));
  posterPresetsGroup.querySelectorAll('.pill-btn-sm').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  player.gotoAndStop?.(f);
  frameSlider.value = String(f);
  frameSliderLabel.textContent = `Frame ${f} / 96`;
});

frameSlider?.addEventListener('input', (e) => {
  const f = Number((e.target as HTMLInputElement).value);
  frameSliderLabel.textContent = `Frame ${f} / 96`;
  player.gotoAndStop?.(f);
});

// Auto-detect system prefers-reduced-motion
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setMotionMode('stop-motion');
}

// ============================================================================
// INTERNATIONALIZATION (i18n) SWITCHER
// ============================================================================
const UI_TRANSLATIONS: Record<string, any> = {
  en: {
    deckTitle: 'Blender Speed Deck & Interactive Triggers',
    btnOff: 'OFF / RESET',
    btnLow: '1: LOW',
    btnMed: '2: MED',
    btnPuree: '3: PUREE',
  },
  es: {
    deckTitle: 'Panel de Velocidad de la Licuadora y Controles Interactivos',
    btnOff: 'APAGAR',
    btnLow: '1: BAJO',
    btnMed: '2: MEDIO',
    btnPuree: '3: PURÉ',
  },
  fr: {
    deckTitle: 'Commandes de Vitesse du Mixeur et Déclencheurs Interactifs',
    btnOff: 'ARRÊT',
    btnLow: '1: LENT',
    btnMed: '2: MOYEN',
    btnPuree: '3: PURÉE',
  },
  ja: {
    deckTitle: 'ミキサー速度デッキ＆インタラクティブ操作',
    btnOff: '停止/リセット',
    btnLow: '1: 弱 (ジャグジー)',
    btnMed: '2: 中 (渦巻き)',
    btnPuree: '3: 強 (ピューレ)',
  },
};

function applyLocale(locale: string): void {
  currentLocale = locale;
  player.setAttribute('locale', locale);

  if (player.pipeline?.root?.vars) {
    player.pipeline.root.vars.__locale = locale;
  }

  // Update HTML UI labels
  const ui = UI_TRANSLATIONS[locale] || UI_TRANSLATIONS.en;
  if (deckTitle) deckTitle.textContent = ui.deckTitle;
  if (labelBtnOff) labelBtnOff.textContent = ui.btnOff;
  if (labelBtnLow) labelBtnLow.textContent = ui.btnLow;
  if (labelBtnMed) labelBtnMed.textContent = ui.btnMed;
  if (labelBtnPuree) labelBtnPuree.textContent = ui.btnPuree;

  // Update canvas text elements matching i18n
  const doc = player.animation;
  const dict = doc?.i18n?.locales?.[locale];
  if (!dict) return;

  const shadow = player.shadowRoot;
  if (!shadow) return;

  // Title text
  const titleEl = shadow.querySelector('[data-el-id="el_title_text"] div, [data-el-id="txt_showcase_title"] div');
  if (titleEl && dict.title) titleEl.textContent = dict.title;

  // Speech bubble taunt text
  const tauntIdle = shadow.querySelector('[data-el-id="el_taunt_text_idle"] div');
  if (tauntIdle && dict.taunt_idle) tauntIdle.textContent = dict.taunt_idle;

  const tauntLow = shadow.querySelector('[data-el-id="el_taunt_text_low"] div');
  if (tauntLow && dict.taunt_low) tauntLow.textContent = dict.taunt_low;

  const tauntMed = shadow.querySelector('[data-el-id="el_taunt_text_med"] div');
  if (tauntMed && dict.taunt_med) tauntMed.textContent = dict.taunt_med;

  const tauntPuree = shadow.querySelector('[data-el-id="el_taunt_text_puree"] div');
  if (tauntPuree && dict.taunt_puree) tauntPuree.textContent = dict.taunt_puree;
}

localeSelect?.addEventListener('change', (e) => {
  const loc = (e.target as HTMLSelectElement).value;
  applyLocale(loc);
});

// ============================================================================
// ANIMATION SHOWCASE TABS (Frog Blender vs. Media Showcase)
// ============================================================================
tabFrogBlender?.addEventListener('click', () => {
  if (activeDoc === 'frog') return;
  activeDoc = 'frog';
  tabFrogBlender.classList.add('active');
  tabMediaShowcase.classList.remove('active');
  frogDeck.classList.remove('hidden');
  mediaDeck.classList.add('hidden');

  frameSlider.max = '96';
  initPlayer(frogBlenderAnim);
  setBlenderState('idle');
});

tabMediaShowcase?.addEventListener('click', () => {
  if (activeDoc === 'media') return;
  activeDoc = 'media';
  tabMediaShowcase.classList.add('active');
  tabFrogBlender.classList.remove('active');
  mediaDeck.classList.remove('hidden');
  frogDeck.classList.add('hidden');

  frameSlider.max = '48';
  initPlayer(mediaShowcaseAnim);
});

// ============================================================================
// MEDIA & MASK SHOWCASE CONTROLS
// ============================================================================
videoSourceGroup?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.pill-btn-sm') as HTMLButtonElement | null;
  if (!btn) return;
  const srcKey = btn.getAttribute('data-source');
  if (!srcKey || !VIDEO_SOURCES[srcKey]) return;

  videoSourceGroup.querySelectorAll('.pill-btn-sm').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  const srcUrl = VIDEO_SOURCES[srcKey];
  videoUrlInput.value = srcUrl;

  const shadow = player.shadowRoot;
  const wrapper = shadow?.querySelector('[data-el-id="el_video_player"]') as HTMLElement;
  if (wrapper) {
    renderVideoInWrapper(wrapper, srcUrl);
  }
});

btnApplyVideoUrl?.addEventListener('click', () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;

  const shadow = player.shadowRoot;
  const wrapper = shadow?.querySelector('[data-el-id="el_video_player"]') as HTMLElement;
  if (wrapper) {
    renderVideoInWrapper(wrapper, url);
  }
});

btnToggleMaskOutline?.addEventListener('click', () => {
  maskOutlineActive = !maskOutlineActive;
  btnToggleMaskOutline.classList.toggle('active', maskOutlineActive);

  const shadow = player.shadowRoot;
  const maskNode = shadow?.querySelector('[data-el-id="el_spotlight_mask"] svg') as HTMLElement;
  if (maskNode) {
    maskNode.style.outline = maskOutlineActive ? '3px dashed #38bdf8' : '';
    maskNode.style.outlineOffset = '4px';
  }
});

btnPulseMask?.addEventListener('click', () => {
  const shadow = player.shadowRoot;
  const maskNode = shadow?.querySelector('[data-el-id="el_spotlight_mask"]') as HTMLElement;
  if (maskNode) {
    maskNode.style.transition = 'transform 0.4s ease';
    maskNode.style.transform = 'scale(1.8) rotate(30deg)';
    setTimeout(() => {
      maskNode.style.transform = '';
    }, 450);
  }
});

btnToggleSmoothing?.addEventListener('click', () => {
  bitmapSmoothingActive = !bitmapSmoothingActive;
  btnToggleSmoothing.classList.toggle('active', !bitmapSmoothingActive);
  btnToggleSmoothing.textContent = bitmapSmoothingActive
    ? 'Toggle Smoothing (Active: Bilinear)'
    : 'Toggle Smoothing (Active: Pixelated)';

  const shadow = player.shadowRoot;
  const img = shadow?.querySelector('[data-el-id="el_photo_bitmap"] img, [data-el-id="el_acme_badge_bmp"] img') as HTMLElement;
  if (img) {
    img.style.imageRendering = bitmapSmoothingActive ? 'auto' : 'pixelated';
  }
});

// ============================================================================
// PLAYHEAD CONTROLS & MONITORING
// ============================================================================
btnPlay?.addEventListener('click', () => {
  setMotionMode('full');
  player.play?.();
});

btnPause?.addEventListener('click', () => {
  player.stop?.();
  if (stopMotionTimer !== null) {
    clearInterval(stopMotionTimer);
    stopMotionTimer = null;
  }
});

btnPrevFrame?.addEventListener('click', () => {
  player.stop?.();
  const cf = player.currentFrame || 1;
  const prev = Math.max(1, cf - 1);
  player.gotoAndStop?.(prev);
});

btnNextFrame?.addEventListener('click', () => {
  player.stop?.();
  const cf = player.currentFrame || 1;
  const max = player.totalFrames || (activeDoc === 'frog' ? 96 : 48);
  const next = Math.min(max, cf + 1);
  player.gotoAndStop?.(next);
});

btnRestart?.addEventListener('click', () => {
  if (activeDoc === 'frog') {
    setBlenderState('idle');
  } else {
    player.gotoAndPlay?.(1);
  }
});

// Continuously update playhead monitor
function updateMonitor(): void {
  if (player) {
    const cur = player.currentFrame || 1;
    const tot = player.totalFrames || (activeDoc === 'frog' ? 96 : 48);
    playheadReadout.innerHTML = `Frame: <strong>${cur} / ${tot}</strong>`;

    if (currentMotionMode === 'stop-motion') {
      fpsReadout.innerHTML = `FPS: <strong>4 (Stepped)</strong>`;
    } else if (currentMotionMode === 'fixed') {
      fpsReadout.innerHTML = `FPS: <strong>0 (Paused)</strong>`;
    } else {
      fpsReadout.innerHTML = `FPS: <strong>${player.animation?.stage?.fps || 24}</strong>`;
    }
  }
  requestAnimationFrame(updateMonitor);
}
requestAnimationFrame(updateMonitor);

// Ensure the default Frog Blender animation loads after all constants & handlers are initialized
if (player) {
  initPlayer(frogBlenderAnim);
}
