// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { DomRenderer, blendModeToCSS } from '../../src/render/DomRenderer';
import { DisplayObject } from '../../src/display/DisplayObject';
import { MovieClip } from '../../src/display/MovieClip';
import type {
  AnimDocument,
  ShapeElement,
  BitmapElement,
  TextElement,
  TimelineDef,
} from '../../src/schema';

describe('DomRenderer', () => {
  function createTestContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'stage';
    document.body.appendChild(container);
    return container;
  }

  describe('blendModeToCSS', () => {
    it('returns empty string for normal or undefined blend modes', () => {
      expect(blendModeToCSS(undefined)).toBe('');
      expect(blendModeToCSS('normal')).toBe('');
    });

    it('returns blend mode string for valid CSS blend modes', () => {
      expect(blendModeToCSS('multiply')).toBe('multiply');
      expect(blendModeToCSS('screen')).toBe('screen');
      expect(blendModeToCSS('overlay')).toBe('overlay');
      expect(blendModeToCSS('darken')).toBe('darken');
      expect(blendModeToCSS('color-dodge')).toBe('color-dodge');
    });
  });

  describe('initialization and mount lifecycle', () => {
    it('creates defs host SVG inside root container', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);

      expect(renderer.root).toBe(container);
      expect(renderer.scope).toBeDefined();

      const defsHost = container.querySelector('svg');
      expect(defsHost).not.toBeNull();
      expect(defsHost!.getAttribute('aria-hidden')).toBe('true');
      expect(defsHost!.getAttribute('width')).toBe('0');
      expect(defsHost!.getAttribute('height')).toBe('0');
      expect(defsHost!.querySelector('defs')).not.toBeNull();
    });

    it('attaches and detaches display tree', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const rootClip = new MovieClip('rootClip');

      const wrapper = renderer.attach(rootClip);
      expect(wrapper.tagName.toLowerCase()).toBe('div');
      expect(wrapper.style.position).toBe('absolute');
      expect(['0', '0px']).toContain(wrapper.style.left);
      expect(['0', '0px']).toContain(wrapper.style.top);
      expect(wrapper.getAttribute('data-name')).toBe('rootClip');

      expect(renderer.getNode(rootClip)).toBe(wrapper);
      expect(rootClip.element).toBe(wrapper);
      expect(container.contains(wrapper)).toBe(true);

      // Detach
      renderer.detach();
      expect(container.contains(wrapper)).toBe(false);
      expect(renderer.getNode(rootClip)).toBeUndefined();
    });

    it('detaches previous tree when attach is called again', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const clip1 = new MovieClip('clip1');
      const clip2 = new MovieClip('clip2');

      const wrapper1 = renderer.attach(clip1);
      expect(container.contains(wrapper1)).toBe(true);

      const wrapper2 = renderer.attach(clip2);
      expect(container.contains(wrapper1)).toBe(false);
      expect(container.contains(wrapper2)).toBe(true);
      expect(renderer.getNode(clip1)).toBeUndefined();
      expect(renderer.getNode(clip2)).toBe(wrapper2);
    });
  });

  describe('display hierarchy and child mounting', () => {
    it('mounts nested display objects recursively and connects renderer hooks', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);

      const parentClip = new MovieClip('parent');
      const childClip = new MovieClip('child');
      const grandChild = new DisplayObject('leaf');

      parentClip.addChild(childClip);
      childClip.addChild(grandChild);

      renderer.attach(parentClip);

      expect(parentClip.rendererHooks).toBe(renderer);
      expect(childClip.rendererHooks).toBe(renderer);
      expect(grandChild.rendererHooks).toBe(renderer);

      const parentNode = renderer.getNode(parentClip)!;
      const childNode = renderer.getNode(childClip)!;
      const leafNode = renderer.getNode(grandChild)!;

      expect(parentNode).toBeDefined();
      expect(childNode).toBeDefined();
      expect(leafNode).toBeDefined();

      expect(parentNode.contains(childNode)).toBe(true);
      expect(childNode.contains(leafNode)).toBe(true);
    });

    it('preserves depth order among children in DOM', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);

      const root = new MovieClip('root');
      const childA = new DisplayObject('A');
      const childB = new DisplayObject('B');
      const childC = new DisplayObject('C');

      // Add childC at depth 10, childA at depth 1, childB at depth 5
      root.addChild(childC, 10);
      root.addChild(childA, 1);
      root.addChild(childB, 5);

      renderer.attach(root);

      const rootNode = renderer.getNode(root)!;
      const nodeA = renderer.getNode(childA)!;
      const nodeB = renderer.getNode(childB)!;
      const nodeC = renderer.getNode(childC)!;

      // In DOM, child elements should be ordered A, B, C
      const children = Array.from(rootNode.children);
      expect(children.indexOf(nodeA)).toBeLessThan(children.indexOf(nodeB));
      expect(children.indexOf(nodeB)).toBeLessThan(children.indexOf(nodeC));
    });
  });

  describe('DisplayObject property hooks', () => {
    it('updates CSS transform when position or rotation changes', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      expect(node.style.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');

      root.x = 50;
      root.y = 100;
      expect(node.style.transform).toBe('matrix(1, 0, 0, 1, 50, 100)');

      root.scaleX = 2;
      root.scaleY = 0.5;
      expect(node.style.transform).toBe('matrix(2, 0, 0, 0.5, 50, 100)');
    });

    it('updates opacity when alpha changes', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      expect(node.style.opacity).toBe('');

      root.alpha = 0.6;
      expect(node.style.opacity).toBe('0.6');

      root.alpha = 1;
      expect(node.style.opacity).toBe('');
    });

    it('updates display when visible changes', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      expect(node.style.display).toBe('');

      root.visible = false;
      expect(node.style.display).toBe('none');

      root.visible = true;
      expect(node.style.display).toBe('');
    });

    it('updates CSS filters when filters property changes', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      root.filters = [
        { type: 'blur', radius: 4 },
        { type: 'hueRotate', degrees: 90 },
      ];
      expect(node.style.filter).toBe('blur(4px) hue-rotate(90deg)');

      root.filters = [];
      expect(node.style.filter).toBe('');
    });

    it('updates colorTransform with CSS brightness or SVG matrix filter', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      // Darkening uses CSS brightness()
      root.colorTransform = { mode: 'brightness', brightness: -0.4 };
      expect(node.style.filter).toBe('brightness(0.6)');

      // Tint mode generates SVG filter and sets url(#id)
      root.colorTransform = { mode: 'tint', tint: { color: '#ff0000', amount: 0.5 } };
      expect(node.style.filter).toMatch(/^url\(#.+\)$/);

      // Resetting colorTransform removes SVG filter and resets style
      root.colorTransform = { mode: 'none' };
      expect(node.style.filter).toBe('');
    });

    it('combines colorTransform and filters in filter style', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      root.colorTransform = { mode: 'brightness', brightness: -0.2 };
      root.filters = [{ type: 'blur', radius: 5 }];

      expect(node.style.filter).toBe('brightness(0.8) blur(5px)');
    });

    it('applies blendMode via sync', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const node = renderer.attach(root);

      root.blendMode = 'multiply';
      renderer.sync(root);
      expect(node.style.mixBlendMode).toBe('multiply');
    });
  });

  describe('dynamic child additions and removals', () => {
    it('handles addChild dynamically after attach', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      renderer.attach(root);

      const dynamicChild = new DisplayObject('child1');
      root.addChild(dynamicChild);

      expect(dynamicChild.rendererHooks).toBe(renderer);
      const childNode = renderer.getNode(dynamicChild);
      expect(childNode).toBeDefined();
      expect(renderer.getNode(root)?.contains(childNode!)).toBe(true);
    });

    it('handles removeChild dynamically', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const child = new DisplayObject('toRemove');
      root.addChild(child);

      renderer.attach(root);
      const childNode = renderer.getNode(child)!;
      expect(renderer.getNode(root)?.contains(childNode)).toBe(true);

      root.removeChild(child);
      expect(renderer.getNode(child)).toBeUndefined();
      expect(renderer.getNode(root)?.contains(childNode)).toBe(false);
    });

    it('handles destroy lifecycle', () => {
      const container = createTestContainer();
      const renderer = new DomRenderer(container);
      const root = new MovieClip('root');
      const childClip = new MovieClip('sub');
      root.addChild(childClip);

      renderer.attach(root);
      expect(renderer.getNode(childClip)).toBeDefined();

      childClip.destroy();
      expect(renderer.getNode(childClip)).toBeUndefined();
    });
  });

  describe('element definition resolution and rendering', () => {
    it('renders shapes, bitmaps, and texts based on document index', () => {
      const shapeDef: ShapeElement = {
        id: 's1',
        type: 'shape',
        paths: [{ d: 'M0 0 L10 10', fill: { type: 'solid', color: '#ff0000' } }],
      };

      const bitmapDef: BitmapElement = {
        id: 'b1',
        type: 'bitmap',
        bitmapId: 'img1',
      };

      const textDef: TextElement = {
        id: 't1',
        type: 'text',
        mode: 'static',
        text: 'Document Text',
        fontId: 'f1',
        fontSize: 16,
        color: '#000',
        align: 'left',
        width: 100,
        height: 20,
        multiline: false,
        selectable: false,
      };

      const doc: AnimDocument = {
        version: '1.0',
        stage: { width: 550, height: 400, fps: 24, fill: { type: 'solid', color: '#fff' } },
        root: {
          frameCount: 1,
          layers: [
            {
              id: 'l1',
              name: 'Layer 1',
              keyframes: [
                {
                  frame: 1,
                  duration: 1,
                  elements: [shapeDef, bitmapDef, textDef],
                },
              ],
            },
          ],
        },
        library: {
          symbols: {},
          bitmaps: {
            img1: {
              id: 'img1',
              name: 'pic',
              src: 'pic.png',
              width: 50,
              height: 50,
              smoothing: true,
            },
          },
          sounds: {},
          fonts: {},
        },
      };

      const container = createTestContainer();
      const renderer = new DomRenderer(container, { doc });
      const root = new MovieClip('root');

      const shapeObj = new DisplayObject('shapeObj');
      shapeObj.id = 's1';
      root.addChild(shapeObj);

      const bitmapObj = new DisplayObject('bitmapObj');
      bitmapObj.id = 'b1';
      root.addChild(bitmapObj);

      const textObj = new DisplayObject('textObj');
      textObj.id = 't1';
      root.addChild(textObj);

      renderer.attach(root);

      // Verify shape DOM
      const shapeNode = renderer.getNode(shapeObj)!;
      expect(shapeNode.getAttribute('data-el-id')).toBe('s1');
      expect(shapeNode.querySelector('svg')).not.toBeNull();

      // Verify bitmap DOM
      const bmpNode = renderer.getNode(bitmapObj)!;
      expect(bmpNode.getAttribute('data-el-id')).toBe('b1');
      const img = bmpNode.querySelector('img')!;
      expect(img.src).toContain('pic.png');

      // Verify text DOM
      const textNode = renderer.getNode(textObj)!;
      expect(textNode.getAttribute('data-el-id')).toBe('t1');
      expect(textNode.textContent).toBe('Document Text');
    });

    it('respects cacheAsBitmap and blendMode from element def', () => {
      const shapeDef: ShapeElement = {
        id: 'cachedShape',
        type: 'shape',
        paths: [],
        cacheAsBitmap: true,
        blendMode: 'overlay',
      };

      const container = createTestContainer();
      const renderer = new DomRenderer(container, {
        resolveElement: (id) => (id === 'cachedShape' ? shapeDef : undefined),
      });

      const root = new MovieClip('root');
      const shapeObj = new DisplayObject('shapeObj');
      shapeObj.id = 'cachedShape';
      root.addChild(shapeObj);

      renderer.attach(root);

      const wrapper = renderer.getNode(shapeObj)!;
      expect(wrapper.style.willChange).toBe('transform');
      expect(wrapper.style.mixBlendMode).toBe('overlay');
    });

    it('custom resolveElement takes precedence over doc index', () => {
      const docDef: ShapeElement = { id: 'item1', type: 'shape', paths: [] };
      const customDef: TextElement = {
        id: 'item1',
        type: 'text',
        mode: 'static',
        text: 'Custom resolved text',
        fontId: 'f',
        fontSize: 12,
        color: '#000',
        align: 'left',
        width: 100,
        height: 20,
        multiline: false,
        selectable: false,
      };

      const doc: AnimDocument = {
        version: '1.0',
        stage: { width: 100, height: 100, fps: 24, fill: { type: 'none' } },
        root: {
          frameCount: 1,
          layers: [
            {
              id: 'l1',
              name: 'L',
              keyframes: [{ frame: 1, duration: 1, elements: [docDef] }],
            },
          ],
        },
        library: { symbols: {}, bitmaps: {}, sounds: {}, fonts: {} },
      };

      const container = createTestContainer();
      const renderer = new DomRenderer(container, {
        doc,
        resolveElement: (id) => (id === 'item1' ? customDef : undefined),
      });

      const root = new MovieClip('root');
      const obj = new DisplayObject('customObj');
      obj.id = 'item1';
      root.addChild(obj);

      renderer.attach(root);

      const node = renderer.getNode(obj)!;
      expect(node.textContent).toBe('Custom resolved text');
    });
  });

  describe('variable synchronization with syncTextVariables', () => {
    it('synchronizes text node with parent clip vars when variable is bound', () => {
      const textDef: TextElement = {
        id: 'scoreText',
        type: 'text',
        mode: 'dynamic',
        text: '0',
        variable: 'playerScore',
        fontId: 'f1',
        fontSize: 20,
        color: '#fff',
        align: 'center',
        width: 100,
        height: 30,
        multiline: false,
        selectable: false,
      };

      const container = createTestContainer();
      const renderer = new DomRenderer(container, {
        resolveElement: (id) => (id === 'scoreText' ? textDef : undefined),
      });

      const root = new MovieClip('root');
      root.vars['playerScore'] = '100';

      const textObj = new DisplayObject('scoreObj');
      textObj.id = 'scoreText';
      root.addChild(textObj);

      renderer.attach(root);

      const wrapper = renderer.getNode(textObj)!;
      const content = wrapper.firstElementChild as HTMLElement;
      expect(content.textContent).toBe('100');

      // Update parent vars and sync
      root.vars['playerScore'] = '250';
      renderer.syncTextVariables();
      expect(content.textContent).toBe('250');
    });

    it('supports custom textBinding callback', () => {
      const customVars: Record<string, unknown> = {
        globalStatus: 'Connecting...',
      };

      const textDef: TextElement = {
        id: 'statusText',
        type: 'text',
        mode: 'dynamic',
        text: 'Init',
        variable: 'globalStatus',
        fontId: 'f1',
        fontSize: 14,
        color: '#fff',
        align: 'left',
        width: 150,
        height: 25,
        multiline: false,
        selectable: false,
      };

      const container = createTestContainer();
      const renderer = new DomRenderer(container, {
        resolveElement: (id) => (id === 'statusText' ? textDef : undefined),
        textBinding: () => ({
          get: (name) => customVars[name],
          set: (name, val) => {
            customVars[name] = val;
          },
        }),
      });

      const root = new MovieClip('root');
      const textObj = new DisplayObject('statusObj');
      textObj.id = 'statusText';
      root.addChild(textObj);

      renderer.attach(root);

      const wrapper = renderer.getNode(textObj)!;
      expect(wrapper.textContent).toBe('Connecting...');

      customVars['globalStatus'] = 'Ready';
      renderer.syncTextVariables();
      expect(wrapper.textContent).toBe('Ready');
    });
  });
});
