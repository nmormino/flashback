// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasRenderer, blendModeToCompositeOperation } from '../../src/render/CanvasRenderer';
import { DisplayObject } from '../../src/display/DisplayObject';
import { MovieClip } from '../../src/display/MovieClip';
import { Matrix2D } from '../../src/math/Matrix2D';
import type {
  AnimDocument,
  ShapeElement,
  BitmapElement,
  TextElement,
  VectorPath,
  LinearGradientFill,
  RadialGradientFill,
} from '../../src/schema';

// --- Canvas 2D and Path2D Test Mock Infrastructure ---

interface ContextCall {
  method: string;
  args: any[];
  fillStyle?: any;
  strokeStyle?: any;
  lineWidth?: number;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  font?: string;
  textAlign?: CanvasTextAlign;
  globalAlpha?: number;
  globalCompositeOperation?: GlobalCompositeOperation;
}

interface SavedContextState {
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  fillStyle: any;
  strokeStyle: any;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

class MockCanvasRenderingContext2D {
  public canvas: HTMLCanvasElement;
  public globalAlpha = 1;
  public globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  public fillStyle: any = '#000000';
  public strokeStyle: any = '#000000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public lineJoin: CanvasLineJoin = 'miter';
  public miterLimit = 10;
  public font = '10px sans-serif';
  public textAlign: CanvasTextAlign = 'left';
  public textBaseline: CanvasTextBaseline = 'top';
  public filter = 'none';
  public letterSpacing = '0px';
  public imageSmoothingEnabled = true;

  public calls: ContextCall[] = [];
  private stateStack: SavedContextState[] = [];
  private lineDash: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public save(): void {
    this.calls.push({ method: 'save', args: [] });
    this.stateStack.push({
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    });
  }

  public restore(): void {
    this.calls.push({ method: 'restore', args: [] });
    const s = this.stateStack.pop();
    if (s) {
      this.globalAlpha = s.globalAlpha;
      this.globalCompositeOperation = s.globalCompositeOperation;
      this.fillStyle = s.fillStyle;
      this.strokeStyle = s.strokeStyle;
      this.lineWidth = s.lineWidth;
      this.lineCap = s.lineCap;
      this.lineJoin = s.lineJoin;
      this.font = s.font;
      this.textAlign = s.textAlign;
      this.textBaseline = s.textBaseline;
    }
  }

  public clearRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  public fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  public transform(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.calls.push({ method: 'transform', args: [a, b, c, d, tx, ty] });
  }

  public setTransform(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.calls.push({ method: 'setTransform', args: [a, b, c, d, tx, ty] });
  }

  public translate(x: number, y: number): void {
    this.calls.push({ method: 'translate', args: [x, y] });
  }

  public rotate(angle: number): void {
    this.calls.push({ method: 'rotate', args: [angle] });
  }

  public beginPath(): void {
    this.calls.push({ method: 'beginPath', args: [] });
  }

  public moveTo(x: number, y: number): void {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  public lineTo(x: number, y: number): void {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  public closePath(): void {
    this.calls.push({ method: 'closePath', args: [] });
  }

  public fill(pathOrRule?: any, fillRule?: any): void {
    const args = [pathOrRule, fillRule].filter((x) => x !== undefined);
    this.calls.push({
      method: 'fill',
      args,
      fillStyle: this.fillStyle,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
    });
  }

  public stroke(path?: any): void {
    this.calls.push({
      method: 'stroke',
      args: path !== undefined ? [path] : [],
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
    });
  }

  public clip(pathOrRule?: any, fillRule?: any): void {
    const args = [pathOrRule, fillRule].filter((x) => x !== undefined);
    this.calls.push({ method: 'clip', args });
  }

  public createLinearGradient(x0: number, y0: number, x1: number, y1: number): any {
    this.calls.push({ method: 'createLinearGradient', args: [x0, y0, x1, y1] });
    return {
      type: 'linearGradient',
      coords: [x0, y0, x1, y1],
      addColorStop: (offset: number, color: string) => {
        this.calls.push({ method: 'addColorStop', args: [offset, color] });
      },
    };
  }

  public createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): any {
    this.calls.push({ method: 'createRadialGradient', args: [x0, y0, r0, x1, y1, r1] });
    return {
      type: 'radialGradient',
      coords: [x0, y0, r0, x1, y1, r1],
      addColorStop: (offset: number, color: string) => {
        this.calls.push({ method: 'addColorStop', args: [offset, color] });
      },
    };
  }

  public createPattern(img: any, repetition: string | null): any {
    this.calls.push({ method: 'createPattern', args: [img, repetition] });
    return { img, repetition };
  }

  public drawImage(img: any, ...args: any[]): void {
    this.calls.push({ method: 'drawImage', args: [img, ...args] });
  }

  public fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.calls.push({
      method: 'fillText',
      args: [text, x, y, maxWidth].filter((x) => x !== undefined),
      font: this.font,
      textAlign: this.textAlign,
      fillStyle: this.fillStyle,
    });
  }

  public strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.calls.push({
      method: 'strokeText',
      args: [text, x, y, maxWidth].filter((x) => x !== undefined),
      font: this.font,
      textAlign: this.textAlign,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  public setLineDash(segments: number[]): void {
    this.lineDash = [...segments];
    this.calls.push({ method: 'setLineDash', args: [segments] });
  }

  public getLineDash(): number[] {
    return [...this.lineDash];
  }

  public measureText(text: string): { width: number } {
    return { width: text.length * 10 };
  }
}

class MockPath2D {
  public d?: string;
  constructor(d?: string) {
    this.d = d;
  }
}

describe('CanvasRenderer', () => {
  let originalGetContext: any;
  let originalPath2D: any;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalPath2D = (globalThis as any).Path2D;

    (globalThis as any).Path2D = MockPath2D;
    (window as any).Path2D = MockPath2D;

    HTMLCanvasElement.prototype.getContext = function (contextId: string) {
      if (contextId === '2d') {
        if (!(this as any)._mockCtx) {
          (this as any)._mockCtx = new MockCanvasRenderingContext2D(this);
        }
        return (this as any)._mockCtx;
      }
      return null;
    } as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    (globalThis as any).Path2D = originalPath2D;
    (window as any).Path2D = originalPath2D;
  });

  function getMockCtx(canvas: HTMLCanvasElement): MockCanvasRenderingContext2D {
    return (canvas as any)._mockCtx;
  }

  // --- 1. blendModeToCompositeOperation ---

  describe('blendModeToCompositeOperation', () => {
    it('maps blend modes to canvas globalCompositeOperation values', () => {
      expect(blendModeToCompositeOperation(undefined)).toBe('source-over');
      expect(blendModeToCompositeOperation('normal')).toBe('source-over');
      expect(blendModeToCompositeOperation('multiply')).toBe('multiply');
      expect(blendModeToCompositeOperation('screen')).toBe('screen');
      expect(blendModeToCompositeOperation('overlay')).toBe('overlay');
      expect(blendModeToCompositeOperation('darken')).toBe('darken');
      expect(blendModeToCompositeOperation('lighten')).toBe('lighten');
      expect(blendModeToCompositeOperation('color-dodge')).toBe('color-dodge');
      expect(blendModeToCompositeOperation('color-burn')).toBe('color-burn');
      expect(blendModeToCompositeOperation('hard-light')).toBe('hard-light');
      expect(blendModeToCompositeOperation('soft-light')).toBe('soft-light');
      expect(blendModeToCompositeOperation('difference')).toBe('difference');
      expect(blendModeToCompositeOperation('exclusion')).toBe('exclusion');
      expect(blendModeToCompositeOperation('unknown' as any)).toBe('source-over');
    });
  });

  // --- 2. Instantiation & Resize with DPR ---

  describe('instantiation and DPR resize', () => {
    it('initializes with default stage dimensions and DPR', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 550, height: 400, dpr: 2 });

      expect(renderer.width).toBe(550);
      expect(renderer.height).toBe(400);
      expect(renderer.dpr).toBe(2);
      expect(canvas.width).toBe(1100);
      expect(canvas.height).toBe(800);
      expect(canvas.style.width).toBe('550px');
      expect(canvas.style.height).toBe('400px');
      expect(renderer.isDirty).toBe(true);
    });

    it('resizes canvas and updates DPR and pixel sizes correctly', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 300, height: 200, dpr: 1 });

      renderer.resize(400, 300, 2);

      expect(renderer.width).toBe(400);
      expect(renderer.height).toBe(300);
      expect(renderer.dpr).toBe(2);
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
      expect(canvas.style.width).toBe('400px');
      expect(canvas.style.height).toBe('300px');
      expect(renderer.isDirty).toBe(true);
    });

    it('uses stage dimensions from document if options width/height are omitted', () => {
      const canvas = document.createElement('canvas');
      const mockDoc: Partial<AnimDocument> = {
        stage: {
          width: 800,
          height: 600,
          fps: 24,
          background: { type: 'solid', color: '#112233' },
          scaleMode: 'showAll',
        },
      };

      const renderer = new CanvasRenderer(canvas, { doc: mockDoc as AnimDocument, dpr: 1.5 });
      expect(renderer.width).toBe(800);
      expect(renderer.height).toBe(600);
      expect(canvas.width).toBe(1200);
      expect(canvas.height).toBe(900);
    });
  });

  // --- 3. Hardware Path2D Caching ---

  describe('Path2D caching', () => {
    it('creates and caches Path2D instances for identical path strings', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas);

      const d1 = 'M 0 0 L 100 0 L 100 100 Z';
      const path1 = renderer.getPath2D(d1);
      expect(path1).toBeInstanceOf(MockPath2D);
      expect((path1 as any).d).toBe(d1);
      expect(renderer.pathCache.has(d1)).toBe(true);

      // Re-fetching with same string returns the identical cached instance
      const path1Again = renderer.getPath2D(d1);
      expect(path1Again).toBe(path1);
      expect(renderer.pathCache.size).toBe(1);

      // Fetching a different path string creates a new entry
      const d2 = 'M 10 10 C 20 20 40 20 50 10';
      const path2 = renderer.getPath2D(d2);
      expect(path2).toBeInstanceOf(MockPath2D);
      expect(path2).not.toBe(path1);
      expect(renderer.pathCache.size).toBe(2);
    });

    it('gracefully handles missing Path2D constructor', () => {
      (globalThis as any).Path2D = undefined;
      (window as any).Path2D = undefined;

      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas);

      const path = renderer.getPath2D('M 0 0 L 10 10');
      expect(path).toBeNull();
    });
  });

  // --- 4. Recursive Matrix Transformations ---

  describe('recursive matrix transformations', () => {
    it('applies nested transforms with save and restore stacks', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 500, height: 400, dpr: 1 });
      const ctx = getMockCtx(canvas);

      const parentClip = new MovieClip('parent');
      parentClip.x = 100;
      parentClip.y = 50;
      parentClip.scaleX = 2;
      parentClip.scaleY = 2;

      const childClip = new MovieClip('child');
      childClip.x = 20;
      childClip.y = 30;

      parentClip.addChild(childClip);
      renderer.attach(parentClip);

      ctx.calls = [];
      renderer.render();

      // Top-level base transforms
      const setTransformCall = ctx.calls.find((c) => c.method === 'setTransform');
      expect(setTransformCall).toEqual({ method: 'setTransform', args: [1, 0, 0, 1, 0, 0] });

      const clearRectCall = ctx.calls.find((c) => c.method === 'clearRect');
      expect(clearRectCall).toEqual({ method: 'clearRect', args: [0, 0, 500, 400] });

      // Transform calls for parent and child
      const transformCalls = ctx.calls.filter((c) => c.method === 'transform');
      expect(transformCalls.length).toBe(2);

      // Parent matrix: scale(2, 2) translate(100, 50)
      expect(transformCalls[0].args).toEqual([2, 0, 0, 2, 100, 50]);

      // Child matrix: translate(20, 30)
      expect(transformCalls[1].args).toEqual([1, 0, 0, 1, 20, 30]);

      // Balanced save/restore calls
      const saveCount = ctx.calls.filter((c) => c.method === 'save').length;
      const restoreCount = ctx.calls.filter((c) => c.method === 'restore').length;
      expect(saveCount).toBe(restoreCount);
    });

    it('multiplies parentLayerMatrix when present', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400, dpr: 1 });
      const ctx = getMockCtx(canvas);

      const obj = new DisplayObject('item');
      obj.x = 10;
      obj.y = 20;
      obj.parentLayerMatrix = Matrix2D.translation(50, 60);

      renderer.attach(obj);
      ctx.calls = [];
      renderer.render();

      const transformCall = ctx.calls.find((c) => c.method === 'transform');
      expect(transformCall).toBeDefined();
      // 10 + 50 = 60, 20 + 60 = 80
      expect(transformCall!.args).toEqual([1, 0, 0, 1, 60, 80]);
    });
  });

  // --- 5. Shape Rendering (Fill, Stroke, Linear Gradient) ---

  describe('shape rendering', () => {
    it('renders solid fill and solid stroke using cached Path2D', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400, dpr: 1 });
      const ctx = getMockCtx(canvas);

      const shapeDef: ShapeElement = {
        id: 'shape1',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [
          {
            d: 'M 0 0 L 100 0 L 100 100 Z',
            fill: { type: 'solid', color: '#ff0000' },
            stroke: {
              fill: { type: 'solid', color: '#00ff00' },
              width: 4,
              cap: 'round',
              join: 'bevel',
              dash: [8, 4],
            },
            fillRule: 'evenodd',
          },
        ],
      };

      const obj = new DisplayObject('vector');
      obj.currentDef = shapeDef;
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      // Check fill call
      const fillCall = ctx.calls.find((c) => c.method === 'fill');
      expect(fillCall).toBeDefined();
      expect(fillCall!.args[0]).toBeInstanceOf(MockPath2D);
      expect(fillCall!.args[1]).toBe('evenodd');
      expect(fillCall!.fillStyle).toBe('#ff0000');

      // Check stroke call and styling
      const strokeCall = ctx.calls.find((c) => c.method === 'stroke');
      expect(strokeCall).toBeDefined();
      expect(strokeCall!.args[0]).toBeInstanceOf(MockPath2D);
      expect(strokeCall!.strokeStyle).toBe('#00ff00');
      expect(strokeCall!.lineWidth).toBe(4);
      expect(strokeCall!.lineCap).toBe('round');
      expect(strokeCall!.lineJoin).toBe('bevel');

      const dashCall = ctx.calls.find((c) => c.method === 'setLineDash');
      expect(dashCall).toBeDefined();
      expect(dashCall!.args[0]).toEqual([8, 4]);
    });

    it('renders linear gradient fills with color stops', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400, dpr: 1 });
      const ctx = getMockCtx(canvas);

      const linearFill: LinearGradientFill = {
        type: 'linearGradient',
        angle: 90,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#0000ff' },
        ],
      };

      const shapeDef: ShapeElement = {
        id: 'gradShape',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [
          {
            d: 'M 0 0 L 200 0 L 200 200 Z',
            fill: linearFill,
          },
        ],
      };

      const obj = new DisplayObject('gradItem');
      obj._width = 200;
      obj._height = 200;
      obj.currentDef = shapeDef;
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      const gradCall = ctx.calls.find((c) => c.method === 'createLinearGradient');
      expect(gradCall).toBeDefined();

      const colorStops = ctx.calls.filter((c) => c.method === 'addColorStop');
      expect(colorStops.length).toBe(2);
      expect(colorStops[0].args).toEqual([0, '#ff0000']);
      expect(colorStops[1].args).toEqual([1, '#0000ff']);

      const fillCall = ctx.calls.find((c) => c.method === 'fill');
      expect(fillCall).toBeDefined();
    });

    it('renders radial gradient fills with color stops', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400, dpr: 1 });
      const ctx = getMockCtx(canvas);

      const radialFill: RadialGradientFill = {
        type: 'radialGradient',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        focalX: 0.3,
        focalY: 0.3,
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#000000' },
        ],
      };

      const shapeDef: ShapeElement = {
        id: 'radShape',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [
          {
            d: 'M 0 0 L 100 100 Z',
            fill: radialFill,
          },
        ],
      };

      const obj = new DisplayObject('radItem');
      obj._width = 100;
      obj._height = 100;
      obj.currentDef = shapeDef;
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      const radCall = ctx.calls.find((c) => c.method === 'createRadialGradient');
      expect(radCall).toBeDefined();
      expect(radCall!.args).toEqual([30, 30, 0, 50, 50, 50]);

      const colorStops = ctx.calls.filter((c) => c.method === 'addColorStop');
      expect(colorStops.length).toBe(2);
    });
  });

  // --- 6. Alpha and Visibility ---

  describe('alpha and visibility', () => {
    it('skips rendering when visible is false', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const obj = new DisplayObject('hiddenItem');
      obj.visible = false;
      obj.currentDef = {
        id: 's',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: false,
        paths: [{ d: 'M 0 0 L 10 10', fill: { type: 'solid', color: '#f00' } }],
      };
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      expect(ctx.calls.some((c) => c.method === 'fill')).toBe(false);
      expect(ctx.calls.some((c) => c.method === 'transform')).toBe(false);
    });

    it('skips rendering when alpha <= 0', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const obj = new DisplayObject('zeroAlpha');
      obj.alpha = 0;
      obj.currentDef = {
        id: 's',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 0,
        visible: true,
        paths: [{ d: 'M 0 0 L 10 10', fill: { type: 'solid', color: '#f00' } }],
      };
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      expect(ctx.calls.some((c) => c.method === 'fill')).toBe(false);
    });

    it('compounds alpha hierarchically down the display tree', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const parentClip = new MovieClip('parent');
      parentClip.alpha = 0.5;

      const childClip = new MovieClip('child');
      childClip.alpha = 0.8;

      const leaf = new DisplayObject('leaf');
      leaf.alpha = 0.5;
      leaf.currentDef = {
        id: 's',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 0.5,
        visible: true,
        paths: [{ d: 'M 0 0 L 10 10', fill: { type: 'solid', color: '#f00' } }],
      };

      childClip.addChild(leaf);
      parentClip.addChild(childClip);
      renderer.attach(parentClip);

      let alphaAtFill = 0;
      const originalFill = ctx.fill.bind(ctx);
      ctx.fill = function (...args: any[]) {
        alphaAtFill = ctx.globalAlpha;
        originalFill(...args);
      };

      renderer.render();

      // 0.5 * 0.8 * 0.5 = 0.2
      expect(alphaAtFill).toBeCloseTo(0.2, 4);
      // Top-level restored back to 1
      expect(ctx.globalAlpha).toBe(1);
    });
  });

  // --- 7. Dirty Flag Behavior ---

  describe('dirty flag behavior', () => {
    it('manages dirty flag and only re-renders on demand', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      expect(renderer.isDirty).toBe(true);

      const rendered1 = renderer.renderIfNeeded();
      expect(rendered1).toBe(true);
      expect(renderer.isDirty).toBe(false);

      // Subsequent call does nothing
      ctx.calls = [];
      const rendered2 = renderer.renderIfNeeded();
      expect(rendered2).toBe(false);
      expect(ctx.calls.length).toBe(0);

      // markDirty resets flag
      renderer.markDirty();
      expect(renderer.isDirty).toBe(true);

      const rendered3 = renderer.renderIfNeeded();
      expect(rendered3).toBe(true);
      expect(renderer.isDirty).toBe(false);
    });

    it('marks dirty when display object properties change through hooks', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });

      const clip = new MovieClip('mc');
      renderer.attach(clip);
      renderer.renderIfNeeded();
      expect(renderer.isDirty).toBe(false);

      // Transform change
      clip.x = 50;
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Alpha change
      clip.alpha = 0.7;
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Visibility change
      clip.visible = false;
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Filter change
      clip.filters = [{ type: 'blur', radius: 4 }];
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // ColorTransform change
      clip.colorTransform = { mode: 'brightness', brightness: -0.2 };
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Child added
      const child = new DisplayObject('c1');
      clip.addChild(child);
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Child removed
      clip.removeChild(child);
      expect(renderer.isDirty).toBe(true);
      renderer.renderIfNeeded();

      // Sync
      renderer.sync(clip);
      expect(renderer.isDirty).toBe(true);
    });
  });

  // --- 8. Blend Modes ---

  describe('blend modes', () => {
    it('applies composite operation for blend modes', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const obj = new DisplayObject('blendObj');
      obj.blendMode = 'multiply';
      obj.currentDef = {
        id: 's',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [{ d: 'M 0 0 L 10 10', fill: { type: 'solid', color: '#f00' } }],
      };
      renderer.attach(obj);

      let blendModeDuringFill: any = '';
      const originalFill = ctx.fill.bind(ctx);
      ctx.fill = function (...args: any[]) {
        blendModeDuringFill = ctx.globalCompositeOperation;
        originalFill(...args);
      };

      renderer.render();
      expect(blendModeDuringFill).toBe('multiply');
      // Restored back to source-over
      expect(ctx.globalCompositeOperation).toBe('source-over');
    });
  });

  // --- 9. Masks ---

  describe('masks', () => {
    it('skips direct drawing of mask layers and clips masked siblings', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const parent = new MovieClip('parent');

      const maskObj = new DisplayObject('mask');
      maskObj.layerKind = 'mask';
      maskObj.layerId = 'mask_1';
      maskObj.currentDef = {
        id: 'maskDef',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 Z' }],
      };

      const maskedObj = new DisplayObject('content');
      maskedObj.maskLayerId = 'mask_1';
      maskedObj.currentDef = {
        id: 'contentDef',
        type: 'shape',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        paths: [{ d: 'M 0 0 L 100 100', fill: { type: 'solid', color: '#00f' } }],
      };

      parent.addChild(maskObj);
      parent.addChild(maskedObj);
      renderer.attach(parent);

      ctx.calls = [];
      renderer.render();

      // Mask object should not be filled
      const fillCalls = ctx.calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBe(1); // Only contentDef is filled

      // Clip must be called using the mask's path
      const clipCall = ctx.calls.find((c) => c.method === 'clip');
      expect(clipCall).toBeDefined();
      expect(clipCall!.args[0]).toBeInstanceOf(MockPath2D);
    });
  });

  // --- 10. Text & Bitmap Elements ---

  describe('text and bitmap elements', () => {
    it('renders text with font, weight, size, alignment, and fill color', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, { width: 400, height: 400 });
      const ctx = getMockCtx(canvas);

      const textDef: TextElement = {
        id: 'txt1',
        type: 'text',
        mode: 'static',
        text: 'Hello Flashback',
        fontId: 'Arial',
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ff3300',
        align: 'center',
        width: 200,
        height: 30,
        multiline: false,
        selectable: false,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      const obj = new DisplayObject('textObj');
      obj.currentDef = textDef;
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      const fillTextCall = ctx.calls.find((c) => c.method === 'fillText');
      expect(fillTextCall).toBeDefined();
      expect(fillTextCall!.font).toContain('24px Arial');
      expect(fillTextCall!.font).toContain('bold');
      expect(fillTextCall!.textAlign).toBe('center');
      expect(fillTextCall!.fillStyle).toBe('#ff3300');
      expect(fillTextCall!.args[0]).toBe('Hello Flashback');
      expect(fillTextCall!.args[1]).toBe(100); // 200 / 2 for center align
    });

    it('renders bitmaps using drawImage', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, {
        width: 400,
        height: 400,
        library: {
          symbols: {},
          audio: {},
          bitmaps: {
            bmp1: {
              src: 'data:image/png;base64,mock',
              width: 64,
              height: 64,
              smoothing: true,
            },
          },
        },
      });
      const ctx = getMockCtx(canvas);

      const bitmapDef: BitmapElement = {
        id: 'b1',
        type: 'bitmap',
        bitmapId: 'bmp1',
        width: 64,
        height: 64,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      const obj = new DisplayObject('bitmapObj');
      obj.currentDef = bitmapDef;
      renderer.attach(obj);

      ctx.calls = [];
      renderer.render();

      const drawImageCall = ctx.calls.find((c) => c.method === 'drawImage');
      expect(drawImageCall).toBeDefined();
      expect(drawImageCall!.args[1]).toBe(0);
      expect(drawImageCall!.args[2]).toBe(0);
      expect(drawImageCall!.args[3]).toBe(64);
      expect(drawImageCall!.args[4]).toBe(64);
    });
  });

  // --- 11. Detach & Teardown ---

  describe('detach and teardown', () => {
    it('cleans up renderer hooks upon detach', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas);

      const obj = new DisplayObject('item');
      renderer.attach(obj);
      expect(obj.rendererHooks).toBe(renderer);

      renderer.detach();
      expect(obj.rendererHooks).toBeUndefined();
      expect(renderer.isDirty).toBe(true);
    });
  });

  // --- 12. Non-Destructive Responsive Constraints ---

  describe('non-destructive responsive constraints & pinning', () => {
    it('applies constrained transform dynamically when canvas width/height differs from base', () => {
      const canvas = document.createElement('canvas');
      const doc: AnimDocument = {
        version: 1,
        fps: 24,
        stage: { width: 500, height: 400, color: '#ffffff' },
        root: { id: 'root', layers: [] },
      };

      const renderer = new CanvasRenderer(canvas, { doc, width: 500, height: 400, dpr: 1 });
      const ctx = canvas.getContext('2d') as any;
      const elDef: ShapeElement = {
        id: 'pinned_shape',
        type: 'shape',
        transform: {
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
          pin: 'center',
        },
        paths: [{ d: 'M0 0 L50 0 L50 50 Z' }],
      };

      const obj = new DisplayObject('pinned');
      obj._x = 100;
      obj._y = 100;
      obj.currentDef = elDef;
      renderer.attach(obj);

      // Initial render at base 500x400: transform should be (1, 0, 0, 1, 100, 100)
      ctx.calls = [];
      renderer.render();
      const transformCallBase = ctx.calls.find((c) => c.method === 'transform');
      expect(transformCallBase).toBeDefined();
      expect(transformCallBase!.args).toEqual([1, 0, 0, 1, 100, 100]);

      // Resize to 700x600 (dx = 200, dy = 200) -> center pin shifts by +100, +100 => 200, 200
      renderer.resize(700, 600, 1);
      ctx.calls = [];
      renderer.render();
      const transformCallResized = ctx.calls.find((c) => c.method === 'transform');
      expect(transformCallResized).toBeDefined();
      expect(transformCallResized!.args).toEqual([1, 0, 0, 1, 200, 200]);

      // Element definition and raw obj coordinates remain pristine and unmutated!
      expect(elDef.transform.x).toBe(100);
      expect(elDef.transform.y).toBe(100);
      expect(obj._x).toBe(100);
      expect(obj._y).toBe(100);

      // Resize back to base 500x400
      renderer.resize(500, 400, 1);
      ctx.calls = [];
      renderer.render();
      const transformCallRestored = ctx.calls.find((c) => c.method === 'transform');
      expect(transformCallRestored!.args).toEqual([1, 0, 0, 1, 100, 100]);
    });
  });
});
