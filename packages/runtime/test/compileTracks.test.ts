import { describe, it, expect } from 'vitest';
import {
  compileTracks,
  compileLayerTracks,
  sampleTrack,
  normalizeRotation,
  formatTransformCSS,
  alignFilterLists,
} from '../src/player/compileTracks';
import type { TimelineDef, LayerDef, DisplayElement } from '../src/schema';

describe('WAAPI Track Compiler (compileTracks)', () => {
  describe('Rotation Normalization', () => {
    it('takes shortest path when rotate is undefined (Flash default)', () => {
      // 350 to 10 is +20 deg (shortest path)
      const r1 = normalizeRotation(350, 10);
      expect(r1.startRot).toBe(350);
      expect(r1.endRot).toBe(370);

      // 10 to 350 is -20 deg
      const r2 = normalizeRotation(10, 350);
      expect(r2.startRot).toBe(10);
      expect(r2.endRot).toBe(-10);
    });

    it('handles explicit CW multi-turn rotation', () => {
      // Rotate CW 2 turns from 0 to 90 deg -> 0 to (90 + 720) = 810 deg
      const cw = normalizeRotation(0, 90, { direction: 'cw', turns: 2 });
      expect(cw.startRot).toBe(0);
      expect(cw.endRot).toBe(810);

      // Rotate CW 0 turns from 350 to 10 deg -> +20 deg -> 370 deg
      const cw0 = normalizeRotation(350, 10, { direction: 'cw', turns: 0 });
      expect(cw0.endRot).toBe(370);
    });

    it('handles explicit CCW multi-turn rotation', () => {
      // Rotate CCW 1 turn from 90 to 0 deg -> 90 - (90 + 360) = -360 deg
      const ccw = normalizeRotation(90, 0, { direction: 'ccw', turns: 1 });
      expect(ccw.startRot).toBe(90);
      expect(ccw.endRot).toBe(-360);

      // Rotate CCW 0 turns from 10 to 350 deg -> -20 deg -> -10 deg
      const ccw0 = normalizeRotation(10, 350, { direction: 'ccw', turns: 0 });
      expect(ccw0.endRot).toBe(-10);
    });
  });

  describe('Decomposed-safe Transform Formatting', () => {
    it('emits CSS transform functions in consistent order (translate rotate scale skew)', () => {
      const css = formatTransformCSS({
        x: 100,
        y: 200,
        scaleX: 1.5,
        scaleY: 2,
        rotation: 45,
        skewX: 10,
        skewY: 5,
      });
      expect(css).toBe('translate(100px, 200px) rotate(45deg) scale(1.5, 2) skew(10deg, 5deg)');
    });
  });

  describe('Filter Alignment', () => {
    it('aligns missing filters with neutral defaults', () => {
      const { startCSS, endCSS } = alignFilterLists(
        [{ type: 'blur', radius: 10 }],
        []
      );
      expect(startCSS).toBe('blur(10px)');
      expect(endCSS).toBe('blur(0px)');
    });

    it('aligns multiple filters in consistent order', () => {
      const { startCSS, endCSS } = alignFilterLists(
        [{ type: 'blur', radius: 5 }],
        [{ type: 'blur', radius: 15 }, { type: 'brightness', amount: 2 }]
      );
      expect(startCSS).toBe('blur(5px) brightness(1)');
      expect(endCSS).toBe('blur(15px) brightness(2)');
    });
  });

  describe('Single-Layer Motion Tween Compilation', () => {
    it('compiles motion tween matching elements by stable ID', () => {
      const layer: LayerDef = {
        id: 'layer1',
        name: 'Layer 1',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'hero',
                type: 'instance',
                symbolId: 'symHero',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 25, originY: 25 },
                alpha: 1,
                visible: true,
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'linear' },
            },
          },
          {
            id: 'kf2',
            index: 10,
            duration: 10,
            elements: [
              {
                id: 'hero',
                type: 'instance',
                symbolId: 'symHero',
                transform: { x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 90, skewX: 0, skewY: 0, originX: 25, originY: 25 },
                alpha: 0.5,
                visible: true,
              },
            ],
          },
        ],
      };

      const tracks = compileLayerTracks(layer, 24);
      expect(tracks).toHaveLength(1);

      const track = tracks[0];
      expect(track.elementId).toBe('hero');
      expect(track.keyframes).toHaveLength(2);

      // Keyframe 0
      expect(track.keyframes[0].offset).toBe(0);
      expect(track.keyframes[0].transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1) skew(0deg, 0deg)');
      expect(track.keyframes[0].opacity).toBe(1);
      expect(track.keyframes[0].transformOrigin).toBe('25px 25px');
      expect(track.keyframes[0].easing).toBe('linear');

      // Keyframe 1
      expect(track.keyframes[1].offset).toBe(0.5); // 10 / 20
      expect(track.keyframes[1].transform).toBe('translate(100px, 50px) rotate(90deg) scale(2, 2) skew(0deg, 0deg)');
      expect(track.keyframes[1].opacity).toBe(0.5);
      expect(track.keyframes[1].transformOrigin).toBe('25px 25px');
    });

    it('compiles multi-segment chained motion tweens for the same element', () => {
      const layer: LayerDef = {
        id: 'layer1',
        name: 'Layer 1',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'ball',
                type: 'instance',
                symbolId: 'symBall',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'preset', name: 'ease-in' },
            },
          },
          {
            id: 'kf2',
            index: 10,
            duration: 10,
            elements: [
              {
                id: 'ball',
                type: 'instance',
                symbolId: 'symBall',
                transform: { x: 50, y: 100, scaleX: 1, scaleY: 1, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 0.8,
                visible: true,
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'preset', name: 'ease-out' },
            },
          },
          {
            id: 'kf3',
            index: 20,
            duration: 10,
            elements: [
              {
                id: 'ball',
                type: 'instance',
                symbolId: 'symBall',
                transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 360, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
          },
        ],
      };

      const tracks = compileLayerTracks(layer, 24);
      expect(tracks).toHaveLength(1);
      const track = tracks[0];

      expect(track.keyframes).toHaveLength(3);
      expect(track.keyframes[0].offset).toBeCloseTo(0, 4);
      expect(track.keyframes[1].offset).toBeCloseTo(10 / 30, 4);
      expect(track.keyframes[2].offset).toBeCloseTo(20 / 30, 4);
    });
  });

  describe('Motion Guide Path Baking', () => {
    it('bakes keyframes along an SVG path with orientToPath', () => {
      const guideLayer: LayerDef = {
        id: 'guideLayer1',
        name: 'Guide',
        kind: 'guide',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'gkf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'pathShape',
                type: 'shape',
                paths: [{ d: 'M 0 0 L 100 0' }], // straight horizontal line
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
          },
        ],
      };

      const motionLayer: LayerDef = {
        id: 'motionLayer1',
        name: 'Motion',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'mkf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'rocket',
                type: 'instance',
                symbolId: 'symRocket',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'linear' },
              motionGuide: {
                layerId: 'guideLayer1',
                orientToPath: true,
              },
            },
          },
          {
            id: 'mkf2',
            index: 10,
            duration: 5,
            elements: [
              {
                id: 'rocket',
                type: 'instance',
                symbolId: 'symRocket',
                transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
          },
        ],
      };

      const timeline: TimelineDef = {
        frameCount: 15,
        layers: [guideLayer, motionLayer],
      };

      const tracks = compileTracks(timeline, 24);
      // Guide layer produces 0 tracks; motion layer produces 1 track
      expect(tracks).toHaveLength(1);

      const track = tracks[0];
      // Expect 10 baked frames (frames 0 to 9) + 1 final frame at frame 10 = 11 keyframes
      expect(track.keyframes).toHaveLength(11);

      // Frame 0
      expect(track.keyframes[0].transform).toContain('translate(0px, 0px)');
      // Frame 5 (halfway)
      expect(track.keyframes[5].transform).toContain('translate(50px, 0px)');
      // Frame 10 (end)
      expect(track.keyframes[10].transform).toContain('translate(100px, 0px)');
    });
  });

  describe('Pure sampleTrack Evaluator', () => {
    it('samples interpolated values at arbitrary frames', () => {
      const layer: LayerDef = {
        id: 'layer1',
        name: 'Layer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'star',
                type: 'instance',
                symbolId: 'symStar',
                transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
                filters: [{ type: 'blur', radius: 0 }],
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'linear' },
            },
          },
          {
            id: 'kf2',
            index: 10,
            duration: 10,
            elements: [
              {
                id: 'star',
                type: 'instance',
                symbolId: 'symStar',
                transform: { x: 50, y: 100, scaleX: 2, scaleY: 3, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 0,
                visible: true,
                filters: [{ type: 'blur', radius: 10 }],
              },
            ],
          },
        ],
      };

      const [track] = compileLayerTracks(layer, 24);

      // Sample at frame 0 (start)
      const s0 = sampleTrack(track, 0);
      expect(s0.x).toBeCloseTo(10);
      expect(s0.y).toBeCloseTo(20);
      expect(s0.scaleX).toBeCloseTo(1);
      expect(s0.opacity).toBeCloseTo(1);
      expect(s0.filter).toContain('blur(0px)');

      // Sample at frame 5 (halfway)
      const s5 = sampleTrack(track, 5);
      expect(s5.x).toBeCloseTo(30);
      expect(s5.y).toBeCloseTo(60);
      expect(s5.scaleX).toBeCloseTo(1.5);
      expect(s5.scaleY).toBeCloseTo(2);
      expect(s5.rotation).toBeCloseTo(90);
      expect(s5.opacity).toBeCloseTo(0.5);
      expect(s5.filter).toContain('blur(5px)');

      // Sample at fractional frame 2.5
      const s25 = sampleTrack(track, 2.5);
      expect(s25.x).toBeCloseTo(20);
      expect(s25.y).toBeCloseTo(40);

      // Sample at frame 10 (end)
      const s10 = sampleTrack(track, 10);
      expect(s10.x).toBeCloseTo(50);
      expect(s10.y).toBeCloseTo(100);
      expect(s10.scaleX).toBeCloseTo(2);
      expect(s10.scaleY).toBeCloseTo(3);
      expect(s10.rotation).toBeCloseTo(180);
      expect(s10.opacity).toBeCloseTo(0);
      expect(s10.filter).toContain('blur(10px)');

      // Clamping before frame 0
      const sBefore = sampleTrack(track, -5);
      expect(sBefore.x).toBeCloseTo(10);
      expect(sBefore.y).toBeCloseTo(20);

      // Clamping after frame 10
      const sAfter = sampleTrack(track, 20);
      expect(sAfter.x).toBeCloseTo(50);
      expect(sAfter.y).toBeCloseTo(100);
    });

    it('respects tweenable properties restriction (e.g. alpha only)', () => {
      const layer: LayerDef = {
        id: 'layer1',
        name: 'Layer',
        kind: 'normal',
        visible: true,
        locked: false,
        keyframes: [
          {
            id: 'kf1',
            index: 0,
            duration: 10,
            elements: [
              {
                id: 'ghost',
                type: 'instance',
                symbolId: 'symGhost',
                transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 1,
                visible: true,
              },
            ],
            tween: {
              type: 'motion',
              easing: { type: 'linear' },
              properties: ['alpha'], // transform should NOT interpolate
            },
          },
          {
            id: 'kf2',
            index: 10,
            duration: 5,
            elements: [
              {
                id: 'ghost',
                type: 'instance',
                symbolId: 'symGhost',
                transform: { x: 500, y: 500, scaleX: 5, scaleY: 5, rotation: 180, skewX: 0, skewY: 0, originX: 0, originY: 0 },
                alpha: 0,
                visible: true,
              },
            ],
          },
        ],
      };

      const [track] = compileLayerTracks(layer, 24);
      const sHalf = sampleTrack(track, 5);
      // Alpha interpolated halfway
      expect(sHalf.opacity).toBeCloseTo(0.5);
      // Transform remained constant at start values
      expect(sHalf.x).toBe(50);
      expect(sHalf.y).toBe(50);
      expect(sHalf.scaleX).toBe(1);
    });
  });
});
