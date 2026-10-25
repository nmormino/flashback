export interface TrackSyncOptions {
  /** Playback frames per second (Flash standard default 24). */
  fps?: number;
  /** Whether to interpolate continuously between discrete frames for 60/120Hz displays. */
  smooth?: boolean;
}

export type AnimationCollection =
  | Animation[]
  | Iterable<Animation>
  | Map<string, Animation>
  | Record<string, Animation>;

/**
 * Synchronizes Web Animations API (WAAPI) Animation instances with a discrete Flash timeline playhead.
 * Flash timelines evaluate in discrete integer frames. TrackSync keeps animations paused on the compositor
 * and explicitly pins their currentTime to (frameIndex * 1000 / fps) upon every playhead change.
 * When smooth mode is enabled, fractional sub-frame progress can be supplied to achieve silky-smooth 60/120Hz rendering.
 */
export class TrackSync {
  public fps: number;
  public smooth: boolean;
  private animations = new Set<Animation>();

  constructor(
    animations?: AnimationCollection,
    options?: TrackSyncOptions
  ) {
    this.fps = options?.fps ?? 24;
    this.smooth = options?.smooth ?? false;

    if (animations) {
      this.addAnimations(animations);
    }
  }

  /**
   * Registers a WAAPI Animation with this sync controller and ensures it starts paused.
   */
  public addAnimation(animation: Animation): void {
    if (!animation) return;
    this.animations.add(animation);
    try {
      if (animation.playState !== 'paused') {
        animation.pause();
      }
    } catch {
      // Safe guard against browser / mock errors
    }
  }

  /**
   * Unregisters an animation from playhead synchronization.
   */
  public removeAnimation(animation: Animation): void {
    this.animations.delete(animation);
  }

  /**
   * Clears all registered animations.
   */
  public clear(): void {
    this.animations.clear();
  }

  /**
   * Registers multiple animations from an array, Map, Set, or Record.
   */
  public addAnimations(animations: AnimationCollection): void {
    if (!animations) return;

    if (animations instanceof Map) {
      for (const anim of animations.values()) {
        this.addAnimation(anim);
      }
    } else if (typeof animations === 'object' && Symbol.iterator in animations) {
      for (const anim of animations as Iterable<Animation>) {
        this.addAnimation(anim);
      }
    } else if (typeof animations === 'object') {
      for (const anim of Object.values(animations)) {
        if (anim && typeof (anim as any).pause === 'function') {
          this.addAnimation(anim);
        }
      }
    }
  }

  /**
   * Synchronizes all registered WAAPI animations to the given timeline playhead position.
   *
   * @param frameIndex 0-based frame index (0 = frame 1 in Flash).
   * @param subFrameProgress Optional progress fraction in [0, 1) for smooth mode between frames.
   */
  public sync(frameIndex: number, subFrameProgress = 0): void {
    const fraction = this.smooth ? Math.max(0, Math.min(1, subFrameProgress)) : 0;
    const currentTimeMs = (frameIndex + fraction) * (1000 / this.fps);

    for (const anim of this.animations) {
      try {
        if (anim.playState !== 'paused') {
          anim.pause();
        }
        anim.currentTime = currentTimeMs;
      } catch {
        // Safe guard against mock/destroyed animations
      }
    }
  }

  /**
   * Alias for sync() matching standard playhead event handlers.
   */
  public onPlayheadChange(frameIndex: number, subFrameProgress = 0): void {
    this.sync(frameIndex, subFrameProgress);
  }

  /**
   * Number of currently registered animations.
   */
  public get size(): number {
    return this.animations.size;
  }
}

/**
 * Pure function to synchronize an iterable of Animation objects without instantiating TrackSync.
 *
 * @param animations Iterable of WAAPI Animation instances.
 * @param frameIndex 0-based frame index.
 * @param fps Timeline frames per second.
 * @param smooth Whether smooth fractional mode is active.
 * @param subFrameProgress Fractional progress in [0, 1) between frames.
 */
export function syncAnimations(
  animations: Iterable<Animation>,
  frameIndex: number,
  fps = 24,
  smooth = false,
  subFrameProgress = 0
): void {
  const fraction = smooth ? Math.max(0, Math.min(1, subFrameProgress)) : 0;
  const currentTimeMs = (frameIndex + fraction) * (1000 / fps);

  for (const anim of animations) {
    try {
      if (anim.playState !== 'paused') {
        anim.pause();
      }
      anim.currentTime = currentTimeMs;
    } catch {}
  }
}
