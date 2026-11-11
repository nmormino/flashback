// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderTextOnPath,
  renderTextOnPathCaret,
  renderTextOnPathSelection,
  getCursorIndexOnPath,
  computeTextPathLayout,
} from '../../src/render/canvasTextOnPath';
import { CanvasRenderer } from '../../src/render/CanvasRenderer';
import { DisplayObject } from '../../src/display/DisplayObject';
import { MovieClip } from '../../src/display/MovieClip';
import type { TextElement, ShapeElement, AnimDocument } from '../../src/schema';

class TestContext2D {
  public font = '16px sans-serif';
  public textAlign: CanvasTextAlign = 'left';
  public textBaseline: CanvasTextBaseline = 'middle';
  public fillStyle: any = '#000000';
  public strokeStyle: any = '#000000';
  public lineWidth = 1;
  public letterSpacing = '0px';

  public calls: Array<{ type: string; [key: string]: any }> = [];
  public states: Array<any> = [];

  public save(): void {
    this.calls.push({ type: 'save' });
    this.states.push({
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  public restore(): void {
    this.calls.push({ type: 'restore' });
    const s = this.states.pop();
    if (s) {
      this.font = s.font;
      this.textAlign = s.textAlign;
      this.textBaseline = s.textBaseline;
      this.fillStyle = s.fillStyle;
      this.strokeStyle = s.strokeStyle;
      this.lineWidth = s.lineWidth;
    }
  }

  public translate(x: number, y: number): void {
    this.calls.push({ type: 'translate', x, y });
  }

  public rotate(angle: number): void {
    this.calls.push({ type: 'rotate', angle, deg: (angle * 180) / Math.PI });
  }

  public fillText(text: string, x: number, y: number): void {
    this.calls.push({
      type: 'fillText',
      text,
      x,
      y,
      font: this.font,
      fillStyle: this.fillStyle,
    });
  }

  public strokeText(text: string, x: number, y: number): void {
    this.calls.push({
      type: 'strokeText',
      text,
      x,
      y,
      font: this.font,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  public beginPath(): void {
    this.calls.push({ type: 'beginPath' });
  }

  public moveTo(x: number, y: number): void {
    this.calls.push({ type: 'moveTo', x, y });
  }

  public lineTo(x: number, y: number): void {
    this.calls.push({ type: 'lineTo', x, y });
  }

  public closePath(): void {
    this.calls.push({ type: 'closePath' });
  }

  public fill(): void {
    this.calls.push({ type: 'fill', fillStyle: this.fillStyle });
  }

  public stroke(): void {
    this.calls.push({
      type: 'stroke',
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  public measureText(text: string): { width: number } {
    // 10px per character for predictable testing
    return { width: text.length * 10 };
  }

  public clearRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ type: 'clearRect', x, y, w, h });
  }

  public fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ type: 'fillRect', x, y, w, h });
  }

  public setTransform(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.calls.push({ type: 'setTransform', a, b, c, d, tx, ty });
  }

  public transform(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.calls.push({ type: 'transform', a, b, c, d, tx, ty });
  }
}

describe('In-Canvas Text & "Type on a Path" Engine', () => {
  let ctx: TestContext2D;
  let originalGetContext: any;

  beforeEach(() => {
    ctx = new TestContext2D();
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId: string) {
      if (contextId === '2d') {
        if (!(this as any)._mockCtx) {
          (this as any)._mockCtx = new TestContext2D();
        }
        return (this as any)._mockCtx;
      }
      return null;
    };
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  describe('1. Character Layout along Lines and Curves', () => {
    it('places characters at exact arc-length distances along a horizontal line', () => {
      // Path: 0 -> 100 along x-axis. Text: "ABC", widths: 10 each
      renderTextOnPath(ctx as any, 'ABC', 'M 0 0 L 100 0', {
        startOffset: 0,
        fontSize: 16,
        fill: '#ff0000',
      });

      // Character 'A': width 10, center at 5
      // Character 'B': width 10, center at 15
      // Character 'C': width 10, center at 25
      const translates = ctx.calls.filter((c) => c.type === 'translate');
      expect(translates).toHaveLength(3);
      expect(translates[0].x).toBeCloseTo(5, 1);
      expect(translates[0].y).toBeCloseTo(0, 1);
      expect(translates[1].x).toBeCloseTo(15, 1);
      expect(translates[1].y).toBeCloseTo(0, 1);
      expect(translates[2].x).toBeCloseTo(25, 1);
      expect(translates[2].y).toBeCloseTo(0, 1);

      // Tangent angles should all be 0 degrees
      const rotates = ctx.calls.filter((c) => c.type === 'rotate');
      expect(rotates).toHaveLength(3);
      expect(rotates[0].deg).toBeCloseTo(0, 1);
      expect(rotates[1].deg).toBeCloseTo(0, 1);
      expect(rotates[2].deg).toBeCloseTo(0, 1);

      // fillText called with -w/2 (-5, 0)
      const fills = ctx.calls.filter((c) => c.type === 'fillText');
      expect(fills).toHaveLength(3);
      expect(fills[0]).toMatchObject({ text: 'A', x: -5, y: 0, fillStyle: '#ff0000' });
      expect(fills[1]).toMatchObject({ text: 'B', x: -5, y: 0, fillStyle: '#ff0000' });
      expect(fills[2]).toMatchObject({ text: 'C', x: -5, y: 0, fillStyle: '#ff0000' });
    });

    it('places characters along a vertical line with 90° tangent rotation', () => {
      renderTextOnPath(ctx as any, 'XY', 'M 0 0 V 100', {
        startOffset: 10,
        fontSize: 14,
      });

      const translates = ctx.calls.filter((c) => c.type === 'translate');
      expect(translates).toHaveLength(2);
      // 'X': start 10, width 10 -> center at 15
      expect(translates[0].x).toBeCloseTo(0, 1);
      expect(translates[0].y).toBeCloseTo(15, 1);
      // 'Y': start 20, width 10 -> center at 25
      expect(translates[1].x).toBeCloseTo(0, 1);
      expect(translates[1].y).toBeCloseTo(25, 1);

      const rotates = ctx.calls.filter((c) => c.type === 'rotate');
      expect(rotates[0].deg).toBeCloseTo(90, 1);
      expect(rotates[1].deg).toBeCloseTo(90, 1);
    });

    it('places characters along a 45° diagonal line with 45° tangent rotation', () => {
      // (0,0) to (100, 100) -> angle 45 deg, length ~141.42
      renderTextOnPath(ctx as any, 'AB', 'M 0 0 L 100 100');

      const rotates = ctx.calls.filter((c) => c.type === 'rotate');
      expect(rotates[0].deg).toBeCloseTo(45, 1);
      expect(rotates[1].deg).toBeCloseTo(45, 1);

      const translates = ctx.calls.filter((c) => c.type === 'translate');
      // Center of 'A' at s = 5 -> (5*cos45, 5*sin45) = (3.535, 3.535)
      expect(translates[0].x).toBeCloseTo(5 * Math.cos(Math.PI / 4), 1);
      expect(translates[0].y).toBeCloseTo(5 * Math.sin(Math.PI / 4), 1);
    });

    it('places characters along a curved cubic bezier path following tangent derivatives', () => {
      renderTextOnPath(ctx as any, 'CURVE', 'M 0 0 C 0 100, 100 100, 100 0', {
        fontSize: 12,
        align: 'center',
      });

      const translates = ctx.calls.filter((c) => c.type === 'translate');
      expect(translates).toHaveLength(5);

      // Verify that positions follow the curve arc
      expect(translates[0].x).toBeGreaterThan(0);
      expect(translates[2].x).toBeCloseTo(50, 0); // Apex near x=50
      expect(translates[4].x).toBeGreaterThan(translates[2].x);

      // Rotations change smoothly along the curve
      const rotates = ctx.calls.filter((c) => c.type === 'rotate');
      expect(rotates).toHaveLength(5);
      // In the middle (apex), tangent is horizontal (close to 0 deg)
      expect(rotates[2].deg).toBeCloseTo(0, 0);
    });

    it('respects letterSpacing by shifting character distances', () => {
      renderTextOnPath(ctx as any, 'ABC', 'M 0 0 L 200 0', {
        letterSpacing: 5,
      });

      const translates = ctx.calls.filter((c) => c.type === 'translate');
      // 'A': start 0, w 10 -> center 5
      expect(translates[0].x).toBeCloseTo(5, 1);
      // 'B': start 0 + 10 + 5 = 15 -> center 15 + 5 = 20
      expect(translates[1].x).toBeCloseTo(20, 1);
      // 'C': start 15 + 10 + 5 = 30 -> center 30 + 5 = 35
      expect(translates[2].x).toBeCloseTo(35, 1);
    });

    it('supports center and right alignment', () => {
      // Path length = 100, text "AB" span = 20
      // align: 'center' -> center at 50 -> start at 40 -> centers at 45 and 55
      renderTextOnPath(ctx as any, 'AB', 'M 0 0 L 100 0', {
        align: 'center',
      });

      const translates = ctx.calls.filter((c) => c.type === 'translate');
      expect(translates[0].x).toBeCloseTo(45, 1);
      expect(translates[1].x).toBeCloseTo(55, 1);

      // align: 'right' -> end at 100 -> start at 80 -> centers at 85 and 95
      ctx.calls = [];
      renderTextOnPath(ctx as any, 'AB', 'M 0 0 L 100 0', {
        align: 'right',
      });
      const translatesR = ctx.calls.filter((c) => c.type === 'translate');
      expect(translatesR[0].x).toBeCloseTo(85, 1);
      expect(translatesR[1].x).toBeCloseTo(95, 1);
    });

    it('renders stroke when stroke and strokeWidth are provided', () => {
      renderTextOnPath(ctx as any, 'Hi', 'M 0 0 L 100 0', {
        stroke: '#0000ff',
        strokeWidth: 2,
      });

      const strokes = ctx.calls.filter((c) => c.type === 'strokeText');
      expect(strokes).toHaveLength(2);
      expect(strokes[0].text).toBe('H');
      expect(strokes[0].strokeStyle).toBe('#0000ff');
      expect(strokes[0].lineWidth).toBe(2);
      expect(strokes[1].text).toBe('i');
    });
  });

  describe('2. Oriented Caret Angle and Position', () => {
    it('draws a vertical caret line on a horizontal path at cursor index', () => {
      // Horizontal path: tangent is 0 deg. Normal is (0, 1).
      // Caret length is fontSize = 20. HalfLen = 10.
      // Caret line should be vertical from y = -10 to y = +10 at x = s_caret
      const caret = renderTextOnPathCaret(ctx as any, 'HELLO', 'M 0 0 L 100 0', 2, {
        startOffset: 0,
        fontSize: 20,
        color: '#ff0000',
        width: 2,
      });

      expect(caret).toBeDefined();
      // cursorIndex 2: s_caret = 0 + 10 + 10 = 20
      expect(caret!.x).toBeCloseTo(20, 1);
      expect(caret!.y).toBeCloseTo(0, 1);
      expect(caret!.tangentDeg).toBeCloseTo(0, 1);
      expect(caret!.normal.x).toBeCloseTo(0, 1);
      expect(caret!.normal.y).toBeCloseTo(1, 1);

      // p1 = (20, -10), p2 = (20, +10)
      expect(caret!.p1.x).toBeCloseTo(20, 1);
      expect(caret!.p1.y).toBeCloseTo(-10, 1);
      expect(caret!.p2.x).toBeCloseTo(20, 1);
      expect(caret!.p2.y).toBeCloseTo(10, 1);

      // Verify canvas drawing calls
      const move = ctx.calls.find((c) => c.type === 'moveTo');
      const line = ctx.calls.find((c) => c.type === 'lineTo');
      const stroke = ctx.calls.find((c) => c.type === 'stroke');

      expect(move?.x).toBeCloseTo(20, 1);
      expect(move?.y).toBeCloseTo(-10, 1);
      expect(line?.x).toBeCloseTo(20, 1);
      expect(line?.y).toBeCloseTo(10, 1);
      expect(stroke?.strokeStyle).toBe('#ff0000');
      expect(stroke?.lineWidth).toBe(2);
    });

    it('draws a horizontal caret line on a vertical path', () => {
      // Vertical downwards path: tangent is 90 deg.
      // Normal is (-sin 90°, cos 90°) = (-1, 0).
      // Caret line is horizontal: p1 at x = 0 - 10*(-1) = +10, p2 at x = 0 + 10*(-1) = -10
      const caret = renderTextOnPathCaret(ctx as any, 'ABC', 'M 0 0 V 100', 1, {
        fontSize: 20,
      });

      expect(caret).toBeDefined();
      expect(caret!.x).toBeCloseTo(0, 1);
      expect(caret!.y).toBeCloseTo(10, 1); // cursor 1 is at 10px down
      expect(caret!.tangentDeg).toBeCloseTo(90, 1);
      expect(caret!.normal.x).toBeCloseTo(-1, 1);
      expect(caret!.normal.y).toBeCloseTo(0, 1);

      expect(caret!.p1.x).toBeCloseTo(10, 1);
      expect(caret!.p1.y).toBeCloseTo(10, 1);
      expect(caret!.p2.x).toBeCloseTo(-10, 1);
      expect(caret!.p2.y).toBeCloseTo(10, 1);
    });

    it('orients caret along a diagonal path at 45°', () => {
      const caret = renderTextOnPathCaret(ctx as any, 'AB', 'M 0 0 L 100 100', 0, {
        fontSize: 20,
      });

      expect(caret).toBeDefined();
      expect(caret!.tangentDeg).toBeCloseTo(45, 1);

      // Normal should be (-sin 45°, cos 45°) = (-0.7071, 0.7071)
      const invSqrt2 = 1 / Math.SQRT2;
      expect(caret!.normal.x).toBeCloseTo(-invSqrt2, 2);
      expect(caret!.normal.y).toBeCloseTo(invSqrt2, 2);

      // Dot product of normal and tangent vector (invSqrt2, invSqrt2) must be 0
      const dot = caret!.normal.x * invSqrt2 + caret!.normal.y * invSqrt2;
      expect(dot).toBeCloseTo(0, 4);
    });

    it('orients caret along a curved path', () => {
      // Cubic bezier curve
      const caret = renderTextOnPathCaret(ctx as any, 'CURVE', 'M 0 0 Q 50 100 100 0', 2, {
        fontSize: 16,
      });

      expect(caret).toBeDefined();
      // Caret position must be on the curve
      expect(caret!.x).toBeGreaterThan(0);
      expect(caret!.y).toBeGreaterThan(0);

      // Dot product between caret normal and tangent must be 0
      const theta = (caret!.tangentDeg * Math.PI) / 180;
      const tx = Math.cos(theta);
      const ty = Math.sin(theta);
      const dot = caret!.normal.x * tx + caret!.normal.y * ty;
      expect(dot).toBeCloseTo(0, 4);
    });

    it('handles caret at start (index 0) and at end (index N)', () => {
      const atStart = renderTextOnPathCaret(ctx as any, 'TEST', 'M 0 0 L 100 0', 0, {
        startOffset: 15,
      });
      expect(atStart!.x).toBeCloseTo(15, 1);

      const atEnd = renderTextOnPathCaret(ctx as any, 'TEST', 'M 0 0 L 100 0', 4, {
        startOffset: 15,
      });
      // 4 characters * 10 = 40. 15 + 40 = 55
      expect(atEnd!.x).toBeCloseTo(55, 1);
    });
  });

  describe('3. Character Selection Highlights', () => {
    it('fills oriented quad highlights for selected character range', () => {
      // Horizontal path: "HELLO" (5 chars, each 10px). Select chars 1 to 3 ("EL")
      renderTextOnPathSelection(ctx as any, 'HELLO', 'M 0 0 L 100 0', 1, 3, {
        fontSize: 20,
        fill: 'rgba(0, 120, 215, 0.4)',
      });

      const fillCalls = ctx.calls.filter((c) => c.type === 'fill');
      expect(fillCalls).toHaveLength(2); // 2 characters selected: index 1 and 2
      expect(fillCalls[0].fillStyle).toBe('rgba(0, 120, 215, 0.4)');

      // Check quads: each character has moveTo, 3x lineTo, closePath
      const moveTos = ctx.calls.filter((c) => c.type === 'moveTo');
      expect(moveTos).toHaveLength(2);
      // Char 1 starts at x = 10, normal (0, 1), fontSize 20 -> halfH 10 -> (10, -10)
      expect(moveTos[0].x).toBeCloseTo(10, 1);
      expect(moveTos[0].y).toBeCloseTo(-10, 1);
    });

    it('normalizes reversed selection indices (selStart > selEnd)', () => {
      renderTextOnPathSelection(ctx as any, 'ABC', 'M 0 0 L 100 0', 2, 0);
      const fillCalls = ctx.calls.filter((c) => c.type === 'fill');
      // Should select indices 0 and 1 (2 quads)
      expect(fillCalls).toHaveLength(2);
    });

    it('does nothing when selection is empty (selStart === selEnd)', () => {
      renderTextOnPathSelection(ctx as any, 'ABC', 'M 0 0 L 100 0', 1, 1);
      const fillCalls = ctx.calls.filter((c) => c.type === 'fill');
      expect(fillCalls).toHaveLength(0);
    });
  });

  describe('4. Projection Hit-Testing (getCursorIndexOnPath)', () => {
    it('returns 0 when clicking near the start of the path', () => {
      const idx = getCursorIndexOnPath({ x: 2, y: 0 }, 'HELLO', 'M 0 0 L 100 0', {
        ctx: ctx as any,
      });
      expect(idx).toBe(0);
    });

    it('returns expected character boundary index when clicking near character boundaries', () => {
      // 'HELLO': 5 chars, widths = 10. Boundaries at 0, 10, 20, 30, 40, 50.
      // Click at x = 12 (near boundary 1 at x = 10) -> returns 1
      expect(
        getCursorIndexOnPath({ x: 12, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(1);

      // Click at x = 23 (near boundary 2 at x = 20) -> returns 2
      expect(
        getCursorIndexOnPath({ x: 23, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(2);

      // Click at x = 28 (closer to boundary 3 at x = 30) -> returns 3
      expect(
        getCursorIndexOnPath({ x: 28, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(3);
    });

    it('returns N when clicking near or past the end of the text', () => {
      // Boundary 5 is at x = 50
      expect(
        getCursorIndexOnPath({ x: 48, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(5);

      // Click far past end at x = 90
      expect(
        getCursorIndexOnPath({ x: 90, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(5);
    });

    it('returns 0 when clicking before the start of text', () => {
      expect(
        getCursorIndexOnPath({ x: -25, y: 0 }, 'HELLO', 'M 0 0 L 100 0', { ctx: ctx as any })
      ).toBe(0);
    });

    it('handles perpendicular click offset above or below the path', () => {
      // Click at x = 18, y = 25 (perpendicular offset below curve). Closer to boundary 2 (x=20) than boundary 1 (x=10)
      const idx = getCursorIndexOnPath({ x: 18, y: 25 }, 'HELLO', 'M 0 0 L 100 0', {
        ctx: ctx as any,
      });
      expect(idx).toBe(2);
    });

    it('projects hit-testing accurately on curved paths', () => {
      // Arc path
      const pathD = 'M 0 0 Q 50 100 100 0';
      // Near start (0, 0)
      expect(getCursorIndexOnPath({ x: 0, y: 0 }, 'ABC', pathD, { ctx: ctx as any })).toBe(0);
      // Near end (100, 0)
      expect(getCursorIndexOnPath({ x: 100, y: 0 }, 'ABC', pathD, { ctx: ctx as any })).toBe(3);
    });
  });

  describe('5. Integration inside CanvasRenderer', () => {
    it('delegates to renderTextOnPath when pathConfig.pathData is present on TextElement', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas);

      const textEl: TextElement = {
        id: 'txt_on_path',
        type: 'text',
        mode: 'static',
        text: 'PATH',
        pathConfig: {
          pathData: 'M 0 0 L 200 0',
          startOffset: 10,
        },
        fontId: 'sans-serif',
        fontSize: 16,
        color: '#ff5500',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
      };

      const clip = new MovieClip();
      const obj = new DisplayObject('txt_on_path');
      obj.currentDef = textEl;
      clip.addChild(obj);

      renderer.attach(clip);
      renderer.render();

      const mockCtx = (renderer.ctx as any);
      // Should have performed canvas text-on-path rendering (translate + rotate + fillText)
      const fills = mockCtx.calls.filter((c: any) => c.method === 'fillText' || c.type === 'fillText');
      expect(fills.length).toBeGreaterThanOrEqual(4);
      expect(fills.map((f: any) => f.args ? f.args[0] : f.text)).toEqual(['P', 'A', 'T', 'H']);
    });

    it('resolves path from renderer.index when pathConfig.pathId is set', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas);

      // Register path in renderer.index
      const shapePath: ShapeElement = {
        id: 'guide_curve',
        type: 'shape',
        paths: [
          {
            d: 'M 10 10 L 150 10',
          },
        ],
      };
      renderer.index.set('guide_curve', shapePath);

      const textEl: TextElement = {
        id: 'txt_indexed_path',
        type: 'text',
        mode: 'static',
        text: 'INDEXED',
        pathConfig: {
          pathId: 'guide_curve',
        },
        fontId: 'sans-serif',
        fontSize: 14,
        color: '#00aa00',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
      };

      const clip = new MovieClip();
      const obj = new DisplayObject('txt_indexed_path');
      obj.currentDef = textEl;
      clip.addChild(obj);

      renderer.attach(clip);
      renderer.render();

      const mockCtx = (renderer.ctx as any);
      const fills = mockCtx.calls.filter((c: any) => c.method === 'fillText' || c.type === 'fillText');
      expect(fills.length).toBeGreaterThanOrEqual(7);
      expect(fills.map((f: any) => f.args ? f.args[0] : f.text)).toEqual(['I', 'N', 'D', 'E', 'X', 'E', 'D']);
    });

    it('resolves path from document library symbol timelines when pathId is set', () => {
      const canvas = document.createElement('canvas');
      const doc: AnimDocument = {
        stage: { width: 400, height: 300, background: { type: 'solid', color: '#ffffff' } },
        root: { layers: [] },
        library: {
          symbols: {
            sym_path_lib: {
              id: 'sym_path_lib',
              name: 'PathSymbol',
              kind: 'movieclip',
              registration: { x: 0, y: 0 },
              timeline: {
                layers: [
                  {
                    id: 'layer_path',
                    name: 'PathLayer',
                    keyframes: [
                      {
                        frame: 0,
                        duration: 1,
                        elements: [
                          {
                            id: 'sym_guide_path',
                            type: 'shape',
                            paths: [{ d: 'M 0 50 L 200 50' }],
                          } as ShapeElement,
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
      };

      const renderer = new CanvasRenderer(canvas, { doc });

      const textEl: TextElement = {
        id: 'txt_sym_path',
        type: 'text',
        mode: 'static',
        text: 'SYM',
        pathConfig: {
          pathId: 'sym_guide_path',
        },
        fontId: 'sans-serif',
        fontSize: 16,
        color: '#333333',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
      };

      const clip = new MovieClip();
      const obj = new DisplayObject('txt_sym_path');
      obj.currentDef = textEl;
      clip.addChild(obj);

      renderer.attach(clip);
      renderer.render();

      const mockCtx = (renderer.ctx as any);
      const fills = mockCtx.calls.filter((c: any) => c.method === 'fillText' || c.type === 'fillText');
      expect(fills.map((f: any) => f.args ? f.args[0] : f.text)).toEqual(['S', 'Y', 'M']);
    });

    it('renders active editor selection and caret when activeEditorState is configured', () => {
      const canvas = document.createElement('canvas');
      const renderer = new CanvasRenderer(canvas, {
        activeEditorState: {
          elementId: 'editable_txt',
          selectionStart: 1,
          selectionEnd: 3,
          cursorIndex: 3,
          caretColor: '#ff00ff',
          caretWidth: 2,
        },
      });

      const textEl: TextElement = {
        id: 'editable_txt',
        type: 'text',
        mode: 'static',
        text: 'EDITOR',
        pathConfig: {
          pathData: 'M 0 0 L 200 0',
        },
        fontId: 'sans-serif',
        fontSize: 16,
        color: '#000000',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
      };

      const clip = new MovieClip();
      const obj = new DisplayObject('editable_txt');
      obj.currentDef = textEl;
      clip.addChild(obj);

      renderer.attach(clip);
      renderer.render();

      const mockCtx = (renderer.ctx as any);

      // Verify caret was stroked
      const strokeCalls = mockCtx.calls.filter((c: any) => c.method === 'stroke' || c.type === 'stroke');
      expect(strokeCalls.length).toBeGreaterThan(0);
      const caretStroke = strokeCalls.find((c: any) => c.strokeStyle === '#ff00ff');
      expect(caretStroke).toBeDefined();

      // Verify text characters were filled
      const fills = mockCtx.calls.filter((c: any) => c.method === 'fillText' || c.type === 'fillText');
      expect(fills.map((f: any) => f.args ? f.args[0] : f.text)).toEqual(['E', 'D', 'I', 'T', 'O', 'R']);
    });
  });
});
