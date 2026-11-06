import { describe, it, expect } from 'vitest';
import type { AnimDocument } from '@flashback/runtime';
import { serialize, parse, validate, hydrate, ValidationError, type EditorDocument } from '../src/index.js';

describe('Phase 5: Artboard Schema, Serialization & Validation', () => {
  const baseDoc: EditorDocument = {
    version: 1,
    meta: {
      name: 'Artboard Test',
      createdAt: '2026-11-05T00:00:00.000Z',
      modifiedAt: '2026-11-05T00:00:00.000Z',
      editorVersion: '1.0.0',
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
      frameCount: 24,
      layers: [
        {
          id: 'l1',
          name: 'Layer 1',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf1',
              index: 0,
              duration: 24,
              time: 0,
              durationTime: 1,
              elements: [],
            },
          ],
        },
      ],
    },
  };

  it('validates a document with multiple valid artboards and activeArtboardId', () => {
    const docWithArtboards: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'ab-1',
          name: 'Desktop View',
          width: 1440,
          height: 900,
          background: { type: 'solid', color: '#111827' },
          root: baseDoc.root,
        },
        {
          id: 'ab-2',
          name: 'Mobile View',
          width: 390,
          height: 844,
          background: { type: 'solid', color: '#000000' },
          root: baseDoc.root,
        },
      ],
      activeArtboardId: 'ab-2',
    };

    const validated = validate(docWithArtboards as AnimDocument);
    expect(validated.artboards).toHaveLength(2);
    expect(validated.activeArtboardId).toBe('ab-2');
  });

  it('rejects duplicate artboard IDs', () => {
    const invalidDoc: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'dup-id',
          name: 'Artboard 1',
          width: 550,
          height: 400,
          root: baseDoc.root,
        },
        {
          id: 'dup-id',
          name: 'Artboard 2',
          width: 550,
          height: 400,
          root: baseDoc.root,
        },
      ],
    };

    expect(() => validate(invalidDoc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(invalidDoc as AnimDocument)).toThrow('Duplicate artboard id "dup-id"');
  });

  it('rejects an activeArtboardId that does not exist in artboards', () => {
    const invalidDoc: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'ab-1',
          name: 'Main View',
          width: 550,
          height: 400,
          root: baseDoc.root,
        },
      ],
      activeArtboardId: 'ab-ghost',
    };

    expect(() => validate(invalidDoc as AnimDocument)).toThrow(ValidationError);
    expect(() => validate(invalidDoc as AnimDocument)).toThrow('Active artboard id "ab-ghost" not found in artboards');
  });

  it('concise serialization: omits artboards & activeArtboardId when document only has a single default artboard', () => {
    const docWithSingleDefault: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'artboard-1',
          name: 'Artboard 1',
          width: 550,
          height: 400,
          background: { type: 'solid', color: '#ffffff' },
          root: baseDoc.root,
        },
      ],
      activeArtboardId: 'artboard-1',
    };

    const serialized = serialize(docWithSingleDefault);
    expect(serialized).not.toContain('artboards:');
    expect(serialized).not.toContain('activeArtboardId:');
  });

  it('serializes multiple artboards and activeArtboardId concisely', () => {
    const docWithMultiArtboards: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'ab-screen1',
          name: 'Screen 1',
          width: 800,
          height: 600,
          root: baseDoc.root,
        },
        {
          id: 'ab-screen2',
          name: 'Screen 2',
          width: 400,
          height: 800,
          root: baseDoc.root,
        },
      ],
      activeArtboardId: 'ab-screen2',
    };

    const serialized = serialize(docWithMultiArtboards);
    expect(serialized).toContain('artboards:');
    expect(serialized).toContain('activeArtboardId: "ab-screen2"');
    expect(serialized).toContain('id: "ab-screen1"');
    expect(serialized).toContain('id: "ab-screen2"');

    // Verify round-trip parsing
    const parsed = parse(serialized);
    expect(parsed.artboards).toHaveLength(2);
    expect(parsed.activeArtboardId).toBe('ab-screen2');
  });

  it('hydrate compiles script sources inside artboards into real functions', () => {
    const docWithScript: EditorDocument = {
      ...baseDoc,
      artboards: [
        {
          id: 'ab-scripted',
          name: 'Scripted Artboard',
          width: 550,
          height: 400,
          root: {
            frameCount: 24,
            layers: [
              {
                id: 'l1',
                name: 'Layer 1',
                kind: 'normal',
                visible: true,
                locked: false,
                keyframes: [
                  {
                    id: 'kf1',
                    index: 0,
                    duration: 24,
                    elements: [
                      {
                        id: 'btn1',
                        type: 'shape',
                        alpha: 1,
                        visible: true,
                        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                        paths: [],
                        events: {
                          onClick: { __fn: "gotoArtboard('ab-target');" } as any,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    const hydrated = hydrate(docWithScript);
    const kfEl = hydrated.artboards![0].root.layers[0].keyframes[0].elements[0];
    expect(typeof kfEl.events?.onClick).toBe('function');
  });
});
