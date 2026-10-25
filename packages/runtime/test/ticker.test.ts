import { describe, it, expect, vi } from 'vitest';
import { Ticker, type Clock } from '../src/player/Ticker';

class TestClock implements Clock {
  public currentTime = 0;
  private nextId = 1;
  public callbacks = new Map<number, (time: number) => void>();

  now(): number {
    return this.currentTime;
  }

  requestAnimationFrame(cb: (time: number) => void): number {
    const id = this.nextId++;
    this.callbacks.set(id, cb);
    return id;
  }

  cancelAnimationFrame(id: number): void {
    this.callbacks.delete(id);
  }

  advance(ms: number): void {
    this.currentTime += ms;
    const cbs = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of cbs) {
      cb(this.currentTime);
    }
  }
}

describe('Ticker with fixed timestep and injectable clock', () => {
  it('manually steps exactly 1 tick with step()', () => {
    let tickCount = 0;
    let renderInterp = 0;

    const ticker = new Ticker({
      fps: 24,
      onTick: () => {
        tickCount++;
      },
      onRender: (interp) => {
        renderInterp = interp;
      },
    });

    ticker.step();
    expect(tickCount).toBe(1);
    expect(renderInterp).toBe(1);

    ticker.step();
    expect(tickCount).toBe(2);
  });

  it('accumulates time and executes sub-ticks using an injectable clock', () => {
    const clock = new TestClock();
    let ticks = 0;

    const ticker = new Ticker({
      fps: 20, // 50ms per frame
      clock,
      onTick: () => {
        ticks++;
      },
    });

    ticker.start();
    expect(ticker.isRunning).toBe(true);

    // Advance 40ms (< 50ms): 0 ticks
    clock.advance(40);
    expect(ticks).toBe(0);

    // Advance another 20ms (total 60ms >= 50ms): 1 tick, 10ms remains in accumulator
    clock.advance(20);
    expect(ticks).toBe(1);

    // Advance 90ms (10ms + 90ms = 100ms = exactly 2 frames): 2 more ticks -> total 3
    clock.advance(90);
    expect(ticks).toBe(3);

    ticker.stop();
    expect(ticker.isRunning).toBe(false);
  });

  it('clamps large deltas with maxDelta and maxSubTicks to prevent spiral of death', () => {
    const clock = new TestClock();
    let ticks = 0;

    const ticker = new Ticker({
      fps: 25, // 40ms per frame
      clock,
      maxDelta: 100, // Clamp at 100ms
      maxSubTicks: 2, // Maximum 2 sub-ticks per frame
      onTick: () => {
        ticks++;
      },
    });

    ticker.start();

    // Giant spike of 5000ms (e.g. background tab or freeze)
    clock.advance(5000);

    // Should be clamped to maxSubTicks = 2
    expect(ticks).toBe(2);

    ticker.stop();
  });

  it('supports direct manual advance(ms)', () => {
    let ticks = 0;
    const ticker = new Ticker({
      fps: 50, // 20ms per frame
      onTick: () => {
        ticks++;
      },
    });

    ticker.advance(15);
    expect(ticks).toBe(0);

    ticker.advance(35); // 15 + 35 = 50ms -> 2 ticks (40ms consumed, 10ms left)
    expect(ticks).toBe(2);

    ticker.advance(10); // 10 + 10 = 20ms -> 1 more tick
    expect(ticks).toBe(3);
  });
});
