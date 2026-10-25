import { describe, it, expect, vi } from 'vitest';
import { TrackSync, syncAnimations } from '../src/player/TrackSync';

/**
 * Mock implementation of Web Animations API Animation interface for test environments.
 */
class MockAnimation implements Partial<Animation> {
  public currentTime: number | null = 0;
  public playState: AnimationPlayState = 'running';
  public playbackRate = 1;

  public pause = vi.fn(() => {
    this.playState = 'paused';
  });

  public play = vi.fn(() => {
    this.playState = 'running';
  });

  public cancel = vi.fn(() => {
    this.playState = 'idle';
  });
}

describe('TrackSync (WAAPI Playhead Synchronization)', () => {
  it('keeps animation paused and sets currentTime discretely based on frameIndex and fps', () => {
    const anim = new MockAnimation() as unknown as Animation;
    const sync = new TrackSync([anim], { fps: 24 });

    // Instantiation pauses the animation immediately
    expect(anim.pause).toHaveBeenCalled();
    expect(anim.playState).toBe('paused');

    // Discrete playhead change to frame 0
    sync.sync(0);
    expect(anim.currentTime).toBe(0);

    // Frame 1 (Flash frame 2): 1 * 1000 / 24 = 41.666...ms
    sync.sync(1);
    expect(anim.currentTime).toBeCloseTo(41.6667, 3);

    // Frame 12: 12 * 1000 / 24 = 500ms
    sync.sync(12);
    expect(anim.currentTime).toBe(500);

    // Frame 24: 24 * 1000 / 24 = 1000ms
    sync.sync(24);
    expect(anim.currentTime).toBe(1000);
  });

  it('supports smooth mode with fractional sub-frame progress', () => {
    const anim = new MockAnimation() as unknown as Animation;
    const sync = new TrackSync([anim], { fps: 30, smooth: true });

    // Frame 1 with 0.5 subframe fraction: (1 + 0.5) * 1000 / 30 = 50ms
    sync.sync(1, 0.5);
    expect(anim.currentTime).toBe(50);

    // Discrete mode ignores subFrameProgress
    sync.smooth = false;
    sync.sync(1, 0.5);
    expect(anim.currentTime).toBeCloseTo(1000 / 30, 4);
  });

  it('manages multiple animations from array, Map, or Record', () => {
    const anim1 = new MockAnimation() as unknown as Animation;
    const anim2 = new MockAnimation() as unknown as Animation;
    const animMap = new Map<string, Animation>([
      ['a1', anim1],
      ['a2', anim2],
    ]);

    const sync = new TrackSync(animMap, { fps: 60 });
    expect(sync.size).toBe(2);

    sync.sync(6); // 6 * 1000 / 60 = 100ms
    expect(anim1.currentTime).toBe(100);
    expect(anim2.currentTime).toBe(100);

    sync.removeAnimation(anim1);
    expect(sync.size).toBe(1);

    sync.sync(12); // 12 * 1000 / 60 = 200ms
    expect(anim1.currentTime).toBe(100); // anim1 not updated
    expect(anim2.currentTime).toBe(200); // anim2 updated
  });

  it('supports standalone syncAnimations pure function', () => {
    const anim1 = new MockAnimation() as unknown as Animation;
    const anim2 = new MockAnimation() as unknown as Animation;

    syncAnimations([anim1, anim2], 10, 20); // 10 * 1000 / 20 = 500ms
    expect(anim1.currentTime).toBe(500);
    expect(anim2.currentTime).toBe(500);
    expect(anim1.playState).toBe('paused');
    expect(anim2.playState).toBe('paused');
  });
});
