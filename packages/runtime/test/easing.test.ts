import { describe, it, expect } from 'vitest';
import {
  compileEasingToCSS,
  evaluateEasing,
  solveCubicBezier,
  evaluateSteps,
  evaluateLinearPoints,
  cleanNumber,
} from '../src/player/easing';
import type { Easing } from '../src/schema';

describe('Easing System', () => {
  describe('compileEasingToCSS', () => {
    it('compiles linear easing', () => {
      expect(compileEasingToCSS({ type: 'linear' })).toBe('linear');
      expect(compileEasingToCSS(undefined)).toBe('linear');
    });

    it('compiles preset easing names', () => {
      expect(compileEasingToCSS({ type: 'preset', name: 'ease' })).toBe('ease');
      expect(compileEasingToCSS({ type: 'preset', name: 'ease-in' })).toBe('ease-in');
      expect(compileEasingToCSS({ type: 'preset', name: 'ease-out' })).toBe('ease-out');
      expect(compileEasingToCSS({ type: 'preset', name: 'ease-in-out' })).toBe('ease-in-out');
    });

    it('compiles cubic-bezier easing', () => {
      const easing: Easing = { type: 'cubic-bezier', p: [0.25, 0.1, 0.25, 1.0] };
      expect(compileEasingToCSS(easing)).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
    });

    it('compiles steps easing', () => {
      expect(compileEasingToCSS({ type: 'steps', count: 4, position: 'end' })).toBe('steps(4, end)');
      expect(compileEasingToCSS({ type: 'steps', count: 5, position: 'start' })).toBe('steps(5, start)');
    });

    it('compiles linear-points easing to CSS linear()', () => {
      const easing: Easing = {
        type: 'linear-points',
        points: [
          [0, 0],
          [0.5, 0.25],
          [1, 1],
        ],
      };
      expect(compileEasingToCSS(easing)).toBe('linear(0 0%, 0.5 25%, 1 100%)');
    });

    it('handles empty linear-points fallback', () => {
      expect(compileEasingToCSS({ type: 'linear-points', points: [] })).toBe('linear');
    });
  });

  describe('evaluateEasing', () => {
    it('evaluates linear easing', () => {
      const easing: Easing = { type: 'linear' };
      expect(evaluateEasing(easing, 0)).toBe(0);
      expect(evaluateEasing(easing, 0.5)).toBe(0.5);
      expect(evaluateEasing(easing, 1)).toBe(1);
    });

    it('evaluates cubic-bezier presets', () => {
      const ease: Easing = { type: 'preset', name: 'ease' };
      expect(evaluateEasing(ease, 0)).toBe(0);
      expect(evaluateEasing(ease, 1)).toBe(1);
      const mid = evaluateEasing(ease, 0.5);
      expect(mid).toBeGreaterThan(0.5); // ease is fast in the middle
    });

    it('evaluates custom cubic-bezier curves accurately', () => {
      const easeInOut: Easing = { type: 'cubic-bezier', p: [0.42, 0, 0.58, 1] };
      expect(evaluateEasing(easeInOut, 0)).toBe(0);
      expect(evaluateEasing(easeInOut, 1)).toBe(1);
      expect(Math.abs(evaluateEasing(easeInOut, 0.5) - 0.5)).toBeLessThan(0.01);
    });

    it('evaluates steps easing', () => {
      const stepsEnd: Easing = { type: 'steps', count: 4, position: 'end' };
      expect(evaluateEasing(stepsEnd, 0)).toBe(0);
      expect(evaluateEasing(stepsEnd, 0.24)).toBe(0);
      expect(evaluateEasing(stepsEnd, 0.25)).toBe(0.25);
      expect(evaluateEasing(stepsEnd, 0.5)).toBe(0.5);
      expect(evaluateEasing(stepsEnd, 0.75)).toBe(0.75);
      expect(evaluateEasing(stepsEnd, 1)).toBe(1);

      const stepsStart: Easing = { type: 'steps', count: 4, position: 'start' };
      expect(evaluateEasing(stepsStart, 0)).toBe(0.25);
      expect(evaluateEasing(stepsStart, 0.24)).toBe(0.25);
      expect(evaluateEasing(stepsStart, 0.25)).toBe(0.5);
      expect(evaluateEasing(stepsStart, 1)).toBe(1);
    });

    it('evaluates linear-points piecewise interpolation', () => {
      const spring: Easing = {
        type: 'linear-points',
        points: [
          [0, 0],
          [1.2, 0.5], // overshoot
          [1.0, 1.0],
        ],
      };
      expect(evaluateEasing(spring, 0)).toBe(0);
      expect(evaluateEasing(spring, 0.5)).toBe(1.2);
      expect(evaluateEasing(spring, 1.0)).toBe(1.0);
      // Interpolation halfway between 0 and 0.5 -> 0.6
      expect(Math.abs(evaluateEasing(spring, 0.25) - 0.6)).toBeLessThan(1e-6);
    });
  });
});
