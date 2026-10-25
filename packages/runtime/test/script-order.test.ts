import { describe, it, expect, vi } from 'vitest';
import { TimelinePipeline } from '../src/player/Timeline';
import { scriptOrderDoc } from './fixtures/sampleDocs';
import { defineAnimation, SCHEMA_VERSION } from '../src/schema';

describe('Script execution order and error boundary', () => {
  it('executes in parent-first order by default', () => {
    const pipeline = new TimelinePipeline(scriptOrderDoc, {
      executionOrder: 'parent-first',
    });
    pipeline.init();

    // Frame 1 initialization log
    const log = pipeline.root.stage.global.log as string[];
    // In parent-first: parent frame action runs before child frame action
    expect(log).toEqual(['parent:action:1', 'child:action:1']);

    // Clear log and tick to frame 2
    log.length = 0;
    pipeline.tick();

    // onEnterFrame then actions, parent-first
    expect(log).toEqual([
      'child:onEnterFrame', // child has onEnterFrame defined
      'parent:action:2',
      'child:action:2',
    ]);
  });

  it('supports configurable children-first execution order', () => {
    const pipeline = new TimelinePipeline(scriptOrderDoc, {
      executionOrder: 'children-first',
    });
    pipeline.init();

    const log = pipeline.root.stage.global.log as string[];
    // In children-first: child frame action runs before parent frame action
    expect(log).toEqual(['child:action:1', 'parent:action:1']);

    log.length = 0;
    pipeline.tick();

    // Child action runs before parent action
    expect(log).toEqual([
      'child:onEnterFrame',
      'child:action:2',
      'parent:action:2',
    ]);
  });

  it('runs complete lifecycle: onInit -> onConstruct -> onLoad -> onEnterFrame -> actions -> onUnload', () => {
    const lifecycleLog: string[] = [];

    const lifecycleDoc = defineAnimation({
      version: SCHEMA_VERSION,
      meta: {
        name: 'lifecycle-doc',
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
          test_sym: {
            id: 'test_sym',
            name: 'TestSymbol',
            kind: 'movieclip',
            registration: { x: 0, y: 0 },
            behavior: {
              onConstruct: function () {
                lifecycleLog.push('onConstruct');
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
      onInit: function () {
        lifecycleLog.push('onInit');
      },
      root: {
        frameCount: 2,
        layers: [
          {
            id: 'l1',
            name: 'Layer1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 1,
                elements: [
                  {
                    id: 'elem_1',
                    type: 'instance',
                    symbolId: 'test_sym',
                    instanceName: 'testElem',
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
                      onLoad: function () {
                        lifecycleLog.push('onLoad');
                      },
                      onEnterFrame: function () {
                        lifecycleLog.push('onEnterFrame');
                      },
                      onUnload: function () {
                        lifecycleLog.push('onUnload');
                      },
                    },
                  },
                ],
                actions: function () {
                  lifecycleLog.push('actions:1');
                },
              },
              {
                // Frame 2 has NO elements -> triggers onUnload for elem_1
                id: 'kf2',
                index: 1,
                duration: 1,
                elements: [],
                actions: function () {
                  lifecycleLog.push('actions:2');
                },
              },
            ],
          },
        ],
      },
    });

    const pipeline = new TimelinePipeline(lifecycleDoc);
    pipeline.init();

    // Verify initialization sequence
    expect(lifecycleLog).toEqual(['onInit', 'onConstruct', 'onLoad', 'actions:1']);

    // Clear log and tick to frame 2
    lifecycleLog.length = 0;
    pipeline.tick();

    // On tick: elem_1 is removed on frame 2 (onUnload), and frame 2 actions run
    expect(lifecycleLog).toContain('onUnload');
    expect(lifecycleLog).toContain('actions:2');
  });

  it('catches and reports script errors without terminating the tick', () => {
    const errorLog: string[] = [];

    const docWithErrors = defineAnimation({
      version: SCHEMA_VERSION,
      meta: {
        name: 'error-doc',
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
        frameCount: 2,
        layers: [
          {
            id: 'l1',
            name: 'Layer1',
            kind: 'normal',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf1',
                index: 0,
                duration: 1,
                elements: [],
                actions: function () {
                  throw new Error('Explosion on frame 1!');
                },
              },
              {
                id: 'kf2',
                index: 1,
                duration: 1,
                elements: [],
                actions: function () {
                  this.vars.reachedFrame2 = true;
                },
              },
            ],
          },
        ],
      },
    });

    const pipeline = new TimelinePipeline(docWithErrors, {
      errorHandler: (err, _clip, scriptName) => {
        errorLog.push(`${scriptName}: ${(err as Error).message}`);
      },
    });

    // init should catch the error without throwing
    expect(() => pipeline.init()).not.toThrow();
    expect(errorLog).toEqual(['actions: Explosion on frame 1!']);

    // Subsequent tick continues running normally
    expect(() => pipeline.tick()).not.toThrow();
    expect(pipeline.root.vars.reachedFrame2).toBe(true);
  });
});
