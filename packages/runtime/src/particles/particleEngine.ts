import confetti from 'canvas-confetti';
import type { ParticleEmitterOptions, ParticlePreset } from '../schema';

export interface ParticleTarget {
  canvas?: HTMLCanvasElement;
  container?: HTMLElement;
  stageWidth?: number;
  stageHeight?: number;
}

export class ParticleEngine {
  private _confettiInstance: confetti.CreateTypes | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _stageWidth = 550;
  private _stageHeight = 400;

  constructor(target?: ParticleTarget) {
    if (target?.canvas) {
      this.attachCanvas(target.canvas);
    }
    if (target?.stageWidth) this._stageWidth = target.stageWidth;
    if (target?.stageHeight) this._stageHeight = target.stageHeight;
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
    // Guard against headless/DOM environments like happy-dom where canvas 2D context is not implemented
    if (typeof canvas.getContext === 'function' && !canvas.getContext('2d')) {
      return;
    }
    if (typeof confetti.create === 'function') {
      try {
        this._confettiInstance = confetti.create(canvas, {
          resize: true,
          useWorker: false,
        });
      } catch (err) {
        console.warn('[ParticleEngine] Could not initialize canvas-confetti instance:', err);
      }
    }
  }

  public setStageDimensions(width: number, height: number): void {
    this._stageWidth = width > 0 ? width : 550;
    this._stageHeight = height > 0 ? height : 400;
  }

  public emit(options: ParticleEmitterOptions = {}): void {
    if (typeof window === 'undefined') return;
    if (this._canvas && typeof this._canvas.getContext === 'function' && !this._canvas.getContext('2d')) {
      return;
    }

    const fire = this._confettiInstance || confetti;
    if (typeof fire !== 'function') return;

    // Calculate normalized origin (0..1)
    let originX = 0.5;
    let originY = 0.5;

    if (options.origin) {
      originX = Math.max(0, Math.min(1, options.origin.x));
      originY = Math.max(0, Math.min(1, options.origin.y));
    } else if (options.x !== undefined || options.y !== undefined) {
      if (options.x !== undefined) {
        originX = Math.max(0, Math.min(1, options.x / this._stageWidth));
      }
      if (options.y !== undefined) {
        originY = Math.max(0, Math.min(1, options.y / this._stageHeight));
      }
    }

    const preset = options.preset || 'burst';
    const merged = this.buildPresetConfig(preset, originX, originY, options);

    try {
      fire(merged);
    } catch (err) {
      // In SSR or canvas-disabled environments, silently skip
      console.warn('[ParticleEngine] Emission skipped:', err);
    }
  }

  private buildPresetConfig(
    preset: ParticlePreset,
    originX: number,
    originY: number,
    opts: ParticleEmitterOptions
  ): confetti.Options {
    const base: confetti.Options = {
      origin: { x: originX, y: originY },
      disableForReducedMotion: opts.disableForReducedMotion ?? true,
    };

    switch (preset) {
      case 'splat':
        return {
          ...base,
          particleCount: opts.count ?? 35,
          spread: opts.spread ?? 360,
          startVelocity: opts.velocity ?? 15,
          decay: opts.decay ?? 0.88,
          gravity: opts.gravity ?? 0.6,
          scalar: opts.scalar ?? 0.8,
          ticks: opts.ticks ?? 100,
          shapes: opts.shapes ?? ['circle'],
          colors: opts.colors ?? ['#ef4444', '#dc2626', '#b91c1c', '#f87171', '#991b1b'],
        };

      case 'confetti':
        return {
          ...base,
          particleCount: opts.count ?? 60,
          spread: opts.spread ?? 70,
          startVelocity: opts.velocity ?? 30,
          decay: opts.decay ?? 0.92,
          gravity: opts.gravity ?? 1.1,
          scalar: opts.scalar ?? 1.0,
          ticks: opts.ticks ?? 200,
          colors: opts.colors ?? ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'],
        };

      case 'sparks':
        return {
          ...base,
          particleCount: opts.count ?? 45,
          spread: opts.spread ?? 60,
          angle: opts.angle ?? 90,
          startVelocity: opts.velocity ?? 35,
          decay: opts.decay ?? 0.94,
          gravity: opts.gravity ?? 1.3,
          scalar: opts.scalar ?? 0.5,
          ticks: opts.ticks ?? 80,
          shapes: opts.shapes ?? ['circle', 'square'],
          colors: opts.colors ?? ['#fbbf24', '#f59e0b', '#d97706', '#ef4444', '#ffffff'],
        };

      case 'spray':
        return {
          ...base,
          particleCount: opts.count ?? 50,
          angle: opts.angle ?? 90,
          spread: opts.spread ?? 45,
          startVelocity: opts.velocity ?? 40,
          gravity: opts.gravity ?? 1.0,
          decay: opts.decay ?? 0.9,
          ticks: opts.ticks ?? 150,
          colors: opts.colors ?? ['#38bdf8', '#0ea5e9', '#0284c7', '#7dd3fc', '#bae6fd'],
        };

      case 'stream':
        return {
          ...base,
          particleCount: opts.count ?? 25,
          angle: opts.angle ?? 0,
          spread: opts.spread ?? 20,
          startVelocity: opts.velocity ?? 30,
          gravity: opts.gravity ?? 0.2,
          decay: opts.decay ?? 0.93,
          ticks: opts.ticks ?? 120,
          colors: opts.colors ?? ['#a855f7', '#8b5cf6', '#c084fc', '#d8b4fe'],
        };

      case 'burst':
      default:
        return {
          ...base,
          particleCount: opts.count ?? 40,
          spread: opts.spread ?? 360,
          startVelocity: opts.velocity ?? 25,
          decay: opts.decay ?? 0.9,
          gravity: opts.gravity ?? 0.8,
          scalar: opts.scalar ?? 0.9,
          ticks: opts.ticks ?? 120,
          colors: opts.colors ?? ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#fbbf24'],
        };
    }
  }

  public reset(): void {
    if (this._confettiInstance && typeof this._confettiInstance.reset === 'function') {
      try {
        this._confettiInstance.reset();
      } catch (err) {
        // ignore
      }
    }
  }
}
