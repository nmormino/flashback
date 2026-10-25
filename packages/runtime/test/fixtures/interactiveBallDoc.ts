import {
  defineAnimation,
  type AnimDocument,
  SCHEMA_VERSION,
} from '../../src/schema';

/**
 * Example interactive document fixture:
 * - Shows buttons (kind: 'button', 4 frames: up, over, down, hit)
 * - Nested symbol (ball_sym contains ball_highlight_sym)
 * - Root script with `this.ball.gotoAndStop(2)`
 */
export const interactiveBallDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'interactive-ball',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#1a1a1a' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {
      // Nested symbol: highlight glint inside the ball
      ball_highlight_sym: {
        id: 'ball_highlight_sym',
        name: 'BallHighlight',
        kind: 'graphic',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 'layer_hl',
              name: 'HighlightLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_hl',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_hl',
                      type: 'shape',
                      transform: {
                        x: 8,
                        y: 8,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 0.8,
                      visible: true,
                      paths: [
                        {
                          d: 'M 0 0 C 4 0 8 4 8 8 C 8 12 4 12 0 8 Z',
                          fill: { type: 'solid', color: '#ffffff' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },

      // Ball symbol: multi-frame MovieClip with nested highlight symbol
      ball_sym: {
        id: 'ball_sym',
        name: 'BallSymbol',
        kind: 'movieclip',
        registration: { x: 25, y: 25 },
        timeline: {
          frameCount: 3,
          labels: {
            red: 0,
            blue: 1,
            green: 2,
          },
          layers: [
            {
              id: 'ball_nested_layer',
              name: 'HighlightNestedLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf_nested_hl',
                  index: 0,
                  duration: 3,
                  elements: [
                    {
                      id: 'nested_hl_inst',
                      type: 'instance',
                      symbolId: 'ball_highlight_sym',
                      instanceName: 'highlight',
                      transform: {
                        x: 5,
                        y: 5,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                    },
                  ],
                },
              ],
            },
            {
              id: 'ball_base_layer',
              name: 'BallBaseLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                // Frame 1: Red circle
                {
                  id: 'kf_ball_1',
                  index: 0,
                  duration: 1,
                  label: 'red',
                  elements: [
                    {
                      id: 'shape_ball_red',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 25 0 A 25 25 0 1 1 24.9 0 Z',
                          fill: { type: 'solid', color: '#ff4444' },
                        },
                      ],
                    },
                  ],
                },
                // Frame 2: Blue circle
                {
                  id: 'kf_ball_2',
                  index: 1,
                  duration: 1,
                  label: 'blue',
                  elements: [
                    {
                      id: 'shape_ball_blue',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 25 0 A 25 25 0 1 1 24.9 0 Z',
                          fill: { type: 'solid', color: '#4488ff' },
                        },
                      ],
                    },
                  ],
                },
                // Frame 3: Green circle
                {
                  id: 'kf_ball_3',
                  index: 2,
                  duration: 1,
                  label: 'green',
                  elements: [
                    {
                      id: 'shape_ball_green',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 25 0 A 25 25 0 1 1 24.9 0 Z',
                          fill: { type: 'solid', color: '#44cc44' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },

      // Button symbol: kind 'button', 4 frames (up, over, down, hit)
      btn_sym: {
        id: 'btn_sym',
        name: 'ButtonSymbol',
        kind: 'button',
        registration: { x: 50, y: 15 },
        timeline: {
          frameCount: 4,
          layers: [
            {
              id: 'btn_layer_bg',
              name: 'ButtonBg',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                // Up frame (index 0)
                {
                  id: 'btn_kf_up',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_up',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 0 0 L 100 0 L 100 30 L 0 30 Z',
                          fill: { type: 'solid', color: '#555555' },
                        },
                      ],
                    },
                  ],
                },
                // Over frame (index 1)
                {
                  id: 'btn_kf_over',
                  index: 1,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_over',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 0 0 L 100 0 L 100 30 L 0 30 Z',
                          fill: { type: 'solid', color: '#777777' },
                        },
                      ],
                    },
                  ],
                },
                // Down frame (index 2)
                {
                  id: 'btn_kf_down',
                  index: 2,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_down',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 0 0 L 100 0 L 100 30 L 0 30 Z',
                          fill: { type: 'solid', color: '#333333' },
                        },
                      ],
                    },
                  ],
                },
                // Hit frame (index 3)
                {
                  id: 'btn_kf_hit',
                  index: 3,
                  duration: 1,
                  elements: [
                    {
                      id: 'shape_btn_hit',
                      type: 'shape',
                      transform: {
                        x: 0,
                        y: 0,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 0,
                        originY: 0,
                      },
                      alpha: 1,
                      visible: true,
                      paths: [
                        {
                          d: 'M 0 0 L 100 0 L 100 30 L 0 30 Z',
                          fill: { type: 'solid', color: '#000000' },
                        },
                      ],
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
    fonts: {},
    bitmaps: {},
  },
  root: {
    frameCount: 5,
    layers: [
      {
        id: 'root_btn_layer',
        name: 'ButtonLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_root_btn',
            index: 0,
            duration: 5,
            elements: [
              {
                id: 'btn_instance_1',
                type: 'instance',
                symbolId: 'btn_sym',
                instanceName: 'btn',
                transform: {
                  x: 50,
                  y: 50,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  skewX: 0,
                  skewY: 0,
                  originX: 0,
                  originY: 0,
                },
                alpha: 1,
                visible: true,
                events: {
                  onPress: function () {
                    (this.parent as any).ball.gotoAndStop(2);
                  },
                },
              },
            ],
          },
        ],
      },
      {
        id: 'root_ball_layer',
        name: 'BallLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_root_ball',
            index: 0,
            duration: 5,
            elements: [
              {
                id: 'ball_instance_1',
                type: 'instance',
                symbolId: 'ball_sym',
                instanceName: 'ball',
                transform: {
                  x: 200,
                  y: 150,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  skewX: 0,
                  skewY: 0,
                  originX: 0,
                  originY: 0,
                },
                alpha: 1,
                visible: true,
              },
            ],
            actions: function () {
              // Direct timeline script with this.ball.gotoAndStop(2)
              (this as any).ball.gotoAndStop(2);
            },
          },
        ],
      },
    ],
  },
});

export default interactiveBallDoc;
