import { describe, it, expect, vi } from 'vitest';
import { TimelinePipeline } from '../src/player/Timeline';
import { labelsDoc, persistenceAndTimersDoc, midScriptGotoDoc } from './fixtures/sampleDocs';

describe('Timeline & playhead reconciliation', () => {
  it('handles 1-based frames and label lookups', () => {
    const pipeline = new TimelinePipeline(labelsDoc);
    pipeline.init();

    const root = pipeline.root;
    const ctx = root.context;

    // Initially at frame 1 (index 0)
    expect(ctx.currentFrame).toBe(1);
    expect(ctx.currentLabel).toBe('intro');
    expect(ctx.vars.atIntro).toBe(true);

    // Seek using label 'middle' (index 4 -> frame 5)
    ctx.gotoAndStop('middle');
    expect(ctx.currentFrame).toBe(5);
    expect(ctx.currentLabel).toBe('middle');
    expect(ctx.vars.atMiddle).toBe(true);

    // Seek using label 'outro' (index 9 -> frame 10)
    ctx.gotoAndStop('outro');
    expect(ctx.currentFrame).toBe(10);
    expect(ctx.currentLabel).toBe('outro');
    expect(ctx.vars.atOutro).toBe(true);
  });

  it('persists elements across keyframes by stable element ID', () => {
    const pipeline = new TimelinePipeline(persistenceAndTimersDoc);
    pipeline.init();

    const root = pipeline.root;
    const ctx = root.context;

    // On frame 1 (KF 1: frames 0..1), persisted element exists
    expect(ctx.persisted).toBeDefined();
    const firstInstance = ctx.persisted;

    // Attach state to persisted instance
    firstInstance.hp = 100;
    firstInstance.vars.coins = 50;

    // Advance to frame 3 (KF 2: frames 2..5)
    // Same stable ID 'stable_id_1'
    ctx.gotoAndStop(3);

    // Must be the EXACT same instance identity!
    expect(ctx.persisted).toBe(firstInstance);
    expect(ctx.persisted.hp).toBe(100);
    expect(ctx.persisted.vars.coins).toBe(50);

    // Visual transform updated from KF 2 definition (scale 2, rotation 45)
    expect(ctx.persisted.scaleX).toBe(2);
    expect(ctx.persisted.rotation).toBe(45);
    expect(ctx.persisted.alpha).toBeCloseTo(0.8, 2);
  });

  it('clears active timers when an element is removed across keyframes', () => {
    vi.useFakeTimers();

    const pipeline = new TimelinePipeline(persistenceAndTimersDoc);
    pipeline.init();

    const root = pipeline.root;
    const ctx = root.context;

    // Frame 1 has tempClip
    expect(ctx.tempClip).toBeDefined();
    const tempClip = ctx.tempClip;

    let timerFired = false;
    let intervalCount = 0;

    // Register setTimeout and setInterval on tempClip
    tempClip.setTimeout(() => {
      timerFired = true;
    }, 100);

    tempClip.setInterval(() => {
      intervalCount++;
    }, 50);

    // Advance 50ms: interval should fire once, timeout not yet
    vi.advanceTimersByTime(50);
    expect(intervalCount).toBe(1);
    expect(timerFired).toBe(false);

    // Advance playhead to frame 3 (where tempClip is removed from the timeline!)
    ctx.gotoAndStop(3);
    expect(ctx.tempClip).toBeUndefined();

    // Now advance time further by 500ms
    vi.advanceTimersByTime(500);

    // The timer and interval must have been cleared when tempClip was unmounted!
    expect(timerFired).toBe(false);
    expect(intervalCount).toBe(1); // Did not increment further

    vi.useRealTimers();
  });

  it('supports mid-script gotoAndStop: non-terminating and immediate display list update', () => {
    const pipeline = new TimelinePipeline(midScriptGotoDoc);
    pipeline.init();

    const root = pipeline.root;
    const ctx = root.context;

    // Frame 1 script executed:
    // 1. Called gotoAndStop(3)
    // 2. Verified non-terminating: subsequent code executed
    expect(ctx.vars.afterGotoExecuted).toBe(true);

    // 3. Verified immediate display list update: frame 3's element was visible on the next line!
    expect(ctx.vars.canSeeFrame3Element).toBe(true);
    expect(ctx.frame3Elem).toBeDefined();

    // 4. Frame 3's actions ran
    expect(ctx.vars.frame3ActionsRan).toBe(true);
    expect(ctx.currentFrame).toBe(3);
    expect(ctx.isPlaying).toBe(false);
  });
});
