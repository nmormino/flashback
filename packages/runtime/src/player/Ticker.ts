export interface Clock {
  now(): number;
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  cancelAnimationFrame(id: number): void;
}

export const defaultClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  requestAnimationFrame: (cb) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(defaultClock.now()), 16) as unknown as number;
  },
  cancelAnimationFrame: (id) => {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  },
};

export interface TickerOptions {
  fps?: number;
  clock?: Clock;
  maxSubTicks?: number;
  maxDelta?: number;
  onTick: () => void;
  onRender?: (interpolation: number) => void;
}

/**
 * Fixed-timestep accumulator loop driven by requestAnimationFrame.
 * Decouples animation simulation from display refresh rates.
 * Supports an injectable Clock for deterministic unit tests.
 */
export class Ticker {
  public fps: number;
  public frameDurationMs: number;
  public clock: Clock;
  public maxSubTicks: number;
  public maxDelta: number;

  private onTick: () => void;
  private onRender?: (interpolation: number) => void;

  private accumulator = 0;
  private lastTime = 0;
  private rafId: number | null = null;
  private running = false;

  constructor(options: TickerOptions) {
    this.fps = options.fps ?? 24;
    this.frameDurationMs = 1000 / this.fps;
    this.clock = options.clock ?? defaultClock;
    this.maxSubTicks = options.maxSubTicks ?? 4;
    this.maxDelta = options.maxDelta ?? 100;
    this.onTick = options.onTick;
    this.onRender = options.onRender;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public setFps(fps: number): void {
    this.fps = fps;
    this.frameDurationMs = 1000 / fps;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.clock.now();
    this.accumulator = 0;
    this.rafId = this.clock.requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      this.clock.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public reset(): void {
    this.accumulator = 0;
    this.lastTime = this.clock.now();
  }

  /**
   * Manually steps forward exactly 1 tick.
   * Useful in tests for deterministic step-by-step verification.
   */
  public step(): void {
    this.onTick();
    if (this.onRender) {
      this.onRender(1);
    }
  }

  /**
   * Advances the clock accumulator by `deltaMs` and executes any accumulated sub-ticks.
   */
  public advance(deltaMs: number): void {
    let delta = deltaMs;
    if (delta > this.maxDelta) delta = this.maxDelta;
    if (delta < 0) delta = 0;

    this.accumulator += delta;

    let subTicks = 0;
    while (this.accumulator >= this.frameDurationMs && subTicks < this.maxSubTicks) {
      this.onTick();
      this.accumulator -= this.frameDurationMs;
      subTicks++;
    }

    if (this.onRender) {
      const interpolation = Math.min(1, Math.max(0, this.accumulator / this.frameDurationMs));
      this.onRender(interpolation);
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return;

    let delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > this.maxDelta) delta = this.maxDelta;
    if (delta < 0) delta = 0;

    this.accumulator += delta;

    let subTicks = 0;
    while (this.accumulator >= this.frameDurationMs && subTicks < this.maxSubTicks) {
      this.onTick();
      this.accumulator -= this.frameDurationMs;
      subTicks++;
    }

    if (this.onRender) {
      const interpolation = Math.min(1, Math.max(0, this.accumulator / this.frameDurationMs));
      this.onRender(interpolation);
    }

    this.rafId = this.clock.requestAnimationFrame(this.loop);
  };
}
