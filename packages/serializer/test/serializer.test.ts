import { describe, it, expect } from 'vitest';
import {
  serialize,
  parse,
  validate,
  hydrate,
  compileScript,
  ParseError,
  ValidationError,
  SerializeError,
  type EditorDocument,
} from '../src/index.js';
import {
  buttonTraversalDoc,
  persistenceAndTimersDoc,
  labelsDoc,
  scriptOrderDoc,
  midScriptGotoDoc,
} from '../../runtime/test/fixtures/sampleDocs.js';
import type { AnimDocument } from '@flashback/runtime';

function roundTrip(doc: EditorDocument | AnimDocument, options?: { defineAnimation?: boolean }): string {
  const text1 = serialize(doc, options);
  const parsed = parse(text1);
  const validated = validate(parsed);
  const text2 = serialize(validated, options);
  expect(text2).toBe(text1);
  return text2;
}

describe('@flashback/serializer', () => {
  describe('Round-trip tests (doc -> serialize -> parse -> validate -> serialize produces identical text)', () => {
    it('round-trips buttonTraversalDoc fixture', () => {
      roundTrip(buttonTraversalDoc);
      roundTrip(buttonTraversalDoc, { defineAnimation: true });
    });

    it('round-trips persistenceAndTimersDoc fixture', () => {
      roundTrip(persistenceAndTimersDoc);
      roundTrip(persistenceAndTimersDoc, { defineAnimation: true });
    });

    it('round-trips labelsDoc fixture', () => {
      roundTrip(labelsDoc);
      roundTrip(labelsDoc, { defineAnimation: true });
    });

    it('round-trips scriptOrderDoc fixture', () => {
      roundTrip(scriptOrderDoc);
      roundTrip(scriptOrderDoc, { defineAnimation: true });
    });

    it('round-trips midScriptGotoDoc fixture', () => {
      roundTrip(midScriptGotoDoc);
      roundTrip(midScriptGotoDoc, { defineAnimation: true });
    });

    it('round-trips a comprehensive document with all element and script types', () => {
      const fullDoc: EditorDocument = {
        version: 1,
        meta: {
          name: 'full-test',
          author: 'Blaster Team',
          createdAt: '2026-10-24T00:00:00.000Z',
          modifiedAt: '2026-10-24T12:00:00.000Z',
          editorVersion: '0.1.0',
        },
        stage: {
          width: 800,
          height: 600,
          fps: 60,
          background: { type: 'solid', color: '#1a1a1a' },
          scaleMode: 'showAll',
        },
        library: {
          symbols: {
            sym_ball: {
              id: 'sym_ball',
              name: 'Ball',
              kind: 'movieclip',
              linkageId: 'BallExport',
              registration: { x: 25, y: 25 },
              behavior: {
                onConstruct() {
                  (this as any).speed = 10;
                },
                methods: {
                  bounce() {
                    (this as any).y -= 50;
                  },
                  reset(x, y) {
                    (this as any).x = x;
                    (this as any).y = y;
                  },
                },
              },
              timeline: {
                frameCount: 10,
                layers: [
                  {
                    id: 'ball_layer',
                    name: 'BallGraphics',
                    kind: 'normal',
                    visible: true,
                    locked: false,
                    keyframes: [
                      {
                        id: 'ball_kf_1',
                        index: 0,
                        duration: 10,
                        elements: [
                          {
                            id: 'shape_circle',
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
                                d: 'M 0 0 A 25 25 0 1 0 50 50 Z',
                                fill: { type: 'solid', color: '#ff0000' },
                                stroke: {
                                  fill: { type: 'solid', color: '#000000' },
                                  width: 2,
                                  cap: 'round',
                                  join: 'round',
                                },
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
          audio: {
            snd_hit: {
              id: 'snd_hit',
              name: 'hit.wav',
              src: 'audio/hit.wav',
              format: 'wav',
              durationMs: 450,
              preload: true,
            },
          },
          fonts: {
            fnt_main: {
              id: 'fnt_main',
              family: 'Roboto',
              src: 'fonts/roboto.woff2',
              format: 'woff2',
              weight: 400,
              style: 'normal',
            },
            fnt_var: {
              id: 'fnt_var',
              family: 'Inter',
              src: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap',
              format: 'css',
              weight: '100 900',
              style: 'all',
              variableRange: { min: 100, max: 900, default: 400 },
              availableStyles: ['normal', 'italic'],
            },
            fnt_multi: {
              id: 'fnt_multi',
              family: 'Fira Code',
              src: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap',
              format: 'css',
              weight: [400, 700],
              style: 'normal',
              availableWeights: [400, 700],
              availableStyles: ['normal'],
            },
          },
          bitmaps: {
            bmp_bg: {
              id: 'bmp_bg',
              name: 'bg.png',
              src: 'bitmaps/bg.png',
              width: 800,
              height: 600,
              smoothing: true,
            },
          },
          folders: [
            {
              id: 'folder_assets',
              name: 'Assets',
              items: ['snd_hit', 'bmp_bg'],
              children: [
                {
                  id: 'folder_sub',
                  name: 'Sub',
                  items: ['fnt_main'],
                },
              ],
            },
          ],
        },
        root: {
          frameCount: 30,
          labels: {
            intro: 0,
            loop: 10,
          },
          layers: [
            {
              id: 'guide_layer',
              name: 'GuideLayer',
              kind: 'guide',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'guide_kf_1',
                  index: 0,
                  duration: 30,
                  elements: [],
                },
              ],
            },
            {
              id: 'mask_layer',
              name: 'MaskLayer',
              kind: 'mask',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'mask_kf_1',
                  index: 0,
                  duration: 30,
                  elements: [],
                },
              ],
            },
            {
              id: 'content_layer',
              name: 'ContentLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              maskLayerId: 'mask_layer',
              keyframes: [
                {
                  id: 'kf_start',
                  index: 0,
                  duration: 10,
                  sound: {
                    audioId: 'snd_hit',
                    sync: 'start',
                    loops: 0,
                    volume: 0.8,
                    pan: 0,
                  },
                  tween: {
                    type: 'motion',
                    easing: { type: 'preset', name: 'ease-out' },
                    motionGuide: { layerId: 'guide_layer', orientToPath: true },
                  },
                  actions() {
                    (this as any).play();
                  },
                  elements: [
                    {
                      id: 'ball_inst_1',
                      type: 'instance',
                      symbolId: 'sym_ball',
                      instanceName: 'ballInstance',
                      transform: {
                        x: 100.1234,
                        y: 200.5678,
                        scaleX: 1.5,
                        scaleY: 1.5,
                        rotation: 45.5,
                        skewX: 0,
                        skewY: 0,
                        originX: 25,
                        originY: 25,
                      },
                      alpha: 0.95,
                      visible: true,
                      colorTransform: {
                        mode: 'tint',
                        tint: { color: '#00ff00', amount: 0.5 },
                      },
                      filters: [
                        { type: 'blur', radius: 4 },
                        { type: 'dropShadow', x: 2, y: 2, blur: 5, color: '#00000088' },
                      ],
                      blendMode: 'screen',
                      events: {
                        onPress(e) {
                          (this as any).bounce();
                        },
                        onRelease() {
                          (this as any).stop();
                        },
                      },
                    },
                    {
                      id: 'bitmap_inst',
                      type: 'bitmap',
                      bitmapId: 'bmp_bg',
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
                    {
                      id: 'text_inst',
                      type: 'text',
                      fontId: 'fnt_main',
                      text: 'Hello Blaster!',
                      fontSize: 24,
                      color: '#ffffff',
                      align: 'center',
                      width: 200,
                      height: 50,
                      mode: 'static',
                      multiline: false,
                      selectable: false,
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
                    },
                  ],
                },
                {
                  id: 'kf_end',
                  index: 10,
                  duration: 20,
                  sound: {
                    audioId: 'snd_hit',
                    sync: 'stop',
                    loops: 0,
                    volume: 1,
                  },
                  actions: {
                    __fn: 'this.stop();',
                  },
                  elements: [
                    {
                      id: 'ball_inst_1',
                      type: 'instance',
                      symbolId: 'sym_ball',
                      instanceName: 'ballInstance',
                      transform: {
                        x: 300,
                        y: 200,
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                        skewX: 0,
                        skewY: 0,
                        originX: 25,
                        originY: 25,
                      },
                      alpha: 1,
                      visible: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
        onInit() {
          (this as any).ready = true;
        },
      };

      roundTrip(fullDoc);
      roundTrip(fullDoc, { defineAnimation: true });
    });

    it('round-trips Infinity and -Infinity', () => {
      const doc: EditorDocument = {
        version: 1,
        meta: {
          name: 'inf-test',
          createdAt: '2026-10-24T00:00:00.000Z',
          modifiedAt: '2026-10-24T00:00:00.000Z',
          editorVersion: '0.1.0',
        },
        stage: {
          width: 500,
          height: 400,
          fps: 30,
          background: { type: 'solid', color: '#fff' },
          scaleMode: 'showAll',
        },
        library: {
          symbols: {},
          audio: {
            loop_snd: {
              id: 'loop_snd',
              name: 'loop.wav',
              src: 'loop.wav',
              format: 'wav',
              durationMs: 1000,
              preload: false,
            },
          },
          fonts: {},
          bitmaps: {},
        },
        root: {
          frameCount: 1,
          layers: [
            {
              id: 'l1',
              name: 'L1',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf1',
                  index: 0,
                  duration: 1,
                  sound: {
                    audioId: 'loop_snd',
                    sync: 'start',
                    loops: Infinity,
                    volume: 1,
                  },
                  elements: [],
                },
              ],
            },
          ],
        },
      };

      roundTrip(doc);
    });
  });

  describe('parse()', () => {
    it('parses bare JS object string', () => {
      const src = `{\n  version: 1,\n  meta: { name: "bare", createdAt: "2026-01-01", modifiedAt: "2026-01-01", editorVersion: "1.0" },\n  stage: { width: 400, height: 300, fps: 30, background: { type: "solid", color: "#000" }, scaleMode: "showAll" },\n  library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },\n  root: { frameCount: 1, layers: [] }\n}`;
      const doc = parse(src);
      expect(doc.version).toBe(1);
      expect(doc.meta.name).toBe('bare');
      expect(doc.stage.width).toBe(400);
    });

    it('parses wrapped JS object string ({ ... })', () => {
      const src = `({\n  version: 1,\n  meta: { name: "wrapped", createdAt: "2026-01-01", modifiedAt: "2026-01-01", editorVersion: "1.0" },\n  stage: { width: 400, height: 300, fps: 30, background: { type: "solid", color: "#000" }, scaleMode: "showAll" },\n  library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },\n  root: { frameCount: 1, layers: [] }\n})`;
      const doc = parse(src);
      expect(doc.version).toBe(1);
      expect(doc.meta.name).toBe('wrapped');
    });

    it('parses export default defineAnimation(...)', () => {
      const src = `import { defineAnimation } from "@flashback/runtime";\n\nexport default defineAnimation({\n  version: 1,\n  meta: { name: "defAnim", createdAt: "2026-01-01", modifiedAt: "2026-01-01", editorVersion: "1.0" },\n  stage: { width: 500, height: 400, fps: 30, background: { type: "solid", color: "#000" }, scaleMode: "showAll" },\n  library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },\n  root: { frameCount: 1, layers: [] }\n});`;
      const doc = parse(src);
      expect(doc.version).toBe(1);
      expect(doc.meta.name).toBe('defAnim');
    });

    it('parses variable declaration export default', () => {
      const src = `const doc = {\n  version: 1,\n  meta: { name: "varDoc", createdAt: "2026-01-01", modifiedAt: "2026-01-01", editorVersion: "1.0" },\n  stage: { width: 500, height: 400, fps: 30, background: { type: "solid", color: "#000" }, scaleMode: "showAll" },\n  library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },\n  root: { frameCount: 1, layers: [] }\n};\nexport default doc;\n`;
      const doc = parse(src);
      expect(doc.version).toBe(1);
      expect(doc.meta.name).toBe('varDoc');
    });

    it('extracts method scripts into { __fn }', () => {
      const src = `export default {\n  actions(e) {\n    this.stop();\n  }\n};`;
      const res = parse(src) as any;
      expect(res.actions).toEqual({
        __fn: 'function (e) {\n    this.stop();\n  }',
      });
    });

    it('extracts function expression scripts into { __fn }', () => {
      const src = `export default {\n  actions: function(e) {\n    this.play();\n  }\n};`;
      const res = parse(src) as any;
      expect(res.actions).toEqual({
        __fn: 'function (e) {\n    this.play();\n  }',
      });
    });

    it('throws ParseError on empty source', () => {
      expect(() => parse('')).toThrow(ParseError);
      expect(() => parse('   ')).toThrow(ParseError);
    });

    it('throws ParseError on syntax error', () => {
      expect(() => parse('export default { foo: ; };')).toThrow(ParseError);
    });

    it('throws ParseError on arrow function', () => {
      const src = `export default {\n  actions: () => { this.stop(); }\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });

    it('throws ParseError on async function', () => {
      const src = `export default {\n  async actions() { this.stop(); }\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });

    it('throws ParseError on generator function', () => {
      const src = `export default {\n  *actions() { yield 1; }\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });

    it('throws ParseError on script in array', () => {
      const src = `export default {\n  items: [function() {}]\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });

    it('throws ParseError on sparse array', () => {
      const src = `export default {\n  items: [1, , 3]\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });

    it('throws ParseError on getters and setters', () => {
      const src = `export default {\n  get foo() { return 1; }\n};`;
      expect(() => parse(src)).toThrow(ParseError);
    });
  });

  describe('validate()', () => {
    const validBaseDoc: AnimDocument = {
      version: 1,
      meta: {
        name: 'valid-base',
        createdAt: '2026-10-24T00:00:00Z',
        modifiedAt: '2026-10-24T00:00:00Z',
        editorVersion: '0.1.0',
      },
      stage: {
        width: 800,
        height: 600,
        fps: 60,
        background: { type: 'solid', color: '#fff' },
        scaleMode: 'showAll',
      },
      library: {
        symbols: {
          s1: {
            id: 's1',
            name: 'Symbol1',
            kind: 'movieclip',
            registration: { x: 0, y: 0 },
            timeline: {
              frameCount: 5,
              layers: [
                {
                  id: 's1_l1',
                  name: 'L1',
                  kind: 'normal',
                  visible: true,
                  locked: false,
                  keyframes: [
                    {
                      id: 's1_kf1',
                      index: 0,
                      duration: 5,
                      elements: [],
                    },
                  ],
                },
              ],
            },
          },
        },
        audio: {
          a1: {
            id: 'a1',
            name: 'a1.wav',
            src: 'a1.wav',
            format: 'wav',
            durationMs: 100,
            preload: false,
          },
        },
        fonts: {},
        bitmaps: {
          b1: {
            id: 'b1',
            name: 'b1.png',
            src: 'b1.png',
            width: 100,
            height: 100,
            smoothing: true,
          },
        },
      },
      root: {
        frameCount: 10,
        layers: [
          {
            id: 'root_l1',
            name: 'L1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'root_kf1',
                index: 0,
                duration: 10,
                elements: [
                  {
                    id: 'el_inst',
                    type: 'instance',
                    symbolId: 's1',
                    instanceName: 'inst1',
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
            ],
          },
        ],
      },
    };

    it('validates a valid document and returns it', () => {
      const res = validate(validBaseDoc);
      expect(res).toBe(validBaseDoc);
    });

    it('rejects unsupported schema version', () => {
      const bad = { ...validBaseDoc, version: 2 as any };
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects invalid stage properties', () => {
      expect(() => validate({ ...validBaseDoc, stage: { ...validBaseDoc.stage, width: -10 } })).toThrow(ValidationError);
      expect(() => validate({ ...validBaseDoc, stage: { ...validBaseDoc.stage, fps: 0 } })).toThrow(ValidationError);
    });

    it('rejects duplicate layer IDs', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers.push({ ...bad.root.layers[0] });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects non-existent maskLayerId', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].maskLayerId = 'non_existent_layer';
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects layer masking itself', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].maskLayerId = bad.root.layers[0].id;
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects layer parenting itself', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].parentLayerId = bad.root.layers[0].id;
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects non-existent parentLayerId', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].parentLayerId = 'unknown_folder_layer';
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects missing symbol reference', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].elements[0].symbolId = 'missing_symbol';
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects direct symbol recursion (symbol instance inside itself)', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.library.symbols.s1.timeline.layers[0].keyframes[0].elements.push({
        id: 'recursive_inst',
        type: 'instance',
        symbolId: 's1',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects indirect cyclic symbol references (s1 -> s2 -> s1)', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.library.symbols.s2 = {
        id: 's2',
        name: 'Symbol2',
        kind: 'movieclip',
        registration: { x: 0, y: 0 },
        timeline: {
          frameCount: 1,
          layers: [
            {
              id: 's2_l1',
              name: 'L1',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 's2_kf1',
                  index: 0,
                  duration: 1,
                  elements: [
                    {
                      id: 'cycle_inst',
                      type: 'instance',
                      symbolId: 's1',
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      alpha: 1,
                      visible: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      bad.library.symbols.s1.timeline.layers[0].keyframes[0].elements.push({
        id: 'to_s2',
        type: 'instance',
        symbolId: 's2',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects missing audio reference in sound', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].sound = {
        audioId: 'missing_audio',
        sync: 'event',
        loops: 0,
        volume: 1,
      };
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects missing bitmap reference in bitmap element', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].elements.push({
        id: 'bad_bmp_el',
        type: 'bitmap',
        bitmapId: 'missing_bitmap',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects duplicate element IDs in same keyframe', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].elements.push({
        id: 'el_inst', // duplicate
        type: 'bitmap',
        bitmapId: 'b1',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects duplicate instance names in same keyframe', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].elements.push({
        id: 'el_inst_2',
        type: 'instance',
        symbolId: 's1',
        instanceName: 'inst1', // duplicate instance name
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects overlapping keyframes', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes.push({
        id: 'overlapping_kf',
        index: 5, // Previous kf spans 0..10
        duration: 5,
        elements: [],
      });
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects keyframe span exceeding timeline frameCount', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.root.layers[0].keyframes[0].duration = 15; // frameCount is 10
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('rejects variable font with min greater than max', () => {
      const bad = JSON.parse(JSON.stringify(validBaseDoc));
      bad.library.fonts = {
        bad_font: {
          id: 'bad_font',
          family: 'BadFont',
          src: 'https://example.com/font.woff2',
          format: 'woff2',
          variableRange: { min: 900, max: 100 },
        },
      };
      expect(() => validate(bad)).toThrow(ValidationError);
    });

    it('validates a valid variable font in library', () => {
      const good = JSON.parse(JSON.stringify(validBaseDoc));
      good.library.fonts = {
        var_font: {
          id: 'var_font',
          family: 'Inter',
          src: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900',
          format: 'css',
          weight: '100 900',
          style: 'all',
          variableRange: { min: 100, max: 900, default: 400 },
          availableWeights: [100, 400, 700, 900],
          availableStyles: ['normal', 'italic'],
        },
      };
      expect(() => validate(good)).not.toThrow();
    });
  });

  describe('hydrate() and compileScript()', () => {
    it('compiles bare script body', () => {
      const fn = compileScript('this.count = (this.count || 0) + 1;');
      const ctx: any = { count: 5 };
      fn.call(ctx);
      expect(ctx.count).toBe(6);
    });

    it('compiles method syntax with parameters', () => {
      const fn = compileScript('add(a, b) { return a + b; }');
      expect(fn(10, 20)).toBe(30);
    });

    it('compiles full function expression', () => {
      const fn = compileScript('function (multiplier) { return this.x * multiplier; }');
      const ctx = { x: 7 };
      expect(fn.call(ctx, 6)).toBe(42);
    });

    it('hydrates EditorDocument with { __fn } into AnimDocument with live Functions', () => {
      const editorDoc: EditorDocument = {
        version: 1,
        meta: {
          name: 'hydrate-test',
          createdAt: '2026-10-24T00:00:00Z',
          modifiedAt: '2026-10-24T00:00:00Z',
          editorVersion: '0.1.0',
        },
        stage: {
          width: 500,
          height: 400,
          fps: 30,
          background: { type: 'solid', color: '#fff' },
          scaleMode: 'showAll',
        },
        library: {
          symbols: {
            s1: {
              id: 's1',
              name: 'Sym',
              kind: 'movieclip',
              registration: { x: 0, y: 0 },
              behavior: {
                onConstruct: {
                  __fn: 'this.initialized = true;',
                },
                methods: {
                  increment: {
                    __fn: 'function (amount) { this.val = (this.val || 0) + amount; }',
                  },
                },
              },
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
          frameCount: 2,
          layers: [
            {
              id: 'l1',
              name: 'L1',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf1',
                  index: 0,
                  duration: 1,
                  actions: {
                    __fn: 'this.step = 1;',
                  },
                  elements: [
                    {
                      id: 'inst1',
                      type: 'instance',
                      symbolId: 's1',
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                      alpha: 1,
                      visible: true,
                      events: {
                        onPress: {
                          __fn: 'function (e) { this.pressed = true; }',
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        onInit: {
          __fn: 'this.started = true;',
        },
      };

      const hydrated = hydrate(editorDoc);

      // Check onInit
      expect(typeof hydrated.onInit).toBe('function');
      const rootCtx: any = {};
      hydrated.onInit!.call(rootCtx);
      expect(rootCtx.started).toBe(true);

      // Check symbol behavior
      const sym = hydrated.library.symbols.s1;
      expect(typeof sym.behavior?.onConstruct).toBe('function');
      const symCtx: any = {};
      sym.behavior!.onConstruct!.call(symCtx);
      expect(symCtx.initialized).toBe(true);

      expect(typeof sym.behavior?.methods?.increment).toBe('function');
      sym.behavior!.methods!.increment.call(symCtx, 10);
      expect(symCtx.val).toBe(10);

      // Check keyframe action
      const kf = hydrated.root.layers[0].keyframes[0];
      expect(typeof kf.actions).toBe('function');
      const kfCtx: any = {};
      kf.actions!.call(kfCtx);
      expect(kfCtx.step).toBe(1);

      // Check instance event
      const el = kf.elements[0] as any;
      expect(typeof el.events?.onPress).toBe('function');
      const elCtx: any = {};
      el.events.onPress.call(elCtx, {});
      expect(elCtx.pressed).toBe(true);
    });
  });
});
