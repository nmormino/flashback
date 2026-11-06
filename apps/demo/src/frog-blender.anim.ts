import type { AnimDocument, TimelineDef } from '@flashback/runtime';

/**
 * "Frog in a Blender" — Classic Interactive Flash Tribute
 * Fully compliant with @flashback/runtime AnimDocument Schema
 */
const frogBlenderAnim: AnimDocument = {
  version: 1,
  meta: {
    name: 'Frog-in-a-Blender-2000',
    author: 'Joe Cartoon Tribute & Flashback Team',
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
      color: '#111827',
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
        title: 'FROG BLENDER 2000',
        taunt_idle: "Come on, push a button! You won't!",
        taunt_low: 'Whoa!! Nice jacuzzi!!',
        taunt_med: "WAAAAH! I'M GETTING DIZZY!!",
        taunt_puree: 'FROG SMOOTHIE SERVED! (Click OFF to Respawn)',
        btn_off_label: 'OFF / RESET',
        btn_low_label: '1: LOW',
        btn_med_label: '2: MED',
        btn_puree_label: '3: PUREE',
      },
      es: {
        title: 'LICUADORA DE RANAS 2000',
        taunt_idle: '¡Vamos, presiona el botón! ¡No te atreves!',
        taunt_low: '¡¡Guau!! ¡Qué buen jacuzzi!',
        taunt_med: '¡¡AAAH!! ¡ME ESTOY MAREANDO!',
        taunt_puree: '¡BATIDO DE RANA LISTO! (Clic en OFF para renacer)',
        btn_off_label: 'APAGAR',
        btn_low_label: '1: BAJO',
        btn_med_label: '2: MEDIO',
        btn_puree_label: '3: PURÉ',
      },
      fr: {
        title: 'MIXEUR À GRENOUILLE 2000',
        taunt_idle: 'Allez, appuie sur un bouton ! Tu n’oses pas !',
        taunt_low: 'Ouaaah ! Super jacuzzi !',
        taunt_med: "AAAH ! J'AI LE TOURNIS !",
        taunt_puree: 'SMOOTHIE DE GRENOUILLE PRÊT ! (Cliquez OFF pour revivre)',
        btn_off_label: 'ARRÊT',
        btn_low_label: '1: LENT',
        btn_med_label: '2: MOYEN',
        btn_puree_label: '3: PURÉE',
      },
      ja: {
        title: 'カエルミキサー 2000',
        taunt_idle: 'ボタンを押してみろよ！押せないだろ！',
        taunt_low: 'うわぁ！いいジャグジーだ！',
        taunt_med: 'うわぁぁ！目が回るぅぅ！',
        taunt_puree: 'カエルスムージー完成！（OFFで復活）',
        btn_off_label: '停止/リセット',
        btn_low_label: '1: 弱 (ジャグジー)',
        btn_med_label: '2: 中 (渦巻き)',
        btn_puree_label: '3: 強 (ピューレ)',
      },
    },
  },
  library: {
    symbols: {
      sym_btn_off: {
        id: 'sym_btn_off',
        name: 'Button_Off',
        kind: 'button',
        registration: { x: 30, y: 18 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 'layer_btn_off_bg',
              name: 'Button BG',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_btn_off_0',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_off',
                      type: 'shape',
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      paths: [
                        {
                          d: 'M 4 0 L 56 0 C 58.2 0 60 1.8 60 4 L 60 32 C 60 34.2 58.2 36 56 36 L 4 36 C 1.8 36 0 34.2 0 32 L 0 4 C 0 1.8 1.8 0 4 0 Z',
                          fill: { type: 'solid', color: '#1e293b' },
                          stroke: { fill: { type: 'solid', color: '#475569' }, width: 2, cap: 'round', join: 'round' },
                        },
                        {
                          d: 'M 6 3 L 54 3 C 55.6 3 57 4.4 57 6 L 57 20 C 57 21.6 55.6 23 54 23 L 6 23 C 4.4 23 3 21.6 3 20 L 3 6 C 3 4.4 4.4 3 6 3 Z',
                          fill: { type: 'solid', color: '#334155' },
                        },
                        {
                          d: 'M 18 10 L 42 10 C 44 10 46 12 46 14 L 46 22 C 46 24 44 26 42 26 L 18 26 C 16 26 14 24 14 22 L 14 14 C 14 12 16 10 18 10 Z',
                          fill: { type: 'solid', color: '#10b981' },
                        },
                      ],
                    },
                    {
                      id: 'txt_btn_off',
                      type: 'text',
                      mode: 'static',
                      text: 'OFF',
                      fontId: 'font_system',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#ffffff',
                      align: 'center',
                      width: 60,
                      height: 14,
                      multiline: false,
                      selectable: false,
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 12, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      sym_btn_low: {
        id: 'sym_btn_low',
        name: 'Button_Low',
        kind: 'button',
        registration: { x: 30, y: 18 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 'layer_btn_low_bg',
              name: 'Button BG',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_btn_low_0',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_low',
                      type: 'shape',
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      paths: [
                        {
                          d: 'M 4 0 L 56 0 C 58.2 0 60 1.8 60 4 L 60 32 C 60 34.2 58.2 36 56 36 L 4 36 C 1.8 36 0 34.2 0 32 L 0 4 C 0 1.8 1.8 0 4 0 Z',
                          fill: { type: 'solid', color: '#1e293b' },
                          stroke: { fill: { type: 'solid', color: '#475569' }, width: 2, cap: 'round', join: 'round' },
                        },
                        {
                          d: 'M 6 3 L 54 3 C 55.6 3 57 4.4 57 6 L 57 20 C 57 21.6 55.6 23 54 23 L 6 23 C 4.4 23 3 21.6 3 20 L 3 6 C 3 4.4 4.4 3 6 3 Z',
                          fill: { type: 'solid', color: '#334155' },
                        },
                        {
                          d: 'M 18 10 L 42 10 C 44 10 46 12 46 14 L 46 22 C 46 24 44 26 42 26 L 18 26 C 16 26 14 24 14 22 L 14 14 C 14 12 16 10 18 10 Z',
                          fill: { type: 'solid', color: '#eab308' },
                        },
                      ],
                    },
                    {
                      id: 'txt_btn_low',
                      type: 'text',
                      mode: 'static',
                      text: '1: LOW',
                      fontId: 'font_system',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#000000',
                      align: 'center',
                      width: 60,
                      height: 14,
                      multiline: false,
                      selectable: false,
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 12, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      sym_btn_med: {
        id: 'sym_btn_med',
        name: 'Button_Med',
        kind: 'button',
        registration: { x: 30, y: 18 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 'layer_btn_med_bg',
              name: 'Button BG',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_btn_med_0',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_med',
                      type: 'shape',
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      paths: [
                        {
                          d: 'M 4 0 L 56 0 C 58.2 0 60 1.8 60 4 L 60 32 C 60 34.2 58.2 36 56 36 L 4 36 C 1.8 36 0 34.2 0 32 L 0 4 C 0 1.8 1.8 0 4 0 Z',
                          fill: { type: 'solid', color: '#1e293b' },
                          stroke: { fill: { type: 'solid', color: '#475569' }, width: 2, cap: 'round', join: 'round' },
                        },
                        {
                          d: 'M 6 3 L 54 3 C 55.6 3 57 4.4 57 6 L 57 20 C 57 21.6 55.6 23 54 23 L 6 23 C 4.4 23 3 21.6 3 20 L 3 6 C 3 4.4 4.4 3 6 3 Z',
                          fill: { type: 'solid', color: '#334155' },
                        },
                        {
                          d: 'M 18 10 L 42 10 C 44 10 46 12 46 14 L 46 22 C 46 24 44 26 42 26 L 18 26 C 16 26 14 24 14 22 L 14 14 C 14 12 16 10 18 10 Z',
                          fill: { type: 'solid', color: '#f97316' },
                        },
                      ],
                    },
                    {
                      id: 'txt_btn_med',
                      type: 'text',
                      mode: 'static',
                      text: '2: MED',
                      fontId: 'font_system',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#ffffff',
                      align: 'center',
                      width: 60,
                      height: 14,
                      multiline: false,
                      selectable: false,
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 12, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      sym_btn_puree: {
        id: 'sym_btn_puree',
        name: 'Button_Puree',
        kind: 'button',
        registration: { x: 30, y: 18 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 'layer_btn_puree_bg',
              name: 'Button BG',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_btn_puree_0',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_puree',
                      type: 'shape',
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      paths: [
                        {
                          d: 'M 4 0 L 56 0 C 58.2 0 60 1.8 60 4 L 60 32 C 60 34.2 58.2 36 56 36 L 4 36 C 1.8 36 0 34.2 0 32 L 0 4 C 0 1.8 1.8 0 4 0 Z',
                          fill: { type: 'solid', color: '#1e293b' },
                          stroke: { fill: { type: 'solid', color: '#dc2626' }, width: 2, cap: 'round', join: 'round' },
                        },
                        {
                          d: 'M 6 3 L 54 3 C 55.6 3 57 4.4 57 6 L 57 20 C 57 21.6 55.6 23 54 23 L 6 23 C 4.4 23 3 21.6 3 20 L 3 6 C 3 4.4 4.4 3 6 3 Z',
                          fill: { type: 'solid', color: '#334155' },
                        },
                        {
                          d: 'M 18 10 L 42 10 C 44 10 46 12 46 14 L 46 22 C 46 24 44 26 42 26 L 18 26 C 16 26 14 24 14 22 L 14 14 C 14 12 16 10 18 10 Z',
                          fill: { type: 'solid', color: '#ef4444' },
                        },
                      ],
                    },
                    {
                      id: 'txt_btn_puree',
                      type: 'text',
                      mode: 'static',
                      text: '3: PUREE',
                      fontId: 'font_system',
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#ffffff',
                      align: 'center',
                      width: 60,
                      height: 14,
                      multiline: false,
                      selectable: false,
                      alpha: 1,
                      visible: true,
                      transform: { x: 0, y: 12, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
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
      bmp_acme_badge: {
        id: 'bmp_acme_badge',
        name: 'ACME Lab Badge',
        src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30" viewBox="0 0 120 30"><rect width="120" height="30" rx="4" fill="%230f172a" stroke="%2338bdf8" stroke-width="2"/><text x="60" y="14" fill="%2338bdf8" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">ACME FROG-2000</text><text x="60" y="24" fill="%2394a3b8" font-family="monospace" font-size="7" text-anchor="middle">SERIAL: %230492-FROG</text></svg>',
        width: 120,
        height: 30,
        smoothing: true,
      },
    },
  },
  root: {
    frameCount: 96,
    labels: {
      idle: 0,
      low: 24,
      med: 48,
      puree: 72,
    },
    layers: [
      /* ======================================================================
       * 0. ARTBOARD NAVIGATION LAYER: "Get Started" Button
       * ====================================================================== */
      {
        id: 'layer_navigation',
        name: 'Navigation & Artboards',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_nav_get_started',
            index: 0,
            duration: 96,
            elements: [
              {
                id: 'btn_get_started',
                instanceName: 'btn_get_started',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 530, y: 14, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 0 6 C 0 2.7 2.7 0 6 0 L 144 0 C 147.3 0 150 2.7 150 6 L 150 28 C 150 31.3 147.3 34 144 34 L 6 34 C 2.7 34 0 31.3 0 28 Z',
                    fill: { type: 'solid', color: '#2563eb' },
                    stroke: { fill: { type: 'solid', color: '#60a5fa' }, width: 2, cap: 'round', join: 'round' },
                  },
                ],
                events: {
                  onClick: function (this: any) {
                    this.gotoArtboard('artboard-onboarding', { type: 'fade', duration: 400 });
                  },
                  onRelease: function (this: any) {
                    this.gotoArtboard('artboard-onboarding', { type: 'fade', duration: 400 });
                  },
                },
              },
              {
                id: 'txt_get_started',
                instanceName: 'txt_get_started',
                type: 'text',
                mode: 'static',
                text: 'Get Started ➔',
                fontId: 'font_system',
                fontSize: 13,
                fontWeight: 700,
                color: '#ffffff',
                align: 'center',
                width: 150,
                height: 20,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 530, y: 22, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },
      /* ======================================================================
       * 1. TOP UI LAYER: Title & Comic Speech Bubble with i18n
       * ====================================================================== */
      {
        id: 'layer_speech_bubble',
        name: 'UI & Speech Bubble',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          // Idle speech bubble (frames 0-23)
          {
            id: 'kf_speech_idle',
            index: 0,
            duration: 24,
            elements: [
              // Title Header
              {
                id: 'el_title_text',
                type: 'text',
                      mode: 'static',
                text: 'FROG BLENDER 2000',
                i18nKey: 'title',
                fontId: 'font_system',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#fde047',
                align: 'left',
                width: 320,
                height: 32,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 24, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              // Speech bubble outline & tail
              {
                id: 'el_speech_bubble_bg',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 390, y: 35, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    // Rounded comic bubble with pointing tail towards the pitcher
                    d: 'M 16 0 L 254 0 C 262.8 0 270 7.2 270 16 L 270 64 C 270 72.8 262.8 80 254 80 L 70 80 L 40 106 L 52 80 L 16 80 C 7.2 80 0 72.8 0 64 L 0 16 C 0 7.2 7.2 0 16 0 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                ],
              },
              // Taunt text inside bubble
              {
                id: 'el_taunt_text_idle',
                type: 'text',
                      mode: 'static',
                text: "Come on, push a button! You won't!",
                i18nKey: 'taunt_idle',
                fontId: 'font_system',
                fontSize: 14,
                fontWeight: 800,
                color: '#0f172a',
                align: 'center',
                width: 250,
                height: 60,
                multiline: true,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 400, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
          // Low speed speech bubble (frames 24-47)
          {
            id: 'kf_speech_low',
            index: 24,
            duration: 24,
            elements: [
              {
                id: 'el_title_text',
                type: 'text',
                      mode: 'static',
                text: 'FROG BLENDER 2000',
                i18nKey: 'title',
                fontId: 'font_system',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#fde047',
                align: 'left',
                width: 320,
                height: 32,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 24, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'el_speech_bubble_bg',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 390, y: 35, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 16 0 L 254 0 C 262.8 0 270 7.2 270 16 L 270 64 C 270 72.8 262.8 80 254 80 L 70 80 L 40 106 L 52 80 L 16 80 C 7.2 80 0 72.8 0 64 L 0 16 C 0 7.2 7.2 0 16 0 Z',
                    fill: { type: 'solid', color: '#fef08a' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                ],
              },
              {
                id: 'el_taunt_text_low',
                type: 'text',
                      mode: 'static',
                text: 'Whoa!! Nice jacuzzi!!',
                i18nKey: 'taunt_low',
                fontId: 'font_system',
                fontSize: 16,
                fontWeight: 800,
                color: '#854d0e',
                align: 'center',
                width: 250,
                height: 60,
                multiline: true,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 400, y: 52, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
          // Med speed speech bubble (frames 48-71)
          {
            id: 'kf_speech_med',
            index: 48,
            duration: 24,
            elements: [
              {
                id: 'el_title_text',
                type: 'text',
                      mode: 'static',
                text: 'FROG BLENDER 2000',
                i18nKey: 'title',
                fontId: 'font_system',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#fde047',
                align: 'left',
                width: 320,
                height: 32,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 24, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'el_speech_bubble_bg',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 390, y: 35, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 16 0 L 254 0 C 262.8 0 270 7.2 270 16 L 270 64 C 270 72.8 262.8 80 254 80 L 70 80 L 40 106 L 52 80 L 16 80 C 7.2 80 0 72.8 0 64 L 0 16 C 0 7.2 7.2 0 16 0 Z',
                    fill: { type: 'solid', color: '#ffedd5' },
                    stroke: { fill: { type: 'solid', color: '#ea580c' }, width: 3, cap: 'round', join: 'round' },
                  },
                ],
              },
              {
                id: 'el_taunt_text_med',
                type: 'text',
                      mode: 'static',
                text: "WAAAAH! I'M GETTING DIZZY!!",
                i18nKey: 'taunt_med',
                fontId: 'font_system',
                fontSize: 15,
                fontWeight: 900,
                color: '#c2410c',
                align: 'center',
                width: 250,
                height: 60,
                multiline: true,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 400, y: 52, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
          // Puree speed speech bubble (frames 72-95)
          {
            id: 'kf_speech_puree',
            index: 72,
            duration: 24,
            elements: [
              {
                id: 'el_title_text',
                type: 'text',
                      mode: 'static',
                text: 'FROG BLENDER 2000',
                i18nKey: 'title',
                fontId: 'font_system',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#fde047',
                align: 'left',
                width: 320,
                height: 32,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 30, y: 24, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              {
                id: 'el_speech_bubble_bg',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 380, y: 35, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 16 0 L 274 0 C 282.8 0 290 7.2 290 16 L 290 64 C 290 72.8 282.8 80 274 80 L 80 80 L 45 106 L 57 80 L 16 80 C 7.2 80 0 72.8 0 64 L 0 16 C 0 7.2 7.2 0 16 0 Z',
                    fill: { type: 'solid', color: '#fee2e2' },
                    stroke: { fill: { type: 'solid', color: '#dc2626' }, width: 3, cap: 'round', join: 'round' },
                  },
                ],
              },
              {
                id: 'el_taunt_text_puree',
                type: 'text',
                      mode: 'static',
                text: 'FROG SMOOTHIE SERVED! (Click OFF to Respawn)',
                i18nKey: 'taunt_puree',
                fontId: 'font_system',
                fontSize: 13,
                fontWeight: 900,
                color: '#b91c1c',
                align: 'center',
                width: 270,
                height: 60,
                multiline: true,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 390, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 2. GLASS PITCHER FRONT HIGHLIGHTS & MEASUREMENT TICKS
       * ====================================================================== */
      {
        id: 'layer_pitcher_front',
        name: 'Pitcher Glass & Markings',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_pitcher_front_0',
            index: 0,
            duration: 96,
            elements: [
              // Pitcher outline & glossy highlights
              {
                id: 'shape_pitcher_gloss',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 230, y: 110, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Glass Pitcher Boundary
                  {
                    d: 'M 10 10 L 230 10 L 205 240 L 35 240 Z',
                    fill: { type: 'solid', color: 'rgba(255, 255, 255, 0.04)' },
                    stroke: { fill: { type: 'solid', color: '#94a3b8' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Left curved reflection gloss
                  {
                    d: 'M 25 20 L 45 20 L 60 230 L 45 230 Z',
                    fill: { type: 'solid', color: 'rgba(255, 255, 255, 0.15)' },
                  },
                  // Measurement ticks on glass
                  {
                    d: 'M 190 60 L 210 60 M 185 100 L 205 100 M 180 140 L 200 140 M 175 180 L 195 180',
                    stroke: { fill: { type: 'solid', color: '#e2e8f0' }, width: 2, cap: 'round', join: 'miter' },
                  },
                  // Black rubber lid
                  {
                    d: 'M 0 0 L 240 0 C 242 0 244 3 244 6 L 244 14 C 244 17 242 20 240 20 L 0 20 C -2 20 -4 17 -4 14 L -4 6 C -4 3 -2 0 0 0 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                    stroke: { fill: { type: 'solid', color: '#334155' }, width: 2, cap: 'round', join: 'round' },
                  },
                  // Ergonomic glass handle on the right
                  {
                    d: 'M 225 35 C 270 45 275 170 205 190',
                    stroke: { fill: { type: 'solid', color: '#94a3b8' }, width: 10, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 3. THE CARTOON FROG (sym_frog) — Motion Tweens Across 4 States!
       * ====================================================================== */
      {
        id: 'layer_frog_character',
        name: 'Cartoon Frog',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          /* --- IDLE STATE (Frames 0–23): Bobbing gently y: 210 -> 222 -> 210 --- */
          {
            id: 'kf_frog_idle_start',
            index: 0,
            duration: 12,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 210, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Frog Body
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Frog Yellow-Green Belly
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  // Eyes (White Bulges)
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Black Pupils (Looking Smug/Right)
                  {
                    d: 'M -20 -25 A 6 6 0 1 0 -8 -25 A 6 6 0 1 0 -20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 20 -25 A 6 6 0 1 0 32 -25 A 6 6 0 1 0 20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  // Smug Cheeky Mouth
                  {
                    d: 'M -35 15 Q 0 35 35 15',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Webbed hands resting on glass
                  {
                    d: 'M -65 15 C -80 0 -85 25 -60 30 M 65 15 C 80 0 85 25 60 30',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_idle_mid',
            index: 12,
            duration: 11,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 222, scaleX: 1.04, scaleY: 0.96, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 2 0 1 0 -6 -25 A 18 2 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 2 0 1 0 42 -25 A 18 2 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -20 -25 A 6 1 0 1 0 -8 -25 A 6 1 0 1 0 -20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 20 -25 A 6 1 0 1 0 32 -25 A 6 1 0 1 0 20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -35 18 Q 0 38 35 18',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -65 18 C -80 3 -85 28 -60 33 M 65 18 C 80 3 85 28 60 33',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_idle_end',
            index: 23,
            duration: 1,
            actions: function () {
              this.gotoAndPlay(1);
            },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 210, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -20 -25 A 6 6 0 1 0 -8 -25 A 6 6 0 1 0 -20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 20 -25 A 6 6 0 1 0 32 -25 A 6 6 0 1 0 20 -25 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -35 15 Q 0 35 35 15',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -65 15 C -80 0 -85 25 -60 30 M 65 15 C 80 0 85 25 60 30',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },

          /* --- LOW SPEED (Frames 24–47): Jacuzzi Swaying rotation: -15 -> +15 -> -15 --- */
          {
            id: 'kf_frog_low_start',
            index: 24,
            duration: 12,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 335, y: 215, scaleX: 1.05, scaleY: 0.95, rotation: -15, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  // Big Relaxed Jacuzzi Eyes
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -22 -22 A 7 7 0 1 0 -8 -22 A 7 7 0 1 0 -22 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 18 -22 A 7 7 0 1 0 32 -22 A 7 7 0 1 0 18 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  // Happy Open Jacuzzi Smile
                  {
                    d: 'M -25 15 Q 0 42 25 15 Z',
                    fill: { type: 'solid', color: '#f43f5e' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Hand waving happily
                  {
                    d: 'M -65 15 C -85 -5 -90 20 -60 30 M 65 15 C 85 -20 100 5 70 25',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_low_mid',
            index: 36,
            duration: 11,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 365, y: 215, scaleX: 1.05, scaleY: 0.95, rotation: 15, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -26 -22 A 7 7 0 1 0 -12 -22 A 7 7 0 1 0 -26 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 14 -22 A 7 7 0 1 0 28 -22 A 7 7 0 1 0 14 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -25 15 Q 0 42 25 15 Z',
                    fill: { type: 'solid', color: '#f43f5e' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -65 15 C -85 -20 -100 5 -70 25 M 65 15 C 85 -5 90 20 60 30',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_low_end',
            index: 47,
            duration: 1,
            actions: function () {
              this.gotoAndPlay(25);
            },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 335, y: 215, scaleX: 1.05, scaleY: 0.95, rotation: -15, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -22 -22 A 7 7 0 1 0 -8 -22 A 7 7 0 1 0 -22 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M 18 -22 A 7 7 0 1 0 32 -22 A 7 7 0 1 0 18 -22 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -25 15 Q 0 42 25 15 Z',
                    fill: { type: 'solid', color: '#f43f5e' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -65 15 C -85 -5 -90 20 -60 30 M 65 15 C 85 -20 100 5 70 25',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },

          /* --- MED SPEED (Frames 48–71): Whirlpool 360 Spin & Squash/Stretch --- */
          {
            id: 'kf_frog_med_start',
            index: 48,
            duration: 12,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 215, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  // Dizzy Spiral Eyes
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Spiral Pupils
                  {
                    d: 'M -24 -25 C -24 -30 -16 -30 -16 -25 C -16 -20 -20 -20 -20 -25 M 24 -25 C 24 -30 32 -30 32 -25 C 32 -20 28 -20 28 -25',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Screaming "O" Mouth
                  {
                    d: 'M 0 15 A 14 18 0 1 0 0 16 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -65 15 C -85 -25 -100 0 -70 20 M 65 15 C 85 -25 100 0 70 20',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_med_mid',
            index: 60,
            duration: 11,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 210, scaleX: 0.82, scaleY: 1.15, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -24 -25 C -24 -30 -16 -30 -16 -25 C -16 -20 -20 -20 -20 -25 M 24 -25 C 24 -30 32 -30 32 -25 C 32 -20 28 -20 28 -25',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 0 15 A 14 18 0 1 0 0 16 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -65 15 C -85 -25 -100 0 -70 20 M 65 15 C 85 -25 100 0 70 20',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_med_end',
            index: 71,
            duration: 1,
            actions: function () {
              this.gotoAndPlay(49);
            },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 215, scaleX: 1, scaleY: 1, rotation: 360, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -55 20 C -60 -30 60 -30 55 20 C 50 65 -50 65 -55 20 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                    stroke: { fill: { type: 'solid', color: '#15803d' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -30 25 C -35 -5 35 -5 30 25 C 25 55 -25 55 -30 25 Z',
                    fill: { type: 'solid', color: '#86efac' },
                  },
                  {
                    d: 'M -42 -25 A 18 18 0 1 0 -6 -25 A 18 18 0 1 0 -42 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 6 -25 A 18 18 0 1 0 42 -25 A 18 18 0 1 0 6 -25 Z',
                    fill: { type: 'solid', color: '#ffffff' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -24 -25 C -24 -30 -16 -30 -16 -25 C -16 -20 -20 -20 -20 -25 M 24 -25 C 24 -30 32 -30 32 -25 C 32 -20 28 -20 28 -25',
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 3, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 0 15 A 14 18 0 1 0 0 16 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  {
                    d: 'M -65 15 C -85 -25 -100 0 -70 20 M 65 15 C 85 -25 100 0 70 20',
                    stroke: { fill: { type: 'solid', color: '#16a34a' }, width: 6, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },

          /* --- PUREE SPEED (Frames 72–95): Tornado Blur & Comical Smoothie Splat! --- */
          {
            id: 'kf_frog_puree_start',
            index: 72,
            duration: 12,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 0.95,
                visible: true,
                transform: { x: 348, y: 220, scaleX: 1.15, scaleY: 0.85, rotation: -10, skewX: 5, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Green & Pink Smoothie Splash Blur
                  {
                    d: 'M -80 0 Q -30 -70 0 -30 Q 40 -80 70 -20 Q 90 30 50 60 Q 0 90 -60 50 Q -90 30 -80 0 Z',
                    fill: { type: 'solid', color: '#f43f5e' },
                  },
                  {
                    d: 'M -60 10 Q -20 -50 10 -20 Q 30 -60 60 -10 Q 70 30 30 50 Q -10 70 -50 40 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                  },
                  // Comical X_X Eyes Floating in smoothie
                  {
                    d: 'M -35 -20 L -15 -40 M -35 -40 L -15 -20',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 15 -20 L 35 -40 M 15 -40 L 35 -20',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  // Webbed foot popping up
                  {
                    d: 'M 40 10 C 60 5 70 30 50 35 M 45 15 L 65 20 M 40 25 L 55 35',
                    stroke: { fill: { type: 'solid', color: '#86efac' }, width: 4, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_puree_mid',
            index: 84,
            duration: 11,
            tween: { type: 'motion', easing: { type: 'linear' } },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 0.95,
                visible: true,
                transform: { x: 352, y: 218, scaleX: 0.88, scaleY: 1.18, rotation: 15, skewX: -5, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -70 -10 Q -40 -80 10 -40 Q 50 -70 80 -10 Q 80 40 40 70 Q -10 80 -70 40 Q -80 10 -70 -10 Z',
                    fill: { type: 'solid', color: '#10b981' },
                  },
                  {
                    d: 'M -50 0 Q -10 -60 20 -30 Q 40 -50 50 0 Q 60 40 20 60 Q -20 60 -40 30 Z',
                    fill: { type: 'solid', color: '#fb7185' },
                  },
                  {
                    d: 'M -30 -15 L -10 -35 M -30 -35 L -10 -15',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 20 -15 L 40 -35 M 20 -35 L 40 -15',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M -40 20 C -60 15 -70 40 -50 45',
                    stroke: { fill: { type: 'solid', color: '#86efac' }, width: 4, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          {
            id: 'kf_frog_puree_end',
            index: 95,
            duration: 1,
            actions: function () {
              this.gotoAndPlay(73);
            },
            elements: [
              {
                id: 'el_frog',
                type: 'shape',
                alpha: 0.95,
                visible: true,
                transform: { x: 348, y: 220, scaleX: 1.15, scaleY: 0.85, rotation: -10, skewX: 5, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -80 0 Q -30 -70 0 -30 Q 40 -80 70 -20 Q 90 30 50 60 Q 0 90 -60 50 Q -90 30 -80 0 Z',
                    fill: { type: 'solid', color: '#f43f5e' },
                  },
                  {
                    d: 'M -60 10 Q -20 -50 10 -20 Q 30 -60 60 -10 Q 70 30 30 50 Q -10 70 -50 40 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                  },
                  {
                    d: 'M -35 -20 L -15 -40 M -35 -40 L -15 -20',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 15 -20 L 35 -40 M 15 -40 L 35 -20',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 5, cap: 'round', join: 'round' },
                  },
                  {
                    d: 'M 40 10 C 60 5 70 30 50 35 M 45 15 L 65 20 M 40 25 L 55 35',
                    stroke: { fill: { type: 'solid', color: '#86efac' }, width: 4, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 4. LIQUID & VORTEX LAYER (Inside Pitcher)
       * ====================================================================== */
      {
        id: 'layer_liquid_vortex',
        name: 'Liquid & Vortex Waves',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          // Idle still water (0-23)
          {
            id: 'kf_liquid_idle',
            index: 0,
            duration: 24,
            elements: [
              {
                id: 'shape_liquid_idle',
                type: 'shape',
                alpha: 0.45,
                visible: true,
                transform: { x: 255, y: 275, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 10 0 C 60 4 130 -4 180 0 L 170 70 L 20 70 Z',
                    fill: { type: 'solid', color: '#38bdf8' },
                  },
                ],
              },
            ],
          },
          // Low swirling jacuzzi water (24-47)
          {
            id: 'kf_liquid_low',
            index: 24,
            duration: 24,
            elements: [
              {
                id: 'shape_liquid_low',
                type: 'shape',
                alpha: 0.6,
                visible: true,
                transform: { x: 250, y: 250, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 5 0 C 50 15 140 -15 190 0 L 175 95 L 15 95 Z',
                    fill: { type: 'solid', color: '#06b6d4' },
                  },
                  // Rising Jacuzzi bubbles
                  {
                    d: 'M 40 60 A 5 5 0 1 0 40 50 A 5 5 0 1 0 40 60 Z M 140 45 A 6 6 0 1 0 140 33 A 6 6 0 1 0 140 45 Z M 90 20 A 4 4 0 1 0 90 12 A 4 4 0 1 0 90 20 Z',
                    fill: { type: 'solid', color: '#e0f2fe' },
                  },
                ],
              },
            ],
          },
          // Med fast whirlpool vortex (48-71)
          {
            id: 'kf_liquid_med',
            index: 48,
            duration: 24,
            elements: [
              {
                id: 'shape_liquid_med',
                type: 'shape',
                alpha: 0.75,
                visible: true,
                transform: { x: 245, y: 210, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Funnel shaped whirlpool vortex
                  {
                    d: 'M 5 0 Q 100 80 100 135 Q 100 80 205 0 L 180 135 L 25 135 Z',
                    fill: { type: 'solid', color: '#0284c7' },
                  },
                  // Foam spirals
                  {
                    d: 'M 10 5 C 60 30 140 -10 195 5 M 40 45 C 80 65 120 35 160 45',
                    stroke: { fill: { type: 'solid', color: '#ffffff' }, width: 4, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          // Puree smoothie explosion (72-95)
          {
            id: 'kf_liquid_puree',
            index: 72,
            duration: 24,
            elements: [
              {
                id: 'shape_liquid_puree',
                type: 'shape',
                alpha: 0.85,
                visible: true,
                transform: { x: 240, y: 150, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Full Glass Smoothie Tornado
                  {
                    d: 'M 10 0 C 80 30 130 -20 210 0 L 185 195 L 30 195 Z',
                    fill: { type: 'solid', color: '#ec4899' },
                  },
                  // Splatters on glass
                  {
                    d: 'M 20 -20 A 8 8 0 1 0 20 -36 A 8 8 0 1 0 20 -20 Z M 190 -10 A 10 10 0 1 0 190 -30 A 10 10 0 1 0 190 -10 Z M 100 -25 A 6 6 0 1 0 100 -37 A 6 6 0 1 0 100 -25 Z',
                    fill: { type: 'solid', color: '#22c55e' },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 5. SPINNING BLENDER BLADES (At bottom of pitcher)
       * ====================================================================== */
      {
        id: 'layer_blender_blades',
        name: 'Blender Blades',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          // Idle stationary blade (0-23)
          {
            id: 'kf_blades_idle',
            index: 0,
            duration: 24,
            elements: [
              {
                id: 'shape_blades_idle',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 345, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Center blade bolt
                  {
                    d: 'M -8 -8 L 8 -8 L 8 8 L -8 8 Z',
                    fill: { type: 'solid', color: '#475569' },
                  },
                  // 4 Angled Chrome blades
                  {
                    d: 'M -35 -4 L -8 -2 L -8 2 L -30 6 Z M 35 4 L 8 2 L 8 -2 L 30 -6 Z',
                    fill: { type: 'solid', color: '#cbd5e1' },
                    stroke: { fill: { type: 'solid', color: '#64748b' }, width: 1.5, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          // Low rotating blade (24-47)
          {
            id: 'kf_blades_low',
            index: 24,
            duration: 24,
            elements: [
              {
                id: 'shape_blades_low',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 350, y: 345, scaleX: 1, scaleY: 1, rotation: 45, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M -8 -8 L 8 -8 L 8 8 L -8 8 Z',
                    fill: { type: 'solid', color: '#475569' },
                  },
                  {
                    d: 'M -35 -4 L -8 -2 L -8 2 L -30 6 Z M 35 4 L 8 2 L 8 -2 L 30 -6 Z M -4 -35 L -2 -8 L 2 -8 L 6 -30 Z M 4 35 L 2 8 L -2 8 L -6 30 Z',
                    fill: { type: 'solid', color: '#cbd5e1' },
                    stroke: { fill: { type: 'solid', color: '#64748b' }, width: 1.5, cap: 'round', join: 'round' },
                  },
                ],
              },
            ],
          },
          // Med fast blurred blade (48-71)
          {
            id: 'kf_blades_med',
            index: 48,
            duration: 24,
            elements: [
              {
                id: 'shape_blades_med',
                type: 'shape',
                alpha: 0.8,
                visible: true,
                transform: { x: 350, y: 345, scaleX: 1, scaleY: 1, rotation: 90, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 0 0 A 35 15 0 1 0 0.1 0 Z',
                    fill: { type: 'solid', color: 'rgba(203, 213, 225, 0.6)' },
                  },
                  {
                    d: 'M -8 -8 L 8 -8 L 8 8 L -8 8 Z',
                    fill: { type: 'solid', color: '#334155' },
                  },
                ],
              },
            ],
          },
          // Puree ultra-fast spinning blade disc (72-95)
          {
            id: 'kf_blades_puree',
            index: 72,
            duration: 24,
            elements: [
              {
                id: 'shape_blades_puree',
                type: 'shape',
                alpha: 0.9,
                visible: true,
                transform: { x: 350, y: 345, scaleX: 1, scaleY: 1, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  {
                    d: 'M 0 0 A 42 18 0 1 0 0.1 0 Z',
                    fill: { type: 'solid', color: 'rgba(255, 255, 255, 0.7)' },
                  },
                  {
                    d: 'M -8 -8 L 8 -8 L 8 8 L -8 8 Z',
                    fill: { type: 'solid', color: '#1e293b' },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 6. BLENDER BASE & INTERACTIVE SPEED BUTTONS
       * ====================================================================== */
      {
        id: 'layer_blender_base_controls',
        name: 'Blender Base & Buttons',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_base_0',
            index: 0,
            duration: 96,
            elements: [
              // Metallic Blender Base Unit
              {
                id: 'shape_blender_base',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 215, y: 350, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Upper metallic collar
                  {
                    d: 'M 40 0 L 230 0 L 245 25 L 25 25 Z',
                    fill: { type: 'solid', color: '#64748b' },
                    stroke: { fill: { type: 'solid', color: '#94a3b8' }, width: 2, cap: 'round', join: 'round' },
                  },
                  // Main tapered body
                  {
                    d: 'M 25 25 L 245 25 L 265 140 L 5 140 Z',
                    fill: { type: 'solid', color: '#334155' },
                    stroke: { fill: { type: 'solid', color: '#475569' }, width: 3, cap: 'round', join: 'round' },
                  },
                  // Heavy rubber base feet
                  {
                    d: 'M 0 140 L 270 140 L 270 152 L 0 152 Z',
                    fill: { type: 'solid', color: '#0f172a' },
                  },
                  // Speed button housing inset bezel
                  {
                    d: 'M 20 65 L 250 65 C 254 65 256 67 256 71 L 256 125 C 256 129 254 131 250 131 L 20 131 C 16 131 14 129 14 125 L 14 71 C 14 67 16 65 20 65 Z',
                    fill: { type: 'solid', color: '#1e293b' },
                    stroke: { fill: { type: 'solid', color: '#0f172a' }, width: 2, cap: 'round', join: 'round' },
                  },
                ],
              },
              // Raster Bitmap Asset: ACME Serial Decal on the base
              {
                id: 'el_acme_badge_bmp',
                type: 'bitmap',
                bitmapId: 'bmp_acme_badge',
                width: 110,
                height: 26,
                alpha: 1,
                visible: true,
                transform: { x: 295, y: 382, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              // Button 1: OFF / RESET
              {
                id: 'inst_btn_off',
                type: 'instance',
                symbolId: 'sym_btn_off',
                instanceName: 'btn_off',
                alpha: 1,
                visible: true,
                transform: { x: 238, y: 432, scaleX: 0.95, scaleY: 0.95, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                events: {
                  onRelease: function () {
                    this.root.gotoAndPlay('idle');
                  },
                },
              },
              // Button 2: 1: LOW
              {
                id: 'inst_btn_low',
                type: 'instance',
                symbolId: 'sym_btn_low',
                instanceName: 'btn_low',
                alpha: 1,
                visible: true,
                transform: { x: 298, y: 432, scaleX: 0.95, scaleY: 0.95, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                events: {
                  onRelease: function () {
                    this.root.gotoAndPlay('low');
                  },
                },
              },
              // Button 3: 2: MED
              {
                id: 'inst_btn_med',
                type: 'instance',
                symbolId: 'sym_btn_med',
                instanceName: 'btn_med',
                alpha: 1,
                visible: true,
                transform: { x: 358, y: 432, scaleX: 0.95, scaleY: 0.95, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                events: {
                  onRelease: function () {
                    this.root.gotoAndPlay('med');
                  },
                },
              },
              // Button 4: 3: PUREE
              {
                id: 'inst_btn_puree',
                type: 'instance',
                symbolId: 'sym_btn_puree',
                instanceName: 'btn_puree',
                alpha: 1,
                visible: true,
                transform: { x: 418, y: 432, scaleX: 0.95, scaleY: 0.95, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                events: {
                  onRelease: function () {
                    this.root.gotoAndPlay('puree');
                  },
                },
              },
            ],
          },
        ],
      },

      /* ======================================================================
       * 7. RETRO KITCHEN COUNTER & LAB TILES BACKDROP
       * ====================================================================== */
      {
        id: 'layer_backdrop_countertop',
        name: 'Countertop & Lab Backdrop',
        kind: 'normal',
        visible: true,
        locked: true,
        keyframes: [
          {
            id: 'kf_bg_0',
            index: 0,
            duration: 96,
            elements: [
              // Retro Kitchen Tiles & Wall Grid
              {
                id: 'shape_lab_wall_tiles',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Slate Wall Background
                  {
                    d: 'M 0 0 L 700 0 L 700 400 L 0 400 Z',
                    fill: { type: 'solid', color: '#111827' },
                  },
                  // Laboratory Tile Grid Lines
                  {
                    d: 'M 0 80 L 700 80 M 0 160 L 700 160 M 0 240 L 700 240 M 0 320 L 700 320 M 0 400 L 700 400 M 100 0 L 100 400 M 200 0 L 200 400 M 300 0 L 300 400 M 400 0 L 400 400 M 500 0 L 500 400 M 600 0 L 600 400',
                    stroke: { fill: { type: 'solid', color: 'rgba(255, 255, 255, 0.05)' }, width: 1, cap: 'butt', join: 'miter' },
                  },
                  // Wall Warning Sign (Hazard Stripes)
                  {
                    d: 'M 40 100 L 180 100 L 180 145 L 40 145 Z',
                    fill: { type: 'solid', color: '#eab308' },
                    stroke: { fill: { type: 'solid', color: '#000000' }, width: 2, cap: 'square', join: 'miter' },
                  },
                  {
                    d: 'M 50 145 L 65 100 M 80 145 L 95 100 M 110 145 L 125 100 M 140 145 L 155 100',
                    stroke: { fill: { type: 'solid', color: '#000000' }, width: 6, cap: 'square', join: 'miter' },
                  },
                ],
              },
              // Warning text on sign
              {
                id: 'txt_warning_sign',
                type: 'text',
                      mode: 'static',
                text: 'CAUTION: 2000W BLENDER',
                fontId: 'font_system',
                fontSize: 8,
                fontWeight: 900,
                color: '#000000',
                align: 'center',
                width: 140,
                height: 12,
                multiline: false,
                selectable: false,
                alpha: 1,
                visible: true,
                transform: { x: 40, y: 150, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              },
              // Kitchen / Lab Countertop
              {
                id: 'shape_countertop',
                type: 'shape',
                alpha: 1,
                visible: true,
                transform: { x: 0, y: 400, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                paths: [
                  // Upper Counter Bevel Edge
                  {
                    d: 'M 0 0 L 700 0 L 700 16 L 0 16 Z',
                    fill: { type: 'solid', color: '#475569' },
                  },
                  // Counter Face
                  {
                    d: 'M 0 16 L 700 16 L 700 120 L 0 120 Z',
                    fill: { type: 'solid', color: '#1e293b' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const onboardingRoot: TimelineDef = {
  frameCount: 48,
  layers: [
    {
      id: 'layer_ob_back_btn',
      name: 'Back Button',
      kind: 'normal',
      visible: true,
      locked: false,
      keyframes: [
        {
          id: 'kf_ob_back_btn',
          index: 0,
          duration: 48,
          elements: [
            {
              id: 'btn_back',
              instanceName: 'btn_back',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 250, y: 410, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 8 C 0 3.6 3.6 0 8 0 L 192 0 C 196.4 0 200 3.6 200 8 L 200 36 C 200 40.4 196.4 44 192 44 L 8 44 C 3.6 44 0 40.4 0 36 Z',
                  fill: { type: 'solid', color: '#059669' },
                  stroke: { fill: { type: 'solid', color: '#34d399' }, width: 2, cap: 'round', join: 'round' },
                },
              ],
              events: {
                onClick: function (this: any) {
                  this.gotoArtboard('artboard-blender', { type: 'fade', duration: 400 });
                },
                onRelease: function (this: any) {
                  this.gotoArtboard('artboard-blender', { type: 'fade', duration: 400 });
                },
              },
            },
            {
              id: 'txt_btn_back',
              instanceName: 'txt_btn_back',
              type: 'text',
              mode: 'static',
              text: '⤺ Back to Blender',
              fontId: 'font_system',
              fontSize: 14,
              fontWeight: 700,
              color: '#ffffff',
              align: 'center',
              width: 200,
              height: 24,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 250, y: 422, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
          ],
        },
      ],
    },
    {
      id: 'layer_ob_cards',
      name: 'Feature Cards',
      kind: 'normal',
      visible: true,
      locked: false,
      keyframes: [
        {
          id: 'kf_ob_cards',
          index: 0,
          duration: 48,
          elements: [
            // Card 1
            {
              id: 'card_1_bg',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 60, y: 150, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 8 C 0 3.6 3.6 0 8 0 L 262 0 C 266.4 0 270 3.6 270 8 L 270 102 C 270 106.4 266.4 110 262 110 L 8 110 C 3.6 110 0 106.4 0 102 Z',
                  fill: { type: 'solid', color: '#1e293b' },
                  stroke: { fill: { type: 'solid', color: '#334155' }, width: 1, cap: 'round', join: 'round' },
                },
              ],
            },
            {
              id: 'card_1_title',
              type: 'text',
              mode: 'static',
              text: '🎨 Tabbed Artboards',
              fontId: 'font_system',
              fontSize: 14,
              fontWeight: 700,
              color: '#38bdf8',
              align: 'left',
              width: 240,
              height: 20,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 75, y: 165, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            {
              id: 'card_1_desc',
              type: 'text',
              mode: 'static',
              text: 'Switch between responsive screens seamlessly with dedicated root timelines and stage sizes.',
              fontId: 'font_system',
              fontSize: 11,
              color: '#94a3b8',
              align: 'left',
              width: 240,
              height: 50,
              multiline: true,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 75, y: 195, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            // Card 2
            {
              id: 'card_2_bg',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 370, y: 150, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 8 C 0 3.6 3.6 0 8 0 L 262 0 C 266.4 0 270 3.6 270 8 L 270 102 C 270 106.4 266.4 110 262 110 L 8 110 C 3.6 110 0 106.4 0 102 Z',
                  fill: { type: 'solid', color: '#1e293b' },
                  stroke: { fill: { type: 'solid', color: '#334155' }, width: 1, cap: 'round', join: 'round' },
                },
              ],
            },
            {
              id: 'card_2_title',
              type: 'text',
              mode: 'static',
              text: '⚡ No-Code Actions',
              fontId: 'font_system',
              fontSize: 14,
              fontWeight: 700,
              color: '#34d399',
              align: 'left',
              width: 240,
              height: 20,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 385, y: 165, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            {
              id: 'card_2_desc',
              type: 'text',
              mode: 'static',
              text: "Preset actions trigger gotoArtboard('id') with smooth fade or slide Web Animations transitions.",
              fontId: 'font_system',
              fontSize: 11,
              color: '#94a3b8',
              align: 'left',
              width: 240,
              height: 50,
              multiline: true,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 385, y: 195, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            // Card 3
            {
              id: 'card_3_bg',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 60, y: 280, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 8 C 0 3.6 3.6 0 8 0 L 262 0 C 266.4 0 270 3.6 270 8 L 270 92 C 270 96.4 266.4 100 262 100 L 8 100 C 3.6 100 0 96.4 0 92 Z',
                  fill: { type: 'solid', color: '#1e293b' },
                  stroke: { fill: { type: 'solid', color: '#334155' }, width: 1, cap: 'round', join: 'round' },
                },
              ],
            },
            {
              id: 'card_3_title',
              type: 'text',
              mode: 'static',
              text: '♿ Reduced Motion',
              fontId: 'font_system',
              fontSize: 14,
              fontWeight: 700,
              color: '#fbbf24',
              align: 'left',
              width: 240,
              height: 20,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 75, y: 295, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            {
              id: 'card_3_desc',
              type: 'text',
              mode: 'static',
              text: 'Honors prefers-reduced-motion automatically, swapping without disorientation.',
              fontId: 'font_system',
              fontSize: 11,
              color: '#94a3b8',
              align: 'left',
              width: 240,
              height: 40,
              multiline: true,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 75, y: 325, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            // Card 4
            {
              id: 'card_4_bg',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 370, y: 280, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 8 C 0 3.6 3.6 0 8 0 L 262 0 C 266.4 0 270 3.6 270 8 L 270 92 C 270 96.4 266.4 100 262 100 L 8 100 C 3.6 100 0 96.4 0 92 Z',
                  fill: { type: 'solid', color: '#1e293b' },
                  stroke: { fill: { type: 'solid', color: '#334155' }, width: 1, cap: 'round', join: 'round' },
                },
              ],
            },
            {
              id: 'card_4_title',
              type: 'text',
              mode: 'static',
              text: '🔄 Backward Compatible',
              fontId: 'font_system',
              fontSize: 14,
              fontWeight: 700,
              color: '#c084fc',
              align: 'left',
              width: 240,
              height: 20,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 385, y: 295, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            {
              id: 'card_4_desc',
              type: 'text',
              mode: 'static',
              text: 'Serializer automatically omits default single artboards for ultra-concise files.',
              fontId: 'font_system',
              fontSize: 11,
              color: '#94a3b8',
              align: 'left',
              width: 240,
              height: 40,
              multiline: true,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 385, y: 325, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
          ],
        },
      ],
    },
    {
      id: 'layer_ob_header',
      name: 'Header & Title',
      kind: 'normal',
      visible: true,
      locked: false,
      keyframes: [
        {
          id: 'kf_ob_header',
          index: 0,
          duration: 48,
          elements: [
            {
              id: 'txt_ob_title',
              type: 'text',
              mode: 'static',
              text: 'FLASHBACK MULTI-ARTBOARD ENGINE',
              fontId: 'font_system',
              fontSize: 22,
              fontWeight: 900,
              color: '#f8fafc',
              align: 'center',
              width: 700,
              height: 30,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 0, y: 45, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
            {
              id: 'txt_ob_subtitle',
              type: 'text',
              mode: 'static',
              text: 'Phase 5: Tabbed Artboards, Transitions & Interactive Navigation',
              fontId: 'font_system',
              fontSize: 13,
              fontWeight: 500,
              color: '#94a3b8',
              align: 'center',
              width: 700,
              height: 20,
              multiline: false,
              selectable: false,
              alpha: 1,
              visible: true,
              transform: { x: 0, y: 80, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
            },
          ],
        },
      ],
    },
    {
      id: 'layer_ob_bg',
      name: 'Backdrop',
      kind: 'normal',
      visible: true,
      locked: false,
      keyframes: [
        {
          id: 'kf_ob_bg',
          index: 0,
          duration: 48,
          elements: [
            {
              id: 'shape_ob_bg',
              type: 'shape',
              alpha: 1,
              visible: true,
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
              paths: [
                {
                  d: 'M 0 0 L 700 0 L 700 520 L 0 520 Z',
                  fill: { type: 'solid', color: '#0f172a' },
                },
                {
                  d: 'M 350 150 m -120 0 a 120 120 0 1 0 240 0 a 120 120 0 1 0 -240 0',
                  stroke: { fill: { type: 'solid', color: 'rgba(56, 189, 248, 0.08)' }, width: 40, cap: 'round', join: 'round' },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

frogBlenderAnim.artboards = [
  {
    id: 'artboard-blender',
    name: 'Frog Blender',
    width: 700,
    height: 520,
    background: {
      type: 'solid',
      color: '#111827',
    },
    root: frogBlenderAnim.root,
  },
  {
    id: 'artboard-onboarding',
    name: 'Get Started & Controls',
    width: 700,
    height: 520,
    background: {
      type: 'solid',
      color: '#0f172a',
    },
    root: onboardingRoot,
  },
];
frogBlenderAnim.activeArtboardId = 'artboard-blender';

export default frogBlenderAnim;
