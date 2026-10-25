import { describe, it, expect } from 'vitest';
import { MovieClip } from '../src/display/MovieClip';
import { TimelinePipeline } from '../src/player/Timeline';
import { buttonTraversalDoc } from './fixtures/sampleDocs';

describe('contextProxy traversal & resolution', () => {
  it('supports traversal: this.myButton.play() and this.parent.gotoAndStop(5)', () => {
    const pipeline = new TimelinePipeline(buttonTraversalDoc);
    pipeline.init();

    const rootContext = pipeline.root.context;
    expect(rootContext.myButton).toBeDefined();

    // Verify parent is accessible from child
    const childContext = rootContext.myButton;
    expect(childContext.parent).toBe(rootContext);
    expect(childContext.root).toBe(rootContext);

    // Call this.parent.gotoAndStop(5) from child
    childContext.parent.gotoAndStop(5);
    expect(rootContext.currentFrame).toBe(5);
    expect(rootContext.isPlaying).toBe(false);

    // Call this.myButton.play() from parent
    childContext.stop();
    expect(childContext.isPlaying).toBe(false);
    rootContext.myButton.play();
    expect(childContext.isPlaying).toBe(true);
  });

  it('traverses deep hierarchy with getChildByPath supporting _parent and _root', () => {
    const root = new MovieClip('root');
    const menu = new MovieClip('menu');
    const startBtn = new MovieClip('startBtn');

    root.addChild(menu);
    menu.addChild(startBtn);

    const rootCtx = root.context;
    const startCtx = startBtn.context;

    // Dot notation path down
    expect(rootCtx.getChildByPath('menu.startBtn')).toBe(startCtx);

    // Path up using _parent
    expect(startCtx.getChildByPath('_parent._parent')).toBe(rootCtx);
    expect(startCtx.getChildByPath('parent.parent')).toBe(rootCtx);

    // Path from leaf to root
    expect(startCtx.getChildByPath('_root')).toBe(rootCtx);
    expect(startCtx.getChildByPath('_root.menu.startBtn')).toBe(startCtx);
  });

  it('resolves collisions: API members always take precedence over child instance names', () => {
    const root = new MovieClip('root');
    const conflictingChild = new MovieClip('play'); // Named 'play'!
    root.addChild(conflictingChild);

    const rootCtx = root.context;

    // this.play must refer to MovieClip.prototype.play, NOT the child
    expect(typeof rootCtx.play).toBe('function');
    root.stop();
    expect(root.isPlaying).toBe(false);
    rootCtx.play(); // Calling this.play() works as expected
    expect(root.isPlaying).toBe(true);

    // The child clip named 'play' remains accessible via getChild('play')
    const childViaLookup = rootCtx.getChild('play');
    expect(childViaLookup).toBe(conflictingChild.context);
    expect(rootCtx.getChildByPath('play')).toBe(conflictingChild.context);
  });

  it('stores and retrieves timeline variables in target.vars', () => {
    const clip = new MovieClip('game');
    const ctx = clip.context;

    ctx.score = 100;
    ctx.playerName = 'Hero';

    expect(ctx.score).toBe(100);
    expect(ctx.playerName).toBe('Hero');
    expect(clip.vars.score).toBe(100);
    expect(clip.vars.playerName).toBe('Hero');
  });

  it('supports Flash legacy aliases (_x, _y, _rotation, _alpha, _currentframe, ...)', () => {
    const clip = new MovieClip('hero');
    const ctx = clip.context;

    ctx._x = 120;
    ctx._y = 240;
    ctx._rotation = 45;
    ctx._alpha = 50; // In Flash 0..100 maps to 0..1 internally

    expect(clip.x).toBe(120);
    expect(clip.y).toBe(240);
    expect(clip.rotation).toBe(45);
    expect(clip.alpha).toBe(0.5);

    expect(ctx._x).toBe(120);
    expect(ctx._y).toBe(240);
    expect(ctx._rotation).toBe(45);
    expect(ctx._alpha).toBe(50);
  });

  it('binds custom behavior methods to context', () => {
    const clip = new MovieClip('player');
    clip.behavior = {
      methods: {
        jump(this: any, height: number) {
          this.y -= height;
          return this.y;
        },
      },
    };

    const ctx = clip.context;
    ctx.y = 100;
    const newY = ctx.jump(25);
    expect(newY).toBe(75);
    expect(ctx.y).toBe(75);
  });
});
