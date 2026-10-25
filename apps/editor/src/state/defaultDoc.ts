import type { EditorDocument } from '@flashback/serializer';

export function createDefaultDocument(): EditorDocument {
  return {
    version: 1,
    meta: {
      name: 'Untitled-1',
      author: 'Flashback Creator',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      editorVersion: 'Flashback Studio 1.0',
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
          id: 'layer_1',
          name: 'Layer 1',
          kind: 'normal',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: 'kf_1',
              index: 0,
              duration: 24,
              time: 0,
              durationTime: 1.0,
              elements: [],
            },
          ],
        },
      ],
    },
  };
}
