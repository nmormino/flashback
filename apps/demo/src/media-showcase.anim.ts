import type { AnimDocument } from '@flashback/runtime';

/**
 * Media, Masks & Video Embed Showcase Animation
 * Demonstrates:
 * 1. Vector Masking (Spotlight aperture clipping layers)
 * 2. Raster Bitmap Elements (with direct src & library assets)
 * 3. Video Elements (MP4, YouTube, Vimeo)
 */
export const mediaShowcaseAnim: AnimDocument = {
  version: 1,
  meta: {
    name: 'Media-Masks-Video-Showcase',
    author: 'Flashback Team',
    createdAt: '2026-11-04T00:00:00.000Z',
    modifiedAt: '2026-11-04T00:00:00.000Z',
    editorVersion: 'Flashback Studio 2.0',
  },
  stage: {
    width: 700,
    height: 520,
    fps: 24,
    background: {
      type: 'solid',
      color: '#090d16',
    },
    scaleMode: 'showAll',
    reducedMotion: {
      mode: 'auto',
      posterFrame: 1,
      stopMotionFps: 4,
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        title: 'FLASHBACK MULTIMEDIA ENGINE',
        mask_label: '1. VECTOR MASK SPOTLIGHT',
        bitmap_label: '2. RASTER BITMAP TEXTURE',
        video_label: '3. EMBEDDED VIDEO PLAYER',
      },
      es: {
        title: 'MOTOR MULTIMEDIA FLASHBACK',
        mask_label: '1. MÁSCARA VECTORIAL',
        bitmap_label: '2. TEXTURA DE MAPA DE BITS',
        video_label: '3. REPRODUCTOR DE VIDEO',
      },
      fr: {
        title: 'MOTEUR MULTIMÉDIA FLASHBACK',
        mask_label: '1. MASQUE VECTORIEL',
        bitmap_label: '2. TEXTURE BITMAP',
        video_label: '3. LECTEUR VIDÉO INTÉGRÉ',
      },
      ja: {
        title: 'FLASHBACK マルチメディアエンジン',
        mask_label: '1. ベクターマスク スポットライト',
        bitmap_label: '2. ラスタービットマップ テクスチャ',
        video_label: '3. 埋め込みビデオ プレイヤー',
      },
    },
  },
  library: {
    symbols: {},
    audio: {},
    fonts: {
      font_system: {
        id: 'font_system',
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        src: '',
        format: 'woff2',
      },
    },
    bitmaps: {
      bmp_retro_grid: {
        id: 'bmp_retro_grid',
        name: 'Retro Circuit Decal',
        src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%230f172a"/><circle cx="100" cy="100" r="80" fill="none" stroke="%2338bdf8" stroke-width="3" stroke-dasharray="8 4"/><circle cx="100" cy="100" r="50" fill="%231e293b" stroke="%23818cf8" stroke-width="2"/><path d="M 20 100 L 180 100 M 100 20 L 100 180" stroke="%2306b6d4" stroke-width="2"/><text x="100" y="105" fill="%23f8fafc" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">RASTER BITMAP</text><text x="100" y="125" fill="%2338bdf8" font-family="monospace" font-size="9" text-anchor="middle">200x200 PNG/DATA</text></svg>',
        width: 200,
        height: 200,
        smoothing: true,
      },
      bmp_photo_art: {
        id: 'bmp_photo_art',
        name: 'Lab Photo Art',
        src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160" viewBox="0 0 260 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%23ec4899"/><stop offset="50%25" stop-color="%238b5cf6"/><stop offset="100%25" stop-color="%233b82f6"/></linearGradient></defs><rect width="260" height="160" rx="8" fill="url(%23g)"/><circle cx="130" cy="80" r="45" fill="%23ffffff" fill-opacity="0.2"/><path d="M 40 120 L 100 60 L 150 110 L 190 75 L 220 120 Z" fill="%23ffffff" fill-opacity="0.35"/><text x="130" y="145" fill="%23ffffff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">HI-RES RASTER BITMAP ASSET</text></svg>',
        width: 260,
        height: 160,
        smoothing: true,
      },
    },
  },
  root: {
    frameCount: 48,
    labels: {
      start: 0,
      loop: 24,
    },
    layers: [
      /* Header & Title */
      {
        id: 'layer_header',
        name: 'Header & UI Labels',
        kind: 'normal',
        visible: true,
        locked: true,
        keyframes: [
          {
            id: 'kf_header_0',
            index: 0,
            duration: 48,
            elements: [
              {
                id: 'txt_showcase_title',
                type: 'text',
                mode: 'static',
                text: 'FLASHBACK MULTIMEDIA ENGINE',
                i18nKey: 'title',
                fontId: 'font_system',
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#38bdf8',
                align: 'left',
                width: 450,
                height: 28,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 22, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'txt_badge',
                type: 'text',
                mode: 'static',
                text: 'MASKS • BITMAPS • VIDEO EMBED',
                fontId: 'font_system',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: '#94a3b8',
                align: 'left',
                width: 300,
                height: 18,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 52, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'shape_mask_card_bezel',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 0 0 L 200 0 L 200 220 L 0 220 Z',
                    fill: { type: 'solid', color: 'rgba(15, 23, 42, 0.35)' },
                    stroke: { fill: { type: 'solid', color: '#334155' }, width: 2, cap: 'round', join: 'round' },
                  },
                ],
              },
              {
                id: 'txt_mask_header',
                type: 'text',
                mode: 'static',
                text: '1. VECTOR MASK SPOTLIGHT',
                i18nKey: 'mask_label',
                fontId: 'font_system',
                fontSize: 11,
                fontWeight: 800,
                color: '#38bdf8',
                align: 'center',
                width: 200,
                height: 20,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 340, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },

      /* SECTION 1: MASKED SPOTLIGHT LAYER */
      {
        id: 'layer_mask_spotlight',
        name: 'Vector Mask Spotlight',
        kind: 'mask',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_mask_0',
            index: 0,
            duration: 24,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_spotlight_mask',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 105, y: 215, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    // Circular spotlight mask
                    d: 'M -55 0 A 55 55 0 1 0 55 0 A 55 55 0 1 0 -55 0 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_mask_1',
            index: 24,
            duration: 24,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_spotlight_mask',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 160, y: 225, scaleX: 1.2, scaleY: 1.2, rotation: 45, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 0 A 55 55 0 1 0 55 0 A 55 55 0 1 0 -55 0 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'layer_masked_content',
        name: 'Masked Content',
        kind: 'normal',
        maskLayerId: 'layer_mask_spotlight',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_masked_content_0',
            index: 0,
            duration: 48,
            elements: [
              {
                id: 'shape_masked_circuit',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // High-tech matrix background revealed by mask
                  {
                    d: 'M 30 110 L 230 110 L 230 330 L 30 330 Z',
                    fill: { type: 'solid', color: '#1e1b4b' },
                    stroke: { fill: { type: 'solid', color: '#38bdf8' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Matrix glowing lines
                  {
                    d: 'M 40 140 L 220 140 M 40 180 L 220 180 M 40 220 L 220 220 M 40 260 L 220 260 M 40 300 L 220 300 M 60 120 L 60 320 M 100 120 L 100 320 M 140 120 L 140 320 M 180 120 L 180 320',
                    stroke: { fill: { type: 'solid', color: '#06b6d4' }, width: 2, cap: 'butt', join: 'miter', dash: [4, 4] },
                  },
                  // Secret center star
                  {
                    d: 'M 130 170 L 142 200 L 175 205 L 150 228 L 156 260 L 130 245 L 104 260 L 110 228 L 85 205 L 118 200 Z',
                    fill: { type: 'solid', color: '#f59e0b' },
                    stroke: { fill: { type: 'solid', color: '#fef08a' }, width: 3, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* SECTION 2: RASTER BITMAP ELEMENT */
      {
        id: 'layer_bitmap_section',
        name: 'Raster Bitmaps',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_bmp_0',
            index: 0,
            duration: 48,
            elements: [
              // Frame Bezel around bitmap
              {
                id: 'shape_bmp_bezel',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 250, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -5 -5 L 195 -5 L 195 225 L -5 225 Z',
                    fill: { type: 'solid', color: '#1e293b' },
                    stroke: { fill: { type: 'solid', color: '#475569' }, width: 2, cap: 'round', join: 'round' },
                  },
                ],
              },
              // The Raster Bitmap Image Asset
              {
                id: 'el_photo_bitmap',
                type: 'bitmap',
                bitmapId: 'bmp_photo_art',
                width: 190,
                height: 220,
                alpha: 1,
                visible: true,
                transform: { x: 250, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'txt_bmp_header',
                type: 'text',
                mode: 'static',
                text: '2. RASTER BITMAP',
                i18nKey: 'bitmap_label',
                fontId: 'font_system',
                fontSize: 11,
                fontWeight: 800,
                color: '#ec4899',
                align: 'center',
                width: 190,
                height: 20,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 250, y: 340, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },

      /* SECTION 3: EMBEDDED VIDEO ELEMENT (MP4 / YouTube / Vimeo) */
      {
        id: 'layer_video_section',
        name: 'Embedded Video',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_video_0',
            index: 0,
            duration: 48,
            actions: function () {
              this.gotoAndPlay(1);
            },
            elements: [
              // CRT / Monitor bezel around video
              {
                id: 'shape_video_bezel',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 460, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -8 -8 L 218 -8 L 218 228 L -8 228 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                    stroke: { fill: { type: 'solid', color: '#38bdf8' }, width: 2, cap: 'round', join: 'round' },
                  },
                ],
              },
              // VideoElement (supporting direct MP4 or video embed iframe)
              {
                id: 'el_video_player',
                type: 'video',
                src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                width: 210,
                height: 220,
                autoplay: true,
                loop: true,
                muted: true,
                controls: true,
                alpha: 1,
                visible: true,
                transform: { x: 460, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'txt_video_header',
                type: 'text',
                mode: 'static',
                text: '3. EMBEDDED VIDEO',
                i18nKey: 'video_label',
                fontId: 'font_system',
                fontSize: 11,
                fontWeight: 800,
                color: '#22c55e',
                align: 'center',
                width: 210,
                height: 20,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 460, y: 340, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },

      /* Footer explanation bar */
      {
        id: 'layer_footer',
        name: 'Footer Explanations',
        kind: 'normal',
        visible: true,
        locked: true,
        keyframes: [
          {
            id: 'kf_footer_0',
            index: 0,
            duration: 48,
            elements: [
              {
                id: 'txt_footer_info',
                type: 'text',
                mode: 'static',
                text: 'Switch between video sources (MP4 / YouTube / Vimeo) via the Media Drawer controls below.',
                fontId: 'font_system',
                fontSize: 12,
                fontWeight: 600,
                color: '#94a3b8',
                align: 'center',
                width: 640,
                height: 24,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 475, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },
    ],
  },
};

export default mediaShowcaseAnim;
