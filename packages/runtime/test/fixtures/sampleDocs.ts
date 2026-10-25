import {
  defineAnimation,
  type AnimDocument,
  SCHEMA_VERSION,
} from '../../src/schema';

/**
 * Fixture 1: Proxy traversal & parent/child interaction
 * Tests:
 * - this.myButton.play()
 * - this.parent.gotoAndStop(5)
 * - getChild / getChildByPath
 */
export const buttonTraversalDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'button-traversal',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#ffffff' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {
      btn_sym: {
        id: 'btn_sym',
        name: 'MyButtonSymbol',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 5,
          layers: [
            {
              id: 'btn_layer_1',
              name: 'ButtonLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'btn_kf_1',
                  index: 0,
                  duration: 5,
                  elements: [],
                  actions: function () {
                    // Test inner script accessing parent proxy
                    (this as any).buttonActionsFired = true;
                  },
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
    frameCount: 10,
    layers: [
      {
        id: 'root_layer_1',
        name: 'MainLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'root_kf_1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'btn_instance_1',
                type: 'instance',
                symbolId: 'btn_sym',
                instanceName: 'myButton',
                transform: {
                  x: 100,
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
              },
            ],
            actions: function () {
              // Root script accessing child proxy
              (this as any).rootFired = true;
            },
          },
        ],
      },
    ],
  },
});

/**
 * Fixture 2: Element Persistence across keyframes and Timer Cleanup on removal
 */
export const persistenceAndTimersDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'persistence-and-timers',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#ffffff' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {
      persist_sym: {
        id: 'persist_sym',
        name: 'PersistClip',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 1,
          layers: [],
        },
      },
      temp_sym: {
        id: 'temp_sym',
        name: 'TempClip',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 1,
          layers: [],
        },
      },
    },
    audio: {},
    fonts: {},
    bitmaps: {},
  },
  root: {
    frameCount: 6,
    layers: [
      {
        id: 'layer_persisted',
        name: 'PersistedLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_p1',
            index: 0,
            duration: 2,
            elements: [
              {
                id: 'stable_id_1',
                type: 'instance',
                symbolId: 'persist_sym',
                instanceName: 'persisted',
                transform: {
                  x: 10,
                  y: 10,
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
          {
            id: 'kf_p2',
            index: 2,
            duration: 4,
            elements: [
              {
                // SAME stable ID: 'stable_id_1'
                id: 'stable_id_1',
                type: 'instance',
                symbolId: 'persist_sym',
                instanceName: 'persisted',
                transform: {
                  x: 50,
                  y: 60,
                  scaleX: 2,
                  scaleY: 2,
                  rotation: 45,
                  skewX: 0,
                  skewY: 0,
                  originX: 0,
                  originY: 0,
                },
                alpha: 0.8,
                visible: true,
              },
            ],
          },
        ],
      },
      {
        id: 'layer_temporary',
        name: 'TempLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_t1',
            index: 0,
            duration: 2,
            elements: [
              {
                id: 'temp_id_1',
                type: 'instance',
                symbolId: 'temp_sym',
                instanceName: 'tempClip',
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
              },
            ],
          },
          // Frames 2-5 are empty on this layer! (tempClip is unmounted)
        ],
      },
    ],
  },
});

/**
 * Fixture 3: Frame labels & seeking
 */
export const labelsDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'labels-doc',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#ffffff' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {},
    audio: {},
    fonts: {},
    bitmaps: {},
  },
  root: {
    frameCount: 12,
    labels: {
      intro: 0,
      middle: 4,
      outro: 9,
    },
    layers: [
      {
        id: 'layer_1',
        name: 'LabelsLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_1',
            index: 0,
            duration: 4,
            label: 'intro',
            elements: [],
            actions: function () {
              this.vars.atIntro = true;
            },
          },
          {
            id: 'kf_2',
            index: 4,
            duration: 5,
            label: 'middle',
            elements: [],
            actions: function () {
              this.vars.atMiddle = true;
            },
          },
          {
            id: 'kf_3',
            index: 9,
            duration: 3,
            label: 'outro',
            elements: [],
            actions: function () {
              this.vars.atOutro = true;
            },
          },
        ],
      },
    ],
  },
});

/**
 * Fixture 4: Script execution order ('parent-first' vs 'children-first')
 */
export const scriptOrderDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'script-order',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#ffffff' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {
      child_sym: {
        id: 'child_sym',
        name: 'ChildClip',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 3,
          layers: [
            {
              id: 'child_l1',
              name: 'L1',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'c_kf1',
                  index: 0,
                  duration: 1,
                  elements: [],
                  actions: function () {
                    const log = (this.stage.global.log ??= []) as string[];
                    log.push('child:action:1');
                  },
                },
                {
                  id: 'c_kf2',
                  index: 1,
                  duration: 1,
                  elements: [],
                  actions: function () {
                    const log = (this.stage.global.log ??= []) as string[];
                    log.push('child:action:2');
                  },
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
    frameCount: 3,
    layers: [
      {
        id: 'root_l1',
        name: 'RootLayer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'r_kf1',
            index: 0,
            duration: 1,
            elements: [
              {
                id: 'child_instance_id',
                type: 'instance',
                symbolId: 'child_sym',
                instanceName: 'childClip',
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
                events: {
                  onEnterFrame: function () {
                    const log = (this.stage.global.log ??= []) as string[];
                    log.push('child:onEnterFrame');
                  },
                },
              },
            ],
            actions: function () {
              const log = (this.stage.global.log ??= []) as string[];
              log.push('parent:action:1');
            },
          },
          {
            id: 'r_kf2',
            index: 1,
            duration: 1,
            elements: [
              {
                id: 'child_instance_id',
                type: 'instance',
                symbolId: 'child_sym',
                instanceName: 'childClip',
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
              },
            ],
            actions: function () {
              const log = (this.stage.global.log ??= []) as string[];
              log.push('parent:action:2');
            },
          },
        ],
      },
    ],
  },
});

/**
 * Fixture 5: Mid-script gotoAndStop / gotoAndPlay semantics
 */
export const midScriptGotoDoc: AnimDocument = defineAnimation({
  version: SCHEMA_VERSION,
  meta: {
    name: 'mid-script-goto',
    createdAt: '2026-10-24T00:00:00Z',
    modifiedAt: '2026-10-24T00:00:00Z',
    editorVersion: '0.1.0',
  },
  stage: {
    width: 550,
    height: 400,
    fps: 24,
    background: { type: 'solid', color: '#ffffff' },
    scaleMode: 'showAll',
  },
  library: {
    symbols: {
      target_sym: {
        id: 'target_sym',
        name: 'TargetClip',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 1,
          layers: [],
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
        id: 'layer_1',
        name: 'L1',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf_1',
            index: 0,
            duration: 2,
            elements: [],
            actions: function () {
              // Frame 1 script performs gotoAndStop(3)
              this.gotoAndStop(3);
              // Non-terminating: subsequent code continues executing
              this.vars.afterGotoExecuted = true;
              // Immediate display list update: frame 3's element is already mounted!
              this.vars.canSeeFrame3Element = (this as any).frame3Elem !== undefined;
            },
          },
          {
            id: 'kf_2',
            index: 2,
            duration: 3,
            elements: [
              {
                id: 'elem_frame_3',
                type: 'instance',
                symbolId: 'target_sym',
                instanceName: 'frame3Elem',
                transform: {
                  x: 10,
                  y: 20,
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
              this.vars.frame3ActionsRan = true;
            },
          },
        ],
      },
    ],
  },
});
